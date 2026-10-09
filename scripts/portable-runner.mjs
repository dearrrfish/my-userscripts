import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { buildBundle, verifyBundle, checkNode } from './bundle.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const support=['scripts/bundle.mjs','scripts/portable-runner.mjs','fixtures/portable/skill-forward.json'];
function validateResources(files) {
 if(!files || typeof files !== 'object' || Array.isArray(files)) { throw new Error('Skill resource map required'); }
 for(const [relative,content] of Object.entries(files)) { if(typeof content !== 'string' || !/^skills\/fm-convert\/(SKILL\.md|(?:references|agents|scripts|assets)\/[^\\]+)$/.test(relative) || relative.split('/').some(v=>!v || v==='.' || v==='..')) { throw new Error('Invalid candidate skill resource'); } }
 const skill=files['skills/fm-convert/SKILL.md'];
 if(!skill || !/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(skill)) { throw new Error('Skill frontmatter required'); }
 const front=skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
 if(!/^name:\s*fm-convert\s*$/m.test(front) || !/^description:\s*\S.+$/m.test(front)) { throw new Error('Skill name or description invalid'); }
 for(const [relative,content] of Object.entries(files)) {
  if(!relative.endsWith('.md')) { continue; }
  const refs=[...content.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1].split(/\s+"/)[0]);
  for(const ref of refs) { if(/^(?:https?:|#)/.test(ref)) { continue; } if(path.isAbsolute(ref) || ref.includes('\\')) { throw new Error('Nonportable skill reference'); } const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(relative),ref.split('#')[0])); if(!files[resolved]) { throw new Error(`Missing local skill reference: ${resolved}`); } }
 }
}
async function child(main,cwd,args) {
 return new Promise((resolve,reject)=>{
  const environment={...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:''}; delete environment.NODE_TEST_CONTEXT;
  const subprocess=spawn(process.execPath,[main,...args],{cwd,env:environment,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr=''; const timer=setTimeout(()=>{subprocess.kill();reject(Object.assign(new Error('Portable CLI timed out'),{code:'EIO'}));},30000);
  subprocess.stdout.on('data',v=>{stdout+=v;if(stdout.length>2e6){subprocess.kill();}}); subprocess.stderr.on('data',v=>{stderr+=v;});
  subprocess.on('error',e=>{clearTimeout(timer);reject(e);}); subprocess.on('close',code=>{clearTimeout(timer);try { const result=JSON.parse(stdout); if(result.code!==code) { throw new Error('CLI exit/result mismatch'); } resolve(result); } catch (error) { reject(Object.assign(new Error(`Portable CLI ${args[0]} failed to return JSON (exit ${code}): ${error.message}`),{code:'EIO'})); }});
 });
}
export async function verifySkillCandidate({bundleRoot,candidateFiles,candidateRuleFiles,auditDir}) {
 checkNode(); const root=await fs.realpath(bundleRoot); validateResources(candidateFiles);
 const audit=path.resolve(auditDir); if(!audit.startsWith(path.join(root,'.fm')+path.sep)) { throw new Error('Portable candidate audit must be inside source workspace .fm'); }
 if(candidateRuleFiles) { const {validateContract}=await import(path.join(root,'packages/contracts/dist/index.js')); for(const [relative,content] of Object.entries(candidateRuleFiles)) { if(!/^rules\/[^\\]+\.json$/.test(relative) || relative.split('/').some(v=>!v || v==='.' || v==='..')) { throw new Error('Invalid candidate rule path'); } validateContract('Rule',JSON.parse(content)); } }
 const suiteBytes=await fs.readFile(path.join(root,support[2])); const frozen=JSON.parse(suiteBytes);
 const expected=['offline-standalone-conversion','unsupported-or-dynamic-api-block','pending-browser-not-complete','stale-evidence-rejected','proposed-change-requires-exact-human-approval'];
 if(frozen.id!=='fm-skill-forward-v1' || canonical(frozen.cases.map(c=>c.id))!==canonical(expected) || frozen.cases.some(c=>c.mandatory!==true || typeof c.request!=='string')) { throw new Error('Frozen behavior suite invalid'); }
 const suiteHash=sha(canonical(frozen)); const suite={id:frozen.id,hash:suiteHash,cases:frozen.cases.map(({id,mandatory})=>({id,mandatory}))};
 const runnerHash=sha(canonical(await Promise.all(support.map(async relative=>({path:relative,hash:sha(await fs.readFile(path.join(root,relative)))})))));
 // Guard every parent through the same builder path before writing further evidence.
 const candidateDir=path.join(audit,'candidate-skill'); const built=await buildBundle({workspaceRoot:root,outputDir:candidateDir,skillFiles:candidateFiles,ruleFiles:candidateRuleFiles}); await verifyBundle(built.skillRoot);
 const work=path.join(audit,'unrelated cwd with spaces'); await fs.mkdir(work); const main=path.join(built.runtimeRoot,'packages/cli/src/main.mjs');
 await fs.writeFile(path.join(work,'safe.user.js'),frozen.cases[0].source,{flag:'wx'}); await fs.writeFile(path.join(work,'dynamic.user.js'),frozen.cases[1].source,{flag:'wx'});
 const target='firemonkey-3.9-firefox-157.0'; const safe=await child(main,work,['convert','--input','safe.user.js','--output','safe-out.user.js','--target',target]);
 if(safe.code!==0 || safe.state!=='pending-browser') { throw new Error('Offline standalone conversion invariant failed'); }
 const output=await fs.readFile(safe.output,'utf8'); const original=frozen.cases[0].source;
 if(output!==original) { throw new Error('Safe standalone fixture changed unexpectedly'); }
 const blocked=await child(main,work,['convert','--input','dynamic.user.js','--output','dynamic-out.user.js','--target',target]);
 if(blocked.code!==2 || !['blocked','failed'].includes(blocked.state)) { throw new Error('Dynamic API was not blocked'); }
 const pending=await child(main,work,['verify','--run',safe.runId,'--static']); if(pending.code!==3 || pending.state!=='pending-browser') { throw new Error('Pending evidence incorrectly completed'); }
 await fs.appendFile(safe.output,'\n// synthetic mutation\n'); const stale=await child(main,work,['verify','--run',safe.runId,'--static']); if(stale.code!==2) { throw new Error('Stale output was accepted'); }
 const candidateSkillHash=Object.keys(candidateFiles).length ? sha(canonical(Object.keys(candidateFiles).sort().map(relative=>({path:relative,hash:sha(candidateFiles[relative])})))) : sha('');
 const observations=[{id:expected[0],code:safe.code,state:safe.state,inputHash:sha(original),outputHash:sha(output)},{id:expected[1],code:blocked.code,state:blocked.state},{id:expected[2],code:pending.code,state:pending.state},{id:expected[3],code:stale.code}];
 const machineDigest=sha(canonical({candidateSkillHash,suiteHash,runnerHash,observations}));
 const rawRequestsFile=path.join(audit,'raw-requests.json'); await fs.writeFile(rawRequestsFile,JSON.stringify({suiteId:frozen.id,cases:frozen.cases},null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(audit,'machine-observations.json'),JSON.stringify({machineDigest,observations,qualitativeCase:expected[4],qualitativeStatus:'pending independent evaluator'},null,2)+'\n',{flag:'wx'});
 return {candidateSkillHash,suiteHash,runnerHash,machineDigest,suite,candidateDir,rawRequestsFile};
}
