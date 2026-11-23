import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Box, FileText, Layers2, PenLine, ScanLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { CostoProposta } from "./CostoProposta";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { useUrlTavolaOriginale } from "@/lib/planimetrie/anteprime";
import { pianiDaPlanimetria, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { areaPoligono, lunghezzaMuro } from "../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, origineMisura, scalaModelloDaVerificare, type Livello, type Locale, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { ambitoGeometriaDelPiano } from "../../../shared/planimetrie/materialiProgetto.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import type { AnteprimaChatProgetto, RiferimentoAmbienteChat } from "@/lib/planimetrie/chatProgetto";
import type { SegnalazioneProgetto } from "@/lib/planimetrie/analisiProgetto";
import { SilvioPlanimetria } from "./SilvioPlanimetria";
import { TavolaInterattiva } from "./TavolaInterattiva";
import { Vista3DPigra } from "./Vista3DPigra";
import { StudioInterni3D, type PannelloInterni3D } from "./StudioInterni3D";

const mq = (n:number) => `${n.toLocaleString("it-IT",{maximumFractionDigits:2})} m²`;
const area = (l:Locale) => areaPoligono(l.contorno)/10_000;
const ALTEZZA_TAVOLA = "h-[clamp(290px,94vw,440px)] lg:h-[clamp(300px,57vh,640px)]";
export type VistaProgettoPianta = "pianta" | "3d" | "originale";

interface Props {
  documento: Planimetria; titolo: string; livello: Livello; ambito: string; nomeAmbito: string;
  companyId: string; planimetriaId: string; versione: number;
  tavola?: string; cercaTavola: boolean; selezionato?: string; muroSelezionato?: string;
  chatAperta: boolean; analisiAperta: boolean; puoScrivere: boolean;
  vista: VistaProgettoPianta; puoModificare3D?: boolean; torna?: string | null; esplosoIniziale?: boolean;
  bozzaInterni: Planimetria | null; onBozzaInterni: (d: Planimetria | null) => void;
  onSeleziona: (id: string) => void; onApriChat?: () => void; onChiudiChat: () => void; onApriCorrente?: () => void;
  onAnalisi: (aperta: boolean) => void;
  onEsodo?: () => void;
  onRiscontro?: React.ComponentProps<typeof SilvioPlanimetria>["onRiscontro"];
  onVista: (vista: VistaProgettoPianta, punto?: { livelloId: string; localeId?: string }) => void;
  onVerifica: () => void;
  onSalvato3D: (localeId: string) => void;
  onSalvata: (variante: AnteprimaChatProgetto) => void;
}

export function PiantaProgettoWorkspace({ documento, titolo, livello, ambito, nomeAmbito, companyId, planimetriaId, versione,
  tavola, cercaTavola, selezionato, muroSelezionato, chatAperta, analisiAperta, puoScrivere, vista, puoModificare3D, torna, esplosoIniziale, bozzaInterni, onBozzaInterni,
  onSeleziona, onApriChat, onChiudiChat, onApriCorrente, onAnalisi, onEsodo, onRiscontro, onVista, onVerifica, onSalvato3D, onSalvata }: Props) {
  const stato = statoPerAmbito(bozzaInterni ?? documento,livello.id,ambito) ?? livello.fatto;
  const locali = stato.locali;
  const locale = locali.find(l=>l.id===selezionato);
  const muro = stato.muri.find(m=>m.id===muroSelezionato);
  const [pannello3D, setPannello3D] = useState<PannelloInterni3D>("superfici");
  const [inVisita, setInVisita] = useState(false);
  // Gli ambienti aggiunti alla chat di Silvio: il pannello si ricrea a ogni cambio di
  // stanza (key), quindi «Tutto il piano» li deve lasciare qui per ritrovarli.
  const [gruppoChat, setGruppoChat] = useState<RiferimentoAmbienteChat[]>([]);
  const [confronta,setConfronta]=useState(false);
  const [bozza,setBozza]=useState<AnteprimaChatProgetto|null>(null);
  const [pianoBozza,setPianoBozza]=useState<string>();
  const [segnalazione, setSegnalazione] = useState<SegnalazioneProgetto | null>(null);
  const [errore,setErrore]=useState("");
  const salvataggio=useSalvaVersionePlanimetria();
  const inCorso=useRef(false);
  const pannelloChat=useRef<HTMLDivElement>(null);
  const pannelloTavola=useRef<HTMLElement>(null);
  useEffect(()=>{
    if (chatAperta && window.matchMedia("(max-width: 1023px)").matches) {
      pannelloChat.current?.scrollIntoView({block:"start"});
    }
  },[chatAperta]);
  const mostraBozza=chatAperta && bozza && !confronta && vista!=="originale" ? bozza : null;
  const traccia=chatAperta ? bozza?.piani.find(p=>p.livelloId===pianoBozza) : undefined;
  const risalto = chatAperta && vista === "pianta" ? segnalazione : null;
  const livelloVista=documento.livelli.find(l=>l.id===(risalto?.posizione?.livelloId ?? traccia?.livelloId)) ?? livello;
  const confrontoCorrezioni = traccia?.livelloId === livelloVista.id && traccia.correzioni?.length
    ? { elementi: traccia.correzioni, prima: confronta } : undefined;
  const altraTavola=useUrlTavolaOriginale(companyId,livelloVista.id===livello.id ? undefined : livelloVista,documento);
  const tavolaVista=livelloVista.id===livello.id ? tavola : altraTavola.data;
  const cercaTavolaVista=livelloVista.id===livello.id ? cercaTavola : altraTavola.isLoading;
  const documentoVista=mostraBozza?.documento ?? bozzaInterni ?? documento;
  const ambitoVista=mostraBozza?.ambito ?? ambito;
  const statoVista=statoPerAmbito(documentoVista,livelloVista.id,ambitoVista) ?? livelloVista.fatto;
  const localiVisibili=statoVista.locali;
  const superfici = localiVisibili.reduce((totali, locale) => {
    totali[eAmbienteInterno(locale) ? "interne" : "esterne"] += area(locale);
    return totali;
  }, { interne: 0, esterne: 0 });
  const haGeometria=Boolean(statoVista.muri.length || localiVisibili.length || statoVista.aree?.length || statoVista.elementi.length);
  const usoTavola=vista==="originale" || (!haGeometria && Boolean(livelloVista.ricalco || tavolaVista || cercaTavolaVista));
  const proposta3D=ambitoVista.startsWith("progetto:") ? ambitoVista.slice(9) : undefined;
  const ambitoGeometria=ambitoGeometriaDelPiano(documentoVista,livelloVista.id,ambitoVista);
  const studioInterni = vista === "3d" && !chatAperta && localiVisibili.some(eAmbienteInterno);
  const piante=useMemo(()=>vista==="3d" && !studioInterni ? pianteDaPlanimetria(documentoVista,{livelloId:livelloVista.id,propostaId:proposta3D,materialiAmbito:ambitoVista}) : null,
    [vista,studioInterni,documentoVista,livelloVista.id,proposta3D,ambitoVista]);
  const piani3D=useMemo(()=>piante ? pianiDaPlanimetria(documentoVista,proposta3D) : undefined,[piante,documentoVista,proposta3D]);

  const anteprima = (proposta: AnteprimaChatProgetto|null) => {
    setSegnalazione(null);
    setBozza(proposta);
    setPianoBozza(p=>proposta?.piani.some(l=>l.livelloId===p) ? p : proposta?.livelloId);
    setConfronta(false);
    setErrore("");
    if (proposta) {
      onVista("pianta");
    }
  };
  const mostraSegnalazione = (esito: SegnalazioneProgetto | null) => {
    setSegnalazione(esito);
    if (!esito?.posizione) return;
    onVista("pianta");
    if (bozza?.piani.some(p => p.livelloId === esito.posizione?.livelloId)) setPianoBozza(esito.posizione.livelloId);
    if (window.matchMedia("(max-width: 1023px)").matches) pannelloTavola.current?.scrollIntoView({ block: "start" });
  };
  const seleziona=(id:string)=>{
    if (salvataggio.isPending || id===(locale?.id ?? "")) return;
    anteprima(null);
    setGruppoChat([]);
    onSeleziona(id);
  };
  const salva=async()=>{
    if (!bozza || !puoScrivere || inCorso.current) return;
    inCorso.current=true;
    setErrore("");
    try {
      await salvataggio.mutateAsync({
        planimetriaId,documento:bozza.documento,versioneAttesa:versione,nota:`Variante con Silvio · ${bozza.nomeVariante}`,
      });
      toast.success("Variante salvata",{description:bozza.nomeVariante});
      onSalvata(bozza);
      anteprima(null);
    } catch(e) {setErrore(e instanceof Error ? e.message : "La variante non è stata salvata.");}
    finally {inCorso.current=false;}
  };
  const chiudiChat=()=>{anteprima(null);onChiudiChat();};
  const comandi:Array<{id:VistaProgettoPianta;nome:string;icona:typeof Box;abilitato:boolean}> = [
    {id:"pianta",nome:"2D",icona:Layers2,abilitato:haGeometria},
    {id:"3d",nome:"3D",icona:Box,abilitato:haGeometria},
    {id:"originale",nome:"Originale",icona:FileText,abilitato:Boolean(tavolaVista || cercaTavolaVista)},
  ];

  return <div className={cn("grid items-start gap-4 xl:gap-5", !studioInterni && "lg:grid-cols-[minmax(0,1fr)_minmax(302px,340px)]")}>
    <section ref={pannelloTavola} aria-label="Panoramica della pianta" className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{vista === "3d" && inVisita ? "Visita dell’edificio" : livelloVista.nome}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{mostraBozza ? mostraBozza.nomeVariante : nomeAmbito}</p>
          {bozzaInterni && !mostraBozza && <span role="status" className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/35 dark:text-amber-200 motion-safe:animate-in motion-safe:fade-in-0">
            <PenLine aria-hidden className="size-3"/>Modifiche 3D da salvare
          </span>}
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/35 p-1" role="group" aria-label="Vista della pianta">
          {comandi.map(({id,nome,icona:Icona,abilitato})=><Button key={id} size="sm" variant="ghost"
            disabled={!abilitato} aria-pressed={usoTavola ? id==="originale" : vista===id} aria-label={id==="3d" ? "Guarda in 3D" : id==="pianta" ? "Pianta 2D" : "Tavola originale"}
            onClick={()=>onVista(id)}
            className={cn("h-8 gap-1.5 px-2.5 text-xs", (usoTavola ? id==="originale" : vista===id) && "bg-background text-primary shadow-sm hover:bg-background")}>
            <Icona className="h-3.5 w-3.5"/>{nome}
          </Button>)}
        </div>
      </div>
      {bozza && chatAperta && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-teal-50 px-4 py-2 dark:border-teal-900 dark:bg-teal-950/25">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-900 dark:text-teal-100" role="status">
          <Sparkles className="h-3.5 w-3.5"/>
          {confronta ? "Prima delle modifiche" : "Anteprima della proposta"}
        </span>
        <CostoProposta documento={documento} proposta={bozza.documento} ambito={bozza.ambito} companyId={companyId} />
        {bozza.piani.length>1 && <UniformSelect aria-label="Piano dell’anteprima" value={livelloVista.id} className="h-7 text-xs"
          onChange={e=>{setPianoBozza(e.target.value);setSegnalazione(null);}}>
          {bozza.piani.map(p=><option key={p.livelloId} value={p.livelloId}>{p.nome}</option>)}
        </UniformSelect>}
        <Button size="sm" variant="ghost" disabled={salvataggio.isPending}
          onClick={()=>{setConfronta(v=>!v);onVista("pianta");setSegnalazione(null);}} className="h-7 px-2 text-xs text-teal-900 dark:text-teal-100">
          {confronta ? "Mostra proposta" : "Mostra prima"}
        </Button>
      </div>}
      {usoTavola ? <div className={cn("grid place-items-center bg-slate-50 p-4 dark:bg-slate-200",ALTEZZA_TAVOLA)}>
        {tavolaVista ? <img src={tavolaVista} alt={`Tavola originale · ${livelloVista.nome}`} className="max-h-full min-h-0 max-w-full object-contain"/> :
          <p className="text-sm text-muted-foreground">{cercaTavolaVista ? "Carico la tavola…" : "Tavola originale non disponibile."}</p>}
      </div> : studioInterni ? <StudioInterni3D documento={documento} bozza={bozzaInterni} onBozza={onBozzaInterni}
        livello={livello} ambito={ambito} planimetriaId={planimetriaId} titolo={titolo} versione={versione} localeIniziale={selezionato} esplosoIniziale={esplosoIniziale}
        pannello={pannello3D} onPannello={setPannello3D} onLocaleCambiato={onSeleziona} onVediInPianta={punto=>onVista("pianta",punto)}
        inVisita={inVisita} onVisita={setInVisita}
        puoScrivere={!!puoModificare3D} onSalvata={onSalvato3D} onVerifica={onVerifica} torna={torna} />
        : piante ? <Vista3DPigra key={livelloVista.id+":"+ambitoVista} piante={piante} piani={piani3D} livelloIniziale={livelloVista.id} esplosoIniziale={esplosoIniziale}
          archivioRender={mostraBozza || bozzaInterni ? undefined : { planimetriaId, ambito: ambitoVista, versione }}
          vistaEdificioIniziale={ambitoVista === "fatto" ? "fatto" : "progetto"}
          onVediInPianta={punto=>onVista("pianta",punto)} onVisita={setInVisita}
          versione={mostraBozza || bozzaInterni ? undefined : versione} nomeFile={titolo} vistaIniziale={ambitoGeometria==="fatto" ? "fatto" : "progetto"}/> :
        <TavolaInterattiva key={livelloVista.id} documento={documentoVista} livelloId={livelloVista.id} ambito={ambitoVista} className={ALTEZZA_TAVOLA} statoImpianti={statoVista}
          selezionato={confrontoCorrezioni ? undefined : mostraBozza ? traccia?.evidenzaLocali[0] : livelloVista.id===livello.id ? locale?.id : undefined}
          evidenzaLocali={mostraBozza ? traccia?.evidenzaLocali : undefined} evidenzaMuri={mostraBozza ? traccia?.evidenzaMuri : undefined}
          muroSelezionato={mostraBozza || confrontoCorrezioni ? undefined : muro}
          segnalazione={risalto} correzioni={risalto ? undefined : confrontoCorrezioni}
          onSeleziona={mostraBozza || confrontoCorrezioni || livelloVista.id!==livello.id || salvataggio.isPending ? undefined : seleziona} comandi />}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        {risalto?.posizione ? <span role="status" className="font-medium text-foreground">{risalto.posizione.etichetta} · {livelloVista.nome}</span>
          : muro && !mostraBozza ? <span role="status" className="font-medium text-blue-800 dark:text-blue-300">Parete selezionata · {(lunghezzaMuro(muro)/100).toLocaleString("it-IT")} m × {(muro.altezza/100).toLocaleString("it-IT")} m</span>
          : <span>{localiVisibili.length
            ? [superfici.interne > 0 && `${mq(superfici.interne)} interni`, superfici.esterne > 0 && `${mq(superfici.esterne)} tra esterni e cavedi`].filter(Boolean).join(" · ")
            : "Nessun ambiente rilevato"}</span>}
        {tavolaVista && !(vista === "3d" && inVisita) && <a href={tavolaVista} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Apri la tavola originale <ArrowUpRight className="h-3.5 w-3.5"/></a>}
      </div>
    </section>
    {chatAperta ? <div ref={pannelloChat} className="min-w-0 scroll-mt-20"><SilvioPlanimetria key={locale?.id ?? "nessuno"} documento={documento} selezione={{livelloId:livello.id,ambito,localeId:locale?.id ?? ""}}
      locali={locali} companyId={companyId} puoScrivere={puoScrivere} bozza={bozza} salvataggio={salvataggio.isPending} erroreSalvataggio={errore}
      analisi={analisiAperta} onAnalisi={onAnalisi} mostraPrima={confronta} onEsodo={onEsodo} onRiscontro={onRiscontro}
      evidenziata={risalto} onMostraSegnalazione={mostraSegnalazione}
      gruppoIniziale={gruppoChat} onGruppo={setGruppoChat}
      onSeleziona={seleziona} onAnteprima={anteprima} onSalva={()=>void salva()} onChiudi={chiudiChat} onVaiAllaCorrente={onApriCorrente}/></div> :
      !studioInterni && <aside aria-label="Ambienti del piano" className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3.5">
          <h2 className="text-sm font-semibold">Ambienti del piano</h2><span className="text-xs tabular-nums text-muted-foreground">{locali.length}</span>
        </div>
        {locale && <SchedaAmbiente locale={locale} scalaStimata={scalaModelloDaVerificare(livello)} onApriChat={onApriChat}
          on3D={eAmbienteInterno(locale) ? () => onVista("3d",{ livelloId: livello.id, localeId: locale.id }) : undefined}/>}
        {locali.length ? <ul className="max-h-[335px] overflow-auto p-2">
          {locali.map(l=><li key={l.id}><button type="button" onClick={()=>{if (vista==="pianta") seleziona(l.id); else onVista("pianta",{livelloId:livello.id,localeId:l.id});}}
            aria-pressed={locale?.id===l.id}
            className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-muted",locale?.id===l.id && "bg-blue-50 text-blue-900 dark:bg-blue-950/45 dark:text-blue-100")}>
            <span className="min-w-0 break-words font-medium">{l.nome}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{mq(area(l))}</span>
          </button></li>)}
        </ul> : <p className="p-4 text-sm text-muted-foreground">Traccia il perimetro di una stanza nell’editor per consultarne le misure e selezionarla con Silvio.</p>}
      </aside>}
  </div>;
}

function SchedaAmbiente({ locale, scalaStimata, onApriChat, on3D }: {locale: Locale; scalaStimata:boolean; onApriChat?:()=>void; on3D?:()=>void}) {
  const stimata = scalaStimata || origineMisura(locale,"contorno")==="stimata";
  return <div className="space-y-3 border-b bg-slate-50 p-4 dark:bg-slate-900/40">
    <div className="flex items-start gap-2.5">
      <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
      <div className="min-w-0"><p className="break-words text-sm font-semibold">{locale.nome}</p><p className="text-xs capitalize text-muted-foreground">{locale.destinazione.replaceAll("_"," ")}</p></div>
    </div>
    <dl className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border bg-card p-2.5"><dt className="text-[11px] text-muted-foreground">{stimata ? "Superficie stimata" : "Dal disegno"}</dt><dd className="text-sm font-semibold tabular-nums">{mq(area(locale))}</dd></div>
      {locale.superficieDichiarataMq ? <div className="rounded-lg border bg-card p-2.5"><dt className="text-[11px] text-muted-foreground">Scritta sulla tavola</dt><dd className="text-sm font-semibold tabular-nums">{mq(locale.superficieDichiarataMq)}</dd></div> :
        <div className="rounded-lg border bg-card p-2.5"><dt className="text-[11px] text-muted-foreground">{origineMisura(locale,"altezza")==="stimata" ? "Altezza stimata" : "Altezza"}</dt><dd className="text-sm font-semibold tabular-nums">{(locale.altezza/100).toLocaleString("it-IT",{maximumFractionDigits:2})} m</dd></div>}
    </dl>
    {on3D && <Button size="sm" className="w-full gap-2 motion-safe:active:scale-[.98] motion-safe:transition-transform" onClick={on3D}><Box className="size-4"/>Esplora in 3D</Button>}
    {onApriChat && <Button size="sm" variant="outline" className="w-full gap-2" onClick={onApriChat}><Sparkles className="h-4 w-4 text-blue-700"/>Chiedi su questo ambiente</Button>}
  </div>;
}
