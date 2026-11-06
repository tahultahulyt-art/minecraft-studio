"""Size/rotation animated image layers, UI/backup and actual renderer."""
exec(open(__file__.replace('transform-keyframes.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess
from PIL import Image
Image.new('RGB',(160,40),(255,0,0)).save('/tmp/alya-kf-bar.png')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=overlays]');page.set_input_files('#ov-file','/tmp/alya-kf-bar.png');page.wait_for_function('window.__alya.state.overlays.length===1');page.click('#ov-kf-enable')
 for selector,value in [('Size % point 1','10'),('Size % point 2','30'),('Angle point 1','0'),('Angle point 2','90')]:page.locator('[aria-label="'+selector+'"]').fill(value);page.locator('[aria-label="'+selector+'"]').press('Tab')
 page.wait_for_timeout(250);page.screenshot(path='/downloads/transform-keyframes-controls.png');page.click('#ov-done');page.click('#panel-overlays .panel-close');page.evaluate('Object.assign(window.__alya.state.overlays[0],{x:50,y:50,endX:50,endY:50,start:0,end:3});window.__alya.state.overlays[0].keyframes.forEach(k=>{k.x=50;k.y=50;})')
 data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");Path('/tmp/alya-transform-kf.mp4').write_bytes(bytes(data))
 bounds=[]
 for t in [.1,1.5,2.9]:
  path=f'/downloads/transform-kf-{t}.png';subprocess.run(['ffmpeg','-y','-ss',str(t),'-i','/tmp/alya-transform-kf.mp4','-frames:v','1',path,'-loglevel','error'],check=True);im=Image.open(path);coords=[(x,y) for y in range(im.height) for x in range(im.width) if (lambda c:c[0]>180 and c[1]<70 and c[2]<70)(im.getpixel((x,y)))];assert coords,t;bounds.append((max(x for x,y in coords)-min(x for x,y in coords),max(y for x,y in coords)-min(y for x,y in coords)))
 assert bounds[0][0]>bounds[0][1]*2 and bounds[-1][1]>bounds[-1][0]*2,(bounds);assert bounds[-1][1]>bounds[0][0]*2,bounds
 result=page.evaluate("""async()=>{const c=window.__alya.state.clips[0],snap=window.__alya.snapshot(),blob=await AlyaBackup.pack('Transform',snap,[{id:c.id,file:c.file}]),out=await AlyaBackup.unpack(new File([blob],'t.mcs'));return JSON.stringify(out.snapshot.overlays[0].keyframes)===JSON.stringify(window.__alya.state.overlays[0].keyframes);}""");assert result
 # Tall PNG: a fixed width-only padding canvas used to clip/fail on portrait layers.
 Image.new('RGB',(40,160),(255,0,0)).save('/tmp/alya-kf-tall.png');page.click('[data-panel=overlays]');page.set_input_files('#ov-file','/tmp/alya-kf-tall.png');page.wait_for_function('window.__alya.state.overlays.length===2');page.click('#ov-done');page.click('#panel-overlays .panel-close');page.evaluate('()=>{const o=window.__alya.state.overlays[1];o.motion=true;o.size=15;o.keyframes=[{at:0,x:50,y:50,size:10,angle:0},{at:1,x:50,y:50,size:15,angle:90}];}')
 data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");assert len(data)>1000
 print('PASS: size10->30%, angle0->90deg controls, real wasm horizontal-to-vertical growing layer, backup preserved. Sample pixel bounds:',bounds);b.close()
server.shutdown()
