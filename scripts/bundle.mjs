import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
function inside(root, file) { return file === root || file.startsWith(root + path.sep); }
export function checkNode() { const [major,minor,patch] = process.versions.node.split('.').map(Number); if (major !== 24 || minor < 21 || (minor === 21 && patch < 0)) { throw new Error('Portable runtime requires Node >=24.21.0 <25'); } }
async function safeDestination(root, output) {
 const resolved = path.resolve(output); const relative = path.relative(root,resolved);
 if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !['.fm','artifacts'].includes(relative.split(path.sep)[0])) { throw new Error('Bundle output must be inside workspace .fm or artifacts'); }
 let current = root;
 for (const part of relative.split(path.sep).slice(0,-1)) { current = path.join(current,part); try { const stat = await fs.lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) { throw new Error('Bundle parent must be a real directory'); } } catch(e) { if(e.code !== 'ENOENT') { throw e; } await fs.mkdir(current); } }
 return resolved;
}
async function copyTree(source,destination,sourceRoot,excluded = new Set()) {
 const stat = await fs.lstat(source);
 if (stat.isSymbolicLink()) {
  const link = await fs.readlink(source); const resolved = path.resolve(path.dirname(source),link);
  if(path.isAbsolute(link) || !inside(sourceRoot,resolved) || !inside(sourceRoot,await fs.realpath(source))) { throw new Error('External or absolute source symlink rejected'); }
  await fs.symlink(link,destination);
 } else if(stat.isDirectory()) {
  await fs.mkdir(destination,{recursive:true});
  for(const name of (await fs.readdir(source)).sort()) { if(!excluded.has(name)) { await copyTree(path.join(source,name),path.join(destination,name),sourceRoot,excluded); } }
 } else if(stat.isFile()) { await fs.copyFile(source,destination,fs.constants.COPYFILE_EXCL); }
 else { throw new Error('Unsupported source file type'); }
}
export async function inventory(root) {
 const records=[];
 async function visit(relative) {
  const file=path.join(root,relative); const stat=await fs.lstat(file);
  if(stat.isSymbolicLink()) { const target=await fs.readlink(file); if(path.isAbsolute(target) || !inside(root,path.resolve(path.dirname(file),target)) || !inside(root,await fs.realpath(file))) { throw new Error('Bundle symlink escapes or is dangling'); } records.push({path:relative,type:'symlink',target}); }
  else if(stat.isDirectory()) { for(const name of (await fs.readdir(file)).sort()) { await visit(relative ? `${relative}/${name}` : name); } }
  else if(stat.isFile()) { if(relative !== 'runtime/bundle-manifest.json') { records.push({path:relative,type:'file',hash:sha(await fs.readFile(file))}); } }
  else { throw new Error('Unsupported bundle file type'); }
 }
 await visit(''); return records.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function verifyBundle(skillRoot) {
 checkNode(); const root=await fs.realpath(skillRoot); const manifest=JSON.parse(await fs.readFile(path.join(root,'runtime/bundle-manifest.json'),'utf8'));
 if(manifest.schemaVersion !== 1 || !Array.isArray(manifest.records) || Object.keys(manifest).sort().join(',') !== 'layout,licenseInventory,nodeRange,records,recordsDigest,schemaVersion,skillResourceHash') { throw new Error('Invalid bundle manifest'); }
 if(manifest.nodeRange !== '>=24.21.0 <25' || manifest.layout !== 'fm-skill-runtime-v1' || manifest.licenseInventory !== 'runtime/licenses/inventory.json' || !/^[a-f0-9]{64}$/.test(manifest.skillResourceHash) || manifest.recordsDigest !== sha(canonical(manifest.records))) { throw new Error('Invalid bundle descriptor or records digest'); }
 if(canonical(await inventory(root)) !== canonical(manifest.records)) { throw new Error('Bundle manifest mismatch: added, missing or changed resources'); }
 const identity=await resourceHash(root); if(identity !== manifest.skillResourceHash) { throw new Error('Bundle skill resource hash mismatch'); }
 return manifest;
}
async function resourceHash(root) {
 const records=(await inventory(root)).filter(r=>!r.path.startsWith('runtime/'));
 if(records.some(r=>r.type!=='file')) { throw new Error('Skill resources must be regular files'); }
 return sha(canonical(records.map(r=>({path:`skills/fm-convert/${r.path}`,hash:r.hash}))));
}
function canonicalResource(relative,prefix) {
 if(typeof relative !== 'string' || !relative.startsWith(prefix) || relative.includes('\\') || relative.split('/').some(v=>!v || v==='.' || v==='..')) { throw new Error('Invalid resource path'); }
 return relative.slice(prefix.length);
}
export async function buildBundle({workspaceRoot,outputDir,skillFiles,ruleFiles}) {
 checkNode(); const source=await fs.realpath(workspaceRoot); const destination=await safeDestination(source,outputDir);
 await fs.mkdir(destination); // Exclusive reservation. Absence of commit manifest means incomplete.
 const runtimeRoot=path.join(destination,'runtime'); await fs.mkdir(runtimeRoot);
 for(const name of ['contracts','converter','evolution','cli']) {
  const base=path.join(runtimeRoot,'packages',name); await fs.mkdir(base,{recursive:true});
  for(const part of ['dist','package.json','node_modules']) { await copyTree(path.join(source,'packages',name,part),path.join(base,part),source,new Set(['.bin'])); }
 }
 await fs.mkdir(path.join(runtimeRoot,'packages/cli/src')); await copyTree(path.join(source,'packages/cli/src/main.mjs'),path.join(runtimeRoot,'packages/cli/src/main.mjs'),source);
 await fs.mkdir(path.join(runtimeRoot,'node_modules')); await copyTree(path.join(source,'node_modules/.pnpm'),path.join(runtimeRoot,'node_modules/.pnpm'),source,new Set(['.bin']));
 for(const part of ['profiles','rules']) { await copyTree(path.join(source,part),path.join(runtimeRoot,part),source); }
 await copyTree(path.join(source,'pnpm-lock.yaml'),path.join(runtimeRoot,'pnpm-lock.yaml'),source);
 for(const relative of ['scripts/bundle.mjs','scripts/portable-runner.mjs','fixtures/portable/skill-forward.json']) { await fs.mkdir(path.dirname(path.join(runtimeRoot,relative)),{recursive:true}); await copyTree(path.join(source,relative),path.join(runtimeRoot,relative),source); }
 if(skillFiles) {
  if(!skillFiles['skills/fm-convert/SKILL.md']) { throw new Error('Candidate SKILL.md required'); }
  for(const [relative,content] of Object.entries(skillFiles)) { const local=canonicalResource(relative,'skills/fm-convert/'); if(!['SKILL.md','references','agents','scripts','assets'].includes(local.split('/')[0])) { throw new Error('Unsupported skill resource'); } await fs.mkdir(path.dirname(path.join(destination,local)),{recursive:true}); await fs.writeFile(path.join(destination,local),content,{flag:'wx'}); }
 } else { for(const part of ['SKILL.md','references','agents','scripts','assets']) { try { await copyTree(path.join(source,'skills/fm-convert',part),path.join(destination,part),source); } catch(e) { if(e.code !== 'ENOENT') { throw e; } } } }
 if(ruleFiles) { for(const [relative,content] of Object.entries(ruleFiles)) { canonicalResource(relative,'rules/'); const file=path.join(runtimeRoot,relative); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,content); } }
 const licenses=[];
 async function collect(dir) { for(const entry of await fs.readdir(dir,{withFileTypes:true})) { const file=path.join(dir,entry.name); if(entry.isDirectory()) { await collect(file); } else if(entry.isFile() && /^package\.json$/.test(entry.name)) { const info=JSON.parse(await fs.readFile(file,'utf8')); if(info.name && info.version) { const notices=(await fs.readdir(dir)).filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name)); licenses.push({name:info.name,version:info.version,declaredLicense:info.license ?? null,packagePath:path.relative(runtimeRoot,file),noticePaths:notices.map(n=>path.relative(runtimeRoot,path.join(dir,n)))}); } } } }
 await collect(path.join(runtimeRoot,'node_modules/.pnpm'));
 const profileNotice='profiles/licenses/firemonkey-MPL-2.0.txt'; await fs.access(path.join(runtimeRoot,profileNotice));
 await fs.mkdir(path.join(runtimeRoot,'licenses')); await fs.writeFile(path.join(runtimeRoot,'licenses/inventory.json'),JSON.stringify({schemaVersion:1,closure:'Complete pinned pnpm dependency closure including development dependencies; original notices retained in place',toolLicense:'No tool license has been declared; no license grant invented',profiles:[profileNotice],dependencies:licenses.sort((a,b)=>a.packagePath < b.packagePath ? -1 : 1)},null,2)+'\n',{flag:'wx'});
 const records=await inventory(destination); const manifestPath=path.join(runtimeRoot,'bundle-manifest.json'); const temporary=path.join(path.dirname(destination),`.fm-bundle-manifest-${randomUUID()}.tmp`);
 const manifest={schemaVersion:1,nodeRange:'>=24.21.0 <25',layout:'fm-skill-runtime-v1',licenseInventory:'runtime/licenses/inventory.json',skillResourceHash:await resourceHash(destination),recordsDigest:sha(canonical(records)),records};
 await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); await fs.link(temporary,manifestPath);
 try { await fs.unlink(temporary); } catch { /* Committed bundle remains usable; cleanup failure is not rollback. */ }
 await verifyBundle(destination); return {skillRoot:destination,runtimeRoot,manifestPath};
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [workspaceRoot,outputDir] = process.argv.slice(2); if(!workspaceRoot || !outputDir) { throw new Error('Usage: node scripts/bundle.mjs <workspace-root> <ignored-new-output-directory>'); }
 console.log(JSON.stringify(await buildBundle({workspaceRoot,outputDir}),null,2));
}
