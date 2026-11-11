import {useCallback} from "react";
import {documentoCasaTettoReale,datiCasaTettoReale} from "./casaTettoReale";
import {posaCasaTracciata} from "./campioneAreaTracciata";
import fotoCasa from "./esempi/ortofoto-pdok.jpg";
import {MONITORAGGIO_DEMO_INCLUSO,leggiMonitoraggioFv} from "../../supabase/functions/_shared/fvMonitoraggio";
import {datiGrenke,fonteGrenke,stimaGrenke} from "./grenkeScenario";
import {documentoAziendaLocale} from "./documentoAzienda";
import {INITIAL} from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import {useRef,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {FotovoltaicoTemplateEditor} from "../../src/components/fotovoltaico/FotovoltaicoTemplateEditor";
import {createFullFvTemplate,fvModuleTitle,type FullFvTemplate} from "../../src/lib/moduli-vendita/fullFvModules";
import {loadLocalFvTemplate,saveLocalFvTemplate} from "../../src/lib/moduli-vendita/localFvTemplates";
import {FV_MODELLI_AZIENDA,isFvModelloAzienda,type FvModelloAzienda} from "../../supabase/functions/_shared/fvModelliAzienda";
import {Toaster} from "sonner";
import {AZIENDA_GRENKE} from "./grenkeScenario";
const COMPANY=AZIENDA_GRENKE;
const base={ragione_sociale:"Demo Azienda 2",colore_primario:"#1E3A5F",colore_accento:"#F97316",presentazione_impresa_html:"",logo_url:null as string|null};
/** Entrambi i record sono indipendenti; l’adapter esplicito impedisce sincronizzazioni online. */
type ModelloLocale=FvModelloAzienda|"nuovo";
function inizializza(id:ModelloLocale){
 const presente=loadLocalFvTemplate(COMPANY,id,localStorage);let nuovo=createFullFvTemplate(base,COMPANY,id);
 if(id==="nuovo"){const t=datiCasaTettoReale(posaCasaTracciata).template as unknown as Partial<FullFvTemplate>;nuovo={...nuovo,...t,pdf_blocchi:{...nuovo.pdf_blocchi,...t?.pdf_blocchi,monitoraggio:MONITORAGGIO_DEMO_INCLUSO}};}

 if(!presente)return saveLocalFvTemplate(COMPANY,id,nuovo,null,localStorage);
 // Aggiorna soltanto le fotografie stock del prototipo iniziale; conserva testi, stile e immagini personalizzate.
 if(presente.template.pdf_blocchi?.azienda_foto_versione!==2){
  const blocchi={...presente.template.pdf_blocchi},vecchio=createFullFvTemplate(base,COMPANY,"nuovo").pdf_blocchi??{};
  for(const key of ["pagina_produzione","pagina_decisione"]){if(!blocchi[key]||JSON.stringify(blocchi[key])===JSON.stringify(vecchio[key]))blocchi[key]=nuovo.pdf_blocchi![key];}
  for(const key of ["protezione","documenti"]){const b=blocchi[key] as {foto?:string[];senzaFoto?:boolean}|undefined;if(b&&!(b.foto?.length)&&!b.senzaFoto)blocchi[key]={...b,foto:(nuovo.pdf_blocchi![key] as {foto:string[]}).foto};}
  blocchi.azienda_foto_versione=2;return saveLocalFvTemplate(COMPANY,id,{...presente.template,pdf_blocchi:blocchi},presente.savedAt,localStorage);
 }
 return presente;
}
export default function ModelliAziendaDemo(){
 const [params,setParams]=useSearchParams(),richiesto=params.get("modello"),id:ModelloLocale|null=richiesto==="nuovo"?"nuovo":isFvModelloAzienda(richiesto)?richiesto:null,dirty=useRef(false);
 const [iniziale]=useState(()=>{try{(["nuovo",...FV_MODELLI_AZIENDA] as ModelloLocale[]).forEach(inizializza);return "";}catch(e){return e instanceof Error?e.message:"Archivio locale non disponibile";}});
 const scegli=(next:ModelloLocale|null)=>{if(dirty.current&&!window.confirm("Uscire senza salvare le modifiche al modello?"))return;dirty.current=false;setParams(next?{modello:next}:{})};
 if(iniziale)return <p role="alert" className="p-8">{iniziale}. Nessun modello esistente è stato sovrascritto.</p>;
 return <div className="min-h-screen bg-slate-50"><div className="border-b bg-amber-50 px-6 py-3 text-xs text-amber-900">Anteprima locale · modelli separati · salvataggio soltanto in questo browser · nessun collegamento al database online</div><main className="mx-auto max-w-[1650px] p-5 md:p-8"><header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Modelli → Fotovoltaico</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-800">{id==="nuovo"?"Fotovoltaico casa · preventivo completo":id?fvModuleTitle(id):"I modelli fotovoltaici"}</h1><p className="mt-2 text-sm text-slate-500">Stesse pagine ed editor del modello originale, con contenuti e analisi per casa e aziende.</p></div><a className="text-sm underline" href="/?esempio=grenke-70000">Torna al preventivo dimostrativo</a></header>{id?<><div className="mb-5 flex gap-3"><button className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={()=>scegli(null)}>← Tutti i modelli</button><button className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={()=>scegli("nuovo")}>Modello casa · preventivo completo</button></div><EditorModello key={id} id={id} onDirty={v=>{dirty.current=v}}/></>:<div className="grid gap-6 md:grid-cols-2">{(["nuovo",...FV_MODELLI_AZIENDA] as ModelloLocale[]).map(id=><article key={id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="relative h-60 overflow-hidden"><img src={id==="nuovo"?"/templates/fotovoltaico/products/modulo-fotovoltaico-full-black.webp":"/pdf-stock/fotovoltaico/capannone.jpg"} className="h-full w-full object-cover" alt="Copertura industriale · immagine illustrativa"/><span className="absolute bottom-4 left-5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold">{id==="nuovo"?"Casa · preventivo completo":id==="aziendale"?"Acquisto · Finanziamento · Leasing":"Noleggio operativo"}</span></div><div className="space-y-4 p-6"><h2 className="text-xl font-bold text-slate-800">{id==="nuovo"?"Fotovoltaico casa · preventivo completo":fvModuleTitle(id)}</h2><p className="text-sm leading-relaxed text-slate-500">{id==="nuovo"?"Il documento completo della casa: tetto, energia, fornitura, monitoraggio e finanziamento dimostrativo.":id==="aziendale"?"Presentazione, tetto, componenti, energia e fornitura. Analisi economica dalla formula scelta nel preventivo.":"La stessa proposta completa, con presentazione dedicata a canoni, servizi, assicurazione e fine contratto."}</p><div className="flex flex-wrap gap-2 text-xs text-slate-600">{["Testi e fotografie","Colori e copertina","Pagine riordinabili","Anteprima live"].map(t=><span key={t} className="rounded-md bg-slate-100 px-2 py-1">{t}</span>)}</div><button className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white" onClick={()=>scegli(id)}>Personalizza {id==="nuovo"?"modello casa":id==="aziendale"?"modello aziendale":"modello noleggio"}</button></div></article>)}</div>}<Toaster/></main></div>;
}
function EditorModello({id,onDirty}:{id:ModelloLocale;onDirty:(v:boolean)=>void}){
 const [record]=useState(()=>inizializza(id)),revision=useRef(record.savedAt);
 const renderCampione=useCallback((raw:Record<string,unknown>)=>{
  const template=raw as unknown as FullFvTemplate;
  if(id==="nuovo")return documentoCasaTettoReale(fotoCasa,undefined,posaCasaTracciata,{modello:template,monitoraggio:leggiMonitoraggioFv(template.pdf_blocchi),finanziamento:{finanziaria:"Esempio locale · non è un’offerta",durata_mesi:60,rata_mensile:85,tan_perc:null,taeg_perc:null,importo_finanziato:4282}});
  const data={...datiGrenke(INITIAL),latitudine:stimaGrenke.lat,longitudine:stimaGrenke.lng,comune:"Roma",indirizzo:"Località dimostrativa Roma",ore_sole_annue:stimaGrenke.ore};
  if(id==="aziendale"){data.economia_azienda!.parametri={...data.economia_azienda!.parametri,modo:"cash"};data.finanziamento_modalita="cash";}
  return documentoAziendaLocale(data,fonteGrenke.edificioBase,template);
 },[id]);
 return <FotovoltaicoTemplateEditor embedded localModule={{id,renderCampione,template:record.template,saved:true,soloLocale:true,onDirtyChange:onDirty,save:(t:FullFvTemplate)=>{revision.current=saveLocalFvTemplate(COMPANY,id,t,revision.current,localStorage).savedAt;}}}/>;
}
