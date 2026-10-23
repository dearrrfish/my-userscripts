import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { hash } from '../../../packages/converter/dist/index.js';
import { applyStorageFix } from './storage-fix.mjs';
import { applyLintFix } from './lint-fix.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(root), 'Run from the repository root');

const base = '.fm/adaptations/greasyfork-454120/';
const inputHash = '921966e614485a170dfb261e51bc2de6de159119835f7faa963d6e96707c5853';

const inputPath = `.fm/sources/${inputHash}.user.js`;
if (!fs.existsSync(inputPath)) {
  throw new Error(`Upstream source file missing at ${inputPath}; run sync first`);
}

const input = fs.readFileSync(inputPath, 'utf8');
assert.equal(hash(input), inputHash, 'Unexpected upstream hash; source differs from lock');

fs.mkdirSync(base, { recursive: true });
const destination = path.join(base, 'candidate.user.js');

const patchedStorage = applyStorageFix(input);
const cleaned = applyLintFix(patchedStorage);
fs.writeFileSync(destination, cleaned, 'utf8');

const outputHash = hash(cleaned);
console.log(`Rebuilt FireMonkey-adapted & lint-cleaned candidate for 454120: ${outputHash}`);
