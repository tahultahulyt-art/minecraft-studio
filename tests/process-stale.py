"""A clip deleted during processing cannot replace the final remaining clip."""
exec(open(__file__.replace('process-stale.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.set_default_timeout(4000);page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',[str(ROOT/'test-assets/clip1.mp4'),str(ROOT/'test-assets/photo.jpg')]);page.wait_for_function('window.__alya.state.clips.length===2')
    page.locator('.clip').first.click();page.click('[data-panel=clips]')
    page.evaluate("()=>{Exporter.ensureLoaded=async()=>({writeFile:async()=>{},exec:()=>new Promise(r=>window.finishProcess=r),readFile:async()=>new Uint8Array([1,2]),deleteFile:async()=>{}});}")
    page.click('#btn-freeze');page.wait_for_function('typeof window.finishProcess==="function"')
    page.evaluate("window.__alya.applyOps([{do:'delete',clip:1}]);window.finishProcess(0)")
    page.wait_for_function('!document.querySelector("#btn-home").disabled')
    assert page.evaluate('window.__alya.state.clips.length')==1
    assert page.evaluate('window.__alya.state.clips[0].name')=='photo.jpg'
    assert 'was not applied' in page.locator('#clip-process-status').inner_text()
    page.click('#panel-clips .panel-close');page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'))
    page.evaluate("()=>{window.AudioContext=class{decodeAudioData(){return new Promise(r=>window.finishBeats=r)}close(){}}}")
    page.click('#btn-beats');page.wait_for_function('typeof window.finishBeats==="function"');assert page.locator('#btn-beats').is_disabled()
    page.click('#btn-remove-music');page.evaluate("window.finishBeats({duration:1,sampleRate:100,getChannelData:()=>new Float32Array(100)})")
    page.wait_for_function('!document.querySelector("#btn-beats").disabled')
    assert 'were not applied' in page.locator('#beat-status').inner_text()
    assert page.evaluate('window.__alya.state.beats.length')==0
    page.click('#panel-music .panel-close');page.click('[data-panel=overlays]');page.set_input_files('#ov-file',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.overlays.length===1')
    page.route('**/segmentation.js',lambda r:r.fulfill(content_type='application/javascript',body='export const removePersonBackground=()=>new Promise(r=>window.finishCutout=r);'))
    page.click('#ov-remove-bg');page.wait_for_function('typeof window.finishCutout==="function"');page.click('#ov-delete')
    page.evaluate("window.finishCutout('data:image/png;base64,AA==')");page.wait_for_function('!document.querySelector("#ov-remove-bg").disabled')
    assert page.evaluate('window.__alya.state.overlays.length')==0
    assert 'was not applied' in page.locator('#ov-remove-status').inner_text()
    page.screenshot(path='/downloads/process-stale.png')
    print('PASS: stale freeze result cannot insert/replace clips after deletion; removed music rejects beat result; controls recover. Mocked engine/decode.')
    browser.close()
server.shutdown()
