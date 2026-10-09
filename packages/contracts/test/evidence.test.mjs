import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, fixtureObservationDigest, checkContract } from '../dist/index.js';
const h = 'a'.repeat(64);
function observation() {
  return {schemaVersion:1,runId:'synthetic',inputHash:h,outputHash:h,dependencyHashes:{},targetHash:h,rulesHash:h,skillHash:h,toolVersion:'0.1.0',suiteId:'synthetic',suiteHash:h,verifier:'Synthetic observer',timestamp:'2026-10-08T09:00:00Z',confirmationSource:'cli',cases:[{id:'one',mandatory:true,status:'passed',command:'Synthetic manual procedure',evidence:'Synthetic observed result'}],evidenceDigest:h};
}
test('observation schema is strict and rejects duplicated case IDs',()=>{
  assert.equal(checkContract('FixtureObservation',observation()).valid,true);
  for (const mutate of [o=>{o.extra=true;},o=>{o.schemaVersion=2;},o=>{o.cases.push({...o.cases[0]});},o=>{o.cases[0].status='unknown';}]) {
    const o=observation(); mutate(o); assert.equal(checkContract('FixtureObservation',o).valid,false);
  }
});
test('full canonical digest binds actor, time, suite, cases and dependencies',()=>{
  const o=observation();const digest=fixtureObservationDigest(o);
  o.evidenceDigest='b'.repeat(64);assert.equal(fixtureObservationDigest(o),digest);
  assert.equal(fixtureObservationDigest(Object.fromEntries(Object.entries(o).reverse())),digest);
  for(const mutate of [o=>{o.verifier+='changed';},o=>{o.timestamp='2026-10-08T10:00:00Z';},o=>{o.suiteId='different';},o=>{o.cases[0].evidence='Different result';},o=>{o.dependencyHashes['file.js']='b'.repeat(64);}]) {
    const changed=observation(); mutate(changed); assert.notEqual(fixtureObservationDigest(changed),digest);
  }
  assert.equal(canonicalJson({'ä':1,Z:2,a:3}),'{"Z":2,"a":3,"ä":1}');
  assert.throws(()=>canonicalJson(undefined));
});
