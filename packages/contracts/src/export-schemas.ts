import { writeFile, mkdir } from 'node:fs/promises';
import { schemas } from './schemas.js';
await mkdir(new URL('../schemas/', import.meta.url), { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  await writeFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), `${JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...schema }, null, 2)}\n`);
}
