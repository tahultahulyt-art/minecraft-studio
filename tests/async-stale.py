"""Mocked delayed cloud results must not edit a changed project. No cloud calls."""
exec(open(__file__.replace('async-stale.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.set_default_timeout(4000);page.goto(base,timeout=5000);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("()=>{AIEdit.getKey=()=> 'fixture';Exporter.extractAudio=async()=>new Blob(['fixture']);AIEdit.transcribeAudio=()=>new Promise(r=>window.finishCaptions=r);}")
    page.click('[data-panel=text]');page.click('#btn-auto-captions');page.wait_for_function('typeof window.finishCaptions==="function"')
    assert page.locator('#btn-auto-captions').is_disabled()
    page.evaluate("window.__alya.applyOps([{do:'filter',name:'warm'}]);window.finishCaptions({segments:[{start:0,end:2,text:'STALE'}]})")
    page.wait_for_function('!document.querySelector("#btn-auto-captions").disabled')
    assert page.evaluate('window.__alya.state.texts.length')==0
    page.click('#panel-text .panel-close');page.click('[data-panel=ai]')
    page.evaluate("()=>{AIEdit.askGemini=()=>new Promise(r=>window.finishPlan=r);}")
    page.locator('#ai-input').fill('warm filter');page.click('#ai-send');page.wait_for_function('typeof window.finishPlan==="function"')
    page.evaluate("window.__alya.applyOps([{do:'filter',name:'cool'}]);window.finishPlan({ops:[{do:'filter',name:'warm'}],reply:'fixture'})")
    page.wait_for_function('document.querySelector("#ai-reply").textContent.includes("edit ho gaya")')
    assert page.locator('#ai-plan').evaluate('e=>e.classList.contains("hidden")')
    assert page.evaluate('window.__alya.state.filter')=='cool'
    page.evaluate("AIEdit.getKey=()=>''")
    page.locator('#ai-input').fill('warm filter');page.click('#ai-send');page.wait_for_selector('#ai-plan:not(.hidden)')
    page.evaluate("window.__alya.applyOps([{do:'filter',name:'bw'}])");page.click('#ai-apply')
    assert page.evaluate('window.__alya.state.filter')=='bw','Ready plan applied after another edit'
    page.screenshot(path='/downloads/async-stale.png')
    print('PASS: delayed caption/plan results rejected after edit; ready plan blocked, controls recover. Mocked, no cloud traffic.')
    browser.close()
server.shutdown()
