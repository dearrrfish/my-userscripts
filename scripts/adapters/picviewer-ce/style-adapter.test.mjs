import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPicviewerStyle} from './style-adapter.mjs';
function fakeDocument(hasHead=true){
    const created=[];
    const parent={children:[],appendChild(node){node.parentNode=this;node.sheet={cssRules:[]};this.children.push(node);return node;}};
    const document={head:hasHead?parent:null,documentElement:parent,createElement(tag){assert.equal(tag,'style');const node={textContent:'',parentNode:null,sheet:null};created.push(node);return node;}};
    return {document,parent,created};
}
for(const hasHead of [true,false]){
    const {document,parent,created}=fakeDocument(hasHead);
    const css='.gallery::before { content: "<>&"; }\n.gallery { display: block; }';
    const style=createPicviewerStyle(document,css);
    assert.equal(style,created[0]);assert.equal(style.parentNode,parent);assert.equal(style.textContent,css);assert.ok(style.sheet);
    const gallery={style};const globalSheet=gallery.style.sheet;assert.equal(globalSheet,style.sheet);
    // A detached style can be recreated with its unchanged CSS payload.
    style.parentNode=null;gallery.style=createPicviewerStyle(document,style.textContent);assert.notEqual(gallery.style,style);assert.ok(gallery.style.sheet);assert.equal(gallery.style.textContent,css);
    const other=createPicviewerStyle(document,'.floatbar { display: block; }');assert.notEqual(other,gallery.style);assert.equal(parent.children.length,3);
}
// Test only self-authored adapter code; the supplied candidate is read as text.
const source=fs.readFileSync('.fm/adaptations/picviewer-ce/candidate.user.js','utf8');
assert.ok(source.includes('('+createPicviewerStyle.toString()+')(document, cssText)'));
assert.ok(!source.includes('_GM_addStyle = GM_addStyle;'));
console.log('PASS: synchronous attached style identity, sheet contract, CSS payload, head/root fallback and reattachment. Candidate not executed.');
