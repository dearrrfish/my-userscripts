import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateContract, validateRuleSet, type RunEvidenceContext, type RepositoryConfig, type ReleaseManifest, resolveRuntimeLayout, skillResourceIdentity } from '@fm/contracts';
import { fixtureObservationDigest, checkFixtureObservation } from '../verification/fixtures.js';
import { validateSavedReleaseEvidence } from './runtime-evidence.js';
import { parseMetadata, staticVerify } from '@fm/converter';
export type ConfiguredScript = RepositoryConfig['projects'][number]['scripts'][number];
export interface ReleaseCandidate {
  schemaVersion: 1; scriptId: string; source: string; sourceHash: string; inputHash: string; preOutputHash: string;
  outputHash: string; version: string; policyHash: string; reservationId: string; parentRunId: string;
  profileHash: string; rulesHash: string; paths: { state: string; reservation: string };
}
interface State { schemaVersion: 1; highestVersion?: string; reservations: Record<string, ReleaseCandidate>; owned?: Record<string,string>; publishedVersion?: string }
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const json = (v: unknown) => JSON.stringify(v,null,2)+'\n';
function fail(message: string): never { throw new Error(`Release blocked: ${message}`); }
/** Numeric subset of Mozilla VersionComparator: missing parts equal zero, signed int32 bound. */
export function compareMozillaNumericVersions(a: string,b: string): number {
  const parts = (v:string) => { if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/.test(v)) { fail('unsupported Mozilla version syntax'); }
    return v.split('.').map(x=>{ const n=Number(x); if (!Number.isSafeInteger(n)||n>2147483647) { fail('version component exceeds Mozilla int32'); } return n; }); };
  const aa=parts(a),bb=parts(b); for(let i=0;i<Math.max(aa.length,bb.length);i++){ const d=(aa[i]??0)-(bb[i]??0); if(d){return Math.sign(d);} } return 0;
}
async function safe(root:string, requested:string): Promise<string> {
  const realRoot=await fs.realpath(root), target=path.resolve(realRoot,requested);
  if(target===realRoot||!target.startsWith(realRoot+path.sep)){fail('path escapes or replaces workspace');}
  let cursor=realRoot;
  for(const part of path.relative(realRoot,target).split(path.sep)){cursor=path.join(cursor,part);try{ const st=await fs.lstat(cursor);if(st.isSymbolicLink()){fail('symlink path');} }catch(e:any){if(e.code!=='ENOENT'){throw e;}}}
  return target;
}
async function writeExclusive(file: string, data: string) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = file + '.stage-' + randomUUID();
  try {
    await fs.writeFile(tmp, data, {flag: 'wx', mode: 0o600});
    // Link only complete bytes; EEXIST preserves the existing destination.
    await fs.link(tmp, file);
  } finally {
    // Cleanup cannot turn a successful install into an apparent failed commit.
    await fs.unlink(tmp).catch(() => {});
  }
}
async function replace(file: string, data: string) {
  const tmp = file + '.tmp-' + randomUUID();
  try {
    await writeExclusive(tmp, data);
    await fs.rename(tmp, file);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}
async function audit(root:string, dir:string, event:unknown){const target=await safe(root,dir);await fs.mkdir(target,{recursive:true});await writeExclusive(path.join(target,Date.now()+'-'+randomUUID()+'.json'),json(event));}
async function locked<T>(context:RunEvidenceContext, script:ConfiguredScript, fn:(dir:string)=>Promise<T>):Promise<T>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(script.id)){fail('invalid script ID');}
  const dir=await safe(context.workspaceRoot,`.fm/releases/${script.id}`);await fs.mkdir(dir,{recursive:true});const lock=path.join(dir,'lock');
  const handle=await fs.open(lock,'wx',0o600).catch(()=>fail('release lock busy; inspect stale lock manually'));
  try{return await fn(dir);}finally{await handle.close();await fs.unlink(lock);}
}
/** Immutable reservation records are the journal; state.json is its recoverable index. */
async function stateAt(dir: string): Promise<State> {
  let state: State;
  try {
    state = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  } catch (e: any) {
    if (e.code !== 'ENOENT') { throw e; }
    state = {schemaVersion: 1, reservations: {}};
  }
  if (state.schemaVersion !== 1 || !state.reservations || typeof state.reservations !== 'object') { fail('invalid reservation state'); }
  for (const version of [state.highestVersion, state.publishedVersion]) {
    if (version !== undefined) { compareMozillaNumericVersions(version, '0'); }
  }
  let recovered = false;
  const journalKeys = new Set<string>();
  const journalVersions = new Set<string>();
  for (const name of (await fs.readdir(dir)).sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) { continue; }
    const key = name.slice(0, -5), file = path.join(dir, name);
    if ((await fs.lstat(file)).isSymbolicLink()) { fail('symlink reservation journal'); }
    const record: ReleaseCandidate = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record.schemaVersion !== 1 || record.reservationId !== key || record.outputHash !== hash(record.source) || record.paths.state !== path.join(dir, 'state.json') || record.paths.reservation !== file) { fail('reservation journal corrupted'); }
    compareMozillaNumericVersions(record.version, '0');
    const metadata = parseMetadata(record.source);
    const expectedKey = hash(json({inputHash: record.inputHash, preOutputHash: record.preOutputHash, profile: record.profileHash, rules: record.rulesHash, identity: metadata.identity, policyHash: record.policyHash}));
    if (!metadata.valid || expectedKey !== key || record.sourceHash !== record.inputHash || metadata.entries.filter(e => e.key === 'version').length !== 1 || metadata.entries.find(e => e.key === 'version')!.value !== record.version || journalVersions.has(record.version)) { fail('reservation journal binding corrupted'); }
    journalVersions.add(record.version);
    journalKeys.add(key);
    if (state.reservations[key]) {
      if (json(state.reservations[key]) !== json(record)) { fail('reservation state/journal mismatch'); }
    } else {
      state.reservations[key] = record;
      recovered = true;
    }
    if (!state.highestVersion || compareMozillaNumericVersions(record.version, state.highestVersion) > 0) {
      state.highestVersion = record.version;
      recovered = true;
    }
  }
  if (Object.keys(state.reservations).some(key => !journalKeys.has(key))) { fail('reservation journal missing'); }
  if (recovered) { await replace(path.join(dir, 'state.json'), json(state)); }
  return state;
}
function policy(script:ConfiguredScript):string {if(script.publish.mode!=='local'){fail('publish disabled');}validateContract('RepositoryConfig',{schemaVersion:1,outputRoot:'artifacts',targetProfile:'release-validation',projects:[{id:'release',upstream:script.sourcePath?{kind:'local',path:'source.js'}:{kind:'url',url:'https://example.invalid/source.user.js'},scripts:[script]}]});
 const u=new URL(script.publish.baseUrl);if(u.username||u.password||u.search||u.hash){fail('base URL must be credential/query/fragment free');}return hash(json(script));}
