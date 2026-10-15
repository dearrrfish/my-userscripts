import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseMetadata, staticVerify } from '../packages/converter/dist/index.js';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');

export const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/';
export const DEFAULT_RELEASE_ROOT = 'releases';

export const MANAGED_SCRIPTS = [
  {
    id: 'greasyfork-24204',
    name: 'Picviewer CE+',
    namespace: 'https://github.com/hoothin/UserScripts',
    candidatePath: '.fm/adaptations/picviewer-ce/candidate.user.js',
    fallbackCandidatePath: 'artifacts/converted/greasyfork-24204-settings-fix.user.js',
    upstreamUrl: 'https://greasyfork.org/zh-CN/scripts/24204-picviewer-ce',
    expectedCandidateHash: '13cb48ebe60a0d35480cafaa1e8bd63abaf0bf7bda7e29ff96c99fd366168630',
    version: '2026.9.29.1',
    rebuild: async (workspaceRoot) => {
      const { runCli } = await import('../packages/cli/dist/index.js');
      await runCli(['sync', '--config', 'config/scripts.picviewer-ce.json', '--project', 'greasyfork-24204'], { cwd: workspaceRoot });
      const rebuildScript = path.resolve(workspaceRoot, 'scripts/adapters/picviewer-ce/rebuild.mjs');
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(execFile)(process.execPath, [rebuildScript], { cwd: workspaceRoot });
    }
  }
];

