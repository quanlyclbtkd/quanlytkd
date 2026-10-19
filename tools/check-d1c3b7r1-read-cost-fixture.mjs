#!/usr/bin/env node
// Deterministic IN-MEMORY scenario model; not Firebase emulator/billed telemetry.
import assert from 'node:assert/strict';
const scenarios={
  1000:{CS1:{active:200,trial:50,legacy:175,quit:75},'Mặc định':{active:75,trial:25,legacy:75,quit:75},CS2:{active:80,trial:20,legacy:50,quit:50},missingBranch:50},
  1500:{CS1:{active:300,trial:75,legacy:262,quit:113},'Mặc định':{active:112,trial:38,legacy:112,quit:113},CS2:{active:120,trial:30,legacy:75,quit:75},missingBranch:75}
};
for(const [size,scenario] of Object.entries(scenarios)){
 let oldTotal=0,newTotal=0;
 for(const [slot,v] of Object.entries(scenario)){
  if(slot==='missingBranch')continue;
  const old=v.active+v.trial,newCount=Object.values(v).reduce((a,b)=>a+b,0);
  const added=newCount-old;oldTotal+=old;newTotal+=newCount;
  console.log('IN_MEMORY_FIXTURE',JSON.stringify({population:Number(size),slot,oldStatusAndBranchDocs:old,newBranchOnlyDocs:newCount,incrementalInitialResultDocs:added,incrementPercent:old?Math.round(10000*added/old)/100:null,legacyStatusDocs:v.legacy,quitDocs:v.quit}));
 }
 assert.equal(newTotal+scenario.missingBranch,Number(size));
 console.log('IN_MEMORY_FIXTURE_TOTAL',JSON.stringify({population:Number(size),oldResultDocs:oldTotal,newResultDocs:newTotal,incrementalInitialDocs:newTotal-oldTotal,incrementPercent:Math.round(10000*(newTotal-oldTotal)/oldTotal)/100,missingBranchNotReadable:scenario.missingBranch,extremeAllQuitOld:0,extremeAllQuitNew:newTotal}));
}
