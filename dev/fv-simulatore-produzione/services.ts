/** Adattatore esclusivo del collaudo locale. Nessuna sessione o database reale. */
export const supabase={functions:{invoke:async()=>({data:null,error:new Error("Calcolo remoto escluso dal collaudo del tetto")})},storage:{from:()=>({
 upload:async(path:string,blob:Blob)=>{const r=await fetch('/__fv-test-storage/'+path,{method:'PUT',body:blob});return{error:r.ok?null:{message:'Upload di prova rifiutato',statusCode:String(r.status)}};},
 download:async(path:string)=>{const r=await fetch('/__fv-test-storage/'+path);return{data:r.ok?await r.blob():null,error:r.ok?null:{message:'File di prova assente'}};}
})}};
export function captureVelocityEvent(){}export function captureVelocityError(){}export function setSentryUserContext(){}export async function initSentry(){}
