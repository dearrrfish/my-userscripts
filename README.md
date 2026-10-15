# FireMonkey userscript workspace

A userscript conversion workspace with versioned contracts, pinned FireMonkey
profiles, shared rules, and an automated upstream synchronization and release pipeline.

All managed scripts, FireMonkey compatibility statuses, and direct one-click installation
and update URLs for browser extensions are tracked in [Managed scripts](docs/managed-scripts.md)
(conversion progress is also referenced in the [conversion backlog](docs/conversion-backlog.md)).

The workspace includes contract validation, pinned profiles, rule matching,
conservative conversion, and a CLI for source snapshots, static verification,
human browser acceptance records, a portable conversion SKILL, reviewed local
rule/skill evolution, and local release preparation. Static verification does not establish
FireMonkey runtime compatibility.

## Development

Use Node 24 (at least 24.21.0) and pnpm 12.3.4. Install project dependencies with
its lockfile and keep the package store local:

```sh
pnpm install --frozen-lockfile --store-dir .fm/pnpm-store
pnpm build
pnpm typecheck
pnpm test
pnpm test:profiles
pnpm test:privacy
pnpm test:portable
pnpm --filter @fm/contracts validate --profiles profiles --rules rules
```

The contracts package exports TypeScript types, JSON schemas, and runtime
validators. Profiles pin a FireMonkey source commit and Firefox version;
unsupported or unknown capabilities remain explicit. See
[profiles](docs/target-profiles.md) and [rules](docs/rules.md).

[config/scripts.example.json](config/scripts.example.json) describes the actual
upstream script and intended output. Publication is disabled. Its source lock
records the original version and content hash; source snapshots and raw local
runs belong in ignored `.fm/`, and generated outputs belong in `artifacts/`.
Only approved, sanitized evolution summaries belong in tracked documentation.

Run `pnpm fm config validate --config config/scripts.example.json` to validate
the repository configuration. See [configuration](docs/configuration.md) for
source synchronization and conversion commands, and
[verification](docs/verification.md) for static checks and browser receipts.
See [fixture evidence](docs/fixture-evidence.md), [local evolution](docs/evolution-process.md)
and [local release](docs/release.md) for completion gates and reviewed changes.
The [fm-convert SKILL](skills/fm-convert/SKILL.md) routes to those tools and evidence
requirements. See [skill usage](docs/skill.md) and [portable packaging](docs/portable.md).
Blocked scripts retain findings in local reports and require manual repair;
the tool never executes the input script or treats a missing browser check as
a success.

The seven previous scripts and styles live unchanged under `legacy-static/`.
They are only moved and are excluded from conversion and compatibility work.
See [migration](docs/migration.md).

[Scheduled updates](docs/scheduled-updates.md) can synchronize sources and open
review PRs with optional bounded free-model or custom OpenAI-compatible drafts.
Scheduling and model requests are opt-in; browser/fixture gates remain pending.

Build a new self-contained skill folder after the workspace build:

```sh
node scripts/bundle.mjs "$PWD" "$PWD/artifacts/bundles/fm-convert"
```

The folder contains fixed dependencies, rules, profiles and license notices.
Invoke its `scripts/fm.mjs` from the project owning the input and output; only
Node 24 is required. No global installation or hosting is performed. Active
evolution requires an owned source checkout; instruction proposals additionally
require trusted portable smoke tests, independent behavioral observations, and
human approval of the full report and exact patch hashes.
