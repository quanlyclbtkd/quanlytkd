"""Local demo-only runner. Starts the already downloaded Java Emulator directly.
No Firebase CLI, deployment, credential lookup, or public project endpoint call.
Node subprocesses inherit a localhost-only connection guard.
"""
import os,subprocess,time,socket,json,hashlib,sys
from pathlib import Path
root=Path.cwd();out=root/'handoff/V11R1/evidence/local-emulator';out.mkdir(parents=True,exist_ok=True)
java=Path('/workspace/scratch/c58d1920a017/qa/jre21/bin/java')
jar=Path('/root/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar')
assert hashlib.sha256(jar.read_bytes()).hexdigest()=='c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e'
port=8180
child_env={**os.environ,'FIRESTORE_EMULATOR_HOST':f'127.0.0.1:{port}','GCLOUD_PROJECT':'demo-b7-coach-proof','NODE_OPTIONS':f'--require {root}/tools/v11r1/localhost-only.cjs','PLAYWRIGHT_CHROMIUM_EXECUTABLE':'/workspace/scratch/c58d1920a017/qa/chromium/chrome-linux/headless_shell','V11_OUTPUT':str(root/'handoff/V11R1/evidence/emulator'),'V11_BROWSER_OUTPUT':'/workspace/scratch/8ad89e6da6fe/v11r1/private-browser','V11_COST_OUTPUT':str(root/'handoff/V11R1/evidence/cas-cost'),'D1C3B7_COST_EVIDENCE_OUTPUT':str(root/'handoff/V11R1/evidence/initial-read-measurement.json')}
commands=[
 ('principals',['node','tools/check-d1c3b7-rules-principals.mjs'],60),
 ('v11-rules-cas',['node','tools/v11/emulator.mjs'],120),
 ('broad-rules',['node','tools/firestore-rules-6v4b.test.mjs'],120),
 ('initial-reads',['node','tools/check-d1c3b7r1-read-cost-emulator.mjs'],120),
 ('v11-cas-reads',['node','tools/v11/read-cost.mjs'],90),
 ('cutover',['node','tools/v11/cutover.mjs'],90),
 ('browser',['node','tools/v11/browser.mjs'],180),
 ('cas-idb',['node','tools/v11r1/cas-idb.mjs'],180),
 ('read-matrix',['node','tools/v11r1/read-matrix.mjs'],120),
]
if len(sys.argv)>1:
 commands=[row for row in commands if row[0] in sys.argv[1:]]
 if 'history' in sys.argv[1:]:commands.append(('history',['node','tools/v11r1/history-matrix.mjs'],60))
 out=out/('-'.join(sys.argv[1:]));out.mkdir(parents=True,exist_ok=True)
rows=[];log=(out/'java.log').open('w')
cmd=[str(java),'-jar',str(jar),'--host','127.0.0.1','--port',str(port),'--rules',str(root/'firestore.rules'),'--project_id','demo-b7-coach-proof']
p=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT)
try:
 deadline=time.monotonic()+25
 while True:
  try:
   with socket.create_connection(('127.0.0.1',port),.2):break
  except OSError:
   if p.poll() is not None or time.monotonic()>deadline:raise RuntimeError('local Emulator not ready')
   time.sleep(.1)
 for name,command,timeout in commands:
  start=time.monotonic()
  with (out/(name+'.log')).open('w') as target:
   try:r=subprocess.run(command,env=child_env,stdout=target,stderr=subprocess.STDOUT,timeout=timeout);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  rows.append({'name':name,'command':' '.join(command),'sourceSHA':hashlib.sha256((root/'js/data/attendanceJournal.js').read_bytes()).hexdigest(),'rulesSHA':hashlib.sha256((root/'firestore.rules').read_bytes()).hexdigest(),'exit':code,'status':'PASS' if code==0 else 'FAIL','seconds':round(time.monotonic()-start,2),'log':name+'.log'})
  print(json.dumps(rows[-1]),flush=True)
  if code!=0:break
finally:
 p.terminate()
 try:p.wait(timeout=8)
 except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
 (out/'results.json').write_text(json.dumps({'runnerCommand':sys.argv,'javaCommand':cmd,'onlyLoopback':True,'firebaseCLI':False,'productionWrites':0,'tests':rows,'notRun':[x[0] for x in commands[len(rows):]]},indent=2))
raise SystemExit(0 if len(rows)==len(commands) and all(r['exit']==0 for r in rows) else 1)
