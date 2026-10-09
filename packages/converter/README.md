# Deterministic converter

Named API exports `inspect(input)`, `convert(input)` and async `staticVerify(input)`.
Input includes source bytes as a UTF-8 string, validated TargetProfile, optional
Rule array and scriptId. Conversion accepts optional builtinTransforms; the
only implemented transform ID is `metadata.match.http-star-scheme`. It changes
only parsed @match http*:// schemes with valid host/path to *://. Diagnose seed
rules stay diagnose-only. Input JavaScript and guidance text are never executed.

Analysis returns inputHash, preserved metadata entries with value offsets,
findings, matchedRules, guidance and status (unchanged, converted,
needs-manual-fix, blocked). Conversion also returns source, outputHash and
appliedRules. Guidance always requires human review; evidence postconditions
remain pending. Script rules require exact ID/name/namespace/inputHash.
Unknown finite queries, transforms, APIs and dynamic references fail closed.
The capability profile is a subset, so an absent API is unknown, not unsupported.

staticVerify returns findings, hash-bound verification and passed (only the
parse/metadata/lint static stages). It uses the exact configured ESLint version,
clones the pinned base and applies per-script grants. Fixture/browser evidence
remain pending for the caller. This API never claims runtime compatibility or
complete acceptance. Lint failure does not imply an FM runtime defect.

The supported metadata input is one canonical leading `// ==UserScript==`
header with exactly one name/namespace. It must agree with FM's first detected
block. Block-style, differently cased, multiple or executable-string headers
are conservatively blocked; automatic transforms never modify template literals
or metadata following executable statements. This narrower accepted format is
intentional because FM's text regex also recognizes markers inside program text.
Unknown metadata and known profile entries with unknown status are retained as
opaque data without a runtime-support claim; unsupported entries are diagnosed,
except ignored namespace retained for identity. The profile is incomplete.
Pending standalone browser verification uses checklist `standalone-runtime`;
repository callers replace it with their configured acceptance checklist.
Every line inside the accepted header must also be whitespace or a // comment;
FM's first regex must end at the same closing marker. Marker text hidden in
metadata values or executable code inside the header is blocked unchanged.

Runtime context analysis is independent of the editor's grant-derived lint:
`@unwrap` forces page injection and removes wrapper-provided GM, GM_info and
unsafeWindow bindings even without explicit `@inject-into page`. Original-input
hash-bound manual guidance remains an unresolved obligation after safe metadata
changes; changing a hash never proves review postconditions or grants approval.

Match validation implements a conservative documented subset: network patterns
require a nonempty hostname with no port or credentials; file patterns retain
an empty host, and whole-host or leading `*.` wildcards are supported. The same
validator bounds builtin transforms. Unmodeled host forms block conservatively;
this is not a substitute for browser match-pattern acceptance.
