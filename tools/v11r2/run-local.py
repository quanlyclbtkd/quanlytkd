"""Reproducible local-only suites; no Firebase CLI or deployment. All paths are inputs."""
from pathlib import Path
import os,subprocess,socket,time,json,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('--java',required=True);p.add_argument('--jar',required=True);p.add_argument('--browser',required=True);p.add_argument('--legacy10',required=True);p.add_argument('--cdn10',required=True);p.add_argument('--active',required=True);p.add_argument('--only',nargs='*');a=p.parse_args()
root=Path.cwd();active=Path(a.active).resolve();out=root/'handoff/V11R2/evidence/local-emulator';out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(Path(a.jar).read_bytes()).hexdigest()=='c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e'
port=8180;env={**os.environ,'FIRESTORE_EMULATOR_HOST':f'127.0.0.1:{port}','GCLOUD_PROJECT':'demo-b7-coach-proof','NODE_OPTIONS':f'--require {root}/tools/v11r1/localhost-only.cjs','PLAYWRIGHT_CHROMIUM_EXECUTABLE':a.browser,'V10_SOURCE_ROOT':a.legacy10,'CDN10_CACHE':a.cdn10,'V11R2_COMPAT_OUTPUT':str(root/'handoff/V11R2/evidence')}
commands=[
 ('maintenance-rules',root,['node','tools/v11r2/maintenance-emulator.mjs'],{}),
 ('maintenance-sdk12-v10',root,['node','tools/v11r2/client-compat-browser.mjs'],{'BROWSER_SDK_MODE':'sdk12'}),
 ('maintenance-cdn10-v10',root,['node','tools/v11r2/client-compat-browser.mjs'],{'BROWSER_SDK_MODE':'cdn10'}),
 ('active-rules-cas',active,['node','tools/v11/emulator.mjs'],{'V11_OUTPUT':str(root/'handoff/V11R2/evidence/active-emulator')}),
 ('active-history-audit',active,['node','tools/v11r1/history-matrix.mjs'],{}),
 ('active-principals',active,['node','tools/check-d1c3b7-rules-principals.mjs'],{}),
 ('active-broad-rules',active,['node','tools/firestore-rules-6v4b.test.mjs'],{}),
 ('active-original-reads',active,['node','tools/check-d1c3b7r1-read-cost-emulator.mjs'],{'D1C3B7_COST_EVIDENCE_OUTPUT':str(root/'handoff/V11R2/evidence/active-roster-measurement.json')}),
 ('active-reads-matrix',active,['node','tools/v11r1/read-matrix.mjs'],{}),
 ('active-cas-idb',active,['node','tools/v11r1/cas-idb.mjs'],{}),
 ('active-spa-browser',active,['node','tools/v11/browser.mjs'],{'V11_BROWSER_OUTPUT':str(root.parent.parent/'private-browser-r2')}),
 ('active-sdk12-v10',active,['node','tools/v11r2/client-compat-browser.mjs'],{'BROWSER_SDK_MODE':'sdk12'}),
 ('active-cdn10-v10',active,['node','tools/v11r2/client-compat-browser.mjs'],{'BROWSER_SDK_MODE':'cdn10'}),
 ('B7-local',active,['node','tools/check-d1c3b7-security-release.mjs'],{'D1C3B7_COST_APPROVAL_FILE':str(root/'handoff/V11R2/EXISTING_ROSTER_SCOPE_CARRIED_FORWARD.json'),'V11_OUTPUT':str(root/'handoff/V11R2/evidence/B7-emulator'),'V11_BROWSER_OUTPUT':str(root.parent.parent/'private-B7-r2')}),
 ('B6-local',active,['node','tools/check-d1c3b6-release-blockers.mjs'],{'D1C3B7_COST_APPROVAL_FILE':str(root/'handoff/V11R2/EXISTING_ROSTER_SCOPE_CARRIED_FORWARD.json'),'V11_OUTPUT':str(root/'handoff/V11R2/evidence/B6-emulator'),'V11_BROWSER_OUTPUT':str(root.parent.parent/'private-B6-r2')}),
]
if a.only:commands=[r for r in commands if r[0] in a.only]
rows=[];log=(out/('java-'+('-'.join(a.only) if a.only else 'all')+'.log')).open('w');java=subprocess.Popen([a.java,'-jar',a.jar,'--host','127.0.0.1','--port',str(port),'--rules',str(root/'firestore.rules'),'--project_id','demo-b7-coach-proof'],stdout=log,stderr=subprocess.STDOUT)
try:
 deadline=time.monotonic()+30
 while True:
  try:
   with socket.create_connection(('127.0.0.1',port),.2):break
  except OSError:
   if java.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Emulator not ready')
   time.sleep(.1)
 for name,cwd,cmd,extra in commands:
  started=time.monotonic()
  with (out/(name+'.log')).open('w') as target:
   try:r=subprocess.run(cmd,cwd=cwd,env={**env,**extra},stdout=target,stderr=subprocess.STDOUT,timeout=200);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  row={'name':name,'profile':'maintenance' if cwd==root else 'DEMO_ACTIVE_NOT_RELEASE','command':' '.join(cmd),'sourceRoot':str(cwd),'rulesSHA256':hashlib.sha256((cwd/'firestore.rules').read_bytes()).hexdigest(),'contractSHA256':hashlib.sha256((cwd/'js/core/attendanceContract.js').read_bytes()).hexdigest(),'exit':code,'status':'PASS' if code==0 else 'FAIL','seconds':round(time.monotonic()-started,2),'log':name+'.log'};rows.append(row);print(json.dumps(row),flush=True)
  if code!=0:break
finally:
 java.terminate()
 try:java.wait(timeout=8)
 except subprocess.TimeoutExpired:java.kill();java.wait()
 log.close();(out/('results-'+('-'.join(a.only) if a.only else 'all')+'.json')).write_text(json.dumps({'command':vars(a),'network':'Node/Chromium loopback boundary, direct local Java','tests':rows,'notRun':[r[0] for r in commands[len(rows):]],'productionWrites':0},indent=2))
raise SystemExit(0 if len(rows)==len(commands) and all(r['exit']==0 for r in rows) else 1)
