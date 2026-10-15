import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createPicviewerSettingsPanel,openPicviewerSettingsPanel} from './settings-panel.mjs';
const file='.fm/adaptations/picviewer-ce/candidate.user.js';
let source=fs.readFileSync(file,'utf8');
if(!source.includes('function createPicviewerSettingsPanel(document)')){
    const marker='        GM_config.init({\n            id: \'pv-prefs\',';
    assert.ok(source.includes(marker),'Expected configured settings init');
    source=source.replace(marker,'        '+createPicviewerSettingsPanel.toString()+'\n        '+openPicviewerSettingsPanel.toString()+'\n'+marker+'\n            frame: createPicviewerSettingsPanel(document),');
    const onOpen='                open: async function(doc, win, frame) {';
    assert.ok(source.includes(onOpen));
    source=source.replace(onOpen,'                open: async function(unusedDoc, win, frame) {\n                    const doc = frame;\n                    initKeyInputs();');
    const keys="            if (!GM_config.frame || !GM_config.frame.contentDocument) {return;}\n            const keyInputs = GM_config.frame.contentDocument.querySelectorAll('input.floatBar-key');";
    assert.ok(source.includes(keys));
    source=source.replace(keys,"            if (!GM_config.frame) {return;}\n            const keyInputs = GM_config.frame.querySelectorAll('input.floatBar-key');");
    const old=`            GM_config.open();
            document.documentElement.appendChild(GM_config.frame);

            setTimeout(()=>{
                if (GM_config.frame && GM_config.frame.contentDocument.body.innerHTML === "") {
                    _GM_openInTab("https://pv.hoothin.com/open-settings", {active:true});
                    return;
                }
                if (GM_config.frame && GM_config.frame.style && pvceAbstractEqual(GM_config.frame.style.display, "none")) {
                    GM_config.frame.src="";
                }
                initKeyInputs();
            }, 1000);`;
    assert.ok(source.includes(old),'Expected iframe-specific settings fallback');
    source=source.replace(old,'            openPicviewerSettingsPanel(GM_config, document);');
    fs.writeFileSync(file,source);
}
assert.ok(!source.includes('GM_config.frame.contentDocument'));
