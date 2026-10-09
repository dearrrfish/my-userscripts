import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath,['--test','--test-name-pattern','strict URLs|log failure|path and symlink|source is never executed','packages/cli/test/cli.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status ?? 1;
