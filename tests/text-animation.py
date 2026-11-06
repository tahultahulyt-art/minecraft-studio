"""Actual wasm text animations, including Hindi, retain valid output."""
exec(open(__file__.replace('text-animation.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
from fontTools.ttLib import TTFont
cmap=TTFont(ROOT/"fonts/AlyaMixed-Regular.ttf").getBestCmap()
assert all(ord(c) in cmap for c in "Alya नमस्ते")
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=text]');page.click('#btn-add-text');page.locator('#te-content').fill('Alya नमस्ते');page.click('#te-done');page.click('#panel-text .panel-close')
    assert page.evaluate('window.__alya.state.texts[0].font')=='NotoSans'
    assert 'NotoSansDevPrev' in page.locator('.ov-text').evaluate('e=>e.style.fontFamily')
    for kind in ['none','fade','rise','blink']:
        page.evaluate('(k)=>{window.__alya.state.texts[0].anim=k}',kind)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-text-'+kind+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));v=next(s for s in j['streams'] if s['codec_type']=='video');assert abs(float(v['duration'])-3)<.1
        subprocess.run(['ffmpeg','-y','-ss','0.7','-i',str(out),'-frames:v','1','/downloads/text-'+kind+'.png','-loglevel','error'],check=True)
        print('PASS text animation',kind)
    browser.close()
server.shutdown()
