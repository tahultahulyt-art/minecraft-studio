"""Per-clip volume preview/export, persistence and portable backup."""
exec(open(__file__.replace('clip-volume.py','smoke.py')).read().split('with sync_playwright()')[0])
import subprocess,audioop
subprocess.run(['ffmpeg','-y','-f','lavfi','-i','color=c=navy:s=160x90:d=1:r=30','-f','lavfi','-i','sine=frequency=700:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','/tmp/volume-fixture.mp4','-loglevel','error'],check=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video','/tmp/volume-fixture.mp4');page.wait_for_function('window.__alya.state.clips.length===1');levels=[]
 for volume in [100,50,0]:
  page.click('[data-panel=clips]');page.fill('#clip-volume',str(volume));page.click('#clip-volume-apply');assert page.evaluate('window.__alya.state.clips[0].volume')==volume/100;assert page.locator('#video-slot video:not([hidden])').first.evaluate('e=>e.volume')==volume/100
  if volume==50:page.locator('#clip-volume').scroll_into_view_if_needed();page.wait_for_timeout(250);page.screenshot(path='/downloads/clip-volume.png')
  page.click('#panel-clips .panel-close');data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");out=Path('/tmp/clip-vol-'+str(volume)+'.mp4');out.write_bytes(bytes(data));raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(out),'-map','0:a','-f','s16le','-ac','1','-ar','16000','-']);levels.append(audioop.rms(raw,2))
 assert .45<levels[1]/levels[0]<.55 and levels[2]==0,levels
 page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips[0].volume')==.5
 result=page.evaluate('''async()=>{const c=window.__alya.state.clips[0],blob=await AlyaBackup.pack('Volume',window.__alya.snapshot(),[{id:c.id,file:c.file}]),src=JSON.parse(await blob.text()),out=await AlyaBackup.unpack(new File([blob],'v.mcs'));src.snapshot.clips[0].volume=2;let rejected=false;try{await AlyaBackup.unpack(new File([JSON.stringify(src)],'bad.mcs'));}catch(e){rejected=true;}return [out.snapshot.clips[0].volume,rejected];}''');assert result==[.5,True],result
 page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.clips[0].volume')==.5
 page.evaluate('window.__alya.state.muted=true;window.__alya.refreshAll()');assert page.locator('#video-slot video').evaluate_all('es=>es.every(e=>e.muted)')
 page.evaluate("()=>{window.__alya.applyOps([{do:'split',clip:1,at:.5}]);window.__alya.state.clips[1].volume=.2;window.__alya.state.clips[1].flipX=true;window.__alya.refreshAll();}");page.click('#btn-play');page.wait_for_function('document.querySelector("#video-slot video")?.volume===.2');page.click('#btn-play');assert page.locator('#video-slot video').evaluate('e=>getComputedStyle(e).transform')=='matrix(-1, 0, 0, 1, 0, 0)'
 print('PASS: per-clip0/50/100% real audio RMS',levels,'backup/reload/Undo and global mute.');b.close()
server.shutdown()
