import {documentoAziendaLocale} from "./documentoAzienda";
import {scaricaTesto} from "../../src/lib/finanziamenti/noleggio/presentazione";
import {AZIENDA_GRENKE,tabellaGrenke,fonteGrenke,datiGrenke,stimaGrenke,coincideStimaGrenke} from "./grenkeScenario";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { Eye } from "lucide-react";
import { Step1Cliente,Step4Tetto, Step5Configurazione,Step6Finanziario } from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard";
import { INITIAL, TABS } from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { FvPageHeader, FvTabBar, FvFooter, FvChip } from "../../src/lib/fotovoltaico/wizardUI";
import { CorpoPreventivatore } from "../../src/components/preventivatore/CorpoPreventivatore";
import { PannelloAnteprima } from "../../src/components/preventivatore/PannelloAnteprima";
import { AnteprimaVeloce } from "../../src/components/preventivatore/AnteprimaVeloce";
import { AnteprimaMobile } from "../../src/components/preventivatore/AnteprimaMobile";
import { anteprimaFotovoltaico } from "../../src/lib/fotovoltaico/anteprima";
import { datiDalDisegno } from "../../src/lib/fotovoltaico/disegnoPreventivo";
import { cambiaModalitaProgettazione } from "../../supabase/functions/_shared/fvModalitaProgettazione";
import { misureModulo } from "../../supabase/functions/_shared/fvPianoTetto";
import { leggiDisegnoCommerciale, disponiModuliOttimizzati } from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import { supabase } from "./services";
import {CAPANNONE_BASE,POSA_BASE,fonteCapannone,configuraCapannone,gruppiProduzione,type GruppoPVGIS} from "./capannone";
import {leggiRilievoLocale,salvaRilievoLocale} from "./archivioRilievi";
import {edificioCorretto} from "./rilievoLocale";
import {stimaProduzioneFv} from "../../src/lib/fotovoltaico/anteprima";
import SettingsFinanziamenti from "../../src/pages/azienda/settings/SettingsFinanziamenti";
import {ProviderNoleggio} from "../../src/lib/finanziamenti/noleggio/ProviderNoleggio";
import {repositoryNoleggioLocale} from "./noleggioRepositoryLocale";
import originale from "./esempi/edificio-3dbag-originale.json";
import {creaPianoReale,leggiEdificio3d} from "./tettoReale";
import "../../src/index.css";
const IconeFvDemo=lazy(()=>import("./IconeFvDemo"));
const CasaTettoRealeDemo=lazy(()=>import("./CasaTettoRealeDemo"));
const CasaCompletaDemo=lazy(()=>import("./CasaCompletaDemo"));
const BilancioCasaDemo=lazy(()=>import("./BilancioCasaDemo"));
const ModelliAziendaDemo=lazy(()=>import("./ModelliAziendaDemo"));
const TettoRealeDemo=lazy(()=>import("./TettoRealeDemo"));
const listino = {
  pannelli: [
    { id: "demo-450", descrizione: "Pannello monocristallino 450 W", potenza_w: 450, prezzo_vendita: 180, prezzo_acquisto: 120, larghezza_mm: 1134, lunghezza_mm: 1762 },
    { id: "demo-500", descrizione: "Pannello monocristallino 500 W", potenza_w: 500, prezzo_vendita: 210, prezzo_acquisto: 145, larghezza_mm: 1134, lunghezza_mm: 1962 },
  ],
  inverter: [{id:"demo-industriale-50",descrizione:"Inverter industriale 50 kW · esempio",potenza_kw:50,prezzo_vendita:5500,prezzo_acquisto:3500},{ id: "demo-inverter", descrizione: "Inverter 8 kW", potenza_kw: 8, prezzo_vendita: 1500, prezzo_acquisto: 1000 },{id:"demo-industriale",descrizione:"Inverter industriale 100 kW · esempio",potenza_kw:100,prezzo_vendita:5000,prezzo_acquisto:3500}],
  accumuli: [{ id: "demo-accumulo", descrizione: "Accumulo 5 kWh", capacita_kwh: 5, prezzo_vendita: 3000, prezzo_acquisto: 2000 }],
};
const STORAGE = "fv-anteprima-wizard-nativo-v1";
const base: WizardData = { ...INITIAL, cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 000 0000", indirizzo: "Via Roma 1", comune: "Roma", provincia: "RM", cap: "00100", latitudine: 41.9028, longitudine: 12.4964, consumo_annuo_kwh: 6000, costo_kwh_attuale: .3, numero_pannelli_scelti: 16, potenza_kwp: 7.2, pannello_id: "demo-450", inverter_id: "demo-inverter", con_accumulo: false, fonte_dati_tetto: "pvgis", ore_sole_annue: null, iva_aliquota: .1, servizi_righe: [{ tipo: "altro", descrizione: "Installazione e servizi (esempio)", quantita: 1, prezzo_netto: 900, prezzo_vendita: 1500, note_operative: null }] };
const edificioReale=leggiEdificio3d(originale);
const schemaReale=creaPianoReale(edificioReale,{corto:1.134,lungo:1.762,stimato:false});
const baseReale:WizardData={...base,cliente_nome:"Edificio campione",cliente_cognome:"Delft",indirizzo:"Campione pubblico 3DBAG",comune:"Delft",provincia:"",cap:"",latitudine:null,longitudine:null,...datiDalDisegno(disponiModuliOttimizzati(schemaReale,12,"auto",schemaReale.falde[0].id),450)};
const fonteIndustriale=fonteCapannone(CAPANNONE_BASE,"capannone-demo-v1");
const baseIndustriale:WizardData={...base,cliente_tipo:"azienda",archetipo:"pmi",cliente_nome:"Capannone",cliente_cognome:"dimostrativo",inverter_id:"demo-industriale",consumo_annuo_kwh:180000,...datiDalDisegno(configuraCapannone(fonteIndustriale,schemaReale.modulo,POSA_BASE,600,CAPANNONE_BASE.corridoio),450,[])};
export function Preview({tettoReale=false,capannone=false,grenke=false}:{tettoReale?:boolean;capannone?:boolean;grenke?:boolean}) {
  const iniziale=grenke?datiGrenke(base):capannone?baseIndustriale:tettoReale?baseReale:base,storage=grenke?"fv-grenke-70000-v1":capannone?"fv-capannone-wizard-v1":tettoReale?"fv-tetto-reale-wizard-v2":STORAGE;
  const [data,setData] = useState<WizardData>(() => {
    try { const raw=JSON.parse(localStorage.getItem(storage) ?? "null"); if(raw && listino.pannelli.some(p=>p.id===raw.pannello_id)) return {...iniziale,...raw,ore_sole_annue:null}; } catch { /* Riparti dalla configurazione di esempio. */ }
    return iniziale;
  });
  const [step,setStep]=useState(new URLSearchParams(location.search).get("fase")==="cliente"?1:5);
  const [busy,setBusy]=useState(false);
  const [nascosta,setNascosta]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [vista,setVista]=useState<"cliente"|"impresa">("cliente");
  const update=<K extends keyof WizardData>(k:K,v:WizardData[K])=>setData(d=>{
    if(k==="layout_overlay") {
      const piano=leggiDisegnoCommerciale(v);
      const p=listino.pannelli.find(p=>p.id===d.pannello_id)!;
      if(piano) return {...d,ore_sole_annue:null,...datiDalDisegno({...piano,modulo:misureModulo(p)},p.potenza_w,d.prodotti_extra)};
    }
    if(k==="pannello_id") {
      const piano=leggiDisegnoCommerciale(d.layout_overlay),p=listino.pannelli.find(p=>p.id===v)!;
      if(piano) return {...d,pannello_id:p.id,ore_sole_annue:null,...datiDalDisegno({...piano,modulo:misureModulo(p)},p.potenza_w,d.prodotti_extra)};
    }
    if(k==="prodotti_extra"){
      const piano=leggiDisegnoCommerciale(d.layout_overlay),extra=v as WizardData["prodotti_extra"];
      if(piano?.industriale?.costi){const struttura=extra.find(r=>r.uid==="fv-industriale-struttura"),inverter=extra.find(r=>r.uid==="fv-industriale-inverter");return{...d,prodotti_extra:extra,layout_overlay:{...piano,industriale:{...piano.industriale,costi:{strutturaModulo:struttura?.prezzo_vendita??0,inverterAggiuntivi:inverter?.quantita??0,prezzoInverter:inverter?.prezzo_vendita??piano.industriale.costi.prezzoInverter}}}};}
    }
    return {...d,[k]:v,...(["latitudine","longitudine","potenza_kwp","inclinazione_tetto","azimut_tetto"].includes(k)?{ore_sole_annue:null}:{})};
  });
  const [notaStima,setNotaStima]=useState(""),[gruppiStima,setGruppiStima]=useState<GruppoPVGIS[]>([]),[riprova,setRiprova]=useState(0);
  const analizza=async()=>{setRiprova(v=>v+1);};
  const chiaveStima=JSON.stringify([data.latitudine,data.longitudine,data.potenza_kwp,data.pannello_id,data.layout_overlay,data.inclinazione_tetto,data.azimut_tetto]);
  useEffect(()=>{localStorage.setItem(storage,JSON.stringify(data));},[data,storage]);
  useEffect(()=>{
    let attivo=true;
    const timer=setTimeout(async()=>{setBusy(true);setNotaStima("");setData(d=>({...d,ore_sole_annue:null}));try{
      const piano=leggiDisegnoCommerciale(cambiaModalitaProgettazione(data.layout_overlay,false)),wp=listino.pannelli.find(p=>p.id===data.pannello_id)?.potenza_w??450;
      let gruppi:GruppoPVGIS[]|undefined;
      if(data.latitudine==null||data.longitudine==null)throw new Error("Indica la località della simulazione per stimare la produzione.");
      if(piano&&piano.pannelli.length!==data.numero_pannelli_scelti)throw new Error("Il disegno conservato ha una quantità diversa: aggiorna la disposizione per stimare le sue esposizioni.");
      if(piano){const fonte=piano.rilievo?await leggiRilievoLocale(piano.rilievo.id):null;if(!fonte&&!tettoReale)throw new Error("Importa un rilievo con orientamento noto per calcolare la produzione del disegno.");gruppi=gruppiProduzione(piano,fonte?edificioCorretto(fonte):edificioReale,wp);}
      if(!attivo)return;
      setGruppiStima(gruppi??[]);
      if(grenke&&coincideStimaGrenke(data.latitudine,data.longitudine,gruppi)){if(attivo){setData(d=>({...d,ore_sole_annue:stimaGrenke.ore,fonte_dati_tetto:"pvgis"}));setNotaStima("PVGIS-SARAH3 consultato il 10/11/2026: dati salvati per questo capannone a Roma, esposizioni est e ovest a 10°. Profilo mensile coerente con i dati PVGIS. Ombre e rilievo da verificare.");}return;}
      const {data:r,error}=await supabase.functions.invoke("fv-pvgis-fetch",{body:{lat:data.latitudine,lng:data.longitudine,kwp:data.potenza_kwp||1,...(gruppi?{gruppi}:{inclinazione:data.inclinazione_tetto??30,azimut:Number(data.azimut_tetto?.match(/[0-9.]+/)?.[0]??180)})}});
      if(error)throw error;
      if(attivo){setData(d=>({...d,ore_sole_annue:r.ore_sole_annue_equivalenti,fonte_dati_tetto:"pvgis"}));setNotaStima("Irraggiamento PVGIS per esposizione; produzione con i fattori del preventivatore. Ombre di file, lucernari e ostacoli vicini da verificare.");}
    }catch(e){if(attivo){setData(d=>({...d,ore_sole_annue:null}));setNotaStima(e instanceof Error?e.message:"Stima non disponibile.");}}finally{if(attivo)setBusy(false);}},350);
    return()=>{attivo=false;clearTimeout(timer);};
  // La chiave descrive tutti gli input geometrici e di località; il risultato non riattiva la richiesta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chiaveStima,riprova,tettoReale]);
  const anteprima=anteprimaFotovoltaico(data,{listino,regoleSconto:[],impiantoConfigurato:true,conImpresa:true,emittente:"Azienda di esempio"});
  const totale=anteprima.totaleDocumento?.toLocaleString("it-IT",{style:"currency",currency:"EUR"})??"—";
  const seleziona=(n:number)=> { if(n===1||n===4||n===5||n===6) setStep(n); else toast.info("L’anteprima locale mostra le fasi Tetto e Configurazione del wizard esistente."); };
  const pannello=<PannelloAnteprima vista={vista} onVista={setVista} puoVedereImpresa onNascondi={()=>setNascosta(true)} nota="Dati e prezzi di esempio. Questa è l’anteprima veloce già usata dal preventivatore."><AnteprimaVeloce dati={anteprima} vista={vista}/></PannelloAnteprima>;
  return <div className="min-h-screen bg-slate-50 flex flex-col">
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900">Anteprima locale · componenti reali delle fasi Tetto e Configurazione · dati e listino di esempio <a href="/?esempio=tetto-reale" className="ml-3 underline font-semibold">Simula un tetto reale</a><a href="/?esempio=capannone" className="ml-3 underline font-semibold">Simula un capannone</a><a href={grenke?"/azienda/impostazioni/finanziamenti?tipo=noleggio&company=demo2":"/azienda/impostazioni/finanziamenti?tipo=noleggio"} className="ml-3 underline font-semibold">Impostazioni → Finanziamenti</a></div>
    <FvPageHeader title={grenke?"Simulazione aziendale · 70.000 € IVA inclusa":"Nuovo preventivo fotovoltaico"} stato="In compilazione" subtitle={tettoReale||capannone?(leggiDisegnoCommerciale(data.layout_overlay)?.rilievo?.nome?`${leggiDisegnoCommerciale(data.layout_overlay)?.industriale?"Disposizione industriale":"Rilievo associato"} · ${leggiDisegnoCommerciale(data.layout_overlay)!.rilievo!.nome}`:"Edificio campione · Delft · dati pubblici 3DBAG / PDOK"):"Mario Rossi · Via Roma 1, Roma"} chips={<FvChip variant="green">Fotovoltaico</FvChip>}/>
    <FvTabBar tabs={TABS} current={step} completed={new Set([1,2,3,4])} onSelect={seleziona} totale={{valore:totale}} destra={<button type="button" className="text-xs inline-flex gap-1 items-center" onClick={()=>setMobile(true)}><Eye className="h-3.5 w-3.5"/>Anteprima</button>}/>
    <CorpoPreventivatore anteprima={pannello} anteprimaNascosta={nascosta} className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-7 pb-28">
      {step!==1&&(tettoReale||capannone)&&<details open={step!==6} className="fv-local-production" aria-label="Produzione per esposizione"><summary><strong>{busy?"Aggiornamento produzione dalla località…":data.ore_sole_annue?`${Math.round(stimaProduzioneFv(data)).toLocaleString("it-IT")} kWh/anno · stima del preventivo`:"Produzione da calcolare"}</strong></summary><div className="fv-import-fields"><label>Latitudine località<input aria-label="Latitudine simulazione" type="number" step={.0001} value={data.latitudine??""} onChange={e=>update("latitudine",e.target.value?Number(e.target.value):null)}/></label><label>Longitudine località<input aria-label="Longitudine simulazione" type="number" step={.0001} value={data.longitudine??""} onChange={e=>update("longitudine",e.target.value?Number(e.target.value):null)}/></label></div>{gruppiStima.length>0&&<p>{gruppiStima.map(g=>`${g.moduli} moduli · ${g.inclinazione}° · azimut ${g.azimut}°`).join(" / ")}</p>}<p role="status">{notaStima}</p><button type="button" disabled={busy} onClick={analizza}>Ricalcola produzione</button></details>}

      {grenke&&<div className="fv-local-production"><strong>Demo Azienda 2 · simulazione locale</strong><p>70.000 € IVA inclusa al 22%. Capannone e componenti dimostrativi; coefficienti GRENKE dal PDF fornito. Assicurazione e validità commerciale da confermare.</p><button type="button" disabled={busy||!data.ore_sole_annue} onClick={async()=>{try{const p=leggiDisegnoCommerciale(data.layout_overlay),fonte=p?.rilievo?await leggiRilievoLocale(p.rilievo.id):null;if(!fonte)throw new Error("Rilievo non disponibile");const {loadLocalFvTemplate}=await import("../../src/lib/moduli-vendita/localFvTemplates");const variante=data.economia_azienda?.parametri.modo==="noleggio"?"aziendale-noleggio":"aziendale";const modello=loadLocalFvTemplate(AZIENDA_GRENKE,variante,localStorage)?.template;const doc=documentoAziendaLocale(data,edificioCorretto(fonte),modello);scaricaTesto("simulazione-azienda-grenke-70000.html",doc.html,"text/html;charset=utf-8");toast.success(`Documento aziendale con tetto e render: ${doc.pages} pagine. Apri il file e stampa in PDF.`);}catch(e){toast.error(e instanceof Error?e.message:"Documento non disponibile");}}}>Scarica documento aziendale con tetto e render</button></div>}
      {nascosta && <button type="button" className="text-xs text-orange-600" onClick={()=>setNascosta(false)}>Mostra anteprima</button>}
      {step===1?<Step1Cliente data={data} update={update}/>:step===4 ? <Step4Tetto data={data} update={update} analizzando={busy} onAnalizza={analizza} readOnlyMode={false}/> : step===6 ? data.cliente_tipo==="azienda"?<Step6Finanziario data={data} update={update} imponibileCorrente={anteprima.totaleDocumento!=null?anteprima.totaleDocumento/(1+data.iva_aliquota):null} readOnlyMode={false} scenario={null} calcolando={false} error={null} tabelleFinanziamento={[]} topFinanziamenti={[]} fvTemplate={null} onRicalcola={()=>{}}/>:<p>Seleziona Azienda per provare la nuova simulazione aziendale. Il percorso privati resta nel progetto completo.</p> : <Step5Configurazione EditorDisegno={tettoReale||capannone?TettoRealeDemo:undefined} data={data} update={update} readOnlyMode={false} pannelli={listino.pannelli} inverter={listino.inverter} accumuli={listino.accumuli} tariffeFv={[]} kitFv={[]} serviziCatalogo={[]} serviziCatalogoCount={0} catalogoFvVuoto={false} scenario={null} calcolando={false} onRicalcola={()=>toast.info("Calcolo finanziario disponibile nel progetto completo: questa anteprima lavora solo in locale.")}/>}
    </CorpoPreventivatore>
    <FvFooter autoSaveState="saved" numero="Anteprima locale" lastSaveText="su questo browser" onPrev={()=>seleziona(step===4?1:step===5?4:5)} onNext={()=>seleziona(step===1?4:step===4?5:6)} onSaveDraft={()=>toast.success("Bozza locale salvata nel browser")} showPrev={step!==1} showNext={step===1||step===4||step===5}/>
    <AnteprimaMobile aperta={mobile} onApertaChange={setMobile}>{pannello}</AnteprimaMobile><Toaster/>
  </div>;
}
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
const radice:Root=import.meta.hot?.data.radice??createRoot(document.getElementById("root")!);
if(import.meta.hot)import.meta.hot.data.radice=radice;
async function avvia(){const params=new URLSearchParams(location.search),esempio=params.get("esempio"),demo2=esempio==="grenke-70000"||params.get("company")==="demo2";if(demo2){if(!await leggiRilievoLocale(fonteGrenke.id))await salvaRilievoLocale(fonteGrenke);const t=tabellaGrenke();if(!(await repositoryNoleggioLocale.elenca(AZIENDA_GRENKE)).some(x=>x.id===t.id)){const pdf=await fetch(new URL("./esempi/grenke/tabella-sputnik.pdf",import.meta.url));if(!pdf.ok)throw new Error("PDF di riferimento non disponibile");await repositoryNoleggioLocale.crea(AZIENDA_GRENKE,t,[new File([await pdf.blob()],t.fonte!.nome,{type:"application/pdf"})]);}}if(esempio==="capannone"&&!await leggiRilievoLocale(fonteIndustriale.id))await salvaRilievoLocale(fonteIndustriale);radice.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[location.pathname+location.search]}><ProviderNoleggio repository={repositoryNoleggioLocale} companyId={demo2?AZIENDA_GRENKE:"azienda-demo-locale"}><Routes><Route path="/icone-fotovoltaico" element={<Suspense fallback={<p>Caricamento icone…</p>}><IconeFvDemo/></Suspense>}/><Route path="/simulazione-tetto-reale" element={<Suspense fallback={<p>Caricamento simulazione tetto reale…</p>}><CasaTettoRealeDemo/></Suspense>}/><Route path="/preventivo-casa-design" element={<Suspense fallback={<p>Caricamento pagine casa…</p>}><CasaCompletaDemo/></Suspense>}/><Route path="/bilancio-casa" element={<Suspense fallback={<p>Caricamento anteprima casa…</p>}><BilancioCasaDemo/></Suspense>}/><Route path="/modelli-fotovoltaico" element={<Suspense fallback={<p>Caricamento modelli…</p>}><ModelliAziendaDemo/></Suspense>}/><Route path="/azienda/impostazioni/finanziamenti" element={<div className="min-h-screen bg-slate-50 p-7"><header className="max-w-6xl mx-auto mb-5"><p>{demo2?"Demo Azienda 2 · anteprima locale · dati conservati in questo browser":"Anteprima locale · dati conservati in questo browser"}</p><h1 className="text-2xl font-bold">Impostazioni → Finanziamenti</h1><a className="underline" href={demo2?"/?esempio=grenke-70000":"/?esempio=capannone"}>Torna al preventivo capannone</a></header><main className="max-w-6xl mx-auto bg-white p-6 rounded-xl border"><SettingsFinanziamenti/></main></div>}/><Route path="*" element={<Suspense fallback={<p className="p-6">Caricamento del disegno del tetto…</p>}><Preview tettoReale={esempio==="tetto-reale"} capannone={esempio==="capannone"||esempio==="grenke-70000"} grenke={esempio==="grenke-70000"}/></Suspense>}/></Routes></ProviderNoleggio></MemoryRouter></QueryClientProvider>);}
void avvia().catch(()=>{radice.render(<p>Archivio locale non disponibile: abilita il salvataggio dei dati nel browser e ricarica.</p>);});
