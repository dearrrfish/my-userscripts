import type { BrowserAcceptance, ConversionResult, FixtureObservation, RepositoryConfig, Rule, TargetProfile } from './schemas.js';

/** The host loads and freshness-checks this context; backends recheck its hashes. */
export interface RunEvidenceContext {
  workspaceRoot: string;
  bundleRoot: string;
  runDir: string;
  source: string;
  candidate: string;
  result: ConversionResult;
  profile: TargetProfile;
  /** Exact profile file bytes; targetHash uses the file hash, not reserialization. */
  profileSource: string;
  rules: Rule[];
  /** Existing CLI convention: JSON.stringify(activeRules, null, 2) + newline. */
  rulesSource: string;
  identity: { name: string; namespace: string };
  scriptId?: string;
  checklistId: string;
  checklistHash: string;
  mandatoryBrowserSteps: { id: string; mandatory: boolean }[];
  fixtureSuiteId: string;
  fixtureSuiteHash: string;
  mandatoryFixtureCases: { id: string; mandatory: boolean }[];
  receipt?: BrowserAcceptance;
  fixture?: FixtureObservation;
  config?: RepositoryConfig;
  configPath?: string;
  configHash?: string;
  parentRunId?: string;
  releaseReservationId?: string;
  releasePolicyHash?: string;
}

/** A type refinement; consumers must still validate external evidence at runtime. */
export type VerifiedRunEvidence = RunEvidenceContext & {
  result: ConversionResult & { state: 'complete'; outputHash: string };
  receipt: BrowserAcceptance;
  fixture: FixtureObservation;
};
