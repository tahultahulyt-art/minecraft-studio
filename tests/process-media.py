"""Real wasm freeze/reverse with duration, source geometry and Undo checks."""
exec(open(__file__.replace('process-media.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:0,end:4}])")
    origin=page.locator('#timeline').bounding_box()['x'];track=page.locator('#beat-track').bounding_box();page.mouse.click(origin+2*46,track['y']+5)
    page.click('[data-panel=clips]');page.click('#btn-freeze');page.wait_for_function('document.querySelector("#clip-process-status").textContent.includes("freeze added")',timeout=30000)
    clips=page.evaluate('window.__alya.state.clips.map(c=>({kind:c.kind,start:c.trimStart,end:c.trimEnd}))');assert clips==[{'kind':'video','start':0,'end':2},{'kind':'image','start':0,'end':3},{'kind':'video','start':2,'end':4}],clips
    page.click('#panel-clips .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips.length')==1
    page.locator('.clip').first.click();page.click('[data-panel=clips]');page.click('#btn-reverse');page.wait_for_function('document.querySelector("#clip-process-status").textContent.includes("Reversed clip ready")',timeout=30000)
    data=page.evaluate('async()=>Array.from(new Uint8Array(await window.__alya.state.clips[0].file.arrayBuffer()))')
    out=Path('/tmp/alya-real-reverse.mp4');out.write_bytes(bytes(data));probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]));assert abs(float(probe['format']['duration'])-4)<.1,probe
    assert any(x['codec_type']=='audio' for x in probe['streams']),probe
    page.click('#panel-clips .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips[0].name')=='clip1.mp4'
    page.screenshot(path='/downloads/process-media.png');assert not errors,errors
    print('PASS: real wasm freeze splits at 2s and adds 3s still; reverse creates valid 4s video+audio; Undo restores both.')
    browser.close()
server.shutdown()
