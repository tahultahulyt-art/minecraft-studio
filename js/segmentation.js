/* MediaPipe person-only image cutout. Runtime is loaded only when requested. */
let segmenterPromise;
export async function removePersonBackground(dataUrl) {
  if(!segmenterPromise)segmenterPromise=(async()=>{
    const {FilesetResolver,ImageSegmenter}=await import('../vendor/segmentation/vision_bundle.mjs');
    const files=await FilesetResolver.forVisionTasks(new URL('../vendor/segmentation/wasm',import.meta.url).href);
    return ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../vendor/segmentation/selfie_segmenter.tflite',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
  })().catch(e=>{segmenterPromise=null;throw e;});
  const segmenter=await segmenterPromise;
  const img=new Image();img.src=dataUrl;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  segmenter.segment(img,result=>{
    const mask=result.categoryMask;if(!mask)throw Error('No person mask');
    const a=mask.getAsUint8Array();
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const m=a[Math.floor(y*mask.height/canvas.height)*mask.width+Math.floor(x*mask.width/canvas.width)];
      // This pinned binary returns class 0 for the person; validated on a portrait fixture.
      if(m!==0)pixels.data[(y*canvas.width+x)*4+3]=0;
    }
  });
  ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
