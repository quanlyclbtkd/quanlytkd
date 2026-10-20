"""Independent post-download EMV/TLV + CRC oracle; imports no application code."""
import sys,json
from binascii import crc_hqx
raw=sys.stdin.read().strip()
assert raw[-8:-4]=='6304'
assert f'{crc_hqx(raw[:-4].encode(),0xffff):04X}'==raw[-4:].upper()
def parse(s):
    rows={};offset=0
    while offset<len(s):
        tag=s[offset:offset+2];n=int(s[offset+2:offset+4]);offset+=4
        assert tag not in rows and offset+n<=len(s)
        rows[tag]=s[offset:offset+n];offset+=n
    return rows
t=parse(raw);m=parse(t['38']);a=parse(m['01']);d=parse(t['62'])
assert t['00']=='01' and t['53']=='704' and t['58']=='VN'
assert m['00']=='A000000727' and m['02']=='QRIBFTTA'
print(json.dumps({'bankBin':a['00'],'accountNo':a['01'],'amount':int(t['54']),'memo':d['08'],'crc':'PASS'}))
