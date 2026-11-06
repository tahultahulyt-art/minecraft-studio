/* Minecraft Studio - app state, timeline UI, live preview sequencer, ops, AI wiring */
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- state ---------- */
const state = {
  clips: [],        // {id, kind:'video'|'image', file, name, srcDuration, trimStart, trimEnd, speed, url, thumbs[], w,h}
  overlays: [], transitionSeconds:.5,transitionType: 'fade', canvasRatio: '16:9', canvasBlur: false, voiceEffect: 'none', beats: [],
  texts: [],        // {id, content, font, size, color, posY, anim, start, end}
  music: null,      // {file, name, volume(0..1), url}
  muted: false,
  adjustments:{brightness:0,contrast:1,saturation:1},
  filter: 'none',
  fades: false, fadeIn:.6,fadeOut:.6,
  transitions: false,
};
let nextId = 1;
const undoStack = [];
const redoStack = [];
let selectedClipId = null;
let playhead = 0;
let playing = false;
let editingTextId = null;
let textEditChanged=false;
let exportQuality = '480';

let PX_PER_SEC = 46;
const ZOOM_LEVELS=[23,46,92,184,368];
let mediaUrls=new WeakMap();
const projectUrls=new Set();
function mediaUrl(file){let url=mediaUrls.get(file);if(!url){url=URL.createObjectURL(file);mediaUrls.set(file,url);projectUrls.add(url);}return url;}
function releaseProjectMedia(){
  pause();[vA,vB,musicEl].forEach(el=>{el.removeAttribute('src');el.load();delete el.dataset.clipId;});imgEl.removeAttribute('src');
  projectUrls.forEach(url=>URL.revokeObjectURL(url));projectUrls.clear();mediaUrls=new WeakMap();
  Object.keys(fileStore).forEach(k=>delete fileStore[k]);Object.keys(thumbStore).forEach(k=>delete thumbStore[k]);
}
const fileStore = {}; // id -> File (kept so undo after delete still works)

/* ---------- helpers ---------- */
const effDur = (c) => (c.trimEnd - c.trimStart) / (c.speed || 1);
const totalDur = () => state.clips.reduce((t, c) => t + effDur(c), 0);
const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function snapshot() {
  return JSON.stringify({
    clips: state.clips.map(c => ({ ...c, file: undefined, url: undefined, thumbs: undefined })),
    overlays: state.overlays, transitionSeconds:state.transitionSeconds,transitionType: state.transitionType, canvasRatio: state.canvasRatio, canvasBlur: state.canvasBlur, voiceEffect: state.voiceEffect, beats: state.beats,
    texts: state.texts, music: state.music ? { name: state.music.name, volume: state.music.volume, sourceStart:state.music.sourceStart||0, fileId: state.music.fileId } : null,
    muted: state.muted, adjustments:state.adjustments, filter: state.filter, fades: state.fades, fadeIn:state.fadeIn,fadeOut:state.fadeOut, transitions: state.transitions,
  });
}
function restore(snap) {
  const j = JSON.parse(snap);
  state.clips = j.clips.map(c => {
    const file = fileStore[c.id];
    return { ...c, file, url: mediaUrl(file), thumbs: c.kind==='image'?[mediaUrl(file)]:(thumbStore[c.id] || []) };
  });
  state.overlays = j.overlays || [];state.transitionSeconds=Number.isFinite(j.transitionSeconds)?j.transitionSeconds:.5; state.transitionType = j.transitionType || 'fade';state.canvasRatio=j.canvasRatio||'16:9';state.canvasBlur=!!j.canvasBlur;state.voiceEffect=j.voiceEffect||'none';state.beats=j.beats||[];
  state.texts = j.texts; state.music = j.music ? { ...j.music, file: fileStore[j.music.fileId], url: mediaUrl(fileStore[j.music.fileId]) } : null;
  state.adjustments=AlyaAdjustments.get(j);state.muted = j.muted; state.filter = j.filter; state.fades = j.fades;state.fadeIn=Number.isFinite(j.fadeIn)?j.fadeIn:.6;state.fadeOut=Number.isFinite(j.fadeOut)?j.fadeOut:.6; state.transitions = !!j.transitions;
  if (selectedClipId && !state.clips.some(c => c.id === selectedClipId)) selectedClipId = null;
  playhead = Math.min(playhead, totalDur());
  refreshAll();
}
function pruneUndoMedia(){
  const keep=new Set(state.clips.map(c=>c.id));if(state.music)keep.add(state.music.fileId);
  for(const snap of [...undoStack,...redoStack]){const j=JSON.parse(snap);j.clips.forEach(c=>keep.add(c.id));if(j.music)keep.add(j.music.fileId);}
  for(const k of Object.keys(fileStore)){if(!keep.has(Number(k))){delete fileStore[k];delete thumbStore[k];}}
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 40) {undoStack.shift();pruneUndoMedia();} redoStack.length = 0; $('#btn-undo').disabled = false; $('#btn-redo').disabled = true; scheduleSave(); }
const thumbStore = {};

/* ---------- fonts for preview ---------- */
let previewFontsPromise=null;
function loadPreviewFonts() {
  if(!previewFontsPromise)previewFontsPromise=(async()=>{
    const f1=new FontFace('NotoSansPrev','url(fonts/NotoSans-Regular.ttf)');
    const f2=new FontFace('NotoSansDevPrev','url(fonts/AlyaMixed-Regular.ttf)');
    await Promise.all([f1.load(),f2.load()]);document.fonts.add(f1);document.fonts.add(f2);
  })().catch(e=>{previewFontsPromise=null;throw e;});
  return previewFontsPromise;
}

/* ---------- import ---------- */
let importingMedia=false;
async function importFiles(fileList) {
  const files=Array.from(fileList);if(!files.length||importingMedia)return;
  importingMedia=true;$('#btn-home').disabled=true;showSpinner('Clips import ho rahi hain...');pushUndo();
  let failed=0;
  try{
    for(const file of files){
      const isImg=file.type.startsWith('image/');
      if(!isImg&&!file.type.startsWith('video/')){failed++;continue;}
      const clip={id:nextId++,kind:isImg?'image':'video',file,name:file.name,url:mediaUrl(file),speed:1,thumbs:[]};
      try{
        if(isImg){const dim=await imageDims(clip.url);clip.w=dim.w;clip.h=dim.h;clip.srcDuration=3;clip.trimStart=0;clip.trimEnd=3;clip.thumbs=[clip.url];}
        else{const meta=await videoMeta(clip.url);if(!Number.isFinite(meta.duration)||meta.duration<=0||!Number.isFinite(meta.w)||!Number.isFinite(meta.h)||meta.w<=0||meta.h<=0)throw Error('Invalid video metadata');clip.srcDuration=meta.duration;clip.w=meta.w;clip.h=meta.h;clip.trimStart=0;clip.trimEnd=meta.duration;clip.thumbs=await makeThumbs(clip.url,meta.duration);}
        fileStore[clip.id]=file;thumbStore[clip.id]=clip.thumbs;state.clips.push(clip);
      }catch(e){failed++;URL.revokeObjectURL(clip.url);projectUrls.delete(clip.url);mediaUrls.delete(file);console.warn('Media import failed',e);}
    }
    if(state.clips.length){$('#empty-state').classList.add('hidden');selectedClipId=state.clips[0].id;}
    if(failed)flashReply(failed+' file(s) load nahi hui. Valid MP4/MOV/video ya photo try karo.');
    refreshAll();scheduleSave();
  }finally{importingMedia=false;$('#btn-home').disabled=false;hideSpinner();}
}
function imageDims(url) {
  return new Promise((res, rej) => {
    const i = new Image();let timer;
    const done=(error)=>{clearTimeout(timer);i.onload=null;i.onerror=null;const dim={w:i.naturalWidth,h:i.naturalHeight};i.src='';error?rej(error):res(dim);};
    i.onload=()=>done(i.naturalWidth>0&&i.naturalHeight>0?null:Error('Invalid image dimensions'));
    i.onerror=()=>done(Error('Image load failed'));
    timer=setTimeout(()=>done(Error('Image load timeout')),15000);
    i.src=url;
  });
}
function videoMeta(url) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    const to = setTimeout(() => { v.src = ''; rej(new Error('video metadata timeout')); }, 15000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { clearTimeout(to); const d = { duration: v.duration, w: v.videoWidth, h: v.videoHeight }; v.src = ''; res(d); };
    v.onerror = () => { clearTimeout(to); rej(new Error('video load failed')); };
    v.src = url;
  });
}
async function makeThumbs(url, duration) {
  const N = Math.max(2, Math.min(6, Math.round(duration / 2)));
  const v = document.createElement('video');
  v.preload = 'auto'; v.muted = true; v.playsInline = true;
  const thumbs = [];
  function waitMedia(event, action) {
    return new Promise((resolve,reject)=>{
      let timer;
      const done=(error)=>{clearTimeout(timer);v.removeEventListener(event,ok);v.removeEventListener('error',fail);error?reject(error):resolve();};
      const ok=()=>done(),fail=()=>done(Error('Thumbnail decode failed'));
      v.addEventListener(event,ok,{once:true});v.addEventListener('error',fail,{once:true});
      timer=setTimeout(()=>done(Error('Thumbnail decode timeout')),5000);
      try{action();}catch(e){done(e);}
    });
  }
  try {
    await waitMedia('loadeddata',()=>{v.src=url;});
    const h = 60, w = Math.round(v.videoWidth * h / v.videoHeight) || 106;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    for (let i = 0; i < N; i++) {
      const t = Math.min((i + 0.5) * duration / N, duration - 0.05);
      if(Math.abs(v.currentTime-t)>.001)await waitMedia('seeked',()=>{v.currentTime=t;});
      ctx.drawImage(v, 0, 0, w, h);
      thumbs.push(c.toDataURL('image/jpeg', 0.6));
    }
  } catch (e) { console.warn('thumbs failed', e); }
  finally { v.src = ''; }
  return thumbs;
}

