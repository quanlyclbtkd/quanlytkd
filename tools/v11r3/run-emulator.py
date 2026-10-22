"""Local-only, demo-only REST integration test. No Firebase CLI/login/deploy."""
import argparse,hashlib,json,os,socket,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--java',required=True);p.add_argument('--jar',required=True);a=p.parse_args();root=Path.cwd();out=root/'handoff/V11R3/evidence'
assert hashlib.sha256(Path(a.jar).read_bytes()).hexdigest()=='c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e'
port=8181;log=(out/'java-emulator.log').open('w');proc=subprocess.Popen([a.java,'-jar',a.jar,'--host','127.0.0.1','--port',str(port),'--rules',str(root/'firestore.rules'),'--project_id','demo-v11r3-export'],stdout=log,stderr=subprocess.STDOUT)
code=1
try:
 deadline=time.monotonic()+30
 while True:
  try:
   with socket.create_connection(('127.0.0.1',port),.2):break
  except OSError:
   if proc.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Local Emulator did not start')
   time.sleep(.1)
 env={**os.environ,'FIRESTORE_EMULATOR_HOST':f'127.0.0.1:{port}','GCLOUD_PROJECT':'demo-v11r3-export','NODE_OPTIONS':f'--require {root}/tools/v11r1/localhost-only.cjs'}
 with (out/'server-export-emulator.log').open('w') as target:code=subprocess.run(['node','tools/v11r3/server-emulator.test.mjs'],env=env,stdout=target,stderr=subprocess.STDOUT,timeout=60).returncode
finally:
 proc.terminate()
 try:proc.wait(timeout=8)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 log.close()
 (out/'local-emulator-command.json').write_text(json.dumps({'command':['node','tools/v11r3/server-emulator.test.mjs'],'expectedExit':0,'actualExit':code,'rulesSHA256':hashlib.sha256((root/'firestore.rules').read_bytes()).hexdigest(),'network':'127.0.0.1 only','productionWrites':0},indent=2))
raise SystemExit(code)
