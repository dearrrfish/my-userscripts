import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) { throw new Error('invalid-shape'); } }
export function relative(value) { if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || path.posix.normalize(value) !== value || value.startsWith('/') || value.split('/').some(p => p === '..' || p === '.') || !/^[a-zA-Z0-9._/-]+$/.test(value)) { throw new Error('unsafe-path'); } return value; }
export async function safe(root, value) { relative(value); const base = await fs.realpath(root); let current = base; for (const part of value.split('/')) { current = path.join(current, part); try { const st = await fs.lstat(current); if (st.isSymbolicLink()) { throw new Error('symlink'); } } catch (error) { if (error.code !== 'ENOENT') { throw error; } } } return current; }
export async function read(root, value) { const file = await safe(root, value); const st = await fs.lstat(file); if (!st.isFile() || st.size > 5_000_000) { throw new Error('invalid-file'); } return fs.readFile(file); }
export async function write(root, value, data) { const file = await safe(root, value); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); }
export function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) { throw new Error('invalid-id'); } return value; }
export function digest(value) { if (!/^[a-f0-9]{64}$/.test(value)) { throw new Error('invalid-hash'); } return value; }
