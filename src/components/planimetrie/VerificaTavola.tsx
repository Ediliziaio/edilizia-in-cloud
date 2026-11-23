import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Crosshair, Layers2, Plus, Ruler, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import {
  aperturaDaVerificare, conAperturaVerificata, conQuotaVerificata, NOMI_APERTURE,
  nuovaAperturaSullaTavola, posizioneVano, salvaRevisioneTavola, togliDallaTavola, type SelezioneTavola,
} from "@/lib/planimetrie/verificaTavola";
import { areaPoligono, distanza, lunghezzaMuro } from "../../../shared/planimetrie/geometria.ts";
import { scalaModelloDaVerificare, TIPI_APERTURA, type Apertura, type Livello, type Planimetria, type Punto, type Quota, type TipoApertura } from "../../../shared/planimetrie/modello.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { MISURE_APERTURA } from "./editor/comandi";
import { TavolaInterattiva } from "./TavolaInterattiva";
import { LetturaAssistitaTavola } from "./LetturaAssistitaTavola";
import { ControlloGeometriaDwg, NOMI_RISCONTRI_DWG } from "./ControlloGeometriaDwg";
import { registraRiscontroDwg } from "@/lib/planimetrie/revisioneDwg";
import type { EsitoRiscontroDwg, RiscontroDwg } from "../../../shared/planimetrie/controlloDwg.ts";

const fmt = new Intl.NumberFormat("it-IT",{maximumFractionDigits:2,useGrouping:false});
const fmtSuperficie = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daNumero = (v:string) => v.trim() ? Number(v.replace(",",".")) : NaN;
const campiApertura = {
  larghezza:"Larghezza vano", offset:"Distanza dall’inizio della parete", altezza:"Altezza vano", davanzale:"Davanzale",
};
type CampoApertura = keyof typeof campiApertura;
type CampiApertura = Record<CampoApertura,string>;
type Modifica = {tipo:"apertura"; oggetto:Apertura; campi:CampiApertura; luceNetta: string; apribile: string; illuminante: string} |
  {tipo:"quota"; oggetto:Quota; lunghezza:string; scostamento:string};
type Gesto = {tipo:"aggiungi"; apertura:TipoApertura} | {tipo:"sposta"} | {tipo:"quota"; primo?:Punto};

function modificaApertura(a: Apertura): Modifica {
  const effettiva = (n?:number) => n===undefined ? "" : String(n).replace(".",",");
  return {tipo:"apertura",oggetto:a,luceNetta:effettiva(a.luceNettaCm),
    apribile:effettiva(a.superficieApribileMq),illuminante:effettiva(a.superficieIlluminanteMq),campi:{
    larghezza:fmt.format(a.larghezza), offset:fmt.format(a.offset),
    altezza:fmt.format(a.altezza), davanzale:fmt.format(a.davanzale),
  }};
}

function modificaQuota(q: Quota): Modifica {
  return {tipo:"quota",oggetto:q,lunghezza:fmt.format(distanza(q.p1,q.p2)),scostamento:fmt.format(q.scostamento)};
}

