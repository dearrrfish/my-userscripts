import { Type as T, type Static } from '@sinclair/typebox';
const text = () => T.String({ minLength: 1 });
const hash = () => T.String({ pattern: '^[a-f0-9]{64}$' });
const id = () => T.String({ pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' });
const time = () => T.String({ format: 'date-time' });
const url = () => T.String({ format: 'uri', pattern: '^https?://' });
const path = () => T.String({ minLength: 1, pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\\\).+$' });
const obj = <P extends Parameters<typeof T.Object>[0]>(p: P) => T.Object(p, { additionalProperties: false });
const strings = () => T.Array(text(), { uniqueItems: true });
const hashes = () => T.Record(text(), hash());
const version = T.Literal(1);
const identity = obj({ name: text(), namespace: text() });
const source = T.Union([
  obj({ kind: T.Literal('local'), path: path() }),
  obj({ kind: T.Literal('url'), url: url() }),
  obj({ kind: T.Literal('git'), url: url(), ref: T.String({ pattern: '^[a-f0-9]{40}$' }) }),
]);
const evidence = obj({ kind: T.Union([T.Literal('official'), T.Literal('acceptance'), T.Literal('fixture')]), reference: text(), hash: hash(), description: text() });
const dependency = obj({ url: url(), hash: hash() });
const targetRange = obj({ profileIds: T.Array(id(), { minItems: 1, uniqueItems: true }), fm: text(), firefox: text() });
const location = obj({ line: T.Integer({ minimum: 1 }), column: T.Integer({ minimum: 0 }), endLine: T.Optional(T.Integer({ minimum: 1 })), endColumn: T.Optional(T.Integer({ minimum: 0 })) });
const severity = T.Union([T.Literal('info'), T.Literal('warning'), T.Literal('error')]);
const category = T.Union([T.Literal('metadata'), T.Literal('api'), T.Literal('context'), T.Literal('lint')]);
const publish = T.Union([
 obj({ mode: T.Literal('disabled') }),
 obj({ mode: T.Literal('local'), baseUrl: url(), licenseEvidence: evidence, versionMajor: T.Integer({ minimum: 0 }), initialRevision: T.Integer({ minimum: 0 }) }),
]);
const script = obj({ id: id(), sourcePath: T.Optional(path()), sourceManager: T.Union(['gm','vm','tm','fm','unknown'].map(x => T.Literal(x))), outputPath: path(), identity, ruleIds: T.Optional(T.Array(id(), { uniqueItems: true })), acceptance: obj({ checklistId: id() }), publish });
export const RepositoryConfigSchema = obj({ schemaVersion: version, outputRoot: path(), targetProfile: id(), projects: T.Array(obj({ id: id(), upstream: source, scripts: T.Array(script, { minItems: 1 }) }), { minItems: 1 }) });
export const SourceSnapshotSchema = obj({ schemaVersion: version, scriptId: id(), origin: source, retrievedAt: time(), revision: T.Optional(text()), hash: hash(), dependencies: T.Array(dependency) });
export const SourceLockSchema = obj({ schemaVersion: version, snapshots: T.Array(SourceSnapshotSchema, { minItems: 1 }) });
export const TargetProfileSchema = obj({ schemaVersion: version, id: id(), fm: obj({ version: text(), range: text(), release: text(), sourceCommit: T.String({ pattern: '^[a-f0-9]{40}$' }), sourceUrl: url() }), firefox: obj({ version: text(), range: text() }), help: obj({ url: url(), retrievedAt: time(), hash: hash() }), capabilities: obj({ api: T.Array(obj({ name: text(), status: T.Union(['supported','unsupported','unknown'].map(x => T.Literal(x))), contexts: strings(), evidence: T.Array(evidence, { minItems: 1 }) })), metadata: T.Array(obj({ name: text(), status: T.Union(['supported','unsupported','unknown'].map(x => T.Literal(x))), evidence: T.Array(evidence, { minItems: 1 }) })), contexts: strings() }), lint: obj({ name: text(), version: text(), config: T.Record(text(), T.Unknown()), sourceUrl: url(), sourceHash: hash() }) });
const condition = obj({ kind: T.Union(['metadata','ast','inputHash','target','identity'].map(x => T.Literal(x))), query: text() });
const action = T.Union([
 obj({ kind: T.Literal('transform'), transformId: id(), args: T.Optional(T.Record(text(), T.Unknown())) }),
 obj({ kind: T.Literal('diagnose') }),
 obj({ kind: T.Literal('guidance'), guidance: obj({ steps: T.Array(text(), { minItems: 1 }), riskConfirmation: T.Boolean(), requiredEvidence: T.Array(text(), { minItems: 1 }), postconditions: T.Array(condition, { minItems: 1 }) }) }),
]);
const ruleFields = { schemaVersion: version, id: id(), revision: T.Integer({ minimum: 1 }), targetRange, category, severity, matcher: obj({ kind: T.Union([T.Literal('metadata'), T.Literal('ast')]), query: text() }), preconditions: T.Array(condition), action, postconditions: T.Array(condition), dependencies: T.Array(id(), { uniqueItems: true }), conflicts: T.Array(id(), { uniqueItems: true }), evidence: T.Array(evidence, { minItems: 1 }) };
export const RuleSchema = T.Union([obj({ ...ruleFields, scope: T.Literal('shared') }), obj({ ...ruleFields, scope: T.Literal('script'), scriptId: id(), identity })]);
export const FindingSchema = obj({ schemaVersion: version, ruleId: T.Optional(id()), location: T.Optional(location), category, severity, fixability: T.Union(['automatic','manual','none'].map(x => T.Literal(x))), reasoning: text(), evidence: T.Array(evidence), needsConfirmation: T.Boolean() });
export const VerificationSchema = obj({ schemaVersion: version, kind: T.Union(['parse','metadata','lint','fixture','browser'].map(x => T.Literal(x))), status: T.Union(['passed','failed','pending','not-applicable'].map(x => T.Literal(x))), command: T.Optional(text()), checklist: T.Optional(id()), environment: T.Record(text(), text()), artifactHash: hash(), evidenceDigest: hash() });
export const ConversionResultSchema = obj({ schemaVersion: version, runId: id(), state: T.Union(['created','analyzed','converted','static-passed','pending-browser','complete','failed','blocked'].map(x => T.Literal(x))), inputHash: hash(), outputHash: T.Optional(hash()), targetHash: hash(), rulesHash: hash(), skillHash: hash(), toolVersion: text(), dependencyHashes: hashes(), findings: T.Array(FindingSchema), appliedRules: T.Array(id(), { uniqueItems: true }), verification: T.Array(VerificationSchema) });
export const BrowserAcceptanceSchema = obj({ schemaVersion: version, runId: id(), outputHash: hash(), dependencyHashes: hashes(), targetHash: hash(), rulesHash: hash(), skillHash: hash(), toolVersion: text(), checklistId: id(), checklistHash: hash(), verifier: text(), timestamp: time(), confirmationSource: T.Union([T.Literal('coding-tool'), T.Literal('cli')]), perStepResults: T.Array(obj({ id: id(), mandatory: T.Boolean(), status: T.Union(['passed','failed','pending','not-applicable'].map(x => T.Literal(x))), evidence: text() }), { minItems: 1 }), evidenceDigest: hash() });
export const FixtureObservationSchema = obj({ schemaVersion: version, runId: id(), inputHash: hash(), outputHash: hash(), dependencyHashes: hashes(), targetHash: hash(), rulesHash: hash(), skillHash: hash(), toolVersion: text(), suiteId: id(), suiteHash: hash(), verifier: text(), timestamp: time(), confirmationSource: T.Union([T.Literal('coding-tool'), T.Literal('cli')]), cases: T.Array(obj({ id: id(), mandatory: T.Boolean(), status: T.Union(['passed','failed','pending','not-applicable'].map(x => T.Literal(x))), command: text(), evidence: text() }), { minItems: 1 }), evidenceDigest: hash() });
export const SkillBehaviorObservationSchema = obj({ schemaVersion: version, candidateSkillHash: hash(), suiteId: id(), suiteHash: hash(), runnerHash: hash(), bindingHash: hash(), machineDigest: hash(), evaluator: text(), timestamp: time(), confirmationSource: T.Union([T.Literal('coding-tool'), T.Literal('cli')]), cases: T.Array(obj({ id: id(), mandatory: T.Boolean(), status: T.Union(['passed','failed','pending','not-applicable'].map(x => T.Literal(x))), evidence: text(), artifactHashes: T.Array(hash(), { minItems: 1, uniqueItems: true }) }), { minItems: 1 }), reportHash: hash(), evidenceDigest: hash() });
export const EvolutionProposalSchema = obj({ schemaVersion: version, id: id(), originatingRun: id(), baseHashes: hashes(), patchHash: hash(), reportHash: hash(), proposalHash: hash(), verificationDigest: hash(), changes: T.Array(obj({ path: path(), beforeHash: T.Optional(hash()), afterHash: hash() }), { minItems: 1 }), reason: text(), regressionFixtures: T.Array(path(), { minItems: 1, uniqueItems: true }), scope: T.Union(['rules','skill','both'].map(x => T.Literal(x))), status: T.Union(['proposed','approved','rejected','stale','applied'].map(x => T.Literal(x))) });
export const ApprovalSchema = obj({ schemaVersion: version, proposalId: id(), patchHash: hash(), reportHash: hash(), proposalHash: hash(), verificationDigest: hash(), approver: text(), time: time(), mode: T.Union([T.Literal('local'), T.Literal('pr')]), commit: T.Optional(T.String({ pattern: '^[a-f0-9]{40}$' })) });
export const ReleaseManifestSchema = obj({ schemaVersion: version, scriptId: id(), identity, inputHash: hash(), outputHash: hash(), profileHash: hash(), rulesHash: hash(), verifiedReceipt: BrowserAcceptanceSchema, version: T.String({ pattern: '^[0-9]+\\.[0-9]+$' }), licenseEvidence: evidence, downloadUrl: url(), updateUrl: url() });
export const schemas = { RepositoryConfig: RepositoryConfigSchema, SourceSnapshot: SourceSnapshotSchema, SourceLock: SourceLockSchema, TargetProfile: TargetProfileSchema, Rule: RuleSchema, Finding: FindingSchema, Verification: VerificationSchema, ConversionResult: ConversionResultSchema, BrowserAcceptance: BrowserAcceptanceSchema, FixtureObservation: FixtureObservationSchema, SkillBehaviorObservation: SkillBehaviorObservationSchema, EvolutionProposal: EvolutionProposalSchema, Approval: ApprovalSchema, ReleaseManifest: ReleaseManifestSchema } as const;
export type ContractName = keyof typeof schemas;
export type Contracts = { [K in ContractName]: Static<(typeof schemas)[K]> };
export type RepositoryConfig = Contracts['RepositoryConfig'];
export type SourceSnapshot = Contracts['SourceSnapshot'];
export type SourceLock = Contracts['SourceLock'];
export type TargetProfile = Contracts['TargetProfile'];
export type Rule = Contracts['Rule'];
export type Finding = Contracts['Finding'];
export type Verification = Contracts['Verification'];
export type ConversionResult = Contracts['ConversionResult'];
export type BrowserAcceptance = Contracts['BrowserAcceptance'];
export type FixtureObservation = Contracts['FixtureObservation'];
export type EvolutionProposal = Contracts['EvolutionProposal'];
export type Approval = Contracts['Approval'];
export type ReleaseManifest = Contracts['ReleaseManifest'];

export type SkillBehaviorObservation = Contracts['SkillBehaviorObservation'];
