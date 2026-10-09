# @fm/contracts

Schema version 1 contracts for the FM conversion workspace. TypeBox definitions in
`src/schemas.ts` are authoritative: TypeScript types and generated JSON schemas
share those definitions. Build with `pnpm --filter @fm/contracts build`.

```ts
import { checkContract, validateContract, validateRuleSet } from '@fm/contracts';
const result = checkContract('RepositoryConfig', input);
if (result.valid) {
  // result.value is a RepositoryConfig
}
const config = validateContract('RepositoryConfig', input); // throws on failure
const rules = validateRuleSet(ruleInputs, ['profile-id']);
```

`checkContract` returns validation issues without echoing input values;
`validateContract` throws `ContractValidationError`. `validateRuleSet` additionally
rejects duplicate rule IDs, unknown dependencies/conflicts/profiles and dependency
cycles. Unknown fields and unsupported schema versions fail closed. Hashes use
lowercase SHA256; git source refs use full lowercase 40-character commits.

Generated JSON schemas enforce structural constraints. Consumers must call the
runtime API for semantic checks: duplicate identities and normalized output paths,
credential URLs, rule graph relationships, verification requirements, proposal
path bounds, and release receipt binding. JSON schemas alone are insufficient.
Input is data; validation never executes scripts or guidance text.

`pnpm --filter @fm/contracts validate --profiles profiles --rules rules` recursively
loads JSON profile/rule files and validates their relationship. Paths resolve from
the repository root even when pnpm starts the command in this package. Build first.

Pending browser receipts are representable and do not authorize a release.
A complete conversion requires passed parse/metadata/lint/fixture/browser checks
bound to its output hash. A release requires matching output/profile/rules hashes
and passed mandatory browser steps. The later acceptance/evolution services must
compare run IDs, dependency/skill/tool/checklist hashes and approval base/report/
patch/proposal digests against current state; this package does not independently
attest that a browser was observed or that a human approved a report. Filesystem
realpath containment, transform whitelists and actual matcher execution also belong
to those services, rather than structural contract validation.

Node `>=24.21.0 <25` and pnpm `12.3.4` are pinned in root engines. This environment's
pnpm is a distro-provided Rust build, so no npm `packageManager` download spec is
used. Dependency versions and resolutions are fixed in `pnpm-lock.yaml`; local
installation uses the ignored `.fm/pnpm-store`.