/* ---------- timeline UI ---------- */
function renderTimeline() {
  const tl = $('#timeline');
  tl.innerHTML = '';
  for (const c of state.clips) {
    const el = document.createElement('div');
    el.className = 'clip' + (c.id === selectedClipId ? ' sel' : '');
    el.dataset.id = c.id;
    el.style.width = Math.max(1, effDur(c) * PX_PER_SEC) + 'px';
    const thumbs = c.thumbs.length ? c.thumbs : [null];
    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;height:100%;width:100%;overflow:hidden;pointer-events:none;';
    thumbs.forEach(t => {
      if (t) { const img = document.createElement('img'); img.src = t; strip.appendChild(img); }
    });
    el.appendChild(strip);
    const idx = state.clips.indexOf(c) + 1;
    el.insertAdjacentHTML('beforeend',
      `<span class="clip-label">${idx}. ${c.kind === 'image' ? '🖼' : '🎬'}</span>` +
      `<span class="clip-dur">${effDur(c).toFixed(1)}s</span>` +
      (c.speed !== 1 ? `<span class="clip-spd">${c.speed}x</span>` : ''));
    const hl = document.createElement('div'); hl.className = 'trim-handle left'; hl.textContent = '◀';
    const hr = document.createElement('div'); hr.className = 'trim-handle right'; hr.textContent = '▶';
    el.appendChild(hl); el.appendChild(hr);
    attachClipGestures(el, c, hl, hr);
    tl.appendChild(el);
  }
  updatePlayheadUI();
  $('#time-display').textContent = fmt(playhead) + ' / ' + fmt(totalDur());
}
function attachClipGestures(el, clip, hl, hr) {
  let mode = null, startX = 0, startTrim = 0, holdTimer = null, dragging = false;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; dragging = false;
    if (e.target === hl) { mode = 'trimL'; startTrim = clip.trimStart; pushUndoSnapshotDeferred(); }
    else if (e.target === hr) { mode = 'trimR'; startTrim = clip.trimEnd; pushUndoSnapshotDeferred(); }
    else {
      mode = 'maybe-drag';
      holdTimer = setTimeout(() => { if (mode === 'maybe-drag') { mode = 'drag'; dragging = true; el.style.opacity = '0.6'; pushUndoSnapshotDeferred(); } }, 230);
    }
  });
  el.addEventListener('pointermove', (e) => {
    const dx = e.clientX - startX;
    if (mode === 'maybe-drag' && Math.abs(dx) > 8) { clearTimeout(holdTimer); }
    if (mode === 'trimL') {
      const d = dx / PX_PER_SEC * (clip.speed || 1);
      clip.trimStart = Math.min(Math.max(0, startTrim + d), clip.trimEnd - 0.2);
      el.style.width = Math.max(1, effDur(clip) * PX_PER_SEC) + 'px';
      const dl = el.querySelector('.clip-dur'); if (dl) dl.textContent = effDur(clip).toFixed(1) + 's';
    } else if (mode === 'trimR') {
      const d = dx / PX_PER_SEC * (clip.speed || 1);
      clip.trimEnd = Math.max(Math.min(clip.srcDuration, startTrim + d), clip.trimStart + 0.2);
      el.style.width = Math.max(1, effDur(clip) * PX_PER_SEC) + 'px';
      const dl = el.querySelector('.clip-dur'); if (dl) dl.textContent = effDur(clip).toFixed(1) + 's';
    } else if (mode === 'drag') {
      // find target index by pointer x
      const kids = $$('#timeline .clip');
      let insertAt = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) { insertAt = i; break; }
      }
      const curIdx = state.clips.indexOf(clip);
      if (insertAt !== curIdx && insertAt !== curIdx + 1) {
        state.clips.splice(curIdx, 1);
        state.clips.splice(insertAt > curIdx ? insertAt - 1 : insertAt, 0, clip);
        const tl = $('#timeline');
        tl.removeChild(el);
        const refNode = tl.children[insertAt > curIdx ? insertAt - 1 : insertAt] || null;
        tl.insertBefore(el, refNode);
      }
    }
  });
  const end = (e) => {
    clearTimeout(holdTimer);
    const wasMode = mode;
    if (mode === 'maybe-drag') { selectedClipId = clip.id; renderTimelineSoft(); }
    if (mode) commitDeferredUndo();
    el.style.opacity = '';
    mode = null;
    if (wasMode === 'trimL' || wasMode === 'trimR' || wasMode === 'drag') renderTimelineSoft();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
let deferredSnap = null;
function pushUndoSnapshotDeferred() { deferredSnap = snapshot(); }
function commitDeferredUndo() { if (deferredSnap) { undoStack.push(deferredSnap); if (undoStack.length > 40) {undoStack.shift();pruneUndoMedia();} deferredSnap = null; redoStack.length = 0; $('#btn-undo').disabled = false; $('#btn-redo').disabled = true; scheduleSave(); } }
function clipVolume(c){return Number.isFinite(c?.volume)?Math.max(0,Math.min(1,c.volume)):1;}
function syncSelectedClipControls(){const c=state.clips.find(x=>x.id===selectedClipId),index=state.clips.indexOf(c);$('#clip-duplicate').disabled=!c;$('#clip-earlier').disabled=index<=0;$('#clip-later').disabled=index<0||index>=state.clips.length-1;$('#clip-volume').disabled=$('#clip-volume-apply').disabled=!c||c.kind!=='video';for(const k of ['start','end']){$('#clip-trim-'+k).disabled=!c||c.kind!=='video';$('#clip-trim-'+k).value=c?.kind==='video'?Number(c[k==='start'?'trimStart':'trimEnd'].toFixed(3)):'';}$('#clip-trim-apply').disabled=!c||c.kind!=='video';$('#clip-volume').value=Math.round(clipVolume(c)*100);for(const axis of ['x','y']){const b=$('#btn-flip-'+axis);b.disabled=!c;b.classList.toggle('sel',!!c?.[axis==='x'?'flipX':'flipY']);b.setAttribute('aria-pressed',String(!!c?.[axis==='x'?'flipX':'flipY']));}$('#btn-photo-duration').disabled=!c||c.kind!=='image';$('#photo-duration').disabled=!c||c.kind!=='image';if(c?.kind==='image')$('#photo-duration').value=+effDur(c).toFixed(2);$$('.speed-opt').forEach(b=>b.classList.toggle('sel',!!c&&Number(b.dataset.speed)===(c.speed||1)));}
function renderTimelineSoft() { syncSelectedClipControls();renderTimeline(); renderOverlays(); updateTimeDisplay(); }

/* tap on timeline background / playhead positioning */
function clipAtTime(t) {
  let acc = 0;
  for (const c of state.clips) { const d = effDur(c); if (t < acc + d) return { clip: c, local: (t - acc) * (c.speed || 1) + c.trimStart, start: acc }; acc += d; }
  return null;
}
function timeAtClipIndex(idx) { let acc = 0; for (let i = 0; i < idx && i < state.clips.length; i++) acc += effDur(state.clips[i]); return acc; }

/* ---------- preview sequencer ---------- */
const vA = document.createElement('video'), vB = document.createElement('video');
[vA, vB].forEach(v => { v.playsInline = true; v.preload = 'auto'; });
const imgEl = document.createElement('img');
let activeEl = null;
const musicEl = document.createElement('audio'); musicEl.preload = 'auto';

function stageScale() { return $('#stage').clientWidth / 1280; }
function showOnStage(el) {
  const slot = $('#video-slot');
  if (activeEl === el) return;
  if(activeEl&&typeof activeEl.pause==='function')activeEl.pause();
  slot.innerHTML = ''; slot.appendChild(el); activeEl = el;
}
function applyPreviewFilter() {
  const f = Exporter.FILTERS[state.filter] || Exporter.FILTERS.none;
  const a=AlyaAdjustments.get(state);[vA,vB,imgEl].forEach(el=>el.style.filter=(f.css==='none'?'':f.css)+' brightness('+(1+a.brightness)+') contrast('+a.contrast+') saturate('+a.saturation+')');
}
function syncStageToPlayhead(seekExact) {
  const info = clipAtTime(Math.min(playhead,Math.max(0,totalDur()-.001)));
  if (!info) { showOnStage(imgEl); imgEl.removeAttribute('src'); return; }
  const c = info.clip;
  if (c.kind === 'image') {
    if (activeEl !== imgEl || imgEl.src !== c.url) { imgEl.src = c.url; showOnStage(imgEl); }
  } else {
    const v = activeEl?.dataset?.clipId===String(c.id)?activeEl:(activeEl === vA ? vB : vA);
    if (v.dataset.clipId !== String(c.id)) {
      v.src = c.url; v.dataset.clipId = String(c.id);
    }
    v.playbackRate = c.speed || 1;
    v.muted = state.muted;v.volume=clipVolume(c);
    if (seekExact || Math.abs(v.currentTime - info.local) > 0.35) v.currentTime = info.local;
    showOnStage(v);
  }
  activeEl.style.transform='scale('+(c.flipX?-1:1)+','+(c.flipY?-1:1)+')';
  applyPreviewFilter();
}
let lastTickMs = 0;
function tick() {
  if (!playing) return;
  const now = performance.now();
  const dt = Math.max(0.001, Math.min(0.25, (now - lastTickMs) / 1000)); lastTickMs = now;
  const info = clipAtTime(playhead);
  if (!info) { pause(); playhead = 0; syncStageToPlayhead(true); renderOverlays(); updateTimeDisplay(); return; }
  const c = info.clip;
  if (c.kind === 'video') {
    const v = activeEl;
    if (v && v.dataset && v.src) {
      const localT = v.currentTime;
      playhead = info.start + (localT - c.trimStart) / (c.speed || 1);
      if (localT >= c.trimEnd - 0.05) advanceClip(info);
    }
  } else {
    playhead += dt;
    if (playhead >= info.start + effDur(c)) advanceClip(info);
  }
  renderOverlays(); renderImageOverlays(); updateTimeDisplay(); updatePlayheadUI();
}
let playRaf = null;
function playbackLoop() { tick(); if (playing) playRaf = requestAnimationFrame(playbackLoop); else playRaf = null; }
function advanceClip(info) {
  const idx = state.clips.indexOf(info.clip);
  if (idx < state.clips.length - 1) {
    playhead = info.start + effDur(info.clip) + 0.001;
    const nxt = clipAtTime(playhead);
    if (nxt && nxt.clip.kind === 'video') {
      const other = activeEl === vA ? vB : vA;
      other.src = nxt.clip.url; other.dataset.clipId = String(nxt.clip.id);
      other.playbackRate = nxt.clip.speed || 1; other.muted = state.muted;other.volume=clipVolume(nxt.clip);
      other.currentTime = nxt.local;
      showOnStage(other);syncStageToPlayhead(true);
      other.play().catch(() => {});
    } else {
      syncStageToPlayhead(true);
      if (nxt && nxt.clip.kind === 'video' && activeEl && activeEl.play) activeEl.play().catch(() => {});
    }
  } else { pause(); playhead = 0.001; syncStageToPlayhead(true); }
}
function play() {
  if (!state.clips.length) return;
  if (playhead >= totalDur() - 0.05) playhead = 0;
  playing = true; $('#btn-play').textContent = '⏸';
  syncStageToPlayhead(true);
  const info = clipAtTime(playhead);
  if (info && info.clip.kind === 'video' && activeEl.play) activeEl.play().catch(() => {});
  syncMusicPreview(true);
  lastTickMs = performance.now();
  if (!playRaf) playRaf = requestAnimationFrame(playbackLoop);
}
function pause() {
  playing = false; $('#btn-play').textContent = '▶';
  [vA, vB].forEach(v => v.pause()); musicEl.pause();
  if (playRaf) { cancelAnimationFrame(playRaf); playRaf = null; }
}
function updateTimeDisplay() { $('#time-display').textContent = fmt(playhead) + ' / ' + fmt(totalDur());if(document.activeElement!==$('#seek-seconds'))$('#seek-seconds').value=Number(playhead.toFixed(3)); }
function updatePlayheadUI() {
  const tl = $('#timeline');
  $('#playhead-strip').style.top=$('#timeline-scroll').offsetTop+'px';
  const px = playhead * PX_PER_SEC + 12 - $('#timeline-scroll').scrollLeft;
  $('#playhead').style.left = px + 'px';
}

/* ---------- text overlays preview ---------- */
let ovSig = '';
function renderOverlays() {
  renderImageOverlays();
  const slot = $('#text-overlay-slot');
  const sc = stageScale();
  // low-end: skip DOM rebuild jab tak visible set/style same hai (play pe 10x/sec call hota hai)
  const vis = state.texts.filter(t => playhead >= t.start && playhead <= t.end);
  const sig = slot.clientWidth + '|' + vis.map(t => [t.id, t.content, t.color, t.size, t.posX, t.posY, t.anim, t.font].join(',')).join('|');
  if (sig === ovSig) return;
  ovSig = sig;
  slot.innerHTML = '';
  for (const t of vis) {
    const d = document.createElement('div');
    d.className = 'ov-text' + (t.anim !== 'none' ? ' ov-anim-' + t.anim : '');
    d.textContent = t.content;
    d.style.color = t.color;
    d.style.fontSize = Math.max(10, t.size * sc) + 'px';
    d.style.left=(t.posX??50)+'%';
    d.style.top = 'calc(' + t.posY + '% - ' + (t.size * sc / 2) + 'px)';
    d.style.fontFamily = t.font === 'NotoSansDevanagari' || /[\u0900-\u097F]/.test(t.content||'') ? 'NotoSansDevPrev' : 'NotoSansPrev';
    slot.appendChild(d);
  }
}

/* ---------- ops (shared by UI and AI) ---------- */
function opLabel(op) {
  switch (op.do) {
    case 'trim': return `Clip ${op.clip} ko ${op.start}s - ${op.end}s trim karo`;
    case 'split': return `Clip ${op.clip} ko ${op.at}s pe split karo`;
    case 'delete': return `Clip ${op.clip} delete karo`;
    case 'speed': return `Clip ${op.clip} ki speed ${op.value}x karo`;
    case 'text': return `Text "${op.content}" (${op.start}s - ${op.end}s)`;
    case 'removeText': return `Text #${op.index} hatao`;
    case 'filter': return `Filter: ${op.name}`;
    case 'mute': return op.value ? 'Original sound band' : 'Original sound on';
    case 'fades': return op.value ? 'Fade in/out on' : 'Fade in/out off';
    case 'musicvol': return `Music volume ${op.value}%`;
    case 'template': return `Style: ${op.name}`;
    default: return JSON.stringify(op);
  }
}
const TEMPLATES = {
  minecraft: { filter: 'vivid', fades: true, anim: 'rise', textColor: '#55ff55', textSize: 64, label: '⛏ Minecraft' },
  cinematic: { filter: 'contrast', fades: true, anim: 'fade', label: '🎬 Cinematic' },
  retro:     { filter: 'vintage', fades: true, anim: 'fade', label: '📼 Retro' },
  clean:     { filter: 'none', fades: false, anim: 'none', label: '✨ Clean' },
  party:     { filter: 'vivid', fades: true, anim: 'blink', label: '🎉 Party' },
  /* Minecraft pack (original combos, no game assets) */
  pixelcraft:{ filter: 'pixel', fades: false, anim: 'blink', textColor: '#55ff55', textSize: 64, label: '🟫 Pixel Craft' },
  nether:    { filter: 'warm', fades: true, anim: 'fade', textColor: '#ff5555', textSize: 60, label: '🔥 Nether' },
  end:       { filter: 'cool', fades: true, anim: 'rise', textColor: '#cc99ff', textSize: 60, label: '🌌 End' },
  speedrun:  { filter: 'none', fades: false, anim: 'rise', textColor: '#ffff55', textSize: 56, label: '⏱ Speedrun' },
};
function applyOp(op) {
  const i = (op.clip || 1) - 1;
  const c = state.clips[i];
  switch (op.do) {
    case 'trim':
      if (!c) return 'Clip ' + op.clip + ' nahi hai';
      if (c.kind === 'image') return 'Photo ke seconds Clip tools mein set karo';
      c.trimStart = Math.max(0, Math.min(op.start, c.srcDuration - 0.2));
      c.trimEnd = Math.min(Math.max(op.end, c.trimStart + 0.2), c.srcDuration);
      return null;
    case 'split': {
      if (!c) return 'Clip ' + op.clip + ' nahi hai';
      if (c.kind === 'image') return 'Photo split nahi hoti';
      const at = op.at;
      if (at <= c.trimStart + 0.1 || at >= c.trimEnd - 0.1) return 'Split point trim range ke bahar hai';
      const second = { ...c, id: nextId++, trimStart: at, thumbs: c.thumbs };
      fileStore[second.id] = c.file; thumbStore[second.id] = c.thumbs;
      c.trimEnd = at;
      state.clips.splice(i + 1, 0, second);
      return null;
    }
    case 'delete':
      if (!c) return 'Clip ' + op.clip + ' nahi hai';
      state.clips.splice(i, 1);
      if (selectedClipId === c.id) selectedClipId = state.clips[0] ? state.clips[0].id : null;
      return null;
    case 'speed':
      if (!c) return 'Clip ' + op.clip + ' nahi hai';
      c.speed = Math.min(4, Math.max(0.5, op.value));
      return null;
    case 'text':
      if((op.start??0)>=Math.max(totalDur(),3))return 'Text start project duration ke bahar hai';
      state.texts.push({
        id: nextId++, content: op.content || 'Text', font: /[\u0900-\u097F]/.test(op.content || '') ? 'NotoSansDevanagari' : 'NotoSans',
        size: op.size || 52, color: op.color || '#ffffff', posY: op.posY ?? 75,
        anim: op.anim || 'none', start: op.start ?? 0, end: Math.min(op.end ?? ((op.start??0)+3), Math.max(totalDur(), 3)),
      });
      return null;
    case 'removeText':
      state.texts.splice((op.index || 1) - 1, 1);
      return null;
    case 'filter':
      if (!Exporter.FILTERS[op.name]) return 'Filter "' + op.name + '" nahi hai';
      state.filter = op.name;
      return null;
    case 'mute': state.muted = !!op.value; return null;
    case 'fades': state.fades = !!op.value; return null;
    case 'transitions': state.transitions = !!op.value; return null;
    case 'musicvol': if (state.music) state.music.volume = (op.value ?? 70) / 100; return state.music ? null : 'Pehle music add karo';
    case 'template': {
      const t = TEMPLATES[(op.name || '').toLowerCase()];
      if (!t) return 'Style "' + op.name + '" nahi hai. Options: ' + Object.keys(TEMPLATES).join(', ');
      state.filter = t.filter; state.fades = t.fades;
      state.texts.forEach(x => { x.anim = t.anim; if (t.textColor) x.color = t.textColor; if (t.textSize) x.size = t.textSize; });
      return null;
    }
    default: return 'Unknown op: ' + op.do;
  }
}
function applyOps(ops) {
  try{AIEdit.validateOps(ops);}catch(e){return [e.message];}
  pushUndo();
  const errs = [];
  for (const op of ops) { const e = applyOp(op); if (e) errs.push(e); }
  if (!state.clips.length) $('#empty-state').classList.remove('hidden');
  refreshAll();
  return errs;
}

/* ---------- refresh ---------- */
function refreshAll() {
  [vA,vB].forEach(v=>v.muted=state.muted);
  $('#stage').style.aspectRatio=state.canvasRatio.replace(':',' / ');
  const ratio=state.canvasRatio.split(':').map(Number);$('#stage').style.width='min(100%, '+(48*ratio[0]/ratio[1])+'dvh)';$('#stage').style.margin='0 auto';
  $('#transition-seconds').value=state.transitionSeconds;$('#transition-timing').textContent='Preview '+totalDur().toFixed(2)+'s / export '+Exporter.outputDuration(state).toFixed(2)+'s (overlap adjusted).';
  $('#voice-effect').value=state.voiceEffect;
  $('#canvas-ratio').value=state.canvasRatio;$('#canvas-blur').checked=state.canvasBlur;
  const has = state.clips.length > 0;
  $('#btn-export').disabled = !has;
  $('#btn-play').disabled = !has;
  $$('.tool-btn')[0].disabled = !has;
  $('#empty-state').classList.toggle('hidden', has);
  renderTimeline();
  syncStageToPlayhead(true);
  renderOverlays(); renderImageOverlays();
  renderFilterChips();renderAdjustmentControls();
  renderTemplateChips();
  renderMusicUI();
  renderTextList(); renderOverlayList(); renderImageOverlays();renderBeatMarkers();
  updateTimeDisplay();
  applyPreviewFilter();
  syncSelectedClipControls();
  const tb = $('#btn-transitions'); if (tb) tb.textContent = '🔄 Crossfade: ' + (state.transitions ? 'ON' : 'off');
}

/* ---------- panels ---------- */
let openPanel = null;
function togglePanel(name) {
  const p = $('#panel-' + name);
  const isOpen = openPanel === name;
  closePanels();
  if (!isOpen) {
    p.classList.remove('hidden'); $('#panel-backdrop').classList.remove('hidden');
    openPanel = name;
    $$('.tool-btn').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
    if (name === 'ai') refreshAIStatus();
    if (name === 'clips')syncSelectedClipControls();
  }
}
function closePanels() {
  $$('.panel').forEach(p => p.classList.add('hidden'));
  $('#panel-backdrop').classList.add('hidden');
  $$('.tool-btn').forEach(b => b.classList.remove('on'));
  openPanel = null;
}
$$('.tool-btn').forEach(b => b.addEventListener('click', () => togglePanel(b.dataset.panel)));
$$('.panel-close').forEach(b => b.addEventListener('click', closePanels));
$('#panel-backdrop').addEventListener('click', closePanels);

function renderAdjustmentControls(){const a=AlyaAdjustments.get(state);for(const k of ['brightness','contrast','saturation']){$('#adjust-'+k).value=Math.round(a[k]*100);$('#adjust-'+k+'-value').textContent=Math.round(a[k]*100);}}
for(const key of ['brightness','contrast','saturation']){
 const input=$('#adjust-'+key);input.addEventListener('pointerdown',()=>pushUndo());input.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))pushUndo();});input.oninput=()=>{state.adjustments={...AlyaAdjustments.get(state),[key]:Number(input.value)/100};$('#adjust-'+key+'-value').textContent=input.value;applyPreviewFilter();scheduleSave();};
}
$('#adjust-reset').onclick=()=>{pushUndo();state.adjustments={...AlyaAdjustments.defaults};renderAdjustmentControls();applyPreviewFilter();scheduleSave();};
/* ---------- clips panel ---------- */
$('#clip-duplicate').onclick=()=>{const c=state.clips.find(c=>c.id===selectedClipId);if(!c)return;if(state.clips.length>=100){$('#clip-process-status').textContent='Maximum100 clips.';return;}pushUndo();const copy={...c,id:nextId++};fileStore[copy.id]=c.file;thumbStore[copy.id]=c.thumbs;state.clips.splice(state.clips.indexOf(c)+1,0,copy);selectedClipId=copy.id;refreshAll();scheduleSave();$('#clip-process-status').textContent='Clip copy added after original. Source media reused; settings independent. Undo available.';};
for(const direction of ['earlier','later'])$('#clip-'+direction).onclick=()=>{const i=state.clips.findIndex(c=>c.id===selectedClipId),j=i+(direction==='earlier'?-1:1);if(i<0||j<0||j>=state.clips.length)return;pushUndo();[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];playhead=timeAtClipIndex(j);refreshAll();scheduleSave();$('#clip-process-status').textContent='Clip moved '+direction+'. Text/image timing stays absolute; review overlays. Undo available.';};
$('#clip-trim-apply').onclick=()=>{const c=state.clips.find(c=>c.id===selectedClipId);if(!c||c.kind!=='video')return;const a=$('#clip-trim-start').value,z=$('#clip-trim-end').value,start=Number(a),end=Number(z);if(!a.trim()||!z.trim()||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>c.srcDuration||end-start<.2-1e-8){$('#clip-trim-status').textContent='In/Out source range0-'+c.srcDuration.toFixed(2)+'s, minimum0.2s rakho.';return;}pushUndo();c.trimStart=start;c.trimEnd=end;playhead=Math.min(playhead,totalDur());refreshAll();scheduleSave();$('#clip-trim-status').textContent='Source '+start+'s to '+end+'s. Undo available.';};
$('#clip-volume-apply').onclick=()=>{const c=state.clips.find(c=>c.id===selectedClipId),n=Number($('#clip-volume').value);if(!c||c.kind!=='video')return;if($('#clip-volume').value.trim()===''||!Number.isFinite(n)||n<0||n>100){$('#clip-volume-status').textContent='Clip audio0-100% rakho.';return;}pushUndo();c.volume=n/100;refreshAll();scheduleSave();$('#clip-volume-status').textContent='Selected clip audio '+n+'%. Global mute still wins. Undo available.';};
for(const axis of ['x','y'])$('#btn-flip-'+axis).onclick=()=>{const c=state.clips.find(c=>c.id===selectedClipId);if(!c)return;pushUndo();const key=axis==='x'?'flipX':'flipY';c[key]=!c[key];refreshAll();scheduleSave();};
$('#btn-split').addEventListener('click', () => {
  const info = clipAtTime(Math.min(playhead,Math.max(0,totalDur()-.001)));
  if (!info || info.clip.kind !== 'video') {$('#clip-process-status').textContent='Video clip pe playhead rakho, phir split dabao';return;}
  const errs=applyOps([{do:'split',clip:state.clips.indexOf(info.clip)+1,at:info.local}]);
  $('#clip-process-status').textContent=errs.length?errs.join('; '):'Clip split ho gaya. Undo available.';
});
$('#btn-delete-clip').addEventListener('click', () => {
  const c = state.clips.find(x => x.id === selectedClipId);
  if (!c) return;
  pushUndo();
  state.clips.splice(state.clips.indexOf(c), 1);
  selectedClipId = state.clips[0] ? state.clips[0].id : null;
  refreshAll();
});
$('#btn-photo-duration').addEventListener('click',()=>{
  const c=state.clips.find(x=>x.id===selectedClipId);
  if(!c||c.kind!=='image'){$('#clip-process-status').textContent='Photo clip select karo.';return;}
  const seconds=Number($('#photo-duration').value);if(!Number.isFinite(seconds)||seconds<.2||seconds>60){$('#clip-process-status').textContent='Photo duration 0.2 se 60 seconds rakho.';return;}
  pushUndo();c.srcDuration=seconds;c.trimStart=0;c.trimEnd=seconds;c.speed=1;playhead=Math.min(playhead,totalDur());refreshAll();scheduleSave();$('#clip-process-status').textContent='Photo duration '+seconds+'s. Undo available.';
});
$('#btn-speed').addEventListener('click', () => $('#speed-row').classList.toggle('hidden'));
$('#transition-time-apply').onclick=()=>{const raw=$('#transition-seconds').value,n=Number(raw);if(!raw.trim()||!Number.isFinite(n)||n<.2||n>2){$('#transition-time-status').textContent='Transition0.2-2 seconds rakho.';return;}pushUndo();state.transitionSeconds=n;state.transitions=true;refreshAll();scheduleSave();$('#transition-time-status').textContent='Transitions enabled. Short clips shorten overlap; very short clips use hard cuts. Text/image times stay absolute. Rendered preview/export only.';};
$('#btn-transitions').addEventListener('click', () => {
  pushUndo();
  state.transitions = !state.transitions;
  $('#btn-transitions').textContent = '🔄 Crossfade: ' + (state.transitions ? 'ON' : 'off');refreshAll();scheduleSave();
});
$$('.speed-opt').forEach(b => b.addEventListener('click', () => {
  const c = state.clips.find(x => x.id === selectedClipId);
  if (!c) return;
  pushUndo();
  c.speed = parseFloat(b.dataset.speed);
  $$('.speed-opt').forEach(x => x.classList.toggle('sel', x === b));
  refreshAll();
}));

