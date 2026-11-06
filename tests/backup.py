"""Round-trip backup and malformed archive regression. See smoke.py for setup."""
exec(open(__file__.replace('backup.py','smoke.py')).read().split('with sync_playwright()')[0])
import zlib,binascii
# Tiny solid PNG fixture, generated with the standard library.
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
overlay=Path(tempfile.gettempdir())/'mcstudio-overlay.png'
overlay.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',16,16,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xff\x99\xcc\xff'*16)*16))+chunk(b'IEND',b''))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':412,'height':915});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.click('#btn-new-project');page.wait_for_selector('#app:not(.hidden)')
    page.set_input_files('#file-video',str(ROOT/'test-assets/clip1.mp4'));page.wait_for_function('window.__alya.state.clips.length===1')
    page.evaluate("window.__alya.applyOps([{do:'split',clip:1,at:4},{do:'text',content:'Backup Check',start:1,end:3}])")
    page.click('[data-panel=music]');page.set_input_files('#file-music',str(ROOT/'test-assets/music15.mp3'));page.click('#panel-music .panel-close')
    page.click('[data-panel=overlays]');page.set_input_files('#ov-file',str(overlay));page.wait_for_function('window.__alya.state.overlays.length===1');page.click('#ov-done');page.click('#panel-overlays .panel-close')
    before=page.evaluate('JSON.parse(window.__alya.snapshot())')
    page.click('#btn-home');page.wait_for_selector('#home-screen:not(.hidden)')
    with page.expect_download() as d:page.locator('[data-act=backup]').first.click()
    path=Path('/tmp/mcstudio-project.mcs');d.value.save_as(path)
    page.set_input_files('#file-backup',str(path));page.wait_for_function('document.querySelectorAll(".proj-card").length===2')
    page.screenshot(path='/downloads/backup-home.png')
    page.reload();page.locator('.proj-card').first.click();page.wait_for_selector('#app:not(.hidden)')
    after=page.evaluate('JSON.parse(window.__alya.snapshot())')
    for o in before['overlays']:
        defaults={'motion':False,'endX':o['x'],'endY':o['y'],'chroma':False,'keyColor':'#00ff00','similarity':.2}
        for k,v in defaults.items():o.setdefault(k,v)
    assert before==after,'Backup changed project values'
    data=page.evaluate("async()=>Array.from(new Uint8Array(await (await Exporter.exportVideo(window.__alya.state,'480p30')).arrayBuffer()))")
    Path('/tmp/mcstudio-backup-roundtrip.mp4').write_bytes(bytes(data));assert len(data)>1000
    page.click('#btn-home');alerts=[];page.on('dialog',lambda d:(alerts.append(d.message),d.accept()))
    import json
    bad=json.loads(path.read_text());bad['media'][0]['data']='https://invalid.example/media.mp4'
    Path('/tmp/mcstudio-invalid.mcs').write_text(json.dumps(bad))
    page.set_input_files('#file-backup','/tmp/mcstudio-invalid.mcs');page.wait_for_timeout(300)
    assert alerts and 'fail' in alerts[-1],alerts
    assert page.locator('.proj-card').count()==2
    assert not errors,errors
    print('PASS: backup download, import as new project, reload, equal snapshot, wasm export, reject remote media without mutation.')
    browser.close()
server.shutdown()