export function VerificaTavola({documento,livello,ambito,planimetriaId,versione,tavola,sovrapponibile,puoScrivere,aperturaIniziale}: {
  documento: Planimetria; livello: Livello; ambito: string; planimetriaId: string;
  versione: number; tavola?: string; sovrapponibile: boolean; puoScrivere: boolean; aperturaIniziale?: string;
}) {
  const originale=statoPerAmbito(documento,livello.id,ambito) ?? livello.fatto;
  const [stato,setStato]=useState(originale);
  const [modifica,setModifica]=useState<Modifica|null>(() => {
    const a=originale.aperture.find(a=>a.id===aperturaIniziale && a.stato!=="da_demolire");
    return a ? modificaApertura(a) : null;
  });
  const [gesto,setGesto]=useState<Gesto|null>(null);
  const [sezione,setSezione]=useState<"apertura"|"quota">("apertura");
  const [opacita,setOpacita]=useState(28);
  const [conferma,setConferma]=useState(false);
  const [errore,setErrore]=useState("");
  const [inLettura,setInLettura]=useState<boolean | undefined>();
  const [localeRiscontro, setLocaleRiscontro] = useState<string>();
  const [params, setParams] = useSearchParams();
  const idRiscontroDwg = livello.controlloDwg?.find(r => r.id === params.get("riscontroDwg"))?.id ?? livello.controlloDwg?.[0]?.id;
  const [erroreDwg, setErroreDwg] = useState("");
  const riquadroTavola = useRef<HTMLDivElement>(null);
  const salvaVersione=useSalvaVersionePlanimetria();
  const invio=useRef(false);
  const bozza=useMemo(()=>salvaRevisioneTavola(documento,livello.id,ambito,stato),[documento,livello.id,ambito,stato]);
  const progetto=ambito.startsWith("progetto:");
  const pendente=salvaVersione.isPending;
  const riscontriDwg = progetto ? undefined : livello.controlloDwg;
  const riscontroDwg = riscontriDwg?.find(r => r.id === idRiscontroDwg);
  const aperture=stato.aperture.flatMap((a,i)=>a.stato!=="da_demolire" ? [{a,nome:`${NOMI_APERTURE[a.tipo]} ${i+1}`}] : []);
  const stimate=aperture.filter(({a})=>aperturaDaVerificare(a)).length;
  const selezione=modifica ? {tipo:modifica.tipo,id:modifica.oggetto.id} : null;
  const muro=modifica?.tipo==="apertura" ? stato.muri.find(m=>m.id===modifica.oggetto.muroId) : undefined;
  const haLettura=!!livello.letturaAssistita && livello.letturaAssistita.percorso === livello.ricalco?.percorso;
  const ricalco=sovrapponibile && tavola && livello.ricalco && (livello.ricalco.calibrata!==false || haLettura)
    ? {url:tavola,dati:livello.ricalco,opacita:opacita/100} : undefined;
  const geometria=!!(stato.muri.length || stato.locali.length || stato.quote.length || stato.elementi.length || stato.aree?.length);
  const superfici = stato.locali.flatMap(l => {
    if (l.superficieDichiarataMq === undefined) return [];
    const calcolata = areaPoligono(l.contorno) / 10000;
    return [{ id: l.id, nome: l.nome, tavola: l.superficieDichiarataMq, calcolata, scarto: calcolata - l.superficieDichiarataMq }];
  }).sort((a, b) => Math.abs(b.scarto) - Math.abs(a.scarto));
  // Le importazioni DWG conservano le superfici senza contorno come testi CAD sulla tavola.
  const superficiSenzaContorno = (stato.testi ?? []).flatMap(t => {
    const valore = /^([0-9]+(?:[,.][0-9]+)?) m²$/.exec(t.testo);
    if (!valore || !/^cad-\d+-t\d+$/.test(t.id)) return [];
    return [{ id: t.id, tavola: daNumero(valore[1]), punto: t.posizione }];
  });
  const superficieSelezionata = superficiSenzaContorno.find(r => r.id === localeRiscontro);
  const provaLocale=import.meta.env.DEV && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
  const letturaDisponibile=!!tavola && sovrapponibile && (haLettura || (provaLocale && puoScrivere));

  const prepara=(campo: Modifica|null)=>{
    setLocaleRiscontro(undefined);
    setIdRiscontroDwg(undefined);
    setModifica(campo);
    setGesto(null);
    setErrore("");
    setConferma(false);
    if (campo) setSezione(campo.tipo);
  };
  const scegli=(s: SelezioneTavola)=>{
    if (pendente) return;
    if (s.tipo==="apertura") {
      const a=stato.aperture.find(a=>a.id===s.id);
      if (a) prepara(modificaApertura(a));
    } else {
      const q=stato.quote.find(q=>q.id===s.id);
      if (q) prepara(modificaQuota(q));
    }
  };
  const scegliSuperficie = (id: string) => {
    prepara(null);
    setLocaleRiscontro(id);
    riquadroTavola.current?.scrollIntoView?.({ block: "nearest" });
  };
  const scegliRiscontroDwg = (id: string) => {
    prepara(null);
    setErroreDwg("");
    setParams(precedenti => {
      const prossimi = new URLSearchParams(precedenti);
      prossimi.set("riscontroDwg", id);
      return prossimi;
    }, { replace: true });
    riquadroTavola.current?.scrollIntoView?.({ block: "nearest" });
  };
  const decidiRiscontroDwg = async (r: RiscontroDwg, decisione: EsitoRiscontroDwg) => {
    if (!puoScrivere || invio.current || pendente) return;
    if (stato !== originale) {
      setErroreDwg("Salva le modifiche a quote e aperture prima di registrare il riscontro DWG.");
      return;
    }
    invio.current = true;
    setErroreDwg("");
    try {
      const revisione = registraRiscontroDwg(documento, livello.id, r.id, decisione);
      if (revisione === documento) return;
      await salvaVersione.mutateAsync({
        planimetriaId, documento: revisione, versioneAttesa: versione,
        nota: `Riscontro DWG · ${livello.nome} · ${NOMI_RISCONTRI_DWG[r.tipo]}`,
      });
      setParams(precedenti => {
        const prossimi = new URLSearchParams(precedenti);
        prossimi.delete("versione");
        prossimi.delete("apertura");
        prossimi.set("riscontroDwg", r.id);
        return prossimi;
      }, { replace: true });
      toast.success("Riscontro DWG salvato");
    } catch (e) {
      setErroreDwg(e instanceof Error ? e.message : "Il riscontro DWG non è stato salvato.");
    } finally {
      invio.current = false;
    }
  };
  const clicca=(punto: Punto)=>{
    if (!gesto || !puoScrivere || pendente) return;
    setErrore("");
    try {
      if (gesto.tipo==="aggiungi") {
        prepara(modificaApertura(nuovaAperturaSullaTavola(stato,punto,gesto.apertura,progetto)));
      } else if (gesto.tipo==="sposta" && modifica?.tipo==="apertura") {
        const posizione=posizioneVano(stato,punto,modifica.oggetto.tipo,daNumero(modifica.campi.larghezza));
        prepara({
          ...modifica,oggetto:{...modifica.oggetto,muroId:posizione.muro.id},
          campi:{...modifica.campi,offset:fmt.format(posizione.offset)},
        });
      } else if (gesto.tipo==="quota") {
        if (!gesto.primo) {
          setGesto({...gesto,primo:punto});
          return;
        }
        if (distanza(gesto.primo,punto)<1) throw new Error("Scegli un secondo punto più distante.");
        const q=modifica?.tipo==="quota" ? modifica.oggetto : {id:crypto.randomUUID(),scostamento:40};
        prepara(modificaQuota({...q,p1:gesto.primo,p2:punto}));
      }
    } catch (e) { setErrore(e instanceof Error ? e.message : "Correzione non disponibile."); }
  };
  const applica=()=>{
    if (!modifica || !puoScrivere || pendente) return;
    try {
      const nuovo=modifica.tipo==="apertura"
        ? conAperturaVerificata(stato,{
          ...modifica.oggetto,larghezza:daNumero(modifica.campi.larghezza),offset:daNumero(modifica.campi.offset),
          altezza:daNumero(modifica.campi.altezza),davanzale:daNumero(modifica.campi.davanzale),
          luceNettaCm:modifica.oggetto.tipo==="porta" && modifica.luceNetta.trim() ? daNumero(modifica.luceNetta) : undefined,
          superficieApribileMq:["finestra","portafinestra"].includes(modifica.oggetto.tipo) && modifica.apribile.trim() ? daNumero(modifica.apribile) : undefined,
          superficieIlluminanteMq:["finestra","portafinestra"].includes(modifica.oggetto.tipo) && modifica.illuminante.trim() ? daNumero(modifica.illuminante) : undefined,
        },conferma)
        : conQuotaVerificata(stato,modifica.oggetto,daNumero(modifica.lunghezza),daNumero(modifica.scostamento),conferma);
      setStato(nuovo);
      if (modifica.tipo==="apertura") prepara(modificaApertura(nuovo.aperture.find(a=>a.id===modifica.oggetto.id)!));
      else prepara(modificaQuota(nuovo.quote.find(q=>q.id===modifica.oggetto.id)!));
    } catch (e) {setErrore(e instanceof Error ? e.message : "Correzione non disponibile.");}
  };
  const salva=async()=>{
    if (!puoScrivere || stato===originale || invio.current) return;
    invio.current=true;
    setErrore("");
    try {
      await salvaVersione.mutateAsync({planimetriaId,documento:bozza,versioneAttesa:versione,nota:`Verifica tavola · ${livello.nome}`});
      toast.success("Correzioni salvate");
    } catch(e) {setErrore(e instanceof Error ? e.message : "Correzioni non salvate.");}
    finally {invio.current=false;}
  };
  const cambiaTipo=(tipo: TipoApertura)=>{
    if (modifica?.tipo!=="apertura" || tipo===modifica.oggetto.tipo) return;
    const valori=MISURE_APERTURA[tipo];
    const limite=muro?.altezza ?? (valori.altezza+valori.davanzale);
    const davanzale=Math.min(valori.davanzale,Math.max(0,limite-30));
    setModifica({...modifica,luceNetta:"",apribile:"",illuminante:"",oggetto:{...modifica.oggetto,tipo,manovra:tipo==="varco" ? "nessuna" : "battente"},
      campi:{...modifica.campi,davanzale:fmt.format(davanzale),altezza:fmt.format(Math.min(valori.altezza,limite-davanzale))}});
    setConferma(false);
  };
  const inizia=(azione: Gesto)=>{
    setErrore("");
    setGesto(azione);
  };
  const statoModifica=gesto?.tipo==="quota" ? gesto.primo ? "Scegli il secondo punto della quota." : "Scegli il primo punto della quota."
    : gesto ? "Scegli il centro del vano lungo una parete." : "";

  if (letturaDisponibile && tavola && (inLettura ?? (!aperturaIniziale && (haLettura || !geometria)))) return <LetturaAssistitaTavola
    documento={documento} livello={livello} tavola={tavola} id={planimetriaId} versione={versione} puoScrivere={puoScrivere}
    onCorrezioni={geometria ? () => setInLettura(false) : undefined} />;

  if (!geometria) return <section aria-label="Verifica grafica della tavola" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5">
      <div>
        <h2 className="text-base font-semibold">Verifica tavola · {livello.nome}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{tavola
          ? livello.ricalco?.calibrata ? "Tavola in scala. Apri l’editor per ricalcare il disegno." : "Apri l’editor per mettere in scala la tavola e tracciare il disegno."
          : "Disegna una parete o un ambiente per iniziare a verificare le misure."}</p>
      </div>
      {puoScrivere && <Button asChild size="sm" variant="outline"><Link to={percorsiPlanimetrie.modifica(planimetriaId, livello.id)}>Apri l’editor</Link></Button>}
    </div>
    {tavola && <div className="grid max-h-[min(58vh,620px)] place-items-center overflow-hidden bg-slate-50 p-4">
      <img src={tavola} alt={`Tavola originale · ${livello.nome}`} className="max-h-[min(54vh,580px)] max-w-full object-contain"/>
    </div>}
  </section>;

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(305px,350px)]">
    <section aria-label="Verifica grafica della tavola" className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-base font-semibold">Verifica tavola · {livello.nome}</h2>
          <p className="text-xs text-muted-foreground">{aperture.length} aperture · {stato.quote.length} quote</p>
          {ricalco && livello.ricalco?.calibrata===false && <p className="mt-0.5 text-xs text-muted-foreground">Sovrapposizione per il confronto grafico · scala da confermare</p>}
        </div>
        {letturaDisponibile && <Button type="button" size="sm" variant="outline" disabled={stato!==originale || pendente} onClick={() => setInLettura(true)}>Lettura assistita</Button>}
        {ricalco && <label className="flex items-center gap-2 text-xs font-medium">
          <Layers2 className="h-4 w-4 text-primary" aria-hidden="true"/><span>Tavola originale</span>
          <input type="range" min={0} max={100} value={opacita} className="w-20 accent-blue-700 sm:w-28" onChange={e=>setOpacita(e.target.valueAsNumber)}/>
          <span className="w-8 text-right tabular-nums text-muted-foreground">{opacita}%</span>
        </label>}
      </div>
      {gesto && <div className="flex items-center justify-between gap-2 border-b bg-blue-50 px-4 py-2 text-xs text-blue-950 dark:bg-blue-950 dark:text-blue-100">
        <p className="flex items-center gap-2"><Crosshair className="h-4 w-4"/>{statoModifica}</p>
        <Button size="sm" variant="ghost" className="h-7" onClick={()=>setGesto(null)}>Annulla scelta</Button>
      </div>}
      <div ref={riquadroTavola}>
        <TavolaInterattiva documento={bozza} livelloId={livello.id} ambito={ambito} className="h-[clamp(310px,98vw,455px)] lg:h-[clamp(420px,64vh,750px)]" comandi
          selezionato={localeRiscontro} controlloDwg={riscontroDwg} verifica={{stato,selezione,ricalco,onSeleziona:scegli,onPunto:gesto ? clicca : undefined,puntoQuota:gesto?.tipo==="quota" ? gesto.primo : undefined,
            superficieDaLocalizzare: superficieSelezionata ? {punto: superficieSelezionata.punto, etichetta: `${fmtSuperficie.format(superficieSelezionata.tavola)} m²`} : undefined}}/>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-amber-700" aria-hidden="true"/>Aperture con misure stimate</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-teal-700" aria-hidden="true"/>Aperture con misure documentate</span>
        {tavola && <a href={tavola} target="_blank" rel="noreferrer" className="ml-auto font-medium text-primary hover:underline">Apri la tavola originale</a>}
      </div>
      {(superfici.length > 0 || superficiSenzaContorno.length > 0) && <section aria-labelledby="superfici-tavola" className="space-y-2 border-t p-4 sm:px-5">
        <h3 id="superfici-tavola" className="text-sm font-semibold">Riscontro delle superfici</h3>
        <p className="text-xs text-muted-foreground">Confronta i m² scritti sulla tavola con il contorno del modello. Seleziona una riga per localizzarla sul disegno.</p>
        {scalaModelloDaVerificare(livello) && <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Scala del modello da verificare.</p>}
        <div className="overflow-x-auto rounded-lg border">
          <table aria-label="Superfici della tavola e del modello" className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
              <th scope="col" className="px-3 py-2 text-left">Locale</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Tavola (m²)</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Modello (m²)</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Scarto (m²)</th>
            </tr></thead>
            <tbody className="divide-y">{superfici.map(r => <tr key={r.id} className={cn(localeRiscontro === r.id && "bg-primary/[0.07]")}>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                <button type="button" className="rounded text-left text-primary hover:underline" aria-pressed={localeRiscontro === r.id} onClick={() => scegliSuperficie(r.id)}>{r.nome}</button>
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{fmtSuperficie.format(r.tavola)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtSuperficie.format(r.calcolata)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Math.abs(r.scarto) < 0.005 ? "0,00"
                : `${r.scarto > 0 ? "+" : "−"}${fmtSuperficie.format(Math.abs(r.scarto))}`}</td>
            </tr>)}
            {superficiSenzaContorno.map(r => <tr key={r.id} className={cn(localeRiscontro === r.id && "bg-primary/[0.07]")}>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                <button type="button" className="rounded text-left text-primary hover:underline"
                  aria-label={`Superficie da individuare sulla tavola · ${fmtSuperficie.format(r.tavola)} m²`} aria-pressed={localeRiscontro === r.id}
                  onClick={() => scegliSuperficie(r.id)}>Contorno da individuare</button>
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{fmtSuperficie.format(r.tavola)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">—</td>
              <td className="px-3 py-2 text-right text-muted-foreground">—</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
    </section>
    <div className="min-w-0 space-y-4">
      {!!riscontriDwg?.length && <ControlloGeometriaDwg riscontri={riscontriDwg} selezionato={riscontroDwg} locali={stato.locali}
        puoScrivere={puoScrivere} inSalvataggio={pendente} errore={erroreDwg} onScegli={scegliRiscontroDwg} onDecidi={(r, decisione) => void decidiRiscontroDwg(r, decisione)} />}
    <aside aria-label="Correzioni della tavola" className="min-w-0 rounded-2xl border bg-card shadow-sm">
      <div className="space-y-3 border-b px-4 py-3.5">
        <h2 className="text-sm font-semibold">Correzioni</h2>
        {puoScrivere ? <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Aggiungi un’apertura</span>
            <UniformSelect value="" className="h-8 w-full text-xs" onChange={e=>{
              prepara(null);
              inizia({tipo:"aggiungi",apertura:e.target.value as TipoApertura});
            }} disabled={pendente || !stato.muri.length}>
              <option value="" disabled>Aggiungi un’apertura</option>
              {TIPI_APERTURA.map(t=><option key={t} value={t}>{NOMI_APERTURE[t]}</option>)}
            </UniformSelect>
          </label>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={pendente} onClick={()=>{prepara(null);inizia({tipo:"quota"});}}>
            <Plus className="h-3.5 w-3.5"/>Quota
          </Button>
        </div> : <p className="text-xs text-muted-foreground">Sola lettura · versione {versione}</p>}
      </div>
      {modifica && <form className="space-y-3 border-b bg-muted/20 p-4" onSubmit={e=>{e.preventDefault();applica();}}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{modifica.tipo==="apertura" ? aperture.find(({a})=>a.id===modifica.oggetto.id)?.nome ?? NOMI_APERTURE[modifica.oggetto.tipo] : "Quota selezionata"}</h3>
          {modifica.tipo==="apertura" && aperturaDaVerificare(modifica.oggetto) && <span className="text-xs text-amber-800 dark:text-amber-200">Misure stimate</span>}
        </div>
        <fieldset disabled={!puoScrivere || pendente} className="space-y-3">
          {modifica.tipo==="apertura" ? <>
            <label className="block space-y-1 text-xs font-medium"><span>Tipo di apertura</span>
              <UniformSelect value={modifica.oggetto.tipo} className="h-8 w-full" onChange={e=>cambiaTipo(e.target.value as TipoApertura)}>
                {TIPI_APERTURA.map(t=><option key={t} value={t}>{NOMI_APERTURE[t]}</option>)}
              </UniformSelect>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["larghezza","altezza","offset","davanzale"] as const).filter(c=>c!=="davanzale" || modifica.oggetto.tipo==="finestra").map(c=>
                <Misura key={c} nome={campiApertura[c]} valore={modifica.campi[c]} cambia={v=>setModifica({...modifica,campi:{...modifica.campi,[c]:v}})}/>)}
            </div>
            {modifica.oggetto.tipo==="porta" && <label className="block space-y-1 text-xs font-medium"><span>Luce netta misurata (cm)</span>
              <Input inputMode="decimal" value={modifica.luceNetta} onChange={e=>setModifica({...modifica,luceNetta:e.target.value})} />
            </label>}
            {["finestra","portafinestra"].includes(modifica.oggetto.tipo) && <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-xs font-medium"><span>Superficie apribile (m²)</span>
                <Input inputMode="decimal" value={modifica.apribile} onChange={e=>setModifica({...modifica,apribile:e.target.value})}/>
              </label>
              <label className="block space-y-1 text-xs font-medium"><span>Superficie illuminante (m²)</span>
                <Input inputMode="decimal" value={modifica.illuminante} onChange={e=>setModifica({...modifica,illuminante:e.target.value})}/>
              </label>
            </div>}
            {muro && <p className="text-xs text-muted-foreground">Parete di {fmt.format(lunghezzaMuro(muro))} cm · altezza {fmt.format(muro.altezza)} cm</p>}
          </> : <>
            <div className="grid grid-cols-2 gap-2">
              <Misura nome="Lunghezza quota" valore={modifica.lunghezza} cambia={v=>setModifica({...modifica,lunghezza:v})}/>
              <Misura nome="Scostamento" valore={modifica.scostamento} cambia={v=>setModifica({...modifica,scostamento:v})}/>
            </div>
            {modifica.oggetto.testoOriginale && <p className="text-xs text-muted-foreground">Tavola originale · {modifica.oggetto.testoOriginale}</p>}
          </>}
          {puoScrivere && <>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
              onClick={()=>inizia(modifica.tipo==="apertura" ? {tipo:"sposta"} : {tipo:"quota"})}>
              <Crosshair className="h-3.5 w-3.5"/>{modifica.tipo==="apertura" ? "Sposta sulla tavola" : "Scegli i due punti"}
            </Button>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5 accent-blue-700" checked={conferma} onChange={e=>setConferma(e.target.checked)}/>
              {modifica.tipo==="apertura" ? "Ho verificato le misure" : "Ho verificato la quota"}
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <Button size="sm" type="submit" className="gap-1.5" disabled={!!gesto}><Check className="h-4 w-4"/>Applica alla tavola</Button>
              <Button size="sm" type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={()=>{
                if (selezione) setStato(togliDallaTavola(stato,selezione,progetto));
                prepara(null);
              }}><Trash2 className="h-4 w-4"/>Rimuovi</Button>
            </div>
          </>}
        </fieldset>
      </form>}
      <div className="p-3">
        <div className="mb-2 flex gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label="Elementi sulla tavola">
          <Button size="sm" variant={sezione==="apertura" ? "secondary" : "ghost"} aria-pressed={sezione==="apertura"} onClick={()=>setSezione("apertura")} className="h-8 flex-1">Aperture {aperture.length}</Button>
          <Button size="sm" variant={sezione==="quota" ? "secondary" : "ghost"} aria-pressed={sezione==="quota"} onClick={()=>setSezione("quota")} className="h-8 flex-1 gap-1.5"><Ruler className="h-3.5 w-3.5"/>Quote {stato.quote.length}</Button>
        </div>
        <ul className="max-h-[230px] overflow-auto">
          {sezione==="apertura" ? aperture.map(({a,nome})=><li key={a.id}>
            <Riga nome={nome} misura={`${fmt.format(a.larghezza)} cm`} attiva={selezione?.id===a.id} onClick={()=>scegli({tipo:"apertura",id:a.id})}/>
          </li>) : stato.quote.map((q,i)=><li key={q.id}>
            <Riga nome={`Quota ${i+1}`} misura={`${fmt.format(distanza(q.p1,q.p2))} cm`} attiva={selezione?.id===q.id} onClick={()=>scegli({tipo:"quota",id:q.id})}/>
          </li>)}
        </ul>
        {sezione==="apertura" && stimate>0 && <p className="mt-2 px-1 text-xs text-muted-foreground">{stimate} aperture con misure da verificare</p>}
      </div>
      {errore && <p className="mx-4 mb-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive" role="alert">{errore}</p>}
      {puoScrivere && stato!==originale && <div className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button size="sm" className="gap-1.5" disabled={pendente || !!gesto} onClick={()=>void salva()}>
          <Save className="h-4 w-4"/>{pendente ? "Salvataggio…" : "Salva correzioni"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pendente} onClick={()=>{setStato(originale);prepara(null);}}>Scarta correzioni</Button>
      </div>}
    </aside>
    </div>
  </div>;
}

function Misura({nome,valore,cambia}: {nome:string;valore:string;cambia:(v:string)=>void}) {
  return <label className="flex min-w-0 flex-col justify-end gap-1 text-xs font-medium">
    <span>{nome} (cm)</span><Input className="h-8 text-sm tabular-nums" inputMode="decimal" value={valore} onChange={e=>cambia(e.target.value)}/>
  </label>;
}

function Riga({nome,misura,attiva,onClick}: {nome:string;misura:string;attiva:boolean;onClick:()=>void}) {
  return <button type="button" onClick={onClick} aria-pressed={attiva}
    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted",attiva && "bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100")}>
    <span>{nome}</span><span className="text-xs tabular-nums text-muted-foreground">{misura}</span>
  </button>;
}
