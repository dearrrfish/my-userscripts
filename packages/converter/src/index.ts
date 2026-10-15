import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { validateContract, validateRuleSet, type TargetProfile, type Rule, type Finding, type Verification } from '@fm/contracts';
export const hash = (source: string): string => createHash('sha256').update(source).digest('hex');
export interface MetadataEntry { key: string; value: string; start: number; end: number; line: number }
export interface Metadata { entries: MetadataEntry[]; identity: {name: string; namespace: string}; valid: boolean }
export interface DependencySource { url: string; hash: string; source: string }
export interface Input { dependencies?: DependencySource[]; source: string; profile: TargetProfile; rules?: Rule[]; scriptId?: string; builtinTransforms?: string[] }
export type Status = 'unchanged' | 'converted' | 'needs-manual-fix' | 'blocked';
export interface Analysis { inputHash: string; metadata: Metadata; findings: Finding[]; matchedRules: Rule[]; guidance: Rule[]; status: Status }
const issue = (category: Finding['category'], reasoning: string, severity: Finding['severity'] = 'error', extra: Partial<Finding> = {}): Finding => ({schemaVersion:1,category,severity,fixability:'none',reasoning,evidence:[],needsConfirmation:false,...extra});
export function parseMetadata(source: string): Metadata {
  const entries: MetadataEntry[] = []; let offset = 0; let inside = false; let opened = 0; let closed = 0; let blockStart = -1; let blockEnd = -1; let closingMarkerEnd = -1;
  for (const [i,line] of source.split(/(?<=\n)/).entries()) {
    if (/^\s*\/\/\s*==UserScript==\s*$/.test(line.trimEnd())) { inside = true; opened++; blockStart = offset; }
    else if (/^\s*\/\/\s*==\/UserScript==\s*$/.test(line.trimEnd())) { inside = false; closed++; blockEnd = offset + line.length; closingMarkerEnd = offset + line.indexOf('==/UserScript==') + '==/UserScript=='.length; }
    else if (inside) { const m = /^(\s*\/\/\s*@([^\s]+)\s*)([^\r\n]*)/.exec(line); if (m) { entries.push({key:m[2],value:m[3].trim(),start:offset+m[1].length,end:offset+m[0].length,line:i+1}); } }
    offset += line.length;
  }
  const values = (key: string) => entries.filter(e=>e.key===key);
  // FM recognizes the first block anywhere, including strings. Only a canonical
  // leading comment header is safe to rewrite without altering program behavior.
  const first = /==(UserScript|UserCSS|UserStyle)==(.+?)==\/\1==/is.exec(source);
  const prefix = blockStart < 0 ? source : source.slice(0, blockStart);
  const leadingComments = /^(?:\s|\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*$/.test(prefix);
  const canonicalStart = blockStart < 0 ? -1 : source.indexOf('==UserScript==', blockStart);
  const sameFirstBlock = !!first && first.index === canonicalStart && first[1] === 'UserScript' &&
    first.index + first[0].length === closingMarkerEnd;
  const commentOnlyHeader = blockStart >= 0 && blockEnd > blockStart &&
    source.slice(blockStart, blockEnd).split(/\r?\n/).every(line => /^\s*(?:\/\/.*)?$/.test(line));

  return {entries,identity:{name:values('name')[0]?.value??'',namespace:values('namespace')[0]?.value??''},valid:leadingComments&&commentOnlyHeader&&sameFirstBlock&&opened===1&&closed===1&&!inside&&values('name').length===1&&values('namespace').length===1&&!!values('name')[0]?.value&&!!values('namespace')[0]?.value};
}
function ast(source: string) { return ts.createSourceFile('input.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS); }
function walk(node: ts.Node, fn: (n:ts.Node)=>void): void { fn(node); ts.forEachChild(node,n=>walk(n,fn)); }
// Bind only the supplied source: no dependency reads or input execution. The
// checker resolves lexical, function/var, parameter and destructuring scopes.
function localBindings(tree: ts.SourceFile): (node: ts.Identifier) => boolean {
  const options: ts.CompilerOptions = {allowJs:true,noLib:true,noResolve:true};
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => name === tree.fileName ? tree : undefined;
  const checker = ts.createProgram([tree.fileName],options,host).getTypeChecker();
  return node => {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    return !!symbol?.declarations?.some(declaration => declaration.getSourceFile() === tree);
  };
}
function storageFallback(tree: ts.SourceFile): boolean {
  let fallback=false; let binding=false;
  for (const n of tree.statements) { if (ts.isFunctionDeclaration(n)&&n.name?.text==='initGM') { let modern=false; let legacy=false; walk(n,c=>{ if(ts.isPropertyAccessExpression(c)&&ts.isIdentifier(c.expression)&&c.expression.text==='GM'&&c.name.text==='getValue'){modern=true;} if(ts.isIdentifier(c)&&c.text==='GM_getValue'){legacy=true;} }); fallback=modern&&legacy; } }
  walk(tree,n=>{ if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='GM'&&n.initializer&&ts.isCallExpression(n.initializer)&&ts.isIdentifier(n.initializer.expression)&&n.initializer.expression.text==='initGM'&&n.parent&&ts.isVariableDeclarationList(n.parent)&&(n.parent.flags&(ts.NodeFlags.Let|ts.NodeFlags.Const))&&n.parent.parent.parent!==tree){binding=true;} });
  return fallback&&binding;
}
function query(kind:string,q:string,source:string,metadata:Metadata,tree:ts.SourceFile): boolean | 'pending' {
  if(kind==='inputHash'){return hash(source)===q;}
  if(kind==='metadata'&&q==='match.http-star-scheme'){return metadata.entries.some(e=>e.key==='match'&&e.value.startsWith('http*://'));}
  if(kind==='metadata'&&q==='grant.storage-dual-alias'){const grants=metadata.entries.filter(e=>e.key==='grant').map(e=>e.value);return ['getValue','setValue','deleteValue','listValues'].some(m=>grants.includes(`GM.${m}`)&&grants.includes(`GM_${m}`));}
  if(kind==='ast'&&q==='binding.initGM.storage-fallback'){return storageFallback(tree);}
  if(kind==='ast'&&q==='review.storage-semantics-preserved'){return 'pending';}
  throw new Error(`Unknown ${kind} query: ${q}`);
}
// Conservative documented pattern subset, not a browser URL/parser substitute.
export function validMatchPattern(value:string): boolean {
  if(value==='<all_urls>'){return true;}
  const parts=/^(\*|https?|file|ftp):\/\/([^/]*)\/(\S*)$/.exec(value);
  if(!parts){return false;}
  const [,scheme,host]=parts;
  if(scheme==='file'){return host==='';}
  if(host==='*'){return true;}
  const plain=host.startsWith('*.')?host.slice(2):host;
  return !!plain && plain.split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}
function basic(source:string,profile:TargetProfile,providedGlobals:ReadonlySet<string>=new Set(),metadataOverride?:Metadata): {metadata:Metadata;tree:ts.SourceFile;findings:Finding[]} {
  validateContract('TargetProfile',profile); const metadata=metadataOverride??parseMetadata(source); const tree=ast(source); const findings:Finding[]=[];
  const diagnostics=(tree as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics;
  for(const d of diagnostics){findings.push(issue('context',`Parse: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`));}
  if(!metadata.valid){findings.push(issue('metadata','Require one canonical leading // metadata header matching FM first block and one nonempty name/namespace identity; atypical or executable-string metadata is blocked.'));}
  const values=(key:string)=>metadata.entries.filter(e=>e.key===key).map(e=>e.value);
  for(const e of metadata.entries.filter(e=>e.key==='match'||e.key==='exclude-match')){if(!validMatchPattern(e.value)){findings.push(issue('metadata',`Invalid @${e.key} pattern: ${e.value}`));}}
  const unwrap=values('unwrap').length>0;
  const context=unwrap||values('inject-into').includes('page')?'page':'user-script'; const grants=values('grant');
  if(grants.includes('none')&&grants.length>1){findings.push(issue('api','@grant none mixed with other grants requires review.'));}
  for(const key of ['run-at','inject-into']){if(values(key).length>1){findings.push(issue('context',`Repeated @${key} requires review.`));}}
  if(values('inject-into').some(v=>!['page','content','auto'].includes(v))){findings.push(issue('context','Unknown injection context.'));}
  if(values('run-at').some(v=>!['document-start','document-end','document-idle'].includes(v))){findings.push(issue('context','Unknown timing.'));}
  for(const e of metadata.entries){const cap=profile.capabilities.metadata.find(c=>c.name===e.key); if(cap?.status==='unsupported'&&e.key!=='namespace'){findings.push(issue('metadata',`Unsupported @${e.key}; retained.`));}}
  const refs=new Set<string>(); let dynamic=false; const isLocal=localBindings(tree);
  walk(tree,n=>{
    if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='GM'&&!isLocal(n.expression)){refs.add(`GM.${n.name.text}`);}
    if(ts.isElementAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='GM'&&!isLocal(n.expression)){dynamic=true;}
    if(ts.isIdentifier(n)&&n.text==='unsafeWindow'&&!isLocal(n)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)&&!(ts.isPropertyAssignment(n.parent)&&n.parent.name===n)){refs.add('unsafeWindow');}
    if(ts.isIdentifier(n)&&/^GM_/.test(n.text)&&!isLocal(n)&&!providedGlobals.has(n.text)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)&&!(ts.isPropertyAssignment(n.parent)&&n.parent.name===n)){refs.add(n.text);}
    if(ts.isIdentifier(n)&&n.text==='GM'&&!isLocal(n)&&!ts.isTypeOfExpression(n.parent)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.expression===n)&&!(ts.isVariableDeclaration(n.parent)&&n.parent.name===n)&&!(ts.isElementAccessExpression(n.parent)&&n.parent.expression===n)){dynamic=true;}
  });
  if(dynamic){findings.push(issue('api','Dynamic or aliased GM reference requires manual scope and semantics review.', 'error',{fixability:'manual',needsConfirmation:true}));}
  for(const name of new Set([...refs,...grants.filter(g=>g!=='none')])){const cap=profile.capabilities.api.find(c=>c.name===name); if(!cap||cap.status!=='supported'){findings.push(issue('api',`${name}: ${cap?.status??'unknown'} support; no shim generated.`));continue;} if(!cap.contexts.includes(context)||unwrap){findings.push(issue('context',`${name} unavailable in ${context} injection context${unwrap?' with @unwrap (injected bindings omitted)':''}.`, 'error',{evidence:cap.evidence}));} else if(refs.has(name)&&!['GM.info','GM_info'].includes(name)&&!(context==='page'&&name==='unsafeWindow')&&!grants.includes(name)){findings.push(issue('api',`${name} reference missing exact @grant; permissions require confirmation.`, 'error',{fixability:'manual',needsConfirmation:true}));}}
  return {metadata,tree,findings};
}
function dependencyAnalysis(input:Pick<Input,'source'|'profile'|'dependencies'>): {globals:Set<string>;findings:Finding[]} {
  const globals=new Set<string>(); const findings:Finding[]=[]; const accepted:DependencySource[]=[];
  const metadata=parseMetadata(input.source);
  const requires=new Set(metadata.entries.filter(e=>e.key==='require').map(e=>e.value));
  const bindingNames=(name:ts.BindingName):void=>{if(ts.isIdentifier(name)){globals.add(name.text);}else{for(const element of name.elements){if(ts.isBindingElement(element)){bindingNames(element.name);}}}};
  for(const dependency of input.dependencies??[]){
    if(!requires.has(dependency.url)||hash(dependency.source)!==dependency.hash){findings.push(issue('context','Dependency source does not match an exact @require URL and captured hash.'));continue;}
    const tree=ast(dependency.source);
    if((tree as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length){findings.push(issue('context',`Dependency parse failed: ${dependency.url}`));continue;}
    accepted.push(dependency);
    // FireMonkey executes @require code in the userscript wrapper. Only direct
    // declarations are exported; nested/IIFE locals and object properties are not.
    for(const statement of tree.statements){
      if(ts.isVariableStatement(statement)){for(const declaration of statement.declarationList.declarations){bindingNames(declaration.name);}}
      else if((ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement))&&statement.name){globals.add(statement.name.text);}
    }
  }
  for(const dependency of accepted){findings.push(...basic(dependency.source,input.profile,globals,metadata).findings);}
  return {globals,findings};
}
function analyzeInput(input:Pick<Input,'source'|'profile'|'dependencies'>){
  const dependencies=dependencyAnalysis(input);
  const result=basic(input.source,input.profile,dependencies.globals);
  result.findings.push(...dependencies.findings);
  return result;
}
export function inspect(input:Input): Analysis {
  const {metadata,tree,findings}=analyzeInput(input); const matchedRules:Rule[]=[]; const guidance:Rule[]=[];
  try {const rules=validateRuleSet(input.rules??[]);
    for(const r of rules){
      if(!r.targetRange.profileIds.includes(input.profile.id)||r.targetRange.fm!==`=${input.profile.fm.version}`||r.targetRange.firefox!==`=${input.profile.firefox.version}`){findings.push(issue(r.category,`Rule ${r.id} target mismatch.`));continue;}
      if(r.scope==='script'&&(r.scriptId!==input.scriptId||r.identity.name!==metadata.identity.name||r.identity.namespace!==metadata.identity.namespace)){continue;}
      for(const c of [r.matcher,...r.preconditions,...r.postconditions,...(r.action.kind==='guidance'?r.action.guidance.postconditions:[])]){query(c.kind,c.query,input.source,metadata,tree);}
      if(r.scope==='script'&&!r.preconditions.some(c=>c.kind==='inputHash')){findings.push(issue(r.category,`Script rule ${r.id} lacks exact inputHash guard.`));continue;}
      if(!query(r.matcher.kind,r.matcher.query,input.source,metadata,tree)||!r.preconditions.every(c=>query(c.kind,c.query,input.source,metadata,tree)===true)){continue;}
      matchedRules.push(r);
      if(r.action.kind==='guidance'){guidance.push(r);}
      findings.push(issue(r.category,`${r.id}: ${r.action.kind==='guidance'?'needs-manual-fix; evidence postconditions pending':r.action.kind}`,r.severity,{ruleId:r.id,evidence:r.evidence,fixability:r.action.kind==='transform'?'automatic':r.action.kind==='guidance'?'manual':'none',needsConfirmation:r.action.kind==='guidance'}));
    }
    for(const r of matchedRules){if(r.dependencies.some(id=>!matchedRules.some(m=>m.id===id))||r.conflicts.some(id=>matchedRules.some(m=>m.id===id))){findings.push(issue(r.category,`Rule ${r.id} dependency/conflict blocks conversion.`));}}
  } catch(e){findings.push(issue('context',String(e)));}
  return {inputHash:hash(input.source),metadata,findings,matchedRules,guidance,status:findings.some(f=>f.severity==='error')?'blocked':guidance.length?'needs-manual-fix':'unchanged'};
}
export const builtinTransformIds = ['metadata.match.http-star-scheme'] as const;
export function convert(input:Input): Analysis & {source:string;outputHash:string;appliedRules:string[]} {
  let source=input.source; const appliedRules:string[]=[];
  const before=inspect(input);
  const selected=[...(input.builtinTransforms??[]),...before.matchedRules.filter(r=>r.action.kind==='transform').map(r=>r.action.kind==='transform'?r.action.transformId:'')];
  const unsupported=selected.filter(id=>!builtinTransformIds.includes(id as typeof builtinTransformIds[number]));
  if(unsupported.length){before.findings.push(issue('context',`Unknown transform: ${unsupported.join(', ')}`));before.status='blocked';}
  const blockers=before.findings.filter(f=>f.severity==='error'&&!f.reasoning.startsWith('Invalid @match pattern: http*://')&&!(f.ruleId&&before.matchedRules.some(r=>r.id===f.ruleId&&r.matcher.query==='match.http-star-scheme'&&r.action.kind!=='guidance')));
  if(!blockers.length&&selected.includes('metadata.match.http-star-scheme')){
    for(const e of [...before.metadata.entries].reverse()){if(e.key==='match'&&e.value.startsWith('http*://')&&validMatchPattern(e.value.replace(/^http\*:\/\//,'*://'))){source=source.slice(0,e.start)+source.slice(e.start,e.end).replace(/^http\*:\/\//,'*://')+source.slice(e.end);}}
    if(source!==input.source){appliedRules.push('metadata.match.http-star-scheme');}
  }
  const after=source===input.source?before:inspect({...input,source});
  if(source!==input.source){
    // A changed output hash cannot discharge evidence-gated obligations attached
    // to the immutable original input. This API has no evidence resolution path.
    for(const r of before.guidance){
      if(!after.guidance.some(g=>g.id===r.id)){after.guidance.push(r);}
      if(!after.matchedRules.some(g=>g.id===r.id)){after.matchedRules.push(r);}
      for(const f of before.findings.filter(f=>f.ruleId===r.id)){
        if(!after.findings.some(g=>g.ruleId===f.ruleId&&g.reasoning===f.reasoning)){after.findings.push(f);}
      }
    }
    if(after.findings.some(f=>f.severity==='error')){after.status='blocked';}
    else if(after.guidance.length){after.status='needs-manual-fix';}
  }
  for(const r of before.matchedRules.filter(r=>r.action.kind==='transform')){for(const c of r.postconditions){if(query(c.kind,c.query,source,after.metadata,ast(source))!==true){after.findings.push(issue(r.category,`Rule ${r.id} postcondition unproved.`));after.status='blocked';}}}
  return {...after,inputHash:before.inputHash,source,outputHash:hash(source),appliedRules,status:after.status==='unchanged'&&source!==input.source?'converted':after.status};
}
export function lintConfig(source:string,profile:TargetProfile,dependencies:DependencySource[]=[]): Record<string,unknown> {
  const config=structuredClone(profile.lint.config) as any; const entries=parseMetadata(source).entries;
  for(const name of dependencyAnalysis({source,profile,dependencies}).globals){config.languageOptions.globals[name]=false;}
  // ESLint flat config defaults to module; userscript wrappers permit return.
  if(config.languageOptions.sourceType===undefined&&config.languageOptions.parserOptions?.ecmaFeatures?.globalReturn===true){config.languageOptions.sourceType='script';}
  if(entries.some(e=>e.key==='inject-into'&&e.value==='page')){config.languageOptions.globals.unsafeWindow=false;return config;}
  const grants=[...new Set(entries.filter(e=>e.key==='grant').map(e=>e.value))];
  if(grants.includes('none')){return config;}
  for(const grant of grants){if(profile.capabilities.api.find(a=>a.name===grant)?.status==='unsupported'){continue;} if(!grant.startsWith('GM.')){config.languageOptions.globals[grant]=false;} if(grant.startsWith('GM.')){config.rules['no-restricted-properties'][1].allowProperties.push(grant.slice(3));}}
  return config;
}
export async function staticVerify(input:Pick<Input,'source'|'profile'|'dependencies'>): Promise<{findings:Finding[];verification:Verification[];passed:boolean}> {
  const {findings}=analyzeInput(input); const artifactHash=hash(input.source); const verification:Verification[]=[];
  const record=(kind:Verification['kind'],status:Verification['status'],detail:string)=>{verification.push({schemaVersion:1,kind,status,command:`@fm/converter ${kind}`,environment:{fm:input.profile.fm.version,firefox:input.profile.firefox.version,lint:input.profile.lint.version},artifactHash,evidenceDigest:hash(detail)});};
  record('parse',findings.some(f=>f.reasoning.startsWith('Parse:'))?'failed':'passed',JSON.stringify(findings.filter(f=>f.reasoning.startsWith('Parse:'))));
  record('metadata',findings.some(f=>f.severity==='error'&&!f.reasoning.startsWith('Parse:'))?'failed':'passed',JSON.stringify(findings));
  try { const require=createRequire(import.meta.url); const engine=require('eslint'); if(engine.Linter.version!==input.profile.lint.version){throw new Error(`Expected ESLint ${input.profile.lint.version}, found ${engine.Linter.version}`);} const messages=new engine.Linter().verify(input.source,lintConfig(input.source,input.profile,input.dependencies)); for(const m of messages){findings.push(issue('lint',`${m.ruleId??'parse'}: ${m.message}`,m.severity===2?'error':'warning',{location:{line:m.line,column:Math.max(0,m.column-1)}}));} record('lint',messages.some((m:any)=>m.severity===2)?'failed':'passed',JSON.stringify(messages)); }
  catch(e){findings.push(issue('lint',`Pinned lint unavailable: ${String(e)}`));record('lint','pending',String(e));}
  record('fixture','pending','Caller must attach exact-output regression evidence.'); verification.push({schemaVersion:1,kind:'browser',status:'pending',checklist:'standalone-runtime',environment:{fm:input.profile.fm.version,firefox:input.profile.firefox.version},artifactHash,evidenceDigest:hash('Real Firefox/FireMonkey acceptance required.')});
  return {findings,verification,passed:verification.filter(v=>['parse','metadata','lint'].includes(v.kind)).every(v=>v.status==='passed')};
}
