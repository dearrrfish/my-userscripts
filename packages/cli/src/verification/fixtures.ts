import { createHash } from 'node:crypto';
import { canonicalJson as canonical, fixtureObservationDigest, validateContract, validateRuleSet, type RunEvidenceContext, type FixtureObservation, type Verification } from '@fm/contracts';
export type FixtureContext = RunEvidenceContext;
export { fixtureObservationDigest } from '@fm/contracts';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function fixtureSuite(scriptId?: string) {
  const target = scriptId === 'greasyfork-454120';
  const id = target ? 'greasyfork-454120-regression-v1' : 'standalone-regression-v1';
  const cases = (target ? ['metadata-retention','storage-compatibility','document-start-init','unsafeWindow-bindings','idempotence'] : ['metadata-retention','API-context','idempotence']).map(id => ({id,mandatory:true}));
  return {id,hash:sha(canonical({id,cases})),cases};
}
export function fixtureTemplate(context: FixtureContext): FixtureObservation {
  const r = context.result; const suite = fixtureSuite(context.scriptId);
  if (!r.outputHash) { throw new Error('Fixture observation requires a candidate output hash'); }
  const body = {schemaVersion:1 as const,runId:r.runId,inputHash:r.inputHash,outputHash:r.outputHash,dependencyHashes:{...r.dependencyHashes},targetHash:r.targetHash,rulesHash:r.rulesHash,skillHash:r.skillHash,toolVersion:r.toolVersion,suiteId:suite.id,suiteHash:suite.hash,verifier:'REPLACE_WITH_HUMAN_NAME',timestamp:new Date().toISOString(),confirmationSource:'cli' as const,cases:suite.cases.map(c => ({...c,status:'pending' as const,command:'REPLACE_WITH_EXECUTED_COMMAND_OR_MANUAL_PROCEDURE',evidence:'Record observed fixture behavior and evidence location'}))};
  return {...body,evidenceDigest:fixtureObservationDigest(body)};
}
const placeholder = (value: string) => !value.trim() || /REPLACE_WITH|Record observed|\b(?:TODO|TBD|placeholder)\b/i.test(value);
export function checkFixtureObservation(value: unknown, context: FixtureContext): FixtureObservation {
  const receipt = validateContract('FixtureObservation',value); const r = validateContract('ConversionResult',context.result);
  validateContract('TargetProfile',context.profile);
  if (sha(context.profileSource) !== r.targetHash || canonical(JSON.parse(context.profileSource)) !== canonical(context.profile)) { throw new Error('Context profile bytes changed'); }
  if (sha(context.rulesSource) !== r.rulesHash || canonical(JSON.parse(context.rulesSource)) !== canonical(context.rules)) { throw new Error('Context rules bytes changed'); }
  if (sha(context.source) !== r.inputHash || sha(context.candidate) !== r.outputHash) { throw new Error('Fixture source or candidate bytes changed'); }
  for (const key of ['runId','inputHash','outputHash','targetHash','rulesHash','skillHash','toolVersion'] as const) {
    if (receipt[key] !== r[key]) { throw new Error(`Fixture binding mismatch: ${key}`); }
  }
  if (canonical(receipt.dependencyHashes) !== canonical(r.dependencyHashes)) { throw new Error('Fixture dependency binding mismatch'); }
  const suite = fixtureSuite(context.scriptId);
  if (context.fixtureSuiteId !== suite.id || context.fixtureSuiteHash !== suite.hash || canonical(context.mandatoryFixtureCases) !== canonical(suite.cases)) { throw new Error('Context fixture suite binding mismatch'); }
  validateRuleSet(context.rules,[context.profile.id]);
  if (sha(JSON.stringify(context.rules,null,2) + '\n') !== r.rulesHash) { throw new Error('Context rules content changed'); }
  if (receipt.suiteId !== suite.id || receipt.suiteHash !== suite.hash || receipt.cases.length !== suite.cases.length || new Set(receipt.cases.map(c => c.id)).size !== receipt.cases.length || suite.cases.some(c => !receipt.cases.some(actual => actual.id === c.id && actual.mandatory === c.mandatory))) { throw new Error('Fixture suite or mandatory cases changed'); }
  if (receipt.evidenceDigest !== fixtureObservationDigest(receipt)) { throw new Error('Fixture evidence digest mismatch'); }
  if (placeholder(receipt.verifier) || !Number.isFinite(Date.parse(receipt.timestamp)) || Date.parse(receipt.timestamp) > Date.now() + 300_000) { throw new Error('Fixture observation requires an actor and valid observation time'); }
  if (receipt.cases.some(c => c.status !== 'pending' && (placeholder(c.command) || placeholder(c.evidence)))) { throw new Error('Fixture observation requires deliberate commands and evidence'); }
  return receipt;
}
export function fixtureVerification(observation: FixtureObservation): Verification {
  const mandatory = observation.cases.filter(c => c.mandatory);
  return validateContract('Verification',{schemaVersion:1,kind:'fixture',status:mandatory.some(c => c.status === 'failed') ? 'failed' : mandatory.length > 0 && mandatory.every(c => c.status === 'passed') ? 'passed' : 'pending',command:'Human-recorded fixture procedures; command strings are evidence and are never executed',environment:{suite:observation.suiteId,verifier:observation.verifier,timestamp:observation.timestamp},artifactHash:observation.outputHash,evidenceDigest:observation.evidenceDigest});
}
export function mergeFixtureVerification(records: Verification[], context: FixtureContext): Verification[] {
  if (!context.fixture) { return records; }
  const verified = fixtureVerification(checkFixtureObservation(context.fixture,context));
  return [...records.filter(record => record.kind !== 'fixture'),verified];
}
