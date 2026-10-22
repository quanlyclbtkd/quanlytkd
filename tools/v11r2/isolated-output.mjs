// Filesystem-only guard shared by DEMO preparation and activation.
// Never deletes a pre-existing or replaced output directory.
import fs from 'node:fs';
import path from 'node:path';
const blocked=code=>{throw Object.assign(Error(code),{code})};
const lstat=file=>{try{return fs.lstatSync(file)}catch(error){if(error.code==='ENOENT')return null;throw error}};
const newClaims=new WeakSet();
function resolvedTarget(file,code) {
 const missing=[];let current=path.resolve(file);
 while(!lstat(current)){missing.unshift(path.basename(current));current=path.dirname(current)}
 try{return path.join(fs.realpathSync(current),...missing)}catch{blocked(code)}
}
export function isolatedOutputPaths(sourceRoot,directory,{requireNew=false}={}) {
 const code=requireNew?'ISOLATED_NEW_OUTPUT_REQUIRED':'ISOLATED_OUTPUT_REQUIRED';
 const source=fs.realpathSync(sourceRoot),requested=path.resolve(directory),stat=lstat(requested);
 if(stat?.isSymbolicLink()||(requireNew&&stat))blocked(code);
 const output=resolvedTarget(requested,code);
 if(output===source||output.startsWith(source+path.sep)||source.startsWith(output+path.sep))blocked(code);
 if(requireNew&&!fs.existsSync(path.dirname(output)))blocked('OUTPUT_PARENT_REQUIRED');
 // All writes use this canonical path, never the caller's symlink alias.
 const parent=path.dirname(output),parentStat=lstat(parent);
 return Object.freeze({source,output,parent:parentStat&&Object.freeze({path:parent,dev:parentStat.dev,ino:parentStat.ino})});
}
export function claimNewOutput(paths) {
 if(paths.parent){const stat=lstat(paths.parent.path);if(!stat||stat.isSymbolicLink()||!stat.isDirectory()||stat.dev!==paths.parent.dev||stat.ino!==paths.parent.ino)blocked('OUTPUT_OWNERSHIP_CHANGED')}
 const checked=isolatedOutputPaths(paths.source,paths.output,{requireNew:true});
 fs.mkdirSync(checked.output,{mode:0o700}); // Exclusive: EEXIST never authorizes cleanup.
 const stat=fs.lstatSync(checked.output);
 const claim=Object.freeze({...checked,dev:stat.dev,ino:stat.ino});newClaims.add(claim);return claim;
}
export function assertNewOutputClaim(claim) {
 if(!newClaims.has(claim))blocked('NEW_OUTPUT_CLAIM_REQUIRED');
 return assertOwnedOutput(claim);
}
export function assertOwnedOutput(claim) {
 const stat=lstat(claim.output);
 if(!stat||stat.isSymbolicLink()||!stat.isDirectory()||stat.dev!==claim.dev||stat.ino!==claim.ino)blocked('OUTPUT_OWNERSHIP_CHANGED');
 const checked=isolatedOutputPaths(claim.source,claim.output);
 if(checked.output!==claim.output)blocked('OUTPUT_OWNERSHIP_CHANGED');
 return true;
}
export function ownedFilePath(claim,file,{createParents=false}={}) {
 assertOwnedOutput(claim);
 if(typeof file!=='string'||path.isAbsolute(file)||file.split('/').some(x=>!x||x==='.'||x==='..')||file.includes('\\'))blocked('OUTPUT_FILE_OUTSIDE_SCOPE');
 let current=claim.output;
 for(const part of file.split('/').slice(0,-1)){
  current=path.join(current,part);let stat=lstat(current);
  if(!stat&&createParents){assertOwnedOutput(claim);fs.mkdirSync(current,{mode:0o700});stat=lstat(current)}
  if(!stat||stat.isSymbolicLink()||!stat.isDirectory())blocked('OUTPUT_OWNERSHIP_CHANGED');
 }
 assertOwnedOutput(claim);return path.join(claim.output,file);
}
export function writeNewOwnedFile(claim,file,content) {
 const target=ownedFilePath(claim,file,{createParents:true});
 fs.writeFileSync(target,content,{flag:'wx',mode:0o600});assertOwnedOutput(claim);
}
export function cleanupOwnedOutput(claim) {
 if(!claim)return false;
 try{assertOwnedOutput(claim)}catch{return false}
 fs.rmSync(claim.output,{recursive:true});return true;
}
