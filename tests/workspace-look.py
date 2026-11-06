"""Original neon workspace and private optional wallpaper."""
exec(open(__file__.replace('workspace-look.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':360,'height':800});page.add_init_script("localStorage.setItem('alya_bg','data:image/png;base64,legacy')")
    requested=[];page.on('request',lambda r:requested.append(r.url));page.goto(base);page.wait_for_selector('#home-screen:not(.hidden)')
    assert page.locator('#custom-bg').evaluate("e=>getComputedStyle(e).backgroundImage")=='none'
    assert not any('bg-default.webp' in u or 'base64,legacy' in u for u in requested),requested
    page.screenshot(path='/downloads/workspace-home.png')
    page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.screenshot(path='/downloads/workspace-empty.png')
    page.click('#side-settings');page.set_input_files('#file-bg',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function("localStorage.getItem('ms_wallpaper_v1')?.startsWith('data:image/jpeg')")
    assert page.locator('#custom-bg').evaluate("e=>getComputedStyle(e).backgroundImage")!='none'
    page.wait_for_timeout(300);page.screenshot(path='/downloads/workspace-settings.png');page.reload();page.locator('.proj-card').first.click();page.click('#side-settings');page.click('#btn-remove-bg');assert page.evaluate("localStorage.getItem('ms_wallpaper_v1')") is None
    page.click('#panel-settings .panel-close');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1');page.screenshot(path='/downloads/workspace-editor.png')
    page.click('#quality-pill');page.click('[data-q="720p30"]');assert page.locator('#quality-pill').inner_text()=='720p';page.click('#panel-export .panel-close')
    page.click('#side-templates');assert 'Minecraft' in page.locator('#template-list').inner_text();page.click('#panel-templates .panel-close')
    for sid,panel in [('side-effects','filters'),('side-ai','ai')]:
        page.click('#'+sid);assert page.locator('#panel-'+panel).is_visible();page.click('#panel-'+panel+' .panel-close')
    page.on('dialog',lambda d:d.accept());page.click('#side-new');page.wait_for_function('window.__alya.state.clips.length===0');page.click('#side-projects');page.wait_for_function("document.querySelectorAll('.proj-card').length===2")
    print('PASS: 360px neon workspace, legacy wallpaper ignored, user wallpaper local persistence/removal, real quality pill and sidebar routes; Minecraft styles retained.')
    browser.close()
server.shutdown()
