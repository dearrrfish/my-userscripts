import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {hash,lintConfig} from '../../../packages/converter/dist/index.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
assert.equal(fs.realpathSync(process.cwd()),fs.realpathSync(root),'Run from the repository root');
const base='.fm/adaptations/picviewer-ce/';
const inputHash='0583af3f0ab35df661b166c8588e034596e2cf96fdd31d1efb38d29088d8054d';
const expected='13cb48ebe60a0d35480cafaa1e8bd63abaf0bf7bda7e29ff96c99fd366168630';
const input=fs.readFileSync(`.fm/sources/${inputHash}.user.js`,'utf8');
assert.equal(hash(input),inputHash,'Unexpected upstream; re-review adaptation for changed bytes');
fs.mkdirSync(base,{recursive:true});
const destination=path.join(base,'candidate.user.js');
if(fs.existsSync(destination)){
    assert.equal(hash(fs.readFileSync(destination)),expected,'Refusing to overwrite an edited candidate');
}
const require=createRequire(new URL('../../../packages/converter/dist/index.js',import.meta.url));
const {Linter}=require('eslint');
const profile=JSON.parse(fs.readFileSync('profiles/firemonkey-3.9-firefox-157.0.json','utf8'));
fs.copyFileSync(new URL('./equality-helper.js',import.meta.url),path.join(base,'equality-helper.js'));
fs.writeFileSync(destination,new Linter().verifyAndFix(input,lintConfig(input,profile)).output);
await import('./adapt.mjs');
assert.equal(hash(fs.readFileSync(destination)),'4b4c09eb7d1f339c08ed2f3b78467eec0c3c2d0cb03791176b1b9bd80f5631d5','Initial adaptation checkpoint changed');
await import('./refine.mjs?pass=1');
await import('./manual.mjs');
await import('./refine.mjs?pass=2');
await import('./finalize.mjs');
await import('./refine.mjs?pass=3');
await import('./style-fix.mjs');
await import('./settings-fix.mjs');
for(const name of ['equality-helper','transformations','download','style-adapter','settings-panel']){
    await import(`./${name}.test.mjs`);
}
assert.equal(hash(fs.readFileSync(destination)),expected,'Final bytes differ from the human-tested candidate');
console.log(`Rebuilt exact human-tested candidate ${expected}. Supplied code was parsed, never executed.`);
