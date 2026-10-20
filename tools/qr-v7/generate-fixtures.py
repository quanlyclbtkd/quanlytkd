"""Offline synthetic EMV fixtures, independent of production URL/parser code. No transfers."""
from pathlib import Path
from reportlab.graphics.barcode import qrencoder
from PIL import Image, ImageFilter
from binascii import crc_hqx
import json, hashlib

out=Path(__file__).parent/'fixtures';out.mkdir(exist_ok=True)
def tlv(tag,value):
    return tag+f'{len(value):02}'+value
def emv(bank='970422',account='001234567890',amount='500000',memo='TEST VDV Hoc Phi Thang 10 2026'):
    merchant=tlv('00','A000000727')+tlv('01',tlv('00',bank)+tlv('01',account))+tlv('02','QRIBFTTA')
    value=tlv('00','01')+tlv('01','12')+tlv('38',merchant)+tlv('53','704')+tlv('54',amount)+tlv('58','VN')+tlv('62',tlv('08',memo))+'6304'
    return value+f'{crc_hqx(value.encode(),0xffff):04X}'
def render(payload):
    q=qrencoder.QRCode(None,qrencoder.QRErrorCorrectLevel.M);q.addData(payload);q.make()
    n=q.getModuleCount();pitch=8;border=5
    im=Image.new('RGB',((n+border*2)*pitch,)*2,'white')
    for row in range(n):
        for col in range(n):
            if q.isDark(row,col):
                im.paste((0,0,0),((col+border)*pitch,(row+border)*pitch,(col+border+1)*pitch,(row+border+1)*pitch))
    return im
cases={'valid':{},'wrong-bank':{'bank':'970436'},'wrong-account':{'account':'009999999999'},'wrong-amount':{'amount':'500001'},'wrong-memo':{'memo':'WRONG REFERENCE'}}
manifest={}
for key,kwargs in cases.items():
    p=emv(**kwargs);im=render(p);f=out/(key+'.png');im.save(f)
    manifest[f.name]={'kind':'SYNTHETIC_OFFLINE','sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'payload':p,'size':im.size}
v=Image.open(out/'valid.png')
variants={'white':Image.new('RGB',v.size,'white'),'stretched':v.resize((v.width*2,v.height)),'blurred':v.filter(ImageFilter.GaussianBlur(10)),'cropped':v.crop((40,40,v.width-40,v.height-40))}
for key,im in variants.items():im.save(out/(key+'.png'))
(out/'truncated.png').write_bytes((out/'valid.png').read_bytes()[:100])
render(emv()[:-4]+'0000').save(out/'wrong-crc.png')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'generated':len(list(out.glob('*.png'))),'valid':manifest['valid.png']['size'],'scope':'synthetic only'}))
