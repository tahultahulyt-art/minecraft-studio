"""Mock Android bridge: export stays disabled until native save/cancel/failure."""
exec(open(__file__.replace('native-save.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("()=>{window.nativeMessages=[];window.AlyaSave={postMessage:m=>nativeMessages.push(m)};Exporter.exportVideo=async()=>new Blob([new Uint8Array(100000)],{type:'video/mp4'});}")
    page.click('#btn-export');page.click('#btn-start-export');page.wait_for_function('window.nativeMessages.at(-1)==="end"')
    assert page.locator('#btn-start-export').is_disabled()
    assert page.evaluate('window.nativeMessages.filter(m=>m.startsWith("chunk:")).length')==2
    for status in ['Save cancelled. Export again to retry.','Video saved.','Save failed: destination full']:
        page.evaluate('(s)=>{window.dispatchEvent(new CustomEvent("alya-save-status",{detail:s}));window.dispatchEvent(new Event("alya-save-finished"));}',status)
        assert not page.locator('#btn-start-export').is_disabled()
        assert page.locator('#export-msg').inner_text()==status
        page.evaluate('window.nativeMessages=[]');page.click('#btn-start-export');page.wait_for_function('window.nativeMessages.at(-1)==="end"');assert page.locator('#btn-start-export').is_disabled()
    page.evaluate('window.dispatchEvent(new Event("alya-save-finished"))')
    page.screenshot(path='/downloads/native-save.png')
    print('PASS: native save locks repeat export; success, cancel and failure unlock it. Mock bridge only, not Android device test.')
    browser.close()
server.shutdown()
