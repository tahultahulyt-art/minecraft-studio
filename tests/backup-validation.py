"""Bounded backup validation rejects malformed fields before persistence."""
exec(open(__file__.replace('backup-validation.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)');page.set_input_files('#file-video',str(ROOT/'test-assets/photo.jpg'));page.wait_for_function('window.__alya.state.clips.length===1')
    result=page.evaluate('''async()=>{
      const state=window.__alya.state,snap=window.__alya.snapshot();
      const blob=await AlyaBackup.pack('Fixture',snap,[{id:state.clips[0].id,file:state.clips[0].file}]);
      const source=JSON.parse(await blob.text());
      const changes={
        version:b=>b.version=99,
        remote:b=>b.media[0].data='https://invalid.example/video.mp4',
        duplicateMedia:b=>b.media.push(b.media[0]),
        duplicateClip:b=>b.snapshot.clips.push(b.snapshot.clips[0]),
        missingMedia:b=>b.media=[],
        reversedTrim:b=>b.snapshot.clips[0].trimStart=4,
        excessiveSpeed:b=>b.snapshot.clips[0].speed=100,
        invalidWidth:b=>b.snapshot.clips[0].w=0,
        mismatch:b=>b.snapshot.clips[0].kind='video',
        tooManyClips:b=>b.snapshot.clips=Array(101).fill(b.snapshot.clips[0]),
        badBase64:b=>b.media[0].data='data:image/png;base64,!bad!',
        oversizedName:b=>b.name='x'.repeat(121)
      };
      const rejected=[];
      for(const [name,change] of Object.entries(changes)){
        const b=structuredClone(source);change(b);let error=false;
        try{await AlyaBackup.unpack(new File([JSON.stringify(b)],'bad.mcs'));}catch(e){error=true;}
        if(error)rejected.push(name);
      }
      const valid=await AlyaBackup.unpack(new File([JSON.stringify(source)],'good.mcs'));
      return {rejected,expected:Object.keys(changes),unchanged:snap===window.__alya.snapshot(),valid:valid.snapshot.clips.length};
    }''')
    assert result['rejected']==result['expected'] and result['unchanged'] and result['valid']==1,result
    print('PASS: twelve malformed archives rejected, valid pack accepted, active project unchanged. Account-free browser test.')
    browser.close()
server.shutdown()
