import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from './evidence-digest.js';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const runtimeSupportPaths = ['scripts/bundle.mjs', 'scripts/portable-runner.mjs', 'fixtures/portable/skill-forward.json'] as const;
export async function resolveRuntimeLayout(root: string): Promise<{runtimeRoot: string; skillRoot: string; mode: 'source' | 'portable'}> {
  const runtimeRoot = await fs.realpath(root);
  const parent = path.dirname(runtimeRoot);
  if (path.basename(runtimeRoot) === 'runtime') {
    try { if ((await fs.lstat(path.join(parent, 'SKILL.md'))).isFile()) { return {runtimeRoot, skillRoot: parent, mode: 'portable'}; } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
  }
  return {runtimeRoot, skillRoot: path.join(runtimeRoot, 'skills/fm-convert'), mode: 'source'};
}
export function hashSkillResources(files: Record<string, string>): string {
  const paths = Object.keys(files).sort();
  if (paths.length === 0) { return hash(''); }
  return hash(canonicalJson(paths.map(path => ({path, hash: hash(files[path])}))));
}
export async function skillResourceIdentity(skillRoot: string): Promise<{files: Record<string, string>; hash: string}> {
  const files: Record<string, string> = {};
  try {
    if (await fs.realpath(skillRoot) !== path.resolve(skillRoot)) { throw new Error('Skill resource root must not be a symlink or alias'); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
  async function visit(relative: string): Promise<void> {
    const file = path.join(skillRoot, relative);
    let stat;
    try { stat = await fs.lstat(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return; } throw error; }
    if (stat.isSymbolicLink()) { throw new Error('Skill resources must not be symlinks'); }
    if (stat.isDirectory()) { for (const entry of (await fs.readdir(file)).sort()) { await visit(`${relative}/${entry}`); } }
    else if (stat.isFile()) {
      const content = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await fs.readFile(file));
      files[`skills/fm-convert/${relative}`] = content;
    } else { throw new Error('Skill resource must be a regular file'); }
  }
  for (const root of ['SKILL.md', 'references', 'agents', 'scripts', 'assets']) { await visit(root); }
  if (Object.keys(files).length && !files['skills/fm-convert/SKILL.md']) { throw new Error('Skill resources require SKILL.md'); }
  return {files, hash: hashSkillResources(files)};
}
