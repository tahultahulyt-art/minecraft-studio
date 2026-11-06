exec(open(__file__.replace('layout.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
 for selector in ['#btn-home','#btn-undo','#btn-export']:
  box=page.locator(selector).bounding_box();assert box['x']>=0 and box['x']+box['width']<=360,(selector,box)
 for panel in ['clips','overlays','text','music','filters','templates','ai']:
  page.click('[data-panel='+panel+']');page.wait_for_timeout(250)
  if panel=='text':page.click('#btn-add-text')
  layout=page.locator('#panel-'+panel).evaluate('e=>({w:e.clientWidth,scroll:e.scrollWidth,bad:[...e.querySelectorAll("button,input,select")].filter(x=>x.offsetWidth&&x.getBoundingClientRect().right>360).map(x=>({id:x.id,right:x.getBoundingClientRect().right}))})');assert layout['scroll']<=360 and not layout['bad'],(panel,layout)
  page.screenshot(path='/downloads/layout-'+panel+'.png');page.locator('#panel-'+panel+' .panel-close').click()
 print("PASS: 360px header actions and seven panels stay within viewport. Desktop browser responsive layout.")
 b.close()
server.shutdown()
