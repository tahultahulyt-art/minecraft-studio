"""Missing decode/seek events must not trap import. Mock media events only."""
exec(open(__file__.replace('thumbnail-timeout.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.route('**/js/app.js*',lambda route:route.fulfill(body=(ROOT/'js/app.js').read_text().replace('window.__alya = { state,','window.__alya = { makeThumbs, state,'),content_type='application/javascript'));page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    result=page.evaluate('''async()=>{
      const create=document.createElement.bind(document),timeout=window.setTimeout;
      window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===5000?10:ms,...args);
      let media;
      try{
        document.createElement=(tag,...args)=>{if(tag!=='video')return create(tag,...args);media=new EventTarget();media.currentTime=0;media.videoWidth=320;media.videoHeight=180;return media;};
        const load=await window.__alya.makeThumbs('fixture',2);const loadReleased=media.src==='';
        document.createElement=(tag,...args)=>{if(tag!=='video')return create(tag,...args);media=new EventTarget();media.currentTime=0;media.videoWidth=320;media.videoHeight=180;Object.defineProperty(media,'src',{set(v){this.value=v;if(v)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')))},get(){return this.value}});return media;};
        const seek=await window.__alya.makeThumbs('fixture',2);return {load,seek,loadReleased,seekReleased:media.src===''};
      }finally{document.createElement=create;window.setTimeout=timeout;}
    }''')
    assert result=={'load':[],'seek':[],'loadReleased':True,'seekReleased':True},result
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    assert page.evaluate('window.__alya.state.clips[0].thumbs.length')>0
    print('PASS: missing loadeddata and seeked time out, media released, real video import still has thumbnails. Mock timeout + real desktop decode.')
    browser.close()
server.shutdown()
