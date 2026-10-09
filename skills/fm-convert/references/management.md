# Configured upstreams and local release

Use a workspace-owned JSON configuration matching runtime `packages/contracts/schemas/RepositoryConfig.schema.json` in a source checkout, or the contract definitions shipped in the runtime. Configure project upstream, script identity, relative output root/path, acceptance checklist and optional publication policy before conversion; configuration bytes are bound to the run.

```sh
node "<skill-directory>/scripts/fm.mjs" config validate --config "scripts.json"
node "<skill-directory>/scripts/fm.mjs" sync --config "scripts.json" --project "PROJECT"
node "<skill-directory>/scripts/fm.mjs" convert --input ".fm/sources/HASH.user.js" --output "artifacts/converted/SCRIPT.user.js" --target firemonkey-3.9-firefox-157.0 --script-id "SCRIPT" --config "scripts.json"
```

For a local upstream, conversion instead uses its configured canonical local input path. URL sources use the explicitly synchronized hash snapshot. Git sources require a full commit ID and source path; the tool reads a bounded bare fetch without checkout, hooks or builds, and requires a local Git executable. Preserve exact configured name/namespace; do not guess identity or silently rebind an upstream. Explicit sync creates `source.lock.json` and captures dependency hashes. Changed remote dependencies block until deliberate resync. URLs reject credentials, query and fragment; caches and raw source remain private `.fm/` data.

Publication defaults to disabled. A `local` policy needs actual base URL, license evidence and numeric major/revision settings before conversion. License evidence is a readable hash-matching local file or previously captured URL bytes; do not infer permission from an absent license. Local release creates files; it does not upload, commit or publish externally.

```sh
node "<skill-directory>/scripts/fm.mjs" prepare-release --config "scripts.json" --script "SCRIPT" --run "COMPLETE_ORIGINAL_RUN" --stage candidate
# Perform fresh exact fixtures and browser acceptance for the returned derived run.
node "<skill-directory>/scripts/fm.mjs" prepare-release --config "scripts.json" --script "SCRIPT" --run "COMPLETE_DERIVED_RUN" --stage finalize
```

Preparation requires an original complete run. It freezes only version/downloadURL/updateURL changes, preserves original upstream provenance, reserves a stable numeric `major.revision` and resets derived-run observations. Finalization requires complete evidence for those exact new bytes. Only canonical decimal dotted upstream versions are supported; prerelease or ambiguous versions fail closed. Existing unrelated/modified release files cause a collision. Inspect reported local artifacts before separately authorizing hosting or upload.
