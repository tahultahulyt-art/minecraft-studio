"""Photo speed exports must retain visible frames through their expected duration."""
exec(open(__file__.replace('photo-speed.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    for speed in [.5,2]:
        page.evaluate('(speed)=>window.__alya.applyOps([{do:"speed",clip:1,value:speed}])',speed)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-photo-speed-'+str(speed)+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));v=next(s for s in j['streams'] if s['codec_type']=='video');expected=3/speed
        assert abs(float(v['duration'])-expected)<.15,(speed,expected,v['duration'])
        subprocess.run(['ffmpeg','-y','-ss',str(expected-.3),'-i',str(out),'-frames:v','1','/downloads/photo-speed-'+str(speed)+'.png','-loglevel','error'],check=True)
    print('PASS: photo 0.5x and 2x video stream durations match timeline, last-frame captures generated.')
    browser.close()
server.shutdown()
