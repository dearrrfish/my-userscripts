# Exact candidate evidence

```sh
node "<skill-directory>/scripts/fm.mjs" verify --run "RUN" --static
node "<skill-directory>/scripts/fm.mjs" fixtures template --run "RUN"
node "<skill-directory>/scripts/fm.mjs" acceptance template --run "RUN"
```

Templates start pending. Inspect the frozen candidate, profile, suite and all hash bindings. Perform the actual script-specific procedures and record the observer, observation time, statuses and concrete evidence. Evidence command strings describe procedures; the backend never executes them. Do not substitute generic unit tests, synthetic observations or a single “loads successfully” check for target behavior.

Standalone fixtures cover metadata retention, API/context behavior and idempotence. GreasyFork 454120 additionally requires storage compatibility, document-start initialization and unsafeWindow bindings. Its separate browser checklist includes settings/reload, menu/tags/notifications, forum list/reading DOM behavior and console observations in the exact FM/Firefox profile. Use a harmless substitute for write operations or obtain specific authorization for their actual effects.

Recalculate fixture `evidenceDigest` using `fixtureObservationDigest` exported by the runtime `packages/contracts/dist/index.js`: it hashes the entire observation excluding only the digest, recursively sorting keys ordinally and preserving array order. Browser receipts use SHA256 of UTF-8 `JSON.stringify(perStepResults, null, 2) + '\n'`. These are consistency checks, not authenticated human identity. Complete the actual observations before recalculating; do not change bound fields to fit a different run.

```sh
node "<skill-directory>/scripts/fm.mjs" fixtures record --run "RUN" --file ".fm/observations/fixture.json"
node "<skill-directory>/scripts/fm.mjs" acceptance record --run "RUN" --file ".fm/observations/browser.json"
node "<skill-directory>/scripts/fm.mjs" verify --run "RUN" --static
```

Only all five passed verification kinds reach `complete`. Missing observations return 3; failed or stale evidence blocks completion. Immutable receipt history is retained. Any changed output or bound input/resource/tool requires a new run and fresh matching evidence; do not copy prior receipts into a derived release run. Verification does not silently resync remote upstreams.
