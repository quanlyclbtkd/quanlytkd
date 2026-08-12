import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8'); let p=0,f=0; const c=(n,x)=>{(x?(p++,console.log('✅',n)):(f++,console.error('❌',n)))};
const startup=app.slice(app.indexOf('Phase 4K-6V5U6A: Admin notifications'), app.indexOf('//  SUPER ADMIN:', app.indexOf('Phase 4K-6V5U6A: Admin notifications')));
const notif=app.slice(app.indexOf('Phase 4K-6V5U6A — notification read authority convergence'), app.indexOf('// Admin bấm "Đã xem"'));
c('setupNotifListener remains canonical startup owner', /setupNotifListener\(\)/.test(startup));
c('normal startup does not call one-shot notification GET', !/(^|\n)\s*(?:window\.)?checkAdminNotifications\s*\(/m.test(startup));
c('fallback requires explicit fallback flag', /options\.fallback !== true/.test(notif));
c('fallback is single-flight', /_notifFallbackPromise/.test(notif) && /_notifFallbackUsedKey/.test(notif));
c('fallback once-key is scoped to verified auth generation', /__verifiedAuthContextState\?\.generation/.test(notif) && /_notifAuthUid/.test(notif));
c('listener success marks first snapshot before rendering', /_recordNotifSnapshot\(snap\)/.test(notif));
c('listener error only falls back before first snapshot', /if \(!_notifInitialSnapshotSeen\) _runNotifFallbackOnce/.test(notif));
c('registration failure has targeted fallback', /listener-registration-failed/.test(notif));
c('no polling/retry interval added in notification block', !/setInterval\s*\(/.test(notif));
c('notification UI renderer remains same owner', /_renderNotifBanner\(docs\)/.test(notif));
c('fallback GET remains bounded', /limit\(50\)/.test(notif));
c('no Coach notification read added', /window\.userRole !== 'admin' && window\.userRole !== 'super_admin'/.test(notif));
function simulate(events){let first=false,used=false,gets=0; for(const e of events){if(e==='snapshot') first=true; if((e==='error'||e==='registration-failed')&&!first&&!used){used=true;gets++;}} return gets;}
c('simulation: healthy first snapshot => fallback GET 0', simulate(['snapshot','error'])===0);
c('simulation: pre-first error => fallback GET 1', simulate(['error','error'])===1);
c('simulation: registration failure => fallback GET max 1', simulate(['registration-failed','registration-failed'])===1);
function simulateAuthGenerations(generations){let used='';let gets=0;for(const g of generations){const key=`uid:club:${g}`;if(key!==used){used=key;gets++;}}return gets;}
c('simulation: duplicate setup same login keeps one fallback', simulateAuthGenerations([7,7,7])===1);
c('simulation: logout/login generation permits one fresh fallback', simulateAuthGenerations([7,7,9,9])===2);
console.log(`PASS ${p}/${p+f}`); if(f) process.exit(1);
