import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeMetadata, extractMetadata, publishScript, hash, DEFAULT_BASE_URL, MANAGED_SCRIPTS } from './publish.mjs';
import { parseMetadata, staticVerify } from '../packages/converter/dist/index.js';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');

test('freezeMetadata replaces version, downloadURL, updateURL correctly', () => {
  const sample = `// ==UserScript==
// @name         Test Script
// @namespace    https://example.com/
// @version      1.0.0
// @description  Sample description
// @author       Author
// @match        https://example.com/*
// @downloadURL  https://old.example.com/script.user.js
// @updateURL    https://old.example.com/script.meta.js
// @grant        GM_getValue
// ==/UserScript==

console.log('hello world');
`;

  const { source, downloadUrl, updateUrl } = freezeMetadata(sample, {
    scriptId: 'test-script',
    version: '2.0.0',
    baseUrl: 'https://raw.githubusercontent.com/owner/repo/master/releases/'
  });

  assert.equal(downloadUrl, 'https://raw.githubusercontent.com/owner/repo/master/releases/test-script.user.js');
  assert.equal(updateUrl, 'https://raw.githubusercontent.com/owner/repo/master/releases/test-script.meta.js');

  const parsed = parseMetadata(source);
  assert.ok(parsed.valid);
  assert.equal(parsed.identity.name, 'Test Script [FM-Compat]');

  const versions = parsed.entries.filter(e => e.key === 'version');
  const downloads = parsed.entries.filter(e => e.key === 'downloadURL');
  const updates = parsed.entries.filter(e => e.key === 'updateURL');

  assert.equal(versions.length, 1);
  assert.equal(versions[0].value, '2.0.0');

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].value, downloadUrl);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].value, updateUrl);

  assert.ok(source.includes("console.log('hello world');"));
});

test('extractMetadata extracts only the canonical header block', () => {
  const sample = `// ==UserScript==
// @name Test
// @namespace https://example.com/
// @version 1.0.0
// ==/UserScript==

const x = 42;
`;

  const meta = extractMetadata(sample, 'test');
  assert.equal(meta.trim(), `// ==UserScript==\n// @name Test\n// @namespace https://example.com/\n// @version 1.0.0\n// ==/UserScript==`);
  assert.ok(!meta.includes('const x = 42;'));

  const parsed = parseMetadata(meta);
  assert.ok(parsed.valid);
  assert.equal(parsed.identity.name, 'Test');
});

test('publishScript publishes valid files and manifest into release root', async () => {
  const tmpDir = await fs.mkdtemp(path.join(root, '.fm/publish-test-'));
  const candidateFile = path.join(tmpDir, 'candidate.user.js');

  const source = `// ==UserScript==
// @name         Synthetic Script
// @namespace    https://example.com/
// @version      0.1.0
// @grant        none
// ==/UserScript==

(() => {
  console.log('test');
})();
`;
  await fs.writeFile(candidateFile, source, 'utf8');

  const scriptDef = {
    id: 'synthetic-script',
    name: 'Synthetic Script',
    namespace: 'https://example.com/',
    candidatePath: path.relative(tmpDir, candidateFile),
    upstreamUrl: 'https://greasyfork.org/scripts/12345',
    expectedCandidateHash: hash(source),
    version: '1.0.0'
  };

  const res = await publishScript(scriptDef, {
    workspaceRoot: tmpDir,
    releaseRoot: 'releases',
    baseUrl: 'https://raw.githubusercontent.com/test/repo/master/releases/'
  });

  assert.equal(res.scriptId, 'synthetic-script');
  assert.equal(res.version, '1.0.0');

  const userJsExists = await fs.stat(res.userJsPath).then(() => true, () => false);
  const metaJsExists = await fs.stat(res.metaJsPath).then(() => true, () => false);
  const manifestExists = await fs.stat(res.manifestPath).then(() => true, () => false);

  assert.ok(userJsExists, 'user.js should exist');
  assert.ok(metaJsExists, 'meta.js should exist');
  assert.ok(manifestExists, 'manifest.json should exist');

  const userJsContent = await fs.readFile(res.userJsPath, 'utf8');
  const metaJsContent = await fs.readFile(res.metaJsPath, 'utf8');
  const manifestContent = JSON.parse(await fs.readFile(res.manifestPath, 'utf8'));

  const parsedUserJs = parseMetadata(userJsContent);
  assert.ok(parsedUserJs.valid);
  assert.equal(parsedUserJs.entries.find(e => e.key === 'version')?.value, '1.0.0');
  assert.equal(parsedUserJs.entries.find(e => e.key === 'downloadURL')?.value, 'https://raw.githubusercontent.com/test/repo/master/releases/synthetic-script.user.js');

  const parsedMetaJs = parseMetadata(metaJsContent);
  assert.ok(parsedMetaJs.valid);

  assert.equal(manifestContent.scriptId, 'synthetic-script');
  assert.equal(manifestContent.version, '1.0.0');
  assert.equal(manifestContent.userJsHash, hash(userJsContent));
  assert.equal(manifestContent.metaJsHash, hash(metaJsContent));

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('managed greasyfork-454120 publishes with valid metadata and candidate hash', async () => {
  const scriptDef = MANAGED_SCRIPTS.find(s => s.id === 'greasyfork-454120');
  assert.ok(scriptDef, 'greasyfork-454120 should be in MANAGED_SCRIPTS');

  const tmpDir = await fs.mkdtemp(path.join(root, '.fm/publish-454120-test-'));
  const res = await publishScript(scriptDef, {
    workspaceRoot: root,
    releaseRoot: path.relative(root, path.join(tmpDir, 'releases')),
    baseUrl: DEFAULT_BASE_URL
  });

  assert.equal(res.scriptId, 'greasyfork-454120');
  assert.equal(res.version, '100.0.2');

  const userJsContent = await fs.readFile(res.userJsPath, 'utf8');
  const parsed = parseMetadata(userJsContent);
  assert.ok(parsed.valid);
  assert.equal(parsed.identity.name, '南加北加论坛强化脚本(凛+) [FM-Compat]');
  assert.equal(parsed.entries.find(e => e.key === 'version')?.value, '100.0.2');
  assert.equal(parsed.entries.find(e => e.key === 'downloadURL')?.value, 'https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/greasyfork-454120.user.js');

  await fs.rm(tmpDir, { recursive: true, force: true });
});
