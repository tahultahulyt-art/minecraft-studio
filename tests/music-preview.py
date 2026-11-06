"""Music preview responds to volume/remove and seek without altering source mute."""
exec(open(__file__.replace('music-preview.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    page.add_init_script("const create=document.createElement.bind(document);document.createElement=(name,...args)=>{const el=create(name,...args);if(name==='audio')window.previewMusic=el;return el;};")
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'));page.click('#panel-music .panel-close');page.click('#btn-play');page.wait_for_timeout(250)
    page.click('[data-panel=music]');page.locator('#music-volume').fill('20');page.locator('#music-volume').dispatch_event('input')
    assert abs(page.evaluate('window.previewMusic.volume')-.2)<.001,'Live music volume ignored'
    page.check('#chk-mute');assert page.evaluate('window.previewMusic.muted')==False,'Source mute muted added music'
    page.click('#btn-remove-music');assert page.evaluate('window.previewMusic.paused'),'Removed music kept playing'
    page.click('#panel-music .panel-close');page.click('#btn-undo');page.wait_for_timeout(200)
    assert page.evaluate('window.__alya.state.music!==null')
    print('PASS: live music volume, source-only mute, removal pauses music, Undo restores.')
    browser.close()
server.shutdown()
