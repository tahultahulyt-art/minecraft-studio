"""Short synthetic codec/audio/canvas/fps matrix. Not device performance proof."""
exec(open(__file__.replace('portrait-pixel.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
cases=[('clip1.mp4','480p30','9:16'),('clip1.mp4','480p30','1:1'),('clip1.mp4','480p30','4:5')]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base)
    for i,(name,quality,ratio) in enumerate(cases):
        page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets'/name));page.wait_for_function('window.__alya.state.clips.length===1')
        page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:0,end:1}]);")
        page.evaluate("window.__alya.state.filter='pixel'")
        page.evaluate('(ratio)=>{window.__alya.state.canvasRatio=ratio;window.__alya.refreshAll()}',ratio)
        data=page.evaluate("async(q)=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,q)).arrayBuffer()))",quality)
        out=Path('/tmp')/('alya-portrait-pixel-'+str(i)+'.mp4');out.write_bytes(bytes(data))
        d=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]));v=next(x for x in d['streams'] if x['codec_type']=='video');a=next(x for x in d['streams'] if x['codec_type']=='audio')
        assert v['codec_name']=='h264' and a['codec_name']=='aac',d
        assert abs(float(d['format']['duration'])-1)<.1,d
        assert v['avg_frame_rate']==('60/1' if '60' in quality else '30/1'),v
        expected={'16:9':(854,480),'9:16':(480,854),'1:1':(480,480),'4:5':(480,600)}[ratio]
        assert (v['width'],v['height'])==expected,v
        subprocess.run(['ffmpeg','-y','-ss','0.4','-i',str(out),'-frames:v','1','/downloads/portrait-pixel-'+str(i)+'.png','-loglevel','error'],check=True)
        print('PASS',name,quality,ratio,v['width'],v['height'],v['avg_frame_rate'],d['format']['duration'])
        page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)')
    assert not errors,errors
    browser.close()
server.shutdown()
