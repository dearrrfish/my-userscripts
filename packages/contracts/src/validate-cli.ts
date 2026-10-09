import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateContract, validateRuleSet } from './index.js';
async function files(dir: string): Promise<string[]> { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir, e.name)) : Promise.resolve(e.name.endsWith('.json') ? [join(dir, e.name)] : [])))).flat().sort(); }
try {
  const args = process.argv.slice(2); let profiles: string | undefined; let rules: string | undefined;
  for (let i = 0; i < args.length; i += 2) { const value = args[i + 1]; if (!value || !['--profiles','--rules'].includes(args[i])) { throw new Error('usage: validate --profiles <directory> --rules <directory>'); } if (args[i] === '--profiles') { profiles = value; } else { rules = value; } }
  if (!profiles || !rules) { throw new Error('both --profiles and --rules are required'); }
  // pnpm executes scripts in the package directory; CLI paths are repository-relative.
  const root = resolve(import.meta.dirname, '../../..');
  const profileFiles = await files(resolve(root, profiles)); const ruleFiles = await files(resolve(root, rules));
  if (!profileFiles.length) { throw new Error('no profiles found'); }
  const read = async (p: string): Promise<unknown> => JSON.parse(await readFile(p, 'utf8'));
  const parsed = await Promise.all(profileFiles.map(async p => validateContract('TargetProfile', await read(p))));
  if (new Set(parsed.map(p => p.id)).size !== parsed.length) { throw new Error('duplicate profile IDs'); }
  const validated = validateRuleSet(await Promise.all(ruleFiles.map(read)), parsed.map(p => p.id));
  console.log(JSON.stringify({ valid: true, profiles: parsed.length, rules: validated.length }));
} catch (error) { console.error(JSON.stringify({ valid: false, error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