/* ---------- text panel ---------- */
function renderTextList() {
  const box = $('#text-list'); box.innerHTML = '';
  state.texts.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'text-item';
    el.innerHTML = `<span class="t-prev"></span><span class="t-time">${t.start}s-${t.end}s</span>`;
    el.querySelector('.t-prev').textContent = t.content;
    el.addEventListener('click', () => openTextEditor(t.id));
    box.appendChild(el);
  });
}
$('#btn-add-text').addEventListener('click', () => {
  pushUndo();
  const t = { id: nextId++, content: 'Apna text', font: 'NotoSans', size: 52, color: '#ffffff', posY: 75, anim: 'none', start: Math.floor(playhead), end: Math.min(Math.floor(playhead) + 3, Math.max(totalDur(), 3)) };
  state.texts.push(t);
  refreshAll();
  openTextEditor(t.id);
});
function openTextEditor(id) {
  editingTextId = id;textEditChanged=false;
  const t = state.texts.find(x => x.id === id);
  if (!t) return;
  $('#text-editor').classList.remove('hidden');
  $('#te-content').value = t.content;
  $('#te-font').value = t.font;
  $('#te-color').value = t.color;
  $('#te-anim').value = t.anim;
  $('#te-size').value = t.size;
  $('#te-posy').value = t.posY;$('#te-posx').value=t.posX??50;
  $('#te-start').value = t.start;
  $('#te-end').value = t.end;
}
function bindTextEditor() {
  const upd = () => {
    const t = state.texts.find(x => x.id === editingTextId);
    if (!t) return;
    if(!textEditChanged){pushUndo();textEditChanged=true;}
    t.content = $('#te-content').value || 'Text';
    t.font = $('#te-font').value;
    t.color = $('#te-color').value;
    t.anim = $('#te-anim').value;
    t.size = +$('#te-size').value;
    t.posY = +$('#te-posy').value;t.posX=+$('#te-posx').value;
    const start=Number($('#te-start').value),end=Number($('#te-end').value);
    t.start = Math.max(0,Math.min(86399.5,Number.isFinite(start)?start:0));
    t.end = Math.min(86400,Math.max(t.start + 0.5,Number.isFinite(end)?end:t.start+3));
    renderOverlays(); renderTextList();scheduleSave();
  };
  ['#te-content', '#te-font', '#te-color', '#te-anim', '#te-size', '#te-posy', '#te-posx', '#te-start', '#te-end']
    .forEach(s => $(s).addEventListener('input', upd));
  $('#te-duplicate').onclick=()=>{const t=state.texts.find(t=>t.id===editingTextId);if(!t)return;if(state.texts.length>=200){alert('Maximum200 text layers.');return;}pushUndo();const copy={...t,id:nextId++};state.texts.push(copy);refreshAll();openTextEditor(copy.id);scheduleSave();};
  $('#te-done').addEventListener('click', () => { $('#text-editor').classList.add('hidden'); editingTextId = null; });
  $('#te-delete').addEventListener('click', () => {
    pushUndo();
    state.texts = state.texts.filter(x => x.id !== editingTextId);
    $('#text-editor').classList.add('hidden'); editingTextId = null;
    refreshAll();
  });
}

/* ---------- music panel ---------- */
function syncMusicPreview(seek=false){
  if(!state.music){musicEl.pause();musicEl.removeAttribute('src');musicEl.load();return;}
  const changed=musicEl.src!==state.music.url;
  if(changed)musicEl.src=state.music.url;
  musicEl.volume=state.music.volume;
  if(changed||seek)musicEl.currentTime=(state.music.sourceStart||0)+playhead;
  if(playing)musicEl.play().catch(()=>{});else musicEl.pause();
}
function renderMusicUI() {
  musicVolumeEditing=false;syncMusicPreview();
  const has = !!state.music;
  $('#btn-remove-music').classList.toggle('hidden', !has);
  $('#mv-wrap').classList.toggle('hidden', !has);
  $('#music-info').textContent = has ? ('♫ ' + state.music.name) : 'Koi music nahi. MP3/audio file add karo.';
  if (has) $('#music-volume').value = Math.round(state.music.volume * 100);
  $('#music-source-start').value=has?(state.music.sourceStart||0):0;$('#music-source-start').disabled=$('#music-source-apply').disabled=!has;
  $('#chk-mute').checked = state.muted;
}
$('#music-source-apply').onclick=()=>{if(!state.music)return;const raw=$('#music-source-start').value,start=Number(raw);if(!raw.trim()||!Number.isFinite(start)||start<0||!Number.isFinite(musicEl.duration)||start>=musicEl.duration){$('#music-source-status').textContent='Audio load hone do, phir source ke andar start seconds rakho.';return;}pushUndo();state.music.sourceStart=start;syncMusicPreview(true);scheduleSave();$('#music-source-status').textContent='Music source starts at '+start+'s, project time0. Source ends naturally; no loop. Undo available.';};
$('#btn-add-music').addEventListener('click', () => $('#file-music').click());
$('#file-music').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  pushUndo();
  const fileId = nextId++;
  fileStore[fileId] = f;
  state.music = { file: f, fileId, name: f.name, volume: 0.7, url: mediaUrl(f) };
  renderMusicUI();
  e.target.value = '';
});
$('#btn-remove-music').addEventListener('click', () => { pushUndo(); state.music = null; renderMusicUI(); });
let musicVolumeEditing=false;
$('#music-volume').addEventListener('input', (e) => { if(!state.music)return;if(!musicVolumeEditing){pushUndo();musicVolumeEditing=true;}state.music.volume=Number(e.target.value)/100;syncMusicPreview();scheduleSave(); });
for(const event of ['change','blur'])$('#music-volume').addEventListener(event,()=>{musicVolumeEditing=false;});
$('#chk-mute').addEventListener('change', (e) => { pushUndo(); state.muted = e.target.checked; [vA, vB].forEach(v => v.muted = state.muted); });

