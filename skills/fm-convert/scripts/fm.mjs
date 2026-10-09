import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 21) {
  console.error('fm-convert requires Node >=24.21.0 <25.');
  process.exitCode = 1;
} else {
  try {
    const portable = path.join(skillRoot, 'runtime');
    let runtimeRoot;
    try {
      await fs.stat(portable);
      runtimeRoot = portable;
    } catch (error) {
      if (error.code !== 'ENOENT') { throw error; }
      runtimeRoot = path.resolve(skillRoot, '../..');
    }
    if (runtimeRoot === portable) {
      const verifier = path.join(runtimeRoot, 'scripts/bundle.mjs');
      const manifestFile = path.join(runtimeRoot, 'bundle-manifest.json');
      // Bootstrap consistency with built-ins before any bundled verifier code runs.
      const root = await fs.realpath(skillRoot);
      for (const [file, directory] of [[runtimeRoot, true], [manifestFile, false], [verifier, false]]) {
        const stat = await fs.lstat(file);
        const real = await fs.realpath(file);
        if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
          || real !== file || !real.startsWith(root + path.sep)) {
          throw new Error('Unsafe portable bootstrap path');
        }
      }
      const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
      const records = Array.isArray(manifest.records)
        ? manifest.records.filter(record => record.path === 'runtime/scripts/bundle.mjs') : [];
      const digest = createHash('sha256').update(await fs.readFile(verifier)).digest('hex');
      if (records.length !== 1 || records[0].type !== 'file'
        || !/^[a-f0-9]{64}$/.test(records[0].hash) || records[0].hash !== digest) {
        throw new Error('Portable verifier differs from its manifest');
      }
      const { verifyBundle } = await import(pathToFileURL(verifier).href);
      await verifyBundle(skillRoot);
    }
    const entry = path.join(runtimeRoot, 'packages/cli/dist/index.js');
    try { await fs.access(entry); } catch {
      throw new Error('Built CLI is missing. In the source repository run: pnpm install --frozen-lockfile --store-dir .fm/pnpm-store && pnpm build');
    }
    const { runCli } = await import(pathToFileURL(entry).href);
    const result = await runCli(process.argv.slice(2), { cwd: process.cwd() });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.code;
  } catch (error) {
    console.error(error.message === 'Built CLI is missing. In the source repository run: pnpm install --frozen-lockfile --store-dir .fm/pnpm-store && pnpm build'
      ? error.message : 'fm-convert could not load or verify its runtime safely. Inspect the trusted bundle or source build.');
    process.exitCode = 1;
  }
}
