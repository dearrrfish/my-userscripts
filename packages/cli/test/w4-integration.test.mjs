import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {buildBundle} from '../../../scripts/bundle.mjs';
import {fixtureObservationDigest,skillBehaviorDigest} from '@fm/contracts';
const execute=promisify(execFile),repo=path.resolve(import.meta.dirname,'../../..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=await fs.readFile(path.join(repo,'fixtures/cli/safe.user.js'),'utf8');
async function cli(root,args){
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 let response;
 try{response=await execute(process.execPath,[path.join(root,'packages/cli/src/main.mjs'),...args],{cwd:root,env,maxBuffer:4*1024*1024});}
 catch(error){if(typeof error.code!=='number'){throw error;}response=error;}
 return JSON.parse(response.stdout);
}
async function complete(root,runId){
 const fixture=await cli(root,['fixtures','template','--run',runId]);assert.equal(fixture.code,0,JSON.stringify(fixture));
 const observation=JSON.parse(await fs.readFile(fixture.template));observation.verifier='Synthetic integration observer; not actual FM evidence';
 observation.cases.forEach(c=>{c.status='passed';c.command='Synthetic manual assertion for tool protocol';c.evidence='Synthetic tool validation only';});observation.evidenceDigest=fixtureObservationDigest(observation);
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(observation));assert.equal((await cli(root,['fixtures','record','--run',runId,'--file','fixture.json'])).code,3);
 const acceptance=await cli(root,['acceptance','template','--run',runId]);const receipt=JSON.parse(await fs.readFile(acceptance.template));receipt.verifier=observation.verifier;
 receipt.perStepResults.forEach(c=>{c.status='passed';c.evidence='Synthetic protocol evidence only, no real browser claimed';});receipt.evidenceDigest=hash(JSON.stringify(receipt.perStepResults,null,2)+'\n');
 await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt));const accepted=await cli(root,['acceptance','record','--run',runId,'--file','receipt.json']);assert.equal(accepted.code,0,JSON.stringify(accepted));
}
test('real host runner gates a source-shaped synthetic SKILL proposal and exact approved application',async()=>{
 const pool=await fs.mkdtemp(path.join(repo,'.fm/w4-real-evolution-'));const built=await buildBundle({workspaceRoot:repo,outputDir:path.join(pool,'portable payload')});
 const root=path.join(pool,'owned-source-checkout');await fs.cp(built.runtimeRoot,root,{recursive:true,dereference:false,verbatimSymlinks:true});
 await fs.mkdir(path.join(root,'skills/fm-convert'),{recursive:true});for(const resource of ['SKILL.md','references','agents','scripts']){await fs.cp(path.join(built.skillRoot,resource),path.join(root,'skills/fm-convert',resource),{recursive:true,dereference:false,verbatimSymlinks:true});}
 await fs.writeFile(path.join(root,'input.user.js'),source);
 const runs=[];for(const output of ['one.user.js','two.user.js']){const run=await cli(root,['convert','--input','input.user.js','--output',output,'--target','firemonkey-3.9-firefox-157.0']);assert.equal(run.code,0,JSON.stringify(run));await complete(root,run.runId);runs.push(run);}
 const noDraft=await cli(root,['evolve','propose','--run',runs[0].runId]);assert.equal(noDraft.code,0,JSON.stringify(noDraft));assert.equal(noDraft.state,'no-proposal');
 const regressions=['positive','negative','idempotence'].map(kind=>({id:kind,kind,source,expectedOutputHash:hash(source),expectedStatus:'unchanged'}));
 const skillPath='skills/fm-convert/references/evidence.md',before=await fs.readFile(path.join(root,skillPath),'utf8');
 const draft={reason:'Synthetic isolated instruction evidence exercise',scope:'skill',files:[{path:skillPath,content:before+'\nSynthetic protocol fixture clarification; no target compatibility claim.\n'},{path:'fixtures/evolution/synthetic-w4.json',content:JSON.stringify(regressions,null,2)+'\n'}],regressionFixtures:['fixtures/evolution/synthetic-w4.json'],regressions};
 await fs.writeFile(path.join(root,'draft.json'),JSON.stringify(draft));const args=['--run',runs[0].runId,'--draft','draft.json','--replay-run',runs[1].runId];
 const template=await cli(root,['evolve','behavior-template',...args]);assert.equal(template.code,0,JSON.stringify(template));assert.equal(template.state,'pending-behavior');
 const observation=JSON.parse(await fs.readFile(template.template));assert.ok(observation.cases.every(c=>c.status==='pending'));
 const missing=await cli(root,['evolve','propose',...args]);assert.equal(missing.code,2,JSON.stringify(missing));assert.equal(await fs.readFile(path.join(root,skillPath),'utf8'),before);
 const report='Synthetic integration report: machine binding and transaction exercise only. This is not independent agent or real FireMonkey evidence.\n';
 observation.evaluator='Synthetic protocol tester';observation.timestamp=new Date().toISOString();observation.reportHash=hash(report);observation.cases.forEach(c=>{c.status='passed';c.evidence='Synthetic protocol observation; real independent evaluator is a separate run';c.artifactHashes=[hash(report)];});observation.evidenceDigest=skillBehaviorDigest(observation);
 draft.skillBehavior=observation;draft.behaviorArtifacts=[{path:'forward-report.md',content:report}];await fs.writeFile(path.join(root,'draft.json'),JSON.stringify(draft));
 const proposed=await cli(root,['evolve','propose',...args]);assert.equal(proposed.code,0,JSON.stringify(proposed));assert.equal(await fs.readFile(path.join(root,skillPath),'utf8'),before);
 const approvalTemplate=await cli(root,['evolve','approval-template','--proposal',proposed.proposal]);assert.equal(approvalTemplate.code,0,JSON.stringify(approvalTemplate));const approval=JSON.parse(await fs.readFile(approvalTemplate.template));
 await fs.writeFile(path.join(root,'approval.json'),JSON.stringify(approval));assert.equal((await cli(root,['evolve','apply','--proposal',proposed.proposal,'--approval','approval.json'])).code,2);
 approval.approver='Synthetic isolated approval fixture';approval.time=new Date().toISOString();await fs.writeFile(path.join(root,'approval.json'),JSON.stringify(approval));
 const applied=await cli(root,['evolve','apply','--proposal',proposed.proposal,'--approval','approval.json']);assert.equal(applied.code,0,JSON.stringify(applied));assert.equal(applied.state,'applied');
 assert.equal(await fs.readFile(path.join(root,skillPath),'utf8'),draft.files[0].content);assert.equal((await cli(root,['verify','--run',runs[0].runId,'--static'])).code,2);
});
