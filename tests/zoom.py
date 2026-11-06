"""Zoom preserves linear boundaries, marker alignment and proportional trim."""
exec(open(__file__.replace('zoom.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'split',clip:1,at:.5},{do:'split',clip:2,at:1}]);window.__alya.state.beats=[.5,1];window.__alya.refreshAll()")
    for scale in [92,184,368]:
        page.click('#zoom-in')
        v=page.evaluate("""()=>{const base=document.querySelector('#timeline').getBoundingClientRect().left;const c=[...document.querySelectorAll('#timeline .clip')].map(e=>({x:e.getBoundingClientRect().left-base,w:e.getBoundingClientRect().width}));return c;}""")
        assert abs(v[0]['w']-scale*.5)<1 and abs(v[1]['x']-scale*.5)<1 and abs(v[2]['x']-scale)<1,v
        assert page.evaluate('parseFloat(document.querySelector("#beat-track span").style.left)')==scale*.5
    assert page.locator('#zoom-in').is_disabled()
    page.locator('#timeline-scroll').evaluate('e=>e.scrollLeft=0')
    page.screenshot(path='/downloads/timeline-zoom.png')
    # At 8x, move .1 source second on first clip's left trim handle.
    h=page.locator('.trim-handle.left').first.bounding_box();x,y=h['x']+h['width']/2,h['y']+h['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+36.8,y,steps=10);page.mouse.up()
    assert abs(page.evaluate('window.__alya.state.clips[0].trimStart')-.1)<.01
    page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips[0].trimStart')==0
    print('PASS: zoom 2x/4x/8x clip boundaries and markers, 8x proportional trim and Undo.')
    browser.close()
server.shutdown()
