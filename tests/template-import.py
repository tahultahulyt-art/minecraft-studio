"""Template import rejects malformed fields and keeps valid apply/Undo."""
exec(open(__file__.replace('template-import.py','smoke.py')).read().split('with sync_playwright()')[0])
import json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1');page.evaluate("window.__alya.applyOps([{do:'text',content:'Template test',start:0,end:2}])")
    page.click('[data-panel=templates]');alerts=[];page.on('dialog',lambda d:(alerts.append(d.message),d.accept()));page.click('#btn-import-template')
    for bad in [{'name':'Bad','filter':'toString'},{'name':'Bad','filter':'warm','textColor':'red'},{'name':'Bad','filter':'warm','textSize':-1},{'name':'Bad','filter':'warm','textSize':'52'},None]:
        before=len(alerts);page.locator('#template-import-box').fill(json.dumps(bad));page.click('#btn-import-template');assert len(alerts)==before+1 and page.evaluate('JSON.parse(localStorage.getItem("ms_templates")||"[]").length')==0
    good={'name':'Valid','filter':'warm','fades':True,'anim':'rise','textColor':'#aabbcc','textSize':36}
    page.locator('#template-import-box').fill(json.dumps(good));page.click('#btn-import-template');page.locator('#template-list button').filter(has_text='Valid').click()
    assert page.evaluate('({filter:window.__alya.state.filter,size:window.__alya.state.texts[0].size,color:window.__alya.state.texts[0].color,anim:window.__alya.state.texts[0].anim})')=={'filter':'warm','size':36,'color':'#aabbcc','anim':'rise'}
    page.click('#panel-templates .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.filter')=='none'
    print('PASS: invalid imports rejected; valid template applies and Undo restores.')
    browser.close()
server.shutdown()
