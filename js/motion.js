/* Shared image-layer motion math. No external services. */
window.AlyaMotion=(()=>{
 'use strict';
 function points(o){
  if(Array.isArray(o.keyframes)&&o.keyframes.length>=2&&o.keyframes.length<=8){
   const p=o.keyframes.filter(k=>k&&[k.at,k.x,k.y].every(Number.isFinite)&&k.at>=0&&k.at<=1&&k.x>=0&&k.x<=100&&k.y>=0&&k.y<=100&&(k.size===undefined||(Number.isFinite(k.size)&&k.size>=5&&k.size<=90))&&(k.angle===undefined||(Number.isFinite(k.angle)&&k.angle>=-180&&k.angle<=180))).sort((a,b)=>a.at-b.at);
   if(p.length===o.keyframes.length&&p.every((k,i)=>!i||k.at-p[i-1].at>=.001))return p;
  }
  return [{at:0,x:o.x,y:o.y},{at:1,x:o.endX??o.x,y:o.endY??o.y}];
 }
 function eased(q,o){return o.easing==='smooth'?q*q*(3-2*q):q;}
 const value=(o,k,axis)=>k[axis]??o[axis]??(axis==='size'?25:0);
 function position(o,time){
  const axes=['x','y','size','angle'],fixed=()=>Object.fromEntries(axes.map(axis=>[axis,o[axis]??(axis==='size'?25:0)]));
  if(!o.motion)return fixed();const p=points(o),q=Math.max(0,Math.min(1,(time-o.start)/Math.max(.1,o.end-o.start)));
  if(q<=p[0].at)return Object.fromEntries(axes.map(axis=>[axis,value(o,p[0],axis)]));
  for(let i=1;i<p.length;i++){if(q<=p[i].at){const a=p[i-1],b=p[i],f=eased((q-a.at)/(b.at-a.at),o);return Object.fromEntries(axes.map(axis=>[axis,value(o,a,axis)+(value(o,b,axis)-value(o,a,axis))*f]));}}
  return Object.fromEntries(axes.map(axis=>[axis,value(o,p[p.length-1],axis)]));
 }
 function expression(o,axis,divisor=100){
  if(!o.motion)return((o[axis]??0)/divisor).toFixed(6);const p=points(o),duration=Math.max(.1,o.end-o.start),n=v=>Number(v).toFixed(6),val=k=>value(o,k,axis)/divisor;
  let expr=n(val(p[p.length-1]));
  for(let i=p.length-1;i>=1;i--){const a=p[i-1],b=p[i],end=o.start+b.at*duration;let q=`clip((t-${n(o.start+a.at*duration)})/${n((b.at-a.at)*duration)},0,1)`;if(o.easing==='smooth')q=`(${q}*${q}*(3-2*${q}))`;const seg=`(${n(val(a))}+${n(val(b)-val(a))}*${q})`;expr=`if(lt(t,${n(end)}),${seg},${expr})`;}
  return expr;
 }
 return {points,position,expression};
})();
