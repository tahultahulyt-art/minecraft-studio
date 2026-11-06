"""Malformed saved template storage must not prevent opening projects."""
exec(open(__file__.replace('template-storage.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    for raw in ['null','{}','[null]','[{"name":"Bad","filter":"none","textSize":-1}]']:
        page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.evaluate('(r)=>localStorage.setItem("ms_templates",r)',raw);page.reload();page.wait_for_selector('#home-screen:not(.hidden)');page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
        assert not errors,(raw,errors)
        page.close()
    print('PASS: null/object/null-entry/invalid-size saved template data cannot block home/project opening.')
    browser.close()
server.shutdown()
