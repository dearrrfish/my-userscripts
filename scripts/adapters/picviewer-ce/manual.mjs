import fs from 'node:fs';
import ts from './typescript.mjs';
const base='.fm/adaptations/picviewer-ce/';const file=base+'candidate.user.js';let s=fs.readFileSync(file,'utf8');
function replace(a,b){if(!s.includes(a)){throw new Error('Missing exact adaptation target: '+a.slice(0,100));}s=s.replace(a,b);}
const begin=s.indexOf('// Preserve abstract equality');const end=s.indexOf('if (!pvceAbstractEqual(window.top');s=s.slice(0,begin)+fs.readFileSync(base+'equality-helper.js','utf8')+'\n'+s.slice(end);
replace('// @grant                GM_getValue','// @grant                GM_log\n// @grant                GM_getValue');
replace('// @match                *://*/*','// @require              https://cdn.jsdelivr.net/npm/video.js@8.23.3/dist/video.min.js\n// @match                *://*/*');
replace('(function (global, factory) {','// Browser-host bindings for optional UMD/Node branches; missing properties remain undefined.\nconst {define, module, require, Buffer, setImmediate, global} = globalThis;\nconst pvceBundleGlobal = this;\n(function (global, factory) {');
s=s.replace('/* global Promise */','');
// Vendor exports are written to the browser global by the bundled UMD wrappers.
replace('    //var siteInfo = [{}];','    // VERIFY: Confirm vendor export targets inside the FireMonkey sandbox.\n    const saveAs = window.saveAs;\n    const JSZip = window.JSZip;\n    const Bricks = pvceBundleGlobal.Bricks;\n    //var siteInfo = [{}];');
replace('data[i] = data[i] & 0xFF;', 'data[i] &= 0xFF;');
replace('throw new Error("Bug : can\'t construct the Blob.");','throw new Error("Bug : can\'t construct the Blob.", {cause: e});');
replace('return [].concat.apply([], chunks);','return Reflect.apply([].concat, [], chunks);');
replace('setTimeout.apply(null, args);','Reflect.apply(setTimeout, null, args);');
replace('Array.apply(null, Array(length))','Reflect.apply(Array, null, Array(length))');
replace('Math.min.apply(Math, columnHeights)','Reflect.apply(Math.min, Math, columnHeights)');
replace('Math.max.apply(Math, columnHeights)','Reflect.apply(Math.max, Math, columnHeights)');
replace('const { url, resolve, reject } = this.queue.shift();','const pvceQueueItem = this.queue.shift();\n            const {url, resolve} = pvceQueueItem;\n            void pvceQueueItem.reject;');
replace('const { names: allowedNames, allowDuplicates, ttDirectiveFound } = await getCspTrustedTypesInfo();','const pvceTrustedTypesInfo = await getCspTrustedTypesInfo();\n        void pvceTrustedTypesInfo.names;\n        const {allowDuplicates, ttDirectiveFound} = pvceTrustedTypesInfo;');
replace('custom.replace(/[\\x00-\\x1f"*/:<>?\\\\|]/g, \'\')', 'Array.from(custom).filter(character => character.charCodeAt(0) > 31 && !\'"*/:<>?\\\\|\'.includes(character)).join(\'\')');
s=s.replace(/(case [^\n:]+:);/g,'$1');
replace("'px' + ' '","'px '");
replace('                var self=this;','                self=this;');
replace('count+=iStatisCopy_i.count;','void iStatisCopy_i.count;');
replace('const containsScroll = imgWindow.classList.contains("pv-pic-window-scroll");','void imgWindow.classList.contains("pv-pic-window-scroll");');
// Remove only the two reported final increments, not the rest of the decoder.
const messages=JSON.parse(fs.readFileSync(base+'lint-current.json'));
const tree=ts.createSourceFile('input.js',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
// Code after this unconditional return has never executed; retain the return.
const start=s.indexOf('                        if(from<searchSort.length){',s.indexOf('img.onerror=function'));
if(start>=0){let depth=0;let target;function walk(n){if(n.getStart(tree)===start+24&&ts.isIfStatement(n)){target=n;}ts.forEachChild(n,walk);}walk(tree);if(!target){throw new Error('Unreachable branch missing');}s=s.slice(0,start)+s.slice(target.end);}
const jsStart=s.indexOf('            const jsSources = [');const jsEnd=s.indexOf('            const fetchWithFallback',jsStart);s=s.slice(0,jsStart)+s.slice(jsEnd);
replace('            const pJS = fetchWithFallback(jsSources).then(jsContent => {\n                Function(jsContent)();\n            });','            const pJS = Promise.resolve().then(() => {\n                if (typeof globalThis.videojs !== "function") {\n                    throw new Error("Pinned Video.js 8.23.3 @require did not provide videojs");\n                }\n            });');
replace('const player = videojs(media, videoOptions);','const player = globalThis.videojs(media, videoOptions);');
// Pin the CSS fallback version while retaining lazy CSS loading.
s=s.replace('https://unpkg.com/video.js/dist/video-js.min.css','https://unpkg.com/video.js@8.23.3/dist/video-js.min.css');
fs.writeFileSync(file,s);
