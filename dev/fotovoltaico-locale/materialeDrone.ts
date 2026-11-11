export function validaFotoDrone(file:{type:string;size:number}) {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))return "Usa immagini JPG, PNG o WebP. I file RAW e i GeoTIFF richiedono un’importazione dedicata.";
  if(file.size<=0||file.size>15*1024*1024)return "Ogni immagine deve essere non vuota e pesare al massimo 15 MB.";
  return null;
}
