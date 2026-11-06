"""A broken photo must not leave import spinner/navigation stuck."""
exec(open(__file__.replace('invalid-import.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',{'name':'broken.png','mimeType':'image/png','buffer':b'not an image'})
    page.wait_for_selector('#stage-spinner.hidden',state='attached');assert not page.locator('#btn-home').is_disabled()
    assert page.evaluate('window.__alya.state.clips.length')==0
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('#panel-backdrop');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');assert not errors,errors
    print('PASS: malformed photo rejected, spinner/home recovered, subsequent valid import saved.')
    browser.close()
server.shutdown()
