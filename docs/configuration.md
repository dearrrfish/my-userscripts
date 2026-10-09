# Repository configuration

The CLI supports repository configuration, source synchronization, conversion, static verification, fixture/browser observations, reviewed local evolution, and local release preparation/finalization. The standalone SKILL bundle provides conversion from an unrelated working directory. Active evolution requires the source checkout; hosting/upload and scheduled CI/model-provider integration remain deferred. Unsupported commands fail explicitly.

Use the schema in `packages/contracts/schemas/RepositoryConfig.schema.json`. `outputRoot` and script `outputPath` are relative to the selected workspace (the invocation directory). Paths, local sources, config, receipts, snapshots, and outputs must remain inside that directory after resolving symlinks. Candidate installation writes an exclusively owned temporary file in the destination directory, closes it, then uses an atomic hard link to publish complete bytes without replacing an existing file. Failed writes or installs clean only that owned temporary file; unrelated destinations remain intact. Filesystems must support same-directory hard links; unsupported installation fails safely. Existing candidate files are never overwritten: choose a new output path/config entry for a new revision. Inputs and outputs cannot overlap.

```
pnpm fm config validate --config config/scripts.example.json
pnpm fm sync --config config/scripts.example.json --project greasyfork-454120
pnpm fm convert --input .fm/sources/<sha256>.user.js --output artifacts/converted/greasyfork-454120.user.js --target firemonkey-3.9-firefox-157.0 --script-id greasyfork-454120 --config config/scripts.example.json
```

`local` projects read `upstream.path/sourcePath`. `url` projects download one direct userscript and cannot specify `sourcePath`. `git` projects require a full 40-character commit and a source path: a bounded bare fetch reads that commit with `git show`, without checking out files or running upstream hooks. Git requires the local git executable. HTTP sources accept no credentials, queries, or fragments; redirects receive the same validation. Downloads have a 15-second request timeout and 2 MiB body limit. No upstream builds, hooks, dependency scripts, or userscript code are executed.

Sync creates immutable hash-addressed `.fm/sources/` snapshots and a schema-validated `source.lock.json`. Equal bytes and origin reuse the previous retrieval metadata, producing a stable lock on repeated sync. Retrieval timestamps describe capture time, never file mtime. URL/git conversions must match the synchronized lock; local conversions must use the configured canonical local file. Every configured source must match its exact name/namespace identity. Changes require explicit rebinding; the CLI does not guess identity.

Standalone conversion requires only `--input`, `--output`, and `--target`. Built-in profiles and rules resolve relative to the CLI distribution directory, not the working directory. A standalone invocation can use shared rules; configured script rules additionally require exact script identity. Profiles are selected by built-in ID (or its JSON filename). Absolute external profiles and implicit outside-directory reads are unsupported.

Conversion captures `@require` and `@resource` HTTP dependency bytes without executing them, and binds their hashes to the run. Sync records exact dependency URLs/hashes alongside source snapshots; conversion compares newly downloaded dependency bytes with the synchronized lock and blocks changed dependencies until an explicit resync. Each run records current tool code, workspace dependency lock (when present), target, rules, available SKILL, checklist, config, source-lock and artifact hashes. SKILL identity covers its entrypoint, references, UI metadata, launcher and other resources. Added, removed or changed resources invalidate old runs, as do changes to the bound trusted runner and runtime modules.

Raw snapshots, caches, events, receipts, and reports remain under ignored `.fm/`; configured `artifacts/` remains ignored. Never commit raw logs. The CLI persists audit events before writing output and fails closed if persistence is unavailable. Error messages omit raw exceptions and URLs. `--dry-run` writes source capture, reports and audit events, but no candidate file, and cannot receive acceptance.

The only explicit built-in transform opt-in currently supported is `--transform metadata.match.http-star-scheme`. It changes invalid `http*://` match schemes to `*://` under the converter's validated conditions. Diagnosing seed rules remain diagnosing; the CLI does not silently turn them into transforms. Unknown transform IDs are rejected. Network dependencies retain exact binary bytes and SHA256; JavaScript inputs reject invalid UTF-8. Sync and standalone conversion both capture dependencies; their bytes remain ignored and are never executed.

After a run is complete, local publication uses two stages:

```sh
pnpm fm prepare-release --config config/scripts.example.json --script greasyfork-454120 --run <complete-run> --stage candidate
# Perform and record fresh fixture/browser checks for the returned derived run.
pnpm fm prepare-release --config config/scripts.example.json --script greasyfork-454120 --run <complete-derived-run> --stage finalize
```

The example publication policy remains disabled. Configure `local` with actual license evidence and host URLs before conversion, so the configuration itself is bound to the run. Finalization creates local files only; hosting/upload is separate. See [release](release.md).

Explicit evolution commands operate on complete runs and concrete drafts:

```sh
pnpm fm evolve propose --run <complete-run> --draft <draft.json> --replay-run <other-complete-run>
pnpm fm evolve approval-template --proposal <proposal-id>
# The human reviews the full report and deliberately completes exact approval hashes.
pnpm fm evolve apply --proposal <proposal-id> --approval <approval.json>
pnpm fm evolve reject --proposal <proposal-id>
```

Without `--draft`, a complete source-checkout run returns `no-proposal`. No changes are invented. Active evolution must use the source checkout as its workspace. For a skill/both draft, run `evolve behavior-template` with the same run/draft/replay arguments, then collect independent observations and exact report/artifact bytes; pending templates do not count as observations. PR approvals remain gated. See [evolution](evolution-process.md) and [portable packaging](portable.md).
