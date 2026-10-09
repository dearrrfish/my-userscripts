import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {buildBundle,verifyBundle} from '../../../../scripts/bundle.mjs';
import {verifySkillCandidate} from '../../../../scripts/portable-runner.mjs';
const root=path.resolve(import.meta.dirname,'../../../..');
const resources={'skills/fm-convert/SKILL.md':'---\nname: fm-convert\ndescription: Convert userscripts with explicit verification and approval.\n---\nRead [guide](references/guide.md).\n','skills/fm-convert/references/guide.md':'Self-owned synthetic instructions for portable testing.\n'};
await fs.mkdir(path.join(root,'.fm'),{recursive:true});
const base=await fs.mkdtemp(path.join(root,'.fm/portable-tests-'));
let built;
test('bundle has pinned closure, retained licenses, internal links and exclusive output',async()=>{
 built=await buildBundle({workspaceRoot:root,outputDir:path.join(base,'bundle with spaces'),skillFiles:resources});
 const manifest=await verifyBundle(built.skillRoot);assert.ok(manifest.records.some(r=>r.type==='symlink'));assert.ok(manifest.records.some(r=>r.path.includes('node_modules/.pnpm/eslint@10.11.0/')));
 const inventory=JSON.parse(await fs.readFile(path.join(built.runtimeRoot,'licenses/inventory.json')));assert.ok(inventory.dependencies.length>50);assert.ok(inventory.dependencies.some(v=>v.name==='eslint'&&v.noticePaths.length));assert.match(inventory.toolLicense,/No tool license/);assert.equal(inventory.profiles[0],'profiles/licenses/firemonkey-MPL-2.0.txt');
 assert.equal(manifest.records.some(r=>r.path.includes('.pnpm-store')||r.path.endsWith('events.jsonl')),false);
 await assert.rejects(buildBundle({workspaceRoot:root,outputDir:built.skillRoot,skillFiles:resources}),/EEXIST/);
 await assert.rejects(buildBundle({workspaceRoot:root,outputDir:path.join(root,'outside-bundle'),skillFiles:resources}),/inside workspace/);
});
test('manifest rejects added, missing, modified and escaping symlink files',async()=>{
 const file=path.join(built.skillRoot,'references/guide.md');const original=await fs.readFile(file);
 await fs.writeFile(file,'changed');await assert.rejects(verifyBundle(built.skillRoot),/mismatch/);await fs.writeFile(file,original);
 const extra=path.join(built.skillRoot,'extra.txt');await fs.writeFile(extra,'extra');await assert.rejects(verifyBundle(built.skillRoot),/mismatch/);await fs.unlink(extra);
 const saved=path.join(base,'held-resource');await fs.rename(file,saved);await assert.rejects(verifyBundle(built.skillRoot),/mismatch/);await fs.rename(saved,file);
 await fs.symlink(root,extra);await assert.rejects(verifyBundle(built.skillRoot),/escapes/);await fs.unlink(extra);
 const link=JSON.parse(await fs.readFile(built.manifestPath)).records.find(r=>r.type==='symlink');const linkPath=path.join(built.skillRoot,link.path);await fs.unlink(linkPath);await fs.symlink('/tmp',linkPath);await assert.rejects(verifyBundle(built.skillRoot),/escapes/);await fs.unlink(linkPath);await fs.symlink(link.target,linkPath);
 await verifyBundle(built.skillRoot);
});
test('trusted child CLI smoke is offline from unrelated cwd; machine digest stable and fifth case pending',async()=>{
 const first=await verifySkillCandidate({bundleRoot:root,candidateFiles:resources,auditDir:path.join(base,'run-one')});
 const rulePath=(await fs.readdir(path.join(root,'rules/shared'))).find(v=>v.endsWith('.json')); const rule=await fs.readFile(path.join(root,'rules/shared',rulePath),'utf8');
 const second=await verifySkillCandidate({bundleRoot:root,candidateFiles:resources,candidateRuleFiles:{[`rules/shared/${rulePath}`]:rule},auditDir:path.join(base,'run-two')});
 assert.equal(first.machineDigest,second.machineDigest);assert.equal(first.runnerHash,second.runnerHash);assert.equal(first.suite.cases.length,5);
 const evidence=JSON.parse(await fs.readFile(path.join(path.dirname(first.rawRequestsFile),'machine-observations.json')));assert.match(evidence.qualitativeStatus,/pending/);assert.equal(evidence.observations[2].code,3);assert.equal(evidence.observations[3].code,2);
 const requests=JSON.parse(await fs.readFile(first.rawRequestsFile));assert.equal(requests.cases.length,5);assert.equal('observations' in requests,false);
});
test('invalid drafts and unsafe audit paths fail before candidate execution',async()=>{
 await assert.rejects(verifySkillCandidate({bundleRoot:root,candidateFiles:{'skills/fm-convert/SKILL.md':'no frontmatter'},auditDir:path.join(base,'invalid')}),/frontmatter/);
 await assert.rejects(verifySkillCandidate({bundleRoot:root,candidateFiles:{...resources,'skills/fm-convert/../bad.md':'bad'},auditDir:path.join(base,'invalid2')}),/Invalid candidate/);
 await assert.rejects(verifySkillCandidate({bundleRoot:root,candidateFiles:{...resources,'skills/fm-convert/SKILL.md':resources['skills/fm-convert/SKILL.md']+'\n[missing](references/missing.md)'},auditDir:path.join(base,'invalid3')}),/Missing local/);
 await assert.rejects(verifySkillCandidate({bundleRoot:root,candidateFiles:resources,auditDir:'/tmp/outside'}),/inside source/);
 await assert.rejects(verifySkillCandidate({bundleRoot:root,candidateFiles:resources,candidateRuleFiles:{'rules/bad.json':'{}'},auditDir:path.join(base,'invalid4')}));
});

test('actual skill launcher verifies bundle before importing CLI',async()=>{
 const {skillResourceIdentity}=await import('../../../contracts/dist/index.js');const all=(await skillResourceIdentity(path.join(root,'skills/fm-convert'))).files;
 const real=await buildBundle({workspaceRoot:root,outputDir:path.join(base,'real-launcher'),skillFiles:all});
 await fs.copyFile(path.join(root,'config/scripts.example.json'),path.join(base,'config.json'));
 const {spawn}=await import('node:child_process');
 const invoke=()=>new Promise((resolve,reject)=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const proc=spawn(process.execPath,[path.join(real.skillRoot,'scripts/fm.mjs'),'config','validate','--config','config.json'],{cwd:base,env,stdio:['ignore','pipe','pipe']});let out='',err='';proc.stdout.on('data',v=>{out+=v;});proc.stderr.on('data',v=>{err+=v;});proc.on('error',reject);proc.on('close',code=>resolve({code,out,err}));});
 const valid=await invoke();assert.equal(valid.code,0,valid.err);assert.equal(JSON.parse(valid.out).code,0);
 const marker=path.join(base,'verifier-executed');await fs.appendFile(path.join(real.runtimeRoot,'scripts/bundle.mjs'),`\nawait (await import('node:fs/promises')).writeFile(${JSON.stringify(marker)},'bad');\n`);const invalid=await invoke();assert.notEqual(invalid.code,0);assert.match(invalid.err,/manifest|mismatch|Bundle/i);assert.equal(invalid.out,'');await assert.rejects(fs.stat(marker));
});
