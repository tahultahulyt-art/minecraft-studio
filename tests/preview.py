"""Playback stays on one video element through refresh and advances across cuts."""
exec(open(__file__.replace('preview.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'split',clip:1,at:2}])")
    page.click('#btn-play');page.wait_for_timeout(400)
    page.evaluate('window.previewVideo=document.querySelector("#video-slot video")')
    page.evaluate("window.__alya.applyOps([{do:'filter',name:'vivid'}])")
    assert page.evaluate('window.previewVideo===document.querySelector("#video-slot video")'),'Refresh switched active video'
    page.wait_for_timeout(2400)
    assert page.evaluate('Number(document.querySelector("#video-slot video").dataset.clipId)')==2
    assert page.evaluate('window.previewVideo.paused'),'Previous clip kept playing offscreen'
    page.click('#btn-play')
    t=page.evaluate('document.querySelector("#video-slot video").currentTime');page.wait_for_timeout(350)
    assert abs(page.evaluate('document.querySelector("#video-slot video").currentTime')-t)<.1,'Pause did not stop current clip'
    page.click('#btn-play');page.wait_for_function('(t)=>document.querySelector("#video-slot video").currentTime>t+.15',arg=t,timeout=3000)
    page.click('#btn-play')
    page.screenshot(path='/downloads/preview-playback.png')
    print('PASS: refresh preserves video element, playback advances, previous clip paused.')
    browser.close()
server.shutdown()
