"""Music edits and source mute survive project reload, removal and Undo."""
exec(open(__file__.replace('music-persistence.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'));page.locator('#music-volume').fill('20');page.locator('#music-volume').dispatch_event('input');page.check('#chk-mute');page.click('#panel-music .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('({name:window.__alya.state.music.name,volume:window.__alya.state.music.volume,muted:window.__alya.state.muted})')=={'name':'music15.mp3','volume':.2,'muted':True}
    page.click('[data-panel=music]');assert page.locator('#chk-mute').is_checked();assert page.locator('#music-volume').input_value()=='20';page.click('#btn-remove-music');page.click('#panel-music .panel-close');page.click('#btn-undo')
    assert page.evaluate('window.__alya.state.music.volume')==.2
    page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.music.file.size')>1000
    print('PASS: music volume/source mute persist; remove/Undo restores file through reload.')
    browser.close()
server.shutdown()
