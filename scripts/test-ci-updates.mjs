import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { checkInventory, installReviewedTransfer, reviewPr, preparePrevious } from './ci-updates.mjs';
import { packageTransfer } from './lib/updates/artifacts.mjs';
import { hash, json, write, read } from './lib/updates/guards.mjs';

const root = await fs.mkdtemp(path.join(process.cwd(), '.fm/ci-tests-'));
const reviewRoot = 'updates/candidates';
const scriptId = 'safe-script';
const repository = { schemaVersion: 1, outputRoot: 'artifacts/converted', targetProfile: 'firemonkey-3.9-firefox-157.0', projects: [{ id: 'safe-project', upstream: { kind: 'local', path: 'upstream' }, scripts: [{ id: scriptId, sourcePath: 'input.user.js', sourceManager: 'unknown', outputPath: 'safe-script.user.js', identity: { name: 'Safe script', namespace: 'example' }, acceptance: { checklistId: 'safe-checks' }, publish: { mode: 'disabled' } }] }] };
const ctx = { updates: { reviewRoot }, repository, options: { expectedReviewRoot: reviewRoot, expectedScriptIds: [scriptId], expectedRepositoryConfig: repository } };
async function fixture(label) {
  const workspace = path.join(root, label); await fs.mkdir(workspace);
  const source = '// ==UserScript==\n// @name Safe script\n// @namespace example\n// @license MIT\n// ==/UserScript==\nconst value = 1;\n';
  const digest = hash(source); const fingerprint = hash('fixture');
  const lock = { schemaVersion: 1, snapshots: [{ schemaVersion: 1, scriptId, origin: repository.projects[0].upstream, retrievedAt: '2026-10-10T00:00:00.000Z', hash: digest, dependencies: [] }] };
  const lockBytes = json(lock);
  const provenance = Object.fromEntries(['repositoryConfigHash','updatesConfigHash','profileHash','rulesHash','skillHash','toolHash','providerHash'].map(k => [k, hash(k)]));
  Object.assign(provenance, { sourceHash: digest, sourceLockHash: hash(lockBytes), dependencyHashes: [] });
  const report = { schemaVersion: 1, scriptId, fingerprint, inputHash: digest, outputHash: digest, baselineState: 'pending-browser', candidateState: 'pending-browser', providerStatus: 'off', errors: 0, warnings: 0, unresolvedRuleIds: [], originalManualErrors: 0, browser: 'pending', fixture: 'pending', eligible: false, provenance, identity: repository.projects[0].scripts[0].identity, profileId: repository.targetProfile };
  const candidatePath = `${reviewRoot}/${scriptId}/candidate.user.js`; const reportPath = `${reviewRoot}/${scriptId}/report.json`;
  const reportBytes = json(report);
  const summary = { schemaVersion: 1, reviewRoot, entries: [{ scriptId, fingerprint, candidatePath, reportPath, candidateHash: digest, reportHash: hash(reportBytes) }] };
  await write(workspace, 'source.lock.json', lockBytes); await write(workspace, candidatePath, source); await write(workspace, reportPath, reportBytes); await write(workspace, `${reviewRoot}/summary.json`, json(summary));
  const incoming = path.join(root, `${label}-transfer`);
  const manifest = await packageTransfer({ workspace, reviewRoot, outputDir: incoming, expectedScriptIds: [scriptId] });
  return { workspace, incoming, manifest, candidatePath, reportPath };
}

test('review transfer installs only verified candidate files and preserves pending gates', async () => {
  const f = await fixture('valid'); const destination = path.join(root, 'valid-dest'); await fs.mkdir(destination);
  await installReviewedTransfer(destination, f.incoming, ctx);
  const report = JSON.parse(await read(destination, f.reportPath));
  assert.equal(report.browser, 'pending'); assert.equal(report.fixture, 'pending'); assert.equal(report.eligible, false);
  assert.deepEqual((await fs.readdir(destination)).sort(), ['source.lock.json','updates']);
});
test('extra raw file or symlink in transfer is rejected before installation', async () => {
  const f = await fixture('extra'); await write(f.incoming, '.fm/raw-response.json', 'secret-sentinel');
  await assert.rejects(checkInventory(f.incoming, f.manifest), /inventory/);
  const symlink = await fixture('symlink'); await fs.symlink('transfer.json', path.join(symlink.incoming, 'unexpected-link'));
  await assert.rejects(checkInventory(symlink.incoming, symlink.manifest), /inventory/);
});
test('hand-edited existing candidate and incomplete owned state block writes', async () => {
  const f = await fixture('owned'); await write(f.workspace, f.candidatePath, 'hand-edited');
  await assert.rejects(installReviewedTransfer(f.workspace, f.incoming, ctx), /ownership/);
  const broken = await fixture('broken'); await fs.rename(path.join(broken.workspace, broken.reportPath), path.join(broken.workspace, 'removed-report.json'));
  await assert.rejects(installReviewedTransfer(broken.workspace, broken.incoming, ctx));
});
test('untrusted review root, script selection and source origin cannot choose PR destinations', async () => {
  const f = await fixture('selection');
  await assert.rejects(installReviewedTransfer(f.workspace, f.incoming, { ...ctx, options: { ...ctx.options, expectedReviewRoot: 'skills' } }), /review-root/);
  await assert.rejects(installReviewedTransfer(f.workspace, f.incoming, { ...ctx, options: { ...ctx.options, expectedScriptIds: ['other-script'] } }), /script-selection/);
  const different = structuredClone(repository); different.projects[0].upstream.path = 'different';
  await assert.rejects(installReviewedTransfer(f.workspace, f.incoming, { ...ctx, options: { ...ctx.options, expectedRepositoryConfig: different } }), /lock-origin/);
});
test('candidate destination symlink cannot overwrite an outside file', async () => {
  const f = await fixture('escape'); const destination = path.join(root, 'escape-dest'); await fs.mkdir(destination);
  const outside = path.join(root, 'outside-sentinel'); await fs.writeFile(outside, 'preserve');
  await fs.mkdir(path.dirname(path.join(destination, f.candidatePath)), { recursive: true }); await fs.symlink(outside, path.join(destination, f.candidatePath));
  await assert.rejects(installReviewedTransfer(destination, f.incoming, ctx), /symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'preserve');
});
test('workflow separates provider secret from PR write job and restricts triggers', async () => {
  const workflow = await fs.readFile('.github/workflows/fm-scheduled-updates.yml', 'utf8');
  const generation = workflow.split('  review-pr:')[0]; const pr = workflow.split('  review-pr:')[1];
  assert.match(generation, /contents: read/); assert.match(generation, /secrets\.FM_MODEL_API_KEY/); assert.match(generation, /FM_UPDATES_ENABLED/);
  assert.match(pr, /contents: write/); assert.match(pr, /pull-requests: write/); assert.doesNotMatch(pr, /FM_MODEL_API_KEY|secrets\./);
  assert.doesNotMatch(workflow, /pull_request_target:|pull_request:|--force|evolve apply|prepare-release/);
  const actions = [...workflow.matchAll(/uses: ([^\n]+)/g)]; assert.ok(actions.length > 0); assert.ok(actions.every(m => /@[a-f0-9]{40}(?:\s|$)/.test(m[1])));
});

