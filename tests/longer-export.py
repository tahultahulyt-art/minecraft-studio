"""30s photo export with music/transitions, real wasm, not phone performance proof."""
exec(open(__file__.replace('longer-export.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json,time
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',[str(ROOT/'test-assets/photo.jpg')]*3);page.wait_for_function('window.__alya.state.clips.length===3')
    page.evaluate("window.__alya.state.clips.forEach(c=>{c.srcDuration=10;c.trimEnd=10});window.__alya.state.transitions=true;window.__alya.refreshAll()")
    page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'));page.click('#panel-music .panel-close')
    started=time.monotonic();data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");elapsed=time.monotonic()-started
    out=Path('/tmp/alya-longer.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))
    for s in j['streams']:assert abs(float(s['duration'])-29)<.15,(s['codec_type'],s['duration'])
    subprocess.run(['ffmpeg','-y','-ss','28.5','-i',str(out),'-frames:v','1','/downloads/longer-export.png','-loglevel','error'],check=True)
    files=page.evaluate("async()=>(await (await Exporter.ensureLoaded()).listDir('/')).filter(e=>!e.isDir).map(e=>e.name)");assert not any(n.startswith(('in0.','out.','music.')) for n in files),files
    print('PASS: three 10s photos + crossfades + shorter music produce full29s video/audio; engine temp files cleared. Desktop seconds:',round(elapsed,1))
    browser.close()
server.shutdown()
