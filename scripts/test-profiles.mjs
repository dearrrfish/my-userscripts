import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { validateContract } from '../packages/contracts/dist/index.js';
import { lintConfig, staticVerify } from '../packages/converter/dist/index.js';
const profile=validateContract('TargetProfile',JSON.parse(await readFile(new URL('../profiles/firemonkey-3.9-firefox-157.0.json',import.meta.url),'utf8')));
const input='// ==UserScript==\n// @name Profile test\n// @namespace test\n// @match https://example.org/*\n// @grant GM.getValue\n// ==/UserScript==\nGM.getValue("key").then(console.log);\n';
const before=JSON.stringify(profile);
assert.ok(lintConfig(input,profile).rules['no-restricted-properties'][1].allowProperties.includes('getValue'));
const result=await staticVerify({source:input,profile});
assert.equal(result.passed,true,JSON.stringify(result.findings));
assert.equal(JSON.stringify(profile),before);
assert.equal(result.verification.find(v=>v.kind==='browser').status,'pending');
// These APIs are grant-gated in the pinned api-gm.js implementation. Test both
// accepted sandbox use and rejected page use so adding capabilities cannot
// accidentally make them available in every context.
for (const name of ['GM_xmlhttpRequest','GM.xmlHttpRequest','GM_addStyle','GM.addStyle','GM_setClipboard','GM.setClipboard','GM_download','GM.download','GM_log','GM.log']) {
  const capability=profile.capabilities.api.find(api=>api.name===name);
  assert.equal(capability?.status,'supported');
  assert.deepEqual(capability.contexts,['user-script']);
  const code=input.replace('// @grant GM.getValue',`// @grant ${name}`).replace('GM.getValue("key").then(console.log);',`console.log(${name});`);
  const checked=await staticVerify({source:code,profile});
  assert.equal(checked.passed,true,JSON.stringify(checked.findings));
  const page=await staticVerify({source:code.replace('// ==/UserScript==','// @inject-into page\n// ==/UserScript=='),profile});
  assert.ok(page.findings.some(f=>f.category==='context' && f.reasoning.includes('unavailable in page')));
}
console.log('Pinned profile schema, per-run grants, exact lint and isolation passed; browser pending.');
