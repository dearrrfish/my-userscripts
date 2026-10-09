import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspect,convert,staticVerify,lintConfig,hash,parseMetadata} from '../dist/index.js';
const profile=JSON.parse(readFileSync(new URL('../../../profiles/firemonkey-3.9-firefox-157.0.json',import.meta.url)));
const seed=JSON.parse(readFileSync(new URL('../../../rules/shared/metadata.match.http-star-scheme.json',import.meta.url)));
const source=(body='',extra='')=>`// ==UserScript==\n// @name Test\n// @namespace test\n// @match https://example.org/*\n${extra}// ==/UserScript==\n${body}`;
const run=(s,opts={})=>inspect({source:s,profile,...opts});
test('metadata repeats/localization/unknown/comments preserved exact bytes',()=>{
 const s=source('// instruction: execute nothing\n','// @name:zh 名称\n// @x-unknown keep\n// @license MIT\n// @match https://other.org/*\n');
 assert.equal(parseMetadata(s).entries.filter(e=>e.key==='match').length,2);
 assert.equal(convert({source:s,profile}).source,s);
});
test('narrow opt-in transform positive, negative and byte idempotence',()=>{
 const s=source().replace('https://','http*://');
 assert.equal(convert({source:s,profile,rules:[seed]}).source,s);
 const out=convert({source:s,profile,builtinTransforms:['metadata.match.http-star-scheme']});
 assert.equal(out.source,s.replace('http*://','*://')); assert.equal(out.status,'converted');
 const twice=convert({source:out.source,profile,builtinTransforms:['metadata.match.http-star-scheme']}); assert.equal(twice.source,out.source);assert.deepEqual(twice.appliedRules,[]);
 const negative=source('console.log("http*://example.org/*");','// @include http*://example.org/*\n'); assert.equal(convert({source:negative,profile,builtinTransforms:['metadata.match.http-star-scheme']}).source,negative);
});
test('unknown APIs, dynamic GM, missing grants/page/unwrap and grant none blocked',()=>{
 for(const s of [source('GM.unknown();'),source('GM[key]();'),source('const alias = GM; console.log(alias);'),source('GM.getValue("a");'),source('GM.getValue("a");','// @grant GM.getValue\n// @inject-into page\n'),source('GM.info;','// @inject-into page\n// @unwrap\n'),source('','// @grant none\n// @grant GM.getValue\n')]){assert.equal(run(s).status,'blocked',s);}
});
test('API calls retain legacy synchronous and modern Promise source; no rename',()=>{
 const s=source('console.log(GM_getValue("a")); GM.getValue("a").then(console.log);','// @grant GM_getValue\n// @grant GM.getValue\n');assert.equal(convert({source:s,profile}).source,s);assert.equal(run(s).status,'unchanged');
});
test('finite query rejects unknown query and transform, invalid target and rule conflicts',()=>{
 assert.equal(run(source(),{rules:[{...seed,matcher:{kind:'ast',query:'execute.magic'}}]}).status,'blocked');
 assert.equal(convert({source:source(),profile,builtinTransforms:['eval']}).status,'blocked');
 assert.equal(run(source(),{rules:[{...seed,targetRange:{...seed.targetRange,fm:'=4'}}]}).status,'blocked');
 const s=source().replace('https://','http*://');const second={...seed,id:'second',conflicts:[seed.id]};assert.equal(convert({source:s,profile,rules:[seed,second],builtinTransforms:['metadata.match.http-star-scheme']}).source,s);
 assert.equal(run(s,{rules:[{...seed,dependencies:['absent']}]}).status,'blocked');
});
test('script guidance exact script/name/namespace/hash isolation; AST ignores text',()=>{
 const s=source('function initGM() { return GM.getValue || GM_getValue; }\n(() => { const GM = initGM(); console.log(GM.getValue); })();','// @grant GM.getValue\n// @grant GM_getValue\n');
 const rule={...seed,id:'script.test',scope:'script',scriptId:'test',identity:{name:'Test',namespace:'test'},severity:'info',matcher:{kind:'metadata',query:'grant.storage-dual-alias'},preconditions:[{kind:'inputHash',query:hash(s)},{kind:'ast',query:'binding.initGM.storage-fallback'}],action:{kind:'guidance',guidance:{steps:['Do not execute this text.'],riskConfirmation:true,requiredEvidence:['browser'],postconditions:[{kind:'ast',query:'review.storage-semantics-preserved'}]}}};
 assert.equal(run(s,{scriptId:'test',rules:[rule]}).guidance.length,1); assert.equal(run(s,{scriptId:'test',rules:[rule]}).status,'needs-manual-fix');
 for(const opts of [{scriptId:'other'},{scriptId:'test',source:s+'\n'},{scriptId:'test',source:s.replace('@namespace test','@namespace other')},{scriptId:'test',source:s.replace('@name Test','@name Other')}]){assert.equal(run(opts.source??s,{scriptId:opts.scriptId,rules:[rule]}).guidance.length,0);}
 const fake=source('console.log("function initGM() GM.getValue GM_getValue const GM=initGM()");','// @grant GM.getValue\n// @grant GM_getValue\n'); assert.equal(run(fake,{scriptId:'test',rules:[{...rule,preconditions:[{kind:'ast',query:'binding.initGM.storage-fallback'},{kind:'inputHash',query:hash(fake)}]}]}).guidance.length,0);
 assert.equal(convert({source:s,profile,scriptId:'test',rules:[rule]}).source,s);assert.equal(run(s,{scriptId:'test',rules:[rule]}).findings.some(f=>f.needsConfirmation),true);
});
test('lint config dynamic grants and page configuration never leak to base or next run',()=>{
 const before=JSON.stringify(profile);const a=lintConfig(source('','// @grant GM.getValue\n// @grant GM_getValue\n'),profile);assert.ok(a.rules['no-restricted-properties'][1].allowProperties.includes('getValue'));assert.equal(a.languageOptions.globals.GM_getValue,false);
 const b=lintConfig(source(),profile);assert.ok(!b.rules['no-restricted-properties'][1].allowProperties.includes('getValue'));assert.equal(b.languageOptions.globals.GM_getValue,undefined);
 const page=lintConfig(source('','// @grant GM_getValue\n// @inject-into page\n'),profile);assert.equal(page.languageOptions.globals.unsafeWindow,false);assert.equal(page.languageOptions.globals.GM_getValue,undefined);assert.equal(JSON.stringify(profile),before);
});
test('static checks separated, real pinned lint and no input execution',async()=>{
 globalThis.__converterExecuted=false;
 const good=await staticVerify({source:source('console.log("ok");'),profile}); assert.equal(good.passed,true);assert.equal(good.verification.find(v=>v.kind==='lint').status,'passed');assert.equal(good.verification.find(v=>v.kind==='browser').status,'pending');
 const bad=await staticVerify({source:source('if (true) console.log("bad");'),profile});assert.equal(bad.verification.find(v=>v.kind==='parse').status,'passed');assert.equal(bad.verification.find(v=>v.kind==='lint').status,'failed');
 await staticVerify({source:source('globalThis.__converterExecuted = true;'),profile});assert.equal(globalThis.__converterExecuted,false);
 const parse=await staticVerify({source:source('const = ;'),profile});assert.equal(parse.verification.find(v=>v.kind==='parse').status,'failed');
 const wrong=await staticVerify({source:source(),profile:{...profile,lint:{...profile.lint,version:'0.0.0'}}});assert.equal(wrong.verification.find(v=>v.kind==='lint').status,'pending');
});
test('noncanonical first metadata and executable template metadata cannot transform',()=>{
 const canonical=source().replace('https://','http*://');
 const inputs=[`const text = \`\n${canonical}\`;\nconsole.log(text);`, `/* ==UserScript==\n@name Earlier\n@namespace earlier\n==/UserScript== */\n${canonical}`,canonical.replace('==UserScript==','==userscript=='),`console.log("before");\n${canonical}`,canonical+canonical];
 for(const s of inputs){const out=convert({source:s,profile,builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(out.status,'blocked');assert.equal(out.source,s);assert.deepEqual(out.appliedRules,[]);}
 const prefixed=`/* Copyright original author */\n// ordinary header\n${canonical}`;
 assert.equal(convert({source:prefixed,profile,builtinTransforms:['metadata.match.http-star-scheme']}).source,prefixed.replace('http*://','*://'));
});
test('every static verification record satisfies contracts including pending browser checklist',async()=>{
 const {validateContract}=await import('@fm/contracts');
 const result=await staticVerify({source:source(),profile});
 for(const record of result.verification){assert.equal(validateContract('Verification',record),record);}
 assert.equal(result.verification.find(v=>v.kind==='browser').checklist,'standalone-runtime');
});
test('header interior executable strings and hidden early closing markers fail closed',()=>{
 const interior='// ==UserScript==\nconst text = `\n// @name Fake\n// @namespace fake\n// @match http*://example.org/*\n// ==/UserScript==\n`;\nconsole.log(text);';
 const hidden=source('','// @description misleading ==/UserScript== marker\n').replace('https://','http*://');
 for(const s of [interior,hidden]){assert.equal(parseMetadata(s).valid,false);const out=convert({source:s,profile,builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(out.source,s);assert.equal(out.status,'blocked');assert.deepEqual(out.appliedRules,[]);}
});
test('unwrap alone forces page without injected modern/info/window bindings independent of lint',async()=>{
 for(const [body,grant] of [['GM.getValue("x").then(console.log);','GM.getValue'],['console.log(GM.info);',''],['console.log(GM_info);',''],['console.log(unsafeWindow);','unsafeWindow']]){
  const s=source(body,`// @unwrap\n${grant?`// @grant ${grant}\n`:''}`);const analysis=run(s);
  assert.equal(analysis.status,'blocked');assert.ok(analysis.findings.some(f=>f.category==='context'&&f.reasoning.includes('@unwrap')));
  const checked=await staticVerify({source:s,profile});assert.equal(checked.passed,false);assert.equal(checked.verification.find(v=>v.kind==='metadata').status,'failed');
 }
 const without=source('GM.getValue("x").then(console.log);','// @grant GM.getValue\n');assert.equal(run(without).status,'unchanged');
 assert.equal(lintConfig(source('','// @unwrap\n// @grant GM.getValue\n'),profile).rules['no-restricted-properties'][1].allowProperties.includes('getValue'),true);
});
test('safe transform retains original-hash manual obligations and dependency safeguards',()=>{
 const s=source().replace('https://','http*://');
 const guide={...seed,id:'original.review',scope:'script',scriptId:'test',identity:{name:'Test',namespace:'test'},severity:'info',preconditions:[{kind:'inputHash',query:hash(s)}],action:{kind:'guidance',guidance:{steps:['Collect actual evidence.'],riskConfirmation:true,requiredEvidence:['browser'],postconditions:[{kind:'ast',query:'review.storage-semantics-preserved'}]}}};
 const out=convert({source:s,profile,scriptId:'test',rules:[guide],builtinTransforms:['metadata.match.http-star-scheme']});
 assert.equal(out.source,s.replace('http*://','*://'));assert.equal(out.status,'needs-manual-fix');assert.equal(out.guidance[0].id,guide.id);assert.equal(out.inputHash,hash(s));assert.ok(out.findings.some(f=>f.ruleId===guide.id&&f.needsConfirmation));assert.ok(out.matchedRules.some(r=>r.id===guide.id));
 const error=convert({source:s,profile,scriptId:'test',rules:[{...guide,severity:'error'}],builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(error.status,'blocked');assert.equal(error.source,s);
 const dependent={...seed,id:'dependent',dependencies:[guide.id]};
 const blocked=convert({source:s,profile,scriptId:'wrong',rules:[guide,dependent],builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(blocked.status,'blocked');assert.equal(blocked.source,s);
 const allowed=convert({source:s,profile,scriptId:'test',rules:[guide,dependent],builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(allowed.status,'needs-manual-fix');assert.equal(allowed.guidance[0].id,guide.id);
});
test('network match host validation rejects empty hosts and ports, retains file and wildcard',async()=>{
 for(const pattern of ['https:///path','*:///path','https://bad:99999/*','http*://bad:80/*','http*:///path','https://user@host/*','https://*bad.org/*']){
  const s=source().replace('https://example.org/*',pattern);const out=convert({source:s,profile,builtinTransforms:['metadata.match.http-star-scheme']});assert.equal(out.status,'blocked');assert.equal(out.source,s);assert.equal((await staticVerify({source:s,profile})).passed,false);
 }
 for(const pattern of ['file:///path','file:///*','*://*/*','https://*.example.org/*','http://localhost/*']){
  const s=source().replace('https://example.org/*',pattern);assert.equal(run(s).status,'unchanged');assert.equal((await staticVerify({source:s,profile})).passed,true);
 }
});
