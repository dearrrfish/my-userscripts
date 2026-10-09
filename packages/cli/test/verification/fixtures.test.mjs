import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fixtureSuite, fixtureTemplate, fixtureObservationDigest, checkFixtureObservation, fixtureVerification, mergeFixtureVerification } from '../../dist/verification/fixtures.js';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const profileSource = await fs.readFile(new URL('../../../../profiles/firemonkey-3.9-firefox-157.0.json',import.meta.url),'utf8');
const profile = JSON.parse(profileSource);
const source = '// synthetic fixture only\n'; const candidate = source; const h = sha('synthetic');
function context(scriptId) {
  const suite = fixtureSuite(scriptId);
  return {workspaceRoot:'.',bundleRoot:'.',runDir:'.',source,candidate,profile,profileSource,rules:[],rulesSource:'[]\n',identity:{name:'Synthetic fixture',namespace:'test'},scriptId,checklistId:'test',checklistHash:h,mandatoryBrowserSteps:[],fixtureSuiteId:suite.id,fixtureSuiteHash:suite.hash,mandatoryFixtureCases:suite.cases,result:{schemaVersion:1,runId:'synthetic-run',state:'pending-browser',inputHash:sha(source),outputHash:sha(candidate),targetHash:sha(profileSource),rulesHash:sha('[]\n'),skillHash:h,toolVersion:'test',dependencyHashes:{},findings:[],appliedRules:[],verification:[]}};
}
function observation(ctx) {
  const value = fixtureTemplate(ctx); value.verifier = 'Synthetic test actor';
  value.cases.forEach(c => {c.status='passed'; c.command='deliberately arbitrary $(touch NEVER_EXECUTE)';c.evidence='Synthetic assertion observed; not real target acceptance';});
  value.evidenceDigest=fixtureObservationDigest(value); return value;
}
function redigest(v) {v.evidenceDigest=fixtureObservationDigest(v);return v;}
test('suites stable, target-specific, and every case mandatory',()=>{
  assert.deepEqual(fixtureSuite(),fixtureSuite());assert.notEqual(fixtureSuite().hash,fixtureSuite('greasyfork-454120').hash);
  assert.equal(fixtureSuite('greasyfork-454120').cases.length,5);assert.ok(fixtureSuite().cases.every(c=>c.mandatory));
});
test('template remains pending and placeholders cannot be recorded',()=>{
  const ctx=context();const receipt=fixtureTemplate(ctx);assert.equal(fixtureVerification(receipt).status,'pending');assert.throws(()=>checkFixtureObservation(receipt,ctx),/actor/);
});
test('full binding digest, byte integrity, suite integrity, actor evidence fail closed',()=>{
  const ctx=context();const valid=observation(ctx);assert.deepEqual(checkFixtureObservation(valid,ctx),valid);
  for (const key of ['runId','inputHash','outputHash','targetHash','rulesHash','skillHash','toolVersion','suiteId','suiteHash']) {
    const altered=structuredClone(valid);altered[key]=key.endsWith('Hash')?sha('changed'):'changed';assert.throws(()=>checkFixtureObservation(redigest(altered),ctx));
  }
  for (const mutate of [v=>v.cases.pop(),v=>v.cases.push({...v.cases[0]}),v=>v.cases[0].mandatory=false,v=>v.cases[0].id='extra',v=>v.cases[0].evidence=' ',v=>v.cases[0].command='TODO',v=>v.verifier='placeholder',v=>v.timestamp='2999-01-01T00:00:00Z',v=>v.dependencyHashes.extra=sha('changed')]) {
    const altered=structuredClone(valid);mutate(altered);assert.throws(()=>checkFixtureObservation(redigest(altered),ctx));
  }
  assert.throws(()=>checkFixtureObservation({...valid,verifier:'Changed actor'},ctx),/digest/);
  assert.throws(()=>checkFixtureObservation(valid,{...ctx,candidate:'changed'}),/bytes/);
  assert.throws(()=>checkFixtureObservation(valid,{...ctx,source:'changed'}),/bytes/);
  assert.throws(()=>checkFixtureObservation(valid,{...ctx,fixtureSuiteHash:sha('changed')}),/Context/);
});
test('fixture statuses preserve pending and failed; merge replaces fixture only',()=>{
  const ctx=context();const valid=observation(ctx);assert.equal(fixtureVerification(valid).status,'passed');
  valid.cases[0].status='not-applicable';assert.equal(fixtureVerification(valid).status,'pending');
  valid.cases[0].status='failed';assert.equal(fixtureVerification(valid).status,'failed');
  const pending=fixtureVerification(fixtureTemplate(ctx));const parse={...pending,kind:'parse'};const records=[parse,pending];
  assert.equal(mergeFixtureVerification(records,ctx),records);
  const merged=mergeFixtureVerification(records,{...ctx,fixture:observation(ctx)});assert.equal(merged.length,2);assert.equal(merged[0],parse);assert.equal(merged[1].status,'passed');
});
test('target suite cannot accept a standalone suite and does not execute command strings',()=>{
  assert.throws(()=>checkFixtureObservation(observation(context()),context('greasyfork-454120')),/suite/);
  const ctx=context('greasyfork-454120');assert.equal(checkFixtureObservation(observation(ctx),ctx).cases.length,5);
});
