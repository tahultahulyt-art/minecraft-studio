"""Index reconstruction and visible save failure/retry, no account access."""
exec(open(__file__.replace('storage.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.click('#btn-home');page.wait_for_selector('.proj-card')
    page.evaluate("localStorage.setItem('ms_projects_index','broken json')");page.reload();page.wait_for_selector('.proj-card')
    page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)');assert page.evaluate('window.__alya.state.clips.length')==1
    page.evaluate("window.originalOpen=indexedDB.open.bind(indexedDB);indexedDB.open=()=>{throw Error('Storage fixture failure')};window.__alya.applyOps([{do:'filter',name:'vivid'}])")
    page.wait_for_function('document.querySelector("#save-status").textContent==="Save failed"')
    page.screenshot(path='/downloads/storage-failed.png')
    page.evaluate("indexedDB.open=window.originalOpen;window.__alya.applyOps([{do:'filter',name:'warm'}])")
    page.wait_for_function('document.querySelector("#save-status").textContent==="Saved on device"')
    page.screenshot(path='/downloads/storage-recovered.png')
    page.reload();page.wait_for_selector('.proj-card');page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    assert page.evaluate('window.__alya.state.filter')=='warm'
    print('PASS: corrupt index rebuild, visible save failure, retry succeeds, saved edit survives reload.')
    browser.close()
server.shutdown()
