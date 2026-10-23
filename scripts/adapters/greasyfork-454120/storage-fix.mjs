/**
 * FireMonkey compatibility fix for GreasyFork 454120 storage & settings import
 */

export function applyStorageFix(source) {
  let result = source;

  // 1. Fix initGM to provide robust dual-channel storage in FireMonkey
  // FireMonkey supports both GM_* (in-memory cached sync) and GM.* (async messaging bridge).
  // GM.getValue(key) with undefined defaultValue drops keys across WebExtension IPC.
  // Using GM_getValue/GM_setValue keeps FireMonkey's #script.storage cache perfectly synchronized.
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

    return {
        async getValue(key, defaultValue) {
            if (typeof GM_getValue === 'function') {
                const val = GM_getValue(key, defaultValue);
                if (val !== undefined) {
                    return val;
                }
            }
            if (gmExists) {
                const val = await GM.getValue(key, defaultValue !== undefined ? defaultValue : null);
                return val !== null ? val : defaultValue;
            }
            return typeof GM_getValue === 'function' ? GM_getValue(key, defaultValue) : defaultValue;
        },
        async setValue(key, value) {
            if (typeof GM_setValue === 'function') {
                try {
                    GM_setValue(key, value);
                } catch (ignore) {}
            }
            if (gmExists) {
                await GM.setValue(key, value);
            }
        },
        async deleteValue(key) {
            if (typeof GM_deleteValue === 'function') {
                try {
                    GM_deleteValue(key);
                } catch (ignore) {}
            }
            if (gmExists) {
                await GM.deleteValue(key);
            }
        },
        async listValues() {
            const list = new Set();
            if (typeof GM_listValues === 'function') {
                try {
                    GM_listValues().forEach(k => list.add(k));
                } catch (ignore) {}
            }
            if (gmExists) {
                try {
                    const asyncList = await GM.listValues();
                    if (Array.isArray(asyncList)) {
                        asyncList.forEach(k => list.add(k));
                    }
                } catch (ignore) {}
            }
            return Array.from(list);
        },
        notification: (...args) => (gmExists && GM.notification ? GM.notification(...args) : GM_notification(...args)),
        openInTab: (...args) => (gmExists && GM.openInTab ? GM.openInTab(...args) : GM_openInTab(...args)),
        registerMenuCommand: (...args) => (gmExists && GM.registerMenuCommand ? GM.registerMenuCommand(...args) : GM_registerMenuCommand(...args))
    };
}`;

  if (result.includes(originalInitGM)) {
    result = result.replace(originalInitGM, fixedInitGM);
  } else {
    throw new Error('Could not find exact initGM implementation to patch in source');
  }

  // 2. Fix tryParseJson in mergeUserData to guard against undefined values
  const originalTryParse = `        // a single corrupt stored value should skip that record, not abort the whole merge
        function tryParseJson(key, value, fallback) {
            if (value == null || value === '') return fallback;
            if (typeof value !== 'string') return value; // already an object (GM can store non-strings)`;

  const fixedTryParse = `        // a single corrupt stored value should skip that record, not abort the whole merge
        function tryParseJson(key, value, fallback) {
            if (value == null || value === undefined || value === '') return fallback;
            if (typeof value !== 'string') return value; // already an object (GM can store non-strings)`;

  if (result.includes(originalTryParse)) {
    result = result.replace(originalTryParse, fixedTryParse);
  } else {
    throw new Error('Could not find exact tryParseJson implementation to patch in source');
  }

  // 3. Make readUserConfig robust to both stringified JSON and native Object storage
  const originalReadUserConfig = `async function readUserConfig(myUserId, configKey, defaultValue) {
    try {
        let savedData = await GM.getValue(configKey + '#' + myUserId);
        return Object.assign({}, defaultValue, JSON.parse(savedData));
    } catch (e) {}
    return Object.assign({}, defaultValue);
}`;

  const fixedReadUserConfig = `async function readUserConfig(myUserId, configKey, defaultValue) {
    try {
        let savedData = await GM.getValue(configKey + '#' + myUserId);
        if (savedData == null) return Object.assign({}, defaultValue);
        const parsed = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
        return Object.assign({}, defaultValue, parsed);
    } catch (e) {}
    return Object.assign({}, defaultValue);
}`;

  if (result.includes(originalReadUserConfig)) {
    result = result.replace(originalReadUserConfig, fixedReadUserConfig);
  } else {
    throw new Error('Could not find exact readUserConfig implementation to patch in source');
  }

  // 4. Make readWatchList robust to both stringified JSON and native Object storage
  const originalReadWatchList = `    async function readWatchList() {
        try {
            let sSavedData = await GM.getValue('my_watchlist#' + myUserId);
            let watchList = JSON.parse(sSavedData);`;

  const fixedReadWatchList = `    async function readWatchList() {
        try {
            let sSavedData = await GM.getValue('my_watchlist#' + myUserId);
            let watchList = typeof sSavedData === 'string' ? JSON.parse(sSavedData) : (sSavedData || {});`;

  if (result.includes(originalReadWatchList)) {
    result = result.replace(originalReadWatchList, fixedReadWatchList);
  } else {
    throw new Error('Could not find exact readWatchList implementation to patch in source');
  }

  // 5. Reduce runGMBatch chunk size from 100 to 20 for FireMonkey WebExtension IPC stability
  const originalBatch = `    async function runGMBatch(items, asyncFunc, chunkSize) {
        const size = chunkSize || 100;`;
  const fixedBatch = `    async function runGMBatch(items, asyncFunc, chunkSize) {
        const size = chunkSize || 20;`;

  if (result.includes(originalBatch)) {
    result = result.replace(originalBatch, fixedBatch);
  } else {
    throw new Error('Could not find exact runGMBatch implementation to patch in source');
  }

  // 6. Add 1000ms flush buffer before location.reload() to guarantee storage persistence
  const originalReload1 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => {
                                        if (!cancelled) {
                                            document.location.reload();
                                        }
                                    })`;
  const fixedReload1 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => {
                                        if (!cancelled) {
                                            setTimeout(() => document.location.reload(), 1000);
                                        }
                                    })`;

  const originalReload2 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => document.location.reload())`;
  const fixedReload2 = `                                runWithProgressPopup(action, '导入中...', null, 5000)
                                    .then(() => setTimeout(() => document.location.reload(), 1000))`;

  if (result.includes(originalReload1)) {
    result = result.replace(originalReload1, fixedReload1);
  }
  if (result.includes(originalReload2)) {
    result = result.replace(originalReload2, fixedReload2);
  }

  return result;
}
