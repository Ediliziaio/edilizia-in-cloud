import VerificaCoerenza from "./VerificaCoerenza";
import {useProgresso} from "./useProgresso";
import { GrigliaVerifiche, NumeriVerifica } from "./SchedeVerifica";
import { Sparkles, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import VerificaModuli from "./VerificaModuli";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { preparaMaterialiStanza } from "@/lib/render/roomMaterialsBoard";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";
import { getEdgeFunctionAuthHeaders, resolveEdgeFunctionErrorMessage } from "@/modules/render/lib/edgeFunctionClient";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";

const roomTypes = ['bagno','camera_da_letto','studio','ingresso','taverna','sala_da_pranzo','corridoio','altro'] as const;
const sceneName = (id: string) => id === 'camera_da_letto' ? 'camera' : id;
type Result = { id: string; status: string; session?: string; result?: string; seconds?: number; error?: string; qa?: unknown; privatePreview?: string };
const KEY='eic-verifica-render-20261105-v1';
const pause = (ms: number) => new Promise(resolve=>setTimeout(resolve,ms));
export default function VerificaRender() {
 const { effectiveCompany, user }=useAuth();
 const [results,update]=useProgresso<Result>(KEY);
 const [running,setRunning]=useState(false);
 const run = async (id: typeof roomTypes[number])=>{
  const start=Date.now();let session:string|undefined;
  try {
   if(!user||effectiveCompany?.id!=='d2000000-0000-4000-a000-000000000002')throw Error('Queste prove sono disponibili soltanto nell’azienda demo.');
   const existing=results.find(r=>r.id===id);
   if(existing?.session&&existing.status==='generazione Alta'){
    session=existing.session;
    void supabase.functions.invoke("generate-room-render",{body:{session_id:session,target_width:1536,target_height:1024},headers:await getEdgeFunctionAuthHeaders()});
   }else{
   update({id,status:'preparazione'});
   const source=await fetch(`/dev/render-verifica/scene/${sceneName(id)}.webp`);if(!source.ok)throw Error('Scena di prova mancante');
   const file=new File([await source.blob()],`${id}.webp`,{type:'image/webp'});
   const path=`${effectiveCompany.id}/verifiche-20261105/${crypto.randomUUID()}.webp`;
   const original=await uploadRenderOriginal({bucket:'stanza-originals',path,file});
   const cfg:ConfigurazioneStanza=structuredClone(DEFAULT_STANZA_CONFIG);
   cfg.tipo_stanza=id;cfg.qualita_render='alta';cfg.intensita='leggero';
   cfg.verniciatura={...cfg.verniciatura,attivo:true,colore_hex:'#F2EEE4',colore_nome:'Avorio caldo',finitura:'opaco'};
   cfg.pavimento={...cfg.pavimento,attivo:true,tipo:'parquet_legno',effetto_visivo:'legno',essenza_legno:'rovere_naturale',colore_hex:'#b58b5d',pattern:id==='sala_da_pranzo'?'spina_pesce':'dritto',formato_piastrella:'20x120',larghezza_listello_mm:180,lunghezza_listello_mm:1200,finitura:'opaco'};
   if(id==='bagno')cfg.verniciatura.attivo=false;
   if(id==='bagno')cfg.pavimento={...cfg.pavimento,tipo:'gres_porcellanato',effetto_visivo:'marmo',essenza_legno:undefined,colore_hex:'#e8e4df',pattern:'dritto',formato_piastrella:'60x120'};
   if(id==='corridoio'||id==='studio')cfg.pavimento={...cfg.pavimento,tipo:'resina',effetto_visivo:'cemento',essenza_legno:undefined,colore_hex:'#b0ada5'};
   cfg.note_libere=`TEST QA COMPLETO 05-11-2026 — ${id}. Applica esclusivamente le finiture selezionate. Conserva esattamente tutti gli arredi, elettrodomestici, sanitari, porte, finestre e travi presenti nella sorgente, nelle stesse posizioni e proporzioni. Nessun mobile, tappeto, finestra o accessorio nuovo. Stessa inquadratura. Non copiare gli oggetti di contorno dei campioni. Le superfici continue non hanno fughe.`;
   const config=await preparaMaterialiStanza(cfg,effectiveCompany.id);
   const {data,error}=await supabase.from('render_stanza_sessions').insert({company_id:effectiveCompany.id,created_by:user.id,status:'pending',original_photo_url:original.storagePath,config:config as never}).select('id').single();if(error||!data)throw error||Error('Sessione mancante');session=data.id;
   update({id,status:'generazione Alta',session});
   const invocation=supabase.functions.invoke('generate-room-render',{body:{session_id:session,config,target_width:1536,target_height:1024},headers:await getEdgeFunctionAuthHeaders()});
   void invocation.then(async response=>{if(response.error||response.data?.error){const err=await resolveEdgeFunctionErrorMessage({error:response.error,data:response.data,fallback:'Errore generazione'});console.warn('QA render',id,err)}});
   }
   for(let i=0;i<90;i++){
    await pause(5000);
    const {data:row,error:readError}=await supabase.from('render_stanza_sessions').select('status,result_urls,error_message').eq('id',session).eq('company_id',effectiveCompany.id).single();
    if(readError)throw readError;
    if(row?.status==='failed'){
      const {data: diagnostic}=await supabase.from('render_stanza_sessions').select('config_snapshot').eq('id',session).eq('company_id',effectiveCompany.id).single();
      const snapshot=diagnostic?.config_snapshot as {qa_rejected_path?:string;qa_audit?:unknown}|null;
      let privatePreview:string|undefined;
      if(snapshot?.qa_rejected_path){const {data:signed}=await supabase.storage.from('stanza-originals').createSignedUrl(snapshot.qa_rejected_path,3600);privatePreview=signed?.signedUrl;}
      update({id,status:'errore',session,error:row.error_message||'Render fallito',qa:snapshot?.qa_audit,privatePreview,seconds:Math.round((Date.now()-start)/1000)});return;
    }
    if(row?.status==='completed'&&row.result_urls?.[0]){update({id,status:'completato',session,result:row.result_urls[0],seconds:Math.round((Date.now()-start)/1000)});return;}
   }
   throw Error('Attesa massima superata');
  }catch(e){update({id,status:'errore',session,error:e instanceof Error?e.message:String(e),seconds:Math.round((Date.now()-start)/1000)})}
 };
 const all=async()=>{setRunning(true);let n=0;await Promise.all(Array.from({length:3},async()=>{while(n<roomTypes.length){const id=roomTypes[n++];if(results.some(r=>r.id===id&&r.status==='completato'))continue;await run(id)}}));setRunning(false)};
 const labels:Record<string,string>={bagno:'Bagno · finiture della stanza',camera_da_letto:'Camera da letto',studio:'Studio',ingresso:'Ingresso',taverna:'Taverna',sala_da_pranzo:'Sala da pranzo',corridoio:'Corridoio',altro:'Lavanderia · altro ambiente'};
 return <main className="mx-auto max-w-[1800px] space-y-5 rounded-2xl bg-slate-50/80 p-4 md:p-6">
  <header className="flex flex-col justify-between gap-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/60 to-indigo-50 p-6 sm:flex-row sm:items-center md:p-8"><div><span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700"><Sparkles className="h-3.5 w-3.5"/>Render AI · Controllo qualità</span><h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Ogni ambiente, sotto controllo.</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Confronta le scene di partenza con i render, segui le elaborazioni e individua le prove da correggere.</p><p className="mt-3 text-xs text-slate-500">{effectiveCompany?.name} · Qualità Alta · 8 ambienti interni e 13 moduli dedicati · scene sintetiche di prova</p></div><div className="rounded-xl border border-white bg-white/80 px-4 py-3 text-sm shadow-sm"><span className="block text-xs text-slate-500">Ambiente di verifica</span><span className="font-semibold text-slate-800">Progetto locale</span><span className="mt-1 block text-xs text-slate-500">Generazioni sul motore dell’app</span></div></header>
  <NumeriVerifica results={results} total={roomTypes.length}/>
  <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Ambienti interni</h2><p className="text-sm text-slate-500">La ripetizione automatica include le prove ancora da completare.</p></div><Button disabled={running} onClick={all} className="gap-2 shadow-sm">{running?<Loader2 className="h-4 w-4 animate-spin"/>:<Play className="h-4 w-4"/>}{running?'Verifiche in corso':'Avvia gli interni mancanti'}</Button></section>
  <p role="status" className="text-xs text-slate-500">{results.filter(r=>r.status==='completato').length} di {roomTypes.length} ambienti completati · {results.filter(r=>r.status==='errore').length} da rivedere</p>
  <GrigliaVerifiche cases={roomTypes.map(id=>({id,label:labels[id],source:`/dev/render-verifica/scene/${sceneName(id)}.webp`,href:results.find(r=>r.id===id)?.session?`/azienda/render/stanza/gallery/${results.find(r=>r.id===id)?.session}`:undefined,result:results.find(r=>r.id===id)}))} running={running} onRetry={id=>run(id as typeof roomTypes[number])}/>
  <p className="text-xs text-slate-400">Confronta ogni risultato prima di approvarlo per il progetto.</p>
  <VerificaModuli />
  <VerificaCoerenza />
 </main>;
}
