import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareCandidate,finalizeRelease,compareMozillaNumericVersions } from '../../dist/release/index.js';
import { fixtureSuite,fixtureObservationDigest } from '../../dist/verification/fixtures.js';
import { staticVerify,parseMetadata } from '@fm/converter';
const sha=v=>createHash('sha256').update(v).digest('hex');const json=v=>JSON.stringify(v,null,2)+'\n';
const workspace=process.cwd();
async function setup(){
 const root=await fs.mkdtemp(path.join(workspace,'.fm/release-test-'));const runDir=path.join(root,'.fm','runs','original');await fs.mkdir(runDir,{recursive:true});
 const profile=JSON.parse(await fs.readFile(path.join(workspace,'profiles/firemonkey-3.9-firefox-157.0.json'),'utf8'));profile.lint.config.rules={}; // Synthetic profile tests state safety; no claim of real FM compatibility.
 const source='// ==UserScript==\n// @name Synthetic release fixture\n// @namespace fixture.release\n// @version 98\n// @license MIT\n// @match https://example.com/*\n// @grant none\n// @description:zh 保留\n// @custom untouched\n// ==/UserScript==\nvoid 0;\n';
 const suite=fixtureSuite('synthetic-release');const steps=[{id:'runtime',mandatory:true}];const result={schemaVersion:1,runId:'original',state:'complete',inputHash:sha(source),outputHash:sha(source),targetHash:sha(json(profile)),rulesHash:sha(json([])),skillHash:sha(''),toolVersion:'0.1.0',dependencyHashes:{},findings:[],appliedRules:[],verification:[]};
 await fs.mkdir(path.join(root,'profiles'));await fs.mkdir(path.join(root,'rules'));await fs.writeFile(path.join(root,'profiles',profile.id+'.json'),json(profile));
 const context={workspaceRoot:root,bundleRoot:root,runDir,source,candidate:source,result,profile,profileSource:json(profile),rules:[],rulesSource:json([]),identity:{name:'Synthetic release fixture',namespace:'fixture.release'},scriptId:'synthetic-release',checklistId:'synthetic-runtime',checklistHash:sha(json(steps)),mandatoryBrowserSteps:steps,fixtureSuiteId:suite.id,fixtureSuiteHash:suite.hash,mandatoryFixtureCases:suite.cases};
 await fs.writeFile(path.join(root,'LICENSE.txt'),'Synthetic MIT fixture permission evidence');
 const script={id:'synthetic-release',sourceManager:'fm',outputPath:'synthetic.user.js',identity:context.identity,acceptance:{checklistId:context.checklistId},publish:{mode:'local',baseUrl:'https://example.com/releases/',licenseEvidence:{kind:'fixture',reference:'LICENSE.txt',hash:sha('Synthetic MIT fixture permission evidence'),description:'Synthetic test evidence only'},versionMajor:99,initialRevision:0}};
 const config={schemaVersion:1,outputRoot:'published',targetProfile:profile.id,projects:[{id:'synthetic-project',upstream:{kind:'url',url:'https://example.com/source.user.js'},scripts:[script]}]};context.config=config;context.configPath=path.join(root,'scripts.json');context.configHash=sha(json(config));await fs.writeFile(context.configPath,json(config));
 for(const relative of ['packages/cli/dist/index.js','packages/converter/dist/index.js','packages/contracts/dist/index.js','packages/evolution/dist/index.js','packages/cli/dist/nested/helper.js','pnpm-lock.yaml']){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'Synthetic runtime '+relative);result.dependencyHashes[relative]=sha(await fs.readFile(file));}
 await evidence(context);
 return {root,context,script,releaseRoot:'published',auditDir:'.fm/audit'};
}
async function evidence(c){
 const r=c.result;c.runDir=path.join(c.workspaceRoot,'.fm/runs',r.runId);const common={schemaVersion:1,runId:r.runId,outputHash:r.outputHash,dependencyHashes:r.dependencyHashes,targetHash:r.targetHash,rulesHash:r.rulesHash,skillHash:r.skillHash,toolVersion:r.toolVersion,verifier:'Synthetic test actor; not real Firefox',timestamp:new Date().toISOString(),confirmationSource:'cli'};
 const steps=c.mandatoryBrowserSteps.map(s=>({...s,status:'passed',evidence:'Synthetic observation only'}));c.receipt={...common,checklistId:c.checklistId,checklistHash:c.checklistHash,perStepResults:steps,evidenceDigest:sha(json(steps))};
 const fixture={...common,inputHash:r.inputHash,suiteId:c.fixtureSuiteId,suiteHash:c.fixtureSuiteHash,cases:c.mandatoryFixtureCases.map(x=>({...x,status:'passed',command:'Synthetic test procedure; no input execution',evidence:'Synthetic assertion only'}))};c.fixture={...fixture,evidenceDigest:fixtureObservationDigest(fixture)};
 const checked=await staticVerify({source:c.candidate,profile:c.profile});assert.equal(checked.passed,true);r.verification=checked.verification.map(v=>v.kind==='browser'?{...v,status:'passed',evidenceDigest:c.receipt.evidenceDigest}:v.kind==='fixture'?{...v,status:'passed',evidenceDigest:c.fixture.evidenceDigest}:v);
 await fs.mkdir(c.runDir,{recursive:true});await fs.writeFile(path.join(c.runDir,'source.user.js'),c.source);await fs.writeFile(path.join(c.runDir,'candidate.user.js'),c.candidate);await fs.writeFile(path.join(c.runDir,'acceptance.json'),json(c.receipt));await fs.writeFile(path.join(c.runDir,'fixture.json'),json(c.fixture));const manifest={schemaVersion:1,root:c.workspaceRoot,scriptId:c.scriptId,identity:c.identity,result:r,fixtureSuite:{id:c.fixtureSuiteId,hash:c.fixtureSuiteHash,cases:c.mandatoryFixtureCases},checklistId:c.checklistId,checklistHash:c.checklistHash,steps:c.mandatoryBrowserSteps,configPath:c.configPath,configHash:c.configHash,parentRunId:c.parentRunId,releaseReservationId:c.releaseReservationId,releasePolicyHash:c.releasePolicyHash,materialized:true,dryRun:false,outputPath:path.join(c.runDir,'candidate.user.js'),dependencies:[]};await fs.writeFile(path.join(c.runDir,'manifest.json'),json(manifest));
}
async function derived(a,p){const c=structuredClone(a.context);c.runDir=path.join(a.root,'.fm','runs','derived');c.candidate=p.source;c.parentRunId=p.parentRunId;c.releaseReservationId=p.reservationId;c.releasePolicyHash=p.policyHash;c.result.runId='derived';c.result.outputHash=p.outputHash;await evidence(c);return {...a,script:structuredClone(a.script),context:c,candidate:p};}
test('Mozilla numeric ordering and conservative unsupported syntax',()=>{assert.equal(compareMozillaNumericVersions('99.10','99.9'),1);assert.equal(compareMozillaNumericVersions('98','98.0'),0);assert.equal(compareMozillaNumericVersions('1.0.0','1'),0);for(const v of ['1pre','1+','01','2147483648','1.*']){assert.throws(()=>compareMozillaNumericVersions(v,'1'));}});
test('prepare stable reservation, freeze metadata only, exact derived finalize owned trio',async()=>{const a=await setup();const p=await prepareCandidate(a);const repeat=await prepareCandidate(a);assert.deepEqual(p,repeat);assert.equal(p.version,'99.0');assert.match(p.source,/@custom untouched/);assert.match(p.source,/@description:zh 保留/);assert.equal(p.source.split('// ==/UserScript==')[1],a.context.source.split('// ==/UserScript==')[1]);const d=await derived(a,p);const manifest=await finalizeRelease(d);assert.equal(manifest.outputHash,p.outputHash);assert.equal(await fs.readFile(path.join(a.root,'published','synthetic-release.user.js'),'utf8'),p.source);assert.match(await fs.readFile(path.join(a.root,'published','synthetic-release.meta.js'),'utf8'),/@version 99.0/);await finalizeRelease(d);});
test('pending, disabled, too-low version, missing license and stale bytes fail closed',async()=>{for(const mutate of [a=>a.context.result.state='pending-browser',a=>a.script.publish={mode:'disabled'},a=>a.script.publish.versionMajor=98,a=>a.script.publish.licenseEvidence.hash=sha('other'),a=>a.context.fixture.cases[0].status='pending',a=>a.context.receipt.perStepResults[0].mandatory=false]){const a=await setup();mutate(a);await assert.rejects(prepareCandidate(a));}const a=await setup();await fs.appendFile(path.join(a.context.runDir,'candidate.user.js'),'changed');await assert.rejects(prepareCandidate(a),/snapshot changed|current output changed/);});
test('new reservation revision advances and unrelated publication collision preserved',async()=>{const a=await setup(),p=await prepareCandidate(a);a.context.result.runId='second';a.context.source+='\n';a.context.candidate=a.context.source;a.context.result.inputHash=sha(a.context.source);a.context.result.outputHash=sha(a.context.source);await evidence(a.context);const q=await prepareCandidate(a);assert.equal(q.version,'99.1');const d=await derived(a,q);await fs.mkdir(path.join(a.root,'published'));await fs.writeFile(path.join(a.root,'published','synthetic-release.meta.js'),'unrelated');await assert.rejects(finalizeRelease(d),/collision/);assert.equal(await fs.readFile(path.join(a.root,'published','synthetic-release.meta.js'),'utf8'),'unrelated');await assert.rejects(fs.stat(path.join(a.root,'published','synthetic-release.user.js')));assert.notEqual(p.reservationId,q.reservationId);});
test('finalize rejects original run, policy changes, tampered reservation, symlink and lock races',async()=>{const a=await setup(),p=await prepareCandidate(a);await assert.rejects(finalizeRelease({...a,candidate:p}),/derived/);const d=await derived(a,p);d.script.publish.baseUrl='https://example.com/changed/';await assert.rejects(finalizeRelease(d),/binding|configured release script changed/);d.script=a.script;await fs.symlink(a.context.runDir,path.join(a.root,'linked'));await assert.rejects(finalizeRelease({...d,releaseRoot:'linked'}),/symlink/);await fs.writeFile(path.join(path.dirname(p.paths.state),'lock'),'busy');await assert.rejects(prepareCandidate(a),/lock busy/);await fs.unlink(path.join(path.dirname(p.paths.state),'lock'));await fs.writeFile(p.paths.reservation,'{}');await assert.rejects(finalizeRelease(d),/tampered|corrupted/);});
test('audit failure prevents writes; ordinary mid-install rename failure rolls back prior trio',async()=>{
 const a=await setup();await fs.writeFile(path.join(a.root,'audit-file'),'not-directory');await assert.rejects(prepareCandidate({...a,auditDir:'audit-file'}));await assert.rejects(fs.stat(path.join(a.root,'.fm/releases/synthetic-release/state.json')));
 const p=await prepareCandidate(a);await finalizeRelease(await derived(a,p));const originals={};for(const suffix of ['user.js','meta.js','manifest.json']){originals[suffix]=await fs.readFile(path.join(a.root,'published','synthetic-release.'+suffix),'utf8');}
 a.context.source+='\n';a.context.candidate=a.context.source;a.context.result.runId='next-origin';a.context.result.inputHash=sha(a.context.source);a.context.result.outputHash=sha(a.context.candidate);await evidence(a.context);const q=await prepareCandidate(a),d=await derived(a,q);
 const fsDefault=(await import('node:fs/promises')).default;const {syncBuiltinESMExports}=await import('node:module');const originalRename=fsDefault.rename;
 fsDefault.rename=async(from,to)=>{if(to.endsWith('synthetic-release.meta.js')){throw new Error('Synthetic rename failure');}return originalRename(from,to);};syncBuiltinESMExports();
 try{await assert.rejects(finalizeRelease(d),/Synthetic rename failure/);}finally{fsDefault.rename=originalRename;syncBuiltinESMExports();}
 for(const [suffix,bytes]of Object.entries(originals)){assert.equal(await fs.readFile(path.join(a.root,'published','synthetic-release.'+suffix),'utf8'),bytes);}
 await finalizeRelease(d);
});
async function fault(method, wrapper, action) {
 const module=(await import('node:fs/promises')).default;const original=module[method];const {syncBuiltinESMExports}=await import('node:module');
 module[method]=wrapper(original);syncBuiltinESMExports();try{return await action();}finally{module[method]=original;syncBuiltinESMExports();}
}
test('prepare state failure recovers durable journal and preserves exact version/bytes',async()=>{
 const a=await setup();await fault('rename',original=>async(from,to)=>{if(to.endsWith('/state.json')){throw new Error('Synthetic index failure');}return original(from,to);},async()=>{await assert.rejects(prepareCandidate(a),/Synthetic index failure/);});
 const dir=path.join(a.root,'.fm/releases/synthetic-release');const records=(await fs.readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));assert.equal(records.length,1);const journal=JSON.parse(await fs.readFile(path.join(dir,records[0]),'utf8'));assert.equal(journal.version,'99.0');await assert.rejects(fs.stat(path.join(dir,'state.json')));
 const recovered=await prepareCandidate(a);assert.deepEqual(recovered,journal);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).highestVersion,'99.0');
 a.context.source+='\n';a.context.candidate=a.context.source;a.context.result.runId='changed-origin';a.context.result.inputHash=sha(a.context.source);a.context.result.outputHash=sha(a.context.source);await evidence(a.context);assert.equal((await prepareCandidate(a)).version,'99.1');
});
test('partial exclusive write never installs incomplete reservation or audit; retry starts at same revision',async()=>{
 const a=await setup();await fault('writeFile',original=>async(file,data,options)=>{if(/\/releases\/.*\.json\.stage-/.test(String(file))){await original(file,String(data).slice(0,12),options);throw new Error('Synthetic partial write');}return original(file,data,options);},async()=>{await assert.rejects(prepareCandidate(a),/Synthetic partial write/);});
 const dir=path.join(a.root,'.fm/releases/synthetic-release');assert.deepEqual(await fs.readdir(dir),[]);const p=await prepareCandidate(a);assert.equal(p.version,'99.0');
 const b=await setup();await fault('writeFile',original=>async(file,data,options)=>{if(String(file).includes('/audit/')){await original(file,'partial',options);throw new Error('Synthetic partial audit');}return original(file,data,options);},async()=>{await assert.rejects(prepareCandidate(b),/Synthetic partial audit/);});assert.deepEqual(await fs.readdir(path.join(b.root,'.fm/audit')),[]);
});
test('finalize state index failure rolls back trio and previous ownership index; retry stable',async()=>{
 const a=await setup(),p=await prepareCandidate(a);await finalizeRelease(await derived(a,p));const dir=path.dirname(p.paths.state);const oldState=await fs.readFile(path.join(dir,'state.json'),'utf8');const oldBytes={};for(const suffix of ['user.js','meta.js','manifest.json']){oldBytes[suffix]=await fs.readFile(path.join(a.root,'published','synthetic-release.'+suffix),'utf8');}
 a.context.source+='\n';a.context.candidate=a.context.source;a.context.result.runId='new-origin';a.context.result.inputHash=sha(a.context.source);a.context.result.outputHash=sha(a.context.source);await evidence(a.context);const q=await prepareCandidate(a);const beforeFinalize=await fs.readFile(path.join(dir,'state.json'),'utf8');const d=await derived(a,q);
 await fault('rename',original=>async(from,to)=>{if(to.endsWith('/state.json')){throw new Error('Synthetic final index failure');}return original(from,to);},async()=>{await assert.rejects(finalizeRelease(d),/Synthetic final index failure/);});
 assert.equal(await fs.readFile(path.join(dir,'state.json'),'utf8'),beforeFinalize);assert.equal(JSON.parse(beforeFinalize).publishedVersion,JSON.parse(oldState).publishedVersion);for(const [suffix,bytes]of Object.entries(oldBytes)){assert.equal(await fs.readFile(path.join(a.root,'published','synthetic-release.'+suffix),'utf8'),bytes);}await finalizeRelease(d);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).publishedVersion,'99.1');
});
test('direct backend rejects omitted/full-empty pins and newly added, removed or changed runtime modules',async()=>{
 for(const mutation of [async a=>{a.context.result.dependencyHashes={};await evidence(a.context);},async a=>{delete a.context.result.dependencyHashes['packages/cli/dist/index.js'];await evidence(a.context);},async a=>{await fs.writeFile(path.join(a.root,'packages/evolution/dist/new-helper.js'),'new runtime');},async a=>{await fs.unlink(path.join(a.root,'packages/cli/dist/nested/helper.js'));},async a=>{await fs.appendFile(path.join(a.root,'packages/converter/dist/index.js'),'changed runtime');}]){
 const a=await setup();await mutation(a);await assert.rejects(prepareCandidate(a),/runtime dependency/);await assert.rejects(fs.stat(path.join(a.root,'.fm/releases/synthetic-release')));
 }
});
test('direct backend reconciles saved manifest, observations, frozen suites, lineage and bound configuration',async()=>{
 const mutations=[
  async a=>{const f=path.join(a.context.runDir,'manifest.json');const m=JSON.parse(await fs.readFile(f));m.result.toolVersion='stale';await fs.writeFile(f,json(m));},
  async a=>{const f=path.join(a.context.runDir,'acceptance.json');const m=JSON.parse(await fs.readFile(f));m.perStepResults[0].evidence='Changed saved observation';await fs.writeFile(f,json(m));},
  async a=>{const f=path.join(a.context.runDir,'fixture.json');const m=JSON.parse(await fs.readFile(f));m.cases[0].command='Changed saved procedure';await fs.writeFile(f,json(m));},
  async a=>{const f=path.join(a.context.runDir,'manifest.json');const m=JSON.parse(await fs.readFile(f));m.fixtureSuite.cases=[];await fs.writeFile(f,json(m));},
  async a=>{const f=path.join(a.context.runDir,'manifest.json');const m=JSON.parse(await fs.readFile(f));m.steps[0].mandatory=false;await fs.writeFile(f,json(m));},
  async a=>{const f=path.join(a.context.runDir,'manifest.json');const m=JSON.parse(await fs.readFile(f));m.parentRunId='changed-parent';await fs.writeFile(f,json(m));},
  async a=>{await fs.appendFile(a.context.configPath,'\n');},
  async a=>{a.script.publish.baseUrl='https://example.com/changed-config/';},
  async a=>{a.context.configHash=sha('forged');},
  async a=>{a.context.runDir=path.join(a.root,'unignored-run');}
 ];
 for(const mutation of mutations){const a=await setup();await mutation(a);await assert.rejects(prepareCandidate(a),/saved|configured|canonical/);await assert.rejects(fs.stat(path.join(a.root,'.fm/releases/synthetic-release')));}
});

