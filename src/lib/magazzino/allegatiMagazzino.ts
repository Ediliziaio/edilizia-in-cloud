import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
export const MAX_WAREHOUSE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_WAREHOUSE_PHOTOS = 10;
export const WAREHOUSE_DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/bmp,image/tiff";
export const WAREHOUSE_PHOTO_ACCEPT = WAREHOUSE_DOCUMENT_ACCEPT.replace("application/pdf,", "");
async function bytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=()=>reject(new Error("Impossibile leggere il file."));reader.readAsArrayBuffer(blob); });
}
/** Validazione prima dell'invio; i permessi e i limiti del bucket restano responsabilità del servizio. */
export async function validateWarehouseFile(file: File, photoOnly = false, maxBytes = MAX_WAREHOUSE_FILE_BYTES): Promise<string> {
  if (!file.size || file.size > maxBytes) throw new Error(`Scegli un file non vuoto, fino a ${maxBytes / 1024 / 1024} MB.`);
  const head=await bytes(file.slice(0,1024));const text=String.fromCharCode(...head);let type="";
  if(head[0]===255&&head[1]===216&&head[2]===255)type="image/jpeg";
  else if([137,80,78,71,13,10,26,10].every((n,i)=>head[i]===n))type="image/png";
  else if(text.startsWith("%PDF-"))type="application/pdf";
  else if(/^GIF8[79]a/.test(text))type="image/gif";
  else if(text.startsWith("RIFF")&&text.slice(8,12)==="WEBP")type="image/webp";
  else if(text.slice(4,8)==="ftyp"&&/^(avif|avis)/.test(text.slice(8,12)))type="image/avif";
  else if(text.slice(4,8)==="ftyp"&&/^(heic|heix|hevc|hevx|mif1|msf1)/.test(text.slice(8,12)))type="image/heic";
  else if(text.startsWith("BM"))type="image/bmp";
  else if(text.startsWith("II*\0")||text.startsWith("MM\0*"))type="image/tiff";
  const declared=file.type.toLowerCase().replace("image/jpg","image/jpeg");
  const compatible=declared===type || !declared || declared==="application/octet-stream" || (type==="image/heic"&&declared==="image/heif");
  const extensions:Record<string,string[]>={"image/jpeg":["jpg","jpeg"],"image/png":["png"],"application/pdf":["pdf"],"image/gif":["gif"],"image/webp":["webp"],"image/avif":["avif"],"image/heic":["heic","heif"],"image/bmp":["bmp"],"image/tiff":["tif","tiff"]};
  if (!type || !compatible || !extensions[type]?.includes(file.name.split(".").pop()?.toLowerCase() ?? "") || (photoOnly&&type==="application/pdf")) throw new Error("Formato non valido: scegli una foto oppure un PDF coerente con il contenuto. SVG e file eseguibili non sono ammessi.");
  return type;
}
export function warehouseDocumentReference(bucket: string, path: string) {return `storage://${bucket}/${path}`;}
/** I vecchi URL pubblici sono convertiti in percorsi, mai aperti come URL arbitrari. */
export function warehouseDocumentTarget(reference: string) {
  const allowed=["goods_receipts","ddt-ricezione","ddt_attachments","order-attachments"];
  const direct=/^storage:\/\/([^/]+)\/(.+)$/.exec(reference);
  let bucket=direct?.[1]??"goods_receipts",path=direct?.[2]??reference;
  if(/^https?:\/\//i.test(reference)){
    const u=new URL(reference);const match=/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(u.pathname);
    if(!match)throw new Error("Riferimento dell’allegato non riconosciuto.");bucket=match[1];path=decodeURIComponent(match[2]);
  } else if (!direct && /^[a-z][a-z0-9+.-]*:/i.test(reference)) throw new Error("Riferimento dell’allegato non valido.");
  path=decodeURIComponent(path);
  if(!allowed.includes(bucket)||!path||path.startsWith("/")||path.includes("\\")||path.split("/").some(p=>p===".."||p==="."))throw new Error("Percorso dell’allegato non valido.");
  return {bucket,path};
}
export async function openWarehouseDocument(reference: string) {
  const viewer=window.open("about:blank","_blank");
  if(!viewer){toast.error("Il browser ha bloccato l’apertura dell’allegato.");return;}
  viewer.opener=null;
  try {
    const {bucket,path}=warehouseDocumentTarget(reference);
    const {data,error}=await supabase.storage.from(bucket).download(path);
    if(error||!data)throw new Error("Allegato non disponibile o accesso non consentito.");
    const name=path.split("/").pop()!;const type=await validateWarehouseFile(new File([data],name,{type:data.type}),false,50 * 1024 * 1024);
    const url=URL.createObjectURL(new Blob([data],{type}));viewer.location.replace(url);window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  }catch(error){viewer.close();toast.error("Impossibile aprire l’allegato",{description:error instanceof Error?error.message:"Riprova."});}
}