/* ---------- auto captions ---------- */
$('#btn-auto-captions').addEventListener('click', async () => {
  const status = $('#captions-status');
  if (!AIEdit.getKey()) {
    status.textContent = 'Auto captions ke liye free Gemini AI key chahiye: AI Edit panel > AI settings mein lagao. (Captions cloud AI se bante hain, offline nahi ho sakte - video device pe hi rehti hai, sirf audio AI ko jaati hai.)';
    return;
  }
  if (!state.clips.length) { status.textContent = 'Pehle clips add karo.'; return; }
  const captionProjectId=currentProjectId,captionSnapshot=snapshot();const captionButton=$('#btn-auto-captions');captionButton.disabled=true;
  status.textContent = 'Audio tayyar ho raha hai...';
  try {
    const captionState={...state,clips:state.clips.map(c=>({...c}))};
    const wav = await Exporter.extractAudio(captionState, (m) => status.textContent = m);
    status.textContent = 'AI se captions ban rahe hain (lambi audio = zyada time)...';
    const res = await AIEdit.transcribeAudio(wav, AIEdit.getKey());
    if(currentProjectId!==captionProjectId||captionSnapshot!==snapshot()){status.textContent='Project badal/edit ho gaya. Captions apply nahi kiye.';return;}
    if (res.error) { status.textContent = res.error; return; }
    if (!res.segments.length) { status.textContent = 'Audio mein speech nahi mili.'; return; }
    const duration=totalDur();
    const segments=res.segments.filter(seg=>Number.isFinite(seg.start)&&Number.isFinite(seg.end)&&seg.start>=0&&seg.start<duration&&seg.end>seg.start);
    if(!segments.length){status.textContent='Project ke andar valid captions nahi mili. Dobara try karo.';return;}
    pushUndo();
    for (const seg of segments) {
      state.texts.push({
        id: nextId++, content: seg.text,
        font: /[\u0900-\u097F]/.test(seg.text) ? 'NotoSansDevanagari' : 'NotoSans',
        size: 44, color: '#ffffff', posY: 82, anim: 'none',
        start: seg.start, end: Math.min(duration,Math.max(seg.start+.01,seg.end)),
      });
    }
    status.textContent = segments.length + ' captions add ho gaye. Neeche list se edit kar sakte ho.';
    renderTextList(); renderOverlays();
  } catch (e) {
    console.error(e);
    status.textContent = 'Captions fail: ' + (e.message || e);
  }finally{captionButton.disabled=false;}
});

/* ---------- filters & templates ---------- */
const FILTER_LABELS = { none: 'Normal', bright: 'Bright', contrast: 'Contrast+', vivid: 'Vivid', bw: 'B&W', warm: 'Warm', cool: 'Cool', vintage: 'Vintage', pixel: 'Pixel (export mein)' };
function renderFilterChips() {
  const box = $('#filter-list'); box.innerHTML = '';
  Object.keys(Exporter.FILTERS).forEach(name => {
    const b = document.createElement('button');
    b.className = 'chip-btn filter-chip' + (state.filter === name ? ' sel' : '');
    b.textContent = FILTER_LABELS[name] || name;
    b.addEventListener('click', () => { pushUndo(); state.filter = name; applyPreviewFilter(); renderFilterChips(); });
    box.appendChild(b);
  });
  $('#chk-fades').checked = state.fades;$('#fade-in-seconds').value=state.fadeIn;$('#fade-out-seconds').value=state.fadeOut;
}
$('#fade-time-apply').onclick=()=>{const a=$('#fade-in-seconds').value,b=$('#fade-out-seconds').value,x=Number(a),y=Number(b);if(!a.trim()||!b.trim()||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>10||y>10){$('#fade-time-status').textContent='In/Out0-10 seconds rakho.';return;}pushUndo();state.fadeIn=x;state.fadeOut=y;state.fades=true;renderFilterChips();scheduleSave();$('#fade-time-status').textContent='Fades enabled. Each duration is capped at one quarter of output;0 disables that edge. Rendered preview/export only.';};
$('#chk-fades').addEventListener('change', (e) => { pushUndo(); state.fades = e.target.checked; });
function validCustomTemplate(t) {
  return !!t && typeof t==='object' && typeof t.name==='string' && t.name.trim().length>0 && t.name.length<=120 &&
    Object.prototype.hasOwnProperty.call(Exporter.FILTERS,t.filter) && typeof t.fades==='boolean' &&
    ['none','fade','rise','blink'].includes(t.anim) &&
    (t.textColor==null || /^#[a-fA-F0-9]{6}$/.test(t.textColor)) &&
    (t.textSize==null || (typeof t.textSize==='number' && Number.isFinite(t.textSize) && t.textSize>=1 && t.textSize<=500));
}
function customTemplates() {
  try { const list=JSON.parse(localStorage.getItem('ms_templates') || '[]');return Array.isArray(list)?list.filter(validCustomTemplate).slice(-100):[]; } catch (e) { return []; }
}
function saveCustomTemplates(list) { try { localStorage.setItem('ms_templates', JSON.stringify(list)); } catch (e) {} }
function renderTemplateChips() {
  const box = $('#template-list'); box.innerHTML = '';
  Object.entries(TEMPLATES).forEach(([name, t]) => {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.textContent = t.label;
    b.addEventListener('click', () => { applyOps([{ do: 'template', name }]); });
    box.appendChild(b);
  });
  customTemplates().forEach((t) => {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.textContent = '⭐ ' + t.name;
    b.addEventListener('click', () => {
      pushUndo();
      state.filter = t.filter; state.fades = t.fades;
      state.texts.forEach(x => { x.anim = t.anim; if (t.textColor) x.color = t.textColor; if (t.textSize) x.size = t.textSize; });
      refreshAll();
    });
    box.appendChild(b);
  });
}
$('#btn-save-template').addEventListener('click', () => {
  const name = prompt('Template ka naam:');
  if (!name) return;
  const first = state.texts[0];
  const list = customTemplates();
  list.push({ name:name.slice(0,120), filter: state.filter, fades: state.fades, anim: first ? first.anim : 'none', textColor: first ? first.color : null, textSize: first ? first.size : null, createdAt: Date.now() });
  saveCustomTemplates(list);
  renderTemplateChips();
});
$('#btn-import-template').addEventListener('click', () => {
  const box = $('#template-import-box');
  if (box.classList.contains('hidden')) { box.classList.remove('hidden'); return; }
  try {
    const t = JSON.parse(box.value);
    if (!t || typeof t.name!=='string' || !t.name.trim() || !Object.prototype.hasOwnProperty.call(Exporter.FILTERS,t.filter) || (t.textColor!=null&&!/^#[a-fA-F0-9]{6}$/.test(t.textColor)) || (t.textSize!=null&&(typeof t.textSize!=='number'||!Number.isFinite(t.textSize)||t.textSize<1||t.textSize>500))) throw new Error('invalid');
    const list = customTemplates();
    list.push({ name: String(t.name).slice(0, 40), filter: t.filter, fades: !!t.fades, anim: ['none','fade','rise','blink'].includes(t.anim) ? t.anim : 'none', textColor: t.textColor || null, textSize: t.textSize || null, createdAt: Date.now() });
    saveCustomTemplates(list);
    box.value = ''; box.classList.add('hidden');
    renderTemplateChips();
  } catch (e) {
    alert('Template JSON valid nahi hai. Format: {"name":"Mera Style","filter":"warm","fades":true,"anim":"rise"}');
  }
});

/* ---------- original workspace controls ---------- */
function applyWorkspaceWallpaper(data){
 const el=$('#custom-bg');el.style.backgroundImage=data?'url('+data+')':'';el.classList.toggle('hidden',!data);
 $('#btn-remove-bg').disabled=!data;
}
$('#side-projects').onclick=()=>$('#btn-home').click();
$('#side-new').onclick=async()=>{if(importingMedia)return;if(confirm('Naya project banao? Current project device pe save rahega.')){clearTimeout(saveTimer);await saveChain;await saveCurrentProject();await newProject();}};
$('#side-templates').onclick=()=>togglePanel('templates');$('#side-effects').onclick=()=>togglePanel('filters');$('#side-ai').onclick=()=>togglePanel('ai');$('#side-settings').onclick=()=>togglePanel('settings');
$('#quality-pill').onclick=()=>togglePanel('export');
$('#btn-set-bg').onclick=()=>$('#file-bg').click();
$('#btn-remove-bg').onclick=()=>{try{localStorage.removeItem('ms_wallpaper_v1');}catch(e){}applyWorkspaceWallpaper(null);$('#wallpaper-status').textContent='Wallpaper removed. Original workspace active.';};
$('#file-bg').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;let url;
 try{
 url=URL.createObjectURL(file);const dim=await imageDims(url);const image=new Image();
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('Wallpaper decode timeout'));},15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('Wallpaper decode failed'));};image.src=url;});
 const scale=Math.min(1,1080/Math.max(dim.w,dim.h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(dim.w*scale));canvas.height=Math.max(1,Math.round(dim.h*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 const data=canvas.toDataURL('image/jpeg',.75);localStorage.setItem('ms_wallpaper_v1',data);applyWorkspaceWallpaper(data);$('#wallpaper-status').textContent='Wallpaper saved only on this device. Exported video unchanged.';
 }catch(err){$('#wallpaper-status').textContent='Wallpaper load/save nahi hui. Chhoti valid photo try karo.';}finally{if(url)URL.revokeObjectURL(url);}
};
try{const wallpaper=localStorage.getItem('ms_wallpaper_v1');applyWorkspaceWallpaper(wallpaper?.startsWith('data:image/')?wallpaper:null);}catch(e){applyWorkspaceWallpaper(null);}

/* ---------- AI panel ---------- */
function refreshAIStatus() {
  const hasKey = !!AIEdit.getKey();
  $('#ai-status').innerHTML = hasKey
    ? '🪄 <b>Gemini AI connected</b> (free tier - kabhi kabhi limit lag sakti hai). Free-form likho ya offline commands use karo.'
    : 'Abhi <b>offline commands</b> chal rahe hain (fixed set). Free AI key lagao (⚙ AI settings) to kuch bhi likh sakte ho.';
  $('#ai-help-body').textContent = AIEdit.HELP;
  $('#ai-key-status').textContent = hasKey ? 'Key saved hai (is device pe).' : 'Koi key nahi hai.';
}
function flashReply(msg) { $('#ai-reply').textContent = msg; if (openPanel !== 'ai') togglePanel('ai'); }
let pendingOps = null;let pendingProject=null;let pendingSnapshot=null;let aiRequest=0;
async function runAI() {
  const text = $('#ai-input').value.trim();
  if (!text) return;
  const request=++aiRequest,project=currentProjectId,requestSnapshot=snapshot();pendingOps=null;
  $('#ai-reply').textContent = 'Soch raha hoon...';
  $('#ai-plan').classList.add('hidden');
  const summary = JSON.stringify({
    duration: +totalDur().toFixed(1),
    clips: state.clips.map((c, i) => ({ n: i + 1, kind: c.kind, srcDuration: +c.srcDuration.toFixed(1), trimStart: +c.trimStart.toFixed(1), trimEnd: +c.trimEnd.toFixed(1), speed: c.speed })),
    texts: state.texts.map((t, i) => ({ n: i + 1, content: t.content, start: t.start, end: t.end })),
    filter: state.filter, muted: state.muted, fades: state.fades, hasMusic: !!state.music,
  });
  let result;
  if (AIEdit.getKey()) {
    result = await AIEdit.askGemini(text, summary, AIEdit.getKey());
  } else {
    result = AIEdit.parseOffline(text, state.clips.length);
  }
  if(request!==aiRequest||project!==currentProjectId)return;
  if(requestSnapshot!==snapshot()){$('#ai-reply').textContent='Project edit ho gaya. Naya plan banao.';return;}
  if(result.ops?.length){try{AIEdit.validateOps(result.ops);}catch(e){result={ops:[],reply:e.message};}}
  $('#ai-reply').textContent = result.reply;
  if (result.ops && result.ops.length) {
    pendingOps = result.ops;pendingProject=project;pendingSnapshot=requestSnapshot;
    const ul = $('#ai-plan-list'); ul.innerHTML = '';
    result.ops.forEach(op => { const li = document.createElement('li'); li.textContent = opLabel(op); ul.appendChild(li); });
    $('#ai-plan').classList.remove('hidden');
  }
}
$('#ai-send').addEventListener('click', runAI);
$('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAI(); });
$('#ai-apply').addEventListener('click', () => {
  if (!pendingOps) return;
  if(pendingProject!==currentProjectId||pendingSnapshot!==snapshot()){pendingOps=null;$('#ai-plan').classList.add('hidden');$('#ai-reply').textContent='Project badal gaya. Naya plan banao.';return;}
  const errs = applyOps(pendingOps);
  $('#ai-plan').classList.add('hidden');
  $('#ai-reply').textContent = errs.length ? ('Apply hua, par: ' + errs.join('; ')) : 'Done! Undo se wapas la sakte ho.';
  pendingOps = null;
});
$('#ai-cancel').addEventListener('click', () => { $('#ai-plan').classList.add('hidden'); pendingOps = null; });
$('#btn-ai-settings').addEventListener('click', () => $('#ai-settings').classList.toggle('hidden'));
$('#ai-key-save').addEventListener('click', () => {
  const k = $('#ai-key').value.trim();
  AIEdit.setKey(k);
  $('#ai-key').value = '';
  refreshAIStatus();
});

let awaitingNativeSave=false;
window.addEventListener('alya-save-status',e=>{$('#export-msg').textContent=e.detail;});
window.addEventListener('alya-save-finished',()=>{awaitingNativeSave=false;$('#btn-start-export').disabled=false;});
/* Accurate on-demand output preview, independent of the fast timeline player. */
let previewObjectURL=null,previewGeneration=0,renderingPreview=false;
function clearRenderedPreview(){const video=$('#rendered-preview-video');video.pause();video.removeAttribute('src');video.hidden=true;if(previewObjectURL){URL.revokeObjectURL(previewObjectURL);previewObjectURL=null;}}
function closeRenderedPreview(){previewGeneration++;clearRenderedPreview();$('#render-preview-dialog').close();}
$('#btn-render-preview').onclick=()=>{pause();$('#preview-render-status').textContent=renderingPreview?'Previous render still running. Wait for completion.':'';$('#render-preview-dialog').showModal();};
$('#preview-close').onclick=closeRenderedPreview;
$('#render-preview-dialog').addEventListener('cancel',e=>{e.preventDefault();closeRenderedPreview();});
$('#preview-build').onclick=async()=>{
 if(renderingPreview)return;const status=$('#preview-render-status');if(!state.clips.length){status.textContent='Clips add karo.';return;}
 if(Exporter.outputDuration(state)>30){status.textContent='Preview limit30s output. Longer project ke liye Export use karo.';return;}
 const signature=snapshot(),project=currentProjectId,generation=++previewGeneration;
 const copy=JSON.parse(signature);copy.clips=state.clips.map(c=>({...c}));if(state.music)copy.music={...state.music};
 clearRenderedPreview();renderingPreview=true;$('#preview-build').disabled=true;status.textContent='Rendering on device... first engine load may take time.';
 try{const blob=await Exporter.exportVideo(copy,'480p30',p=>{if(generation===previewGeneration)status.textContent='Rendering '+Math.round(p*100)+'%';});
  if(generation!==previewGeneration||project!==currentProjectId||snapshot()!==signature){if(generation===previewGeneration)status.textContent='Project changed. Render again for current edits.';return;}
  previewObjectURL=URL.createObjectURL(blob);const video=$('#rendered-preview-video');video.src=previewObjectURL;video.hidden=false;status.textContent='Ready. Press play: output duration '+Exporter.outputDuration(copy).toFixed(2)+'s. 480p30 preview, not full export quality.';
 }catch(e){if(generation===previewGeneration)status.textContent='Preview failed: '+e.message;}finally{renderingPreview=false;$('#preview-build').disabled=false;}
};
/* ---------- export ---------- */
let quality = '480p30';
$$('.q-opt').forEach(b => b.addEventListener('click', () => {
  quality = b.dataset.q;$('#quality-pill').textContent=quality.replace('p30','p').replace('p60','p60');
  $$('.q-opt').forEach(x => x.classList.toggle('sel', x === b));
}));
$('#btn-export').addEventListener('click', () => togglePanel('export'));
$('#btn-start-export').addEventListener('click', async () => {
  const btn = $('#btn-start-export');
  if(awaitingNativeSave)return;
  btn.disabled = true;
  $('#export-progress').classList.remove('hidden');
  const bar = $('#export-bar'), msg = $('#export-msg');
  if(location.hostname==='appassets.androidplatform.net'&&typeof window.AlyaSave?.postMessage!=='function'){msg.textContent='Is Android WebView mein save support nahi hai. Android System WebView update karo ya browser version use karo.';btn.disabled=false;return;}
  try {
    pause();
    msg.textContent = 'Engine load ho raha hai (pehli baar ~30MB download)...';
    const exportState=JSON.parse(snapshot());exportState.clips=state.clips.map(c=>({...c}));if(state.music)exportState.music={...state.music};
    const blob = await Exporter.exportVideo(exportState, quality,
      (p) => { bar.style.width = Math.round(p * 100) + '%'; msg.textContent = 'Export: ' + Math.round(p * 100) + '%'; },
      (stageMsg) => { msg.textContent = stageMsg; });
    bar.style.width = '100%';
    msg.textContent = 'Ho gaya! Download shuru...';
    if (window.AlyaSave && typeof window.AlyaSave.postMessage === 'function') {
      msg.textContent = 'Android save picker khul raha hai...';
      awaitingNativeSave=true;
      window.AlyaSave.postMessage('begin');
      for(let offset=0;offset<blob.size;offset+=98304){
        if(!awaitingNativeSave)throw Error('Android save stopped. Dobara try karo.');
        const bytes=new Uint8Array(await blob.slice(offset,offset+98304).arrayBuffer());
        let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
        window.AlyaSave.postMessage('chunk:'+btoa(raw));
        await new Promise(r=>setTimeout(r,0));
      }
      window.AlyaSave.postMessage('end');
      return;
    }
    const a = document.createElement('a');
    const downloadUrl=URL.createObjectURL(blob);a.href = downloadUrl;setTimeout(()=>URL.revokeObjectURL(downloadUrl),60000);
    a.download = 'minecraft-studio-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.mp4';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { $('#export-progress').classList.add('hidden'); bar.style.width = '0%'; }, 1500);
  } catch (e) {
    console.error(e);
    if(awaitingNativeSave){try{window.AlyaSave.postMessage('abort');}catch(ignored){}}
    awaitingNativeSave=false;
    msg.textContent = 'Export fail hua: ' + (e.message || e) + ' - chhota/480p try karo.';
  } finally {
    btn.disabled = awaitingNativeSave;
  }
});

/* ---------- global wiring ---------- */
$('#btn-add-first').addEventListener('click', () => $('#file-video').click());
$('#btn-add-more').addEventListener('click', () => $('#file-video').click());
$('#file-video').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
$('#btn-play').addEventListener('click', () => playing ? pause() : play());
function doUndo() { const s = undoStack.pop(); if (s) { redoStack.push(snapshot()); if (redoStack.length > 40) redoStack.shift(); restore(s); editingTextId=null; textEditChanged=false; $('#text-editor').classList.add('hidden'); } $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; scheduleSave(); }
function doRedo() { const s = redoStack.pop(); if (s) { undoStack.push(snapshot()); if (undoStack.length > 40) {undoStack.shift();pruneUndoMedia();} restore(s); editingTextId=null; textEditChanged=false; $('#text-editor').classList.add('hidden'); } $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; scheduleSave(); }
$('#btn-undo').addEventListener('click', doUndo);
$('#btn-redo').addEventListener('click', doRedo);
$('#btn-fullscreen').addEventListener('click', () => {
  const st = $('#stage');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (st.requestFullscreen) st.requestFullscreen();
});
$('#seek-apply').onclick=()=>{const raw=$('#seek-seconds').value,t=Number(raw);if(!raw.trim()||!Number.isFinite(t)||t<0||t>totalDur()){$('#seek-status').textContent='Project range0-'+totalDur().toFixed(2)+'s rakho.';return;}pause();playhead=t;syncStageToPlayhead(true);syncMusicPreview(true);renderOverlays();updateTimeDisplay();updatePlayheadUI();$('#timeline-scroll').scrollLeft=Math.max(0,t*PX_PER_SEC-$('#timeline-scroll').clientWidth/2);$('#seek-status').textContent='Timeline '+t+'s. Browser seek, not frame-accurate stepping; transitions use un-overlapped clock.';};
$('#timeline-scroll').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.clip')) return;
  const rect = $('#timeline').getBoundingClientRect();
  const t = (e.clientX - rect.left) / PX_PER_SEC;
  playhead = Math.max(0, Math.min(t, totalDur()));
  pause(); syncStageToPlayhead(true); renderOverlays(); updateTimeDisplay(); updatePlayheadUI();
});
$('#timeline-scroll').addEventListener('scroll', updatePlayheadUI);
const FRAME_SEC = 1 / 30; // 30fps timeline grid; export presets run at 30/60fps
function stepFrame(dir) {
  if (!state.clips.length) return;
  pause();
  const ratio = playhead / FRAME_SEC, nearest = Math.round(ratio);
  let frame;
  if (Math.abs(ratio - nearest) < 1e-6) frame = nearest + dir;
  else frame = dir > 0 ? Math.ceil(ratio) : Math.floor(ratio);
  playhead = Math.max(0, Math.min(frame * FRAME_SEC, totalDur()));
  syncStageToPlayhead(true); syncMusicPreview(true); renderOverlays(); updateTimeDisplay(); updatePlayheadUI();
  const fr = Math.round(playhead / FRAME_SEC);
  $('#timeline-scroll').scrollLeft = Math.max(0, playhead * PX_PER_SEC - $('#timeline-scroll').clientWidth / 2);
  $('#seek-status').textContent = 'Frame ' + fr + ' (' + playhead.toFixed(3) + 's) on 30fps grid. Browser video seek; source frame rate can differ.';
}
$('#seek-frame-prev').onclick = () => stepFrame(-1);
$('#seek-frame-next').onclick = () => stepFrame(1);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if ($('#app').classList.contains('hidden')) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
  else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
});
function setTimelineZoom(delta){
  const idx=ZOOM_LEVELS.indexOf(PX_PER_SEC),next=ZOOM_LEVELS[Math.max(0,Math.min(ZOOM_LEVELS.length-1,idx+delta))];
  const scroll=$('#timeline-scroll'),anchor=(scroll.scrollLeft+scroll.clientWidth/2)/PX_PER_SEC;
  PX_PER_SEC=next;renderTimeline();renderOverlayList();renderBeatMarkers();
  scroll.scrollLeft=Math.max(0,anchor*PX_PER_SEC-scroll.clientWidth/2);updatePlayheadUI();
  $('#zoom-label').textContent='Timeline '+(PX_PER_SEC/46)+'x';$('#zoom-out').disabled=PX_PER_SEC===ZOOM_LEVELS[0];$('#zoom-in').disabled=PX_PER_SEC===ZOOM_LEVELS.at(-1);
}
$('#zoom-out').onclick=()=>setTimelineZoom(-1);$('#zoom-in').onclick=()=>setTimelineZoom(1);

