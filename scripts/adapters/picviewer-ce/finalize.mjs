import fs from 'node:fs';import ts from './typescript.mjs';
const base='.fm/adaptations/picviewer-ce/';let s=fs.readFileSync(base+'candidate.user.js','utf8');
s=s.replace(/catch\s+\{(?=\n\n            \/\/ well, fuck)/,'catch (e) {');
// The strict rule identified these final writes as dead. Retain the old value
// used for indexing and every surrounding member/reference evaluation.
const t=ts.createSourceFile('input.js',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const edits=[];
for(const m of JSON.parse(fs.readFileSync(base+'lint-current.json')).filter(m=>m.ruleId==='no-useless-assignment'&&['from','table_index'].some(name=>m.message.includes("'"+name+"'")))){
 const line=s.split('\n')[m.line-1];const start=t.getPositionOfLineAndCharacter(m.line-1,m.column-1);let node;
 function walk(n){if(ts.isPostfixUnaryExpression(n)&&n.getStart(t)===start){node=n;}ts.forEachChild(n,walk);}walk(t);
 if(!node){throw new Error('Expected reported final postfix write');}
 edits.push({start:node.getStart(t),end:node.end,text:node.operand.getText(t)});
}
for(const e of edits.sort((a,b)=>b.start-a.start)){s=s.slice(0,e.start)+e.text+s.slice(e.end);}
// FireMonkey download(url, filename) cannot honor the upstream object options.
// Keep the existing blob path, including its request headers/cookies and retries.
const downloadTree=ts.createSourceFile('input.js',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let downloadInitializer;
function findDownload(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='_GM_download'){downloadInitializer=node.initializer;}ts.forEachChild(node,findDownload);}
findDownload(downloadTree);
if(!downloadInitializer||!ts.isConditionalExpression(downloadInitializer)||!ts.isArrowFunction(downloadInitializer.whenTrue)){throw new Error('Expected original download fallback conditional');}
s=s.slice(0,downloadInitializer.getStart(downloadTree))+'// FireMonkey uses download(url, filename), without the object options needed here.\n    // Preserve the blob loader request headers, cookies, retries and saveAs failures.\n    '+downloadInitializer.whenTrue.getText(downloadTree)+s.slice(downloadInitializer.end);
fs.writeFileSync(base+'candidate.user.js',s);
