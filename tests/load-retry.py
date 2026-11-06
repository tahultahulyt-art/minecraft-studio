"""First engine download failure can be retried without reloading the project."""
exec(open(__file__.replace('load-retry.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.route('**/vendor/ffmpeg-core.wasm',lambda r:r.abort())
    failed=page.evaluate("async()=>{try{await Exporter.exportVideo(window.__alya.state,'480p30');return false;}catch(e){return true;}}")
    assert failed
    page.unroute('**/vendor/ffmpeg-core.wasm')
    size=page.evaluate("async()=>(await Exporter.exportVideo(window.__alya.state,'480p30')).size")
    assert size>1000,size
    print('PASS: blocked initial engine download, later export succeeds without project reload.')
    browser.close()
server.shutdown()
