/* Portable, bounded project archives. No remote URLs or executable fields. */
window.AlyaBackup=(()=>{
'use strict';
const LIMIT=20*1024*1024;
const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid number');return v;};
const text=(v,n=500)=>{if(typeof v!=='string'||v.length>n)throw Error('Invalid text');return v;};
const id=v=>num(v,1,1000000000);
function data(v,image=false){
 text(v,28*1024*1024);
 const m=v.match(/^data:((?:video\/(?:mp4|webm|quicktime))|(?:audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm))|(?:image\/(?:png|jpeg|webp)));base64,([A-Za-z0-9+/]*={0,2})$/);
 if(!m||(image&&!m[1].startsWith('image/')))throw Error('Unsupported embedded media');
 const raw=atob(m[2]);if(raw.length>LIMIT)throw Error('Media too large');
 return {type:m[1],bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))};
}
async function encode(file){return await new Promise((r,j)=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.onerror=()=>j(Error('Media read failed'));fr.readAsDataURL(file);});}
async function pack(name,snap,files){
 let size=new Blob([snap]).size;for(const f of files)size+=f.file.size;
 if(size>LIMIT)throw Error('Backup limit 20MB (media + project). Chhota project use karo.');
 const media=[];for(const f of files)media.push({id:f.id,name:f.file.name||'media',data:await encode(f.file)});
 return new Blob([JSON.stringify({format:'alya-project',version:1,name,snapshot:JSON.parse(snap),media})],{type:'application/json'});
}
async function unpack(file){
 if(file.size>30*1024*1024)throw Error('Backup file limit 30MB');
 const b=JSON.parse(await file.text());if(b.format!=='alya-project'||b.version!==1)throw Error('Minecraft Studio backup v1 chahiye');
 const name=text(b.name,120),s=b.snapshot;if(!s||!Array.isArray(s.clips)||s.clips.length>100||!Array.isArray(b.media)||b.media.length>101)throw Error('Invalid project');
 const files=new Map();let size=0;
 for(const m of b.media){const k=id(m.id);if(files.has(k))throw Error('Duplicate media');const d=data(m.data);size+=d.bytes.length;if(size>LIMIT)throw Error('Backup limit 20MB');files.set(k,new File([d.bytes],text(m.name,255),{type:d.type}));}
 const clips=s.clips.map(c=>{const k=id(c.id),f=files.get(k);if(!f)throw Error('Missing media');if(!['image','video'].includes(c.kind)||!f.type.startsWith(c.kind+'/'))throw Error('Media type mismatch');const d=num(c.srcDuration,.01,86400),a=num(c.trimStart,0,d),z=num(c.trimEnd,a+.01,d);return {...(c.volume===undefined?{}:{volume:num(c.volume,0,1)}),...(c.flipX===undefined?{}:{flipX:!!c.flipX}),...(c.flipY===undefined?{}:{flipY:!!c.flipY}),id:k,kind:c.kind,name:text(c.name,255),srcDuration:d,trimStart:a,trimEnd:z,speed:num(c.speed,.5,4),w:num(c.w,1,16384),h:num(c.h,1,16384)};});
 if(!Array.isArray(s.texts)||s.texts.length>200||!Array.isArray(s.overlays)||s.overlays.length>30)throw Error('Too many layers');
 const texts=s.texts.map(t=>({...((t.posX===undefined)?{}:{posX:num(t.posX,0,100)}),id:id(t.id),content:text(t.content,10000),font:['NotoSans','NotoSansDevanagari'].includes(t.font)?t.font:'NotoSans',size:num(t.size,1,500),color:color(t.color),posY:num(t.posY,0,100),anim:['none','fade','rise','blink'].includes(t.anim)?t.anim:'none',start:num(t.start,0,86400),end:num(t.end,t.start,86400)}));
 const overlays=s.overlays.map(o=>{let motion={};if(o.keyframes!==undefined){if(!Array.isArray(o.keyframes)||o.keyframes.length<2||o.keyframes.length>8)throw Error('Invalid keyframes');const points=o.keyframes.map(k=>({at:num(k.at,0,1),x:num(k.x,0,100),y:num(k.y,0,100),...(k.size===undefined?{}:{size:num(k.size,5,90)}),...(k.angle===undefined?{}:{angle:num(k.angle,-180,180)})}));if(points.some((k,i)=>i&&k.at-points[i-1].at<.001))throw Error('Keyframes must be ordered');motion={keyframes:points};}if(o.easing!==undefined){if(!['linear','smooth'].includes(o.easing))throw Error('Invalid easing');motion.easing=o.easing;}size+=new Blob([o.data]).size;data(o.data,true);return {...motion,...(o.opacity===undefined?{}:{opacity:num(o.opacity,0,1)}),id:id(o.id),name:text(o.name,255),data:o.data,size:num(o.size,1,200),angle:num(o.angle||0,-360,360),x:num(o.x,-100,200),y:num(o.y,-100,200),start:num(o.start,0,86400),end:num(o.end,o.start,86400),motion:!!o.motion,endX:num(o.endX??o.x,-100,200),endY:num(o.endY??o.y,-100,200),chroma:!!o.chroma,keyColor:color(o.keyColor||'#00ff00'),similarity:num(o.similarity||.2,.01,.7)};});
 if(size>LIMIT)throw Error('Backup limit 20MB');
 let music=null;if(s.music){const k=id(s.music.fileId);if(!files.get(k)?.type.startsWith('audio/'))throw Error('Missing audio');music={fileId:k,name:text(s.music.name,255),volume:num(s.music.volume,0,1),sourceStart:s.music.sourceStart===undefined?0:num(s.music.sourceStart,0,86400)};}
 const ids=[...clips,...texts,...overlays].map(x=>x.id);if(music)ids.push(music.fileId);if(new Set(ids).size!==ids.length)throw Error('Duplicate IDs');
 const pick=(v,list,fallback)=>list.includes(v)?v:fallback;
 const adjustments=s.adjustments===undefined?undefined:{brightness:num(s.adjustments.brightness,-.3,.3),contrast:num(s.adjustments.contrast,.5,1.5),saturation:num(s.adjustments.saturation,0,2)};
 return {name,files,snapshot:{clips,texts,overlays,music,...(adjustments?{adjustments}:{}),filter:pick(s.filter,Object.keys(Exporter.FILTERS),'none'),canvasRatio:pick(s.canvasRatio,['16:9','9:16','1:1','4:5'],'16:9'),canvasBlur:!!s.canvasBlur,voiceEffect:pick(s.voiceEffect,['none','high','deep','radio','echo'],'none'),transitionSeconds:s.transitionSeconds===undefined?.5:num(s.transitionSeconds,.2,2),transitionType:pick(s.transitionType,['fade','zoomin','slideleft','slideright','slideup','slidedown','pixelize','hblur','wipeleft','circleopen'],'fade'),beats:Array.isArray(s.beats)?s.beats.slice(0,1000).map(v=>num(v,0,86400)):[],muted:!!s.muted,fades:!!s.fades,fadeIn:s.fadeIn===undefined?.6:num(s.fadeIn,0,10),fadeOut:s.fadeOut===undefined?.6:num(s.fadeOut,0,10),transitions:!!s.transitions}};
}
function color(v){if(typeof v!=='string'||!/^#[a-fA-F0-9]{6}$/.test(v))throw Error('Invalid color');return v;}
return {pack,unpack};
})();
