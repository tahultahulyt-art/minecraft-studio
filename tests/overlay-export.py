"""Actual wasm image layer motion/chroma with finite output and sampled pixels."""
exec(open(__file__.replace('overlay-export.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
from PIL import Image
im=Image.new('RGB',(100,100),(0,255,0));im.paste((255,0,0),(25,25,75,75));im.save('/tmp/alya-chroma.png')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=overlays]');page.set_input_files('#ov-file','/tmp/alya-chroma.png');page.wait_for_function('window.__alya.state.overlays.length===1');page.click('#ov-done');page.click('#panel-overlays .panel-close')
    for chroma in [False,True]:
        page.evaluate('(c)=>Object.assign(window.__alya.state.overlays[0],{chroma:c,keyColor:"#00ff00",similarity:.2,x:25,y:50,endX:75,endY:50,motion:true,start:0,end:3,size:20})',chroma)
        data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
        out=Path('/tmp/alya-overlay-'+str(chroma)+'.mp4');out.write_bytes(bytes(data));j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));v=next(s for s in j['streams'] if s['codec_type']=='video');assert abs(float(v['duration'])-3)<.1
        for t in [.3,2.7]:
            path='/downloads/overlay-'+str(chroma)+'-'+str(t)+'.png';subprocess.run(['ffmpeg','-y','-ss',str(t),'-i',str(out),'-frames:v','1',path,'-loglevel','error'],check=True)
            frame=Image.open(path);x=round(854*(.25+.5*t/3));y=240
            red=frame.getpixel((x,y));edge=frame.getpixel((x-65,y));assert red[0]>180 and red[1]<90,(chroma,t,red)
            assert (edge[1]>180 and edge[0]<90) if not chroma else not (edge[1]>180 and edge[0]<90),(chroma,t,edge)
        print('PASS moving overlay chroma',chroma)
    browser.close()
server.shutdown()
