import ts from '../../../packages/converter/node_modules/typescript/lib/typescript.js';
import { parseMetadata } from '../../../packages/converter/dist/index.js';
function comments(source) {
  // The parser supplies contextual template/regular-expression tokens. A plain
  // scanner cannot inventory comments after interpolated templates correctly.
  const tree = ts.createSourceFile('comments.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) { throw new Error('parse'); }
  const ranges = new Map();
  function collect(items) {
    for (const range of items ?? []) {
      ranges.set(`${range.pos}:${range.end}`, { start: range.pos, end: range.end, text: source.slice(range.pos, range.end) });
    }
  }
  function visit(node) {
    collect(ts.getLeadingCommentRanges(source, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(tree)) { visit(child); }
  }
  visit(tree);
  return [...ranges.values()].sort((a,b) => a.start - b.start);
}
export function bodyStart(source) { if (!parseMetadata(source).valid) { throw new Error('metadata'); } const lines=source.split(/(?<=\n)/); let offset=0; for (const line of lines) { offset+=line.length; if (/^\s*\/\/\s*==\/UserScript==\s*$/.test(line.trimEnd())) { return offset; } } throw new Error('metadata'); }
export function contextWindows(source, findings, budget=16000) {
  const start=bodyStart(source); const lines=source.split(/(?<=\n)/); const offsets=[]; let pos=0; for (const line of lines) { offsets.push(pos); pos+=line.length; }
  const windows=[]; const tree=ts.createSourceFile('context.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS); if(tree.parseDiagnostics.length) { return null; }
  const indexes=[...new Set(findings.filter(f=>f.location?.line).map(f=>f.location.line-1))].slice(0,8);
  for(const index of indexes) { if(index<0||index>=lines.length) { continue; } const position=offsets[index]; let chosen=null;
    function visit(node) { if(position<node.getFullStart()||position>=node.end) { return; } if(ts.isStatement(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)) { chosen=node; } ts.forEachChild(node,visit); }
    visit(tree); if(!chosen) { continue; } let enclosing=chosen; while(enclosing.parent && enclosing.parent!==tree) { if(ts.isFunctionLike(enclosing.parent)) { enclosing=enclosing.parent; break; } enclosing=enclosing.parent; }
    if(ts.isFunctionLike(enclosing)) { chosen=enclosing; }
    const from=Math.max(start,chosen.getFullStart()),to=chosen.end; if(to<=from||Buffer.byteLength(source.slice(from,to))>6000) { continue; } if(!windows.some(w=>from<w.end&&to>w.start)) { windows.push({windowId:'w'+windows.length,start:from,end:to,text:source.slice(from,to)}); }
  }
  if (!windows.length || Buffer.byteLength(JSON.stringify(windows)) > budget) { return null; }
  return windows;
}
export function applyEdits(source, edits, windows) {
  const start=bodyStart(source); const ranges=[];
  if(!Array.isArray(edits)||edits.length>16) { throw new Error('edit-budget'); }
  const protectedRanges=comments(source);
  for (const edit of edits) { const window=windows.find(w=>w.windowId===edit.windowId); if(!window||!edit.before) { throw new Error('unsafe-window'); } const local=window.text.indexOf(edit.before); const index=window.start+local; if(local<0||window.text.indexOf(edit.before,local+1)!==-1||index<start||index+edit.before.length>window.end||source.slice(index,index+edit.before.length)!==edit.before||protectedRanges.some(r=>index<r.end&&index+edit.before.length>r.start)) { throw new Error('unsafe-anchor'); } ranges.push({start:index,end:index+edit.before.length,after:edit.after}); }

  ranges.sort((a,b)=>a.start-b.start); if (ranges.some((r,i)=>i && ranges[i-1].end>r.start)) { throw new Error('overlap'); }
  let output=source; for (const r of ranges.reverse()) { output=output.slice(0,r.start)+r.after+output.slice(r.end); }
  if (output.slice(0,start)!==source.slice(0,start) || JSON.stringify(comments(output).map(c=>c.text))!==JSON.stringify(comments(source).map(c=>c.text)) || /\b(?:GM[_\.]|unsafeWindow)\w*/.exec(output)?.[0] !== /\b(?:GM[_\.]|unsafeWindow)\w*/.exec(source)?.[0]) { throw new Error('protected-content'); }
  if(Buffer.byteLength(output)>2*1024*1024) { throw new Error('output-budget'); }
  const tree=ts.createSourceFile('candidate.js',output,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS); if (tree.parseDiagnostics.length) { throw new Error('parse'); }
  // Any API token count change requires explicit manual conversion, never model automation.
  const apis=s=>JSON.stringify(s.match(/\b(?:GM[_\.]\w+|unsafeWindow)\b/g)??[]); if (apis(output)!==apis(source)) { throw new Error('api-edit'); }
  return output;
}
