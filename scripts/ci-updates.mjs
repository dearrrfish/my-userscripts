import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateContract } from '../packages/contracts/dist/index.js';
import { loadUpdatesConfig } from './lib/updates/config.mjs';
import { readTransfer, validateSummary, packageTransfer, ownedSummary } from './lib/updates/artifacts.mjs';
import { read, write, json, hash } from './lib/updates/guards.mjs';

const exec = promisify(execFile);
export const BRANCH = 'automation/fm-updates';
const REF = `refs/remotes/origin/${BRANCH}`;
const CONFIG = 'config/scheduled-updates.example.json';
const REPO_CONFIG = 'config/scripts.example.json';
const PREVIOUS = '.fm/ci-previous';
const TRANSFER = '.fm/ci-transfer';
const INCOMING = '.fm/ci-incoming';

async function command(program, args, options = {}) {
  try { return await exec(program, args, { timeout: 60000, maxBuffer: 6000000, ...options }); }
  catch (error) { const failure = new Error('ci-command-failed'); failure.code = error.code; throw failure; }
}
async function git(args, options = {}) {
  return command('git', ['-c', 'core.hooksPath=/dev/null', ...args], options);
}
async function context(workspace) {
  const updates = await loadUpdatesConfig(workspace, CONFIG);
  const repository = validateContract('RepositoryConfig', JSON.parse(await read(workspace, REPO_CONFIG)));
  const selected = repository.projects.filter(p => updates.projectIds.includes(p.id));
  if (selected.length !== updates.projectIds.length) { throw new Error('ci-project-selection'); }
  return { updates, repository, options: { expectedReviewRoot: updates.reviewRoot, expectedScriptIds: selected.flatMap(p => p.scripts.map(s => s.id)), expectedRepositoryConfig: repository } };
}
async function existsRef(workspace = process.cwd()) {
  try { await git(['show-ref', '--verify', '--quiet', REF], { cwd: workspace }); return true; }
  catch (error) { if (error.code === 1) { return false; } throw error; }
}
export async function checkInventory(root, manifest) {
  const rootType = await fs.lstat(root);
  if (!rootType.isDirectory() || rootType.isSymbolicLink()) { throw new Error('ci-transfer-inventory'); }
  const expected = new Set(['transfer.json', ...manifest.files.map(f => f.path)]);
  async function visit(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) { await visit(path.join(dir, entry.name), name + '/'); }
      else if (!entry.isFile() || !expected.delete(name)) { throw new Error('ci-transfer-inventory'); }
    }
  }
  await visit(root);
  if (expected.size) { throw new Error('ci-transfer-inventory'); }
}
export async function preparePrevious(workspace, ctx = undefined) {
  ctx ??= await context(workspace);
  if (!await existsRef(workspace)) { return false; }
  const treeRoot = '.fm/ci-prior-tree';
  const { stdout } = await git(['ls-tree', '-r', '-z', '--full-tree', REF, '--', ctx.updates.reviewRoot, 'source.lock.json'], { encoding: 'buffer', cwd: workspace });
  const summaryPath = `${ctx.updates.reviewRoot}/summary.json`;
  const summaryBytes = (await git(['show', `${REF}:${summaryPath}`], { encoding: 'buffer', cwd: workspace })).stdout;
  const summary = validateSummary(JSON.parse(summaryBytes.toString('utf8')), ctx.options);
  const expected = new Set(['source.lock.json', summaryPath, ...summary.entries.flatMap(e => [e.candidatePath, e.reportPath])]);
  for (const record of stdout.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(100644) blob [a-f0-9]{40}\t(.+)$/.exec(record);
    if (!match || !expected.delete(match[2])) { throw new Error('ci-prior-tree'); }
    const bytes = (await git(['show', `${REF}:${match[2]}`], { encoding: 'buffer', cwd: workspace })).stdout;
    await write(workspace, `${treeRoot}/${match[2]}`, bytes);
  }
  if (expected.size) { throw new Error('ci-prior-tree'); }
  await packageTransfer({ workspace: path.join(workspace, treeRoot), reviewRoot: ctx.updates.reviewRoot, outputDir: path.join(workspace, PREVIOUS), expectedScriptIds: ctx.options.expectedScriptIds });
  return true;
}
export async function checkGenerated(workspace) {
  const ctx = await context(workspace);
  let current;
  try { current = await readTransfer(path.join(workspace, TRANSFER), ctx.options); }
  catch (error) { if (error.code === 'ENOENT' && !await fs.stat(path.join(workspace, TRANSFER)).catch(e => { if (e.code === 'ENOENT') { return undefined; } throw e; })) { return false; } throw error; }
  await checkInventory(path.join(workspace, TRANSFER), current);
  let previous;
  try { previous = await readTransfer(path.join(workspace, PREVIOUS), ctx.options); }
  catch (error) {
    const priorExists = await fs.lstat(path.join(workspace, PREVIOUS)).catch(e => { if (e.code === 'ENOENT') { return undefined; } throw e; });
    if (error.code !== 'ENOENT' || priorExists) { throw error; }
  }
  return !previous || json(current.files) !== json(previous.files);
}
function allowedDestination(file, ctx) {
  return file === 'source.lock.json' || file === `${ctx.updates.reviewRoot}/summary.json` || ctx.options.expectedScriptIds.some(id => file === `${ctx.updates.reviewRoot}/${id}/candidate.user.js` || file === `${ctx.updates.reviewRoot}/${id}/report.json`);
}
export async function installReviewedTransfer(workspace, incoming, ctx) {
  const manifest = await readTransfer(incoming, ctx.options);
  await checkInventory(incoming, manifest);
  const old = await ownedSummary(workspace, ctx.updates.reviewRoot, ctx.options.expectedScriptIds);
  try { validateContract('SourceLock', JSON.parse(await read(workspace, 'source.lock.json'))); } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
  const owned = new Set(old.entries.flatMap(e => [e.candidatePath, e.reportPath]));
  for (const file of manifest.files) {
    if (!allowedDestination(file.path, ctx)) { throw new Error('ci-destination'); }
    try {
      const existing = await read(workspace, file.path);
      const structural = file.path === 'source.lock.json' || file.path === `${ctx.updates.reviewRoot}/summary.json`;
      if (!structural && !owned.has(file.path) && hash(existing) !== file.sha256) { throw new Error('ci-unowned-destination'); }
    } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
  }
  // All paths, contents and current ownership are checked before any write.
  for (const file of manifest.files) { await write(workspace, file.path, await read(incoming, file.path)); }
  return manifest;
}
export async function reviewPr(workspace, { gitCommand = git, push, gh } = {}) {
  const runGit = (args, options = {}) => gitCommand(args, { cwd: workspace, ...options });
  const runGh = gh ?? (args => command('gh', args, { cwd: workspace }));
  const ctx = await context(workspace); // Capture trusted configuration before branch changes.
  const incoming = path.join(workspace, INCOMING);
  const transfer = await readTransfer(incoming, ctx.options);
  await checkInventory(incoming, transfer);
  const repository = process.env.FM_REPOSITORY;
  const base = process.env.FM_DEFAULT_BRANCH;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !base || base.startsWith('-') || !/^[A-Za-z0-9_./-]+$/.test(base) || !process.env.GH_TOKEN) { throw new Error('ci-environment'); }
  if ((await runGit(['status', '--porcelain'])).stdout.trim()) { throw new Error('ci-dirty-checkout'); }
  const present = await runGit(['show-ref', '--verify', '--quiet', REF]).then(() => true, error => { if (error.code === 1) { return false; } throw error; });
  if (present) {
    const changed = (await runGit(['diff', '--name-only', `HEAD...${REF}`])).stdout.trim().split('\n').filter(Boolean);
    if (changed.some(name => !allowedDestination(name, ctx))) { throw new Error('ci-protected-branch-change'); }
    await runGit(['switch', '-c', BRANCH, REF]);
  } else { await runGit(['switch', '-c', BRANCH]); }
  const manifest = await installReviewedTransfer(workspace, incoming, ctx);
  await runGit(['add', '--', ...manifest.files.map(f => f.path)]);
  const diff = (await runGit(['diff', '--cached', '--name-only'])).stdout.trim();
  if (!diff) { return false; }
  await runGit(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', '-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: update FM conversion review candidates']);
  const remote = (await runGit(['remote', 'get-url', 'origin'])).stdout.trim();
  if (![ `https://github.com/${repository}`, `https://github.com/${repository}.git` ].includes(remote)) { throw new Error('ci-origin'); }
  const askpass = '.fm/ci-git-askpass.sh';
  await write(workspace, askpass, '#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" x-access-token ;; *Password*) printf "%s\\n" "$GH_TOKEN" ;; *) exit 1 ;; esac\n');
  await fs.chmod(path.join(workspace, askpass), 0o700);
  await (push ?? runGit)(['-c', 'credential.helper=', 'push', 'origin', `HEAD:refs/heads/${BRANCH}`], { env: { ...process.env, GIT_ASKPASS: path.join(workspace, askpass), GIT_TERMINAL_PROMPT: '0' } });
  const bodyPath = '.fm/ci-pr-body.md';
  await write(workspace, bodyPath, 'Scheduled upstream synchronization and optional bounded model conversion drafts.\n\nThese are unaccepted review artifacts: browser and fixture checks remain pending; blocked diagnostics and original manual obligations remain. No release, automatic merge, or rule/SKILL evolution is performed. Review the structured candidate reports and exact script bytes before any further action.\n');
  const { stdout } = await runGh(['pr', 'list', '--repo', repository, '--head', BRANCH, '--base', base, '--state', 'open', '--json', 'number']);
  const prs = JSON.parse(stdout);
  if (!Array.isArray(prs) || prs.length > 1 || prs.some(p => !Number.isInteger(p.number) || p.number < 1)) { throw new Error('ci-pr-selection'); }
  if (prs.length) { await runGh(['pr', 'edit', String(prs[0].number), '--repo', repository, '--title', 'chore: update FM conversion review candidates', '--body-file', path.join(workspace, bodyPath)]); }
  else { await runGh(['pr', 'create', '--repo', repository, '--head', BRANCH, '--base', base, '--title', 'chore: update FM conversion review candidates', '--body-file', path.join(workspace, bodyPath)]); }
  return true;
}
export async function main(args = process.argv.slice(2), workspace = process.cwd()) {
  if (args.length !== 1) { throw new Error('ci-command'); }
  if (args[0] === 'previous') { await preparePrevious(workspace); return; }
  if (args[0] === 'check-generated') {
    const changed = await checkGenerated(workspace);
    if (process.env.GITHUB_OUTPUT) { await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`); }
    console.log(`changed=${changed}`); return;
  }
  if (args[0] === 'review-pr') { await reviewPr(workspace); return; }
  throw new Error('ci-command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('FM review automation failed; check configuration, permissions and artifact ownership.'); process.exitCode = 1; });
}