window.addEventListener('resize', () => { renderOverlays(); updatePlayheadUI(); });

function showSpinner(msg) { $('#spinner-msg').textContent = msg; $('#stage-spinner').classList.remove('hidden'); }
function hideSpinner() { $('#stage-spinner').classList.add('hidden'); }

/* ---------- debug/test hook (harmless in production) ---------- */
window.__alya = { state, applyOps, refreshAll, snapshot, get playhead() { return playhead; }, undoDepth: () => undoStack.length, redoDepth: () => redoStack.length, openProject: (id) => openProject(id) };


/* ---------- projects store (on-device, IndexedDB) ---------- */
let currentProjectId = null;
let currentProjectName = '';
const writtenFiles = new Set(); // keys already stored this session

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('minecraft-studio', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(store, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(store, key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const rq = db.transaction(store).objectStore(store).get(key);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbDel(store, key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbAllKeys(store) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const rq = db.transaction(store).objectStore(store).getAllKeys();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  });
}

let projectIndex=[];
try{const value=JSON.parse(localStorage.getItem('ms_projects_index')||'[]');if(Array.isArray(value))projectIndex=value;}catch(e){}
function loadIndex(){return projectIndex;}
function saveIndex(list){projectIndex=list;try{localStorage.setItem('ms_projects_index',JSON.stringify(list));}catch(e){$('#storage-status').textContent='Index cache save nahi hua. Projects database se recover honge.';}}
async function recoverIndex(){
  const db=await idbOpen();
  try{const records=await new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const list=[];for(const r of records){try{const j=JSON.parse(r.snap);list.push({id:r.id,name:r.name,updatedAt:r.updatedAt,dur:Math.round(j.clips.reduce((a,c)=>a+effDur(c),0)),clips:j.clips.length});}catch(e){}}
    list.sort((a,b)=>b.updatedAt-a.updatedAt);saveIndex(list);
  }finally{db.close();}
}
let saveRevision=0;
function saveStatus(text){$('#save-status').textContent=text;}

let saveTimer = null;
/* Crash recovery journal: synchronous localStorage copy of the latest edit state.
   Writes survive an abrupt tab/browser kill better than the async IndexedDB chain.
   Local only; OS storage eviction can still remove it. Not cloud backup. */
let lastJournalWrite = 0;
let journalTimer = null;
function writeRecoveryJournal(force) {
  if (!currentProjectId) return;
  const now = Date.now();
  if (!force && now - lastJournalWrite < 400) {
    // Trailing write: the final state of an edit burst always lands in the journal.
    if (!journalTimer) journalTimer = setTimeout(() => { journalTimer = null; lastJournalWrite = 0; writeRecoveryJournal(true); }, 420 - (now - lastJournalWrite));
    return;
  }
  lastJournalWrite = now;
  try { localStorage.setItem('ms_recovery', JSON.stringify({ id: currentProjectId, at: now, snap: snapshot() })); } catch (e) {}
}
function clearRecoveryJournal(id) {
  try { const j = JSON.parse(localStorage.getItem('ms_recovery') || 'null'); if (j && j.id === id) localStorage.removeItem('ms_recovery'); } catch (e) {}
}
function scheduleSave() {
  if (!currentProjectId) return;
  saveRevision++;saveStatus('Unsaved');clearTimeout(saveTimer);
  writeRecoveryJournal(false);
  saveTimer = setTimeout(() => { writeRecoveryJournal(true); saveCurrentProject().catch(e => console.warn('save failed', e)); }, 1200);
}

let saveChain=Promise.resolve();
function saveCurrentProject() {
  if (!currentProjectId) return Promise.resolve();
  // Capture all state synchronously before awaits. Never mix two projects.
  const id=currentProjectId,name=currentProjectName,snap=snapshot(),revision=++saveRevision;saveStatus('Saving...');
  const j=JSON.parse(snap),thumbs={},files=[];
  for(const c of state.clips){
    thumbs[c.id]=(thumbStore[c.id]||[]).filter(x=>typeof x==='string'&&!x.startsWith('blob:'));
    const key=id+':'+c.id;if(fileStore[c.id]&&!writtenFiles.has(key))files.push({key,blob:fileStore[c.id]});
  }
  if(state.music?.fileId){const key=id+':'+state.music.fileId;if(fileStore[state.music.fileId]&&!writtenFiles.has(key))files.push({key,blob:fileStore[state.music.fileId]});}
  const rec={id,name,updatedAt:Date.now(),snap,thumbs};
  const work=async()=>{
    const db=await idbOpen();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','files'],'readwrite');
      files.forEach(f=>tx.objectStore('files').put(f));tx.objectStore('projects').put(rec);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save aborted'));
    });}finally{db.close();}
    files.forEach(f=>writtenFiles.add(f.key));
    clearRecoveryJournal(id);
    const list=loadIndex().filter(p=>p.id!==id);list.unshift({id,name,updatedAt:rec.updatedAt,dur:Math.round(j.clips.reduce((a,c)=>a+effDur(c),0)),clips:j.clips.length});saveIndex(list);
  };
  const result=saveChain.then(work).then(()=>{if(revision===saveRevision&&id===currentProjectId)saveStatus('Saved on device');},e=>{if(revision===saveRevision&&id===currentProjectId)saveStatus('Save failed');throw e;});saveChain=result.catch(()=>{});return result;
}

