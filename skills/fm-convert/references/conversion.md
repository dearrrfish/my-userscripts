# Local conversion and diagnostic decisions

From the intended output workspace, run:

```sh
node "<skill-directory>/scripts/fm.mjs" convert --input "input.user.js" --output "converted.user.js" --target firemonkey-3.9-firefox-157.0
```

The input and output must resolve within that workspace, including through symlinks. An unrelated project can use a portable bundle by its absolute launcher path. For a loose input, choose its containing directory as workspace. Existing outputs are not overwritten: choose a new destination for a new conversion. Conversion captures immutable inputs and audit before candidate installation. `--dry-run` records diagnostics without a candidate and cannot be accepted.

The shipped profile pins FireMonkey 3.9, Firefox 157.0 and ESLint 10.11.0. Profile capabilities and rules, rather than recalled generic GreaseMonkey behavior, decide support. Read the selected runtime `profiles/` and `rules/` entries for the actual diagnostic. Shared rules apply broadly; script rules require configured exact identity and applicable hashes/AST conditions. The only current explicit safe transform opt-in is `--transform metadata.match.http-star-scheme`, replacing validated invalid `http*://` schemes with `*://`. Diagnosing rules remain diagnoses unless explicitly selected and validated; unknown transforms fail.

Inspect the canonical leading comment metadata header, grant declarations and actual API calls together. Preserve name, namespace, localized/repeated fields, author, license, copyright and unknown metadata. Do not fix malformed or hidden headers by interpreting string/block-comment lookalikes as authoritative metadata. Resolve match syntax and lint diagnostics against the pinned profile; avoid unrelated wholesale lint rewrites.

GM APIs vary by manager, injection context and synchronization semantics. Do not mechanically alias `GM_getValue` to Promise-returning `GM.getValue`, add every grant, or remove an intentional compatibility fallback. Trace storage initialization, awaiting, defaults and call sites. Page/unwrap contexts do not expose the same injected GM bindings as sandbox contexts; unsafeWindow and document-start need actual runtime checks. Dynamic API access or unsupported/unknown APIs require manual diagnosis; adding grants cannot establish support. Do not evaluate the input to discover behavior.

Exit 0 from conversion means a static-passing candidate whose browser/fixture evidence is still pending. Exit 2 means blocked/manual diagnostics; exit 1 means a tooling/configuration failure. Inspect the returned JSON manifest’s `result.findings` and `guidance` for concrete blocked/manual diagnostics; the Markdown state summary alone is insufficient. Summarize the concrete issues without treating repeated entries as additional independent failures. Report those diagnostics and concrete limitations. A script that remains blocked must not be labelled repaired. Dependency bytes are captured and hashed without execution; explicit sync governs remote freshness.
