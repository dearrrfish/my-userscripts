import {readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateContract} from '../../packages/contracts/dist/index.js';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  const value = args[index + 1];
  if (!['--upstream', '--source'].includes(name) || !value || value.startsWith('--') || options[name]) {
    console.error('Usage: node fixtures/rules/verify-profile.mjs --upstream <dir> --source <path>');
    process.exit(2);
  }
  options[name] = value;
}
if (!options['--upstream'] || !options['--source']) {
  console.error('Usage: node fixtures/rules/verify-profile.mjs --upstream <dir> --source <path>');
  process.exit(2);
}
const upstreamFile = name => join(options['--upstream'], name);
const source = options['--source'];
const profile = validateContract('TargetProfile', read('profiles/firemonkey-3.9-firefox-157.0.json'));
const lock = validateContract('SourceLock', read('config/sources/greasyfork-454120.lock.json'));
assert.equal(profile.fm.sourceCommit, read(upstreamFile('fm-tag-v3.9.json')).object.sha);
assert.equal(profile.fm.version, read(upstreamFile('manifest.json')).version);
assert.equal(profile.fm.release, read(upstreamFile('fm-release.json')).tag_name);
assert.equal(profile.firefox.version, read(upstreamFile('firefox-versions.json')).LATEST_FIREFOX_VERSION);
assert.match(read(upstreamFile('fm-release.json')).body, /ESLint to 10\.11\.0/);
assert.equal(profile.help.hash, hash(upstreamFile('help.html')));
assert.equal(profile.lint.sourceHash, hash(upstreamFile('editor-rules.js')));
assert.deepEqual(profile.lint.config, read(upstreamFile('lint-base.json')));
assert.equal(Object.keys(profile.lint.config.rules).length, 96);
assert.equal(Object.keys(profile.lint.config.languageOptions.globals).length, 1260);
for (const capability of [...profile.capabilities.api, ...profile.capabilities.metadata]) {
  for (const evidence of capability.evidence) {
    assert.equal(evidence.hash, hash(upstreamFile(evidence.reference.split('/').at(-1))));
  }
}
assert.equal(lock.snapshots[0].hash, hash(source));
assert.equal(statSync(source).size, 761051);
// validateContract validates capture timestamps; a copied snapshot may have a new mtime.
assert.equal((readFileSync(source, 'utf8').match(/^\/\/\s+@(require|resource)\s/gm) || []).length, 0);
const guidance = read('rules/scripts/greasyfork-454120/storage-grant-review.json');
assert.equal(guidance.evidence[1].hash, hash('config/sources/greasyfork-454120.lock.json'));
assert.equal(guidance.preconditions[0].query, hash(source));
assert.equal(hash('profiles/licenses/firemonkey-MPL-2.0.txt'), hash(upstreamFile('LICENSE')));
const notice = readFileSync('profiles/NOTICE.md', 'utf8');
for (const match of notice.matchAll(/^\| ([^|]+) \| [^|]+ \| `([a-f0-9]{64})` \|$/gm)) {
  assert.equal(match[2], hash(upstreamFile(match[1].trim())));
}
console.log('PASS: source lock, target pins, evidence/provenance hashes, 96 rules/1260 globals, source size/dependencies, license and guidance binding');