function resetEditorState() {
  releaseProjectMedia();
  state.clips = []; state.texts = []; state.overlays = [];state.transitionSeconds=.5; state.transitionType = 'fade'; state.canvasRatio='16:9';state.canvasBlur=false;state.voiceEffect='none';state.beats=[];state.music = null;
  state.adjustments={...AlyaAdjustments.defaults};state.muted = false; state.filter = 'none'; state.fades = false;state.fadeIn=.6;state.fadeOut=.6; state.transitions = false;
  undoStack.length = 0; redoStack.length = 0; selectedClipId = null; playhead = 0;editingTextId=null;$('#text-editor').classList.add('hidden');$('#ov-controls').classList.add('hidden');
  $('#btn-undo').disabled = true; $('#btn-redo').disabled = true;
  refreshAll();
}

async function newProject() {
  clearTimeout(saveTimer);await saveChain;
  const list = loadIndex();
  currentProjectId = 'p' + Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  currentProjectName = 'Project ' + (list.length + 1);
  pause(); resetEditorState();
  await saveCurrentProject();
  showEditor();
}

async function openProject(id) {
  clearTimeout(saveTimer);await saveChain;pause();
  let rec;
  try { rec = await idbGet('projects', id); } catch (e) { rec = null; }
  if (!rec) { alert('Project nahi mila.'); return; }
  showSpinner('Project khul raha hai...');
  try {
    let recovered = false;
    const j = JSON.parse(rec.snap),loadedFiles={};
    try {
      const r = JSON.parse(localStorage.getItem('ms_recovery') || 'null');
      if (r && r.id === id && r.at > (rec.updatedAt || 0) && typeof r.snap === 'string') {
        const rj = JSON.parse(r.snap);
        if (Array.isArray(rj.clips)) { Object.assign(j, rj); recovered = true; }
      }
    } catch (e) {}
    let missing = 0;
    for (const c of j.clips) {
      const f = await idbGet('files', id + ':' + c.id);
      if (f && f.blob) loadedFiles[c.id] = f.blob; else missing++;
    }
    if (j.music && j.music.fileId) {
      const f = await idbGet('files', id + ':' + j.music.fileId);
      if (f && f.blob) loadedFiles[j.music.fileId] = f.blob; else j.music = null;
    }
    if (missing) j.clips = j.clips.filter(c => loadedFiles[c.id]);
    releaseProjectMedia();Object.assign(fileStore,loadedFiles);
    const maxId = [...j.clips, ...(j.texts || []), ...(j.overlays || []), {id:j.music?.fileId||0}].reduce((m, c) => Math.max(m, c.id || 0), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    restore(JSON.stringify(j));
    for (const c of state.clips) {
      if (c.kind === 'image') c.thumbs = [c.url];
      else if (rec.thumbs && rec.thumbs[c.id] && rec.thumbs[c.id].length) c.thumbs = rec.thumbs[c.id];
      thumbStore[c.id] = c.thumbs;
    }
    currentProjectId = id; currentProjectName = rec.name;
    undoStack.length = 0; redoStack.length = 0; $('#btn-undo').disabled = true; $('#btn-redo').disabled = true;
    if (missing) alert(missing + ' media file(s) nahi mili - wo clips hata diye gaye. Dobara add kar sakte ho.');
    showEditor();saveStatus(recovered ? 'Recovered unsaved changes from last session' : 'Saved on device');
    if (recovered) { saveRevision++; setTimeout(() => { saveCurrentProject().catch(e => console.warn('save failed', e)); }, 1500); }
  } finally { hideSpinner(); }
}

async function deleteProject(id) {
  clearTimeout(saveTimer);await saveChain;
  if(id===currentProjectId){currentProjectId=null;currentProjectName='';resetEditorState();}
  await idbDel('projects', id);
  const keys = await idbAllKeys('files');
  for (const k of keys) if (String(k).startsWith(id + ':')) await idbDel('files', k);
  saveIndex(loadIndex().filter(p => p.id !== id));
}

async function downloadBackup(id) {
  if(window.AlyaSave)throw Error('Android backup download abhi supported nahi. Web browser use karo.');
  await saveChain;
  const rec=await idbGet('projects',id);if(!rec)throw Error('Project nahi mila');
  const j=JSON.parse(rec.snap),keys=[...new Set([...j.clips.map(c=>c.id),...(j.music?[j.music.fileId]:[])])],files=[];
  for(const k of keys){const f=await idbGet('files',id+':'+k);if(!f?.blob)throw Error('Media missing; backup incomplete');files.push({id:k,file:f.blob});}
  const blob=await AlyaBackup.pack(rec.name,rec.snap,files),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='mcstudio-project.mcs';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('#btn-import-backup').addEventListener('click',()=>$('#file-backup').click());
$('#file-backup').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    const b=await AlyaBackup.unpack(f);await saveChain;
    const id='p'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),db=await idbOpen();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(['projects','files'],'readwrite');b.files.forEach((blob,k)=>tx.objectStore('files').put({key:id+':'+k,blob}));tx.objectStore('projects').put({id,name:b.name+' (import)',updatedAt:Date.now(),snap:JSON.stringify(b.snapshot),thumbs:{}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
    const list=loadIndex();list.unshift({id,name:b.name+' (import)',updatedAt:Date.now(),clips:b.snapshot.clips.length,dur:Math.round(b.snapshot.clips.reduce((a,c)=>a+effDur(c),0))});saveIndex(list);renderHome();
  }catch(e){alert('Backup import fail: '+e.message);}
});

/* ---------- home screen ---------- */
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function renderHome() {
  const list = loadIndex();
  const el = $('#projects-list');
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<div class="proj-empty">Abhi koi project nahi.<br>Pehla project banao - sab kuch is phone pe save hoga.</div>';
    return;
  }
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'proj-card';
    card.innerHTML = '<div class="proj-info"><div class="proj-name"></div><div class="proj-meta"></div></div>' +
      '<button class="proj-act" data-act="backup" title="Download backup">↓</button>' +
      '<button class="proj-act" data-act="rename" title="Rename">\u270e</button>' +
      '<button class="proj-act danger" data-act="delete" title="Delete">\ud83d\uddd1</button>';
    card.querySelector('.proj-name').textContent = p.name;
    card.querySelector('.proj-meta').textContent = fmtDate(p.updatedAt) + ' \u00b7 ' + fmt(p.dur || 0) + ' \u00b7 ' + (p.clips || 0) + ' clips';
    card.addEventListener('click', async (e) => {
      const act = e.target.closest('.proj-act');
      if (act) {
        e.stopPropagation();
        if (act.dataset.act === 'backup') {
          try { await downloadBackup(p.id); } catch(e) {alert('Backup fail: '+e.message);}
        } else if (act.dataset.act === 'delete') {
          if (confirm('Delete karna hai "' + p.name + '"? Is device se hamesha ke liye hat jayega.')) {
            await deleteProject(p.id); renderHome();
          }
        } else {
          const nn = prompt('Project ka naam:', p.name);
          if (nn && nn.trim()) {
            try { const rec = await idbGet('projects', p.id); if (rec) { rec.name = nn.trim(); await idbPut('projects', rec); } } catch (e2) {}
            const idx = loadIndex(); const it = idx.find(x => x.id === p.id); if (it) { it.name = nn.trim(); saveIndex(idx); }
            if (p.id === currentProjectId) { currentProjectName = nn.trim(); $('#proj-title').textContent = currentProjectName; }
            renderHome();
          }
        }
        return;
      }
      openProject(p.id);
    });
    el.appendChild(card);
  }
}

