"""Undo/Redo regression: redo restores edits, new edits clear redo, keyboard shortcuts.
Undo granularity: clip import, text creation and text content edit are separate steps.
Run from repo root. No account access required."""
import os,threading,http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8770),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.getenv('BASE_URL','http://127.0.0.1:8770/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'))
    page.wait_for_function('window.__alya.state.clips.length===1')
    assert page.is_disabled('#btn-redo'),'redo starts disabled'
    page.click('[data-panel=text]');page.click('#btn-add-text');page.locator('#te-content').fill('Redo Check');page.click('#te-done');page.click('#panel-text .panel-close')
    page.wait_for_function("window.__alya.state.texts.length===1&&window.__alya.state.texts[0].content==='Redo Check'")
    # Keyboard undo reverts the content edit; redo restores it
    page.keyboard.press('Control+z');page.wait_for_function("window.__alya.state.texts[0].content==='Apna text'")
    page.keyboard.press('Control+Shift+z');page.wait_for_function("window.__alya.state.texts[0].content==='Redo Check'")
    # Two button undos remove the text layer entirely
    page.click('#btn-undo');page.click('#btn-undo')
    page.wait_for_function('window.__alya.state.texts.length===0')
    assert page.evaluate('window.__alya.redoDepth()')==2
    assert not page.is_disabled('#btn-redo'),'redo enabled after undo'
    # Two redos bring it back with the edited content
    page.click('#btn-redo');page.click('#btn-redo')
    page.wait_for_function("window.__alya.state.texts.length===1&&window.__alya.state.texts[0].content==='Redo Check'")
    assert page.evaluate('window.__alya.redoDepth()')==0
    assert page.is_disabled('#btn-redo'),'redo cleared after redo'
    # Undo, then a NEW edit clears the redo stack
    page.click('#btn-undo');page.click('#btn-undo')
    page.wait_for_function('window.__alya.state.texts.length===0')
    page.click('[data-panel=text]');page.click('#btn-add-text');page.locator('#te-content').fill('Second');page.click('#te-done');page.click('#panel-text .panel-close')
    page.wait_for_function("window.__alya.state.texts.length===1&&window.__alya.state.texts[0].content==='Second'")
    assert page.evaluate('window.__alya.redoDepth()')==0,'new edit clears redo stack'
    assert page.is_disabled('#btn-redo')
    page.wait_for_function("document.querySelector('#save-status').textContent.includes('Saved')",timeout=8000)
    assert not errors,errors
    print('PASS: undo/redo buttons, Ctrl+Z/Ctrl+Shift+Z, redo cleared by new edit')
    browser.close()
server.shutdown()
