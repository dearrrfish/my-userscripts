import fs from 'node:fs/promises';
import path from 'node:path';
import { exact, relative, id, digest, hash, json, read, write, safe } from './guards.mjs';
export function validateSummary(value, {expectedReviewRoot,expectedScriptIds}={}) {
  exact(value,['schemaVersion','reviewRoot','entries']); if (value.schemaVersion!==1 || !Array.isArray(value.entries)) { throw new Error('summary-shape'); } relative(value.reviewRoot); if (expectedReviewRoot && value.reviewRoot!==expectedReviewRoot) { throw new Error('review-root'); }
  const seen=new Set(); for (const entry of value.entries) { exact(entry,['scriptId','fingerprint','candidatePath','reportPath','candidateHash','reportHash']); id(entry.scriptId); if (seen.has(entry.scriptId) || expectedScriptIds && !expectedScriptIds.includes(entry.scriptId)) { throw new Error('script-selection'); } seen.add(entry.scriptId); digest(entry.fingerprint); digest(entry.candidateHash); digest(entry.reportHash); if (entry.candidatePath!==`${value.reviewRoot}/${entry.scriptId}/candidate.user.js` || entry.reportPath!==`${value.reviewRoot}/${entry.scriptId}/report.json`) { throw new Error('artifact-path'); } } return value;
}
export function validateReport(value) {
  exact(value,['schemaVersion','scriptId','fingerprint','inputHash','outputHash','baselineState','candidateState','providerStatus','errors','warnings','unresolvedRuleIds','browser','fixture','eligible','provenance','identity','profileId','originalManualErrors']);
  if (value.schemaVersion!==1 || !['blocked','failed','pending-browser'].includes(value.baselineState) || !['blocked','pending-browser'].includes(value.candidateState) || !['off','edits','missing-key','context-budget','response-budget','rate-limited','provider-failed','timeout','invalid-response','unsafe-edit'].includes(value.providerStatus) || value.fixture!=='pending' || value.browser!=='pending' || value.eligible!==false) { throw new Error('report-status'); }
  exact(value.identity,['name','namespace']); if(typeof value.identity.name!=='string'||typeof value.identity.namespace!=='string'||!value.identity.name||!value.identity.namespace||value.identity.name.length>500||value.identity.namespace.length>500||typeof value.profileId!=='string'||!/^[a-zA-Z0-9._-]{1,120}$/.test(value.profileId)||!Number.isInteger(value.originalManualErrors)||value.originalManualErrors<0) { throw new Error('identity-profile'); } exact(value.provenance,['sourceHash','dependencyHashes','repositoryConfigHash','updatesConfigHash','profileHash','rulesHash','skillHash','toolHash','providerHash','sourceLockHash']); for(const k of ['sourceHash','repositoryConfigHash','updatesConfigHash','profileHash','rulesHash','skillHash','toolHash','providerHash','sourceLockHash']) { digest(value.provenance[k]); } if(!Array.isArray(value.provenance.dependencyHashes)||value.provenance.dependencyHashes.some(h=>!(/^[a-f0-9]{64}$/.test(h)))) { throw new Error('provenance'); } if(value.inputHash!==value.provenance.sourceHash) { throw new Error('input-binding'); } id(value.scriptId); for (const k of ['fingerprint','inputHash','outputHash']) { digest(value[k]); } for (const k of ['errors','warnings']) { if (!Number.isInteger(value[k]) || value[k]<0 || value[k]>100000) { throw new Error('report-count'); } } if (!Array.isArray(value.unresolvedRuleIds) || value.unresolvedRuleIds.some(v=>typeof v!=='string' || !/^[A-Za-z0-9._-]{1,120}$/.test(v))) { throw new Error('report-rules'); } return value;
}
export async function validateTransfer(root, manifest, options={}) {
  exact(manifest,['schemaVersion','reviewRoot','files','entries','sourceLockPath']); if (manifest.schemaVersion!==1 || manifest.sourceLockPath!=='source.lock.json' || !Array.isArray(manifest.files)) { throw new Error('transfer-shape'); }
  validateSummary({schemaVersion:1,reviewRoot:manifest.reviewRoot,entries:manifest.entries},options);
  const expected=['source.lock.json',`${manifest.reviewRoot}/summary.json`,...manifest.entries.flatMap(e=>[e.candidatePath,e.reportPath])].sort(); if (manifest.files.length!==expected.length) { throw new Error('transfer-files'); }
  const paths=[]; for (const file of manifest.files) { exact(file,['path','sha256','size']); relative(file.path); digest(file.sha256); if (!Number.isInteger(file.size)||file.size<0||file.size>5_000_000) { throw new Error('transfer-size'); } paths.push(file.path); const bytes=await read(root,file.path); if (bytes.length!==file.size || hash(bytes)!==file.sha256) { throw new Error('transfer-hash'); } }
  if (JSON.stringify(paths.sort())!==JSON.stringify(expected)) { throw new Error('transfer-allowlist'); }
  const summary=validateSummary(JSON.parse(await read(root,`${manifest.reviewRoot}/summary.json`)),options); if (JSON.stringify(summary.entries)!==JSON.stringify(manifest.entries)) { throw new Error('transfer-summary'); }
  const {validateContract}=await import('../../../packages/contracts/dist/index.js'); const lock=validateContract('SourceLock',JSON.parse(await read(root,'source.lock.json')));
  if(options.expectedRepositoryConfig) { const configured=options.expectedRepositoryConfig.projects.flatMap(p=>p.scripts.map(s=>({script:s,origin:p.upstream}))); for(const snapshot of lock.snapshots) { const bound=configured.find(v=>v.script.id===snapshot.scriptId); if(!bound||JSON.stringify(bound.origin)!==JSON.stringify(snapshot.origin)) { throw new Error('lock-origin'); } } }
  for (const e of manifest.entries) { const reportBytes=await read(root,e.reportPath); const report=validateReport(JSON.parse(reportBytes)); const snapshot=lock.snapshots.find(s=>s.scriptId===e.scriptId); if(report.provenance.sourceLockHash!==hash(await read(root,'source.lock.json'))||hash(reportBytes)!==e.reportHash||!snapshot||snapshot.hash!==report.inputHash||JSON.stringify(snapshot.dependencies.map(d=>d.hash))!==JSON.stringify(report.provenance.dependencyHashes)) { throw new Error('source-binding'); } if(options.expectedRepositoryConfig) { const bound=options.expectedRepositoryConfig.projects.flatMap(p=>p.scripts).find(s=>s.id===e.scriptId); if(!bound||JSON.stringify(bound.identity)!==JSON.stringify(report.identity)||report.profileId!==options.expectedRepositoryConfig.targetProfile) { throw new Error('report-config'); } } if (report.scriptId!==e.scriptId||report.fingerprint!==e.fingerprint||report.outputHash!==e.candidateHash||hash(await read(root,e.candidatePath))!==e.candidateHash) { throw new Error('entry-binding'); } }
  return manifest;
}
export async function readTransfer(root,options={}) { return validateTransfer(root,JSON.parse(await read(root,'transfer.json')),options); }
export async function packageTransfer({workspace,reviewRoot,outputDir,expectedScriptIds}) {
  const summary=validateSummary(JSON.parse(await read(workspace,`${reviewRoot}/summary.json`)),{expectedReviewRoot:reviewRoot,expectedScriptIds}); const files=[];
  for (const name of ['source.lock.json',`${reviewRoot}/summary.json`,...summary.entries.flatMap(e=>[e.candidatePath,e.reportPath])]) { const bytes=await read(workspace,name); files.push({path:name,sha256:hash(bytes),size:bytes.length}); }
  const manifest={schemaVersion:1,reviewRoot,files,entries:summary.entries,sourceLockPath:'source.lock.json'}; await validateTransfer(workspace,manifest,{expectedReviewRoot:reviewRoot,expectedScriptIds});
  await fs.mkdir(outputDir,{recursive:true}); if ((await fs.readdir(outputDir)).length) { throw new Error('transfer-output-not-empty'); }
  for (const f of files) { await write(outputDir,f.path,await read(workspace,f.path)); } await write(outputDir,'transfer.json',json(manifest)); return manifest;
}
export async function restoreTransfer({workspace,previousState,reviewRoot,expectedScriptIds}) {
  const manifest = await readTransfer(previousState, {expectedReviewRoot:reviewRoot,expectedScriptIds});
  const current = await ownedSummary(workspace,reviewRoot,expectedScriptIds);
  const owned = new Set(current.entries.flatMap(e => [e.candidatePath,e.reportPath]));
  let ownedLock = false;
  if (current.entries.length) {
    const lockBytes = await read(workspace,'source.lock.json');
    const {validateContract} = await import('../../../packages/contracts/dist/index.js');
    validateContract('SourceLock',JSON.parse(lockBytes));
    for (const entry of current.entries) {
      const report = validateReport(JSON.parse(await read(workspace,entry.reportPath)));
      if (report.provenance.sourceLockHash !== hash(lockBytes)) { throw new Error('restore-lock-ownership'); }
    }
    ownedLock = true;
  }
  for (const file of manifest.files) {
    try {
      const existing = await read(workspace,file.path);
      const generated = owned.has(file.path) || (file.path === `${reviewRoot}/summary.json` && current.entries.length > 0) || (file.path === 'source.lock.json' && ownedLock);
      if (!generated && hash(existing) !== file.sha256) { throw new Error('restore-collision'); }
    } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
  }
  // Validated generated state A may legitimately precede the pending PR state B.
  // All current ownership and incoming bytes are checked before replacing A.
  for (const file of manifest.files) { await write(workspace,file.path,await read(previousState,file.path)); }
  return manifest;
}
export async function ownedSummary(workspace,reviewRoot,expectedScriptIds) {
  let bytes; try { bytes=await read(workspace,`${reviewRoot}/summary.json`); } catch(error) { if(error.code==='ENOENT') { return {schemaVersion:1,reviewRoot,entries:[]}; } throw error; }
  const summary=validateSummary(JSON.parse(bytes),{expectedReviewRoot:reviewRoot,expectedScriptIds}); for(const e of summary.entries) { const reportBytes=await read(workspace,e.reportPath); const report=validateReport(JSON.parse(reportBytes)); if(hash(reportBytes)!==e.reportHash||report.scriptId!==e.scriptId||report.fingerprint!==e.fingerprint||report.outputHash!==e.candidateHash||hash(await read(workspace,e.candidatePath))!==e.candidateHash) { throw new Error('ownership'); } } return summary;
}
