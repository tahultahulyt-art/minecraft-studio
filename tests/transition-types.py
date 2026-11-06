"""Exercise every offered transition against the real wasm engine."""
exec(open(__file__.replace('transition-types.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',[str(ROOT/'test-assets/clip1.mp4'),str(ROOT/'test-assets/clip3_noaudio.mp4')]);page.wait_for_function('window.__alya.state.clips.length===2')
    page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:0,end:1},{do:'trim',clip:2,start:0,end:1}]);window.__alya.state.transitions=true")
    types=page.locator('#transition-type option').evaluate_all('(els)=>els.map(e=>e.value)')
    for kind in types:
        page.evaluate('(k)=>window.__alya.state.transitionType=k',kind)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-transition-'+kind+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))
        for s in j['streams']:assert abs(float(s['duration'])-1.55)<.15,(kind,s['codec_type'],s['duration'])
        subprocess.run(['ffmpeg','-y','-ss','0.75','-i',str(out),'-frames:v','1','/downloads/transition-'+kind+'.png','-loglevel','error'],check=True)
        print('PASS transition',kind)
    browser.close()
server.shutdown()
