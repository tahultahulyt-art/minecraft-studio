"""Independent project fade edges affect actual video/audio and survive storage."""
exec(open(__file__.replace('fade-times.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,audioop
from PIL import Image
subprocess.run(['ffmpeg','-y','-f','lavfi','-i','color=c=white:s=160x90:d=2:r=30','-f','lavfi','-i','sine=frequency=700:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','/tmp/fade-times.mp4','-loglevel','error'],check=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video','/tmp/fade-times.mp4');page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=filters]')
 for val in ['','-1','11']:
  page.fill('#fade-in-seconds',val);page.click('#fade-time-apply');assert not page.evaluate('window.__alya.state.fades')
 page.fill('#fade-in-seconds','0');page.fill('#fade-out-seconds','0.5');page.click('#fade-time-apply');assert page.evaluate('[window.__alya.state.fadeIn,window.__alya.state.fadeOut,window.__alya.state.fades]')==[0,.5,True];page.locator('#fade-time-apply').scroll_into_view_if_needed();page.wait_for_timeout(250);page.screenshot(path='/downloads/fade-times.png');page.click('#panel-filters .panel-close');data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");Path('/tmp/fade-times-out.mp4').write_bytes(bytes(data));pixels=[]
 for t in ['0.03','1.90']:
  f='/tmp/fade-times-'+t+'.png';subprocess.run(['ffmpeg','-y','-ss',t,'-i','/tmp/fade-times-out.mp4','-frames:v','1',f,'-loglevel','error'],check=True);pixels.append(Image.open(f).getpixel((427,240))[0])
 assert pixels[0]>240 and pixels[1]<80,pixels
 raw=subprocess.check_output(['ffmpeg','-v','error','-i','/tmp/fade-times-out.mp4','-map','0:a','-f','s16le','-ac','1','-ar','16000','-']);assert audioop.rms(raw[-3200:],2)<audioop.rms(raw[3200:6400],2)*.4
 result=page.evaluate('''async()=>{const c=window.__alya.state.clips[0],blob=await AlyaBackup.pack('Fades',window.__alya.snapshot(),[{id:c.id,file:c.file}]),o=await AlyaBackup.unpack(new File([blob],'f.mcs'));return[o.snapshot.fadeIn,o.snapshot.fadeOut];}''');assert result==[0,.5];page.click('#btn-undo');assert not page.evaluate('window.__alya.state.fades');page.click('[data-panel=filters]');page.fill('#fade-in-seconds','0');page.fill('#fade-out-seconds','.5');page.click('#fade-time-apply');page.click('#panel-filters .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('[window.__alya.state.fadeIn,window.__alya.state.fadeOut]')==[0,.5];print('PASS: independent fade0/.5 edges real video pixels',pixels,'audio taper, invalid bounds, Undo/backup/reload.');b.close()
server.shutdown()
