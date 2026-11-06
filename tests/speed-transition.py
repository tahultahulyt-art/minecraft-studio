"""Real trim/speed/transition duration regression with nonzero source offsets."""
exec(open(__file__.replace('speed-transition.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',[str(ROOT/'test-assets/clip1.mp4'),str(ROOT/'test-assets/clip3_noaudio.mp4')]);page.wait_for_function('window.__alya.state.clips.length===2')
    page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:1,end:3},{do:'trim',clip:2,start:0.5,end:2.5},{do:'speed',clip:1,value:2},{do:'speed',clip:2,value:0.5}])")
    for transition,blur in [(False,False),(True,False),(True,True)]:
        page.evaluate('(b)=>window.__alya.state.canvasBlur=b',blur)
        expected=page.evaluate('(t)=>{window.__alya.state.transitions=t;window.__alya.refreshAll();return Exporter.outputDuration(window.__alya.state)}',transition)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-speed-transition-'+str(transition)+'-'+str(blur)+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))
        for s in j['streams']:
            assert abs(float(s['duration'])-expected)<.15,(transition,s['codec_type'],expected,s['duration'])
        subprocess.run(['ffmpeg','-y','-ss',str(expected-.3),'-i',str(out),'-frames:v','1','/downloads/speed-transition-'+str(transition)+'-'+str(blur)+'.png','-loglevel','error'],check=True)
        print('PASS: trim+speed real export',transition,'duration',expected)
    browser.close()
server.shutdown()
