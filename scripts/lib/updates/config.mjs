import {exact,relative,id,read} from './guards.mjs';
import {providerConfig} from './provider.mjs';
export async function loadUpdatesConfig(workspace,file) {
  const c=JSON.parse(await read(workspace,file)); exact(c,['schemaVersion','reviewRoot','projectIds','provider']); if(c.schemaVersion!==1||!Array.isArray(c.projectIds)||!c.projectIds.length||new Set(c.projectIds).size!==c.projectIds.length) { throw new Error('updates-config'); } c.projectIds.forEach(id); relative(c.reviewRoot); if(!c.reviewRoot.startsWith('updates/')||c.reviewRoot.split('/').length<2) { throw new Error('review-root'); } return {...c,provider:providerConfig(c.provider)};
}
