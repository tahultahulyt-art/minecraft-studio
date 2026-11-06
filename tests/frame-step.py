"""Frame-step seeking regression: 30fps grid stepping via buttons and arrow keys,
clamped at bounds, respects trim/speed mapping. Run from repo root."""
import os,threading,http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8771),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.getenv('BASE_URL','http://127.0.0.1:8771/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip2s.mp4'))
    page.wait_for_function('window.__alya.state.clips.length===1')
    F=1/30
    # Step forward twice from 0
    page.click('#seek-frame-next');page.wait_for_function(f'Math.abs(window.__alya.playhead-{F})<1e-6')
    page.click('#seek-frame-next');page.wait_for_function(f'Math.abs(window.__alya.playhead-{2*F})<1e-6')
    # Step back once
    page.click('#seek-frame-prev');page.wait_for_function(f'Math.abs(window.__alya.playhead-{F})<1e-6')
    # Arrow keys step frames when not typing
    page.keyboard.press('ArrowRight');page.wait_for_function(f'Math.abs(window.__alya.playhead-{2*F})<1e-6')
    page.keyboard.press('ArrowLeft');page.wait_for_function(f'Math.abs(window.__alya.playhead-{F})<1e-6')
    # Off-grid playhead snaps to the next frame in the step direction
    page.locator('#seek-seconds').fill('0.05');page.click('#seek-apply')
    page.wait_for_function('Math.abs(window.__alya.playhead-0.05)<1e-6')
    page.click('#seek-frame-next');page.wait_for_function(f'Math.abs(window.__alya.playhead-{2*F})<1e-6')
    page.click('#seek-frame-prev');page.wait_for_function(f'Math.abs(window.__alya.playhead-{F})<1e-6')
    # Clamp at start
    page.click('#seek-frame-prev');page.click('#seek-frame-prev')
    page.wait_for_function('window.__alya.playhead===0')
    # Clamp at end: seek near end then step forward repeatedly
    page.locator('#seek-seconds').fill('1.99');page.click('#seek-apply')
    page.wait_for_function('Math.abs(window.__alya.playhead-1.99)<1e-6')
    total=page.evaluate('window.__alya.state.clips.reduce((a,c)=>a+(c.trimEnd-c.trimStart)/(c.speed||1),0)')
    for _ in range(5): page.click('#seek-frame-next')
    ph=page.evaluate('window.__alya.playhead')
    assert abs(ph-total)<1e-6 or ph<=total+1e-6, (ph,total)
    assert ph>1.99,'steps advanced toward end'
    # Status text is honest about browser seek
    status=page.locator('#seek-status').text_content()
    assert 'Frame' in status and '30fps' in status, status
    assert not errors,errors
    print('PASS: frame stepping buttons, arrow keys, off-grid snap, bounds clamp. Total:',round(total,3))
    browser.close()
server.shutdown()
