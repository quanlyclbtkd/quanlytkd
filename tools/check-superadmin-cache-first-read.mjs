import fs from 'node:fs'; const s=fs.readFileSync('js/modules/superadmin.js','utf8'); let p=0,f=0; const c=(n,x)=>{(x?(p++,console.log('✅',n)):(f++,console.error('❌',n)))};
c('provable current-month root cache helper exists', s.includes('_readProvableCurrentMonthRootCache'));
c('stats read is guarded by incomplete root cache and explicit coverage rejection', /if \(!_rootMonthCache\.complete && !_rootMonthCache\.financeRejected\)\s*\{[\s\S]{0,500}getDoc\(doc\(db, 'clubs', cid, 'stats'/.test(s));
c('keyed monthly caches are checked', s.includes('cachedMonthlyRevenue')&&s.includes('revenueByMonth'));
c('generic current-month revenue requires month marker', /marker !== monthKey\) return null/.test(s));
c('unknown revenue remains null/-- semantics', /return null;/.test(s)&&/_fmtRevenueShort[\s\S]*return '--'/.test(s));
c('source cache completeness does not coerce null to zero', /student !== null && Number\.isFinite\(student\)/.test(s) && /revenue !== null && Number\.isFinite\(revenue\)/.test(s));
c('presentation count formatter preserves unknown as --', /function _saFmtOptionalCount[\s\S]{0,180}value === null[\s\S]{0,120}return '--'/.test(s));
c('aggregate student count does not coerce unknown to zero', /studentCountForSummary !== null[\s\S]{0,400}studentKnownClubCount\+\+/.test(s));
c('hasRevenueSource does not coerce null to zero', /hasRevenueSource = revenueTotal !== null && Number\.isFinite\(revenueTotal\)/.test(s));
function finite(...v){for(const x of v){if(x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)))return Number(x)}return null}
function keyed(src,m,d){if(!src||typeof src!=='object')return null; const v=src[m]!==undefined?src[m]:src[d]; return finite(v)}
function root(data,m){const d=m.replace('-','_'), sa=data.superAdminStats||{}, cov=data.cacheCoverage||null; const rejected=!!cov&&String(cov.month||'').replace('_','-').slice(0,7)===m&&cov.financeComplete!==true; const student=finite(sa.activeCount,sa.profileCount,data.cachedActiveCount,data.cachedStudentCount,data.cachedProfileCount,data.profileCount,data.totalStudents); const k=finite(keyed(data.cachedMonthlyRevenue,m,d),keyed(data.revenueByMonth,m,d)); const marker=String(sa.month||'').replace('_','-').slice(0,7); const rev=rejected?null:(k!==null?k:(marker===m?finite(sa.revenueTotal,data.cachedCurrentMonthRevenue,data.currentMonthRevenue):null)); return {student,revenue:rev,financeRejected:rejected,complete:student!==null&&rev!==null};}
const m='2026-08';
let clubs=[{cachedActiveCount:10,cachedMonthlyRevenue:{'2026-08':100}},{cachedActiveCount:20,revenueByMonth:{'2026_08':200}},{superAdminStats:{month:'2026-08',activeCount:30,revenueTotal:300}}];
c('CASE A: all complete => stats reads 0', clubs.filter(x=>!root(x,m).complete).length===0);
clubs=[clubs[0],clubs[1],{cachedActiveCount:30}]; c('CASE B: one incomplete => stats reads 1', clubs.filter(x=>!root(x,m).complete).length===1);
c('CASE C: stale month => fallback read 1', root({cachedActiveCount:3,superAdminStats:{month:'2026-07',revenueTotal:9},cachedCurrentMonthRevenue:9},m).complete===false);
c('CASE D: missing revenue is not fabricated as zero', root({cachedActiveCount:3},m).revenue===null);
c('CASE E: keyed cache preserves equivalent numeric value', root({cachedActiveCount:3,cachedMonthlyRevenue:{'2026-08':12345}},m).revenue===12345);
c('CASE F: empty root cache is incomplete, not zero-complete', root({},m).complete===false);
c('CASE G: incomplete coverage rejects preserved legacy revenue as unknown', root({cachedActiveCount:3,cachedCurrentMonthRevenue:999,superAdminStats:{month:m,revenueTotal:999},cacheCoverage:{month:m,financeComplete:false}},m).revenue===null);
c('presentation summary helper is Firestore-free', s.includes('_renderSuperAdminSummaryFromLoadedData') && !/function _renderSuperAdminSummaryFromLoadedData[\s\S]{0,8000}\bgetDoc[s]?\s*\(/.test(s));
console.log(`PASS ${p}/${p+f}`); if(f) process.exit(1);
