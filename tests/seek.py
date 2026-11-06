"""Actual timeline clicks seek correctly at scroll/zoom and final boundary."""
exec(open(__file__.replace('seek.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate('window.__alya.state.beats=[2,8];window.__alya.refreshAll()')
    for scale,t,scroll in [(46,2,0),(92,3,100),(92,8,500)]:
        if scale==92 and t==3:page.click('#zoom-in')
        page.locator('#timeline-scroll').evaluate('(e,s)=>e.scrollLeft=s',scroll)
        origin=page.locator('#timeline').bounding_box()['x'];track=page.locator('#beat-track').bounding_box()
        page.mouse.click(origin+t*scale,track['y']+5)
        page.wait_for_timeout(200)
        v=page.locator('#video-slot video')
        assert v.count()==1,'Final timeline boundary lost video preview'
        assert abs(v.evaluate('e=>e.currentTime')-min(t,7.999))<.15,(t,v.evaluate('e=>e.currentTime'))
    page.screenshot(path='/downloads/seek-end.png')
    print('PASS: actual clicked seek at zoom/scroll and final frame preview.')
    browser.close()
server.shutdown()
