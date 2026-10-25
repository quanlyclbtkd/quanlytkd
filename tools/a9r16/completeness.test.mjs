import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder = process.env.A9R16_EVIDENCE_ROOT;
assert(folder,'A9R16_EVIDENCE_ROOT required');
const fixture=JSON.parse(fs.readFileSync(path.join(folder,'FIXTURE_PROOF.json')));
assert.equal(fixture.storedCounts.total,1500);
assert.equal(fixture.storedCounts.CS1,750);
assert.equal(fixture.storedCounts.CS2,750);
const {results}=JSON.parse(fs.readFileSync(path.join(folder,'RUNS.json')));
for (const mode of ['cold','warm']) {
 const rows=results.filter(r=>r.role==='coach'&&r.cacheMode===mode);
 assert(rows.length>=5,'Need at least 5 consecutive complete Coach runs per cache mode');
 for(const r of rows) {
  assert.equal(r.classification,'PASS');
  assert.equal(r.verifiedContext.clubId,'PERF_CLUB');
  assert.equal(r.profileMetrics.coachBranch,'CS1');
  assert.equal(r.browserDirect.fromCache,false);
  for(const k of ['nodeBranch','browserDirect','listener','canonicalStore','filteredRoster','renderedRows']) assert.equal(r.completeness[k],750,k);
 }
}
console.log('PASS: 1500 stored; 750 CS1; Node/browser/listener/store/filter/DOM =750; five consecutive cold and warm runs.');
