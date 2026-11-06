"""Pointer trim/reorder + undo/autosave regression. See smoke.py for setup."""
exec(open(__file__.replace('timeline.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'))
    page.wait_for_function('window.__alya.state.clips.length===1');page.wait_for_timeout(1600)
    h=page.locator('.trim-handle.left').first.bounding_box()
    x,y=h['x']+h['width']/2,h['y']+h['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+46,y,steps=10);page.mouse.up()
    assert page.evaluate('window.__alya.state.clips[0].trimStart')==1
    page.wait_for_timeout(1600);page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('window.__alya.state.clips[0].trimStart')==1,'Pointer trim did not autosave'
    page.evaluate("window.__alya.applyOps([{do:'split',clip:1,at:4}])")
    page.wait_for_function('window.__alya.state.clips.length===2')
    ids=page.evaluate('window.__alya.state.clips.map(c=>c.id)')
    c=page.locator('#timeline .clip').first.bounding_box();last=page.locator('#timeline .clip').last.bounding_box()
    page.mouse.move(c['x']+40,c['y']+30);page.mouse.down();page.wait_for_timeout(300)
    page.mouse.move(last['x']+last['width']-10,last['y']+30,steps=15);page.mouse.up()
    assert page.evaluate('window.__alya.state.clips.map(c=>c.id)')==ids[::-1],'Pointer reorder failed'
    page.click('#btn-undo')
    assert page.evaluate('window.__alya.state.clips.map(c=>c.id)')==ids
    page.wait_for_timeout(1600);page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('window.__alya.state.clips.map(c=>c.id)')==ids,'Undo did not autosave'
    assert page.evaluate('window.__alya.state.clips.map(c=>[c.trimStart,c.trimEnd])')==[[1,4],[4,8]]
    page.screenshot(path='/tmp/alya-timeline.png')
    assert not errors,errors
    print('PASS: pointer trim/reorder, undo, and idle autosave reload.')
    browser.close()
server.shutdown()