function identity(source:string,script:ConfiguredScript){const m=parseMetadata(source);if(!m.valid||m.identity.name!==script.identity.name||m.identity.namespace!==script.identity.namespace){fail('identity changed');}return m;}
async function complete(c:RunEvidenceContext,script:ConfiguredScript){
  await validateSavedReleaseEvidence(c,script);
  const r=validateContract('ConversionResult',c.result);validateContract('TargetProfile',c.profile);validateRuleSet(c.rules);
  if(r.state!=='complete'||r.inputHash!==hash(c.source)||r.outputHash!==hash(c.candidate)||c.scriptId!==script.id){fail('complete source/candidate/script binding required');}
  identity(c.candidate,script);identity(c.source,script);
  const profileText=c.profileSource;if(hash(profileText)!==r.targetHash||json(JSON.parse(profileText))!==json(c.profile)||hash(c.rulesSource)!==r.rulesHash||json(JSON.parse(c.rulesSource))!==json(c.rules)){fail('profile binding stale');}
  const diskProfile=await safe(c.bundleRoot,`profiles/${c.profile.id}.json`);if(await fs.readFile(diskProfile,'utf8')!==c.profileSource){fail('current profile file changed');}
  const files:string[]=[];async function visit(dir:string):Promise<void>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=await safe(c.bundleRoot,path.join(dir,entry.name));if(entry.isDirectory()){await visit(file);}else if(entry.name.endsWith('.json')){files.push(file);}}}await visit(await safe(c.bundleRoot,'rules'));files.sort();const active=[];for(const file of files){active.push(JSON.parse(await fs.readFile(file,'utf8')));}if(json(validateRuleSet(active))!==c.rulesSource){fail('active rule files changed');}
  const layout=await resolveRuntimeLayout(c.bundleRoot);const skill=await skillResourceIdentity(layout.skillRoot);if(skill.hash!==r.skillHash){fail('skill resources changed');}
  for(const [key,digest] of Object.entries(r.dependencyHashes)){const file=/^https?:\/\//i.test(key)?await safe(c.workspaceRoot,`.fm/dependencies/${digest}`):await safe(c.bundleRoot,key);if(hash(await fs.readFile(file))!==digest){fail('dependency changed');}}
  if(hash(json(c.rules))!==r.rulesHash){fail('rules binding stale');}
  for(const name of ['source.user.js','candidate.user.js']){const f=await safe(c.workspaceRoot,path.join(c.runDir,name));const expected=name==='source.user.js'?c.source:c.candidate;if(await fs.readFile(f,'utf8')!==expected){fail('run snapshot changed');}}
  if(!c.receipt||!c.fixture){fail('browser and fixture observations required');}
  const receipt=validateContract('BrowserAcceptance',c.receipt),fixture=checkFixtureObservation(c.fixture,c);
  for(const obs of [receipt,fixture]){for(const key of ['runId','outputHash','targetHash','rulesHash','skillHash','toolVersion'] as const){if(obs[key]!==r[key]){fail('observation binding mismatch');}}if(json(obs.dependencyHashes)!==json(r.dependencyHashes)||!obs.verifier.trim()||/REPLACE_WITH|TODO|TBD|placeholder/i.test(obs.verifier)||Date.parse(obs.timestamp)>Date.now()+300000){fail('observer/dependencies invalid');}}
  if(c.checklistId!==script.acceptance.checklistId||c.checklistHash!==hash(json(c.mandatoryBrowserSteps))){fail('configured checklist altered');}
  if(receipt.checklistId!==c.checklistId||receipt.checklistHash!==c.checklistHash||fixture.suiteId!==c.fixtureSuiteId||fixture.suiteHash!==c.fixtureSuiteHash||fixture.inputHash!==r.inputHash){fail('suite/checklist binding stale');}
  const steps=receipt.perStepResults,cases=fixture.cases;
  if(steps.length!==c.mandatoryBrowserSteps.length||cases.length!==c.mandatoryFixtureCases.length||new Set(steps.map(s=>s.id)).size!==steps.length||new Set(cases.map(s=>s.id)).size!==cases.length){fail('duplicate/missing observations');}
  for(const [expected,actual] of [[c.mandatoryBrowserSteps,steps],[c.mandatoryFixtureCases,cases]] as const){for(const x of expected){const s=actual.find(a=>a.id===x.id);if(!s||s.mandatory!==x.mandatory||(x.mandatory&&s.status!=='passed')||!s.evidence.trim()||s.evidence.startsWith('Record observed')){fail('mandatory deliberate observations missing');}}}
  if(receipt.evidenceDigest!==hash(json(steps))||fixture.evidenceDigest!==fixtureObservationDigest(fixture)){fail('evidence digest mismatch');}
  for(const kind of ['parse','metadata','lint','fixture','browser']){const v=r.verification.filter(x=>x.kind===kind);if(v.length!==1||v[0].status!=='passed'||v[0].artifactHash!==r.outputHash){fail('all five verification kinds must pass exact bytes');}}
  if(r.verification.find(x=>x.kind==='browser')!.evidenceDigest!==receipt.evidenceDigest||r.verification.find(x=>x.kind==='fixture')!.evidenceDigest!==fixture.evidenceDigest){fail('verification observation mismatch');}
  const checked=await staticVerify({source:c.candidate,profile:c.profile});if(!checked.passed){fail('current static verification failed');}
}

