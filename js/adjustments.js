/* Bounded project color adjustments shared by preview and renderer. */
window.AlyaAdjustments=(()=>{
const defaults={brightness:0,contrast:1,saturation:1};
function get(p){const a=p.adjustments||{};return {brightness:Number.isFinite(a.brightness)?Math.max(-.3,Math.min(.3,a.brightness)):0,contrast:Number.isFinite(a.contrast)?Math.max(.5,Math.min(1.5,a.contrast)):1,saturation:Number.isFinite(a.saturation)?Math.max(0,Math.min(2,a.saturation)):1};}
function active(p){const a=get(p);return a.brightness!==0||a.contrast!==1||a.saturation!==1;}
return {defaults,get,active};
})();