export function hash(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function freezeMetadata(source, { scriptId, version, baseUrl }) {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const downloadUrl = new URL(`${scriptId}.user.js`, base).href;
  const updateUrl = new URL(`${scriptId}.meta.js`, base).href;

  const parsed = parseMetadata(source);
  if (!parsed.valid) {
    throw new Error(`Invalid metadata block in script ${scriptId}`);
  }

  let result = source;
  // Remove existing version, downloadURL, updateURL entries in reverse order
  for (const entry of [...parsed.entries].reverse()) {
    if (['version', 'downloadURL', 'updateURL'].includes(entry.key)) {
      const lineStart = result.lastIndexOf('\n', entry.start - 1) + 1;
      const lineEnd = result.indexOf('\n', entry.end);
      result = result.slice(0, lineStart) + result.slice(lineEnd < 0 ? result.length : lineEnd + 1);
    }
  }

  const closeMatch = /^[ \t]*\/\/\s*==\/UserScript==[^\r\n]*/m.exec(result);
  if (!closeMatch) {
    throw new Error(`Canonical metadata closing marker missing in script ${scriptId}`);
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const headerAddition = `// @version              ${version}${newline}// @downloadURL          ${downloadUrl}${newline}// @updateURL            ${updateUrl}${newline}`;
  result = result.slice(0, closeMatch.index) + headerAddition + result.slice(closeMatch.index);

  return { source: result, downloadUrl, updateUrl };
}

export function extractMetadata(source, scriptId) {
  const closing = /^[^\S\r\n]*\/\/[^\S\r\n]*==\/UserScript==[^\S\r\n]*(?:\r?\n|$)/m.exec(source);
  if (!closing) {
    throw new Error(`Canonical metadata closing marker missing in script ${scriptId}`);
  }
  return source.slice(0, closing.index + closing[0].length);
}

export async function publishScript(scriptDef, options = {}) {
  const workspaceRoot = options.workspaceRoot ?? root;
  const releaseRoot = path.resolve(workspaceRoot, options.releaseRoot ?? DEFAULT_RELEASE_ROOT);
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  // Resolve candidate source file
  let candidateSource;
  const primaryCandidatePath = path.resolve(workspaceRoot, scriptDef.candidatePath);
  try {
    candidateSource = await fs.readFile(primaryCandidatePath, 'utf8');
  } catch (err) {
    if (scriptDef.fallbackCandidatePath) {
      try {
        const fallbackPath = path.resolve(workspaceRoot, scriptDef.fallbackCandidatePath);
        candidateSource = await fs.readFile(fallbackPath, 'utf8');
      } catch {}
    }
    if (!candidateSource && typeof scriptDef.rebuild === 'function') {
      console.log(`Rebuilding candidate for ${scriptDef.id}...`);
      await scriptDef.rebuild(workspaceRoot);
      candidateSource = await fs.readFile(primaryCandidatePath, 'utf8');
    }
    if (!candidateSource) {
      throw err;
    }
  }

  const candidateHash = hash(candidateSource);
  if (scriptDef.expectedCandidateHash && candidateHash !== scriptDef.expectedCandidateHash) {
    throw new Error(`Candidate hash mismatch for ${scriptDef.id}: expected ${scriptDef.expectedCandidateHash}, got ${candidateHash}`);
  }

  // Freeze metadata with version, downloadURL, updateURL
  const version = scriptDef.version;
  const frozen = freezeMetadata(candidateSource, { scriptId: scriptDef.id, version, baseUrl });
  const metaSource = extractMetadata(frozen.source, scriptDef.id);

  // Validate the frozen script and meta
  const checkScript = parseMetadata(frozen.source);
  if (!checkScript.valid) {
    throw new Error(`Frozen script ${scriptDef.id} has invalid metadata`);
  }
  const checkMeta = parseMetadata(metaSource);
  if (!checkMeta.valid) {
    throw new Error(`Extracted meta ${scriptDef.id} has invalid metadata`);
  }

  // Verify fields
  const vEntry = checkScript.entries.find(e => e.key === 'version');
  const dEntry = checkScript.entries.find(e => e.key === 'downloadURL');
  const uEntry = checkScript.entries.find(e => e.key === 'updateURL');
  if (vEntry?.value !== version || dEntry?.value !== frozen.downloadUrl || uEntry?.value !== frozen.updateUrl) {
    throw new Error(`Metadata field mismatch in frozen script ${scriptDef.id}`);
  }

  // Create release destination
  await fs.mkdir(releaseRoot, { recursive: true });

  const userJsPath = path.join(releaseRoot, `${scriptDef.id}.user.js`);
  const metaJsPath = path.join(releaseRoot, `${scriptDef.id}.meta.js`);
  const manifestPath = path.join(releaseRoot, `${scriptDef.id}.manifest.json`);

  const manifest = {
    schemaVersion: 1,
    scriptId: scriptDef.id,
    name: scriptDef.name,
    namespace: scriptDef.namespace,
    version,
    candidateHash,
    userJsHash: hash(frozen.source),
    metaJsHash: hash(metaSource),
    downloadUrl: frozen.downloadUrl,
    updateUrl: frozen.updateUrl,
    upstreamUrl: scriptDef.upstreamUrl,
    publishedAt: new Date().toISOString()
  };

  await fs.writeFile(userJsPath, frozen.source, 'utf8');
  await fs.writeFile(metaJsPath, metaSource, 'utf8');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return {
    scriptId: scriptDef.id,
    version,
    userJsPath,
    metaJsPath,
    manifestPath,
    manifest
  };
}

export async function publishAll(options = {}) {
  const results = [];
  const targetId = options.scriptId;
  const scriptsToPublish = targetId
    ? MANAGED_SCRIPTS.filter(s => s.id === targetId)
    : MANAGED_SCRIPTS;

  if (targetId && !scriptsToPublish.length) {
    throw new Error(`Unknown managed script id: ${targetId}`);
  }

  for (const scriptDef of scriptsToPublish) {
    const res = await publishScript(scriptDef, options);
    results.push(res);
    console.log(`✓ Published ${scriptDef.name} (${scriptDef.id}) v${res.version} to ${res.userJsPath}`);
  }

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let scriptId;
  let releaseRoot = DEFAULT_RELEASE_ROOT;
  let baseUrl = DEFAULT_BASE_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--script' && args[i + 1]) { scriptId = args[++i]; }
    else if (args[i] === '--release-root' && args[i + 1]) { releaseRoot = args[++i]; }
    else if (args[i] === '--base-url' && args[i + 1]) { baseUrl = args[++i]; }
  }

  publishAll({ scriptId, releaseRoot, baseUrl })
    .then(results => {
      console.log(`Successfully published ${results.length} script(s).`);
    })
    .catch(err => {
      console.error('Publication failed:', err);
      process.exitCode = 1;
    });
}
