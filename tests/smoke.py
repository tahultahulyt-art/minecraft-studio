"""Browser smoke test. Run: pip install playwright; python tests/smoke.py.
Set CHROME to an installed Chromium executable, BASE_URL to test deployment.
No account access required. Fixtures are generated locally; outputs go to /tmp.
"""
import os,threading,http.server,tempfile,wave,struct,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.getenv('BASE_URL','http://127.0.0.1:8765/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'))
    page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('[data-panel=text]');page.click('#btn-add-text');page.locator('#te-content').fill('Smoke Check');page.click('#te-done');page.click('#panel-text .panel-close')
    page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)');page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('window.__alya.state.texts[0].content')=='Smoke Check'
    data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
    out=Path(tempfile.gettempdir())/'mcstudio-smoke.mp4';out.write_bytes(bytes(data));assert len(data)>1000
    page.screenshot(path=str(Path(tempfile.gettempdir())/'mcstudio-smoke.png'))
    assert not errors,errors
    print('PASS: import, edit, persistence, wasm export. Output:',out)
    browser.close()
server.shutdown()
