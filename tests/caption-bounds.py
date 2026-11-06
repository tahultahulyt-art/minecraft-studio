"""Cloud caption timings are clipped to the project; invisible AI text is rejected."""
exec(open(__file__.replace('caption-bounds.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("()=>{AIEdit.getKey=()=> 'fixture';Exporter.extractAudio=async()=>new Blob(['fixture']);AIEdit.transcribeAudio=async()=>({segments:[{start:0,end:1,text:'Hello'},{start:2.8,end:8,text:'End'},{start:9,end:10,text:'Outside'}]});}")
    page.click('[data-panel=text]');page.click('#btn-auto-captions');page.wait_for_function('document.querySelector("#captions-status").textContent.startsWith("2 captions")')
    captions=page.evaluate('window.__alya.state.texts');assert len(captions)==2 and captions[1]['end']==3 and captions[1]['start']==2.8
    page.evaluate("window.__alya.applyOps([{do:'text',content:'Top',start:0,end:1,posY:0}])")
    assert page.evaluate('window.__alya.state.texts.at(-1).posY')==0
    assert page.evaluate("window.__alya.applyOps([{do:'text',content:'Outside',start:10,end:11}]).length")>0
    assert page.evaluate('window.__alya.state.texts.length')==3
    assert page.evaluate("window.__alya.applyOps([{do:'text',content:'Zero',start:1,end:1}]).length")>0
    page.screenshot(path='/downloads/caption-bounds.png')
    print('PASS: out-of-project captions skipped, caption ends clamped, text bounds and posY zero respected. Mocked captions, no cloud calls.')
    browser.close()
server.shutdown()
