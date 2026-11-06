/* Experimental local patch matching. Not semantic/object recognition. */
window.AlyaTracking=(()=>{
'use strict';
function patch(data,w,h,cx,cy,r=5){if(cx<r||cy<r||cx>=w-r||cy>=h-r)return null;const out=[];for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const i=(y*w+x)*4;out.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114);}return out;}
function variance(p){const m=p.reduce((a,b)=>a+b,0)/p.length;return p.reduce((s,v)=>s+(v-m)**2,0)/p.length;}
function match(data,w,h,template,previous,radius=18){let best=null;for(let y=Math.max(5,previous.y-radius);y<=Math.min(h-6,previous.y+radius);y++)for(let x=Math.max(5,previous.x-radius);x<=Math.min(w-6,previous.x+radius);x++){const p=patch(data,w,h,x,y);let score=0;for(let i=0;i<p.length;i++)score+=Math.abs(p[i]-template[i]);score/=p.length;if(!best||score<best.score){best={x,y,score};}}return best;}
async function track({url,start,end,x,y,ratio=16/9,flipX=false,flipY=false,onProgress,cancelled}){
 const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 const width=160,height=Math.round(width/ratio),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 function wait(event,action){return new Promise((resolve,reject)=>{const done=e=>{clearTimeout(timer);video.removeEventListener(event,loaded);video.removeEventListener('error',failed);e?reject(e):resolve();};const loaded=()=>done(),failed=()=>done(Error('Video decode failed'));const timer=setTimeout(()=>done(Error('Video decode timeout')),10000);video.addEventListener(event,loaded,{once:true});video.addEventListener('error',failed,{once:true});action();});}
 try{
  await wait('loadedmetadata',()=>video.src=url);let previous={x:Math.round(x/100*width),y:Math.round(y/100*height)},template,points=[];
  for(let i=0;i<8;i++){
   if(cancelled?.())throw Error('Project/layer changed. Tracking stopped.');const at=i/7,time=Math.max(.001,Math.min(video.duration-.001,start+(end-start)*at));
   if(Math.abs(video.currentTime-time)>.0005||video.readyState<2)await wait('seeked',()=>video.currentTime=time);
   ctx.fillStyle='black';ctx.fillRect(0,0,width,height);const scale=Math.min(width/video.videoWidth,height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;ctx.save();ctx.translate(flipX?width:0,flipY?height:0);ctx.scale(flipX?-1:1,flipY?-1:1);ctx.drawImage(video,(width-w)/2,(height-h)/2,w,h);ctx.restore();const data=ctx.getImageData(0,0,width,height).data;
   if(i===0){template=patch(data,width,height,previous.x,previous.y);if(!template||variance(template)<100)throw Error('Choose a textured detail away from the frame edge. Plain colors cannot be tracked reliably.');}
   else{const result=match(data,width,height,template,previous);if(!result||result.score>32)throw Error('Patch lost or changed. No motion applied; try shorter range/better contrast.');previous={x:result.x,y:result.y};}
   points.push({at,x:previous.x/width*100,y:previous.y/height*100});onProgress?.(i+1,8);
  }
  return points;
 }finally{video.pause();video.removeAttribute('src');video.load();}
}
return {track,patch,match,variance};
})();
