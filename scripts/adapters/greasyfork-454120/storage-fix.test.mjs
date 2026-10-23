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

test('patched wrapper safely delegates to FireMonkey class GM without this context errors', async () => {
  const GM = MockFireMonkeyGM;
  GM.storage = {};

  const safeGM = {
    getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
    setValue: (key, value) => GM.setValue(key, value),
    deleteValue: (key) => GM.deleteValue(key),
    listValues: () => GM.listValues()
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
  assert.ok(patched.includes('setValue: (key, value) => GM.setValue(key, value)'));
  assert.ok(patched.includes('const size = chunkSize || 20;'));
  assert.ok(patched.includes('setTimeout(() => document.location.reload(), 300)'));
  assert.ok(!patched.includes('setValue: GM.setValue,'));
});