test('final C1-F001 metadata extraction ignores closing-marker literals in valid leading comments',async()=>{
 for(const newline of ['\n','\r\n']){
  const a=await setup();
  a.context.source=('// example closing marker: ==/UserScript==\n/* another literal: ==/UserScript== */\n'+a.context.source).replace(/\r?\n/g,newline);
  a.context.candidate=a.context.source;a.context.result.inputHash=sha(a.context.source);a.context.result.outputHash=sha(a.context.source);await evidence(a.context);
  assert.equal(parseMetadata(a.context.source).valid,true);
  const p=await prepareCandidate(a);const d=await derived(a,p);const manifest=await finalizeRelease(d);
  const metadata=await fs.readFile(path.join(a.root,'published','synthetic-release.meta.js'),'utf8');
  const parsed=parseMetadata(metadata);assert.equal(parsed.valid,true);assert.deepEqual(parsed.identity,a.script.identity);
  for(const [key,value]of [['version',p.version],['downloadURL',manifest.downloadUrl],['updateURL',manifest.updateUrl]]){assert.deepEqual(parsed.entries.filter(entry=>entry.key===key).map(entry=>entry.value),[value]);}
  assert.equal(metadata.includes('void 0;'),false);assert.equal(metadata.endsWith('// ==/UserScript=='+newline),true);
  assert.equal(await fs.readFile(path.join(a.root,'published','synthetic-release.user.js'),'utf8'),p.source);assert.equal(manifest.outputHash,sha(p.source));
 }
});
