"""Actual voice/music/mute export audio durations and signal checks."""
exec(open(__file__.replace('audio-effects.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json,audioop
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'trim',clip:1,start:1,end:3}])")
    for kind in ['none','high','deep','radio','echo','muted','music']:
        page.evaluate('(k)=>{window.__alya.state.voiceEffect=k;window.__alya.state.muted=["muted","music"].includes(k)}',kind)
        if kind=='music':
            page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'));page.click('#panel-music .panel-close')
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/mcstudio-audio-'+kind+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));a=next(s for s in j['streams'] if s['codec_type']=='audio')
        assert abs(float(a['duration'])-2)<.15,(kind,a['duration'])
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(out),'-map','0:a','-f','s16le','-ac','1','-ar','16000','-'])
        rms=audioop.rms(raw,2)
        assert rms==0 if kind=='muted' else rms>10,(kind,rms)
        print('PASS audio',kind,'duration',a['duration'],'RMS',rms)
    browser.close()
server.shutdown()
