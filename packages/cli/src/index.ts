import * as fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateContract, validateRuleSet, type RepositoryConfig, type ConversionResult, type BrowserAcceptance, type FixtureObservation, type RunEvidenceContext, type Rule, resolveRuntimeLayout, skillResourceIdentity, runtimeSupportPaths } from '@fm/contracts';
import { convert, staticVerify, builtinTransformIds, parseMetadata } from '@fm/converter';
import { fixtureSuite, fixtureTemplate, checkFixtureObservation, mergeFixtureVerification } from './verification/fixtures.js';
import { prepareCandidate, finalizeRelease, type ReleaseCandidate } from './release/index.js';
import { propose as proposeEvolution, apply as applyEvolution, reject as rejectEvolution, behaviorTemplate, approvalTemplate, type EvolutionDraft } from '@fm/evolution';
const exec = promisify(execFile);
export const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const bundleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MAX = 2 * 1024 * 1024;
const toolBindingPaths = ['packages/cli/dist/index.js','packages/converter/dist/index.js','packages/contracts/dist/index.js','pnpm-lock.yaml'] as const;
export class CliError extends Error { code: number; constructor(message: string, code = 1) { super(message); this.code = code; } }
export async function guard(root: any,requested: any) {
  root = await fs.realpath(root);
  const target = path.resolve(root, requested);
  if (target !== root && !target.startsWith(root + path.sep)) { throw new CliError('Path escapes workspace'); }
  let cursor = target;
  while (true) {
    try { const real = await fs.realpath(cursor); if (real !== root && !real.startsWith(root + path.sep)) { throw new CliError('Symlink escapes workspace'); } break; }
    catch (error: any) { if (error.code !== 'ENOENT') { throw error; } cursor = path.dirname(cursor); }
  }
  let suffix: string[] = []; let canonical = target;
  while (true) { try { canonical = await fs.realpath(canonical); break; } catch(e: any) { if (e.code !== 'ENOENT') { throw e; } suffix.unshift(path.basename(canonical)); canonical = path.dirname(canonical); } }
  return path.join(canonical,...suffix);
}
function decode(bytes: Uint8Array): string { try { return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); } catch { throw new CliError('Input is not valid UTF-8',2); } }
async function read(file: any) { return decode(await fs.readFile(file)); }
function redact(value: any): any { if (typeof value === 'string') { return value.replace(/https?:\/\/[^\s"<>]+/g, raw => { try { const u = new URL(raw); return u.origin + u.pathname; } catch { return '[redacted URL]'; } }); } if (Array.isArray(value)) { return value.map(redact); } if (value && typeof value === 'object') { return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,redact(v)])); } return value; }
async function load(file: any) { return JSON.parse(await read(file)); }
async function atomic(file: string, value: string | Uint8Array, exclusive = false): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  // Exclusive open proves ownership before any partial write can occur.
  const handle = await fs.open(tmp, 'wx');
  try {
    await handle.writeFile(value);
    await handle.close();
    if (exclusive) {
      // Publish complete bytes atomically, without replacing any existing destination.
      await fs.link(tmp, file);
    } else {
      await fs.rename(tmp, file);
    }
  } finally {
    await handle.close().catch(() => {});
    // Cleanup is limited to this invocation's exclusively created temporary file.
    await fs.unlink(tmp).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') { throw error; }
    });
  }
}
export function safeUrl(value: any) {
  let u; try { u = new URL(value); } catch { throw new CliError('Invalid source URL'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash || u.search) { throw new CliError('Source URL must use HTTP(S) without credentials, query or fragment'); }
  return u.href;
}
export function download(value: string, raw: true): Promise<Buffer>;
export function download(value: string, raw?: false): Promise<string>;
export async function download(value: string, raw: boolean = false): Promise<string | Buffer> {
  let url = safeUrl(value);
  for (let i = 0; i < 5; i++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
    if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get('location'); if (!location) { throw new CliError('Redirect has no location'); } url = safeUrl(new URL(location, url).href); continue; }
    if (!response.ok) { throw new CliError(`Source download HTTP ${response.status}`); }
    if (!response.body) { throw new CliError('Source download has no body'); }
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > MAX) { throw new CliError('Source exceeds size limit'); } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks); return raw ? bytes : decode(bytes);
  }
  throw new CliError('Too many source redirects');
}
async function configContext(file: string, cwd: string) {
  const root = await fs.realpath(cwd);
  const configPath = await guard(root, file);
  const config = validateContract('RepositoryConfig', await load(configPath));
  await guard(root, config.outputRoot);
  for (const p of config.projects) {
    if (p.upstream.kind === 'local') { await guard(root, p.upstream.path); }
    else { safeUrl(p.upstream.url); }
    for (const s of p.scripts) { await guard(root, path.join(config.outputRoot, s.outputPath)); if (s.sourcePath) { await guard(root, s.sourcePath); } }
  }
  return { root, config, configPath, configHash: hash(await read(configPath)) };
}
async function defaults(target: string) {
  const profilePath = path.resolve(bundleRoot, 'profiles', target.endsWith('.json') ? target : `${target}.json`);
  if (!profilePath.startsWith(path.join(bundleRoot, 'profiles') + path.sep)) { throw new CliError('Invalid target profile'); }
  const profileText = await read(profilePath); const profile = validateContract('TargetProfile', JSON.parse(profileText));
  const rules: Rule[] = []; const files: string[] = [];
  async function walk(dir: any) { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) { await walk(file); } else if (entry.name.endsWith('.json')) { files.push(file); } } }
  await walk(path.join(bundleRoot, 'rules')); files.sort();
  for (const file of files) { rules.push(await load(file)); }
  const validated = validateRuleSet(rules);
  const layout = await resolveRuntimeLayout(bundleRoot);
  const skill = await skillResourceIdentity(layout.skillRoot);
  const toolHashes: Record<string,string> = {};
  for (const relative of [...toolBindingPaths,...runtimeSupportPaths]) { try { toolHashes[relative] = hash(await read(path.join(bundleRoot,relative))); } catch(e: any) { if (e.code !== 'ENOENT') { throw e; } } }
  async function bindModules(directory: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(path.join(bundleRoot,directory),{withFileTypes:true}); }
    catch (e: any) { if (e.code === 'ENOENT') { return; } throw e; }
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { await bindModules(relative); }
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        try { toolHashes[relative] = hash(await read(path.join(bundleRoot,relative))); }
        catch (error: any) { if (error.code !== 'ENOENT') { throw error; } }
      }
    }
  }
  for (const pkg of ['cli','contracts','converter','evolution']) { await bindModules(`packages/${pkg}/dist`); }
  return { toolHashes, profile, profileSource:profileText, rules: validated, rulesSource:json(validated), profilePath, rulesFiles: files, targetHash: hash(profileText), rulesHash: hash(json(validated)), skillHash: skill.hash, skillPresent: Boolean(skill.files['skills/fm-convert/SKILL.md']), toolVersion: '0.1.0' };
}
async function newRun(root: any) {
  const runId = `${Date.now()}-${crypto.randomUUID()}`;
  const dir = await guard(root, `.fm/runs/${runId}`); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'events.jsonl'), JSON.stringify({ event: 'created', runId }) + '\n', { flag: 'wx' });
  return { runId, dir };
}
async function event(run: any,name: any, fields = {}) { await fs.appendFile(path.join(run.dir, 'events.jsonl'), JSON.stringify({ event: name, ...fields }) + '\n'); }
async function report(run: any,manifest: any) {
  await atomic(path.join(run.dir, 'manifest.json'), json(manifest));
  await atomic(path.join(run.dir, 'report.md'), `# FM run ${run.runId}\n\nState: ${manifest.result?.state ?? manifest.state}\n\nInput SHA256: ${manifest.result?.inputHash ?? manifest.inputHash ?? 'unavailable'}\n\nBrowser acceptance requires deliberate human recording; static checks do not establish runtime compatibility.\n`);
  return { runId: run.runId, state: manifest.result?.state ?? manifest.state, json: path.join(run.dir, 'manifest.json'), markdown: path.join(run.dir, 'report.md') };
}
async function capture(run: any,source: any) { await atomic(path.join(run.dir, 'source.user.js'), source, true); return hash(source); }
function binding(source: any,expected: any) {
  const metadata = parseMetadata(source);
  const name = metadata.identity.name; const namespace = metadata.identity.namespace;
  if (!name || !namespace || (expected && (expected.name !== name || expected.namespace !== namespace))) { throw new CliError('Source identity missing or changed; explicit manual binding required', 2); }
  return { name, namespace };
}
const genericSteps = ['install','initialization','matching-pages','permissions-storage','console'];
function checklist(scriptId: any) {
  const ids = scriptId === 'greasyfork-454120' ? ['install','document-start-init','menu-tags-notifications','settings-storage-reload','forum-list-dom','forum-reading-dom','unsafeWindow-interactions','console'] : genericSteps;
  return ids.map(id => ({ id, mandatory: true, status: 'pending', evidence: 'Record observed behavior in actual Firefox/FireMonkey; do not substitute fixture results.' }));
}
async function sourceFor(root: any,project: any,script: any,run: any) {
  const upstream = project.upstream;
  if (upstream.kind === 'url') { return download(upstream.url); }
  if (upstream.kind === 'local') { const base = await guard(root, upstream.path); const file = await guard(root, path.join(base, script.sourcePath)); const bytes = await fs.readFile(file); if (bytes.length > MAX) { throw new CliError('Source exceeds size limit'); } return decode(bytes); }
  const repo = await guard(root, path.join(run.dir, 'git-cache'));
  // Bare fetch reads the exact commit without checking out or executing upstream hooks.
  await exec('git', ['-c','core.hooksPath=/dev/null','init','--bare',repo], { timeout:15000, maxBuffer:MAX });
  await exec('git', ['-c','core.hooksPath=/dev/null','-C',repo,'fetch','--depth=1','--no-tags',safeUrl(upstream.url),upstream.ref], { timeout:30000, maxBuffer:MAX });
  const { stdout: commit } = await exec('git', ['-C',repo,'rev-parse','FETCH_HEAD'], { timeout:5000 });
  if (commit.trim() !== upstream.ref) { throw new CliError('Fetched commit differs from pinned source',2); }
  const { stdout } = await exec('git', ['-C',repo,'show',`${upstream.ref}:${script.sourcePath}`], { timeout:5000, maxBuffer:MAX, encoding:'buffer' }); return decode(stdout);
}
async function captureDependencies(root: string, source: string): Promise<{url:string;hash:string}[]> {
  const dependencies: {url:string;hash:string}[] = [];
  for (const entry of parseMetadata(source).entries.filter(e => ['require','resource'].includes(e.key))) {
    const url = safeUrl(entry.key === 'resource' ? entry.value.trim().split(/\s+/).slice(1).join(' ') : entry.value.trim());
    const bytes = await download(url,true); const digest = hash(bytes);
    const cache = await guard(root,`.fm/dependencies/${digest}`);
    try { await atomic(cache,bytes,true); } catch(e: any) { if (e.code !== 'EEXIST' || hash(await fs.readFile(cache)) !== digest) { throw e; } }
    dependencies.push({url,hash:digest});
  }
  return dependencies;
}
async function dependencySources(root:string,source:string,dependencies:{url:string;hash:string}[]) {
  const result:{url:string;hash:string;source:string}[]=[];
  for(const entry of parseMetadata(source).entries.filter(e=>e.key==='require')){
    const url=safeUrl(entry.value.trim()); const dependency=dependencies.find(d=>d.url===url);
    if(!dependency||!/^[a-f0-9]{64}$/.test(dependency.hash)){throw new CliError('Missing captured @require dependency',2);}
    const bytes=await fs.readFile(await guard(root,`.fm/dependencies/${dependency.hash}`));
    if(hash(bytes)!==dependency.hash){throw new CliError('Dependency snapshot changed; create a new run',2);}
    result.push({...dependency,source:decode(bytes)});
  }
  return result;
}
async function sync(opts: any,cwd: any) {
  const ctx = await configContext(required(opts,'config'),cwd);
  const project = ctx.config.projects.find(p => p.id === required(opts,'project'));
  if (!project) { throw new CliError('Unknown project',2); }
  const run = await newRun(ctx.root);
  try {
    const snapshots: any[] = [];
    for (const script of project.scripts) {
      const source = await sourceFor(ctx.root,project,script,run); binding(source,script.identity);
      const dependencies = await captureDependencies(ctx.root,source);
      const digest = hash(source); const cache = await guard(ctx.root, `.fm/sources/${digest}.user.js`);
      try { await atomic(cache,source,true); } catch (e: any) { if (e.code !== 'EEXIST' || hash(await fs.readFile(cache)) !== digest) { throw e; } }
      snapshots.push(validateContract('SourceSnapshot',{schemaVersion:1,scriptId:script.id,origin:project.upstream,retrievedAt:new Date().toISOString(),...(project.upstream.kind === 'git' ? { revision:project.upstream.ref } : {}),hash:digest,dependencies}));
      await event(run,'source-captured',{scriptId:script.id,hash:digest});
    }
    const lockPath = await guard(ctx.root,'source.lock.json'); let previous: any[] = [];
    try { previous = validateContract('SourceLock',await load(lockPath)).snapshots; } catch(e: any) { if (e.code !== 'ENOENT') { throw e; } }
    // Reuse retrieval metadata when the exact source is unchanged.
    const merged = previous.filter(p => !snapshots.some(s => s.scriptId === p.scriptId));
    for (const snapshot of snapshots) { const old = previous.find(p => p.scriptId === snapshot.scriptId && p.hash === snapshot.hash && json(p.dependencies) === json(snapshot.dependencies) && JSON.stringify(p.origin) === JSON.stringify(snapshot.origin)); merged.push(old ?? snapshot); }
    const lock = validateContract('SourceLock',{schemaVersion:1,snapshots:merged.sort((a,b) => a.scriptId.localeCompare(b.scriptId))});
    await atomic(lockPath,json(lock)); await event(run,'sync-complete');
    return { code:0, ...await report(run,{state:'synced',snapshots:lock.snapshots}), sourceLock:lockPath };
  } catch (e: any) { await event(run,'failed',{reason:'Source sync failed safely'}); await report(run,{state:'failed'}); throw new CliError(e instanceof CliError ? e.message : 'Source sync failed; inspect configuration and connectivity',e.code === 2 ? 2 : 1); }
}
function required(opts: any,key: any) { if (!opts[key] || opts[key] === true) { throw new CliError(`Missing --${key}`); } return opts[key]; }
async function convertCommand(opts: any,cwd: any) {
  const ctx: any = opts.config ? await configContext(opts.config,cwd) : {root:await fs.realpath(cwd)};
  const run = await newRun(ctx.root);
  try {
    const target = required(opts,'target'); const defaultsData = await defaults(target);
    if (ctx.config && ctx.config.targetProfile !== defaultsData.profile.id) { throw new CliError('Target differs from configured profile',2); }
    const scriptId = opts['script-id']; const script = ctx.config?.projects.flatMap((p: RepositoryConfig['projects'][number]) => p.scripts).find((s: RepositoryConfig['projects'][number]['scripts'][number]) => s.id === scriptId);
    if (ctx.config && !script) { throw new CliError('Configured conversion requires a known --script-id',2); }
    if (!ctx.config && scriptId && defaultsData.rules.some(r => r.scope === 'script' && r.scriptId === scriptId)) { throw new CliError('Script-specific binding requires repository config',2); }
    const input = required(opts,'input'); const output = await guard(ctx.root,required(opts,'output'));
    if (script) { const configured = await guard(ctx.root,path.join(ctx.config.outputRoot,script.outputPath)); if (configured !== output) { throw new CliError('Output differs from configured script output',2); } }
    let inputPath; let source;
    if (/^https?:/i.test(input)) { source = await download(input); } else { inputPath = await guard(ctx.root,input); source = await read(inputPath); if (Buffer.byteLength(source)>MAX) { throw new CliError('Source exceeds size limit'); } }
    if (inputPath && (inputPath === output || inputPath.startsWith(output + path.sep) || output.startsWith(inputPath + path.sep))) { throw new CliError('Input/output overlap rejected',2); }
    // Candidate writes are exclusive: accepted or unrelated files are never overwritten.
    try { await fs.lstat(output); throw new CliError('Output already exists; select a new candidate path',2); } catch(e: any) { if (e.code !== 'ENOENT') { throw e; } }
    const inputHash = await capture(run,source);
    let sourceLockHash;
    if (script) {
      const project = ctx.config.projects.find((p: RepositoryConfig['projects'][number]) => p.scripts.some((s: RepositoryConfig['projects'][number]['scripts'][number]) => s.id === scriptId));
      if (project.upstream.kind === 'local') { const expectedPath = await guard(ctx.root,path.join(project.upstream.path,script.sourcePath)); if (!inputPath || await fs.realpath(inputPath) !== await fs.realpath(expectedPath)) { throw new CliError('Input differs from configured local source',2); } try { const text = await read(await guard(ctx.root,'source.lock.json')); const lock = validateContract('SourceLock',JSON.parse(text)); const snapshot = lock.snapshots.find(s => s.scriptId === scriptId); if (!snapshot || snapshot.hash !== inputHash || json(snapshot.origin) !== json(project.upstream)) { throw new CliError('Local source differs from synchronized lock; resync',2); } sourceLockHash = hash(text); } catch(e: any) { if (e.code !== 'ENOENT') { throw e; } } }
      else { const lockText = await read(await guard(ctx.root,'source.lock.json')); const lock = validateContract('SourceLock',JSON.parse(lockText)); const snapshot = lock.snapshots.find(s => s.scriptId === scriptId); if (!snapshot || snapshot.hash !== inputHash || json(snapshot.origin) !== json(project.upstream)) { throw new CliError('Input differs from pinned synchronized source; run sync first',2); } sourceLockHash = hash(lockText); }
    }
    const dependencies = await captureDependencies(ctx.root,source);
    const dependencyHashes = {...defaultsData.toolHashes};
    for (const dependency of dependencies) { dependencyHashes[dependency.url] = dependency.hash; }
    if (sourceLockHash) { const lock = validateContract('SourceLock',await load(await guard(ctx.root,'source.lock.json'))); const snapshot = lock.snapshots.find(s => s.scriptId === scriptId); if (!snapshot || json(snapshot.dependencies) !== json(dependencies)) { throw new CliError('Dependency bytes differ from synchronized source lock; resync and create a new run',2); } }
    const requiredSources = await dependencySources(ctx.root,source,dependencies);
    const identity = binding(source,script?.identity);
    const rules = script?.ruleIds ? defaultsData.rules.filter(r => r.scope === 'shared' || script.ruleIds.includes(r.id)) : defaultsData.rules;
    const transforms = opts.transform ? opts.transform.split(',') : [];
    if (transforms.some((id: string) => !builtinTransformIds.includes(id as typeof builtinTransformIds[number]))) { throw new CliError('Unsupported transform selection',2); }
    const converted = convert({ source,profile:defaultsData.profile,rules,scriptId,builtinTransforms:transforms,dependencies:requiredSources });
    const outputHash = hash(converted.source);
    const checked = await staticVerify({source:converted.source,profile:defaultsData.profile,dependencies:requiredSources});
    const blocked = ['blocked','needs-manual-fix'].includes(converted.status);
    const result = validateContract('ConversionResult',{schemaVersion:1,runId:run.runId,state:blocked ? 'blocked' : checked.passed ? 'pending-browser' : 'failed',inputHash,outputHash,targetHash:defaultsData.targetHash,rulesHash:defaultsData.rulesHash,skillHash:defaultsData.skillHash,toolVersion:defaultsData.toolVersion,dependencyHashes,findings:redact([...converted.findings,...checked.findings]),appliedRules:converted.appliedRules,verification:checked.verification.map(v => v.kind === 'browser' ? {...v,command:undefined,checklist:script?.acceptance.checklistId ?? 'standalone-runtime'} : v)});
    const steps = checklist(scriptId); const checklistId = script?.acceptance.checklistId ?? 'standalone-runtime';
    const manifest: any = {schemaVersion:1,root:ctx.root,inputPath,outputPath:output,identity,scriptId,configPath:ctx.configPath,configHash:ctx.configHash,sourceLockHash,dependencies,profileId:defaultsData.profile.id,skillPresent:defaultsData.skillPresent,checklistId,checklistHash:hash(json(steps.map(s => ({id:s.id,mandatory:s.mandatory})))),steps,fixtureSuite:fixtureSuite(scriptId),result,dryRun:Boolean(opts['dry-run']),materialized:!blocked && checked.passed && !opts['dry-run'],guidance:redact(converted.guidance)};
    if (!opts['dry-run']) { await atomic(path.join(run.dir,'candidate.user.js'),converted.source,true); }
    await event(run,'analyzed',{inputHash,outputHash,state:result.state});
    // Persist manifest before publishing candidate: audit persistence is a prerequisite.
    const paths = await report(run,manifest);
    if (!blocked && checked.passed && !opts['dry-run']) { await event(run,'candidate-write-authorized',{outputHash}); await atomic(output,converted.source,true); }
    return {code:blocked || !checked.passed ? 2 : 0,...paths,output:!blocked && checked.passed && !opts['dry-run'] ? output : undefined,dryRun:Boolean(opts['dry-run']),materialized:!blocked && checked.passed && !opts['dry-run'],guidance:redact(converted.guidance)};
  } catch(e: any) { await event(run,'failed',{reason:'Conversion failed safely'}); await report(run,{state:'failed'}); throw new CliError(e instanceof CliError ? e.message : 'Conversion failed; inspect safe report and input',e.code === 2 ? 2 : 1); }
}
async function existingRun(opts: any,cwd: any) {
  const root = await fs.realpath(cwd); const id = required(opts,'run');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) { throw new CliError('Invalid run ID'); }
  const dir = await guard(root,`.fm/runs/${id}`); const manifest = await load(await guard(root,path.join(dir,'manifest.json')));
  if (!manifest.result) { throw new CliError('Run has no conversion result',2); }
  validateContract('ConversionResult',manifest.result);
  if (manifest.root !== root || manifest.result.runId !== id) { throw new CliError('Run workspace or identity mismatch',2); }
  return {root,run:{runId:id,dir},manifest};
}
async function fresh(manifest: any,run: any) {
  if (manifest.dryRun) { throw new CliError('Dry-run has no candidate; create a materialized run',3); }
  const current = await defaults(manifest.profileId);
  // Compare both presence and content across the entire recorded tool binding set.
  // Remote dependency URLs are a separate namespace and checked against captured bytes below.
  const recordedToolHashes = Object.fromEntries(Object.entries(manifest.result.dependencyHashes).filter(([key]) => !/^https?:\/\//i.test(key)));
  const toolKeys = new Set([...toolBindingPaths,...Object.keys(recordedToolHashes),...Object.keys(current.toolHashes)]);
  for (const key of toolKeys) {
    if (recordedToolHashes[key] !== current.toolHashes[key] || Object.hasOwn(recordedToolHashes,key) !== Object.hasOwn(current.toolHashes,key)) { throw new CliError('Tool/dependency presence or content changed; create a new run',2); }
  }
  if (manifest.sourceLockHash && hash(await read(await guard(manifest.root,'source.lock.json'))) !== manifest.sourceLockHash) { throw new CliError('Source lock changed; create a new run',2); }
  for (const dependency of manifest.dependencies ?? []) { if (manifest.result.dependencyHashes[dependency.url] !== dependency.hash) { throw new CliError('Dependency manifest binding changed; create a new run',2); } if (hash(await fs.readFile(await guard(manifest.root,`.fm/dependencies/${dependency.hash}`))) !== dependency.hash) { throw new CliError('Dependency snapshot changed; create a new run',2); } }
  for (const k of ['targetHash','rulesHash','skillHash','toolVersion'] as const) { if (current[k] !== manifest.result[k]) { throw new CliError('Run bindings stale; create a new run',2); } }
  if (manifest.configPath && hash(await read(await guard(manifest.root,manifest.configPath))) !== manifest.configHash) { throw new CliError('Configuration changed; create a new run',2); }
  if (manifest.inputPath && hash(await read(await guard(manifest.root,manifest.inputPath))) !== manifest.result.inputHash) { throw new CliError('Source changed; create a new run',2); }
  const candidate = manifest.materialized ? manifest.outputPath : path.join(run.dir,'candidate.user.js');
  const source = await read(await guard(manifest.root,candidate));
  if (hash(source) !== manifest.result.outputHash || hash(await read(path.join(run.dir,'source.user.js'))) !== manifest.result.inputHash) { throw new CliError('Artifact changed; create a new run',2); }
  const dependencies=await dependencySources(manifest.root,source,manifest.dependencies??[]);
  return {source,current,dependencies};
}
type FreshData = Awaited<ReturnType<typeof fresh>>;
async function optionalRecord(root: string, file: string): Promise<unknown | undefined> {
  try { return await load(await guard(root,file)); }
  catch (error: any) { if (error.code === 'ENOENT') { return undefined; } throw error; }
}
async function evidenceContext(manifest: any, run: {runId:string;dir:string}, data: FreshData): Promise<RunEvidenceContext> {
  const suite = fixtureSuite(manifest.scriptId);
  if (json(manifest.fixtureSuite) !== json(suite)) { throw new CliError('Fixture suite changed; create a new run',2); }
  const config = manifest.configPath ? validateContract('RepositoryConfig',await load(await guard(manifest.root,manifest.configPath))) : undefined;
  return {
    workspaceRoot:manifest.root,bundleRoot,runDir:run.dir,
    source:await read(await guard(manifest.root,path.join(run.dir,'source.user.js'))),candidate:data.source,
    result:validateContract('ConversionResult',manifest.result),profile:data.current.profile,profileSource:data.current.profileSource,
    rules:data.current.rules,rulesSource:data.current.rulesSource,identity:manifest.identity,scriptId:manifest.scriptId,
    checklistId:manifest.checklistId,checklistHash:manifest.checklistHash,
    mandatoryBrowserSteps:manifest.steps.map((step:{id:string;mandatory:boolean}) => ({id:step.id,mandatory:step.mandatory})),
    fixtureSuiteId:suite.id,fixtureSuiteHash:suite.hash,mandatoryFixtureCases:suite.cases,
    config,configPath:manifest.configPath,configHash:manifest.configHash,
    parentRunId:manifest.parentRunId,releaseReservationId:manifest.releaseReservationId,releasePolicyHash:manifest.releasePolicyHash
  };
}
async function refreshEvidence(manifest: any, run: {runId:string;dir:string}, data: FreshData): Promise<RunEvidenceContext> {
  if (manifest.result.state === 'blocked' || manifest.dryRun || !manifest.materialized) { throw new CliError('Blocked or unmaterialized candidate requires a new conversion run',2); }
  const context = await evidenceContext(manifest,run,data);
  const fixtureValue = await optionalRecord(manifest.root,path.join(run.dir,'fixture.json'));
  if (fixtureValue) {
    try { context.fixture = checkFixtureObservation(fixtureValue,context); }
    catch { throw new CliError('Fixture observation stale or invalid',2); }
  }
  const receiptValue = await optionalRecord(manifest.root,path.join(run.dir,'acceptance.json'));
  if (receiptValue) { context.receipt = assertReceipt(receiptValue,manifest); }
  const checked = await staticVerify({source:data.source,profile:data.current.profile,dependencies:data.dependencies});
  const records = mergeFixtureVerification(checked.verification.filter(v => v.kind !== 'browser'),context);
  const browserPassed = context.receipt?.perStepResults.every(step => !step.mandatory || step.status === 'passed');
  const browserFailed = context.receipt?.perStepResults.some(step => step.mandatory && step.status === 'failed');
  records.push(context.receipt ? {...browserVerification(context.receipt),status:browserPassed ? 'passed' : browserFailed ? 'failed' : 'pending'} : {
    ...checked.verification.find(v => v.kind === 'browser')!,command:undefined,checklist:manifest.checklistId
  });
  const failed = records.some(v => v.status === 'failed') || !checked.passed;
  const complete = !failed && ['parse','metadata','lint','fixture','browser'].every(kind => records.some(v => v.kind === kind && v.status === 'passed')) && records.every(v => v.status !== 'pending');
  manifest.result.verification = records;
  manifest.result.state = failed ? 'failed' : complete ? 'complete' : 'pending-browser';
  validateContract('ConversionResult',manifest.result);
  context.result = manifest.result;
  return context;
}
async function verifyCommand(opts: any,cwd: any) {
  if (!opts.static) { throw new CliError('verify requires --static'); }
  const {run,manifest} = await existingRun(opts,cwd);
  await refreshEvidence(manifest,run,await fresh(manifest,run));
  await event(run,'static-verified',{state:manifest.result.state});
  return {code:manifest.result.state === 'complete' ? 0 : manifest.result.state === 'failed' ? 2 : 3,...await report(run,manifest)};
}
async function fixturesCommand(action: string,opts: any,cwd: string) {
  const {root,run,manifest} = await existingRun(opts,cwd);
  const data = await fresh(manifest,run);
  const context = await evidenceContext(manifest,run,data);
  if (action === 'template') {
    const file = path.join(run.dir,`fixture-template-${crypto.randomUUID()}.json`);
    await atomic(file,json(fixtureTemplate(context)),true);
    await event(run,'fixture-template');
    return {code:0,...await report(run,manifest),template:file};
  }
  if (action !== 'record') { throw new CliError('Unsupported fixture operation'); }
  if (manifest.result.state === 'blocked' || !manifest.materialized) { throw new CliError('Cannot record fixtures for a blocked or unmaterialized candidate',2); }
  let observation: FixtureObservation;
  try { observation = checkFixtureObservation(await load(await guard(root,required(opts,'file'))),context); }
  catch (error) { if (error instanceof CliError) { throw error; } throw new CliError('Fixture observation stale or invalid',2); }
  await event(run,'fixture-record-authorized',{evidenceDigest:observation.evidenceDigest});
  await atomic(path.join(run.dir,`fixture-${crypto.randomUUID()}.json`),json(observation),true);
  await atomic(path.join(run.dir,'fixture.json'),json(observation));
  await refreshEvidence(manifest,run,await fresh(manifest,run));
  await event(run,'fixture-recorded',{state:manifest.result.state});
  return {code:manifest.result.state === 'complete' ? 0 : manifest.result.state === 'failed' ? 2 : 3,...await report(run,manifest)};
}
function browserVerification(receipt: BrowserAcceptance) { return validateContract('Verification',{schemaVersion:1,kind:'browser',status:'passed',checklist:receipt.checklistId,environment:{verifier:receipt.verifier,timestamp:receipt.timestamp},artifactHash:receipt.outputHash,evidenceDigest:receipt.evidenceDigest}); }
function assertReceipt(value: any,manifest: any) {
  const receipt = validateContract('BrowserAcceptance',value); const result = manifest.result;
  for (const key of ['runId','outputHash','targetHash','rulesHash','skillHash','toolVersion'] as const) { if (receipt[key] !== result[key]) { throw new CliError('Acceptance binding stale or mismatched',2); } }
  if (json(receipt.dependencyHashes) !== json(result.dependencyHashes) || receipt.checklistId !== manifest.checklistId || receipt.checklistHash !== manifest.checklistHash) { throw new CliError('Acceptance checklist/dependencies mismatched',2); }
  if (receipt.perStepResults.length !== manifest.steps.length || manifest.steps.some((step: {id:string;mandatory:boolean}) => !receipt.perStepResults.some(s => s.id === step.id && s.mandatory === step.mandatory))) { throw new CliError('Acceptance mandatory cases missing or altered',2); }
  if (receipt.evidenceDigest !== hash(json(receipt.perStepResults))) { throw new CliError('Acceptance evidence digest mismatch',2); }
  if (receipt.verifier === 'REPLACE_WITH_HUMAN_NAME' || receipt.perStepResults.some(s => s.status === 'passed' && (s.evidence.startsWith('Record observed') || !s.evidence.trim()))) { throw new CliError('Acceptance must contain deliberately recorded observations',3); }
  return receipt;
}
async function acceptance(action: any,opts: any,cwd: any) {
  const {run,manifest,root} = await existingRun(opts,cwd); await fresh(manifest,run);
  if (action === 'template') {
    const r = manifest.result;
    const receipt = {schemaVersion:1,runId:r.runId,outputHash:r.outputHash,dependencyHashes:r.dependencyHashes,targetHash:r.targetHash,rulesHash:r.rulesHash,skillHash:r.skillHash,toolVersion:r.toolVersion,checklistId:manifest.checklistId,checklistHash:manifest.checklistHash,verifier:'REPLACE_WITH_HUMAN_NAME',timestamp:new Date().toISOString(),confirmationSource:'cli',perStepResults:manifest.steps,evidenceDigest:hash(json(manifest.steps))};
    const file = path.join(run.dir,`acceptance-template-${crypto.randomUUID()}.json`); await atomic(file,json(receipt),true); await event(run,'acceptance-template'); return {code:0,...await report(run,manifest),template:file};
  }
  if (action !== 'record') { throw new CliError('Unsupported acceptance operation'); }
  if (manifest.dryRun || manifest.result.state === 'blocked') { throw new CliError('Cannot accept blocked/dry-run run',2); }
  const receipt = assertReceipt(await load(await guard(root,required(opts,'file'))),manifest);
  await event(run,'acceptance-record-authorized',{evidenceDigest:receipt.evidenceDigest});
  await atomic(path.join(run.dir,`receipt-${crypto.randomUUID()}.json`),json(receipt),true);
  await atomic(path.join(run.dir,'acceptance.json'),json(receipt));
  await refreshEvidence(manifest,run,await fresh(manifest,run));
  await event(run,'acceptance-recorded',{state:manifest.result.state});
  return {code:manifest.result.state === 'complete' ? 0 : manifest.result.state === 'failed' ? 2 : 3,...await report(run,manifest)};
}
function backendFailure(error: unknown, operation: string): CliError {
  if (error instanceof CliError) { return error; }
  const systemCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return new CliError(`${operation} ${systemCode ? 'failed; inspect local audit and filesystem' : 'blocked; inspect local evidence, policy, and proposal'}`,systemCode ? 1 : 2);
}
async function completeContext(opts: any,cwd: string) {
  const loaded = await existingRun(opts,cwd);
  const context = await refreshEvidence(loaded.manifest,loaded.run,await fresh(loaded.manifest,loaded.run));
  await report(loaded.run,loaded.manifest);
  if (context.result.state !== 'complete') { throw new CliError('Operation requires complete fixture and browser evidence',context.result.state === 'failed' ? 2 : 3); }
  return {...loaded,context};
}
async function releaseCommand(opts: any,cwd: string) {
  const stage = required(opts,'stage');
  if (!['candidate','finalize'].includes(stage)) { throw new CliError('Unknown release stage'); }
  const loaded = await completeContext(opts,cwd);
  const configured = await configContext(required(opts,'config'),cwd);
  if (configured.configPath !== loaded.manifest.configPath || configured.configHash !== loaded.manifest.configHash) { throw new CliError('Release configuration differs from verified run',2); }
  const script = configured.config.projects.flatMap(p => p.scripts).find(script => script.id === required(opts,'script'));
  if (!script || script.id !== loaded.manifest.scriptId) { throw new CliError('Release script differs from verified run',2); }
  if (script.publish.mode !== 'local') { throw new CliError('Publication disabled by configuration',2); }
  const releaseRoot = await guard(loaded.root,'artifacts/release');
  if (stage === 'finalize') {
    if (!loaded.manifest.releaseCandidate) { throw new CliError('Run is not a prepared release candidate',2); }
    const candidate = await load(await guard(loaded.root,loaded.manifest.releaseCandidate)) as ReleaseCandidate;
    await event(loaded.run,'release-finalize-requested',{reservationId:loaded.context.releaseReservationId});
    try {
      const manifest = await finalizeRelease({context:loaded.context,candidate,script,releaseRoot,auditDir:path.join(loaded.run.dir,'release-audit')});
      await event(loaded.run,'release-finalized',{outputHash:manifest.outputHash,version:manifest.version});
      return {code:0,...await report(loaded.run,loaded.manifest),releaseManifest:path.join(releaseRoot,`${script.id}.manifest.json`),version:manifest.version};
    } catch (error) { await event(loaded.run,'release-finalize-failed'); throw backendFailure(error,'Local release'); }
  }
  const run = await newRun(loaded.root);
  await report(run,{state:'created',parentRunId:loaded.run.runId});
  try {
    await event(run,'release-prepare-requested',{parentRunId:loaded.run.runId,scriptId:script.id});
    const candidate = await prepareCandidate({context:loaded.context,script,releaseRoot,auditDir:path.join(run.dir,'release-audit')});
    const checked = await staticVerify({source:candidate.source,profile:loaded.context.profile});
    await capture(run,loaded.context.source);
    const output = path.join(run.dir,'candidate.user.js');
    await atomic(output,candidate.source,true);
    const result = validateContract('ConversionResult',{...loaded.context.result,runId:run.runId,outputHash:candidate.outputHash,state:checked.passed ? 'pending-browser' : 'failed',verification:checked.verification.map(v => v.kind === 'browser' ? {...v,command:undefined,checklist:loaded.context.checklistId} : v),findings:redact(checked.findings)});
    const manifest = {...loaded.manifest,result,outputPath:output,materialized:true,dryRun:false,parentRunId:candidate.parentRunId,releaseReservationId:candidate.reservationId,releasePolicyHash:candidate.policyHash,releaseCandidate:candidate.paths.reservation,releaseRoot,fixtureSuite:fixtureSuite(script.id)};
    await event(run,'release-candidate-frozen',{outputHash:candidate.outputHash,version:candidate.version});
    return {code:checked.passed ? 0 : 2,...await report(run,manifest),output,version:candidate.version,reservationId:candidate.reservationId,parentRunId:candidate.parentRunId};
  } catch (error) {
    await event(run,'release-prepare-failed');await report(run,{state:'failed',parentRunId:loaded.run.runId});
    throw backendFailure(error,'Release preparation');
  }
}
async function proposalContext(opts: any,cwd: string) {
  const root = await fs.realpath(cwd);
  const id = required(opts,'proposal');
  if (!/^evolution-[a-f0-9-]+$/.test(id)) { throw new CliError('Invalid proposal ID'); }
  const dir = await guard(root,`.fm/evolution/${id}`);
  const proposal = validateContract('EvolutionProposal',await load(await guard(root,path.join(dir,'proposal.json'))));
  if (proposal.id !== id) { throw new CliError('Proposal identity mismatch',2); }
  return {root,dir,proposal};
}
async function evolutionCommand(action: string,opts: any,cwd: string) {
  const layout = await resolveRuntimeLayout(bundleRoot);
  if (layout.mode !== 'source' || await fs.realpath(cwd) !== layout.runtimeRoot) { throw new CliError('Active evolution requires the owned source checkout as workspace; portable conversion remains available',2); }
  if (action === 'propose' || action === 'behavior-template') {
    const loaded = await completeContext(opts,cwd);
    if (!opts.draft) {
      if (action === 'behavior-template') { throw new CliError('Behavior template requires an explicit draft',2); }
      return {code:0,state:'no-proposal',runId:loaded.run.runId,reason:'No explicit evolution draft supplied; no rule or SKILL changes proposed'};
    }
    const draft = await load(await guard(loaded.root,required(opts,'draft'))) as EvolutionDraft;
    const replayIds = opts['replay-run'] ? String(opts['replay-run']).split(',') : [];
    const replays: RunEvidenceContext[] = [];
    for (const id of replayIds) { replays.push((await completeContext({run:id},cwd)).context); }
    if (action === 'behavior-template') {
      await event(loaded.run,'skill-behavior-template-requested');
      try {
        const prepared = await behaviorTemplate({workspaceRoot:loaded.root,auditDir:path.join(loaded.run.dir,'evolution-audit'),origin:loaded.context,draft,replays});
        const template = path.join(loaded.run.dir,`skill-behavior-template-${crypto.randomUUID()}.json`);
        await atomic(template,json(prepared.observation),true);
        await event(loaded.run,'skill-behavior-template-created',{candidateSkillHash:prepared.observation.candidateSkillHash});
        return {code:0,state:'pending-behavior',runId:loaded.run.runId,template,candidateDir:prepared.candidateDir,rawRequestsFile:prepared.rawRequestsFile};
      } catch (error) { await event(loaded.run,'skill-behavior-template-failed'); throw backendFailure(error,'Skill behavior template'); }
    }
    await event(loaded.run,'evolution-propose-requested');
    try {
      const created = await proposeEvolution({workspaceRoot:loaded.root,auditDir:path.join(loaded.run.dir,'evolution-audit'),origin:loaded.context,draft,replays});
      await event(loaded.run,'evolution-proposed',{proposalId:created.proposal.id,reportHash:created.proposal.reportHash});
      return {code:0,state:'proposed',proposal:created.proposal.id,json:path.join(created.proposalDir,'proposal.json'),report:path.join(created.proposalDir,'report.md'),patch:path.join(created.proposalDir,'patch.json')};
    } catch (error) { await event(loaded.run,'evolution-propose-failed'); throw backendFailure(error,'Evolution proposal'); }
  }
  const p = await proposalContext(opts,cwd);
  if (action === 'reject') {
    try {
      const rejected = await rejectEvolution({workspaceRoot:p.root,proposalDir:p.dir,auditDir:path.join(p.dir,'rejection-audit')});
      return {code:0,state:'rejected',proposal:rejected.id};
    } catch (error) { throw backendFailure(error,'Evolution rejection'); }
  }
  if (action === 'approval-template') {
    const template = approvalTemplate(p.proposal,'REPLACE_WITH_HUMAN_NAME',new Date().toISOString());
    const file = path.join(p.dir,`approval-template-${crypto.randomUUID()}.json`);
    await atomic(file,json(template),true);
    return {code:0,state:'proposed',proposal:p.proposal.id,template:file,report:path.join(p.dir,'report.md'),reportHash:p.proposal.reportHash};
  }
  if (action !== 'apply') { throw new CliError('Unsupported evolution operation'); }
  const loaded = await completeContext({run:p.proposal.originatingRun},cwd);
  const approval = validateContract('Approval',await load(await guard(p.root,required(opts,'approval'))));
  await event(loaded.run,'evolution-apply-requested',{proposalId:p.proposal.id});
  try {
    const applied = await applyEvolution({workspaceRoot:p.root,proposalDir:p.dir,approval,auditDir:path.join(loaded.run.dir,'evolution-audit')});
    await event(loaded.run,'evolution-applied',{proposalId:applied.id});
    return {code:0,state:applied.status,proposal:applied.id,report:path.join(p.dir,'report.md')};
  } catch (error) { await event(loaded.run,'evolution-apply-failed'); throw backendFailure(error,'Evolution application'); }
}
export async function runCli(args: string[],{cwd=process.cwd()}={}) {
  try {
    const words: string[] = []; const opts: Record<string, any> = {};
    for (let i=0;i<args.length;i++) { if (args[i].startsWith('--')) { const key=args[i].slice(2); if (key in opts) { throw new CliError('Duplicate option'); } opts[key] = ['dry-run','static'].includes(key) ? true : args[++i]; } else { words.push(args[i]); } }
    const allowed: Record<string,string[]> = {config:['config'],sync:['config','project'],convert:['input','output','target','script-id','config','dry-run','transform'],verify:['run','static'],acceptance:['run','file'],fixtures:['run','file'],evolve:['run','draft','replay-run','proposal','approval'], 'prepare-release':['config','script','run','stage']};
    if (!allowed[words[0]]) { throw new CliError('Unsupported command'); }
    if (Object.keys(opts).some(k => !allowed[words[0]].includes(k))) { throw new CliError('Unknown option'); }
    if (words[0] === 'config' && words[1] === 'validate' && words.length === 2) { const ctx = await configContext(required(opts,'config'),cwd); return {code:0,state:'valid',config:ctx.configPath}; }
    if (words[0] === 'sync' && words.length === 1) { return await sync(opts,cwd); }
    if (words[0] === 'convert' && words.length === 1) { return await convertCommand(opts,cwd); }
    if (words[0] === 'verify' && words.length === 1) { return await verifyCommand(opts,cwd); }
    if (words[0] === 'acceptance' && words.length === 2) { return await acceptance(words[1],opts,cwd); }
    if (words[0] === 'fixtures' && words.length === 2) { return await fixturesCommand(words[1],opts,cwd); }
    if (words[0] === 'evolve' && words.length === 2) { return await evolutionCommand(words[1],opts,cwd); }
    if (words[0] === 'prepare-release' && words.length === 1) { return await releaseCommand(opts,cwd); }
    throw new CliError('Unsupported command shape');
  } catch(e: any) { return {code:e instanceof CliError ? e.code : 1,state:'error',error:e instanceof CliError ? e.message : 'Operation failed safely; no raw exception details are exposed'}; }
}
