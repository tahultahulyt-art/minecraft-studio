"""Crash-recovery journal regression.
A) Journal lifecycle: cleared after a completed save, holds the newest edit in the
   edit-to-save window (trailing write), cleared again after that save.
B) Recovery branch: a journal newer than the IndexedDB record (crash aftermath)
   is restored on open, announced, persisted and cleared.
Run from repo root. No account access required."""
import os,threading,http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8772),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.getenv('BASE_URL','http://127.0.0.1:8772/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'))
    page.wait_for_function('window.__alya.state.clips.length===1')
    page.wait_for_function("document.querySelector('#save-status').textContent.includes('Saved')",timeout=8000)
    page.wait_for_function("localStorage.getItem('ms_recovery')===null")
    pid=page.evaluate("JSON.parse(localStorage.getItem('ms_projects_index'))[0].id")
    # A) journal picks up the newest edit before the debounced save clears it
    page.click('[data-panel=text]');page.click('#btn-add-text');page.locator('#te-content').fill('Crash Edit');page.click('#te-done');page.click('#panel-text .panel-close')
    page.wait_for_function("localStorage.getItem('ms_recovery')!==null&&localStorage.getItem('ms_recovery').includes('Crash Edit')",timeout=5000)
    page.wait_for_function("document.querySelector('#save-status').textContent.includes('Saved')",timeout=8000)
    page.wait_for_function("localStorage.getItem('ms_recovery')===null")
    # B) crash aftermath: journal newer than the IndexedDB record
    page.evaluate("""(pid)=>{const snap=JSON.parse(window.__alya.snapshot());
      snap.texts.push({id:9001,content:'Recovered Line',font:'NotoSans',size:52,color:'#ffffff',posY:75,anim:'none',start:0,end:3});
      localStorage.setItem('ms_recovery',JSON.stringify({id:pid,at:Date.now(),snap:JSON.stringify(snap)}));}""",pid)
    page.evaluate("""async(pid)=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('alya-editing',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
      await new Promise((res,rej)=>{const tx=db.transaction('projects','readwrite');const g=tx.objectStore('projects').get(pid);
      g.onsuccess=()=>{const rec=g.result;rec.updatedAt=1;rec.snap=rec.snap.replace('Crash Edit','Old Edit');tx.objectStore('projects').put(rec);};tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}""",pid)
    page.evaluate("(pid)=>window.__alya.openProject(pid)",pid)  # evaluate awaits the open
    assert page.evaluate("window.__alya.state.texts.some(t=>t.content==='Recovered Line')"),'journal snapshot restored'
    assert not page.evaluate("window.__alya.state.texts.some(t=>t.content==='Old Edit')"),'stale record must not win'
    status=page.locator('#save-status').text_content()
    assert 'Recovered' in status,status
    page.wait_for_function("document.querySelector('#save-status').textContent.includes('Saved')",timeout=8000)
    page.wait_for_function("localStorage.getItem('ms_recovery')===null")
    page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    page.wait_for_function("window.__alya.state.texts.some(t=>t.content==='Recovered Line')")
    assert not errors,errors
    print('PASS: journal lifecycle + stale-record recovery restored, announced, persisted')
    browser.close()
server.shutdown()
