import fs from 'node:fs';
import ts from './typescript.mjs';
import {createRequire} from 'node:module';
import {lintConfig} from '../../../packages/converter/dist/index.js';
const require=createRequire(new URL('../../../packages/converter/dist/index.js',import.meta.url));
const {Linter}=require('eslint');
const profile=JSON.parse(fs.readFileSync('profiles/firemonkey-3.9-firefox-157.0.json','utf8'));
const file='.fm/adaptations/picviewer-ce/candidate.user.js';
let source=fs.readFileSync(file,'utf8');
function editsFor(nodes) {
    for (const e of nodes.sort((a,b)=>b.start-a.start)) { source=source.slice(0,e.start)+e.text+source.slice(e.end); }
}
function tree() { return ts.createSourceFile('input.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS); }
function walk(n,fn) { fn(n); ts.forEachChild(n,c=>walk(c,fn)); }
// Rewrite innermost comparisons first so nested side effects retain evaluation order.
for (let pass=0;pass<20;pass++) {
    const t=tree();const edits=[];
    function visit(n) {
        const nested=[]; ts.forEachChild(n,c=>{if(visit(c)){nested.push(c);}});
        const equal=ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind);
        if(equal && nested.length===0) { edits.push({start:n.getStart(t),end:n.end,text:`${n.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsToken?'!':''}pvceAbstractEqual(${n.left.getText(t)}, ${n.right.getText(t)})`});return true; }
        return nested.length>0;
    }
    visit(t); if(!edits.length){break;} editsFor(edits);
}
const end=source.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length;
source=source.slice(0,end)+'\n\n'+fs.readFileSync(new URL('./equality-seed.js',import.meta.url),'utf8')+source.slice(end);
// Apply only ESLint suggestions documented to preserve regexp/string meaning.
let messages=new Linter().verify(source,lintConfig(source,profile));
const safe=[];
for(const m of messages){if(m.ruleId==='no-useless-escape'&&m.suggestions?.[0]){const f=m.suggestions[0].fix;safe.push({start:f.range[0],end:f.range[1],text:f.text});}}
editsFor(safe);
const fixed=new Linter().verifyAndFix(source,lintConfig(source,profile));
fs.writeFileSync(file,fixed.output);
fs.writeFileSync('.fm/adaptations/picviewer-ce/lint-current.json',JSON.stringify(fixed.messages,null,2)+'\n');
console.log('Remaining errors:',fixed.messages.filter(m=>m.severity===2).length);
