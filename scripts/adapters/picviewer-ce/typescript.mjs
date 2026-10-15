import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../packages/converter/dist/index.js',import.meta.url));
export default require('typescript');
