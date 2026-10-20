"""Independent test-only QR encoder. Receives synthetic tuples on stdin."""
import sys,json,io
from binascii import crc_hqx
from reportlab.graphics.barcode import qrencoder
from PIL import Image
d=json.load(sys.stdin)
def tlv(k,v):return k+str(len(v)).zfill(2)+v
m=tlv('00','A000000727')+tlv('01',tlv('00',d['bankBin'])+tlv('01',d['accountNo']))+tlv('02','QRIBFTTA')
s=tlv('00','01')+tlv('01','12')+tlv('38',m)+tlv('53','704')+tlv('54',str(d['amount']))+tlv('58','VN')+tlv('62',tlv('08',d['memo']))+'6304'
s+=f'{crc_hqx(s.encode(),0xffff):04X}'
q=qrencoder.QRCode(None,qrencoder.QRErrorCorrectLevel.M);q.addData(s);q.make()
n=q.getModuleCount();p=8;b=5;im=Image.new('RGB',((n+2*b)*p,)*2,'white')
for r in range(n):
 for c in range(n):
  if q.isDark(r,c):im.paste((0,0,0),((c+b)*p,(r+b)*p,(c+b+1)*p,(r+b+1)*p))
im.save(sys.stdout.buffer,format='PNG')
