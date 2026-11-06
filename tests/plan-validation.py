"""Malformed plans cannot poison state; a stale plan cannot edit another project."""
exec(open(__file__.replace('plan-validation.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    result=page.evaluate("""()=>{const before=window.__alya.snapshot();const cases=[[{do:'speed',clip:1}],[{do:'trim',clip:1,start:NaN,end:2}],[{do:'text',content:'bad',size:Infinity}],[{do:'musicvol',value:-2}],[{do:'text',content:'bad',color:'red;bad'}],[null]];return cases.every(ops=>window.__alya.applyOps(ops).length>0&&window.__alya.snapshot()===before);} """)
    assert result,'Malformed operation changed state'
    page.click('[data-panel=ai]');page.locator('#ai-input').fill('warm filter');page.click('#ai-send');page.wait_for_selector('#ai-plan:not(.hidden)');page.click('#panel-ai .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)')
    page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.click('[data-panel=ai]');page.click('#ai-apply')
    assert page.evaluate('window.__alya.state.filter')=='none','Stale plan edited different project'
    print('PASS: malformed values leave state unchanged; prior project plan cannot apply to new project.')
    browser.close()
server.shutdown()
