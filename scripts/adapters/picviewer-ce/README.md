# Picviewer CE+ pinned adaptation

These authored transforms recreate the human-tested `2026.9.29.1` candidate from
upstream SHA256 `0583af3f0ab35df661b166c8588e034596e2cf96fdd31d1efb38d29088d8054d`.
They retain the Gallery style-node and same-document settings fixes. Third-party
source, caches, generated scripts and logs remain under ignored `.fm/` and
`artifacts/`; only adaptation tools and their self-authored fixtures are tracked.

From the repository root, after installing the locked dependencies:

```sh
pnpm build
node packages/cli/src/main.mjs sync --config config/scripts.picviewer-ce.json --project greasyfork-24204
node scripts/adapters/picviewer-ce/rebuild.mjs
node packages/cli/src/main.mjs sync --config config/scripts.picviewer-ce.adapted.json --project greasyfork-24204
node packages/cli/src/main.mjs convert --input .fm/adaptations/picviewer-ce/candidate.user.js --output artifacts/converted/greasyfork-24204-settings-fix.user.js --target firemonkey-3.9-firefox-157.0 --script-id greasyfork-24204 --config config/scripts.picviewer-ce.adapted.json
```

Rebuild refuses a changed upstream or edited existing candidate. Both an
intermediate checkpoint and final SHA256 are checked; expected final bytes are
`13cb48ebe60a0d35480cafaa1e8bd63abaf0bf7bda7e29ff96c99fd366168630`.
`equality-seed.js` freezes the initial authored helper used by the intermediate
checkpoint; `manual.mjs` replaces it with the reviewed final helper. This keeps
the reviewed transformation sequence reproducible.

The tests execute only authored helpers and synthetic fixtures. Supplied script
and dependency bytes are parsed as data, never evaluated. Final CLI conversion
performs pinned static verification and dependency capture. An existing output
is never replaced: use a new configured output path for a new revision.
Changed upstream bytes require a new review, rather than relaxing the hashes.

Gallery startup and settings open/tabs/save/close/reopen were confirmed manually
for the final artifact. Full browser/fixture acceptance remains pending.
