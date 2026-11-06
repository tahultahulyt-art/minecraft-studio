"""Caption WAV matches preview timeline for photo/video/speed mixtures."""
exec(open(__file__.replace('caption-audio.py','smoke.py')).read().split('with sync_playwright()')[0])
import io
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base)
    for files in [['photo.jpg'],['photo.jpg','clip1.mp4','clip3_noaudio.mp4']]:
        page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',[str(ROOT/'test-assets'/f) for f in files]);page.wait_for_function('(n)=>window.__alya.state.clips.length===n',arg=len(files))
        page.evaluate("window.__alya.applyOps([{do:'speed',clip:1,value:2}]);if(window.__alya.state.clips.length>1)window.__alya.applyOps([{do:'trim',clip:2,start:1,end:3},{do:'speed',clip:2,value:0.5},{do:'trim',clip:3,start:0,end:1}])")
        expected=page.evaluate('Exporter.totalDur(window.__alya.state)')
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.extractAudio(window.__alya.state)).arrayBuffer()))")
        with wave.open(io.BytesIO(bytes(data))) as w:
            assert w.getframerate()==16000 and w.getnchannels()==1 and w.getsampwidth()==2
            assert abs(w.getnframes()/w.getframerate()-expected)<.15,(files,expected,w.getnframes()/w.getframerate())
            if len(files)==1:assert set(w.readframes(w.getnframes()))=={0}
        print('PASS caption WAV',files,'duration',expected)
        page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)')
    browser.close()
server.shutdown()
