"""Offline command examples and quoted compound captions."""
exec(open(__file__.replace('offline-parser.py','smoke.py')).read().split('with sync_playwright()')[0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROME','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    page=browser.new_page();page.goto(base)
    cases={'trim clip 1 from 2s to 6s':[{'do':'trim','clip':1,'start':2,'end':6}], 'black and white filter':[{'do':'filter','name':'bw'}], 'speed 2x clip 2':[{'do':'speed','clip':2,'value':2}], 'add caption "Hello, and Welcome" from 1s to 4s, warm filter':[{'do':'text','content':'Hello, and Welcome','start':1,'end':4},{'do':'filter','name':'warm'}], 'text "First" aur text "Second"':[{'do':'text','content':'First','start':0,'end':3},{'do':'text','content':'Second','start':0,'end':3}]}
    for command,expected in cases.items():
        actual=page.evaluate('s=>AIEdit.parseOffline(s,3).ops',command);assert actual==expected,(command,actual)
        assert page.evaluate('ops=>{AIEdit.validateOps(ops);return true}',actual)
    assert not page.evaluate('AIEdit.parseOffline("speed 5x",1).ops.length')
    print('PASS: trim, B&W, speed, quoted comma/and caption and multiple quoted captions.')
    browser.close()
server.shutdown()
