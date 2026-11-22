from pathlib import Path
import concurrent.futures, subprocess, json

root=Path.cwd()
dest=root/'evidence/AUTH_STARTUP_R1B/offline-regressions'
dest.mkdir(exist_ok=True,parents=True)
scripts=[
 'precheck','check:syntax','check:production-authority-closure','check:production-security-trust-boundary',
 'check:security-coach-branch-boundary','check:coach-branch-runtime-repair','check:attendance-canonical-ownership',
 'check:attendance-explicit-shift-authority','check:attendance-daily-single-refresh-authority',
 'check:d1c3b7r2r2-attendance-role-authority','check:mobile-startup-performance','check:auth-context-single-writer',
 'check:superadmin-auth-principal-alignment','check:admin-credential-single-source','check:listener-ownership-boundary',
 'check:club-bootstrap-single-read-authority','check:club-initial-snapshot-access-gate',
 'check:club-listener-bootstrap-readiness','check:startup-read-budget-freeze','check:finance-students-bstats-ownership-r1',
 'check:canonical-transaction-safe-cutover','check:tuition-debt-source-of-truth','check:debt-authoritative-tuition-coverage',
 'check:debt-profile-read-boundary','check:inventory-stock-authority-r1','check:inventory-ledger-reconciliation',
 'check:family-combo-autofill-r1','check:family-combo-qr-r1','check:reachable-dom-trust-boundary-r1-4b','check:root-public-parity'
]
def run(name):
 log=name.replace(':','_')+'.log'
 try:
  p=subprocess.run(['npm','run',name],cwd=root,capture_output=True,text=True,timeout=90)
  (dest/log).write_text(p.stdout+'\n'+p.stderr)
  return {'gate':name,'status':'PASS' if p.returncode==0 else 'FAIL','exitCode':p.returncode,'log':log}
 except subprocess.TimeoutExpired:
  return {'gate':name,'status':'BLOCKED_TIMEOUT','exitCode':None,'log':None}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
 results=list(executor.map(run,scripts))
report={'scope':'OFFLINE_PROTECTED_REGRESSIONS_ONLY','realAuthAcceptanceRuns':0,'realStartupTraces':0,'total':len(results),'passed':sum(r['status']=='PASS' for r in results),'results':results}
(dest/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))
if report['passed']!=report['total']:raise SystemExit(1)
