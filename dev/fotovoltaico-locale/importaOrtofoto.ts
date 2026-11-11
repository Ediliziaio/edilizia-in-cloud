import {fromArrayBuffer} from "./dependencies/geotiff";
import {centraRaster,leggiWorldFile,type Affine,type OrtoLocale} from "./rilievoLocale";
function verificaDimensioni(w:number,h:number){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<2||h<2||w*h>64000000)throw new Error("Esporta un’ortofoto di massimo 64 megapixel.");}
export function affineGeoTiff(tags:{matrice?:number[];scala?:number[];legame?:number[];pixelPunto?:boolean}):Affine{
 let a:Affine;
 if(tags.matrice?.length===16){const m=tags.matrice;if(Math.abs(m[2])+Math.abs(m[6])+Math.abs(m[12])+Math.abs(m[13])+Math.abs(m[14])+Math.abs(m[15]-1)>1e-10)throw new Error("Trasformazione GeoTIFF 3D non supportata: esporta un’ortofoto planare.");a=[m[0],m[1],m[3],m[4],m[5],m[7]];}
 else if(tags.scala?.length&&tags.legame&&tags.legame.length>=6){const [sx,sy]=tags.scala,[i,j,,x,y]=tags.legame;a=[sx,0,x-i*sx,0,-sy,y+j*sy];}
 else throw new Error("GeoTIFF privo di scala e georeferenziazione.");
 if(tags.pixelPunto){a[2]-=(a[0]+a[1])/2;a[5]-=(a[3]+a[4])/2;}return a;
}
export async function importaOrtofoto(file:File,worldFile?:File,crsManuale="Locale in metri",risoluzioneManuale?:number):Promise<OrtoLocale>{
 if(file.size<=0||file.size>150*1024*1024)throw new Error("L’ortofoto deve pesare al massimo 150 MB.");
 let w:number,h:number,blob:Blob,affine:Affine,crs=crsManuale,metrica:OrtoLocale["metrica"]="manuale";
 if(/\.tiff?$/i.test(file.name)){
  const tiff=await fromArrayBuffer(await file.arrayBuffer()),image=await tiff.getImage();w=image.getWidth();h=image.getHeight();verificaDimensioni(w,h);
  const keys=image.getGeoKeys(),epsg=Number(keys?.ProjectedCSTypeGeoKey),units=Number(keys?.ProjLinearUnitsGeoKey??9001);
  if(!epsg||epsg===32767||epsg===3857||units!==9001)throw new Error("Esporta il GeoTIFF in un sistema proiettato metrico locale, per esempio UTM; gradi e Web Mercator non sono misure del tetto.");
  const dir=image.getFileDirectory();if(Number(await dir.loadValue("PhotometricInterpretation"))!==2)throw new Error("Esporta un’ortofoto RGB: raster di quote, grigi o palette non sono supportati.");
  const matrice=await dir.loadValue("ModelTransformation"),scala=await dir.loadValue("ModelPixelScale"),legame=await dir.loadValue("ModelTiepoint"),bits=await dir.loadValue("BitsPerSample");
  if(bits&&Array.from(bits).some(b=>Number(b)!==8))throw new Error("Esporta l’ortofoto RGB a 8 bit; i raster altimetrici non sono immagini RGB.");
  affine=affineGeoTiff({matrice:matrice?Array.from(matrice).map(Number):undefined,scala:scala?Array.from(scala).map(Number):undefined,legame:legame?Array.from(legame).map(Number):undefined,pixelPunto:keys?.GTRasterTypeGeoKey===2});crs=`EPSG:${epsg}`;metrica="georiferita";
  const fattore=Math.min(1,2048/Math.max(w,h)),ow=Math.max(2,Math.round(w*fattore)),oh=Math.max(2,Math.round(h*fattore));
  const rgb=await image.readRGB({width:ow,height:oh,interleave:true,enableAlpha:true}),canali=rgb.length/(ow*oh);
  if(canali!==3&&canali!==4)throw new Error("Ortofoto RGB non leggibile.");
  const canvas=document.createElement("canvas");canvas.width=ow;canvas.height=oh;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Impossibile preparare l’ortofoto.");
  const out=ctx.createImageData(ow,oh);for(let p=0;p<ow*oh;p++){out.data[p*4]=rgb[p*canali];out.data[p*4+1]=rgb[p*canali+1];out.data[p*4+2]=rgb[p*canali+2];out.data[p*4+3]=canali===4?rgb[p*4+3]:255;}ctx.putImageData(out,0,0);
  blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Conversione dell’ortofoto non riuscita.")),"image/png"));
  affine=[affine[0]*w/ow,affine[1]*h/oh,affine[2],affine[3]*w/ow,affine[4]*h/oh,affine[5]];w=ow;h=oh;
 }else{
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Usa GeoTIFF RGB oppure JPG, PNG o WebP con world file o scala nota.");
  const image=await createImageBitmap(file);try{w=image.width;h=image.height;verificaDimensioni(w,h);}finally{image.close();}blob=file;
  if(worldFile){affine=leggiWorldFile(await worldFile.text());metrica="georiferita";if(!crsManuale.trim())throw new Error("Indica il sistema di coordinate metrico del world file.");}
  else{if(!Number.isFinite(risoluzioneManuale)||!risoluzioneManuale||risoluzioneManuale<.001||risoluzioneManuale>2)throw new Error("Indica la risoluzione nota dell’ortofoto in metri per pixel (0,001–2).");affine=[risoluzioneManuale,0,0,0,-risoluzioneManuale,0];}
 }
 const centrato=centraRaster(affine,w!,h!);return{nome:file.name,blob:blob!,originale:file,larghezza:w!,altezza:h!,...centrato,crs,metrica};
}
