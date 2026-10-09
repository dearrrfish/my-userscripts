# Verification and human receipts

A successful `convert` exits 0 when it produces a candidate passing parse, metadata and pinned lint checks. Its state remains `pending-browser`; this does not establish FireMonkey runtime compatibility. Diagnostics/guidance return 2 and require manual review. Tool/configuration failures return 1. Missing human acceptance or regression evidence returns 3 from verification. Outputs include deterministic JSON and Markdown report paths within the run directory.

```
pnpm fm verify --run <run-id> --static
pnpm fm acceptance template --run <run-id>
pnpm fm acceptance record --run <run-id> --file .fm/runs/<run-id>/my-observations.json
```

Templates contain mandatory, initially pending cases. Edit the template deliberately: set the verifier name, actual time, each observed status and evidence. Set `evidenceDigest` to SHA256 of `JSON.stringify(perStepResults, null, 2) + '\n'` (UTF-8). The CLI validates the digest as a consistency check, not as cryptographic proof of a human. It accepts pending/failed observations without inventing passes; it rejects missing/altered mandatory cases, default passed observations, and stale bindings. Every submitted receipt is retained as an immutable numbered artifact; the current receipt pointer is separate.

GreasyFork 454120 requires actual Firefox/FireMonkey installation; document-start initialization; menu, tags and notifications; settings/storage/reload; forum list and reading DOM enhancement; unsafeWindow interaction; and console observations. Use the exact frozen candidate and recorded target versions. Do not replace this checklist with a single “loaded successfully” assertion. Write operations require a defined harmless substitute or specific user authorization. Synthetic CLI fixtures exercise validation only and never count as real target evidence.

Verification rechecks current candidate, captured source, configured local source, available tool/dependency lock files, dependency snapshots, config/source lock, profile, rules and SKILL hashes. Editing any candidate byte or bound input requires a new run. Upstream remote freshness is established by an explicit new sync; verification does not silently download a new upstream or dependency revision.

The SKILL identity includes its entrypoint, references, invocation metadata and launcher resources. Adding/removing/editing those resources invalidates existing observations. Trusted bundle/portable-runner/frozen-case files also participate in tool bindings. Portable bundles verify their complete file/link manifest before CLI use; these hashes provide consistency and freshness rather than publisher authentication.

Exact-output fixture observations are recorded separately with `fixtures template --run <run-id>` and `fixtures record --run <run-id> --file <observation.json>`. See [fixture evidence](fixture-evidence.md) for the authoritative full-observation digest and mandatory suites. Commands in evidence are descriptions and are never executed. Only passed parse, metadata, lint, fixture and browser records for the same frozen bytes reach `complete`. Later `verify` and browser submissions preserve validated fixture evidence. Generic converter unit tests cannot attest behavior of arbitrary userscripts.

The CLI unit tests use self-owned synthetic scripts, controlled HTTP downloads and synthetic receipt observations. `scripts/test-privacy.mjs` runs the redaction, no-execution, path and log-persistence checks. These checks do not run Firefox/FM or establish that the real development target works.
