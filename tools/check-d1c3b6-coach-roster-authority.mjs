#!/usr/bin/env node
// Blocking actual-handler plus exact query/classifier coverage proof.
// Both cases MUST pass to declare Coach roster complete; detection is not closure.
import {spawnSync} from 'node:child_process';
const calls=[
  {name:'E02 fallback/realtime authority',command:'node',args:['tools/check-d1c3b6-actual-handlers.mjs'],env:{D1C3B6_SCOPE:'roster'}},
  {name:'E01 indexed/legacy roster completeness',command:'node',args:['tools/check-d1c3b5-coach-legacy-coverage.mjs'],env:{D1C3B5_REQUIRE_E01_COMPLETE:'1'}}
];
let failed=0;
for(const c of calls){const result=spawnSync(c.command,c.args,{encoding:'utf8',env:{...process.env,...c.env}});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 const status=result.status===null?`NOT COMPLETED ${result.error?.message||'signal'}`:`exit=${result.status}`;
 console.log(`[B6 ${c.name}] ${status}`);if(result.status!==0)failed++;
}
console.log(failed?`BLOCKED: ${failed} Coach roster authority case(s) not closed`:'PASS Coach roster actual handlers');
if(failed)process.exitCode=1;
