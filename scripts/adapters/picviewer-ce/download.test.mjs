import fs from 'node:fs';import assert from 'node:assert/strict';
import ts from './typescript.mjs';
// Self-authored fixture mirrors only the selected adapter; never load/evaluate input.
function adapter({canonicalUri,urlToBlob,saveAs,log}){
 return (url,name)=>{
  url=canonicalUri(url);
  urlToBlob(url,(blob,ext)=>{
   if(blob){try{saveAs(blob,ext&&/^\w{2,5}$/.test(ext)?name.replace(/\.\w+$/,'')+'.'+ext:name);}catch(error){log(error);}}
  });
 };
}
for(const [ext,expected] of [['jpg','photo.jpg'],['webp','photo.webp'],['','photo.png'],['toolong','photo.png'],['bad-ext','photo.png']]){
 const events=[];const blob={fixture:true};let callback;
 const download=adapter({canonicalUri:url=>new URL(url,'https://site.example/gallery/').href,urlToBlob:(url,cb)=>{events.push(['load',url]);callback=cb;},saveAs:(...args)=>events.push(['save',...args]),log:error=>events.push(['error',error])});
 download('../photo.png','photo.png');assert.deepEqual(events,[['load','https://site.example/photo.png']]);callback(blob,ext);assert.deepEqual(events[1],['save',blob,expected]);
 callback(null,'jpg');assert.equal(events.length,2); // Existing exhausted/no-blob path stays silent.
}
const failure=new Error('save failed');const logged=[];
adapter({canonicalUri:url=>url,urlToBlob:(url,cb)=>cb({},'jpg'),saveAs:()=>{throw failure;},log:error=>logged.push(error)})('https://site.example/photo','photo.png');assert.deepEqual(logged,[failure]);
// Inspect syntax only: the supplied candidate must select the blob adapter directly.
const input=fs.readFileSync('.fm/adaptations/picviewer-ce/candidate.user.js','utf8');const tree=ts.createSourceFile('candidate.js',input,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let selected;
function walk(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='_GM_download'){selected=node.initializer;}ts.forEachChild(node,walk);}walk(tree);
assert.ok(selected&&ts.isArrowFunction(selected));assert.ok(selected.getText(tree).includes('urlToBlob(url,'));assert.ok(!selected.getText(tree).includes('GM_download('));assert.ok(input.includes('// @grant                GM_download'));
console.log('Self-authored download canonical URL, filename/extensions, no-blob silence and failure logging cases passed; candidate parsed only.');
