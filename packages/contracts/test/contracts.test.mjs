import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { schemas, checkContract, validateContract, validateRuleSet } from '../dist/index.js';
const h = 'a'.repeat(64);
const evidence = {kind:'official',reference:'https://example.org/help',hash:h,description:'Pinned source'};
const rule = () => ({schemaVersion:1,id:'metadata.match',revision:1,scope:'shared',targetRange:{profileIds:['fm3.9'],fm:'3.9',firefox:'157.0'},category:'metadata',severity:'warning',matcher:{kind:'metadata',query:'match'},preconditions:[],action:{kind:'diagnose'},postconditions:[],dependencies:[],conflicts:[],evidence:[evidence]});
const script = () => ({id:'one',sourceManager:'unknown',outputPath:'one.user.js',identity:{name:'One',namespace:'example'},acceptance:{checklistId:'basic'},publish:{mode:'disabled'}});
const config = () => ({schemaVersion:1,outputRoot:'artifacts/converted',targetProfile:'fm3.9',projects:[{id:'upstream',upstream:{kind:'url',url:'https://example.org/one.user.js'},scripts:[script()]}]});
const receipt = () => ({schemaVersion:1,runId:'run1',outputHash:h,dependencyHashes:{},targetHash:h,rulesHash:h,skillHash:h,toolVersion:'0.1.0',checklistId:'basic',checklistHash:h,verifier:'human',timestamp:'2026-10-04T00:00:00Z',confirmationSource:'cli',perStepResults:[{id:'install',mandatory:true,status:'passed',evidence:'Observed browser registration'}],evidenceDigest:h});
test('generated schemas reflect authoritative TypeBox schemas', async () => {
 for (const [name,schema] of Object.entries(schemas)) { const file = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`,import.meta.url),'utf8')); delete file.$schema; assert.deepEqual(file,JSON.parse(JSON.stringify(schema))); }
});
test('unknown fields, version and source union rejected', () => {
 assert.equal(checkContract('RepositoryConfig',config()).valid,true);
 for (const mutate of [c=>c.extra=true,c=>c.schemaVersion=2,c=>c.projects[0].upstream.path='source.js',c=>c.projects[0].scripts[0].sourcePath='source.js',c=>c.outputRoot='../escape']) { const c=config();mutate(c);assert.equal(checkContract('RepositoryConfig',c).valid,false); }
 const c=config();c.projects[0].upstream={kind:'git',url:'https://example.org/git',ref:'main'};assert.equal(checkContract('RepositoryConfig',c).valid,false);
 c.projects[0].upstream.ref='b'.repeat(40);assert.equal(checkContract('RepositoryConfig',c).valid,false);c.projects[0].scripts[0].sourcePath='source.js';assert.equal(checkContract('RepositoryConfig',c).valid,true);
});
test('duplicate IDs, identities and normalized output paths rejected', () => {
 for (const mutate of [s=>{},s=>{s.id='two';s.identity={name:'Two',namespace:'example'};s.outputPath='./one.user.js';},s=>{s.id='two';s.outputPath='two.js';}]) { const c=config();const s=script();mutate(s);c.projects[0].scripts.push(s);assert.equal(checkContract('RepositoryConfig',c).valid,false); }
});
test('credentials rejected without echoing secrets', () => {
 const c=config();c.projects[0].upstream.url='https://user:secret@example.org/script';const r=checkContract('RepositoryConfig',c);assert.equal(r.valid,false);assert.ok(!JSON.stringify(r).includes('user:secret'));
 c.projects[0].upstream.url='https://example.org/script?api_key=secret';assert.equal(checkContract('RepositoryConfig',c).valid,false);
});
test('scope and action discriminators isolate script rules and actions', () => {
 const r=rule();assert.equal(checkContract('Rule',r).valid,true);
 r.scriptId='one';assert.equal(checkContract('Rule',r).valid,false);r.scope='script';assert.equal(checkContract('Rule',r).valid,false);r.identity={name:'One',namespace:'example'};assert.equal(checkContract('Rule',r).valid,true);
 r.action={kind:'transform'};assert.equal(checkContract('Rule',r).valid,false);r.action={kind:'diagnose',transformId:'bogus'};assert.equal(checkContract('Rule',r).valid,false);
 r.action={kind:'guidance',guidance:{steps:['Inspect'],riskConfirmation:true,requiredEvidence:['receipt'],postconditions:[{kind:'inputHash',query:h}]}};assert.equal(checkContract('Rule',r).valid,true);
 r.preconditions=[{kind:'inputHash',query:'not-a-hash'}];assert.equal(checkContract('Rule',r).valid,false);
});
test('rule graph validation catches cycles, unknown IDs and profiles', () => {
 const a=rule(),b={...rule(),id:'other',dependencies:[a.id]};a.dependencies=[b.id];assert.throws(()=>validateRuleSet([a,b]),/cycle/);
 assert.throws(()=>validateRuleSet([rule(),rule()]),/duplicate/);assert.throws(()=>validateRuleSet([rule()],['different']),/unknown target/);
 a.dependencies=['missing'];assert.throws(()=>validateRuleSet([a]),/unknown dependency/);
});
test('hash-bound approvals reject malformed hashes and PR without commit', () => {
 const a={schemaVersion:1,proposalId:'p1',patchHash:h,reportHash:h,proposalHash:h,verificationDigest:h,approver:'human',time:'2026-10-04T00:00:00Z',mode:'local'};
 assert.equal(checkContract('Approval',a).valid,true);a.patchHash='abc';assert.equal(checkContract('Approval',a).valid,false);a.patchHash=h;a.mode='pr';assert.equal(checkContract('Approval',a).valid,false);a.commit='b'.repeat(40);assert.equal(checkContract('Approval',a).valid,true);
});
test('pending receipts are representable but cannot back a release', () => {
 const r=receipt();r.perStepResults[0].status='pending';assert.equal(checkContract('BrowserAcceptance',r).valid,true);
 const m={schemaVersion:1,scriptId:'one',identity:script().identity,inputHash:h,outputHash:h,profileHash:h,rulesHash:h,verifiedReceipt:r,version:'1.0',licenseEvidence:evidence,downloadUrl:'https://example.org/one.user.js',updateUrl:'https://example.org/one.meta.js'};
 assert.equal(checkContract('ReleaseManifest',m).valid,false);r.perStepResults[0].status='passed';assert.equal(checkContract('ReleaseManifest',m).valid,true);m.outputHash='b'.repeat(64);assert.equal(checkContract('ReleaseManifest',m).valid,false);
});
test('complete state cannot fabricate missing static/browser verification', () => {
 const r={schemaVersion:1,runId:'run1',state:'complete',inputHash:h,outputHash:h,targetHash:h,rulesHash:h,skillHash:h,toolVersion:'0.1.0',dependencyHashes:{},findings:[],appliedRules:[],verification:[]};assert.equal(checkContract('ConversionResult',r).valid,false);
 r.state='pending-browser';assert.equal(checkContract('ConversionResult',r).valid,true);delete r.outputHash;assert.equal(checkContract('ConversionResult',r).valid,false);
});
test('proposal enforces bounded paths and unique changes', () => {
 const p={schemaVersion:1,id:'p1',originatingRun:'run1',baseHashes:{},patchHash:h,reportHash:h,proposalHash:h,verificationDigest:h,changes:[{path:'rules/shared/one.json',afterHash:h}],reason:'Verified case',regressionFixtures:['fixtures/one.js'],scope:'rules',status:'proposed'};
 assert.equal(checkContract('EvolutionProposal',p).valid,true);p.changes[0].path='package.json';assert.equal(checkContract('EvolutionProposal',p).valid,false);p.changes[0].path='../rules/one';assert.equal(checkContract('EvolutionProposal',p).valid,false);
});
test('verification requires command or checklist exactly once', () => {
 const v={schemaVersion:1,kind:'parse',status:'passed',command:'parser',environment:{node:'24.21.0'},artifactHash:h,evidenceDigest:h};assert.equal(checkContract('Verification',v).valid,true);v.checklist='basic';assert.equal(checkContract('Verification',v).valid,false);
 assert.throws(()=>validateContract('Verification',v),/Verification/);
});
test('identity comparison ignores JSON key order and output parent collisions fail', () => {
 const c=config();const s=script();s.id='two';s.outputPath='two.js';s.identity={namespace:'example',name:'One'};c.projects[0].scripts.push(s);assert.equal(checkContract('RepositoryConfig',c).valid,false);
 s.identity.name='Two';s.outputPath='one.user.js/child.js';assert.equal(checkContract('RepositoryConfig',c).valid,false);
});
test('evidence URLs cannot leak credentials in validation errors', () => {
 const r=rule();r.evidence[0]={...evidence,reference:'https://example.org/help?token=private-value'};const result=checkContract('Rule',r);assert.equal(result.valid,false);assert.ok(!JSON.stringify(result).includes('private-value'));
});
test('complete verification validates nested semantics and binds artifact hashes', () => {
 const r={schemaVersion:1,runId:'run1',state:'complete',inputHash:h,outputHash:h,targetHash:h,rulesHash:h,skillHash:h,toolVersion:'0.1.0',dependencyHashes:{},findings:[],appliedRules:[],verification:['parse','metadata','lint','fixture','browser'].map(kind=>({schemaVersion:1,kind,status:'passed',...(kind==='browser'?{checklist:'basic'}:{command:kind}),environment:{},artifactHash:h,evidenceDigest:h}))};
 assert.equal(checkContract('ConversionResult',r).valid,true);r.verification[0].artifactHash='b'.repeat(64);assert.equal(checkContract('ConversionResult',r).valid,false);r.verification[0].artifactHash=h;delete r.verification[0].command;assert.equal(checkContract('ConversionResult',r).valid,false);
});
test('proposal scope and declared per-path base hashes must agree with changes', () => {
 const p={schemaVersion:1,id:'p1',originatingRun:'run1',baseHashes:{'rules/shared/one.json':h},patchHash:h,reportHash:h,proposalHash:h,verificationDigest:h,changes:[{path:'rules/shared/one.json',beforeHash:h,afterHash:h}],reason:'Verified case',regressionFixtures:['fixtures/one.js'],scope:'rules',status:'proposed'};
 assert.equal(checkContract('EvolutionProposal',p).valid,true);p.changes[0].beforeHash='b'.repeat(64);assert.equal(checkContract('EvolutionProposal',p).valid,false);p.changes[0].beforeHash=h;p.scope='skill';assert.equal(checkContract('EvolutionProposal',p).valid,false);p.scope='rules';p.changes[0].path='skills/fm-convert/SKILL.md';assert.equal(checkContract('EvolutionProposal',p).valid,false);p.scope='both';assert.equal(checkContract('EvolutionProposal',p).valid,true);
});
test('official evidence allows help anchors while rejecting secret reference URLs', () => {
 const r=rule();r.evidence[0]={...evidence,reference:'https://official.example/help#api'};assert.equal(checkContract('Rule',r).valid,true);
 for (const reference of ['https://user:private-value@official.example/help#api','https://official.example/help?token=private-value#api','https://official.example/help#token=private-value']) {
  r.evidence[0].reference=reference;const result=checkContract('Rule',r);assert.equal(result.valid,false);assert.ok(!JSON.stringify(result).includes('private-value'));
 }
 const c=config();c.projects[0].upstream.url='https://official.example/script#api';assert.equal(checkContract('RepositoryConfig',c).valid,false);
});
