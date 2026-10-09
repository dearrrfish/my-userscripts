import {spawn} from 'node:child_process';
import path from 'node:path';
const child=spawn(process.execPath,['--test',path.resolve(import.meta.dirname,'../packages/cli/test/portable/portable.test.mjs')],{stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code ?? 1;});
