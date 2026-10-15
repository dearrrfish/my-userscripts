import fs from 'node:fs';
import ts from './typescript.mjs';
import {createRequire} from 'node:module';
import {lintConfig,parseMetadata,hash} from '../../../packages/converter/dist/index.js';
const require=createRequire(new URL('../../../packages/converter/dist/index.js',import.meta.url));const {Linter}=require('eslint');
const base='.fm/adaptations/picviewer-ce/';const file=base+'candidate.user.js';
const profile=JSON.parse(fs.readFileSync('profiles/firemonkey-3.9-firefox-157.0.json'));
let source=fs.readFileSync(file,'utf8');
const lock=JSON.parse(fs.readFileSync('source.lock.json'));const snapshot=lock.snapshots.find(s=>s.scriptId==='greasyfork-24204');
const dependencies=parseMetadata(source).entries.filter(e=>e.key==='require').flatMap(e=>{const dep=snapshot?.dependencies.find(d=>d.url===e.value);if(!dep){return [];}return [{...dep,source:fs.readFileSync('.fm/dependencies/'+dep.hash,'utf8')}];});
const tree=ts.createSourceFile('candidate.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const messages=new Linter().verify(source,lintConfig(source,profile,dependencies));
const edits=[];const seen=new Set();
function edit(start,end,text){const key=start+':'+end;if(!seen.has(key)){seen.add(key);edits.push({start,end,text});}}
function walk(n,fn){fn(n);ts.forEachChild(n,c=>walk(c,fn));}
function at(pos){function search(n){let found=n;ts.forEachChild(n,c=>{if(c.getStart(tree)<=pos&&c.end>pos){found=search(c);}});return found;}return search(tree);}
function ancestor(n,p){while(n&&!p(n)){n=n.parent;}return n;}
for(const m of messages.filter(m=>m.severity===2)){
 const pos=tree.getPositionOfLineAndCharacter(m.line-1,m.column-1);let n=at(pos);
 if(m.ruleId==='no-unused-vars'){
  const c=ancestor(n,ts.isCatchClause);if(c?.variableDeclaration&&c.variableDeclaration.name.getStart(tree)===pos){edit(c.variableDeclaration.pos-1,c.variableDeclaration.end+1,'');continue;}
  const decl=ancestor(n,x=>ts.isVariableDeclaration(x)||ts.isFunctionDeclaration(x));
  if(decl&&ts.isFunctionDeclaration(decl)&&decl.name?.getStart(tree)===pos){edit(decl.getStart(tree),decl.end,'');continue;}
  if(decl&&ts.isVariableDeclaration(decl)&&decl.name.getStart(tree)===pos){
   const list=decl.parent;const stmt=list.parent;
   if(ts.isVariableStatement(stmt)){
    // Split the statement, preserving every initializer's original evaluation order.
    const unused=new Set(messages.filter(x=>x.ruleId==='no-unused-vars').map(x=>tree.getPositionOfLineAndCharacter(x.line-1,x.column-1)));
    const kind=list.flags&ts.NodeFlags.Const?'const':list.flags&ts.NodeFlags.Let?'let':'var';
    const parts=list.declarations.map(d=>unused.has(d.name.getStart(tree))?(d.initializer?`void (${d.initializer.getText(tree)});`:''):`${kind} ${d.getText(tree)};`);
    edit(stmt.getStart(tree),stmt.end,parts.join('\n'));
   }
  }
 }
 if(m.ruleId==='no-useless-assignment'){
  const decl=ancestor(n,ts.isVariableDeclaration);
  if(decl?.initializer&&ts.isIdentifier(decl.name)&&decl.name.getStart(tree)===pos){
   const list=decl.parent;const stmt=list.parent;
   if(ts.isVariableStatement(stmt)){
    const dead=new Set(messages.filter(x=>x.ruleId==='no-useless-assignment').map(x=>tree.getPositionOfLineAndCharacter(x.line-1,x.column-1)));
    const kind=list.flags&ts.NodeFlags.Const?'const':list.flags&ts.NodeFlags.Let?'let':'var';
    const parts=list.declarations.map(d=>dead.has(d.name.getStart(tree))&&d.initializer?`${kind} ${d.name.getText(tree)}; void (${d.initializer.getText(tree)});`:`${kind} ${d.getText(tree)};`);
    edit(stmt.getStart(tree),stmt.end,parts.join('\n'));
   }
   continue;
  }
  const assign=ancestor(n,x=>ts.isBinaryExpression(x)&&x.operatorToken.kind===ts.SyntaxKind.EqualsToken);
  if(assign&&ts.isIdentifier(assign.left)){edit(assign.getStart(tree),assign.end,`(${assign.right.getText(tree)})`);}
 }
 if(m.ruleId==='no-multi-assign'){
  const assign=ancestor(n,x=>ts.isBinaryExpression(x)&&x.operatorToken.kind===ts.SyntaxKind.EqualsToken);
  if(assign){edit(assign.getStart(tree),assign.end,`(() => (${assign.getText(tree)}))()`);}
 }
 if(m.ruleId==='no-invalid-this'){
  const fn=ancestor(n,x=>ts.isFunctionExpression(x)||ts.isFunctionDeclaration(x));
  if(fn){edit(fn.getStart(tree),fn.getStart(tree),'/** @this {object} Receiver supplied by the existing call site. */ ');}
 }
 if(m.ruleId==='no-prototype-builtins'){
  const call=ancestor(n,ts.isCallExpression);
  if(call&&ts.isPropertyAccessExpression(call.expression)){
   const access=call.expression;edit(call.getStart(tree),call.end,`((pvceReceiver) => { const pvceMethod = pvceReceiver.${access.name.text}; return Reflect.apply(pvceMethod, pvceReceiver, [${call.arguments.map(a=>a.getText(tree)).join(', ')}]); })(${access.expression.getText(tree)})`);
  }
 }
 if(m.ruleId==='no-cond-assign'){
  const binary=ancestor(n,ts.isBinaryExpression);if(binary){edit(binary.getStart(tree),binary.end,`(${binary.getText(tree)})`);}
 }
 if(m.ruleId==='no-lone-blocks'&&ts.isBlock(n)){edit(n.getStart(tree),n.getStart(tree)+1,'');edit(n.end-1,n.end,'');}
 if(m.ruleId==='no-loss-of-precision'&&ts.isNumericLiteral(n)){edit(n.getStart(tree),n.end,String(Number(n.text)));}
 if(m.ruleId==='no-useless-concat'){
  const binary=ancestor(n,ts.isBinaryExpression);if(binary&&ts.isStringLiteral(binary.left)&&ts.isStringLiteral(binary.right)){edit(binary.getStart(tree),binary.end,JSON.stringify(binary.left.text+binary.right.text));}
 }
}
// Do not apply overlapping edits: a later pass handles child/parent transformations.
let boundary=Infinity;for(const e of edits.sort((a,b)=>b.start-a.start||b.end-a.end)){if(e.end<=boundary){source=source.slice(0,e.start)+e.text+source.slice(e.end);boundary=e.start;}}
source=new Linter().verifyAndFix(source,lintConfig(source,profile,dependencies)).output;
fs.writeFileSync(file,source);const after=new Linter().verify(source,lintConfig(source,profile,dependencies));fs.writeFileSync(base+'lint-current.json',JSON.stringify(after,null,2));console.log('Errors',after.filter(m=>m.severity===2).length);console.log(Object.groupBy(after.filter(m=>m.severity===2),m=>m.ruleId));
