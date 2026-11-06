"""Manual beat marker review, sorted bounded split, Undo and persistence."""
exec(open(__file__.replace('beat-review.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':360,'height':800});page.goto(base);page.click('#btn-new-project');page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1');page.click('[data-panel=music]')
 for t in ['5','2','3']:page.fill('#beat-time',t);page.click('#beat-add')
 assert page.evaluate('window.__alya.state.beats')==[2,3,5];page.fill('#beat-time','2.01');page.click('#beat-add');assert page.evaluate('window.__alya.state.beats.length')==3
 page.fill('[aria-label="Marker time 3"]','4');page.locator('[aria-label="Marker time 3"]').press('Tab');assert page.evaluate('window.__alya.state.beats')==[2,4,5];page.click('[aria-label="Delete marker 5"]');page.click('[aria-label="Seek marker 2"]');assert page.locator('#time-display').inner_text().startswith('0:02')
 page.wait_for_timeout(300);page.screenshot(path='/downloads/beat-review.png');page.click('#panel-music .panel-close');page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.beats')==[2,4]
 page.click('[data-panel=music]');page.evaluate('window.__alya.state.transitions=true');page.click('#btn-cut-beats');assert page.evaluate('window.__alya.state.clips.length')==1;assert 'OFF' in page.locator('#beat-status').inner_text();page.evaluate('window.__alya.state.transitions=false;window.__alya.state.beats=[4,2,2,2.01,-1,NaN,100]');page.click('#btn-cut-beats');clips=page.evaluate('window.__alya.state.clips.map(c=>({a:c.trimStart,b:c.trimEnd}))');assert len(clips)==3 and all(c['b']>c['a'] for c in clips),clips
 page.click('#panel-music .panel-close');page.click('#btn-undo');assert page.evaluate('window.__alya.state.clips.length')==1
 print('PASS: add/edit/delete/seek markers, duplicate guard, reload, transition split guard, sorted finite split with positive segments, Undo. Desktop fixture.')
 b.close()
server.shutdown()