test('actual local Git review branch commits allowlisted changes, reads prior data and refuses protected changes', async () => {
  const f = await fixture('git-review');
  await write(f.workspace, '.gitignore', '.fm/\n');
  await fs.mkdir(path.join(f.workspace, '.fm/generation'), { recursive: true });
  await fs.rename(path.join(f.workspace, 'updates'), path.join(f.workspace, '.fm/generation/updates'));
  await fs.rename(path.join(f.workspace, 'source.lock.json'), path.join(f.workspace, '.fm/generation/source.lock.json'));
  await write(f.workspace, 'config/scripts.example.json', json(repository));
  await write(f.workspace, 'config/scheduled-updates.example.json', json({ schemaVersion: 1, reviewRoot, projectIds: ['safe-project'], provider: { mode: 'off' } }));
  await fs.cp(f.incoming, path.join(f.workspace, '.fm/ci-incoming'), { recursive: true });
  const localGit = args => exec('git', ['-c','core.hooksPath=/dev/null', ...args], { cwd: f.workspace });
  await localGit(['init','-b','main']);
  await localGit(['config','user.name','Fixture']); await localGit(['config','user.email','fixture@example.invalid']);
  await localGit(['add','.gitignore','config']); await localGit(['commit','-m','test: set up scheduled PR fixture']);
  await localGit(['remote','add','origin','https://github.com/fixtures/fm']);
  const keys = ['FM_REPOSITORY','FM_DEFAULT_BRANCH','GH_TOKEN']; const old = keys.map(k => process.env[k]);
  Object.assign(process.env, { FM_REPOSITORY: 'fixtures/fm', FM_DEFAULT_BRANCH: 'main', GH_TOKEN: 'secret-sentinel' });
  const remoteCalls = [];
  const mocks = { push: async args => { remoteCalls.push(args); return { stdout: '' }; }, gh: async args => { remoteCalls.push(args); return { stdout: args[1] === 'list' ? '[]' : '' }; } };
  try {
    assert.equal(await reviewPr(f.workspace, mocks), true);
    const subject = (await localGit(['log','-1','--format=%s'])).stdout.trim();
    assert.equal(subject, 'chore: update FM conversion review candidates');
    const committed = (await localGit(['diff','--name-only','main...HEAD'])).stdout.trim().split('\n').sort();
    assert.deepEqual(committed, f.manifest.files.map(v => v.path).sort());
    assert.ok(remoteCalls.some(args => args.includes('HEAD:refs/heads/automation/fm-updates')));
    assert.ok(remoteCalls.some(args => args[0] === 'pr' && args[1] === 'create'));
    assert.ok(remoteCalls.every(args => !args.includes('--force') && !args.some(v => String(v).includes('secret-sentinel'))));
    await localGit(['update-ref','refs/remotes/origin/automation/fm-updates','HEAD']);
    await localGit(['switch','main']);
    assert.equal(await preparePrevious(f.workspace), true);
    const previous = JSON.parse(await read(path.join(f.workspace, '.fm/ci-previous'), 'transfer.json'));
    assert.deepEqual(previous.files, f.manifest.files);
    await localGit(['switch','automation/fm-updates']);
    await write(f.workspace, 'README.md', 'unexpected protected change');
    await localGit(['add','README.md']); await localGit(['commit','-m','test: simulate protected branch change']);
    await localGit(['update-ref','refs/remotes/origin/automation/fm-updates','HEAD']);
    await localGit(['switch','main']);
    await assert.rejects(reviewPr(f.workspace, mocks), /protected-branch-change/);
  } finally { keys.forEach((k,i) => { if (old[i] === undefined) { delete process.env[k]; } else { process.env[k] = old[i]; } }); }
});
