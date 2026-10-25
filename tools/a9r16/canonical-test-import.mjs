// QA metadata only: fixtures must attach to the dependency actually used by the
// production importer. Never construct an obsolete second cache identity.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {parse} from '../v11r2/vendor/acorn.mjs';
export function canonicalDependency(importerPath, exportedName){
 const file=path.resolve(importerPath),ast=parse(fs.readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'});
 const imports=ast.body.filter(n=>n.type==='ImportDeclaration'&&n.specifiers.some(s=>s.imported?.name===exportedName));
 assert.equal(imports.length,1,'One canonical dependency for '+exportedName);
 return new URL(imports[0].source.value,pathToFileURL(file)).href;
}
