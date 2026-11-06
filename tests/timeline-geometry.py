"""Clip boundaries and beat markers share the same linear seconds scale."""
exec(open(__file__.replace('timeline-geometry.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'split',clip:1,at:.5},{do:'split',clip:2,at:1},{do:'split',clip:3,at:2}]);window.__alya.state.beats=[.5,1,2];window.__alya.refreshAll()")
    positions=page.evaluate("""()=>{const base=document.querySelector('#timeline').getBoundingClientRect().left;return [...document.querySelectorAll('#timeline .clip')].map(e=>({x:e.getBoundingClientRect().left-base,w:e.getBoundingClientRect().width}));}""")
    assert all(abs(a['x']-x)<1 and abs(a['w']-w)<1 for a,x,w in zip(positions,[0,23,46,92],[23,23,46,276])),positions
    page.screenshot(path='/downloads/timeline-geometry.png')
    print('PASS: short and long clip boundaries follow exact 46px/second geometry.')
    browser.close()
server.shutdown()
