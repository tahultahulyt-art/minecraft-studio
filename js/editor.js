/* Minecraft Studio - export engine (ffmpeg.wasm, fully on-device) */
const Exporter = (() => {
  let ffmpeg = null;
  let loadPromise = null;
  let busy=false;
  function lock(){if(busy)throw Error('Media engine busy. Current export/process complete hone do.');busy=true;return ()=>{busy=false;};}
  async function cleanup(){
    if(!ffmpeg?.loaded)return;
    try{for(const entry of await ffmpeg.listDir('/')){if(!entry.isDir&&/^(in\d+\.|cap_in\d+\.|capout\.wav$|music\.|txt\d+\.txt$|layer\d+\.png$|out\.mp4$|process_)/.test(entry.name)){try{await ffmpeg.deleteFile('/'+entry.name);}catch(e){}}}}catch(e){}
  }
  async function exclusive(work){const unlock=lock();try{return await work();}finally{try{await cleanup();}finally{unlock();}}}


  const FILTERS = {
    none:     { ff: null,                                          css: 'none' },
    bright:   { ff: 'eq=brightness=0.08',                          css: 'brightness(1.12)' },
    contrast: { ff: 'eq=contrast=1.25',                            css: 'contrast(1.25)' },
    vivid:    { ff: 'eq=contrast=1.12:saturation=1.5',             css: 'contrast(1.12) saturate(1.5)' },
    bw:       { ff: 'eq=saturation=0',                             css: 'grayscale(1)' },
    warm:     { ff: 'eq=brightness=0.02:saturation=1.15,colorbalance=rm=.08:bm=-.08', css: 'sepia(.28) saturate(1.3)' },
    cool:     { ff: 'eq=saturation=1.05,colorbalance=rm=-.07:bm=.09', css: 'hue-rotate(-12deg) saturate(1.05) brightness(1.02)' },
    vintage:  { ff: 'eq=contrast=.92:saturation=.65:brightness=.03,vignette=PI/4', css: 'sepia(.4) contrast(.9) saturate(.8)' },
    pixel:    { ff: 'scale=iw/10:ih/10:flags=neighbor,scale=iw*10:ih*10:flags=neighbor', css: 'contrast(1.06) saturate(1.15)' }, /* pixelate: visible only in export */
  };

  const FONT_FILES = {
    NotoSans:            { url: 'fonts/NotoSans-Regular.ttf',      fs: '/fonts/noto.ttf' },
    NotoSansDevanagari:  { url: 'fonts/AlyaMixed-Regular.ttf',    fs: '/fonts/dev.ttf' },
  };

  function textFont(t) { return FONT_FILES[/[\u0900-\u097F]/.test(t.content||'')?'NotoSansDevanagari':t.font] || FONT_FILES.NotoSans; }

  async function ensureLoaded(onLog) {
    if (ffmpeg && ffmpeg.loaded) return ffmpeg;
    if (!loadPromise) {
      loadPromise = (async () => {
        ffmpeg = new FFmpegWASM.FFmpeg();
        if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
        const abs = (p) => new URL(p, location.href).href;
        await ffmpeg.load({
          coreURL: abs('vendor/ffmpeg-core.js'),
          wasmURL: abs('vendor/ffmpeg-core.wasm'),
        });
        return ffmpeg;
      })();
    }
    try{await loadPromise;}catch(e){loadPromise=null;try{ffmpeg?.terminate();}catch(ignored){}ffmpeg=null;throw e;}
    return ffmpeg;
  }

  async function fetchBytes(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed: ' + url);
    return new Uint8Array(await r.arrayBuffer());
  }

  function atempoChain(speed) {
    // returns atempo filter string for arbitrary speed using 0.5..2 steps
    const parts = [];
    let s = speed;
    while (s > 2) { parts.push('atempo=2.0'); s /= 2; }
    while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
    parts.push('atempo=' + s.toFixed(4));
    return parts.join(',');
  }

  function effDur(c) { return (c.trimEnd - c.trimStart) / (c.speed || 1); }
  function totalDur(project) { return project.clips.reduce((t, c) => t + effDur(c), 0); }

  // probe which clips have an audio stream (fast: parse ffmpeg -i log)
  async function probeAudio(ff, names) {
    const hasAudio = {};
    let logs = '';
    const listener = ({ message }) => { logs += message + '\n'; };
    ff.on('log', listener);
    for (const n of names) {
      logs = '';
      try { await ff.exec(['-hide_banner', '-i', n]); } catch (e) { /* exit 1 expected */ }
      hasAudio[n] = /Stream #\d+:\d+.*Audio:/.test(logs);
    }
    ff.off('log', listener);
    return hasAudio;
  }

  function drawtextFor(t, fontFs) {
    const st = t.start.toFixed(2), en = t.end.toFixed(2);
    const y = 'h*' + (t.posY / 100).toFixed(3) + '-text_h/2';
    let alpha = null, yExpr = y;
    if (t.anim === 'fade') {
      alpha = `if(lt(t\\,${st})\\,0\\,if(lt(t\\,${st}+0.5)\\,(t-${st})/0.5\\,1))`;
    } else if (t.anim === 'rise') {
      alpha = `if(lt(t\\,${st})\\,0\\,if(lt(t\\,${st}+0.5)\\,(t-${st})/0.5\\,1))`;
      yExpr = `${y}+30*max(0\\,1-(t-${st})/0.5)`;
    } else if (t.anim === 'blink') {
      alpha = `if(lt(mod(t\\,1.1)\\,0.55)\\,1\\,0.2)`;
    }
    let d = `drawtext=fontfile=${fontFs}:textfile=/txt${t.id}.txt:fontsize=${t.size}` +
      `:fontcolor=${t.color}:borderw=2:bordercolor=black@0.7:x=w*${((t.posX??50)/100).toFixed(3)}-text_w/2:y=${yExpr}` +
      `:enable='between(t\\,${st}\\,${en})'`;
    if (alpha) d += `:alpha='${alpha}'`;
    return d;
  }

  const QUALITIES = {
    '480p30':  { w: 854, h: 480, fps: 30 },
    '720p30':  { w: 1280, h: 720, fps: 30 },
    '720p60':  { w: 1280, h: 720, fps: 60 },
    '1080p60': { w: 1920, h: 1080, fps: 60 },
  };
  async function exportVideo(project, quality, onProgress, onStage) {
    const ff = await ensureLoaded();
    const q = QUALITIES[quality] || QUALITIES['480p30'];
    let W = q.w, H = q.h;
    if(project.canvasRatio==='9:16'){W=q.h;H=q.w;}
    else if(project.canvasRatio==='1:1'){W=q.h;H=q.h;}
    else if(project.canvasRatio==='4:5'){W=q.h;H=Math.round(q.h*1.25/2)*2;}
    const FPS = q.fps;
    const TOT = totalDur(project);
    if (TOT <= 0) throw new Error('No clips');

    onStage && onStage('Loading files...');
    const args = [];
    const fc = [];
    const names = [];

    for (let i = 0; i < project.clips.length; i++) {
      const c = project.clips[i];
      const ext = (c.name.match(/\.(\w+)$/) || [null, c.kind === 'image' ? 'jpg' : 'mp4'])[1].toLowerCase();
      const name = `in${i}.${ext}`;
      names.push({ name, clip: c });
      await ff.writeFile(name, new Uint8Array(await c.file.arrayBuffer()));
      if (c.kind === 'image') {
        args.push('-loop', '1', '-framerate', String(FPS), '-t', (c.trimEnd-c.trimStart).toFixed(3), '-i', name);
      } else {
        args.push('-ss', c.trimStart.toFixed(3), '-to', c.trimEnd.toFixed(3), '-i', name);
      }
    }

    onStage && onStage('Audio check...');
    const audioMap = await probeAudio(ff, names.filter(n => n.clip.kind === 'video').map(n => n.name));

    for (let i = 0; i < project.clips.length; i++) {
      const c = project.clips[i];
      const spd = c.speed || 1;
      const flips=(c.flipX?'hflip,':'')+(c.flipY?'vflip,':'');
      if(project.canvasBlur){
        fc.push(`[${i}:v]${flips}split=2[fg${i}][bg${i}]`);
        fc.push(`[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2[bl${i}]`);
        fc.push(`[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fit${i}]`);
        fc.push(`[bl${i}][fit${i}]overlay=(W-w)/2:(H-h)/2,setsar=1${spd!==1?',setpts=PTS/'+spd:''},fps=${FPS}[v${i}]`);
      }else{
        let vchain = `[${i}:v]${flips}scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
        if (spd !== 1) vchain += `,setpts=PTS/${spd}`;
        vchain += `,fps=${FPS}[v${i}]`;fc.push(vchain);
      }

      if (c.kind === 'video' && audioMap[names[i].name]) {
        let achain = `[${i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;
        if (spd !== 1) achain += ',' + atempoChain(spd);
        if(Number.isFinite(c.volume))achain+=',volume='+Math.max(0,Math.min(1,c.volume)).toFixed(3);
        achain += `[a${i}]`;
        fc.push(achain);
      } else {
        fc.push(`anullsrc=r=48000:cl=stereo:d=${effDur(c).toFixed(3)}[a${i}]`);
      }
    }

    let TOTX = TOT;
    if (project.transitions && project.clips.length > 1) {
      const minDur = Math.min(...project.clips.map(effDur));
      const d = Math.min(transitionSeconds(project), minDur / 2 - 0.05);
      if (d >= 0.2) {
        let vPrev = 'v0', aPrev = 'a0', acc = effDur(project.clips[0]);
        for (let i = 1; i < project.clips.length; i++) {
          const off = Math.max(0.01, acc - d);
          fc.push(`[${vPrev}][v${i}]xfade=transition=${['fade','zoomin','slideleft','slideright','slideup','slidedown','pixelize','hblur','wipeleft','circleopen'].includes(project.transitionType) ? project.transitionType : 'fade'}:duration=${d.toFixed(3)}:offset=${off.toFixed(3)}[x${i}]`);
          fc.push(`[${aPrev}][a${i}]acrossfade=d=${d.toFixed(3)}[xa${i}]`);
          vPrev = `x${i}`; aPrev = `xa${i}`;
          acc = acc + effDur(project.clips[i]) - d;
        }
        fc.push(`[${vPrev}]null[catv]`);
        fc.push(`[${aPrev}]acopy[cata]`);
        TOTX = acc;
      } else {
        let concatIn = '';
        for (let i = 0; i < project.clips.length; i++) concatIn += `[v${i}][a${i}]`;
        fc.push(`${concatIn}concat=n=${project.clips.length}:v=1:a=1[catv][cata]`);
      }
    } else {
      let concatIn = '';
      for (let i = 0; i < project.clips.length; i++) concatIn += `[v${i}][a${i}]`;
      fc.push(`${concatIn}concat=n=${project.clips.length}:v=1:a=1[catv][cata]`);
    }

    // global filter
    let cur = 'catv';
    const f = FILTERS[project.filter] || FILTERS.none;
    if (f.ff) { const filter=project.filter==='pixel'?`scale=ceil(iw/10):ceil(ih/10):flags=neighbor,scale=${W}:${H}:flags=neighbor`:f.ff;fc.push(`[${cur}]${filter}[flt]`); cur = 'flt'; }

    if(AlyaAdjustments.active(project)){const a=AlyaAdjustments.get(project);fc.push(`[${cur}]eq=brightness=${a.brightness}:contrast=${a.contrast}:saturation=${a.saturation}[adjusted]`);cur='adjusted';}

    // fades
    if (project.fades) {
      const fi=Math.min(Number.isFinite(project.fadeIn)?Math.max(0,project.fadeIn):.6,TOTX/4),fo=Math.min(Number.isFinite(project.fadeOut)?Math.max(0,project.fadeOut):.6,TOTX/4),f=[];if(fi>0)f.push(`fade=t=in:st=0:d=${fi}`);if(fo>0)f.push(`fade=t=out:st=${(TOTX-fo).toFixed(3)}:d=${fo}`);
      fc.push(`[${cur}]${f.join(',')||'null'}[fdv]`);
      cur = 'fdv';
    }

    // text overlays
    if (project.texts.length) {
      try { await ff.createDir('/fonts'); } catch (e) {}
      const loadedFonts = {};
      for (const t of project.texts) {
        const fdef = textFont(t);
        if (!loadedFonts[fdef.fs]) {
          await ff.writeFile(fdef.fs, await fetchBytes(fdef.url));
          loadedFonts[fdef.fs] = true;
        }
        await ff.writeFile(`/txt${t.id}.txt`, new TextEncoder().encode(t.content));
      }
      const tscale = 1; // Text times are explicit output seconds, never silently compressed.
      const dt = project.texts.map(t => drawtextFor({ ...t, start: t.start * tscale, end: t.end * tscale }, textFont(t).fs)).join(',');
      fc.push(`[${cur}]${dt}[txv]`);
      cur = 'txv';
    }
    // Image layers follow project timeline timing (same time scale as captions).
    const overlayFiles = [];
    let extraInputs = 0;
    for (const o of (project.overlays || [])) {
      const nm = `layer${extraInputs}.png`;
      const bytes = await fetchBytes(o.data);
      await ff.writeFile(nm, bytes); overlayFiles.push(nm);
      const input = project.clips.length + extraInputs++;
      args.push('-loop', '1', '-i', nm);
      const w = Math.max(2, Math.round(W * o.size / 100));
      const angle = Number(o.angle || 0) * Math.PI / 180;
      const ts = 1; // Image layer times are explicit output seconds.
      const keyFilter=o.chroma?`colorkey=0x${(o.keyColor||'#00ff00').slice(1)}:${Math.max(.01,Math.min(.7,o.similarity||.2))}:0.05,`:'';
      const opacityFilter=Number.isFinite(o.opacity)?'colorchannelmixer=aa='+Math.max(0,Math.min(1,o.opacity)).toFixed(3)+',':'';
      const transformMotion=o.motion&&o.keyframes?.some(k=>k.size!==undefined||k.angle!==undefined);
      if(transformMotion){
        const size=AlyaMotion.expression(o,'size'),rotation=AlyaMotion.expression(o,'angle',180/Math.PI);
        const image=new Image();image.src=o.data;await image.decode();
        const maxSize=Math.max(...AlyaMotion.points(o).map(k=>k.size??o.size)),maxWidth=W*maxSize/100;
        const pad=Math.ceil(Math.hypot(maxWidth,maxWidth*image.naturalHeight/image.naturalWidth)/2)*2+4;
        if(!Number.isFinite(pad)||pad>4096)throw Error('Animated layer too large. Reduce layer size or use480p preview/export.');
        fc.push(`[${input}:v]format=rgba,${keyFilter}${opacityFilter}fps=${FPS},scale=w='max(2,trunc(${W}*(${size})/2)*2)':h=-1:eval=frame,pad=w=${pad}:h=${pad}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0:eval=frame,rotate=angle='${rotation}':ow=${pad}:oh=${pad}:c=none[ov${input}]`);
      }else fc.push(`[${input}:v]format=rgba,${keyFilter}${opacityFilter}scale=${w}:-1,rotate=${angle.toFixed(6)}:ow=rotw(${angle.toFixed(6)}):oh=roth(${angle.toFixed(6)}):c=none[ov${input}]`);
      const xx=AlyaMotion.expression(o,'x'),yy=AlyaMotion.expression(o,'y');
      fc.push(`[${cur}][ov${input}]overlay=x='W*(${xx})-w/2':y='H*(${yy})-h/2':enable='between(t,${(o.start*ts).toFixed(3)},${(o.end*ts).toFixed(3)})':shortest=1[lay${input}]`);
      cur = `lay${input}`;
    }
    fc.push(`[${cur}]format=yuv420p[outv]`);

    // audio chain
    let aCur = 'cata';
    const voiceFilters={high:'asetrate=60000,aresample=48000,atempo=0.8',deep:'asetrate=38400,aresample=48000,atempo=1.25',radio:'highpass=f=350,lowpass=f=3000',echo:'aecho=0.8:0.7:60:0.25'};
    if(voiceFilters[project.voiceEffect]){fc.push(`[${aCur}]${voiceFilters[project.voiceEffect]}[voice]`);aCur='voice';}

    if (project.muted) { fc.push(`[${aCur}]volume=0[mut]`); aCur = 'mut'; }
    let musicInput = -1;
    if (project.music && project.music.file) {
      musicInput = project.clips.length + extraInputs;
      const ext = (project.music.name.match(/\.(\w+)$/) || [null, 'mp3'])[1].toLowerCase();
      const mname = `music.${ext}`;
      await ff.writeFile(mname, new Uint8Array(await project.music.file.arrayBuffer()));
      args.push('-i', mname);
      const musicStart=Number.isFinite(project.music.sourceStart)?Math.max(0,project.music.sourceStart):0;
      fc.push(`[${musicInput}:a]atrim=start=${musicStart.toFixed(3)}:end=${(musicStart+TOTX).toFixed(3)},asetpts=PTS-STARTPTS,volume=${(project.music.volume ?? 0.7).toFixed(2)}[mus]`);
      fc.push(`[${aCur}][mus]amix=inputs=2:duration=first:dropout_transition=0[mx]`);
      aCur = 'mx';
    }
    if (project.fades) {
      const fi=Math.min(Number.isFinite(project.fadeIn)?Math.max(0,project.fadeIn):.6,TOTX/4),fo=Math.min(Number.isFinite(project.fadeOut)?Math.max(0,project.fadeOut):.6,TOTX/4),f=[];if(fi>0)f.push(`afade=t=in:st=0:d=${fi}`);if(fo>0)f.push(`afade=t=out:st=${(TOTX-fo).toFixed(3)}:d=${fo}`);
      fc.push(`[${aCur}]${f.join(',')||'anull'}[outa]`);
    } else {
      fc.push(`[${aCur}]acopy[outa]`);
    }

    args.push('-filter_complex', fc.join(';'),
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-t', TOTX.toFixed(3),
      'out.mp4');

    onStage && onStage('Exporting...');
    let lastT = 0;
    const logListener = ({ message }) => {
      const m = message.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m) {
        const t = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
        if (t !== lastT) { lastT = t; onProgress && onProgress(Math.min(t / TOTX, 0.99), t); }
      }
    };
    ff.on('log', logListener);
    let code = 0;
    try {
      code=await ff.exec(args);
      if(code!==0)throw Error('Encoder exited with code '+code);
    } catch (e) {
      ff.off('log', logListener);
      throw new Error('Export failed: ' + (e && e.message ? e.message : e));
    }
    ff.off('log', logListener);

    onStage && onStage('Preparing video...');
    const data = await ff.readFile('out.mp4');
    onProgress && onProgress(1, TOT);

    // cleanup MEMFS best-effort
    try {
      for (const n of names) await ff.deleteFile(n.name);
      if (musicInput >= 0) await ff.deleteFile('music.' + (project.music.name.match(/\.(\w+)$/))[1].toLowerCase());
      for (const t of project.texts) await ff.deleteFile(`/txt${t.id}.txt`);
      for (const nm of overlayFiles) await ff.deleteFile(nm);
      await ff.deleteFile('out.mp4');
    } catch (e) {}

    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  function transitionSeconds(project){return Number.isFinite(project.transitionSeconds)?Math.max(.2,Math.min(2,project.transitionSeconds)):.5;}
  function outputDuration(project) {
    const total=totalDur(project);
    if(!project.transitions||project.clips.length<2)return total;
    const d=Math.min(transitionSeconds(project),Math.min(...project.clips.map(effDur))/2-.05);
    return d>=.2?total-d*(project.clips.length-1):total;
  }
  return { lock, cleanup, exclusive, outputDuration, exportVideo:(...args)=>exclusive(()=>exportVideo(...args)), ensureLoaded, FILTERS, effDur, totalDur, _probeAudio: probeAudio, _atempo: atempoChain };
})();

/* Audio-only extraction for auto captions (16kHz mono WAV, small + always available) */
Exporter.extractAudio = function(project,onStage){return Exporter.exclusive(async()=>{
  const ff = await Exporter.ensureLoaded();
  const TOT = Exporter.totalDur(project);
  onStage && onStage('Extracting audio...');
  const args = [];
  const fc = [];
  const names = [];
  for (let i = 0; i < project.clips.length; i++) {
    const c = project.clips[i];
    const ext = (c.name.match(/\.(\w+)$/) || [null, c.kind === 'image' ? 'jpg' : 'mp4'])[1].toLowerCase();
    const name = `cap_in${i}.${ext}`;
    names.push(name);
    await ff.writeFile(name, new Uint8Array(await c.file.arrayBuffer()));
    if (c.kind === 'image') continue; // images contribute silence below
    args.push('-ss', c.trimStart.toFixed(3), '-to', c.trimEnd.toFixed(3), '-i', name);
  }
  const videoNames = names.filter((n, idx) => project.clips[idx].kind === 'video');
  const audioMap = await Exporter._probeAudio(ff, videoNames);
  const inputIdx = {}; // clip index -> ffmpeg input index
  let vi = 0;
  for (let i = 0; i < project.clips.length; i++) {
    if (project.clips[i].kind === 'video') { inputIdx[i] = vi; vi++; }
  }
  const parts = [];
  for (let i = 0; i < project.clips.length; i++) {
    const c = project.clips[i];
    const spd = c.speed || 1;
    if (c.kind === 'video' && audioMap[names[i]]) {
      let ch = `[${inputIdx[i]}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;
      if (spd !== 1) ch += ',' + Exporter._atempo(spd);
      ch += `[ca${i}]`;
      fc.push(ch);
    } else {
      fc.push(`anullsrc=r=48000:cl=stereo:d=${Exporter.effDur(c).toFixed(3)}[ca${i}]`);
    }
    parts.push(`[ca${i}]`);
  }
  fc.push(`${parts.join('')}concat=n=${project.clips.length}:v=0:a=1[outa]`);
  args.push('-filter_complex', fc.join(';'), '-map', '[outa]', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-t', TOT.toFixed(3), 'capout.wav');
  const code=await ff.exec(args);if(code!==0)throw Error('Audio extraction failed ('+code+')');
  const data = await ff.readFile('capout.wav');
  try { for (const n of names) await ff.deleteFile(n); await ff.deleteFile('capout.wav'); } catch (e) {}
  return new Blob([data.buffer], { type: 'audio/wav' });
});};
