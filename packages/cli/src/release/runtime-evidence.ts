import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateContract, runtimeSupportPaths, type RunEvidenceContext, type RepositoryConfig} from '@fm/contracts';
type Script=RepositoryConfig['projects'][number]['scripts'][number];
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
function assert(value:unknown,message:string):asserts value {if(!value){throw new Error(`Release blocked: ${message}`);}}
async function safe(root:string,relative:string){const base=await fs.realpath(root),target=path.resolve(base,relative);assert(target.startsWith(base+path.sep),'runtime/evidence path escapes root');let cursor=base;for(const part of path.relative(base,target).split(path.sep)){cursor=path.join(cursor,part);const stat=await fs.lstat(cursor);assert(!stat.isSymbolicLink(),'runtime/evidence symlink');}return target;}
export async function validateSavedReleaseEvidence(c:RunEvidenceContext,script:Script){
 const fixed=['packages/cli/dist/index.js','packages/converter/dist/index.js','packages/contracts/dist/index.js','pnpm-lock.yaml'];
 const actual:Record<string,string>={};for(const relative of fixed){actual[relative]=hash(await fs.readFile(await safe(c.bundleRoot,relative)));}
 async function visit(relative:string):Promise<void>{let dir;try{dir=await safe(c.bundleRoot,relative);}catch(e:any){if(e.code==='ENOENT'){return;}throw e;}for(const entry of await fs.readdir(dir,{withFileTypes:true})){assert(!entry.isSymbolicLink(),'runtime module symlink');const file=`${relative}/${entry.name}`;if(entry.isDirectory()){await visit(file);}else if(entry.name.endsWith('.js')){assert(entry.isFile(),'runtime module is not regular file');actual[file]=hash(await fs.readFile(await safe(c.bundleRoot,file)));}}}
 for(const name of ['cli','contracts','converter','evolution']){await visit(`packages/${name}/dist`);}
 for(const relative of runtimeSupportPaths){try{actual[relative]=hash(await fs.readFile(await safe(c.bundleRoot,relative)));}catch(error:any){if(error.code!=='ENOENT'){throw error;}}}
 const recorded=Object.fromEntries(Object.entries(c.result.dependencyHashes).filter(([key])=>!/^https?:\/\//i.test(key)));
 assert(json(Object.keys(recorded).sort())===json(Object.keys(actual).sort()),'runtime dependency keyset changed or omitted');for(const [key,digest]of Object.entries(actual)){assert(recorded[key]===digest,'runtime dependency content changed');}
 const root=await fs.realpath(c.workspaceRoot);const expectedRun=path.join(root,'.fm/runs',c.result.runId);assert(path.resolve(c.runDir)===expectedRun,'canonical ignored run path required');const run=await safe(root,path.relative(root,expectedRun));
 const read=async(name:string)=>JSON.parse(await fs.readFile(await safe(root,path.join(run,name)),'utf8'));
 const manifest=await read('manifest.json');assert(manifest.schemaVersion===1&&manifest.root===root&&manifest.result?.runId===c.result.runId&&json(manifest.result)===json(c.result),'saved manifest/result stale');
 assert(!manifest.dryRun&&manifest.materialized===true,'saved run not materialized');
 assert(manifest.scriptId===c.scriptId&&json(manifest.identity)===json(c.identity)&&json(c.identity)===json(script.identity),'saved identity/script stale');
 assert(manifest.checklistId===c.checklistId&&manifest.checklistHash===c.checklistHash&&json(manifest.steps.map((s:{id:string;mandatory:boolean})=>({id:s.id,mandatory:s.mandatory})))===json(c.mandatoryBrowserSteps),'saved browser suite stale');
 assert(json(manifest.fixtureSuite)===json({id:c.fixtureSuiteId,hash:c.fixtureSuiteHash,cases:c.mandatoryFixtureCases}),'saved fixture suite stale');
 assert(json(await read('acceptance.json'))===json(c.receipt)&&json(await read('fixture.json'))===json(c.fixture),'saved observations stale');
 for(const key of ['parentRunId','releaseReservationId','releasePolicyHash'] as const){assert(manifest[key]===c[key],'saved release lineage stale');}
 assert(c.configPath&&c.configHash&&c.config,'bound configured release required');
 const configPath=await safe(root,c.configPath),text=await fs.readFile(configPath,'utf8');const config=validateContract('RepositoryConfig',JSON.parse(text));assert(hash(text)===c.configHash&&json(config)===json(c.config)&&manifest.configPath===c.configPath&&manifest.configHash===c.configHash,'saved configuration stale');
 const selected=config.projects.flatMap(p=>p.scripts.filter(s=>s.id===c.scriptId).map(s=>({project:p,script:s})));assert(selected.length===1&&json(selected[0].script)===json(script),'configured release script changed');
 if(selected[0].project.upstream.kind==='local'){const original=path.join(selected[0].project.upstream.path,selected[0].script.sourcePath!);assert(hash(await fs.readFile(await safe(root,original)))===c.result.inputHash,'configured local upstream changed');}
 if(manifest.inputPath){assert(hash(await fs.readFile(await safe(root,manifest.inputPath)))===c.result.inputHash,'current input changed');}
 if(manifest.outputPath){assert(hash(await fs.readFile(await safe(root,manifest.outputPath)))===c.result.outputHash,'current output changed');}
 if(manifest.sourceLockHash){assert(hash(await fs.readFile(await safe(root,'source.lock.json')))===manifest.sourceLockHash,'current source lock changed');}
 const declared=Object.fromEntries((manifest.dependencies??[]).map((d:{url:string;hash:string})=>[d.url,d.hash]));const recordedUrls=Object.fromEntries(Object.entries(c.result.dependencyHashes).filter(([k])=>/^https?:\/\//i.test(k)));
 assert(json(Object.keys(declared).sort())===json(Object.keys(recordedUrls).sort()),'source dependency set changed');for(const [url,digest]of Object.entries(recordedUrls)){assert(declared[url]===digest&&hash(await fs.readFile(await safe(root,`.fm/dependencies/${digest}`)))===digest,'source dependency stale');}
}
