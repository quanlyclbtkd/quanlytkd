"""Run each distinct non-aggregate gate. Security/Emulator suites run separately."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,json,time,os
SRC=Path.cwd();OUT=Path(os.environ.get('V10_AUDIT_OUTPUT','../../evidence/all-gates')).resolve();OUT.mkdir(parents=True,exist_ok=True)
scripts=json.loads((SRC/'package.json').read_text())['scripts']
skip={'check:verbose','check:rules:emulator','check:d1c3b7-release-security','check:d1c3b6-release-blockers','check:v10-coach-join','check:v10-release-risk-boundary'}
commands={}
for k,v in scripts.items():
 if k.startswith('check:') and k not in skip and not v.startswith('npm '):commands.setdefault(v,[]).append(k)
def run(row):
 command,names=row;start=time.monotonic();log=OUT/(names[0].replace(':','_')+'.log')
 with log.open('w') as f:
  try:r=subprocess.run(['/bin/bash','-c',command],cwd=SRC,stdout=f,stderr=subprocess.STDOUT,timeout=120);code=r.returncode
  except subprocess.TimeoutExpired:code=124
 return {'command':command,'aliases':names,'exit':code,'seconds':round(time.monotonic()-start,2),'log':log.name}
with ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(run,commands.items()))
(OUT/'results.json').write_text(json.dumps(rows,indent=2))
summary={'unique_commands':len(rows),'exposed_script_names':sum(len(r['aliases']) for r in rows),'pass':sum(r['exit']==0 for r in rows),'fail':sum(r['exit']!=0 for r in rows),'failures':[r for r in rows if r['exit']]}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
raise SystemExit(1 if summary['fail'] else 0)
