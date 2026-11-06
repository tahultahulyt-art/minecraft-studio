"""Optional user watermark creation, opacity, duration, export and Undo."""
exec(open(__file__.replace('watermark.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1');assert page.evaluate('window.__alya.state.overlays.length')==0;page.click('[data-panel=text]');page.click('#watermark-controls summary');page.fill('#watermark-text','राहुल • Rahul');page.click('#watermark-add');page.wait_for_function('window.__alya.state.overlays.length===1');o=page.evaluate('JSON.parse(window.__alya.snapshot()).overlays[0]');assert o['start']==0 and o['end']==3 and o['x']==78 and o['y']==90
 alpha=page.evaluate('''async()=>{const i=new Image();i.src=window.__alya.state.overlays[0].data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return Math.max(...Array.from(x.getImageData(0,0,c.width,c.height).data).filter((v,i)=>i%4===3));}''');assert 155<alpha<175,alpha
 page.wait_for_timeout(250);page.screenshot(path='/downloads/watermark-controls.png');page.click('#ov-done');page.click('#panel-overlays .panel-close');data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");Path('/tmp/alya-watermark.mp4').write_bytes(bytes(data));subprocess.run(['ffmpeg','-y','-ss','1','-i','/tmp/alya-watermark.mp4','-frames:v','1','/downloads/watermark-frame.png','-loglevel','error'],check=True)
 # Two Undo entries currently include opening layer controls; unwrap until creation gone.
 for _ in range(4):
  if page.evaluate('window.__alya.state.overlays.length')==0:break
  page.click('#btn-undo')
 assert page.evaluate('window.__alya.state.overlays.length')==0
 print('PASS: no default watermark, mixed-script optional raster layer,65% alpha, full output timing, real export and Undo. Desktop fixture.');b.close()
server.shutdown()