async function showHome() {
  $('#app').classList.add('hidden');
  $('#home-screen').classList.remove('hidden');
  document.body.classList.add('home-mode');
  try{await saveChain;await recoverIndex();}catch(e){$('#storage-status').textContent='Project database read nahi hua: '+e.message;}
  renderHome();
}
function showEditor() {
  editingTextId=null;textEditChanged=false;$('#text-editor').classList.add('hidden');$('#ov-controls').classList.add('hidden');
  $('#home-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  document.body.classList.remove('home-mode');
  $('#proj-title').textContent = currentProjectName;
  refreshAll();
}

$('#btn-new-project').addEventListener('click', () => { newProject().catch(e => console.warn(e)); });
$('#btn-home').addEventListener('click', async () => {
  if(importingMedia||mediaProcessBusy){flashReply('Media processing complete hone do.');return;}
  pause();
  clearTimeout(saveTimer);
  try { await saveCurrentProject(); } catch (e) {alert('Project save nahi hua: '+e.message);return;}
  showHome();
});
window.addEventListener('pagehide', () => { if (currentProjectId) { writeRecoveryJournal(true); saveCurrentProject(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && currentProjectId) { writeRecoveryJournal(true); saveCurrentProject(); } });


/* Image layers: compressed PNG data lives with the project, never uploaded. */
let selectedOverlay = null;
let imageOverlaySignature = '';
const imageSlot = document.createElement('div');
imageSlot.id = 'image-overlay-slot'; $('#stage').appendChild(imageSlot);
function renderImageOverlays() {
  const vis = (state.overlays || []).filter(o => playhead >= o.start && playhead <= o.end);
  const sig = JSON.stringify(vis)+(vis.some(o=>o.motion)?'|'+playhead.toFixed(2):'');
  if (sig === imageOverlaySignature) return;
  imageOverlaySignature = sig; imageSlot.replaceChildren();
  vis.forEach(o => {
    const img = document.createElement('img'); img.src = o.data;
    img.alt = o.name; img.dataset.overlayId = o.id;
    const {x:px,y:py,size,angle}=AlyaMotion.position(o,playhead);
    img.style.cssText = `opacity:${Number.isFinite(o.opacity)?Math.max(0,Math.min(1,o.opacity)):1};position:absolute;left:${px}%;top:${py}%;width:${size}%;height:auto;transform:translate(-50%,-50%) rotate(${angle}deg);pointer-events:auto;touch-action:none;cursor:move;`;
    img.addEventListener('pointerdown', e => {
      pause(); selectedOverlay = o.id; pushUndo(); const box = $('#stage').getBoundingClientRect();
      const x = e.clientX, y = e.clientY, ox = o.x, oy = o.y; img.setPointerCapture(e.pointerId);
      const move = ev => { o.x = Math.max(0,Math.min(100,ox+(ev.clientX-x)/box.width*100)); o.y = Math.max(0,Math.min(100,oy+(ev.clientY-y)/box.height*100)); if(o.keyframes){o.keyframes[0].x=o.x;o.keyframes[0].y=o.y;}img.style.left=o.x+'%';img.style.top=o.y+'%'; };
      img.addEventListener('pointermove',move);
      img.addEventListener('pointerup',()=>{img.removeEventListener('pointermove',move);imageOverlaySignature='';renderImageOverlays();scheduleSave();},{once:true});
    }); imageSlot.appendChild(img);
  });
}
function renderOverlayList() {
  const box = $('#ov-list'); box.replaceChildren();
  let track=$('#overlay-track');if(!track){track=document.createElement('div');track.id='overlay-track';$('#timeline-scroll').appendChild(track);}track.replaceChildren();
  state.overlays.forEach(o => {
    const b = document.createElement('button'); b.className='chip-btn';
    b.textContent=o.name+' · '+o.start+'s - '+o.end+'s';
    b.onclick=()=>openOverlay(o.id); box.appendChild(b);
    const row=document.createElement('button');row.className='overlay-timing';row.style.marginLeft=(o.start*PX_PER_SEC)+'px';row.style.width=Math.max(1,(o.end-o.start)*PX_PER_SEC)+'px';row.textContent=o.name+' '+o.start+'-'+o.end+'s';row.onclick=()=>{togglePanel('overlays');openOverlay(o.id);};track.appendChild(row);
  });
  const t=$('#transition-type');if(t)t.value=state.transitionType||'fade';
}
function openOverlay(id) {
  const o=state.overlays.find(o=>o.id===id);if(!o)return;
  selectedOverlay=id;pushUndo();$('#ov-opacity').value=Math.round((o.opacity??1)*100);$('#ov-controls').classList.remove('hidden');
  ['x','y','size','angle','start','end'].forEach(k=>$('#ov-'+k).value=o[k]);
  $('#ov-motion').checked=!!o.motion;$('#ov-endx').value=o.endX??80;$('#ov-endy').value=o.endY??50;
  $('#ov-easing').value=o.easing||'linear';renderKeyframeControls(o);
  $('#ov-chroma').checked=!!o.chroma;$('#ov-keycolor').value=o.keyColor||'#00ff00';$('#ov-similarity').value=(o.similarity||.2)*100;
}
function addImageLayer(data,name) {
  pushUndo(); const o={id:nextId++,data,name,x:50,y:50,size:25,angle:0,start:Math.max(0,Math.floor(playhead)),end:Math.max(3,totalDur())};
  state.overlays.push(o); renderOverlayList(); renderImageOverlays();openOverlay(o.id);scheduleSave();
}
$('#watermark-add').onclick=async()=>{
 const text=$('#watermark-text').value.trim(),status=$('#watermark-status');if(!text||!state.clips.length){status.textContent='Text aur project clips pehle add karo.';return;}
 const opacity=Number($('#watermark-opacity').value);if(!Number.isFinite(opacity)||opacity<10||opacity>100){status.textContent='Opacity10-100 rakho.';return;}
 const project=currentProjectId,signature=snapshot(),button=$('#watermark-add');button.disabled=true;status.textContent='Local text layer ban rahi hai...';
 try{const family=/[\u0900-\u097F]/.test(text)?'NotoSansDevPrev':'NotoSansPrev';await loadPreviewFonts();await document.fonts.load('48px "'+family+'"');if(project!==currentProjectId||signature!==snapshot()){status.textContent='Project changed. Add again.';return;}
 const c=document.createElement('canvas');c.width=1024;c.height=100;const ctx=c.getContext('2d');ctx.font='bold 48px "'+family+'"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=$('#watermark-color').value;ctx.fillText(text,512,50,990);const rgba=ctx.getImageData(0,0,c.width,c.height);for(let i=3;i<rgba.data.length;i+=4)rgba.data[i]=Math.round(rgba.data[i]*opacity/100);ctx.putImageData(rgba,0,0);
 const oldPlayhead=playhead;addImageLayer(c.toDataURL('image/png'),'Watermark: '+text);const o=state.overlays[state.overlays.length-1];o.x=78;o.y=90;o.size=36;o.start=0;o.end=Exporter.outputDuration(state);playhead=oldPlayhead;renderImageOverlays();renderOverlayList();scheduleSave();closePanels();togglePanel('overlays');openOverlay(o.id);status.textContent='Watermark added as editable image layer. Undo available.';
 }catch(e){status.textContent='Watermark failed: '+e.message;}finally{button.disabled=false;}
};
$('#ov-duplicate').onclick=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;if(state.overlays.length>=30){alert('Maximum30 image layers.');return;}pushUndo();const copy={...JSON.parse(JSON.stringify(o)),id:nextId++,name:('Copy: '+o.name).slice(0,255)};state.overlays.splice(state.overlays.indexOf(o)+1,0,copy);selectedOverlay=copy.id;renderOverlayList();renderImageOverlays();openOverlay(copy.id);scheduleSave();};
for(const direction of ['backward','forward'])$('#ov-'+direction).onclick=()=>{const i=state.overlays.findIndex(o=>o.id===selectedOverlay),j=i+(direction==='forward'?1:-1);if(i<0||j<0||j>=state.overlays.length)return;pushUndo();[state.overlays[i],state.overlays[j]]=[state.overlays[j],state.overlays[i]];renderOverlayList();renderImageOverlays();scheduleSave();};
$('#ov-opacity-apply').onclick=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay),input=$('#ov-opacity'),n=Number(input.value);if(!o)return;if(input.value.trim()===''||!Number.isFinite(n)||n<0||n>100){$('#ov-opacity-status').textContent='Opacity0-100% rakho.';return;}pushUndo();o.opacity=n/100;renderImageOverlays();scheduleSave();$('#ov-opacity-status').textContent='Layer opacity '+n+'%. Undo available.';};
$('#ov-import').onclick=()=>$('#ov-file').click();
$('#ov-file').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  const project=currentProjectId,url=URL.createObjectURL(f),img=new Image();
  img.onload=()=>{if(project!==currentProjectId){URL.revokeObjectURL(url);return;}const c=document.createElement('canvas'),sc=Math.min(1,768/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*sc));c.height=Math.max(1,Math.round(img.height*sc));c.getContext('2d').drawImage(img,0,0,c.width,c.height);addImageLayer(c.toDataURL('image/png'),f.name);URL.revokeObjectURL(url);};
  img.onerror=()=>{URL.revokeObjectURL(url);alert('Image read nahi hui. PNG/JPG try karo.');};img.src=url;
};
$('#ov-add-emoji').onclick=()=>{
  const text=$('#ov-emoji').value.trim();if(!text)return;
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const ctx=c.getContext('2d');ctx.font='180px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,137,240);
  addImageLayer(c.toDataURL('image/png'),text);
};
['x','y','size','angle','start','end'].forEach(k=>$('#ov-'+k).oninput=()=>{
  const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;
  o[k]=Number($('#ov-'+k).value)||0;o.end=Math.max(o.start+.1,o.end);
  if(o.keyframes&&['x','y','size','angle'].includes(k)){o.keyframes[0][k]=o[k];renderKeyframeControls(o);}if(['start','end'].includes(k))renderKeyframeControls(o);
  renderImageOverlays();renderOverlayList();scheduleSave();
});
['motion','endx','endy'].forEach(k=>$('#ov-'+k).oninput=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;o.motion=$('#ov-motion').checked;o.endX=Number($('#ov-endx').value);o.endY=Number($('#ov-endy').value);renderImageOverlays();scheduleSave();});
function renderKeyframeControls(o){
 const box=$('#ov-keyframes');box.replaceChildren();if(!o.keyframes)return;
 const duration=Math.max(.1,o.end-o.start);
 o.keyframes.forEach((k,i)=>{
  const row=document.createElement('div');row.className='kf-row';
  const label=document.createElement('span');label.textContent='◆ '+(i+1);row.append(label);
  for(const [field,name,value,min,max] of [['at','Time',k.at*duration,0,duration],['x','X',k.x,0,100],['y','Y',k.y,0,100],['size','Size %',k.size??o.size,5,90],['angle','Angle',k.angle??o.angle,-180,180]]){
   const wrap=document.createElement('label');wrap.textContent=name;const input=document.createElement('input');input.type='number';input.step='.01';input.min=min;input.max=max;input.value=Number(value.toFixed(3));input.setAttribute('aria-label',name+' point '+(i+1));
   input.onchange=()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<min||v>max){$('#ov-kf-status').textContent='Value allowed range ke bahar hai.';renderKeyframeControls(o);return;}const at=v/duration;
    if(field==='at'&&o.keyframes.some((p,n)=>n!==i&&Math.abs(p.at-at)<.001)){$('#ov-kf-status').textContent='Points ka time alag rakho.';renderKeyframeControls(o);return;}
    pushUndo();k[field]=field==='at'?at:v;o.keyframes.sort((a,b)=>a.at-b.at);renderKeyframeControls(o);imageOverlaySignature='';renderImageOverlays();scheduleSave();$('#ov-kf-status').textContent='Point updated. Undo available.';
   };wrap.append(input);row.append(wrap);
  }
  const del=document.createElement('button');del.className='chip-btn';del.textContent='×';del.setAttribute('aria-label','Delete point '+(i+1));del.disabled=o.keyframes.length<=2;del.onclick=()=>{pushUndo();o.keyframes.splice(i,1);renderKeyframeControls(o);renderImageOverlays();scheduleSave();};row.append(del);box.append(row);
 });
}
$('#ov-kf-enable').onclick=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;pushUndo();o.keyframes=AlyaMotion.points(o).map(k=>({...k}));o.motion=true;$('#ov-motion').checked=true;renderKeyframeControls(o);renderImageOverlays();scheduleSave();};
$('#ov-kf-add').onclick=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;const at=(playhead-o.start)/Math.max(.1,o.end-o.start);const p=AlyaMotion.points(o);
 if(at<0||at>1||p.some(k=>Math.abs(k.at-at)<.001)){$('#ov-kf-status').textContent='Layer ke andar naya time choose karo (panel band karke timeline seek karo).';return;}if(p.length>=8){$('#ov-kf-status').textContent='Maximum 8 points.';return;}
 pushUndo();const xy=AlyaMotion.position(o,playhead);o.keyframes=[...p.map(k=>({...k})),{at,...xy}].sort((a,b)=>a.at-b.at);o.motion=true;$('#ov-motion').checked=true;renderKeyframeControls(o);renderImageOverlays();scheduleSave();$('#ov-kf-status').textContent='Point added. X/Y edit karo.';};
let trackingPatch=false;
$('#ov-track-patch').onclick=async()=>{
 const o=state.overlays.find(o=>o.id===selectedOverlay),status=$('#ov-track-status');if(!o||trackingPatch)return;
 const info=clipAtTime(o.start+.001),duration=o.end-o.start;
 if(!info||info.clip.kind!=='video'||duration<=0||duration>8||o.end>info.start+effDur(info.clip)+.001){status.textContent='Layer range must fit inside one video clip, max8s. Set Start/End first.';return;}
 if(state.transitions){status.textContent='Tracking uses timeline clock: switch transitions OFF first.';return;}
 const project=currentProjectId,signature=snapshot(),c=info.clip;const start=c.trimStart+(o.start-info.start)*(c.speed||1),end=c.trimStart+(o.end-info.start)*(c.speed||1);
 trackingPatch=true;$('#ov-track-patch').disabled=true;pause();status.textContent='Local patch sampling...';
 try{const ratio={'16:9':16/9,'9:16':9/16,'1:1':1,'4:5':4/5}[state.canvasRatio]||16/9;
 const points=await AlyaTracking.track({url:c.url,start,end,x:o.x,y:o.y,ratio,flipX:!!c.flipX,flipY:!!c.flipY,onProgress:(n,total)=>status.textContent='Patch frames '+n+'/'+total,cancelled:()=>project!==currentProjectId||signature!==snapshot()});
 if(project!==currentProjectId||signature!==snapshot()||!state.overlays.includes(o)){status.textContent='Project changed. Result discarded.';return;}
 pushUndo();o.keyframes=points;o.motion=true;o.easing='linear';$('#ov-motion').checked=true;$('#ov-easing').value='linear';renderKeyframeControls(o);renderImageOverlays();scheduleSave();status.textContent='8 patch points applied. Check for drift in rendered preview; Undo available. No object recognition.';
 }catch(e){status.textContent='Tracking: '+e.message;}finally{trackingPatch=false;$('#ov-track-patch').disabled=false;}
};
$('#ov-kf-clear').onclick=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;pushUndo();delete o.keyframes;renderKeyframeControls(o);renderImageOverlays();scheduleSave();};
$('#ov-easing').onchange=e=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;pushUndo();o.easing=e.target.value;renderImageOverlays();scheduleSave();};
$('#btn-speed-curve').onclick=()=>{
 const c=state.clips.find(x=>x.id===selectedClipId);if(!c||c.kind!=='video'){alert('Video clip select karo.');return;}
 const values=['start','mid','end'].map(k=>Number($('#curve-'+k).value));if(values.some(v=>!Number.isFinite(v)||v<.5||v>4)){alert('Speed 0.5x se 4x ke beech rakho.');return;}
 const smooth=$('#curve-mode').value==='smooth',count=smooth?12:3,min=smooth?3:1.5;
 if(c.trimEnd-c.trimStart<min){alert('Is mode ke liye kam se kam '+min+'s source chahiye.');return;}
 pushUndo();const step=(c.trimEnd-c.trimStart)/count;
 const parts=Array.from({length:count},(_,i)=>{let speed=values[i];if(smooth){const q=(i+.5)/count,h=q<.5?0:1,t=(q-h*.5)*2,e=t*t*(3-2*t);speed=values[h]+(values[h+1]-values[h])*e;}const nc={...c,id:nextId++,trimStart:c.trimStart+i*step,trimEnd:c.trimStart+(i+1)*step,speed};fileStore[nc.id]=c.file;thumbStore[nc.id]=c.thumbs;return nc;});
 state.clips.splice(state.clips.indexOf(c),1,...parts);selectedClipId=parts[0].id;refreshAll();scheduleSave();$('#clip-process-status').textContent=(smooth?'12-step smooth approximation':'3-section ramp')+' applied. Speeds '+values.join(' / ')+'x. Undo available.';
};
$('#voice-effect').onchange=e=>{pushUndo();state.voiceEffect=e.target.value;scheduleSave();};
['chroma','keycolor','similarity'].forEach(k=>$('#ov-'+k).oninput=()=>{const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;o.chroma=$('#ov-chroma').checked;o.keyColor=$('#ov-keycolor').value;o.similarity=Number($('#ov-similarity').value)/100;scheduleSave();});
$('#ov-remove-bg').onclick=async()=>{
 const o=state.overlays.find(o=>o.id===selectedOverlay);if(!o)return;
 const project=currentProjectId,original=o.data;
 const b=$('#ov-remove-bg'),status=$('#ov-remove-status');b.disabled=true;status.textContent='Person mask device pe ban raha hai...';
 try{const {removePersonBackground}=await import('./segmentation.js');const cut=await removePersonBackground(original);if(project!==currentProjectId||!state.overlays.includes(o)||o.data!==original){status.textContent='Layer badal gaya. Cutout apply nahi hua.';return;}pushUndo();o.data=cut;renderImageOverlays();scheduleSave();status.textContent='Cutout applied. Edges check karo; Undo se wapas.';}
 catch(e){status.textContent='Removal failed: '+e.message;}finally{b.disabled=false;}
};
let refiningEdges=false;
$('#ov-edge-apply').onclick=async()=>{
 const o=state.overlays.find(o=>o.id===selectedOverlay),status=$('#ov-edge-status');if(!o||refiningEdges)return;
 const shrink=Number($('#ov-edge-shrink').value),feather=Number($('#ov-edge-feather').value);if(!shrink&&!feather){status.textContent='Choose shrink or feather first.';return;}
 const project=currentProjectId,original=o.data;refiningEdges=true;$('#ov-edge-apply').disabled=true;status.textContent='Refining alpha edges on device...';
 try{const source=new Image();source.src=original;await source.decode();const w=source.naturalWidth,h=source.naturalHeight;if(w*h>768*768)throw Error('Image too large for edge refinement. Reimport it first.');
 const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const rgba=ctx.getImageData(0,0,w,h),alpha=new Uint8ClampedArray(w*h);let transparent=false;
 for(let i=0;i<alpha.length;i++){alpha[i]=rgba.data[i*4+3];if(alpha[i]<250)transparent=true;}if(!transparent)throw Error('No transparent edge found. Use PNG/cutout first.');
 const mask=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=alpha[y*w+x];if(shrink){for(let dy=-shrink;dy<=shrink;dy++)for(let dx=-shrink;dx<=shrink;dx++)a=Math.min(a,x+dx<0||x+dx>=w||y+dy<0||y+dy>=h?0:alpha[(y+dy)*w+x+dx]);}const i=(y*w+x)*4;mask.data[i]=255;mask.data[i+1]=255;mask.data[i+2]=255;mask.data[i+3]=a;}
 ctx.putImageData(mask,0,0);const out=document.createElement('canvas');out.width=w;out.height=h;const oc=out.getContext('2d');oc.filter=feather?'blur('+feather+'px)':'none';oc.drawImage(c,0,0);oc.filter='none';oc.globalCompositeOperation='source-in';oc.drawImage(source,0,0);
 if(project!==currentProjectId||o.data!==original||!state.overlays.includes(o)){status.textContent='Layer changed. Edge result discarded.';return;}
 pushUndo();o.data=out.toDataURL('image/png');renderImageOverlays();scheduleSave();status.textContent='Edges refined. Inspect at full size; Undo available. Repeated apply is cumulative.';
 }catch(e){status.textContent='Edge refinement: '+e.message;}finally{refiningEdges=false;$('#ov-edge-apply').disabled=false;}
};
$('#ov-done').onclick=()=>$('#ov-controls').classList.add('hidden');
$('#ov-delete').onclick=()=>{pushUndo();state.overlays=state.overlays.filter(o=>o.id!==selectedOverlay);$('#ov-controls').classList.add('hidden');renderOverlayList();renderImageOverlays();scheduleSave();};
$('#transition-type').onchange=e=>{pushUndo();state.transitionType=e.target.value;state.transitions=true;refreshAll();scheduleSave();};


