# Portable FM conversion runtime

Build the repository first with the pinned Node 24.21.x and pnpm 12.3.4 toolchain. Then run:

```sh
node scripts/bundle.mjs "$PWD" "$PWD/artifacts/bundles/fm-convert-local"
```

The output directory must be new and inside this checkout's ignored `.fm/` or `artifacts/` directory. The builder reserves it exclusively. A completed `runtime/bundle-manifest.json` is the commit marker: failed or interrupted reservations have no valid manifest and cannot be used. Failed reservations remain for inspection; use a different output directory to retry. This does not claim simultaneous atomic visibility of every file to external readers.

The result is a discoverable skill folder containing `SKILL.md`, its resources and a nested self-contained `runtime/`. It preserves package-relative pnpm symlinks, compiled workspace packages, the CLI shim, exact profiles/rules, the lockfile and trusted runner files. It copies the complete pinned pnpm dependency closure, including development dependencies; no package installation or network access is needed to invoke the result. Stores, task caches and source logs are excluded. A compatible Node executable remains a prerequisite; the runtime rejects Node outside `>=24.21.0 <25`.

Move or copy the entire skill folder together. Its launcher verifies every recorded regular file's hash and every relative internal symlink before importing the CLI. Additional, missing, changed, absolute, dangling or escaping links are rejected. Manifest validation is an integrity check against the provided manifest, not cryptographic publisher authentication. Do not edit the installed bundle in place. Build a fresh bundle for changes. This project does not install anything into global skill directories.

The dependency inventory is `runtime/licenses/inventory.json`; original dependency license/notice files remain at their recorded paths. FireMonkey profile source material retains its MPL-2.0 license and provenance notice. The inventory records undeclared dependency licenses without inventing a grant. The tool itself has no declared license; bundling does not grant redistribution rights for that tool code. Audit these records before distributing a bundle.

From an unrelated working directory, the skill launcher takes the ordinary CLI arguments. Input/output paths belong to that working directory, and its ignored `.fm/` holds run evidence:

```sh
node /path/to/fm-convert-local/scripts/fm.mjs convert \
  --input input.user.js --output candidate.user.js \
  --target firemonkey-3.9-firefox-157.0
```

Conversion success can still mean `pending-browser`. Fixture and actual Firefox/FireMonkey observations must bind the exact candidate before a run is complete. The portable copy supports conversion and evidence collection; active evolution belongs to the source checkout.

## Trusted candidate verification

`verifySkillCandidate` in `scripts/portable-runner.mjs` accepts full canonical resource text, optional validated rule overlays and a new audit location inside the source workspace's `.fm/`. It builds an isolated portable candidate and invokes trusted CLI host code from an unrelated directory containing spaces. It never runs userscript JavaScript or proposed executable resources. No package manager or network command is spawned. Proposed skill resources receive structural frontmatter/reference checks; these are not proof of an agent's decisions.

The frozen `fixtures/portable/skill-forward.json` defines five mandatory cases. Four machine cases exercise offline standalone conversion, dynamic API blocking, pending browser evidence and stale candidate rejection. A deterministic digest binds their outputs/statuses, full candidate resource identity, suite content and trusted runner/builder/fixture bytes. Run IDs, times and absolute temporary paths do not enter this digest.

The fifth case requires independent qualitative forward observation about human approval. `raw-requests.json` contains the requests and self-owned fixtures without intended answers or machine conclusions. Give the evaluator those requests, the candidate skill and its resources. `machine-observations.json` leaves that qualitative case pending. Neither successful smoke tests nor keyword checks can supply a passed behavior receipt or authorize applying a proposal.

Run the offline portable checks after building all packages:

```sh
node scripts/test-portable.mjs
```

These tests use only synthetic self-owned inputs. They do not claim the development target has passed real Firefox/FireMonkey acceptance.
