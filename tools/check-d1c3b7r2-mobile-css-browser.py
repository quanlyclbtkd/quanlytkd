#!/usr/bin/env python3
"""Chromium computed-style test on actual built /public CSS and renderTxRow HTML.
No Firebase/network/credentials. Inline CSS contents come from published public files;
not a full application page-navigation or physical mobile test.
"""
from pathlib import Path
from html.parser import HTMLParser
import json,sys,os
from playwright.sync_api import sync_playwright
class InlineStyles(HTMLParser):
 def __init__(self):super().__init__();self.in_style=False;self.styles=[]
 def handle_starttag(self,tag,attrs):
  if tag=='style':self.in_style=True;self.styles.append('')
 def handle_data(self,text):
  if self.in_style:self.styles[-1]+=text
 def handle_endtag(self,tag):
  if tag=='style':self.in_style=False
root=Path(sys.argv[1]);rendered=Path(sys.argv[2]);output=Path(sys.argv[3]);output.mkdir(parents=True,exist_ok=True)
html=(root/'index.html').read_text();parser=InlineStyles();parser.feed(html)
assert parser.styles,'no production inline CSS'
styles=''.join('<style>'+text+'</style>' for text in parser.styles)
for rel in ['css/tailwind-static.css','css/ui-mobile-shell.css']:
 assert rel in html,rel+' not linked in index.html'
 styles+='<style data-production-source="'+rel+'">'+(root/rel).read_text()+'</style>'
page_html='<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body class="ui-mobile-shell"><main style="padding:8px"><section id="tab_tx" class="tab-content active" style="display:block"><div class="table-wrapper"><table id="tbl_tx"><tbody>'+rendered.read_text()+'</tbody></table></div></section></main></body></html>'
results=[]
with sync_playwright() as p:
 executable=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
 if not executable and Path('/usr/bin/chromium').is_file():executable='/usr/bin/chromium'
 browser=p.chromium.launch(headless=True, **({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
 for w,h in [(320,568),(360,800),(390,844),(430,932),(768,1024),(568,320)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  page.set_content(page_html,wait_until='load')
  result=page.evaluate('''() => {
    const tr=document.querySelector('#tbl_tx tbody tr'), amount=tr.querySelector('.tx-amount-cell'), buttons=[...tr.querySelectorAll('.tx-actions-cell button')];
    const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
    const intersects=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    const btns=buttons.map(box);
    return {display:getComputedStyle(amount).display,align:getComputedStyle(amount).alignItems,justify:getComputedStyle(amount).justifyContent,
      minTargetPx:Math.min(...btns.map(b=>b.h)),overlap:btns.some((a,i)=>btns.slice(i+1).some(b=>intersects(a,b))),
      pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      actionCount:btns.length,nameWidth:box(tr.querySelector('.tx-name-cell')).w,amountX:box(amount).x,nameX:box(tr.querySelector('.tx-name-cell')).x};
  }''')
  result.update(viewport=f'{w}x{h}',passed=(w>=768 or (result['display']=='flex' and result['align']=='flex-end' and result['justify']=='center' and result['minTargetPx']>=43.99 and not result['overlap'] and not result['pageOverflow'] and (w>370 or result['nameWidth']>=w-50))))
  if w in [320,390,768]:page.screenshot(path=str(output/f'chromium_public_{w}.png'),full_page=True)
  results.append(result);page.close()
 browser.close()
(output/'mobile_css_browser_result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
for item in results:print(('PASS' if item['passed'] else 'FAIL'),item['viewport'],'computed amount:',item['display'],item['align'],item['justify'],'touch:',round(item['minTargetPx'],1),'overlap:',item['overlap'],'overflow:',item['pageOverflow'])
print('SCOPE: Headless Chromium fixture with real production renderer rows and built /public CSS; app navigation and physical Safari/Android NOT VERIFIED')
if any(not row['passed'] for row in results):sys.exit(1)
