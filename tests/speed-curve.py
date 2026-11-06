"""Editable speed curve UI, Undo/persistence and real export timing."""
exec(open(__file__.replace('speed-curve.py','smoke.py')).read().split('with sync_playwright()')[0])
import json,subprocess
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=clips]');page.click('.speed-curve summary')
 for mode,count in [('steps',3),('smooth',12)]:
  for field,val in [('start','1'),('mid','3'),('end','0.7')]:page.fill('#curve-'+field,val)
  page.select_option('#curve-mode',mode);page.click('#btn-speed-curve');assert page.evaluate('window.__alya.state.clips.length')==count
  snapshot=page.evaluate('window.__alya.state.clips.map(c=>({a:c.trimStart,b:c.trimEnd,s:c.speed}))');assert all(snapshot[i]['b']==snapshot[i+1]['a'] for i in range(count-1));expected=sum((c['b']-c['a'])/c['s'] for c in snapshot)
  page.wait_for_timeout(300);page.screenshot(path='/downloads/speed-curve-'+mode+'.png');data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))");out=Path('/tmp/alya-curve-'+mode+'.mp4');out.write_bytes(bytes(data));streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams'];v=next(s for s in streams if s['codec_type']=='video');assert abs(float(v['duration'])-expected)<.5,(expected,v['duration'])
  page.click('#panel-clips .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.clips.length')==count
  # fresh project for next mode, to avoid treating a reload as Undo.
  if mode=='steps':page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=clips]');page.click('.speed-curve summary')
 page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=clips]');page.click('.speed-curve summary');page.click('#btn-speed-curve');page.click('#panel-clips .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips.length')==1
 print('PASS: editable3-section and12-step approximate speed curves, contiguous source coverage, actual wasm durations, reload persistence, Undo. Desktop fixture only.')
 b.close()
server.shutdown()
