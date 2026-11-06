"""Track media URL reuse and project-switch cleanup. Not a phone RAM benchmark."""
exec(open(__file__.replace('media-lifecycle.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("""window.liveUrls=new Set();const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=make(b);liveUrls.add(u);return u;};URL.revokeObjectURL=u=>{liveUrls.delete(u);revoke(u);};""")
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    assert page.evaluate('liveUrls.size')==1
    for i in range(12):
        page.evaluate("window.__alya.applyOps([{do:'filter',name:'vivid'}])");page.click('#btn-undo')
    assert page.evaluate('liveUrls.size')==1,'Undo leaked media URLs'
    assert page.evaluate('window.__alya.state.clips[0].thumbs[0]===window.__alya.state.clips[0].url')
    page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('liveUrls.size')==0,'New project retained old URLs'
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    assert page.evaluate('liveUrls.size')==1
    page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.locator('.proj-card').nth(1).click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('liveUrls.size')==1,'Opening old project leaked current media'
    page.wait_for_function('document.querySelector("#video-slot img").naturalWidth>0')
    assert page.evaluate('window.__alya.state.clips[0].kind')=='image'
    page.click('#btn-home');page.on('dialog',lambda d:d.accept());page.locator('[data-act=delete]').first.click();page.wait_for_timeout(200)
    assert page.evaluate('liveUrls.size')==0,'Active project deletion retained URLs'
    assert not errors,errors
    print('PASS: repeated Undo reuses URLs, new/open/delete project releases media, image still displays.')
    browser.close()
server.shutdown()
