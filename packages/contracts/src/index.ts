import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import { schemas, type ContractName, type Contracts } from './schemas.js';
export * from './schemas.js';
export { canonicalJson, fixtureObservationDigest, skillBehaviorDigest } from './evidence-digest.js';
export { resolveRuntimeLayout, skillResourceIdentity, hashSkillResources, runtimeSupportPaths } from './runtime-layout.js';
export type { RunEvidenceContext, VerifiedRunEvidence } from './run-evidence.js';
const Ajv = AjvModule as unknown as typeof AjvModule.default;
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
export class ContractValidationError extends Error {
  constructor(public readonly contract: ContractName, public readonly issues: string[]) {
    super(`${contract}: ${issues.join('; ')}`);
    this.name = 'ContractValidationError';
  }
}
export function checkContract<K extends ContractName>(name: K, value: unknown): { valid: true; value: Contracts[K] } | { valid: false; issues: string[] } {
  const validate = validators[name];
  if (!validate(value)) {
    return { valid: false, issues: (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`) };
  }
  const v = value as Contracts[K];
  const issues = semanticIssues(name, v);
  return issues.length ? { valid: false, issues } : { valid: true, value: v };
}
export function validateContract<K extends ContractName>(name: K, value: unknown): Contracts[K] {
  const result = checkContract(name, value);
  if (!result.valid) { throw new ContractValidationError(name, result.issues); }
  return result.value;
}
function semanticIssues(name: ContractName, value: Contracts[ContractName]): string[] {
  const errors: string[] = [];
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) { errors.push(`duplicate ${label}`); } };
  const safeUrl = (input: string, allowFragment = false) => { try { const u = new URL(input); if (u.username || u.password || (!allowFragment && u.hash) || (allowFragment && /(?:^#|[&?])[^=&]*(?:token|key|secret|auth|password)[^=&]*=/i.test(decodeURIComponent(u.hash))) || [...u.searchParams.keys()].some(k => /token|key|secret|auth|password/i.test(k))) { errors.push('URL must not contain credentials, disallowed fragments or secret parameters'); } } catch { errors.push('invalid URL'); } };
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); }
    else if (v && typeof v === 'object') { for (const [key, child] of Object.entries(v)) { if ((/url$/i.test(key) || key === 'reference') && typeof child === 'string' && /^https?:/i.test(child)) { safeUrl(child, key === 'reference'); } walk(child); } }
  };
  walk(value);
  if (name === 'RepositoryConfig') {
    const v = value as Contracts['RepositoryConfig'];
    unique(v.projects.map(p => p.id), 'project IDs');
    unique(v.projects.flatMap(p => p.scripts.map(s => s.id)), 'script IDs');
    unique(v.projects.flatMap(p => p.scripts.map(s => JSON.stringify([s.identity.name, s.identity.namespace]))), 'script identities');
    unique(v.projects.flatMap(p => p.scripts.map(s => normalizePath(s.outputPath))), 'output paths');
    const outputs = v.projects.flatMap(p => p.scripts.map(s => normalizePath(s.outputPath)));
    if (outputs.some((p, i) => outputs.some((q, j) => i !== j && q.startsWith(`${p}/`)))) { errors.push('output file paths collide with parent directories'); }
    for (const p of v.projects) { for (const s of p.scripts) {
      if (p.upstream.kind === 'url' && s.sourcePath !== undefined) { errors.push('URL script must not specify sourcePath'); }
      if (p.upstream.kind !== 'url' && !s.sourcePath) { errors.push('local/git script requires sourcePath'); }
    } }
  }
  if (name === 'SourceLock') { unique((value as Contracts['SourceLock']).snapshots.map(s => s.scriptId), 'snapshot script IDs'); }
  if (name === 'TargetProfile') {
    const v = value as Contracts['TargetProfile']; unique(v.capabilities.api.map(a => a.name), 'API names'); unique(v.capabilities.metadata.map(a => a.name), 'metadata names');
  }
  if (name === 'Rule') {
    const v = value as Contracts['Rule'];
    if (v.dependencies.includes(v.id) || v.conflicts.includes(v.id)) { errors.push('rule cannot depend on or conflict with itself'); }
    if (v.dependencies.some(d => v.conflicts.includes(d))) { errors.push('rule dependency also listed as conflict'); }
    for (const c of [...v.preconditions, ...v.postconditions, ...(v.action.kind === 'guidance' ? v.action.guidance.postconditions : [])]) { if (c.kind === 'inputHash' && !/^[a-f0-9]{64}$/.test(c.query)) { errors.push('inputHash condition must be SHA256'); } }
  }
  if (name === 'Verification') {
    const v = value as Contracts['Verification']; if ((v.command === undefined) === (v.checklist === undefined)) { errors.push('verification requires exactly one of command/checklist'); }
    if (v.kind === 'browser' && !v.checklist) { errors.push('browser verification requires checklist'); }
  }
  if (name === 'BrowserAcceptance') { unique((value as Contracts['BrowserAcceptance']).perStepResults.map(s => s.id), 'acceptance step IDs'); }
  if (name === 'SkillBehaviorObservation') { unique((value as Contracts['SkillBehaviorObservation']).cases.map(s => s.id), 'skill behavior case IDs'); }
  if (name === 'FixtureObservation') { unique((value as Contracts['FixtureObservation']).cases.map(s => s.id), 'fixture case IDs'); }
  if (name === 'ConversionResult') {
    const v = value as Contracts['ConversionResult'];
    for (const verification of v.verification) { errors.push(...semanticIssues('Verification', verification)); }
    if (['converted','static-passed','pending-browser','complete'].includes(v.state) && !v.outputHash) { errors.push('converted state requires outputHash'); }
    if (v.state === 'complete') {
      for (const kind of ['parse','metadata','lint','fixture','browser']) { if (!v.verification.some(c => c.kind === kind && c.status === 'passed')) { errors.push(`complete requires passed ${kind}`); } }
      if (v.verification.some(c => c.status === 'pending' || c.status === 'failed')) { errors.push('complete cannot contain failed/pending verification'); }
      if (v.verification.some(c => c.status === 'passed' && c.artifactHash !== v.outputHash)) { errors.push('complete verification must bind the output hash'); }
    }
  }
  if (name === 'EvolutionProposal') {
    const v = value as Contracts['EvolutionProposal']; unique(v.changes.map(c => normalizePath(c.path)), 'proposal change paths');
    for (const c of v.changes) { const p = normalizePath(c.path); if (!['rules/','skills/fm-convert/','fixtures/','docs/evolution/'].some(root => p.startsWith(root))) { errors.push('proposal change outside allowed evolution paths'); } }
    for (const c of v.changes) {
      const p = normalizePath(c.path);
      if ((v.scope === 'rules' && p.startsWith('skills/')) || (v.scope === 'skill' && p.startsWith('rules/'))) { errors.push('proposal change contradicts declared scope'); }
      if (v.baseHashes[p] !== undefined && v.baseHashes[p] !== c.beforeHash) { errors.push('proposal beforeHash contradicts declared base hash'); }
    }
  }
  if (name === 'Approval') { const v = value as Contracts['Approval']; if (v.mode === 'pr' && !v.commit) { errors.push('PR approval requires commit'); } if (v.mode === 'local' && v.commit) { errors.push('local approval must not specify commit'); } }
  if (name === 'ReleaseManifest') {
    const v = value as Contracts['ReleaseManifest']; const r = v.verifiedReceipt;
    errors.push(...semanticIssues('BrowserAcceptance', r));
    if (v.outputHash !== r.outputHash || v.profileHash !== r.targetHash || v.rulesHash !== r.rulesHash) { errors.push('release receipt hashes do not match manifest'); }
    if (r.perStepResults.some(s => s.mandatory && s.status !== 'passed') || !r.perStepResults.some(s => s.mandatory)) { errors.push('release requires passed mandatory browser steps'); }
  }
  return errors;
}
function normalizePath(p: string): string { return p.split('/').filter(s => s && s !== '.').join('/'); }
export function validateRuleSet(values: unknown[], profileIds?: readonly string[]): Contracts['Rule'][] {
  const rules = values.map(v => validateContract('Rule', v));
  const ids = new Set(rules.map(r => r.id));
  if (ids.size !== rules.length) { throw new ContractValidationError('Rule', ['duplicate rule IDs']); }
  const visited = new Set<string>(); const visiting = new Set<string>();
  const visit = (r: Contracts['Rule']): void => {
    if (visiting.has(r.id)) { throw new ContractValidationError('Rule', ['dependency cycle']); }
    if (visited.has(r.id)) { return; }
    visiting.add(r.id);
    for (const dependency of r.dependencies) { const next = rules.find(v => v.id === dependency); if (!next) { throw new ContractValidationError('Rule', [`unknown dependency ${dependency}`]); } visit(next); }
    visiting.delete(r.id); visited.add(r.id);
  };
  for (const r of rules) {
    for (const conflict of r.conflicts) { if (!ids.has(conflict)) { throw new ContractValidationError('Rule', [`unknown conflict ${conflict}`]); } }
    if (profileIds && r.targetRange.profileIds.some(id => !profileIds.includes(id))) { throw new ContractValidationError('Rule', ['unknown target profile']); }
    visit(r);
  }
  return rules;
}
