import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { staticVerify } from '../../../packages/converter/dist/index.js';
import { applyStorageFix } from './storage-fix.mjs';
import { applyLintFix } from './lint-fix.mjs';

test('applyLintFix produces candidate that passes staticVerify with 0 lint errors', async () => {
  const inputHash = '921966e614485a170dfb261e51bc2de6de159119835f7faa963d6e96707c5853';
  const input = fs.readFileSync(`.fm/sources/${inputHash}.user.js`, 'utf8');
  const profile = JSON.parse(fs.readFileSync('profiles/firemonkey-3.9-firefox-157.0.json', 'utf8'));

  const patchedStorage = applyStorageFix(input);
  const cleaned = applyLintFix(patchedStorage, profile);

  const verified = await staticVerify({ source: cleaned, profile });
  assert.equal(verified.passed, true, 'staticVerify should pass');

  const errorFindings = verified.findings.filter(f => f.severity === 'error');
  assert.equal(errorFindings.length, 0, `Expected 0 errors, got: ${JSON.stringify(errorFindings)}`);

  const lintVerification = verified.verification.find(v => v.kind === 'lint');
  assert.ok(lintVerification, 'lint verification record should exist');
  assert.equal(lintVerification.status, 'passed', 'lint verification should be passed');

  // Verify storage patch retention
  assert.ok(cleaned.includes('typeof GM_getValue === \'function\''));
  assert.ok(cleaned.includes('chunkSize || 20'));
});
