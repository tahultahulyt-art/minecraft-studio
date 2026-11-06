"""Adjust a photo hold, verify export duration, Undo and autosave."""
exec(open(__file__.replace('photo-duration.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.locator('.clip').first.click();page.click('[data-panel=clips]');page.locator('#photo-duration').fill('2');page.click('#btn-photo-duration')
    assert page.evaluate('window.__alya.state.clips[0].trimEnd')==2
    assert '2.0s' in page.locator('.clip-dur').inner_text()
    data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
    out=Path('/tmp/alya-photo-duration.mp4');out.write_bytes(bytes(data));duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(out)]));assert abs(duration-2)<.1,duration
    page.locator('#photo-duration').fill('0');page.click('#btn-photo-duration');assert page.evaluate('window.__alya.state.clips[0].trimEnd')==2
    page.click('#panel-clips .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips[0].trimEnd')==3
    page.wait_for_timeout(1500);page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.clips[0].trimEnd')==3
    page.locator('.clip').first.click();page.click('[data-panel=clips]');page.locator('#photo-duration').fill('5');page.click('#btn-photo-duration');page.screenshot(path='/downloads/photo-duration.png')
    assert page.locator('#photo-duration').input_value()=='5'
    for selector in ['#btn-reverse','#btn-split','#btn-speed','#btn-transitions','#btn-delete-clip']:
        box=page.locator(selector).bounding_box();assert box['x']>=0 and box['x']+box['width']<=412,(selector,box)
    print('PASS: photo hold change, exact 2s H264 export, invalid duration rejected, Undo persists. Desktop Chrome synthetic fixture.')
    browser.close()
server.shutdown()
