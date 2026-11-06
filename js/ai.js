/* Minecraft Studio - AI Edit: offline command parser + optional Gemini free-tier bridge.
   Honest design: both paths return the SAME structured ops; the app applies them
   deterministically and shows an undo-able plan. No fake AI claims. */
const AIEdit = (() => {
  const KEY_LS = 'ms_gemini_key';
  const MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

  function parseTime(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase().replace(/s(ec(ond)?s?)?$/, '');
    if (str.includes(':')) {
      const p = str.split(':').map(Number);
      if (p.some(isNaN)) return null;
      return p.reduce((a, b) => a * 60 + b, 0);
    }
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
  }

  const FILTER_WORDS = {
    'black': 'bw', 'white': 'bw', 'bw': 'bw', 'mono': 'bw',
    'bright': 'bright', 'contrast': 'contrast', 'vivid': 'vivid', 'colorful': 'vivid',
    'warm': 'warm', 'garam': 'warm', 'cool': 'cool', 'thanda': 'cool',
    'vintage': 'vintage', 'retro': 'vintage', 'old': 'vintage', 'none': 'none', 'normal': 'none',
    'pixel': 'pixel', 'pixelate': 'pixel', 'blocky': 'pixel',
  };

  /* returns {ops:[], reply} - ops use the shared op vocabulary */
  function parseOffline(raw, clipCount) {
    const text = raw.trim();
    const t = text.toLowerCase();
    const ops = [];
    const notes = [];

    // split "a, b" style compound commands
    const protectedText=text.replace(/black\s+and\s+white/gi,'black white');
    const parts=[];let chunk='',quote=null;
    for(let i=0;i<protectedText.length;i++){
      const ch=protectedText[i];if(ch==='"'||ch==="'"){if(!quote)quote=ch;else if(quote===ch)quote=null;}
      const split=!quote&&protectedText.slice(i).match(/^(?:\s*,\s*|\s+and\s+|\s+aur\s+)/i);
      if(split){if(chunk.trim())parts.push(chunk.trim());chunk='';i+=split[0].length-1;}else chunk+=ch;
    }if(chunk.trim())parts.push(chunk.trim());
    let usedParts = 0;

    for (const part of parts) {
      const p=part.toLowerCase();let m;
      // trim / cut clip N from A to B  (clip number optional, defaults 1)
      if ((m = p.match(/(?:trim|cut|kaato?|short)\s*(?:clip\s*)?(\d+)?\s*(?:from|se)?\s*([\d:.]+s?)\s*(?:to|tak|-)\s*([\d:.]+s?)/))) {
        const clip = m[1] ? +m[1] : 1;
        const a = parseTime(m[2]), b = parseTime(m[3]);
        if (a != null && b != null && b > a) { ops.push({ do: 'trim', clip, start: a, end: b }); usedParts++; continue; }
      }
      // keep only first N seconds (clip 1)
      if ((m = p.match(/(?:keep|rakho)\s*(?:only\s*)?(?:first|shuru(?:wat)?\s*ke?)\s*([\d:.]+s?)/))) {
        const n = parseTime(m[1]);
        if (n != null) { ops.push({ do: 'trim', clip: 1, start: 0, end: n }); usedParts++; continue; }
      }
      // caption / text "..." from A to B
      if ((m = p.match(/(?:add\s+)?(?:caption|text|likho|likhna)\s+["'“”]?(.+?)["'“”]?(?:\s+(?:from|se)\s+([\d:.]+s?)\s+(?:to|tak)\s+([\d:.]+s?))?$/))) {
        let content = (part.match(/["'“”](.+?)["'“”]/) || [null, m[1]])[1];
        if (content === m[1]) { const ix = part.toLowerCase().indexOf(m[1]); if (ix >= 0) content = part.substr(ix, m[1].length); } // original case rakho
        const start = m[2] != null ? parseTime(m[2]) : 0;
        const end = m[3] != null ? parseTime(m[3]) : start + 3;
        ops.push({ do: 'text', content, start, end: Math.max(end, start + 0.5) }); usedParts++; continue;
      }
      // filter
      if ((m = p.match(/(?:filter|effect)\s+([a-z ]+?)$/)) || (m = p.match(/^([a-z ]+?)\s+filter$/))) {
        const words = m[1].trim().split(/\s+/);
        for (const w of words) if (FILTER_WORDS[w]) { ops.push({ do: 'filter', name: FILTER_WORDS[w] }); usedParts++; break; }
        continue;
      }
      if (/black\s*and\s*white/.test(p)) { ops.push({ do: 'filter', name: 'bw' }); usedParts++; continue; }
      // mute / unmute
      if (/^(mute|sound band|awaz band|awaaz band)/.test(p)) { ops.push({ do: 'mute', value: true }); usedParts++; continue; }
      if (/^(unmute|sound on|awaz on|awaaz wapas)/.test(p)) { ops.push({ do: 'mute', value: false }); usedParts++; continue; }
      // speed [Nx] [clip M]
      if ((m = p.match(/clip\s*(\d+)\s*(?:ki\s*)?speed\s+(\d+(?:\.\d+)?)/))) {
        const s = parseFloat(m[2]);
        if (s >= 0.5 && s <= 4) { ops.push({ do: 'speed', clip: +m[1], value: s }); usedParts++; continue; }
      }
      if ((m = p.match(/speed\s+(\d+(?:\.\d+)?)\s*x?\s*(?:clip\s*(\d+))?/))) {
        const s = parseFloat(m[1]), clip = m[2] ? +m[2] : 1;
        if (s >= 0.5 && s <= 4) { ops.push({ do: 'speed', clip, value: s }); usedParts++; continue; }
      }
      // delete clip N
      if ((m = p.match(/(?:delete|remove|hatao|nikalo)\s*(?:clip\s*)?(\d+)/))) {
        ops.push({ do: 'delete', clip: +m[1] }); usedParts++; continue;
      }
      // transitions / crossfade
      if (/transition|crossfade/.test(p)) { ops.push({ do: 'transitions', value: !/off|hatao|band/.test(p) }); usedParts++; continue; }
      // fades
      if (/fade/.test(p)) { ops.push({ do: 'fades', value: !/off|hatao|band/.test(p) }); usedParts++; continue; }
      // music volume
      if ((m = p.match(/(?:music\s*)?volume\s+(\d+)\s*%?/))) {
        ops.push({ do: 'musicvol', value: Math.min(100, Math.max(0, +m[1])) }); usedParts++; continue;
      }
      // template
      if ((m = p.match(/(?:template|style)\s+(\w+)/))) {
        ops.push({ do: 'template', name: m[1] }); usedParts++; continue;
      }
      notes.push(p);
    }

    if (!ops.length) {
      return { ops: [], reply: 'Ye command samajh nahi aayi. Neeche "Kya kya samajhta hai?" mein examples hain. AI key lagao to free-form English/Hindi bhi chalegi.' };
    }
    let reply = ops.length + ' kaam samjha';
    if (notes.length) reply += ', par ye nahi samjha: "' + notes.join('", "') + '"';
    return { ops, reply };
  }

  const OP_SCHEMA = `You are the edit planner for a mobile video editor. Convert the user's instruction into a JSON array of edit operations. Reply with ONLY the JSON array, no markdown, no explanation.
Allowed operations:
{"do":"trim","clip":N,"start":S,"end":E}         (keep only S to E seconds of clip N, source seconds)
{"do":"split","clip":N,"at":S}                   (split clip N at S seconds into its trimmed region)
{"do":"delete","clip":N}
{"do":"speed","clip":N,"value":0.5..4}
{"do":"text","content":"...","start":S,"end":E,"color":"#hex","posY":5-90}
{"do":"removeText","index":N}
{"do":"filter","name":"none|bright|contrast|vivid|bw|warm|cool|vintage|pixel"}
{"do":"mute","value":true|false}
{"do":"fades","value":true|false}
{"do":"musicvol","value":0-100}
{"do":"transitions","value":true|false}
{"do":"template","name":"minecraft|pixelcraft|nether|end|speedrun|cinematic|retro|clean|party"}
Rules: clip numbers are 1-based. Times are seconds. If the instruction is unclear, return []. If it asks for something impossible in this editor, return [].`;

  function validateOps(ops){
    if(!Array.isArray(ops)||ops.length>100)throw Error('Invalid edit plan');
    const number=(v)=>typeof v==='number'&&Number.isFinite(v);
    const range=(v,a,b)=>number(v)&&v>=a&&v<=b;
    const optional=(v,a,b)=>v===undefined||range(v,a,b);
    for(const o of ops){
      if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Invalid edit operation');
      if(['trim','split','delete','speed'].includes(o.do)&&(!Number.isInteger(o.clip)||o.clip<1))throw Error('Invalid clip number');
      let ok=false;
      switch(o.do){
        case 'trim':ok=range(o.start,0,86400)&&range(o.end,o.start+.01,86400);break;
        case 'split':ok=range(o.at,0,86400);break;
        case 'delete':ok=true;break;
        case 'speed':ok=range(o.value,.5,4);break;
        case 'text':ok=typeof o.content==='string'&&o.content.length>0&&o.content.length<=10000&&optional(o.start,0,86400)&&optional(o.end,(o.start??0)+.01,86400)&&optional(o.size,10,300)&&optional(o.posY,0,100)&&(o.color===undefined||/^#[a-fA-F0-9]{6}$/.test(o.color))&&(o.anim===undefined||['none','fade','rise','blink'].includes(o.anim));break;
        case 'removeText':ok=Number.isInteger(o.index)&&o.index>0;break;
        case 'filter':case 'template':ok=typeof o.name==='string'&&o.name.length<50;break;
        case 'mute':case 'fades':case 'transitions':ok=typeof o.value==='boolean';break;
        case 'musicvol':ok=range(o.value,0,100);break;
      }
      if(!ok)throw Error('Invalid '+String(o.do).slice(0,30)+' operation');
    }
    return ops;
  }
  async function askGemini(instruction, projectSummary, key) {
    const body = {
      contents: [{ parts: [{ text: OP_SCHEMA + '\n\nCurrent project:\n' + projectSummary + '\n\nUser instruction: ' + instruction }] }],
      generationConfig: { temperature: 0.1 },
    };
    let lastErr = null;
    for (const model of MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          lastErr = new Error((e.error && e.error.message) || ('HTTP ' + r.status));
          if (r.status === 404) continue; // try next model
          throw lastErr;
        }
        const j = await r.json();
        const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
        const clean = txt.replace(/```json|```/g, '').trim();
        const ops = JSON.parse(clean);
        if (!Array.isArray(ops)) return { ops: [], reply: 'AI ne koi valid plan nahi diya. Dobara try karo.' };
        validateOps(ops);
        if (!ops.length) return { ops: [], reply: 'AI ko ye request is editor ke features mein convert nahi ho payi.' };
        return { ops, reply: 'AI plan tayyar hai. Check karke Apply dabao.' };
      } catch (e) {
        if (e instanceof SyntaxError) return { ops: [], reply: 'AI ka reply parse nahi hua. Dobara try karo.' };
        lastErr = e;
      }
    }
    const msg = String(lastErr && lastErr.message || lastErr);
    if (/quota|rate|429/i.test(msg)) return { ops: [], reply: 'Free tier ki limit pahunch gayi. Thodi der baad try karo. (Free tier: per-minute requests limited hoti hain)' };
    if (/API key|403|400/.test(msg)) return { ops: [], reply: 'API key mein problem hai. Settings mein key check karo (aistudio.google.com/apikey se banai ho).' };
    return { ops: [], reply: 'AI se connect nahi ho paya: ' + msg };
  }

  async function blobToBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    const CH = 8192;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
    return btoa(bin);
  }

  const CAPTION_PROMPT = `Transcribe this audio and return ONLY a JSON array of caption segments: [{"start":0.0,"end":2.5,"text":"..."}].
Rules: 2-6 words per segment, segments 1-4 seconds long, times in seconds relative to the audio start, no gaps longer than the speech. If the speech is Hindi, write Devanagari. If English, write English. If Hinglish, write natural Roman Hindi. No music/lyrics guessing when there is no speech: return [].`;

  async function transcribeAudio(wavBlob, key) {
    const b64 = await blobToBase64(wavBlob);
    const body = {
      contents: [{ parts: [
        { inline_data: { mime_type: 'audio/wav', data: b64 } },
        { text: CAPTION_PROMPT },
      ] }],
      generationConfig: { temperature: 0 },
    };
    let lastErr = null;
    for (const model of MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          lastErr = new Error((e.error && e.error.message) || ('HTTP ' + r.status));
          if (r.status === 404) continue;
          throw lastErr;
        }
        const j = await r.json();
        const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
        const clean = txt.replace(/```json|```/g, '').trim();
        const segs = JSON.parse(clean);
        if (!Array.isArray(segs)) throw new Error('bad json');
        return { segments: segs.slice(0,2000).filter(x => x&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.start>=0&&x.end>x.start&&x.end<=86400&&typeof x.text==='string'&&x.text.length>0&&x.text.length<=1000) };
      } catch (e) {
        if (e instanceof SyntaxError || e.message === 'bad json') return { error: 'AI ka transcript samajh nahi aaya. Dobara try karo.' };
        lastErr = e;
      }
    }
    const msg = String(lastErr && lastErr.message || lastErr);
    if (/quota|rate|429/i.test(msg)) return { error: 'Free tier limit aa gayi. Thodi der baad try karo.' };
    if (/API key|403|400/.test(msg)) return { error: 'API key mein problem hai. Settings mein check karo.' };
    return { error: 'Captions fail: ' + msg };
  }

  function getKey() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY_LS, k) : localStorage.removeItem(KEY_LS); } catch (e) {} }

  const HELP = `Offline commands (key ke bina chalte hain):
• trim clip 1 from 2s to 6s
• add caption Hello from 1s to 4s
• black and white filter / warm filter
• mute / unmute
• speed 2x clip 2
• delete clip 3
• fade add / fade off
• music volume 50
• template cinematic

Gemini AI key lagao to free-form likh sakte ho, jaise:
"pehli clip aadhi karo, retro look do, aur end mein thanks likho"`;

  return { validateOps, parseOffline, askGemini, transcribeAudio, getKey, setKey, HELP, parseTime };
})();
