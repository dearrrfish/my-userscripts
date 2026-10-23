import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyStorageFix } from './storage-fix.mjs';

// Simulated FireMonkey class GM with static method dependencies
class MockFireMonkeyGM {
  static storage = {};

  static setValues(obj) {
    Object.assign(this.storage, obj);
    return Promise.resolve();
  }

  static setValue(key, value) {
    if (typeof key !== 'string') return;
    return this.setValues({ [key]: value });
  }

  static getValues(obj) {
    const res = {};
    for (const k of Object.keys(obj)) {
      res[k] = this.storage[k] ?? obj[k];
    }
    return Promise.resolve(res);
  }

  static async getValue(key, defaultValue) {
    const res = await this.getValues({ [key]: defaultValue });
    return res[key];
  }

  static listValues() {
    return Promise.resolve(Object.keys(this.storage));
  }

  static deleteValues(keys) {
    for (const k of keys) delete this.storage[k];
    return Promise.resolve();
  }

  static deleteValue(key) {
    return this.deleteValues([key]);
  }
}

test('unbound FireMonkey GM.setValue throws TypeError when extracted without binding', async () => {
  const unboundGM = {
    setValue: MockFireMonkeyGM.setValue,
    getValue: MockFireMonkeyGM.getValue,
    listValues: MockFireMonkeyGM.listValues
  };

  assert.throws(() => {
    unboundGM.setValue('testKey', 'testVal');
  }, /this\.setValues is not a function/);
});

test('patched wrapper safely delegates to FireMonkey storage without this context errors', async () => {
  const GM = MockFireMonkeyGM;
  GM.storage = {};
  const inMemory = {};

  const GM_getValue = (k, def) => (k in inMemory ? inMemory[k] : def);
  const GM_setValue = (k, v) => { inMemory[k] = v; };
  const GM_deleteValue = (k) => { delete inMemory[k]; };
  const GM_listValues = () => Object.keys(inMemory);

  const safeGM = {
    async getValue(key, defaultValue) {
      const val = GM_getValue(key, defaultValue);
      if (val !== undefined) return val;
      const asyncVal = await GM.getValue(key, defaultValue !== undefined ? defaultValue : null);
      return asyncVal !== null ? asyncVal : defaultValue;
    },
    async setValue(key, value) {
      GM_setValue(key, value);
      await GM.setValue(key, value);
    },
    async deleteValue(key) {
      GM_deleteValue(key);
      await GM.deleteValue(key);
    },
    async listValues() {
      const set = new Set(GM_listValues());
      (await GM.listValues()).forEach(k => set.add(k));
      return Array.from(set);
    }
  };

  await safeGM.setValue('pref_user_1', '{"theme":"dark"}');
  const storedVal = await safeGM.getValue('pref_user_1');
  assert.equal(storedVal, '{"theme":"dark"}');

  const keys = await safeGM.listValues();
  assert.deepEqual(keys, ['pref_user_1']);

  await safeGM.deleteValue('pref_user_1');
  const deletedVal = await safeGM.getValue('pref_user_1');
  assert.equal(deletedVal, undefined);
});

test('applyStorageFix applies cleanly to 454120 upstream source', () => {
  const inputHash = '921966e614485a170dfb261e51bc2de6de159119835f7faa963d6e96707c5853';
  const input = fs.readFileSync(`.fm/sources/${inputHash}.user.js`, 'utf8');

  const patched = applyStorageFix(input);
  assert.notEqual(patched, input);
  assert.ok(patched.includes('typeof GM_getValue === \'function\''));
  assert.ok(patched.includes('value == null || value === undefined || value === \'\''));
  assert.ok(patched.includes('const parsed = typeof savedData === \'string\' ? JSON.parse(savedData) : savedData;'));
  assert.ok(patched.includes('let watchList = typeof sSavedData === \'string\' ? JSON.parse(sSavedData) : (sSavedData || {});'));
  assert.ok(patched.includes('const size = chunkSize || 20;'));
  assert.ok(patched.includes('setTimeout(() => document.location.reload(), 1000)'));
});
