import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateContract, validateRuleSet, fixtureObservationDigest, skillBehaviorDigest, canonicalJson, skillResourceIdentity, hashSkillResources, runtimeSupportPaths, type SkillBehaviorObservation, type Approval, type EvolutionProposal, type RunEvidenceContext, type Rule } from '@fm/contracts';
import { convert, staticVerify, parseMetadata } from '@fm/converter';
export const digest = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');
const json = (v: unknown): string => JSON.stringify(v, null, 2) + '\n';
export interface Regression {
    id: string;
    kind: 'positive' | 'negative' | 'idempotence';
    source: string;
    expectedOutputHash: string;
    expectedStatus: string;
}
export interface EvolutionDraft {
    reason: string;
    scope: 'rules' | 'skill' | 'both';
    files: {
        path: string;
        content: string;
    }[];
    regressionFixtures: string[];
    regressions: Regression[];
    skillBehavior?: SkillBehaviorObservation;
    behaviorArtifacts?: {path: string; content: string}[];
}
interface PatchFile {
    path: string;
    content: string;
    before?: string;
}
interface Bundle {
    origin: RunEvidenceContext;
    replays: RunEvidenceContext[];
    draft: EvolutionDraft;
    files: PatchFile[];
}
function assert(ok: unknown, message: string): asserts ok { if (!ok) {
    throw new Error(message);
} }
function safeRelative(p: string): void { assert(p.length > 0 && !path.isAbsolute(p) && p.split('/').every(s => s !== '' && s !== '.' && s !== '..') && !/[\\\x00-\x1f]/.test(p), 'Noncanonical path'); }
async function safePath(root: string, p: string): Promise<string> { safeRelative(p); const base = await fs.realpath(root); let current = base; for (const part of p.split('/')) {
    current = path.join(current, part);
    try {
        const stat = await fs.lstat(current);
        assert(!stat.isSymbolicLink(), 'Symlink rejected');
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
        }
    }
} return current; }
async function readOptional(p: string): Promise<string | undefined> { try {
    return await fs.readFile(p, 'utf8');
}
catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
    }
    throw e;
} }
function passedSteps(expected: {
    id: string;
    mandatory: boolean;
}[], actual: {
    id: string;
    mandatory: boolean;
    status: string;
}[]): void { assert(expected.length > 0 && expected.some(s => s.mandatory), 'Missing frozen mandatory suite'); assert(actual.length === expected.length && expected.every(s => actual.some(a => a.id === s.id && a.mandatory === s.mandatory && (!s.mandatory || a.status === 'passed'))), 'Mandatory observations missing/failed'); }
/** Independently checks runtime contracts and every frozen evidence binding. */
export async function validateEvidence(c: RunEvidenceContext): Promise<void> {
    assert(await fs.realpath(c.workspaceRoot) === await fs.realpath(c.bundleRoot), 'Active evolution requires source workspace equal to runtime root');
    const r = validateContract('ConversionResult', c.result);
    const receipt = validateContract('BrowserAcceptance', c.receipt);
    const fixture = validateContract('FixtureObservation', c.fixture);
    validateContract('TargetProfile', c.profile);
    validateRuleSet(c.rules, [c.profile.id]);
    assert(json(parseMetadata(c.source).identity) === json(c.identity), 'Script identity mismatch');
    assert(r.state === 'complete' && r.inputHash === digest(c.source) && r.outputHash === digest(c.candidate), 'Evidence requires complete exact source/candidate');
    assert(c.rulesSource === json(c.rules) && r.rulesHash === digest(c.rulesSource), 'Rules binding mismatch');
    assert(c.profileSource && digest(c.profileSource) === r.targetHash && json(JSON.parse(c.profileSource)) === json(c.profile), 'Profile source mismatch');
    const activeRules = await walkRules(c.bundleRoot);
    activeRules.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    assert(json(activeRules.map(v => v.rule)) === c.rulesSource, 'Active rules stale');
    for (const key of ['packages/cli/dist/index.js', 'packages/converter/dist/index.js', 'packages/contracts/dist/index.js', 'pnpm-lock.yaml']) {
        const actual = await fs.readFile(await safePath(c.bundleRoot, key), 'utf8');
        assert(r.dependencyHashes[key] === digest(actual), 'Tool presence/content stale');
    }
    const skill = await skillResourceIdentity(await safePath(c.bundleRoot, 'skills/fm-convert'));
    assert(r.skillHash === skill.hash, 'Skill binding stale');
    for (const key of runtimeSupportPaths) {
        const actual = await readOptional(await safePath(c.bundleRoot, key));
        assert(actual === undefined ? !Object.hasOwn(r.dependencyHashes,key) : r.dependencyHashes[key] === digest(actual), 'Runtime support presence/content stale');
    }
    async function tools(rel: string): Promise<void> { const dir = await safePath(c.bundleRoot, rel); let entries; try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw e;
    } for (const ent of entries) {
        assert(!ent.isSymbolicLink(), 'Runtime symlink rejected');
        const key = `${rel}/${ent.name}`;
        if (ent.isDirectory()) {
            await tools(key);
        }
        else if (ent.name.endsWith('.js')) {
            assert(r.dependencyHashes[key] === digest(await fs.readFile(await safePath(c.bundleRoot, key))), 'Runtime tool added/changed');
        }
    } }
    for (const pkg of ['cli', 'contracts', 'converter', 'evolution']) {
        await tools(`packages/${pkg}/dist`);
    }
    for (const [key, expected] of Object.entries(r.dependencyHashes)) {
        const target = /^https?:/.test(key) ? await safePath(c.workspaceRoot, `.fm/dependencies/${expected}`) : await safePath(c.bundleRoot, key);
        assert(digest(await fs.readFile(target)) === expected, 'Actual dependency/tool bytes stale');
    }
    const canonicalRoot=await fs.realpath(c.workspaceRoot);
    assert(c.runDir===path.join(canonicalRoot,'.fm/runs',r.runId), 'Canonical saved run path required');
    const runRel = path.relative(canonicalRoot,c.runDir);
    const run = await safePath(c.workspaceRoot, runRel);
    for (const name of ['source.user.js', 'candidate.user.js', 'manifest.json', 'acceptance.json', 'fixture.json']) {
        await safePath(c.workspaceRoot, `${runRel}/${name}`);
    }
    assert(digest(await fs.readFile(path.join(run, 'source.user.js'), 'utf8')) === r.inputHash && digest(await fs.readFile(path.join(run, 'candidate.user.js'), 'utf8')) === r.outputHash, 'Stored run bytes stale');
    const manifest = JSON.parse(await fs.readFile(path.join(run, 'manifest.json'), 'utf8'));
    assert(manifest.schemaVersion===1 && manifest.root===canonicalRoot && manifest.result?.runId===r.runId && json(manifest.result) === json(r), 'Stored manifest provenance/result stale');
    assert(manifest.materialized===true && !manifest.dryRun, 'Saved run must be materialized');
    assert(manifest.scriptId===c.scriptId && json(manifest.identity)===json(c.identity), 'Saved identity/script stale');
    assert(manifest.profileId===c.profile.id, 'Saved profile provenance stale');
    for(const key of ['parentRunId','releaseReservationId','releasePolicyHash'] as const){ assert(manifest[key]===c[key], 'Saved lineage provenance stale'); }
    const recordedPath=async(value:unknown):Promise<string>=>{
        assert(typeof value==='string' && value.length>0 && path.isAbsolute(value) && path.normalize(value)===value && value.startsWith(canonicalRoot+path.sep),'Noncanonical recorded path');
        return safePath(canonicalRoot,path.relative(canonicalRoot,value));
    };
    assert(typeof manifest.outputPath==='string', 'Missing current materialized output');
    assert(digest(await fs.readFile(await recordedPath(manifest.outputPath)))===r.outputHash, 'Current materialized output stale');
    if(manifest.inputPath!==undefined){ assert(digest(await fs.readFile(await recordedPath(manifest.inputPath)))===r.inputHash, 'Current recorded input stale'); }
    assert(manifest.configPath===c.configPath && manifest.configHash===c.configHash, 'Saved configuration provenance stale');
    if(manifest.sourceLockHash!==undefined){
        assert(/^[a-f0-9]{64}$/.test(manifest.sourceLockHash), 'Invalid source lock binding');
        const lockText=await fs.readFile(await safePath(canonicalRoot,'source.lock.json'),'utf8');
        assert(digest(lockText)===manifest.sourceLockHash, 'Current source lock stale');
        const lock=validateContract('SourceLock',JSON.parse(lockText));
        const selected=c.config?.projects.flatMap(project=>project.scripts.filter(script=>script.id===c.scriptId).map(script=>({project,script})));
        assert(selected?.length===1, 'Source lock requires configured script');
        const snapshot=lock.snapshots.find(snapshot=>snapshot.scriptId===c.scriptId);
        assert(snapshot && snapshot.hash===r.inputHash && json(snapshot.origin)===json(selected[0].project.upstream) && json(snapshot.dependencies)===json(manifest.dependencies),'Source lock snapshot binding stale');
    }
    const declared=Object.fromEntries((manifest.dependencies??[]).map((dependency:{url:string;hash:string})=>[dependency.url,dependency.hash]));
    const urls=Object.fromEntries(Object.entries(r.dependencyHashes).filter(([key])=>/^https?:\/\//i.test(key)));
    assert(canonicalJson(declared)===canonicalJson(urls), 'Saved source dependency provenance stale');
    assert(json(manifest.fixtureSuite) === json({ id: c.fixtureSuiteId, hash: c.fixtureSuiteHash, cases: c.mandatoryFixtureCases }), 'Frozen fixture suite stale');
    assert(manifest.checklistId === c.checklistId && manifest.checklistHash === c.checklistHash && json(manifest.steps.map((s: {
        id: string;
        mandatory: boolean;
    }) => ({ id: s.id, mandatory: s.mandatory }))) === json(c.mandatoryBrowserSteps), 'Frozen browser checklist stale');
    assert(json(JSON.parse(await fs.readFile(path.join(run, 'acceptance.json'), 'utf8'))) === json(receipt) && json(JSON.parse(await fs.readFile(path.join(run, 'fixture.json'), 'utf8'))) === json(fixture), 'Stored observations stale');
    if (c.configPath) {
        await recordedPath(c.configPath);
        const configRel = path.relative(await fs.realpath(c.workspaceRoot), path.resolve(c.configPath));
        const actualConfig=await fs.readFile(await safePath(c.workspaceRoot, configRel),'utf8');assert(digest(actualConfig)===c.configHash&&json(validateContract('RepositoryConfig',JSON.parse(actualConfig)))===json(c.config),'Configuration stale');
        const selected=c.config!.projects.flatMap(project=>project.scripts.filter(script=>script.id===c.scriptId).map(script=>({project,script})));
        assert(selected.length===1 && json(selected[0].script.identity)===json(c.identity), 'Configured script identity stale');
        if(selected[0].project.upstream.kind==='local'){
            const original=await safePath(canonicalRoot,`${selected[0].project.upstream.path}/${selected[0].script.sourcePath}`);
            assert(digest(await fs.readFile(original))===r.inputHash, 'Current configured local upstream stale');
        }
    } else { assert(c.config===undefined && c.configHash===undefined, 'Unbound configuration context'); }
    // Profile hash binds the frozen original serialization on disk rather than a reordered object.
    const profileFiles = await fs.readdir(path.join(c.bundleRoot, 'profiles'));
    let profileBound = false;
    for (const file of profileFiles.filter(f => f.endsWith('.json'))) {
        const p = await safePath(c.bundleRoot, `profiles/${file}`);
        const text = await fs.readFile(p, 'utf8');
        if (digest(text) === r.targetHash && json(JSON.parse(text)) === json(c.profile)) {
            profileBound = true;
        }
    }
    assert(profileBound, 'Profile binding mismatch');
    for (const e of [receipt, fixture]) {
        for (const k of ['runId', 'outputHash', 'targetHash', 'rulesHash', 'skillHash', 'toolVersion'] as const) {
            assert(e[k] === r[k], `Evidence ${k} mismatch`);
        }
        assert(json(e.dependencyHashes) === json(r.dependencyHashes), 'Dependencies mismatch');
    }
    assert(receipt.checklistId === c.checklistId && receipt.checklistHash === c.checklistHash && c.checklistHash === digest(json(c.mandatoryBrowserSteps)), 'Checklist mismatch');
    assert(receipt.evidenceDigest === digest(json(receipt.perStepResults)), 'Browser digest mismatch');
    passedSteps(c.mandatoryBrowserSteps, receipt.perStepResults);
    assert(fixture.inputHash === r.inputHash && fixture.suiteId === c.fixtureSuiteId && fixture.suiteHash === c.fixtureSuiteHash, 'Fixture binding mismatch');
    assert(fixture.evidenceDigest === fixtureObservationDigest(fixture), 'Fixture digest mismatch');
    passedSteps(c.mandatoryFixtureCases, fixture.cases);
    assert(r.verification.every(v => v.status === 'passed' && v.artifactHash === r.outputHash), 'Verification incomplete');
    assert(r.verification.some(v => v.kind === 'browser' && v.evidenceDigest === receipt.evidenceDigest) && r.verification.some(v => v.kind === 'fixture' && v.evidenceDigest === fixture.evidenceDigest), 'Verification observations mismatch');
    const checked = await staticVerify({ source: c.candidate, profile: c.profile });
    assert(checked.passed, 'Fresh static verification failed');
}
function draftScope(d: EvolutionDraft): void {
    assert(['rules','skill','both'].includes(d.scope), 'Unknown evolution scope');
    assert(typeof d.reason === 'string' && d.reason.trim().length > 0 && d.files.length > 0, 'Explicit reason/files required');
    assert(new Set(d.files.map(f => f.path)).size === d.files.length, 'Duplicate paths');
    assert(d.regressionFixtures.length > 0 && new Set(d.regressionFixtures).size === d.regressionFixtures.length, 'Explicit unique regression fixtures required');
    for (const f of d.files) {
        safeRelative(f.path);
        assert(typeof f.content === 'string' && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(f.content), 'Only text modifications supported');
        assert(/^rules\/.+\.json$/.test(f.path) || /^fixtures\/evolution\/.+\.json$/.test(f.path) || /^docs\/evolution\/.+\.md$/.test(f.path) || f.path === 'skills/fm-convert/SKILL.md' || /^skills\/fm-convert\/references\/.+\.md$/.test(f.path), 'Evolution path outside restricted scope');
    }
    const hasRules = d.files.some(f => f.path.startsWith('rules/'));
    const hasSkill = d.files.some(f => f.path.startsWith('skills/'));
    assert(hasRules === (d.scope !== 'skill') && hasSkill === (d.scope !== 'rules'), 'Scope requires matching explicit rule/skill changes');
    assert(d.scope !== 'rules' || (!d.skillBehavior && !d.behaviorArtifacts), 'Rules-only scope rejects unrelated behavior evidence');
    assert(d.files.filter(f=>f.path.startsWith('fixtures/')).every(f=>d.regressionFixtures.includes(f.path)), 'Undeclared extra regression file');
    assert(d.regressionFixtures.every(p => p.startsWith('fixtures/evolution/') && d.files.some(f => f.path === p)), 'Fixtures must be owned explicit proposal files');
    assert(d.regressions.length > 0 && new Set(d.regressions.map(r => r.id)).size === d.regressions.length, 'Unique regression IDs required');
    for (const kind of ['positive', 'negative', 'idempotence']) {
        assert(d.regressions.some(r => r.kind === kind), `Missing ${kind} regression`);
    }
    assert(d.regressionFixtures.some(p => d.files.find(f => f.path === p)?.content === json(d.regressions)), 'Regression fixtures must contain the exact declared suite');
}
async function walkRules(root: string): Promise<{
    path: string;
    rule: Rule;
}[]> { const result: {
    path: string;
    rule: Rule;
}[] = []; async function walk(rel: string): Promise<void> { const dir = await safePath(root, rel); for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    assert(!ent.isSymbolicLink(), 'Rule symlink rejected');
    const next = `${rel}/${ent.name}`;
    if (ent.isDirectory()) {
        await walk(next);
    }
    else if (ent.name.endsWith('.json')) {
        result.push({ path: next, rule: validateContract('Rule', JSON.parse(await fs.readFile(await safePath(root, next), 'utf8'))) });
    }
} } try {
    await walk('rules');
}
catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
    }
} return result; }
async function overlay(root: string, b: Bundle): Promise<Rule[]> { const active = await walkRules(root); active.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0); const mapped = new Map(active.map(r => [r.path, r.rule])); for (const f of b.files.filter(f => f.path.startsWith('rules/'))) {
    const rule = validateContract('Rule', JSON.parse(f.content));
    const prior = mapped.get(f.path);
    if (prior) {
        assert(prior.id === rule.id && rule.revision > prior.revision, 'Existing rule identity/revision must be preserved/increased');
    }
    assert(rule.action.kind !== 'transform', 'Evolution cannot introduce/change executable transforms');
    assert(prior?.action.kind !== 'transform', 'Existing transform edits require a new implementation review');
    for (const c of [b.origin, ...b.replays]) {
        assert(rule.targetRange.profileIds.length === 1 && rule.targetRange.profileIds[0] === c.profile.id && rule.targetRange.fm === `=${c.profile.fm.version}` && rule.targetRange.firefox === `=${c.profile.firefox.version}`, 'Target range outside verified profile');
    }
    mapped.set(f.path, rule);
} return validateRuleSet([...mapped.values()], [b.origin.profile.id]); }
function invariantFindings(c: ReturnType<typeof convert>): string { return json(c.findings.filter(f => f.severity === 'error' || f.needsConfirmation || f.category === 'api' || f.category === 'context')); }
async function replay(root: string, b: Bundle, checkBehavior = true): Promise<string> {
    draftScope(b.draft);
    assert(b.replays.length > 0 && b.replays.every(c => c.result.runId !== b.origin.result.runId) && new Set(b.replays.map(c => c.result.runId)).size === b.replays.length, 'At least one distinct successful replay required');
    const rules = await overlay(root, b);
    const evidence: unknown[] = [];
    for (const c of [b.origin, ...b.replays]) {
        assert(await fs.realpath(c.workspaceRoot) === await fs.realpath(root), 'Replay workspace mismatch');
        await validateEvidence(c);
        const input = { source: c.source, profile: c.profile, scriptId: c.scriptId };
        const selected = c.config?.projects.flatMap(p => p.scripts).find(s => s.id === c.scriptId)?.ruleIds;
        const select = (rs: Rule[]) => selected ? rs.filter(r => r.scope === 'shared' || selected.includes(r.id)) : rs;
        const before = convert({ ...input, rules: select(c.rules), builtinTransforms: c.result.appliedRules });
        const after = convert({ ...input, rules: select(rules), builtinTransforms: c.result.appliedRules });
        assert(before.outputHash === c.result.outputHash && after.outputHash === before.outputHash, 'Replay output changed: fresh browser acceptance required');
        assert(!['blocked', 'needs-manual-fix'].includes(after.status) && invariantFindings(after) === invariantFindings(before), 'Replay obligations changed: fresh acceptance required');
        const checked = await staticVerify({ source: after.source, profile: c.profile });
        assert(checked.passed, 'Overlay static verification failed');
        const persistedManifest=JSON.parse(await fs.readFile(await safePath(root,`.fm/runs/${c.result.runId}/manifest.json`),'utf8'));
        evidence.push({ manifest:persistedManifest, runId: c.result.runId, inputHash: c.result.inputHash, outputHash: c.result.outputHash, receipt: c.receipt, fixture: c.fixture, result: c.result });
    }
    for (const r of b.draft.regressions) {
        const c = convert({ source: r.source, profile: b.origin.profile, rules, scriptId: b.origin.scriptId });
        const changedIds = b.files.filter(f => f.path.startsWith('rules/')).map(f => JSON.parse(f.content).id as string);
        const matches = c.matchedRules.some(rule => changedIds.includes(rule.id));
        if (changedIds.length && r.kind === 'positive') {
            assert(matches, `Positive fixture does not exercise changed rule: ${r.id}`);
        }
        if (changedIds.length && r.kind === 'negative') {
            assert(!matches, `Negative fixture matches changed rule: ${r.id}`);
        }
        assert(c.outputHash === r.expectedOutputHash && c.status === r.expectedStatus, `Regression failed: ${r.id}`);
        if (r.kind === 'idempotence') {
            const twice = convert({ source: c.source, profile: b.origin.profile, rules, scriptId: b.origin.scriptId });
            assert(twice.source === c.source, `Idempotence failed: ${r.id}`);
        }
    }
    const behavior = b.draft.scope === 'rules' || !checkBehavior ? undefined : await verifyBehavior(root,b);
    return digest(json({ evidence, regressions: b.draft.regressions, rules, ...(behavior ? {behavior, artifacts:b.draft.behaviorArtifacts} : {}) }));
}
interface MachineResult {
    candidateSkillHash: string; suiteHash: string; runnerHash: string; machineDigest: string;
    suite: {id: string; hash: string; cases: {id: string; mandatory: boolean}[]};
    candidateDir: string; rawRequestsFile: string;
}
const behaviorCaseIds = ['offline-standalone-conversion','unsupported-or-dynamic-api-block','pending-browser-not-complete','stale-evidence-rejected','proposed-change-requires-exact-human-approval'];
function behaviorBinding(b: Bundle): string {
    return digest(canonicalJson([b.origin,...b.replays].map(c => ({runId:c.result.runId,source:c.source,candidate:c.candidate,identity:c.identity,result:c.result,receipt:c.receipt,fixture:c.fixture}))));
}
async function trustedMachine(root: string, b: Bundle, auditDir: string): Promise<MachineResult> {
    assert(await fs.realpath(b.origin.bundleRoot) === root, 'Trusted runner root mismatch');
    const active = await skillResourceIdentity(await safePath(root,'skills/fm-convert'));
    const candidateFiles = {...active.files};
    for (const f of b.files.filter(f=>f.path.startsWith('skills/'))) { candidateFiles[f.path]=f.content; }
    const candidateRuleFiles = Object.fromEntries(b.files.filter(f=>f.path.startsWith('rules/')).map(f=>[f.path,f.content]));
    const auditRel=path.relative(root,path.resolve(auditDir));
    assert(auditRel.startsWith('.fm/') && !auditRel.includes('..'), 'Behavior audit must remain ignored');
    const runnerRecords=await Promise.all(runtimeSupportPaths.map(async key=>({path:key,hash:digest(await fs.readFile(await safePath(root,key)))})));
    const frozenSuite=JSON.parse(await fs.readFile(await safePath(root,'fixtures/portable/skill-forward.json'),'utf8'));
    const runner = await safePath(root,'scripts/portable-runner.mjs');
    const module = await import(`${pathToFileURL(runner).href}?hash=${digest(await fs.readFile(runner))}`);
    assert(typeof module.verifySkillCandidate === 'function', 'Missing trusted portable runner');
    const machine = await module.verifySkillCandidate({bundleRoot:root,candidateFiles,candidateRuleFiles,auditDir:await safePath(root,`${auditRel}/candidate-${randomUUID()}`)}) as MachineResult;
    for (const field of ['candidateSkillHash','suiteHash','runnerHash','machineDigest'] as const) { assert(/^[a-f0-9]{64}$/.test(machine[field]), 'Invalid trusted machine result'); }
    assert(machine.runnerHash===digest(canonicalJson(runnerRecords)) && machine.suiteHash===digest(canonicalJson(frozenSuite)), 'Trusted runner/suite bytes mismatch');
    assert(machine.candidateSkillHash === hashSkillResources(candidateFiles), 'Candidate resource identity mismatch');
    assert(machine.suite.id === 'fm-skill-forward-v1' && machine.suite.hash === machine.suiteHash && machine.suite.cases.length === behaviorCaseIds.length && machine.suite.cases.every((c,i)=>c.id===behaviorCaseIds[i] && c.mandatory), 'Trusted suite mismatch');
    return machine;
}
async function verifyBehavior(root: string,b: Bundle): Promise<SkillBehaviorObservation> {
    const machine = await trustedMachine(root,b,path.join(root,'.fm/behavior-verification'));
    const observation = validateContract('SkillBehaviorObservation',b.draft.skillBehavior);
    for (const field of ['candidateSkillHash','suiteHash','runnerHash','machineDigest'] as const) { assert(observation[field]===machine[field], `Behavior ${field} stale`); }
    assert(observation.bindingHash===behaviorBinding(b) && observation.suiteId===machine.suite.id, 'Behavior run/suite binding stale');
    assert(observation.evidenceDigest===skillBehaviorDigest(observation), 'Behavior evidence digest stale');
    assert(observation.evaluator.trim()===observation.evaluator && !/(?:REPLACE_WITH|TODO|placeholder|default)/i.test(observation.evaluator), 'Deliberate independent evaluator required');
    assert(Date.parse(observation.timestamp)<=Date.now(), 'Behavior timestamp in future');
    passedSteps(machine.suite.cases,observation.cases);
    assert(observation.cases.every(c=>c.status==='passed' && c.evidence.trim().length>0 && !/(?:REPLACE_WITH|TODO|placeholder)/i.test(c.evidence)), 'Behavior observations must all pass');
    const artifacts = b.draft.behaviorArtifacts;
    assert(Array.isArray(artifacts) && artifacts.length>0 && new Set(artifacts.map(a=>a.path)).size===artifacts.length, 'Explicit unique behavior artifacts required');
    const hashes = new Set<string>();
    for (const a of artifacts) { safeRelative(a.path); assert(typeof a.content==='string' && a.content.trim().length>0 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(a.content), 'Behavior artifacts must be text'); assert(!hashes.has(digest(a.content)), 'Duplicate behavior artifact bytes'); hashes.add(digest(a.content)); }
    const report = artifacts.find(a=>a.path==='forward-report.md');
    assert(report && digest(report.content)===observation.reportHash, 'Behavior report missing/stale');
    const referenced = new Set([observation.reportHash,...observation.cases.flatMap(c=>c.artifactHashes)]);
    assert([...referenced].every(h=>hashes.has(h)) && [...hashes].every(h=>referenced.has(h)), 'Unbound behavior artifact bytes');
    return observation;
}
/** Pending template from trusted machine checks; human evaluator supplies observations. */
export async function behaviorTemplate(options: {workspaceRoot: string; auditDir: string; origin: RunEvidenceContext; draft: EvolutionDraft; replays: RunEvidenceContext[]}): Promise<{observation:SkillBehaviorObservation;candidateDir:string;rawRequestsFile:string}> {
    const root = await fs.realpath(options.workspaceRoot);
    draftScope(options.draft);
    assert(options.draft.scope !== 'rules', 'Behavior template requires skill or both');
    const files: PatchFile[] = [];
    for (const f of options.draft.files) { const before = await readOptional(await safePath(root,f.path)); assert(before!==f.content,'No-op file rejected'); files.push({...f,...(before===undefined?{}:{before})}); }
    const bundle: Bundle = {origin:options.origin,replays:options.replays,draft:options.draft,files};
    assert(bundle.replays.length>0 && bundle.replays.every(c=>c.result.runId!==bundle.origin.result.runId) && new Set(bundle.replays.map(c=>c.result.runId)).size===bundle.replays.length,'At least one distinct successful replay required');
    for (const c of [bundle.origin,...bundle.replays]) { await validateEvidence(c); }
    await replay(root,bundle,false);
    const machine = await trustedMachine(root,bundle,options.auditDir);
    const observation = validateContract('SkillBehaviorObservation',{schemaVersion:1,candidateSkillHash:machine.candidateSkillHash,suiteId:machine.suite.id,suiteHash:machine.suiteHash,runnerHash:machine.runnerHash,machineDigest:machine.machineDigest,bindingHash:behaviorBinding(bundle),evaluator:'REPLACE_WITH_INDEPENDENT_EVALUATOR',timestamp:new Date().toISOString(),confirmationSource:'coding-tool',cases:machine.suite.cases.map(c=>({...c,status:'pending',evidence:'REPLACE_WITH_OBSERVATION',artifactHashes:['0'.repeat(64)]})),reportHash:'0'.repeat(64),evidenceDigest:'0'.repeat(64)});
    observation.evidenceDigest=skillBehaviorDigest(observation);
    return {observation,candidateDir:machine.candidateDir,rawRequestsFile:machine.rawRequestsFile};
}
async function audit(root: string, dir: string, event: unknown): Promise<void> { const rel = path.relative(await fs.realpath(root), path.resolve(dir)); assert(rel.startsWith('.fm/') && !rel.includes('..'), 'Audit directory must be ignored project .fm'); const target = await safePath(root, rel); await fs.mkdir(target, { recursive: true }); await fs.appendFile(await safePath(root, `${rel}/evolution.jsonl`), JSON.stringify(event) + '\n', { mode: 0o600 }); }
function proposalDigest(p: EvolutionProposal): string { const { proposalHash: _hash, status: _status, ...bound } = p; return digest(json(bound)); }
export async function propose(options: {
    workspaceRoot: string;
    auditDir: string;
    origin: RunEvidenceContext;
    draft: EvolutionDraft;
    replays: RunEvidenceContext[];
}): Promise<{
    proposal: EvolutionProposal;
    proposalDir: string;
    report: string;
}> {
    const root = await fs.realpath(options.workspaceRoot);
    draftScope(options.draft);
    const files: PatchFile[] = [];
    for (const f of options.draft.files) {
        const before = await readOptional(await safePath(root, f.path));
        assert(before !== f.content, 'No-op file rejected');
        files.push({ ...f, ...(before !== undefined ? { before } : {}) });
    }
    const bundle: Bundle = { origin: options.origin, replays: options.replays, draft: options.draft, files };
    const verificationDigest = await replay(root, bundle);
    const patch = json(files);
    const fence = '`'.repeat(Math.max(3, ...[...files.flatMap(f => [f.content, f.before ?? '']), ...(options.draft.behaviorArtifacts ?? []).map(a=>a.content)].flatMap(text => [...text.matchAll(/`+/g)].map(m => m[0].length + 1))));
    const behaviorReport = options.draft.scope === 'rules' ? '' : `\n## Full behavioral evidence\n\n${fence}json\n${json({observation:options.draft.skillBehavior,artifacts:options.draft.behaviorArtifacts})}${fence}\n`;
    const report = `# Local evolution proposal\n\nReason: ${options.draft.reason}\n\nScope: ${options.draft.scope}\n\nRisk: receipt reuse only after identical output and obligations; local human approval is a trust boundary. No userscript execution.\n\nVerification digest: ${verificationDigest}\n\n## Full changes (exact before / after)\n\n${files.map(f => `### ${f.path}\n\n${fence}diff\n--- ${f.before === undefined ? '/dev/null' : f.path}\n+++ ${f.path}\n@@ full file @@\n${(f.before ?? '').split('\n').map(line => '-' + line).join('\n')}\n${f.content.split('\n').map(line => '+' + line).join('\n')}\n${fence}\n\nBefore:\n\n${fence}text\n${f.before ?? '(new file)'}\n${fence}\n\nAfter:\n\n${fence}text\n${f.content}\n${fence}`).join('\n\n')}\n${behaviorReport}`;
    const proposal: EvolutionProposal = { schemaVersion: 1, id: `evolution-${randomUUID()}`, originatingRun: options.origin.result.runId, baseHashes: Object.fromEntries(files.filter(f => f.before !== undefined).map(f => [f.path, digest(f.before!)])), patchHash: digest(patch), reportHash: digest(report), proposalHash: '0'.repeat(64), verificationDigest, changes: files.map(f => ({ path: f.path, ...(f.before !== undefined ? { beforeHash: digest(f.before) } : {}), afterHash: digest(f.content) })), reason: options.draft.reason, regressionFixtures: options.draft.regressionFixtures, scope: options.draft.scope, status: 'proposed' };
    proposal.proposalHash = proposalDigest(proposal);
    validateContract('EvolutionProposal', proposal);
    const rel = `.fm/evolution/${proposal.id}`;
    const dir = await safePath(root, rel);
    await audit(root, options.auditDir, { event: 'propose', id: proposal.id, time: new Date().toISOString() });
    await fs.mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries({ 'proposal.json': json(proposal), 'patch.json': patch, 'report.md': report, 'evidence.json': json(bundle) })) {
        await fs.writeFile(path.join(dir, file), content, { flag: 'wx', mode: 0o600 });
    }
    return { proposal, proposalDir: dir, report };
}
export function approvalTemplate(proposal: EvolutionProposal, approver: string, time: string): Approval { return validateContract('Approval', { schemaVersion: 1, proposalId: proposal.id, patchHash: proposal.patchHash, reportHash: proposal.reportHash, proposalHash: proposal.proposalHash, verificationDigest: proposal.verificationDigest, approver, time, mode: 'local' }); }
/** Writes complete bytes privately, then installs exclusively. Cleanup cannot undo a committed decision. */
async function installDecision(target: string, value: unknown): Promise<void> {
    const temporary = `${target}.tmp-${randomUUID()}`;
    let committed = false;
    try {
        await fs.writeFile(temporary, json(value), {flag: 'wx', mode: 0o600});
        await fs.link(temporary, target);
        committed = true;
    } finally {
        try {
            await fs.unlink(temporary);
        } catch (error) {
            // A committed complete marker is authoritative. An ignored private temp
            // does not invalidate it; never roll active files back after this point.
            if (!committed && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }
}
async function assertUndecided(dir: string, proposal: EvolutionProposal): Promise<void> {
    for (const kind of ['applied', 'rejected'] as const) {
        const text = await readOptional(path.join(dir, `${kind}.json`));
        if (text === undefined) { continue; }
        let marker: Record<string, unknown>;
        try { marker = JSON.parse(text); } catch { throw new Error('Invalid decision marker: malformed JSON'); }
        assert(marker && typeof marker === 'object' && !Array.isArray(marker), 'Invalid decision marker');
        const fields = kind === 'applied' ? ['schemaVersion','kind','proposalId','proposalHash','approval'] : ['schemaVersion','kind','proposalId','proposalHash','reason','time'];
        assert(Object.keys(marker).length === fields.length && fields.every(key => Object.hasOwn(marker,key)), 'Invalid decision marker fields');
        assert(marker.schemaVersion === 1 && marker.kind === kind && marker.proposalId === proposal.id && marker.proposalHash === proposal.proposalHash, 'Invalid decision marker proposal binding');
        if (kind === 'applied') {
            const approval = validateContract('Approval', marker.approval);
            assert(approval.mode === 'local' && approval.proposalId === proposal.id, 'Invalid decision marker approval');
            for (const key of ['proposalHash','patchHash','reportHash','verificationDigest'] as const) {
                assert(approval[key] === proposal[key], 'Invalid decision marker approval binding');
            }
        } else {
            assert(typeof marker.reason === 'string' && typeof marker.time === 'string' && Number.isFinite(Date.parse(marker.time)), 'Invalid rejection marker');
        }
        throw new Error(kind === 'applied' ? 'Proposal already applied' : 'Proposal rejected');
    }
}
export async function apply(options: {
    workspaceRoot: string;
    proposalDir: string;
    approval: Approval;
    auditDir: string;
}): Promise<EvolutionProposal> {
    const root = await fs.realpath(options.workspaceRoot);
    const rel = path.relative(root, path.resolve(options.proposalDir));
    assert(/^\.fm\/evolution\/evolution-[a-f0-9-]+$/.test(rel), 'Proposal outside ignored immutable directory');
    const dir = await safePath(root, rel);
    for (const name of ['proposal.json', 'patch.json', 'report.md', 'evidence.json', 'applied.json', 'rejected.json']) {
        await safePath(root, `${rel}/${name}`);
    }
    const approval = validateContract('Approval', options.approval);
    assert(approval.mode === 'local', 'PR approval is reserved');
    assert(approval.approver.trim() === approval.approver && approval.approver.trim().length > 0 && !/(?:REPLACE_WITH|TODO|default|placeholder)/i.test(approval.approver), 'Deliberate human approver required');
    assert(Date.parse(approval.time) <= Date.now(), 'Approval timestamp is in future');
    const lock = await safePath(root, '.fm/evolution/apply.lock');
    await fs.mkdir(path.dirname(lock), { recursive: true });
    const handle = await fs.open(lock, 'wx');
    let files: PatchFile[] = [];
    let mutated: PatchFile[] = [];
    try {
        const p = validateContract('EvolutionProposal', JSON.parse(await fs.readFile(path.join(dir, 'proposal.json'), 'utf8')));
        assert(p.status === 'proposed' && p.proposalHash === proposalDigest(p), 'Proposal tampered');
        await assertUndecided(dir, p);
        for (const k of ['patchHash', 'reportHash', 'proposalHash', 'verificationDigest'] as const) {
            assert(approval[k] === p[k], `Approval ${k} mismatch`);
        }
        assert(approval.proposalId === p.id, 'Approval proposal mismatch');
        const patch = await fs.readFile(path.join(dir, 'patch.json'), 'utf8');
        assert(digest(patch) === p.patchHash && digest(await fs.readFile(path.join(dir, 'report.md'), 'utf8')) === p.reportHash, 'Patch/report tampered');
        files = JSON.parse(patch);
        const b = JSON.parse(await fs.readFile(path.join(dir, 'evidence.json'), 'utf8')) as Bundle;
        assert(b.origin.result.runId === p.originatingRun, 'Origin mismatch');
        assert(json(b.files) === patch && json(b.draft.files) === json(files.map(({ path, content }) => ({ path, content }))) && b.draft.scope === p.scope && b.draft.reason === p.reason && json(b.draft.regressionFixtures) === json(p.regressionFixtures), 'Evidence/patch mismatch');
        assert(json(p.changes) === json(files.map(f => ({ path: f.path, ...(f.before !== undefined ? { beforeHash: digest(f.before) } : {}), afterHash: digest(f.content) }))), 'Change manifest mismatch');
        for (const f of files) {
            const current = await readOptional(await safePath(root, f.path));
            assert(current === f.before, 'Proposal base stale');
        }
        assert(await replay(root, b) === p.verificationDigest, 'Verification digest stale');
        await audit(root, options.auditDir, { event: 'apply-start', id: p.id, approval, time: new Date().toISOString() });
        for (const f of files) {
            const target = await safePath(root, f.path);
            await fs.mkdir(path.dirname(target), { recursive: true });
            const tmp = `${target}.${p.id}.tmp`;
            const mode = f.before === undefined ? 0o600 : (await fs.stat(target)).mode;
            try {
                await fs.writeFile(tmp, f.content, { flag: 'wx', mode });
                assert(await readOptional(target) === f.before, 'Owned destination raced');
                if (f.before === undefined) {
                    await fs.link(tmp, target);
                    mutated.push(f);
                    await fs.unlink(tmp);
                }
                else {
                    await fs.rename(tmp, target);
                    mutated.push(f);
                }
            }
            catch (e) {
                try {
                    await fs.unlink(tmp);
                }
                catch (cleanup) {
                    if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw cleanup;
                    }
                }
                throw e;
            }
        }
        await audit(root, options.auditDir, { event: 'apply-commit-intent', id: p.id, time: new Date().toISOString() });
        await installDecision(path.join(dir, 'applied.json'), {schemaVersion: 1, kind: 'applied', proposalId: p.id, proposalHash: p.proposalHash, approval});
        return { ...p, status: 'applied' };
    }
    catch (e) {
        for (const f of mutated.reverse()) {
            const target = await safePath(root, f.path);
            assert(await readOptional(target) === f.content, 'Rollback destination changed by another writer');
            if (f.before === undefined) {
                await fs.unlink(target);
            }
            else {
                const tmp = `${target}.rollback-${randomUUID()}`;
                try {
                    await fs.writeFile(tmp, f.before, { flag: 'wx', mode: (await fs.stat(target)).mode });
                    await fs.rename(tmp, target);
                }
                catch (error) {
                    try {
                        await fs.unlink(tmp);
                    }
                    catch (cleanup) {
                        if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') {
                            throw cleanup;
                        }
                    }
                    throw error;
                }
            }
        }
        await audit(root, options.auditDir, { event: 'apply-failed', error: 'Proposal application failed; inspect immutable proposal and local verification', time: new Date().toISOString() });
        throw e;
    }
    finally {
        await handle.close();
        await fs.unlink(lock);
    }
}
/** A deliberate local rejection records a separate immutable decision, retaining the proposal. */
export async function reject(options: {workspaceRoot: string; proposalDir: string; auditDir: string; reason?: string}): Promise<EvolutionProposal> {
    const root = await fs.realpath(options.workspaceRoot);
    const rel = path.relative(root, path.resolve(options.proposalDir));
    assert(/^\.fm\/evolution\/evolution-[a-f0-9-]+$/.test(rel), 'Proposal outside ignored immutable directory');
    const dir = await safePath(root, rel);
    for (const name of ['proposal.json', 'applied.json', 'rejected.json']) {
        await safePath(root, `${rel}/${name}`);
    }
    const lock = await safePath(root, '.fm/evolution/apply.lock');
    const handle = await fs.open(lock, 'wx');
    try {
        const proposal = validateContract('EvolutionProposal', JSON.parse(await fs.readFile(path.join(dir, 'proposal.json'), 'utf8')));
        assert(proposal.proposalHash === proposalDigest(proposal), 'Proposal tampered');
        await assertUndecided(dir, proposal);
        // Keep free-form reasons solely in the ignored decision, never the audit line.
        await audit(root, options.auditDir, {event: 'reject-start', id: proposal.id, time: new Date().toISOString()});
        await installDecision(path.join(dir, 'rejected.json'), {schemaVersion: 1, kind: 'rejected', proposalId: proposal.id, proposalHash: proposal.proposalHash, reason: options.reason ?? 'Deliberately rejected', time: new Date().toISOString()});
        return {...proposal, status: 'rejected'};
    } catch (error) {
        await audit(root, options.auditDir, {event: 'reject-failed', id: rel.split('/').at(-1), time: new Date().toISOString()});
        throw error;
    } finally {
        await handle.close();
        await fs.unlink(lock);
    }
}
