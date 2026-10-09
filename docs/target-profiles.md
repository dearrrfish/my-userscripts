# Target profiles

`profiles/firemonkey-3.9-firefox-157.0.json` pins FM v3.9 at commit
`8da260defe9857d4c8461f8fb78a18ee22f9e62f` and Firefox 157.0, sampled
2026-10-04 from official sources. It does not track latest. The FM manifest
requires Firefox >=128.0, but other combinations require a separate profile.
[Provenance and SHA256 inputs](../profiles/NOTICE.md) include the release
(ESLint 10.11.0), tag, Mozilla versions, help and extraction sources.

Capabilities distinguish supported, unsupported and unknown. Supported APIs
are grant-gated except GM.info/GM_info. Both modern and legacy storage aliases
exist; that does not make their synchronous/Promise semantics interchangeable.
The user-script context is the grant-capable context. `@inject-into page`
clears API grants (meta.js and userscript.js); page injection only supplies
unsafeWindow and info when unwrap is false, not the storage/menu APIs
enumerated for user-script. With unwrap true the page wrapper is bypassed;
these wrapper-provided bindings are not promised.
FM ignores namespace as runtime metadata, while the converter retains it for
precise source identity. License metadata remains provenance. Unknown APIs
must be assessed explicitly and never receive speculative shims.

The embedded ESLint config is the upstream default **base**, statically
extracted without executing upstream code. It merges recommended/fireMonkey
rules (96) and default globals (1260). It is not the complete per-script lint
configuration. A future runner must reproduce editor.js checkGrant (lines
350–385): deduplicate grants, exclude unsupported names, treat grant none as
empty, add GM_ grant globals as false/read-only, and extend
no-restricted-properties[1].allowProperties with GM. property names.
For page injection, add unsafeWindow and return the page configuration;
GM info defaults remain in the base. Never mutate the stored base across runs.
FM user preference overrides are outside this default profile; capture them
in a separate explicit profile if used. Source hashes bind all inputs.

The source lock for GreasyFork 454120 pins v98, name
南加北加论坛强化脚本(凛+), namespace tousakarin, author 遠坂凛 and source
SHA256 d9a695411c681a12c494de131b580f22c2943f237689a8aea5fe8a07b97b62fb.
The original 761051-byte MIT source remains an ignored run snapshot; no full
copy is tracked. The retrieval timestamp comes from that snapshot's file stat.
An empty dependency list records no external @require/@resource dependencies
in this pinned source, not a promise that future versions have none.

W1 verification checks schema relationships, source hashes and base counts.
It does not establish runtime compatibility or browser acceptance.
# VERIFY: execute unchanged source baseline and exact candidate acceptance in
real Firefox 157.0 + FireMonkey 3.9 before claiming repaired behavior.

Replay source checks from the repository root after building @fm/contracts:

```sh
node fixtures/rules/verify-profile.mjs --upstream .agent-team/runs/fm-converter-w1/upstream --source .agent-team/runs/fm-userscript-converter/reports/dev-target.user.js
```

Both snapshot paths are explicit arguments. Callers may supply identical
snapshots from another directory; copying them does not invalidate recorded
capture timestamps. SourceLock timestamp validation uses the contract, not
current filesystem mtime. Missing/invalid arguments produce usage and exit 2.
The immutable source URLs and SHA256 manifest in profiles/NOTICE.md identify
FM collection inputs; config/sources/greasyfork-454120.lock.json identifies
the script URL and exact bytes. Release/Mozilla API captures are temporal
snapshots and must match the manifest, even when their live URLs have changed.
The derived lint-base.json must also match its recorded hash. This verification
helper neither downloads sources nor executes upstream JavaScript.
