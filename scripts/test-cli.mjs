import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((a,b) => a.name < b.name ? -1 : 1)) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { found.push(...await files(file)); }
    else if (entry.name.endsWith('.test.mjs')) { found.push(file); }
  }
  return found;
}
for (const file of await files(path.join(root, 'packages/cli/test'))) {
  const result = spawnSync(process.execPath, [file], { cwd: root, stdio: 'inherit' });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
