"""Multi-point position: UI persistence, backup validation, actual wasm pixels."""
exec(open(__file__.replace('keyframes.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,json
from PIL import Image
Image.new('RGB',(80,80),(255,0,0)).save('/tmp/alya-kf-red.png')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':360,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=overlays]');page.set_input_files('#ov-file','/tmp/alya-kf-red.png');page.wait_for_function('window.__alya.state.overlays.length===1');page.click('#ov-kf-enable');page.locator('[aria-label="Time point 2"]').fill('1.5');page.locator('[aria-label="Time point 2"]').press('Tab');page.click('#ov-kf-add');assert 'new time' in page.locator('#ov-kf-status').inner_text()
 # Put a third point at playhead using real timeline click at1s.
 page.click('#ov-done');page.click('#panel-overlays .panel-close');page.evaluate('window.__alya.state.beats=[1];window.__alya.refreshAll()');origin=page.locator('#timeline').bounding_box()['x'];track=page.locator('#beat-track').bounding_box();page.mouse.click(origin+46,track['y']+5);page.click('[data-panel=overlays]');page.locator('#ov-list button').first.click();page.click('#ov-kf-add');page.wait_for_function('window.__alya.state.overlays[0].keyframes.length===3')
 for i,x,y in [(1,20,30),(2,75,70),(3,30,40)]:
  page.locator(f'[aria-label="X point {i}"]').fill(str(x));page.locator(f'[aria-label="X point {i}"]').press('Tab');page.locator(f'[aria-label="Y point {i}"]').fill(str(y));page.locator(f'[aria-label="Y point {i}"]').press('Tab')
 page.select_option('#ov-easing','smooth');page.wait_for_timeout(300);page.screenshot(path='/downloads/keyframes-controls.png');page.click('#ov-done');page.click('#panel-overlays .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.overlays[0].keyframes.length')==3
 # Explicit points for deterministic preview/export comparison; user UI was tested above.
 page.evaluate("Object.assign(window.__alya.state.overlays[0],{keyframes:[{at:0,x:20,y:30},{at:.5,x:75,y:70},{at:1,x:30,y:40}],start:0,end:3,size:10,easing:'smooth',motion:true})")
 data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");out=Path('/tmp/alya-keyframes.mp4');out.write_bytes(bytes(data))
 for t in [.3,1.5,2.7]:
  xy=page.evaluate('(t)=>AlyaMotion.position(window.__alya.state.overlays[0],t)',t);path=f'/downloads/keyframes-{t}.png';subprocess.run(['ffmpeg','-y','-ss',str(t),'-i',str(out),'-frames:v','1',path,'-loglevel','error'],check=True);im=Image.open(path);pixel=im.getpixel((round(854*xy['x']/100),round(480*xy['y']/100)));assert pixel[0]>200 and pixel[1]<70,(t,xy,pixel)
 # Portable roundtrip and malformed point rejection.
 result=page.evaluate("""async()=>{const snap=window.__alya.snapshot(),c=window.__alya.state.clips[0],blob=await AlyaBackup.pack('KF',snap,[{id:c.id,file:c.file}]);const restored=await AlyaBackup.unpack(new File([blob],'a.mcs'));let bad=JSON.parse(await blob.text());bad.snapshot.overlays[0].keyframes[1].at=0;let rejected=false;try{await AlyaBackup.unpack(new File([JSON.stringify(bad)],'bad.mcs'));}catch(e){rejected=true;}return {equal:JSON.stringify(restored.snapshot.overlays[0].keyframes)===JSON.stringify(window.__alya.state.overlays[0].keyframes),rejected};}""");assert result=={'equal':True,'rejected':True},result
 assert not errors,errors
 print('PASS:3-point UI edit/save/reload, smooth preview/export position agreement at3 sampled frames, backup roundtrip and malformed point rejection. Desktop synthetic fixture.')
 browser.close()
server.shutdown()
