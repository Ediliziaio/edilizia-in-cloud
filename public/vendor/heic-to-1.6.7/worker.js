import buildLibheif from './libheif.js';
// Tutta la conversione resta sul dispositivo. L'originale non viene modificato.
self.onmessage = async ({data:file}) => {
 let decoder,lib,images=[];
 try {
  lib=buildLibheif();decoder=new lib.HeifDecoder();
  images=decoder.decode(new Uint8Array(await file.arrayBuffer()));
  const primary=images.find(i=>i.is_primary()) || images[0];
  if(!primary)throw new Error('HEIC illeggibile');
  const width=primary.get_width(),height=primary.get_height();
  if(width<1||height<1||width*height>16000000)throw new Error('Foto troppo grande');
  const rgba={width,height,data:new Uint8ClampedArray(width*height*4)};
  await new Promise((resolve,reject)=>primary.display(rgba,r=>r?resolve():reject(new Error('Decodifica non riuscita'))));
  const original=new OffscreenCanvas(width,height),ctx=original.getContext('2d');
  if(!ctx)throw new Error('Canvas non disponibile');
  ctx.putImageData(new ImageData(rgba.data,width,height),0,0);
  const scale=Math.min(1,2560/Math.max(width,height));
  const canvas=new OffscreenCanvas(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
  canvas.getContext('2d').drawImage(original,0,0,canvas.width,canvas.height);
  const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.94});
  self.postMessage({blob});
 }catch{self.postMessage({error:'Conversione HEIC non riuscita'});}
 finally{for(const image of images)image.free();if(decoder?.decoder)lib.heif_context_free(decoder.decoder);}
};
