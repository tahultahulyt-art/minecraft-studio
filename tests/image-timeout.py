"""A photo decoder that never responds must release import and Home."""
exec(open(__file__.replace('image-timeout.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.evaluate('''()=>{window.originalImage=window.Image;window.originalTimeout=window.setTimeout;window.Image=class{set src(v){this.value=v;}get src(){return this.value;}};window.setTimeout=(fn,ms,...a)=>window.originalTimeout(fn,ms===15000?20:ms,...a);}''')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('document.querySelector("#ai-reply").textContent.includes("load nahi")')
    assert page.evaluate('window.__alya.state.clips.length')==0
    assert not page.locator('#btn-home').is_disabled()
    assert page.locator('#stage-spinner').evaluate('e=>e.classList.contains("hidden")')
    page.evaluate('window.Image=window.originalImage;window.setTimeout=window.originalTimeout')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    print('PASS: stalled image import times out and unlocks UI; next real image import works. Mock timeout, desktop fixture.')
    browser.close()
server.shutdown()
