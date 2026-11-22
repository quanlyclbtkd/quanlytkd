from pathlib import Path
import hashlib, json, subprocess, sys, zipfile, re

source=Path.cwd()
evidence=source/'evidence/AUTH_STARTUP_R1B'
subprocess.run(['node','tools/auth-startup-r1b/check-source.mjs'],check=True)
subprocess.run(['node','tools/auth-startup-r1b/evidence-contract.mjs'],check=True)
original=json.loads((evidence/'INPUT_SOURCE_SHA256.json').read_text())
sha=lambda data:hashlib.sha256(data).hexdigest()
assert all(sha((source/f).read_bytes())==h for f,h in original.items())
assert len([p for p in evidence.iterdir() if re.match(r'^\d\d_',p.name)])==16
for p in evidence.rglob('*.json'):json.loads(p.read_text())
destination=source.parent/'deliverables'
destination.mkdir(exist_ok=True)
output=destination/'A9R18_AUTH_STARTUP_R1B_BLOCKED_FULL_SOURCE_HANDOFF.zip'
entries={}
for p in sorted(source.rglob('*')):
 if p.is_file():
  assert not p.is_symlink(),p
  entries['source/'+p.relative_to(source).as_posix()]=p.read_bytes()
entries['README_R1B.md']='''# A9R18 Auth Startup R1B — Full-source evidence handoff

Final classification: STARTUP_MEASUREMENT_BLOCKED.
R1C recommendation: MORE_MEASUREMENT_REQUIRED.

All 1,997 input files are byte-identical. Only R1B tooling and evidence were added.
The authoritative R1B reports are source/evidence/AUTH_STARTUP_R1B/01...16.

Native Auth acceptance runs: 0. Native startup traces: 0.
All required real Auth, DOM frame, listener detach, profile-owner, multi-tab,
main-failure/slow-main and bridge-order cases are NOT_RUN.
The 30 passing protected gates and the rerun R1A VM cases are offline regressions.
They do not replace real-browser acceptance or performance measurement.

Local Chromium cannot create its Unix socket. The default Playwright headless
dependency is absent and installation failed ZIP validation. Alternate Chrome
opened a blank page but could not access the local preflight endpoint; no
workaround was attempted after the browser policy denial.

No production application was opened. The canonical Firebase config remains
production config; do not use it for destructive auth races. No optimization,
module/listener-order change, authority change, Firebase test write, or deploy.

Available tooling is source-freeze/report-consistency verification and offline
regression orchestration. A native acceptance/measurement collector was not
activated or browser-validated. A working Chrome + local Emulators, or verified
isolated staging, is still required.

From the source directory:

    node tools/auth-startup-r1b/check-source.mjs
    node tools/auth-startup-r1b/evidence-contract.mjs

The ZIP contains SHA256SUMS.txt for all members. No node_modules are included.
'''.encode()
checks=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items()))
entries['SHA256SUMS.txt']=checks.encode()
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name,data in sorted(entries.items()):
  info=zipfile.ZipInfo(name,(2026,11,10,12,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  archive.writestr(info,data)
with zipfile.ZipFile(output) as archive:
 assert archive.testzip() is None
 assert len(archive.namelist())==len(entries)
 for line in checks.splitlines():
  digest,name=line.split('  ',1);assert sha(archive.read(name))==digest
 for f,digest in original.items():assert sha(archive.read('source/'+f))==digest
outer=sha(output.read_bytes())
checksum=Path(str(output)+'.sha256')
checksum.write_text(outer+'  '+output.name+'\n')
summary={'path':str(output),'checksumPath':str(checksum),'outerSHA256':outer,'sizeBytes':output.stat().st_size,'unchangedInputFiles':1997,'requiredReports':16,'members':len(entries),'crc':'PASS','memberSHA256':'PASS','classification':'STARTUP_MEASUREMENT_BLOCKED','recommendation':'MORE_MEASUREMENT_REQUIRED'}
(destination/'delivery.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
