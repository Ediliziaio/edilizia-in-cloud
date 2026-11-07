import {useProgresso} from "./useProgresso";
import { GrigliaVerifiche, NumeriVerifica } from "./SchedeVerifica";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { useState } from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {uploadRenderOriginal} from '@/lib/render/renderStorage';
import {getEdgeFunctionAuthHeaders,resolveEdgeFunctionErrorMessage} from '@/modules/render/lib/edgeFunctionClient';
import {DEFAULT_BATHROOM_CONFIG} from '@/components/render-bagno/defaultBathroomConfig';
import {DEFAULT_PAVIMENTO_CONFIG} from '@/components/render-pavimento/defaultPavimentoConfig';
import {DEFAULT_FACCIATA_CONFIG} from '@/components/render-facciata/defaultFacciataConfig';
import {DEFAULT_PERSIANE_CONFIG} from '@/components/render-persiane/defaultPersianeConfig';
import {DEFAULT_TETTO_CONFIG} from '@/components/render-tetto/TettoConfigForm';
import {DEFAULT_PERGOLE_CONFIG} from '@/components/render-pergole/defaultPergoleConfig';
import {DEFAULT_PISCINE_CONFIG} from '@/components/render-piscine/defaultPiscineConfig';
import {technicalRenderModuleSpecs} from '@/lib/render/technicalRenderModules';
import {buildBathroomRenderConfig} from '@/modules/render-bagno/lib/bathroomRenderConfig';
import {mapWizardToConfig,WIZARD_RAL} from '@/modules/render/lib/configMapper';
import {buildPersianeRenderConfig} from '@/modules/render-persiane/lib/persianeRenderConfig';
import {normalizeWindowSceneAnalysis} from '@/modules/render/lib/windowSceneAnalysis';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const db=supabase as any;
const META={width:1536,height:1024,orientation:'landscape'} as const;
const ids=['bagno-dedicato','pavimento','facciata','persiane','tetto','pergole','piscine','ristrutturazioni','pavimenti-esterni','giardini','porte-blindate','porte-interne','infissi'] as const;
export type ModuleResult={id:string;status:string;session?:string;result?:string;seconds?:number;error?:string;table?:string;config?:unknown};
const labels:Record<string,string>={'bagno-dedicato':'Bagno · sanitari e rivestimenti',pavimento:'Pavimento interno',facciata:'Facciata',persiane:'Persiane',tetto:'Tetto',pergole:'Pergola',piscine:'Piscina',ristrutturazioni:'Ristrutturazione coordinata','pavimenti-esterni':'Pavimento esterno',giardini:'Giardino','porte-blindate':'Porta blindata','porte-interne':'Porte interne',infissi:'Infissi'};
const moduleSource=(id:string)=>`/dev/render-verifica/scene/${id==='bagno-dedicato'?'bagno':id==='pavimento'||id==='infissi'?'camera':id==='porte-interne'?'corridoio':id==='porte-blindate'?'ingresso':'esterno'}.webp`;
function specFor(id:string):{table:string;bucket:string;fn:string;config:any;technical?:boolean;statusColumn:string;resultColumn:string;done:string;gallery:string}{
 const names:any={pavimento:['pavimento','floor',DEFAULT_PAVIMENTO_CONFIG],facciata:['facciata','facade',DEFAULT_FACCIATA_CONFIG],persiane:['persiane','shutter',DEFAULT_PERSIANE_CONFIG],tetto:['tetto','roof',DEFAULT_TETTO_CONFIG],pergole:['pergole','pergola',DEFAULT_PERGOLE_CONFIG],piscine:['piscine','pool',DEFAULT_PISCINE_CONFIG]};
 if(id==='bagno-dedicato')return{table:'render_bagno_sessions',bucket:'bagno-originals',fn:'generate-bathroom-render',config:structuredClone(DEFAULT_BATHROOM_CONFIG),statusColumn:'stato',resultColumn:'render_result_url',done:'completato',gallery:'bagno'};
 if(id==='infissi')return{table:'render_sessions',bucket:'render-originals',fn:'generate-render',config:{},statusColumn:'status',resultColumn:'result_urls',done:'completed',gallery:'infissi'};
 const n=names[id];if(n)return{table:`render_${n[0]}_sessions`,bucket:`${n[0]}-originals`,fn:`generate-${n[1]}-render`,config:structuredClone(n[2]),statusColumn:'status',resultColumn:'result_urls',done:'completed',gallery:n[0]};
 return{table:'render_technical_sessions',bucket:'render-originals',fn:'generate-technical-render',config:structuredClone((technicalRenderModuleSpecs as any)[id].defaultConfig),technical:true,statusColumn:'status',resultColumn:'result_urls',done:'completed',gallery:id};
}
export default function VerificaModuli(){
 const {effectiveCompany,user}=useAuth();
 const [results,update]=useProgresso<ModuleResult>("eic-qa-moduli-20261105");
 const [running,setRunning]=useState(false);
 const call=async(fn:string,body:Record<string,unknown>)=>{const r=await supabase.functions.invoke(fn,{body,headers:await getEdgeFunctionAuthHeaders()});if(r.error||r.data?.error)throw Error(await resolveEdgeFunctionErrorMessage({error:r.error,data:r.data,fallback:'Errore del motore AI'}));return r.data};
 const run=async(id:string)=>{
  const start=Date.now();let session:string|undefined;const spec=specFor(id);let config=spec.config;
  try{
   if(!user||effectiveCompany?.id!=='d2000000-0000-4000-a000-000000000002')throw Error('Queste prove sono disponibili soltanto nell’azienda demo.');
   const existing=results.find(r=>r.id===id);
   if(existing?.session&&existing.status==='generazione Alta'){
    session=existing.session;
    void call(spec.fn,{session_id:session,qualita_render:"alta",target_width:1536,target_height:1024}).catch(()=>{});
    for(let n=0;n<90;n++){
     const polled=await db.from(spec.table).select(`${spec.statusColumn},${spec.resultColumn},error_message,processing_started_at`).eq('id',session).eq('company_id',effectiveCompany.id).single();if(polled.error)throw polled.error;
     const row=polled.data,state=row?.[spec.statusColumn],url=id==='bagno-dedicato'?row?.[spec.resultColumn]:row?.[spec.resultColumn]?.[0];
     if(state==='failed'||state==='errore'||state==='fallito')throw Error(row.error_message||'Render fallito');
     if(state===spec.done&&url){update({...existing,status:'completato',result:url,seconds:row.processing_started_at?Math.round((Date.now()-Date.parse(row.processing_started_at))/1000):undefined});return;}
     await wait(5000);
    }throw Error('Attesa massima superata');
   }
   update({id,status:'preparazione'});
   const source=await fetch(moduleSource(id));if(!source.ok)throw Error('Scena mancante');
   const file=new File([await source.blob()],`${id}.webp`,{type:'image/webp'});
   const original=await uploadRenderOriginal({bucket:spec.bucket,path:`${effectiveCompany.id}/verifiche-20261105/${id}-${crypto.randomUUID()}.webp`,file});
   const note=`TEST QA COMPLETO 05-11-2026 — ${labels[id]}. Stessa inquadratura, stessa geometria. Conserva tutti gli elementi non oggetto dell'intervento. Nessuna apertura nuova, nessun arredo o edificio aggiunto. Segui fedelmente materiali, colori e campioni selezionati.`;
   config={...config,qualita_render:'alta',note_libere:note};
   if(spec.technical){config.technicalDetails+=`\n${note}`;config.preserveNotes+='; stessa inquadratura e tutti gli elementi non target';}
   if(id==='ristrutturazioni'){config.targetArea='facciata e solo patio esistente della villetta';config.materialOrSystem='tinteggiatura bianco perla sulla facciata e gres effetto pietra grigio sul patio';config.preserveNotes='tetto, numero e posizione finestre, porta, persiane, erba e siepi identici';}
   if(id==='porte-interne'){config.targetArea='solo la porta in primo piano a sinistra';config.preserveNotes='altre due porte, pavimento, muri, luce, inquadratura e contesto';}
   if(id==='porte-blindate'){config.targetArea='unica porta di ingresso centrale vista dal lato interno';config.technicalDetails+='\nVista dal lato interno, nessun accessorio da esterno sul pannello interno.';}
   if(id==='bagno-dedicato'){
    config.sostituzione={...config.sostituzione,mobile_bagno:true,sanitari:true,rubinetteria:true,doccia:true};
    config.vanity={...config.vanity,attivo:true,larghezza_cm:100};config.sanitari={...config.sanitari,attivo:true};config.rubinetteria={...config.rubinetteria,attivo:true};config.doccia={...config.doccia,attivo:true};
    config.note_libere+=' Esattamente un WC e un bidet, un lavabo e una doccia, nelle posizioni originali. Niente vasca. Pareti marmo Carrara, pavimento cemento grigio, rubinetteria nera.';
   }
   const record=id==='bagno-dedicato'?{company_id:effectiveCompany.id,user_id:user.id,stato:'pending',foto_originale_path:original.storagePath,configurazione:config,tipo_intervento:config.tipo_intervento}:{company_id:effectiveCompany.id,created_by:user.id,status:'pending',original_photo_url:original.storagePath,config,...(spec.technical?{module_type:id}:{})};
   const created=await db.from(spec.table).insert(record).select('id').single();if(created.error||!created.data)throw created.error||Error('Sessione mancante');session=created.data.id;
   update({id,status:'analisi',session,table:spec.table,config});
   if(id==='bagno-dedicato'||id==='infissi'||id==='persiane'){
    const signed=await supabase.storage.from(original.bucket).createSignedUrl(original.storagePath,300);if(signed.error||!signed.data)throw Error('Foto analisi non disponibile');
    const analysis=await call(id==='infissi'?'analyze-window-photo':spec.fn,{...(id!=='infissi'?{action:'analyze'}:{}),image_url:signed.data.signedUrl,session_id:session});
    if(id==='bagno-dedicato'){
     const scene=analysis.analisi_bagno||analysis.analisi||analysis;const payload=buildBathroomRenderConfig(config,{sceneAnalysis:scene,photoMeta:META,notes:config.note_libere});
     const saved=await db.from(spec.table).update({stato:'analysis_done',configurazione:payload,analisi_bagno:scene}).eq('id',session).eq('company_id',effectiveCompany.id);if(saved.error)throw saved.error;
    }else if(id==='persiane'){
     const scene=analysis.analisi_persiane||analysis;
     config=buildPersianeRenderConfig(config,{sceneAnalysis:scene,photoMeta:META,notes:config.note_libere});
     const saved=await db.from(spec.table).update({config}).eq('id',session).eq('company_id',effectiveCompany.id);if(saved.error)throw saved.error;
    }else{
     const scene=normalizeWindowSceneAnalysis(analysis.foto_analisi||analysis,META);
     const color=WIZARD_RAL.find(c=>c.id.includes('9010'))||WIZARD_RAL[0];
     config=mapWizardToConfig({tipo:'F2A',profilo:'pvc',coloreInfisso:color.id,manigliaCentrale:false,tipoManiglia:'q_moderna',coloreHw:'cromo',cass:false,cassMat:'stesso_colore',cassCol:'',tapp:'no',tappCol:'stesso',traverso:'auto',cerniere:'visibili',nodo:'simmetrico',qualita_render:'alta'},note,{sceneAnalysis:scene,selectedOpeningIds:scene.openings.map(o=>o.id),photoMeta:META});
     const saved=await db.from(spec.table).update({config,foto_analisi:scene}).eq('id',session).eq('company_id',effectiveCompany.id);if(saved.error)throw saved.error;
    }
   }
   update({id,status:'generazione Alta',session,table:spec.table,config});
   void call(spec.fn,{session_id:session,qualita_render:'alta',...(id!=='bagno-dedicato'?{config}:{}),target_width:1536,target_height:1024}).catch(e=>console.warn('QA modulo',id,e.message));
   for(let i=0;i<90;i++){
    await wait(5000);const polled=await db.from(spec.table).select(`${spec.statusColumn},${spec.resultColumn},error_message`).eq('id',session).eq('company_id',effectiveCompany.id).single();if(polled.error)throw polled.error;
    const row=polled.data;const state=row?.[spec.statusColumn];if(state==='failed'||state==='errore'||state==='fallito')throw Error(row.error_message||'Render fallito');
    const url=id==='bagno-dedicato'?row?.[spec.resultColumn]:row?.[spec.resultColumn]?.[0];
    if(state===spec.done&&url){update({id,status:'completato',session,table:spec.table,result:url,seconds:Math.round((Date.now()-start)/1000),config});return;}
   }throw Error('Attesa massima superata');
  }catch(e){update({id,status:'errore',session,table:spec.table,error:e instanceof Error?e.message:String(e),seconds:Math.round((Date.now()-start)/1000),config})}
 };
 const all=async()=>{setRunning(true);let n=0;await Promise.all(Array.from({length:3},async()=>{while(n<ids.length){const id=ids[n++];if(results.some(r=>r.id===id&&r.status==='completato'))continue;await run(id)}}));setRunning(false)};
 return <section className="space-y-5 border-t border-slate-200 pt-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Esterni, aperture e motori dedicati</h2><p className="mt-1 text-sm text-slate-500">Bagno, pavimenti, facciate, coperture, giardini e tutti gli altri moduli.</p></div><Button disabled={running} onClick={all} className="gap-2">{running?<Loader2 className="h-4 w-4 animate-spin"/>:<Play className="h-4 w-4"/>}{running?'Verifiche moduli in corso':'Avvia tutti i moduli mancanti'}</Button></div><NumeriVerifica results={results} total={ids.length}/><p role="status" className="text-xs text-slate-500">{results.filter(r=>r.status==='completato').length} di {ids.length} moduli completati · {results.filter(r=>r.status==='errore').length} da rivedere</p><GrigliaVerifiche cases={ids.map(id=>({id,label:labels[id],group:['infissi','persiane','porte-interne','porte-blindate'].includes(id)?'Aperture':['bagno-dedicato','pavimento'].includes(id)?'Motore dedicato':'Esterni e ristrutturazioni',source:moduleSource(id),href:results.find(r=>r.id===id)?.session?`/azienda/render/${specFor(id).gallery}/gallery/${results.find(r=>r.id===id)?.session}`:undefined,result:results.find(r=>r.id===id)}))} running={running} onRetry={run}/></section>;
}