/* Destructive media processing produces a new local file, with undo. */
$('#canvas-ratio').onchange=e=>{pushUndo();state.canvasRatio=e.target.value;refreshAll();scheduleSave();};
$('#canvas-blur').onchange=e=>{pushUndo();state.canvasBlur=e.target.checked;scheduleSave();};
let mediaProcessBusy=false;
async function processSelectedClip(mode) {
  if(mediaProcessBusy)return;
  const c=state.clips.find(x=>x.id===selectedClipId)||clipAtTime(playhead)?.clip;
  if(!c){alert('Pehle clip select karo.');return;}
  if(['reverse','chroma'].includes(mode) && (c.kind!=='video'||c.trimEnd-c.trimStart>20)){alert('Video processing: max20 source seconds. Pehle trim karo.');return;}
  let unlock;try{unlock=Exporter.lock();}catch(e){$('#clip-process-status').textContent=e.message;return;}
  const project=currentProjectId,processSnapshot=snapshot(),processInfo=clipAtTime(playhead);
  mediaProcessBusy=true;$('#btn-home').disabled=true;pause();$('#clip-process-status').textContent=mode+' processing...';
  try {
    const ff=await Exporter.ensureLoaded();const ext=(c.name.match(/\.([a-z0-9]+)$/i)||[])[1]||(c.kind==='image'?'png':'mp4');
    const input='process_input.'+ext;
    await ff.writeFile(input,new Uint8Array(await c.file.arrayBuffer()));
    let out,name,kind,dur;
    if(mode==='freeze') {
      const info=processInfo; const t=info?.clip.id===c.id?info.local:c.trimStart;
      out='process_freeze.png';name='Freeze-'+c.name+'.png';kind='image';dur=3;
      const code=await ff.exec(['-ss',String(Math.max(0,t)),'-i',input,'-frames:v','1',out]);if(code!==0)throw Error('Frame extraction failed');
    } else if(mode==='chroma'){
      out='process_chroma.mp4';name='Keyed-'+c.name+'.mp4';kind='video';dur=c.trimEnd-c.trimStart;
      const key=$('#video-key-color').value.slice(1),bg=$('#video-key-background').value.slice(1),similarity=Number($('#video-key-similarity').value)/100;
      const graph=`[0:v]format=rgba,colorkey=0x${key}:${similarity}:0.05[keyed];color=c=0x${bg}:s=${c.w}x${c.h}:r=30:d=${dur.toFixed(3)}[matte];[matte][keyed]overlay=shortest=1,format=yuv420p[out]`;
      const cmd=['-ss',String(c.trimStart),'-to',String(c.trimEnd),'-i',input,'-filter_complex',graph,'-map','[out]','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac','-t',String(dur),'-movflags','+faststart',out];
      if(await ff.exec(cmd)!==0)throw Error('Video key render failed');
    } else {
      out='process_reverse.mp4';name='Reverse-'+c.name+'.mp4';kind='video';dur=c.trimEnd-c.trimStart;
      const audio=await Exporter._probeAudio(ff,[input]);
      const cmd=['-ss',String(c.trimStart),'-to',String(c.trimEnd),'-i',input,'-vf','reverse'];
      if(audio[input])cmd.push('-af','areverse');else cmd.push('-an');
      cmd.push('-c:v','libx264','-preset','ultrafast','-crf','23','-movflags','+faststart',out);
      if(await ff.exec(cmd)!==0)throw Error('Reverse failed');
    }
    const bytes=await ff.readFile(out);const file=new File([bytes],name,{type:kind==='image'?'image/png':'video/mp4'});
    if(project!==currentProjectId||processSnapshot!==snapshot()||!state.clips.includes(c)){$('#clip-process-status').textContent='Project edit ho gaya. Process result apply nahi hua.';return;}
    const id=nextId++,url=mediaUrl(file);const nc={id,kind,file,name,url,srcDuration:dur,trimStart:0,trimEnd:dur,speed:1,w:c.w,h:c.h,thumbs:kind==='image'?[url]:mode==='reverse'?c.thumbs.slice().reverse():await makeThumbs(url,dur)};
    if(project!==currentProjectId||processSnapshot!==snapshot()||!state.clips.includes(c)){$('#clip-process-status').textContent='Project changed while thumbnails loaded. Result discarded.';return;}
    pushUndo();fileStore[id]=file;thumbStore[id]=nc.thumbs;
    const index=state.clips.indexOf(c);
    if(mode==='reverse'||mode==='chroma')state.clips.splice(index,1,nc);else{
      const info=processInfo;
      if(c.kind==='video'&&info?.clip.id===c.id&&info.local>c.trimStart+.1&&info.local<c.trimEnd-.1){
        const second={...c,id:nextId++,trimStart:info.local};fileStore[second.id]=c.file;thumbStore[second.id]=c.thumbs;c.trimEnd=info.local;
        state.clips.splice(index+1,0,nc,second);
      }else state.clips.splice(index+1,0,nc);
    }
    selectedClipId=id;refreshAll();scheduleSave();
    await ff.deleteFile(input);await ff.deleteFile(out);
    $('#clip-process-status').textContent=mode==='freeze'?'3s freeze added.':mode==='chroma'?'Keyed clip ready. Check edges; Undo available.':'Reversed clip ready. Undo available.';
  }catch(e){$('#clip-process-status').textContent='Failed: '+e.message;}
  finally{try{await Exporter.cleanup();}finally{unlock();mediaProcessBusy=false;$('#btn-home').disabled=false;}}
}
$('#btn-freeze').onclick=()=>processSelectedClip('freeze');
$('#btn-reverse').onclick=()=>processSelectedClip('reverse');
$('#btn-video-key').onclick=()=>processSelectedClip('chroma');


/* Local music onset suggestions. No upload, no implied perfect rhythm tracking. */
function detectEnergyPeaks(samples,sampleRate) {
 const hop=Math.max(1,Math.floor(sampleRate*.025)),energies=[];
 for(let i=0;i<samples.length;i+=hop){let sum=0;for(let j=i;j<Math.min(i+hop,samples.length);j++)sum+=samples[j]*samples[j];energies.push(Math.sqrt(sum/hop));}
 const peaks=[];let last=-1;
 for(let i=2;i<energies.length-2;i++){
  const a=Math.max(0,i-20),b=Math.min(energies.length,i+20);let avg=0;for(let j=a;j<b;j++)avg+=energies[j];avg/=b-a;
  const t=i*hop/sampleRate;
  if(energies[i]>.03 && energies[i]>avg*1.5 && energies[i]>=energies[i-1] && energies[i]>energies[i+1] && t-last>.25){peaks.push(Math.round(t*100)/100);last=t;}
  if(peaks.length>=100)break;
 }
 return peaks;
}
function validBeatTimes(){return [...new Set((state.beats||[]).filter(t=>Number.isFinite(t)&&t>=0&&t<=totalDur()).map(t=>Math.round(t*100)/100))].sort((a,b)=>a-b).slice(0,100);}
function renderBeatMarkers(){
 let track=$('#beat-track');if(!track){track=document.createElement('div');track.id='beat-track';$('#timeline-scroll').appendChild(track);}track.replaceChildren();
 const review=$('#beat-review');review.replaceChildren();
 validBeatTimes().forEach(t=>{
  const m=document.createElement('span');m.textContent='◆';m.title=t+'s';m.style.position='absolute';m.style.left=t*PX_PER_SEC+'px';track.appendChild(m);
  const row=document.createElement('div');row.className='beat-row';const seek=document.createElement('button');seek.className='chip-btn';seek.textContent='▶ '+t.toFixed(2)+'s';seek.setAttribute('aria-label','Seek marker '+t);seek.onclick=()=>{pause();playhead=t;syncStageToPlayhead(true);renderOverlays();renderImageOverlays();updateTimeDisplay();updatePlayheadUI();$('#beat-time').value=t;};
  const input=document.createElement('input');input.type='number';input.step='.01';input.min=0;input.max=totalDur();input.value=t;input.setAttribute('aria-label','Marker time '+t);input.onchange=()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<0||v>totalDur()||validBeatTimes().some(q=>q!==t&&Math.abs(q-v)<.05)){$('#beat-status').textContent='Valid project time aur kam se kam0.05s gap rakho.';renderBeatMarkers();return;}pushUndo();state.beats=validBeatTimes().map(q=>q===t?Math.round(v*100)/100:q).sort((a,b)=>a-b);renderBeatMarkers();scheduleSave();};
  const del=document.createElement('button');del.className='chip-btn danger';del.textContent='×';del.setAttribute('aria-label','Delete marker '+t);del.onclick=()=>{pushUndo();state.beats=validBeatTimes().filter(q=>q!==t);renderBeatMarkers();scheduleSave();};row.append(seek,input,del);review.append(row);
 });
}
function addBeatMarker(t){const times=validBeatTimes();if(!Number.isFinite(t)||t<0||t>totalDur()||times.some(q=>Math.abs(q-t)<.05)){$('#beat-status').textContent='Project ke andar naya time choose karo (minimum0.05s gap).';return;}if(times.length>=100){$('#beat-status').textContent='Maximum100 markers.';return;}pushUndo();state.beats=[...times,Math.round(t*100)/100].sort((a,b)=>a-b);renderBeatMarkers();scheduleSave();$('#beat-status').textContent='Marker added. Review/edit/remove before split. Undo available.';}
$('#beat-add').onclick=()=>addBeatMarker(Number($('#beat-time').value));$('#beat-add-playhead').onclick=()=>addBeatMarker(playhead);$('#beat-clear').onclick=()=>{pushUndo();state.beats=[];renderBeatMarkers();scheduleSave();};
$('#btn-beats').onclick=async()=>{
 const status=$('#beat-status');if(!state.music?.file){status.textContent='Pehle music add karo.';return;}
 const project=currentProjectId,music=state.music,sourceStart=state.music.sourceStart||0,button=$('#btn-beats');button.disabled=true;
 let ctx;try{ctx=new AudioContext();
  status.textContent='Music decode ho rahi hai, device pe...';const audio=await ctx.decodeAudioData(await music.file.arrayBuffer());
  if(project!==currentProjectId||state.music!==music||(state.music.sourceStart||0)!==sourceStart){status.textContent='Music/project badal gaya. Markers apply nahi hue.';return;}
  if(audio.duration>120){status.textContent='Max 2 min music. Short audio choose karo.';return;}
  pushUndo();state.beats=detectEnergyPeaks(audio.getChannelData(0),audio.sampleRate).map(t=>Math.round((t-sourceStart)*100)/100).filter(t=>t>=0&&t<=totalDur());renderBeatMarkers();scheduleSave();
  status.textContent=state.beats.length+' suggested markers. Review karo; silence/soft music mein miss ho sakte hain.';
 }catch(e){status.textContent='Beat analysis failed: '+e.message;}finally{if(ctx)ctx.close();button.disabled=false;}
};
$('#btn-cut-beats').onclick=()=>{
 const times=validBeatTimes();if(!times.length){$('#beat-status').textContent='Pehle markers add/suggest karo.';return;}
 if(state.transitions){$('#beat-status').textContent='Exact marker cuts ke liye pehle transitions OFF karo. Overlap timing alag hoti hai.';return;}
 pushUndo();state.beats=times;let offset=0,n=0;const out=[];
 for(const c of state.clips){const dur=effDur(c);const cuts=times.filter(t=>t>offset+.15&&t<offset+dur-.15).filter((t,i,arr)=>!i||t-arr[i-1]>=.15);
  if(c.kind==='image'||!cuts.length)out.push(c);else{let start=c.trimStart;for(const end of [...cuts.map(t=>c.trimStart+(t-offset)*(c.speed||1)),c.trimEnd]){const part={...c,id:nextId++,trimStart:start,trimEnd:end};fileStore[part.id]=c.file;thumbStore[part.id]=c.thumbs;out.push(part);start=end;n++;}}
  offset+=dur;
 }state.clips=out;refreshAll();scheduleSave();$('#beat-status').textContent=n+' segments created. No clips removed; Undo available.';
};
window.__alya.detectEnergyPeaks=detectEnergyPeaks;

/* ---------- init ---------- */
loadPreviewFonts().catch(e=>console.warn('font preview load failed',e));
bindTextEditor();
refreshAIStatus();
renderFilterChips();
renderTemplateChips();
refreshAll();
showHome();
})();

// Home screen: quick actions, tool tiles, search, tabs
(function homeUI() {
  const $id = (i) => document.getElementById(i);
  const toast = (msg) => { const t = $id('home-toast'); if (t) { t.textContent = msg; setTimeout(() => { if (t.textContent === msg) t.textContent = ''; }, 2500); } };
  const startProject = () => newProject().catch(e => console.warn(e));
  const openPicker = () => setTimeout(() => $id('file-video') && $id('file-video').click(), 60);
  const qi = $id('btn-quick-import');
  if (qi) qi.addEventListener('click', () => { startProject(); openPicker(); });
  const ep = $id('btn-edit-photo');
  if (ep) ep.addEventListener('click', () => { startProject(); openPicker(); });
  document.querySelectorAll('.tool-tile, .home-tab').forEach(tile => {
    tile.addEventListener('click', () => {
      if (tile.dataset.soon) { toast(tile.querySelector('.tile-name, small') ? (tile.querySelector('.tile-name') || tile.querySelector('small')).textContent + ' — coming soon' : 'Coming soon'); return; }
      if (tile.dataset.scroll === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (tile.dataset.scroll === 'projects') { const h = $id('home-projects-head'); if (h) h.scrollIntoView({ behavior: 'smooth' }); return; }
      if (tile.dataset.toolPanel) { startProject(); setTimeout(() => togglePanel(tile.dataset.toolPanel), 80); }
    });
  });
  const st = $id('btn-home-search'), si = $id('home-search');
  if (st && si) {
    st.addEventListener('click', () => { si.classList.toggle('hidden'); if (!si.classList.contains('hidden')) si.focus(); else { si.value = ''; filterProjects(''); } });
    si.addEventListener('input', () => filterProjects(si.value));
  }
  function filterProjects(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll('#projects-list .proj-card').forEach(c => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
})();