async function outputRoot(c:RunEvidenceContext,requested:string){const target=await safe(c.workspaceRoot,requested);const run=path.resolve(c.runDir),state=path.resolve(c.workspaceRoot,'.fm');if(target===run||target.startsWith(run+path.sep)||target===state||target.startsWith(state+path.sep)){fail('release output overlaps run/state');}return target;}
async function license(c:RunEvidenceContext,s:ConfiguredScript){if(s.publish.mode!=='local'){fail('publish disabled');}const e=s.publish.licenseEvidence;const file=/^https?:\/\//i.test(e.reference)?await safe(c.workspaceRoot,`.fm/dependencies/${e.hash}`):await safe(c.workspaceRoot,e.reference);if(hash(await fs.readFile(file))!==e.hash){fail('license evidence bytes missing/changed');}}
function freeze(source:string,script:ConfiguredScript,version:string){if(script.publish.mode!=='local'){fail('publish disabled');}const m=identity(source,script);const versions=m.entries.filter(e=>e.key==='version');if(versions.length!==1){fail('one upstream version required');}compareMozillaNumericVersions(versions[0].value,'0');
 const base=script.publish.baseUrl.endsWith('/')?script.publish.baseUrl:script.publish.baseUrl+'/';const downloadUrl=new URL(script.id+'.user.js',base).href,updateUrl=new URL(script.id+'.meta.js',base).href;
 let result=source;for(const e of [...m.entries].reverse()){if(['version','downloadURL','updateURL'].includes(e.key)){const lineStart=result.lastIndexOf('\n',e.start-1)+1;const lineEnd=result.indexOf('\n',e.end);result=result.slice(0,lineStart)+result.slice(lineEnd<0?result.length:lineEnd+1);}}
 const close=/^[ \t]*\/\/\s*==\/UserScript==[^\r\n]*/m.exec(result);if(!close){fail('metadata closing marker missing');}const newline=source.includes('\r\n')?'\r\n':'\n';result=result.slice(0,close.index)+`// @version ${version}${newline}// @downloadURL ${downloadUrl}${newline}// @updateURL ${updateUrl}${newline}`+result.slice(close.index);
 return {source:result,downloadUrl,updateUrl};}
export async function prepareCandidate(args:{context:RunEvidenceContext;script:ConfiguredScript;releaseRoot:string;auditDir:string}):Promise<ReleaseCandidate>{
 const {context:c,script:s}=args;const policyHash=hash(json({scriptPolicy:policy(s),releaseRoot:await outputRoot(c,args.releaseRoot)}));await complete(c,s);await outputRoot(c,args.releaseRoot);await license(c,s);
 return locked(c,s,async dir=>{const state=await stateAt(dir);const key=hash(json({inputHash:c.result.inputHash,preOutputHash:c.result.outputHash,profile:c.result.targetHash,rules:c.result.rulesHash,identity:s.identity,policyHash}));const prior=state.reservations[key];if(prior){if(prior.outputHash!==hash(prior.source)||prior.policyHash!==policyHash||prior.reservationId!==key||await fs.readFile(path.join(dir,key+'.json'),'utf8')!==json(prior)){fail('reservation corrupted');}return prior;}
 if(s.publish.mode!=='local'){fail('publish disabled');}let rev=s.publish.initialRevision;const major=s.publish.versionMajor;compareMozillaNumericVersions(`${major}.${rev}`,'0');const upstream=identity(c.source,s).entries.filter(e=>e.key==='version');if(upstream.length!==1){fail('one upstream version required');}
 if(compareMozillaNumericVersions(`${major}.${rev}`,upstream[0].value)<=0){fail('configured starting version must exceed upstream');}
 if(state.highestVersion){const [oldMajor,oldRev]=state.highestVersion.split('.').map(Number);if(major<oldMajor){fail('configured major regressed');}if(major===oldMajor){rev=Math.max(rev,oldRev+1);}}
 const version=`${major}.${rev}`;compareMozillaNumericVersions(version,'0');for(const previous of [state.highestVersion,state.publishedVersion]){if(previous&&compareMozillaNumericVersions(version,previous)<=0){fail('version must exceed previous reservations/publication');}}
 const frozen=freeze(c.candidate,s,version);const candidate:ReleaseCandidate={schemaVersion:1,scriptId:s.id,source:frozen.source,sourceHash:hash(c.source),inputHash:c.result.inputHash,preOutputHash:c.result.outputHash!,outputHash:hash(frozen.source),version,policyHash,reservationId:key,parentRunId:c.result.runId,profileHash:c.result.targetHash,rulesHash:c.result.rulesHash,paths:{state:path.join(dir,'state.json'),reservation:path.join(dir,key+'.json')}};
 await audit(c.workspaceRoot,args.auditDir,{kind:'release-prepare',reservationId:key,inputHash:candidate.inputHash,outputHash:candidate.outputHash,version});await writeExclusive(candidate.paths.reservation,json(candidate));state.reservations[key]=candidate;state.highestVersion=version;await replace(candidate.paths.state,json(state));return candidate;});
}
function releaseMetadata(source:string,script:ConfiguredScript,version:string,downloadUrl:string,updateUrl:string):string {
 identity(source,script);
 // A validated source has one canonical closing line; literals in leading
 // comments must not define the metadata boundary.
 const closing=/^[^\S\r\n]*\/\/[^\S\r\n]*==\/UserScript==[^\S\r\n]*(?:\r?\n|$)/m.exec(source);
 if(!closing){fail('canonical metadata closing line missing');}
 const metadata=source.slice(0,closing.index+closing[0].length);
 const parsed=identity(metadata,script);
 for(const [key,expected]of [['version',version],['downloadURL',downloadUrl],['updateURL',updateUrl]]){
  const entries=parsed.entries.filter(entry=>entry.key===key);
  if(entries.length!==1||entries[0].value!==expected){fail('release metadata field changed');}
 }
 return metadata;
}
export async function finalizeRelease(args:{context:RunEvidenceContext;candidate:ReleaseCandidate;script:ConfiguredScript;releaseRoot:string;auditDir:string}):Promise<ReleaseManifest>{
 const {context:c,candidate:p,script:s}=args;const policyHash=hash(json({scriptPolicy:policy(s),releaseRoot:await outputRoot(c,args.releaseRoot)}));await complete(c,s);await license(c,s);
 if(c.parentRunId!==p.parentRunId||c.result.runId===p.parentRunId||c.releaseReservationId!==p.reservationId||c.releasePolicyHash!==policyHash||p.policyHash!==policyHash||c.result.inputHash!==p.inputHash||hash(c.source)!==p.sourceHash||c.candidate!==p.source||hash(p.source)!==p.outputHash||c.result.targetHash!==p.profileHash||c.result.rulesHash!==p.rulesHash){fail('derived run/reservation/source binding mismatch');}
 return locked(c,s,async dir=>{const state=await stateAt(dir);if(json(state.reservations[p.reservationId])!==json(p)||await fs.readFile(path.join(dir,p.reservationId+'.json'),'utf8')!==json(p)){fail('reservation stale/tampered');}
 const root=await outputRoot(c,args.releaseRoot);await fs.mkdir(root,{recursive:true});const frozen=freeze(c.candidate,s,p.version);if(frozen.source!==c.candidate){fail('frozen metadata changed');}
 if(s.publish.mode!=='local'){fail('publish disabled');}const manifest=validateContract('ReleaseManifest',{schemaVersion:1,scriptId:s.id,identity:s.identity,inputHash:p.inputHash,outputHash:p.outputHash,profileHash:p.profileHash,rulesHash:p.rulesHash,verifiedReceipt:c.receipt,version:p.version,licenseEvidence:s.publish.licenseEvidence,downloadUrl:frozen.downloadUrl,updateUrl:frozen.updateUrl});
 const metadata=releaseMetadata(c.candidate,s,p.version,frozen.downloadUrl,frozen.updateUrl);const data:Record<string,string>={[s.id+'.user.js']:c.candidate,[s.id+'.meta.js']:metadata,[s.id+'.manifest.json']:json(manifest)};const backups=new Map<string,string>();
 for(const name of Object.keys(data)){const file=await safe(c.workspaceRoot,path.join(root,name));try{const old=await fs.readFile(file,'utf8');if(state.owned?.[file]!==hash(old)){fail('unowned/modified output collision');}backups.set(file,old);}catch(e:any){if(e.code!=='ENOENT'){throw e;}}}
 if(state.publishedVersion&&compareMozillaNumericVersions(p.version,state.publishedVersion)<0){fail('publication regressed');}
 await audit(c.workspaceRoot,args.auditDir,{kind:'release-finalize',reservationId:p.reservationId,outputHash:p.outputHash,runId:c.result.runId});const temps=new Map<string,string>();const installed:string[]=[];
 try{for(const [name,value]of Object.entries(data)){const file=path.join(root,name),tmp=file+'.tmp-'+randomUUID();await writeExclusive(tmp,value);temps.set(file,tmp);}for(const [file,tmp]of temps){if(backups.has(file)){if(hash(await fs.readFile(file))!==state.owned?.[file]){fail('output changed during transaction');}await fs.rename(tmp,file);}else{await fs.link(tmp,file);}installed.push(file);}state.owned=Object.fromEntries(Object.entries(data).map(([name,value])=>[path.join(root,name),hash(value)]));state.publishedVersion=p.version;await replace(path.join(dir,'state.json'),json(state));}
 catch(e){for(const file of installed.reverse()){const old=backups.get(file);if(old!==undefined){await replace(file,old);}else{await fs.unlink(file);}}throw e;}finally{for(const tmp of temps.values()){await fs.unlink(tmp).catch(()=>{});}}return manifest;});
}
