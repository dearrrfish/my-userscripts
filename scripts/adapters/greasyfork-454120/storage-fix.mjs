/**
 * FireMonkey compatibility fix for GreasyFork 454120 storage & settings import
 */

export function applyStorageFix(source) {
  let result = source;

  // 1. Fix initGM unbound method extraction
  const originalInitGM = `function initGM() {
    let gmExists = false;
    try {
        if (typeof GM.getValue == 'function') {
            gmExists = true;
        }
    } catch (ignore) {}

    if (gmExists) {
        return {
            getValue: GM.getValue,
            setValue: GM.setValue,
            async deleteValue(key) {
                return await GM.deleteValue(key);
            },
            listValues: GM.listValues,
            notification: GM.notification,
            openInTab: GM.openInTab,
            registerMenuCommand: GM.registerMenuCommand
        };
    } else {
        return {
            getValue: GM_getValue,
            setValue: GM_setValue,
            async deleteValue(key) {
                return GM_deleteValue(key);
            },
            listValues: GM_listValues,
            notification: GM_notification,
            openInTab: GM_openInTab,
            registerMenuCommand: GM_registerMenuCommand
        };
    }
    
}`;

  const fixedInitGM = `function initGM() {
    let gmExists = false;
    try {
        if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
            gmExists = true;
        }
    } catch (ignore) {}

    if (gmExists) {
        return {
            getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
            setValue: (key, value) => GM.setValue(key, value),
            async deleteValue(key) {
                return await GM.deleteValue(key);
            },
            listValues: () => GM.listValues(),
            notification: (...args) => GM.notification(...args),
            openInTab: (...args) => GM.openInTab(...args),
            registerMenuCommand: (...args) => GM.registerMenuCommand(...args)
        };
    }
    return {
        getValue: GM_getValue,
        setValue: GM_setValue,
        async deleteValue(key) {
            return GM_deleteValue(key);
        },
        listValues: GM_listValues,
        notification: GM_notification,
        openInTab: GM_openInTab,
        registerMenuCommand: GM_registerMenuCommand
    };
}`;

  if (result.includes(originalInitGM)) {
    result = result.replace(originalInitGM, fixedInitGM);
  } else {
    throw new Error('Could not find exact initGM implementation to patch in source');
  }

  // 2. Reduce runGMBatch chunk size from 100 to 20 for FireMonkey WebExtension IPC stability
  const originalBatch = `    async function runGMBatch(items, asyncFunc, chunkSize) {
        const size = chunkSize || 100;`;
  const fixedBatch = `    async function runGMBatch(items, asyncFunc, chunkSize) {
        const size = chunkSize || 20;`;

  if (result.includes(originalBatch)) {
    result = result.replace(originalBatch, fixedBatch);
  } else {
    throw new Error('Could not find exact runGMBatch implementation to patch in source');
  }

  // 3. Add flush buffer before location.reload() to guarantee storage persistence
  const originalReload1 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => {
                                        if (!cancelled) {
                                            document.location.reload();
                                        }
                                    })`;
  const fixedReload1 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => {
                                        if (!cancelled) {
                                            setTimeout(() => document.location.reload(), 300);
                                        }
                                    })`;

  const originalReload2 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => document.location.reload())`;
  const fixedReload2 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => setTimeout(() => document.location.reload(), 300))`;

  if (result.includes(originalReload1)) {
    result = result.replace(originalReload1, fixedReload1);
  }
  if (result.includes(originalReload2)) {
    result = result.replace(originalReload2, fixedReload2);
  }

  return result;
}
