"""Split rejects source boundaries; internal split preserves duration and Undo."""
exec(open(__file__.replace('split-boundaries.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.set_default_timeout(4000);page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=clips]');page.click('#btn-split');assert page.evaluate('window.__alya.state.clips.length')==1
    assert 'bahar' in page.locator('#clip-process-status').inner_text()
    page.click('#panel-clips .panel-close')
    def seek(t):
        page.locator('#timeline-scroll').evaluate('(e,t)=>e.scrollLeft=Math.max(0,t*46-180)',t)
        origin=page.locator('#timeline').bounding_box()['x'];track=page.locator('#beat-track').bounding_box();page.mouse.click(origin+t*46,track['y']+5)
    seek(8);page.click('[data-panel=clips]');page.click('#btn-split');assert page.evaluate('window.__alya.state.clips.length')==1
    page.locator('.panel:not(.hidden) .panel-close').click();seek(4);page.click('[data-panel=clips]');page.click('#btn-split')
    clips=page.evaluate('window.__alya.state.clips.map(c=>({start:c.trimStart,end:c.trimEnd}))');assert clips==[{'start':0,'end':4},{'start':4,'end':8}],clips
    page.click('#panel-clips .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips.length')==1
    page.screenshot(path='/downloads/split-boundaries.png')
    print('PASS: split at start/end makes no zero-duration clips; internal split and Undo preserve source.')
    browser.close()
server.shutdown()
