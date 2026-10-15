import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createPicviewerStyle} from './style-adapter.mjs';
const file='.fm/adaptations/picviewer-ce/candidate.user.js';
let source=fs.readFileSync(file,'utf8');
const start=source.indexOf("    if (typeof GM_addStyle !== 'undefined') {");
const end=source.indexOf('    if (GM_fetch) {',start);
const replacement='    // FireMonkey GM_addStyle returns undefined; consumers need a style node synchronously.\n'+
    '    _GM_addStyle = cssText => ('+createPicviewerStyle.toString()+')(document, cssText);\n';
if(start===-1){assert.ok(source.includes(replacement),'Expected known style adapter or applied fix');}
else{assert.ok(end>start);source=source.slice(0,start)+replacement+source.slice(end);fs.writeFileSync(file,source);}
