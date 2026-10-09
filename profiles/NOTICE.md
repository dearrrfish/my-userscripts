# FireMonkey profile provenance

Profile firemonkey-3.9-firefox-157.0 pins commit `8da260defe9857d4c8461f8fb78a18ee22f9e62f`, sampled 2026-10-04. FM manifest minimum Firefox is 128.0; this profile validates only 157.0. Mozilla versions snapshot reported 157.0. API latest-release snapshot reports v3.9; older cached web v3.8 is not the pin.

Derived lint configuration is MPL-2.0 material from erosman/firemonkey; upstream copyright and license are preserved in [firemonkey-MPL-2.0.txt](licenses/firemonkey-MPL-2.0.txt). No upstream JavaScript was executed.

| Input | Source | SHA256 |
| --- | --- | --- |
| fm-release.json | https://api.github.com/repos/erosman/firemonkey/releases/latest | `511eb43a6541b042da90ff5f2e254a9be5091815f4114ca446687d21aa1c3cc2` |
| fm-tag-v3.9.json | https://api.github.com/repos/erosman/firemonkey/git/refs/tags/v3.9 | `232baba5570fbe06c33a4ee6b099da71131bc3ce220d756f07dfaa0aa86fbb99` |
| firefox-versions.json | https://product-details.mozilla.org/1.0/firefox_versions.json | `15ceba8b436f4fff9e8d07fbfcfd450a7dc15567cec68cf0d1d54cb69f438481` |
| manifest.json | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/manifest.json | `c3b7e3bb7ede96e005c315ba330867b0ae797c6ada381a0c593fec2429bb0a4b` |
| api-gm.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/api-gm.js | `b9a73579ced143768db7693ef3bdff5aea8c2d490ca8eca263396104bd7d008d` |
| api.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/api.js | `eb756c8217872b4ec7a2eb87d29fef96a8a65b93096b93467e88578ec01f0302` |
| meta.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/meta.js | `94436d06b72627b18ff9efbc3ddcd5440c3dc5c8ce8be20daebd8fef22735c70` |
| editor-rules.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/editor-rules.js | `4e18a92c2fe51bf074dff88100490d1edeeeecb8447873db27845df86b18248c` |
| editor-config.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/editor-config.js | `afff37ac69562a3630280039d1918eeda8c5e81c233a72c2db24b5742aa2da21` |
| editor-globals.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/editor-globals.js | `3cd5a44a14a95fdb54a272dc271ec16361c5874ef658dd147e3511de882531e1` |
| editor.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/editor.js | `32e4efd1090d99d2a76d1dd2a43fec488a91d128fb8709e3525ae9f5cb0e27f7` |
| userscript.js | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/userscript.js | `9e5416cac98cadcca2c5862b64a9d14bbf1b27d27c933198012f581ae97ba3e0` |
| help.html | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/src/content/help.html | `5ffba287528ea94536aee28b8a525fcb8837356742bf90d86a8d99db6ae0ea54` |
| LICENSE | https://raw.githubusercontent.com/erosman/firemonkey/8da260defe9857d4c8461f8fb78a18ee22f9e62f/LICENSE | `1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5` |
| lint-base.json | Local static TypeScript AST extraction (not upstream file) | `54912837bec770a00220504fa2ec807406348417cc605f3e59733817df10a8be` |

The ignored snapshots remain in run `fm-converter-w1/upstream`; hashes above identify their exact bytes. `lint-base.json` was extracted by the coordinator through TypeScript AST literal traversal of editor rules/config/globals: recommended + fireMonkey merge, 96 merged rules and 1260 globals. Dynamic grant processing and user overrides are excluded. The profile embeds that base verbatim; lint.sourceHash identifies editor-rules.js, while this table binds every extraction input and the derived result.
