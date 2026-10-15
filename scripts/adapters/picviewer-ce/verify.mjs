import fs from 'node:fs';import {staticVerify,parseMetadata,hash} from '../../../packages/converter/dist/index.js';
const base='.fm/adaptations/picviewer-ce/';const source=fs.readFileSync(base+'candidate.user.js','utf8');const profileText=fs.readFileSync('profiles/firemonkey-3.9-firefox-157.0.json','utf8');const profile=JSON.parse(profileText);
const lock=JSON.parse(fs.readFileSync('source.lock.json'));const snapshots=lock.snapshots.flatMap(s=>s.dependencies);
const dependencies=parseMetadata(source).entries.filter(e=>e.key==='require').map(e=>{
 const dependency=snapshots.find(d=>d.url===e.value)??(e.value==='https://cdn.jsdelivr.net/npm/video.js@8.23.3/dist/video.min.js'?{url:e.value,hash:'41f59413f148335cb442008aad4c619c909e4ec17edef88e94685f11fb70d440'}:undefined);
 if(!dependency){throw new Error('Missing dependency binding: '+e.value);}const text=fs.readFileSync('.fm/dependencies/'+dependency.hash,'utf8');if(hash(text)!==dependency.hash){throw new Error('Dependency digest mismatch');}return {...dependency,source:text};
});
const result=await staticVerify({source,profile,dependencies});fs.writeFileSync(base+'static-verification.json',JSON.stringify({candidateHash:hash(source),profileHash:hash(profileText),dependencies:dependencies.map(({url,hash})=>({url,hash})),...result},null,2));
console.log(JSON.stringify({candidateHash:hash(source),passed:result.passed,errors:result.findings.filter(f=>f.severity==='error'),verification:result.verification.map(({kind,status})=>({kind,status}))},null,2));if(!result.passed){process.exitCode=1;}
