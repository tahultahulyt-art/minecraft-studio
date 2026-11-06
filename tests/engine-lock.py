"""Engine concurrency rejection and recovery, no cloud calls."""
exec(open(__file__.replace('engine-lock.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    result=page.evaluate("""async()=>{const project=window.__alya.state;const first=Exporter.exportVideo(project,'480p30');let blocked=false;try{await Exporter.extractAudio(project);}catch(e){blocked=e.message.includes('busy');}const blob=await first;const wav=await Exporter.extractAudio(project);return {blocked,video:blob.size,audio:wav.size};}""")
    assert result['blocked'] and result['video']>1000 and result['audio']>1000,result
    result=page.evaluate("""async()=>{try{await Exporter.exclusive(()=>{throw Error('fixture failure')});}catch(e){}let ok=false;await Exporter.exclusive(()=>{ok=true;});return ok;}""")
    assert result,'Engine stayed locked after failure'
    result=page.evaluate("""async()=>{const good=window.__alya.state;const bad={...good,clips:[{...good.clips[0],name:'bad.mp4',kind:'video',file:new File(['broken'],'bad.mp4',{type:'video/mp4'})}]};let failed=false;try{await Exporter.exportVideo(bad,'480p30');}catch(e){failed=true;}const blob=await Exporter.exportVideo(good,'480p30');return failed&&blob.size>1000;}""")
    assert result,'Failed encode returned output or engine could not recover'
    files=page.evaluate("async()=>(await (await Exporter.ensureLoaded()).listDir('/')).filter(e=>!e.isDir).map(e=>e.name)")
    assert not any(n.startswith(('in0.','cap_in','capout.','out.','layer','txt','music.','process_')) for n in files),files
    page.screenshot(path='/downloads/engine-safety.png')
    print('PASS: parallel extraction rejected, first export valid, later extraction valid, lock clears on failure.')
    browser.close()
server.shutdown()
