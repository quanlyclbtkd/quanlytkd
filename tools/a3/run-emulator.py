"""Execute maintenance and DEMO active tests; never initialize a live project."""
from pathlib import Path
import argparse, hashlib, json, os, socket, subprocess, time
p=argparse.ArgumentParser();p.add_argument('--java',required=True);p.add_argument('--jar',required=True);p.add_argument('--browser',required=True);p.add_argument('--active',required=True);p.add_argument('--pythonpath',required=True);p.add_argument('--fresh-gates',action='store_true');a=p.parse_args()
root=Path.cwd();active=Path(a.active).resolve();out=root/'handoff/A3/evidence/profile-emulator';out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(Path(a.jar).read_bytes()).hexdigest()=='c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e'
assert json.loads((active/'CUTOVER_PROOF.json').read_text())['status']=='DEMO_VERIFIED_NOT_RELEASE'
port=8193;host=f'127.0.0.1:{port}'
env={**os.environ,'FIRESTORE_EMULATOR_HOST':host,'A3_COACH_EMULATOR_HOST':host,'GCLOUD_PROJECT':'demo-a3-profiles','NODE_OPTIONS':'--require '+str(root/'tools/v11r1/localhost-only.cjs'),'PLAYWRIGHT_CHROMIUM_EXECUTABLE':a.browser,'PYTHONPATH':a.pythonpath}
commands=[
 ('maintenance-broad-rules',root,['node','tools/firestore-rules-6v4b.test.mjs'],{}),
 ('remaining-independent-gates',root,['node','tools/a3/regression.mjs']+([] if a.fresh_gates else ['--retry']),{}),
 ('active-broad-rules',active,['node','tools/firestore-rules-6v4b.test.mjs'],{}),
 ('active-coach-join-v3',active,['node','tools/check-v10-coach-join.mjs'],{'V10_OUTPUT':str(out/'active-coach-join'),'V11_BROWSER_OUTPUT':str(Path(a.jar).parent/'private-coach-browser')})]
log=(out/'server.log').open('w');server=subprocess.Popen([a.java,'-jar',a.jar,'--host','127.0.0.1','--port',str(port),'--rules',str(root/'firestore.rules'),'--project_id','demo-a3-profiles'],stdout=log,stderr=subprocess.STDOUT);rows=[]
try:
 deadline=time.monotonic()+30
 while True:
  try:
   with socket.create_connection(('127.0.0.1',port),.2):break
  except OSError:
   if server.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Local Emulator failed to start')
   time.sleep(.1)
 for name,cwd,cmd,extra in commands:
  begin=time.monotonic()
  with (out/(name+'.log')).open('w') as target:
   try:code=subprocess.run(cmd,cwd=cwd,env={**env,**extra},stdout=target,stderr=subprocess.STDOUT,timeout=420).returncode
   except subprocess.TimeoutExpired:code=124
  row={'name':name,'command':cmd,'cwd':str(cwd),'actualExit':code,'status':'PASS' if code==0 else 'FAIL','seconds':round(time.monotonic()-begin,2),'rulesSHA256':hashlib.sha256((cwd/'firestore.rules').read_bytes()).hexdigest()};rows.append(row)
  print(json.dumps(row),flush=True);(out/'SUMMARY.json').write_text(json.dumps({'results':rows,'scope':'LOCAL_DEMO_ONLY_NOT_STAGING_OR_DEVICE_ACCEPTANCE','productionWrites':0},indent=2))
finally:
 server.terminate()
 try:server.wait(timeout=8)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 log.close()
raise SystemExit(0 if len(rows)==len(commands) and all(r['actualExit']==0 for r in rows) else 1)
