"""Existing text editing is undoable as one session and autosaves the Undo."""
exec(open(__file__.replace('text-undo.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'text',content:'Original',start:0,end:2}])")
    page.click('[data-panel=text]');page.locator('.text-item').first.click();page.locator('#te-content').fill('Edited');page.locator('#te-start').fill('1');page.locator('#te-end').fill('2.5');page.click('#te-done');page.click('#panel-text .panel-close');page.click('#btn-undo')
    text=page.evaluate('window.__alya.state.texts[0]');assert text['content']=='Original' and text['start']==0 and text['end']==2,text
    page.wait_for_timeout(1500);page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.texts[0].content')=='Original'
    page.screenshot(path='/downloads/text-undo.png')
    print('PASS: existing text edits undo as one session and the restored text survives reload.')
    browser.close()
server.shutdown()
