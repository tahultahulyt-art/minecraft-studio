"""All export filters retain requested output geometry and duration."""
exec(open(__file__.replace('filter-types.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1');page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:0,end:1}])")
    for kind in page.evaluate('Object.keys(Exporter.FILTERS)'):
        page.evaluate('(k)=>window.__alya.state.filter=k',kind)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-filter-'+kind+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));v=next(s for s in j['streams'] if s['codec_type']=='video')
        assert (v['width'],v['height'])==(854,480),(kind,v['width'],v['height'])
        assert abs(float(v['duration'])-1)<.1,(kind,v['duration'])
        subprocess.run(['ffmpeg','-y','-ss','0.4','-i',str(out),'-frames:v','1','/downloads/filter-'+kind+'.png','-loglevel','error'],check=True)
        print('PASS filter',kind)
    browser.close()
server.shutdown()
