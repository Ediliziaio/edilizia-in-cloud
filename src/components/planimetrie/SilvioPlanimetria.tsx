import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, Loader2, ScanSearch, Send, Sparkles, Undo2, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { InterventiChatDisegno } from "./editor/InterventiChatDisegno";
import { anteprimaInterventi } from "./editor/interventiChat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { chiediSulProgetto, interpretaComando } from "@/lib/planimetrie/assistenzaStudio";
import { aggiornaRevisioneDisegno, annullaUltimoDisegno, eAnnullaUltimo, eseguiDisegnoSullaScheda, nomiAmbientiDelPiano, selezionePerDomanda, sembraDomanda, unisciAlDisegno, type EsitoDisegnoScheda } from "@/lib/planimetrie/chatUnicaPlanimetria";
import {
  anteprimaCorrezioniProgetto, anteprimaDaChatProgetto, contestoChatProgetto, idAmbienteChat, type AmbitoChatProgetto,
  type AnteprimaChatProgetto, type RiferimentoAmbienteChat,
} from "@/lib/planimetrie/chatProgetto";
import { LIMITE_CHAT_PROGETTO, MASSIMO_AMBIENTI_CHAT, type MessaggioChatProgetto } from "../../../shared/planimetrie/chatProgetto.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Locale, Planimetria } from "../../../shared/planimetrie/modello.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { AccessiProposta } from "./AccessiProposta";
import { AnalisiProgettoPlanimetria } from "./AnalisiProgettoPlanimetria";
import type { SegnalazioneProgetto } from "@/lib/planimetrie/analisiProgetto";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const ESEMPI = [
  {etichetta:"Controlla la superficie",testo:"Qual è la superficie ricostruita della stanza? Confrontala con la misura scritta sul DWG, se c’è."},
  {etichetta:"Prova il parquet",testo:"Prova un parquet in rovere naturale nella stanza selezionata."},
  {etichetta:"Proponi un tramezzo",testo:"Proponi un tramezzo per dividere la stanza selezionata in due ambienti."},
];
const ESEMPI_GRUPPO = [
  {etichetta:"Confronta le superfici",testo:"Confronta le superfici degli ambienti selezionati."},
  {etichetta:"Prova il parquet nelle stanze",testo:"Prova un parquet in rovere in tutti gli ambienti selezionati."},
];
/** Un messaggio della chat unica: le risposte del disegno portano anche cosa è stato fatto e gli avvisi. */
interface MessaggioScheda extends MessaggioChatProgetto { fatti?: string[]; avvisi?: string[] }
const perSilvio = (m: MessaggioScheda): MessaggioChatProgetto =>
  ({ruolo:m.ruolo,testo:[m.testo,...m.fatti ?? [],...m.avvisi ?? []].join("\n").slice(0,1400)});
const descriviCambio = (m: {etichetta:string;prima:string;dopo:string;ambiente?:string}) =>
  [m.ambiente,m.prima || m.dopo ? `${m.etichetta} → ${m.dopo}` : m.etichetta].filter(Boolean).join(" · ");
const superficie = (l:Locale) => `${(areaPoligono(l.contorno)/10_000).toLocaleString(intlCampo(),{maximumFractionDigits:2})} m²`;

/** Il grassetto «**testo**» che a volte scrive l'AI, mostrato come grassetto e non con gli asterischi. */
function conGrassetto(testo: string) {
  return testo.split(/(\*\*[^*\n]+\*\*)/g).map((pezzo, i) =>
    /^\*\*[^*\n]+\*\*$/.test(pezzo) ? <strong key={i}>{pezzo.slice(2, -2)}</strong> : pezzo);
}

const TUTTA_LA_CASA = "__tutto_il_piano";

/**
 * L'unica chat della scheda planimetria (24/11/2026): esegue i comandi del disegno con le regole
 * (gratis), passa all'interprete le modifiche che le regole non capiscono, e lascia a Silvio le
 * domande sul progetto e le finiture. Le modifiche, da qualunque strada arrivino, si vedono
 * prima in anteprima con il costo e si salvano come variante. Vedi `chatUnicaPlanimetria.ts`.
 */
export function SilvioPlanimetria({ documento, selezione, locali, companyId, puoScrivere, bozza, mostraPrima, salvataggio, erroreSalvataggio, analisi, onAnalisi, onEsodo, onRiscontro, evidenziata, onMostraSegnalazione, onSeleziona, onAnteprima, onSalva, onChiudi, onVaiAllaCorrente, gruppoIniziale, onGruppo, onVista3D, muroId }: {
  documento: Planimetria; selezione: AmbitoChatProgetto; locali: Locale[]; companyId: string; puoScrivere: boolean;
  bozza: AnteprimaChatProgetto | null; salvataggio: boolean; erroreSalvataggio?: string;
  mostraPrima: boolean;
  analisi: boolean; onAnalisi: (aperta: boolean) => void;
  onEsodo?: () => void;
  onRiscontro?: React.ComponentProps<typeof AnalisiProgettoPlanimetria>["onRiscontro"];
  evidenziata?: SegnalazioneProgetto | null;
  onMostraSegnalazione?: (esito: SegnalazioneProgetto | null) => void;
  onSeleziona: (id: string) => void; onAnteprima: (bozza: AnteprimaChatProgetto | null) => void;
  onSalva: () => void; onChiudi: () => void; onVaiAllaCorrente?: () => void;
  /** Ambienti già nel gruppo quando il pannello si ricrea su un'altra stanza («Tutto il piano»). */
  gruppoIniziale?: RiferimentoAmbienteChat[]; onGruppo?: (gruppo: RiferimentoAmbienteChat[]) => void;
  /** «3D» scritto nella chat: apre la vista 3D della scheda. */
  onVista3D?: () => void;
  /** La parete scelta sulla tavola: i comandi senza nomi («sposta il tramezzo di 20 cm») valgono per lei. */
  muroId?: string;
}) {
  const { canViewPreventivi } = usePermissions();
  const t = useT();
  const [messaggi,setMessaggi]=useState<MessaggioScheda[]>([]);
  const [fase,setFase]=useState("");
  // Senza una stanza scelta la prima domanda sceglie da sé gli ambienti: le successive ripartono da lì,
  // così «principale» resta la stessa stanza mentre le proposte si sommano.
  const sceltaDomanda=useRef<AmbitoChatProgetto|null>(null);
  const [richiesta,setRichiesta]=useState("");
  const [invio,setInvio]=useState(false);
  const [errore,setErrore]=useState("");
  const [altri,setAltri]=useState<RiferimentoAmbienteChat[]>(()=>gruppoIniziale ?? []);
  const attivo=useRef(true);
  const occupato=useRef(false);
  const fine=useRef<HTMLDivElement>(null);
  const elencoAmbienti=useRef<HTMLDetailsElement>(null);
  const {livelloId,ambito,localeId}=selezione;
  const selezioneChat=useMemo(()=>({livelloId,ambito,localeId,altri}),[livelloId,ambito,localeId,altri]);
  const contesto=useMemo(()=>contestoChatProgetto(documento,selezioneChat),[documento,selezioneChat]);
  const opzioni=useMemo(()=>documento.livelli.map(piano=>({
    id:piano.id,nome:piano.nome,
    locali:(statoPerAmbito(documento,piano.id,ambito) ?? piano.fatto).locali
      .filter(l=>piano.id!==livelloId || l.id!==localeId),
  })),[documento,ambito,livelloId,localeId]);
  const quanti=contesto ? (contesto.altriAmbienti?.length ?? 0)+1 : 0;
  const esempi=useMemo(()=>{
    const base=quanti>1 ? ESEMPI_GRUPPO : contesto ? ESEMPI : [];
    const [a,b]=locali;
    return a && b ? [{etichetta:"Aggiungi una porta",testo:`Porta tra ${a.nome} e ${b.nome} da 80 cm`},...base] : base;
  },[quanti,contesto,locali]);
  const accessi=bozza?.piani.flatMap(p=>p.accessi.map(a=>({...a,piano:p.nome}))) ?? [];
  const correzioniInCorso = !!bozza?.piani.some(p => p.correzioni?.length);
  const propostaAnalizzata = mostraPrima ? null : bozza;
  // «Tutto il piano»: il primo ambiente è quello principale, gli altri entrano nel
  // gruppo (fino a MASSIMO_AMBIENTI_CHAT). Prima per una domanda sulla casa intera
  // si dovevano spuntare le stanze una per una (23/11/2026).
  const scegliAmbiente=(valore:string)=>{
    if (valore!==TUTTA_LA_CASA) { onSeleziona(valore); return; }
    if (!locali.length || invio || salvataggio) return;
    if (bozza && !bozza.disegno) onAnteprima(null);
    const gruppo=locali.slice(1,MASSIMO_AMBIENTI_CHAT).map(l=>({livelloId:selezione.livelloId,localeId:l.id}));
    onSeleziona(locali[0].id);
    onGruppo?.(gruppo);
    setAltri(gruppo);
    setErrore("");
  };
  const modificaSelezione=(riferimento:RiferimentoAmbienteChat, scelto:boolean)=>{
    if (invio || salvataggio) return;
    if (bozza && !bozza.disegno) onAnteprima(null);
    setAltri(v=>scelto ? [...v,riferimento].slice(0,MASSIMO_AMBIENTI_CHAT-1) : v.filter(a=>idAmbienteChat(a)!==idAmbienteChat(riferimento)));
    setErrore("");
  };
  // Il pannello resta lo stesso quando cambia la stanza (la conversazione e i comandi del disegno
  // non si perdono): il gruppo riparte da quello che il genitore conserva («Tutto il piano»).
  // Si aggiorna durante il render, non in un effetto: niente secondo giro di render.
  const [localeDelGruppo,setLocaleDelGruppo]=useState(localeId);
  if (localeDelGruppo!==localeId) { setLocaleDelGruppo(localeId); setAltri(gruppoIniziale ?? []); }
  useEffect(()=>{
    attivo.current=true;
    return ()=>{attivo.current=false;};
  },[]);
  useEffect(()=>{
    if (messaggi.length) fine.current?.scrollIntoView({block:"nearest"});
  },[messaggi.length,invio]);

  const preparaCorrezioni = () => {
    if (!puoScrivere || occupato.current || salvataggio || bozza) return;
    const proposta = anteprimaCorrezioniProgetto(documento, selezione);
    if (!proposta) {
      setErrore(t("I ripristini richiedono una revisione sulla tavola prima di poter salvare la variante."));
      return;
    }
    setErrore("");
    onAnteprima(proposta);
  };

  /** La risposta delle regole del disegno, con l'anteprima se la pianta cambia. */
  function mostraDisegno(esito: EsitoDisegnoScheda, capito?: string) {
    const fatti=esito.fatti, avvisi=[...esito.avvisi];
    const vuole3D=esito.viste.includes("3d");
    if (esito.viste.some(v=>v!=="3d")) avvisi.push(t("I render si preparano dall’editor della planimetria o con «Render tutte le stanze»."));
    if (vuole3D && esito.anteprima) avvisi.push(t("Salva la variante per vederla in 3D."));
    const testo=esito.anteprima ? t("Proposta pronta: la vedi sulla tavola con il costo. Salvala come variante o scartala.")
      : fatti.length ? t("Risultato sulla tavola") : vuole3D ? t("Apro la vista 3D.") : t("Non riesco ad applicare il comando.");
    setMessaggi(m=>[...m,...(capito ? [{ruolo:"silvio" as const,testo:capito}] : []),{ruolo:"silvio",testo,fatti,avvisi}]);
    if (esito.anteprima) onAnteprima(esito.anteprima);
    else if (vuole3D) onVista3D?.();
  }

  /** «Annulla l'ultimo»: il bottone e la frase fanno la stessa cosa, senza AI. */
  function annullaUltimo() {
    if (!bozza?.revisioneDisegno) return false;
    const { anteprima, tolto } = annullaUltimoDisegno(bozza);
    onAnteprima(anteprima);
    setMessaggi(m=>[...m,{ruolo:"silvio",testo:tolto ? `Ho tolto «${tolto}» dalla variante.${anteprima ? "" : " Non resta altro da salvare."}` : "Non ci sono comandi da annullare."}]);
    return true;
  }

  async function chiediASilvio(testo: string, esito?: SegnalazioneProgetto) {
    // Su un'anteprima del disegno Silvio lavora sopra la variante non ancora salvata.
    const sopra=bozza?.disegno ? {documento:bozza.documento,ambito:bozza.ambito} : {documento,ambito};
    const partenza=esito ? selezioneChat : (selezione.localeId ? selezioneChat : sceltaDomanda.current ?? {...selezioneChat,altri:[]});
    const scelta=esito ? partenza : selezionePerDomanda({...partenza,ambito:sopra.ambito},locali,testo);
    if (!esito && !selezione.localeId && scelta) sceltaDomanda.current={...scelta,ambito};
    const contestoDomanda=scelta && contestoChatProgetto(sopra.documento,{...scelta,ambito:sopra.ambito});
    if (!scelta || !contestoDomanda) throw new Error(t("Scegli un ambiente sulla tavola o dal menu per chiedere a Silvio."));
    setFase(t("Silvio sta elaborando la risposta…"));
    const cronologia=(bozza
      ? [...messaggi,{ruolo:"silvio" as const,testo:`${t("Anteprima aperta")} · ${bozza.modifiche.map(descriviCambio).join("\n")}`}]
      : messaggi).map(perSilvio);
    const risposta=await chiediSulProgetto(companyId,testo,contestoDomanda,cronologia.slice(-8));
    if (!attivo.current) return;
    setMessaggi(m=>[...m,{ruolo:"silvio",testo:risposta.testo}]);
    if (!risposta.modifiche.length || esito) return;
    const sel={...scelta,ambito:sopra.ambito};
    const proposta=bozza?.disegno ? anteprimaDaChatProgetto(sopra.documento,sel,risposta,testo,null) : anteprimaDaChatProgetto(documento,sel,risposta,testo,bozza);
    if (proposta) onAnteprima(bozza?.disegno ? unisciAlDisegno(bozza,proposta) : proposta);
    else setErrore(t("La richiesta non produce una modifica applicabile agli ambienti selezionati."));
  }

  async function invia(esito?: SegnalazioneProgetto) {
    const domanda = esito ? t("Cosa devo verificare per «{titolo}»?", { titolo: esito.titolo }) : richiesta.trim();
    const testo = esito ? [
      t("Spiega il controllo indicato con una risposta pratica, usando i dati forniti e senza proporre modifiche alla pianta o concludere che il progetto è conforme."),
      `${esito.area} · ${esito.titolo}${esito.piano ? ` · ${t("Piano {piano}", { piano: esito.piano })}` : ""}.`,
      esito.descrizione,
      esito.verifica,
      esito.fonte?.nome,
    ].filter(Boolean).join("\n").slice(0, LIMITE_CHAT_PROGETTO) : domanda;
    if (!testo || !puoScrivere || occupato.current || salvataggio || (esito ? !contesto : correzioniInCorso || !locali.length)) return;
    occupato.current=true;
    if (elencoAmbienti.current) elencoAmbienti.current.open=false;
    setInvio(true); setErrore("");
    if (!esito) setRichiesta("");
    const nuovo: MessaggioScheda = {ruolo:"utente",testo:domanda};
    setMessaggi(m=>[...m,nuovo]);
    try {
      if (esito) { await chiediASilvio(testo,esito); return; }
      if (eAnnullaUltimo(testo) && annullaUltimo()) return;
      // 1. Le regole del disegno: gratis, e se capiscono non serve nessuna AI.
      setFase(t("Eseguo il comando…"));
      const oggetto=muroId ? {tipo:"muro" as const,id:muroId} : undefined;
      const disegno=eseguiDisegnoSullaScheda(documento,selezioneChat,testo,bozza,oggetto);
      if (disegno.capito) { mostraDisegno(disegno); return; }
      // 2. Una modifica che le regole non capiscono: l'interprete la riscrive in comandi.
      if (!sembraDomanda(testo)) {
        setFase(t("Silvio interpreta la richiesta…"));
        const r=await interpretaComando(companyId,testo,nomiAmbientiDelPiano(bozza?.documento ?? documento,selezione.livelloId,bozza?.ambito ?? ambito),"progetto");
        if (!attivo.current) return;
        if (r.comandi.length) {
          const tradotto=eseguiDisegnoSullaScheda(documento,selezioneChat,r.comandi.join("\n"),bozza,oggetto);
          mostraDisegno(tradotto,t("Ho capito così: {comandi}", { comandi: r.comandi.join(" · ") }));
          return;
        }
        if (!r.silvio) {
          setMessaggi(m=>[...m,{ruolo:"silvio",testo:r.domanda || t("Non ho capito la richiesta. Prova a dirla con il nome della stanza e la misura.")}]);
          return;
        }
      }
      // 3. Una domanda sul progetto, una finitura o un nome: risponde Silvio, come prima.
      await chiediASilvio(testo);
    } catch(e) {
      if (attivo.current) {
        setErrore(e instanceof Error ? e.message : t("Silvio non è disponibile."));
        if (!esito) setRichiesta(testo);
        setMessaggi(m=>m.at(-1)===nuovo ? m.slice(0,-1) : m);
      }
    } finally {
      occupato.current=false;
      if (attivo.current) { setInvio(false); setFase(""); }
    }
  }

  const rd = bozza?.revisioneDisegno;
  const fisse = rd ? rd.modificheFisse : bozza?.modifiche ?? [];
  const riepilogo = bozza && puoScrivere && <section aria-label={t("Proposta di Silvio")} className="border-t border-teal-200 bg-teal-50/65 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">{t("Anteprima sulla tavola")}</p>
    <h3 className="text-sm font-semibold">{bozza.nomeVariante}</h3>
    {fisse.length>0 && <ul className="mt-2 max-h-36 space-y-1.5 overflow-auto text-xs">{fisse.map((m,i)=><li className="flex flex-wrap items-baseline gap-1.5" key={i}>
      <span className="w-full font-medium">{m.etichetta}{m.ambiente && <span className="ml-1 font-normal text-muted-foreground">· {m.ambiente}</span>}</span>{(m.prima || m.dopo) && <><span className="text-muted-foreground">{m.prima}</span><ArrowRight className="h-3 w-3 self-center text-teal-700"/><span className="font-medium">{m.dopo}</span></>}
    </li>)}</ul>}
    {/* I comandi del disegno, come nell'editor: spunta per intervento, computo prima/dopo e prezzi a mano. */}
    {rd && <div className="mt-2 flex max-h-[420px] min-h-0 flex-col">
      <InterventiChatDisegno proposta={anteprimaInterventi(rd.revisione)} revisione={rd.revisione} vista="progetto"
        contesto={{documento:rd.partenza,livelloId:rd.livelloId,propostaId:rd.id}} consentiListino={canViewPreventivi}
        onModifica={r=>onAnteprima(aggiornaRevisioneDisegno(bozza,r))} onPosizione={()=>{}}
        onEvidenzia={e=>onAnteprima({...bozza,evidenzaLocali:e.tipo==="locale" ? [e.id] : bozza.evidenzaLocali,evidenzaMuri:e.tipo==="muro" ? [e.id] : bozza.evidenzaMuri})}/>
    </div>}
    <AccessiProposta accessi={accessi} className="mt-2.5 max-h-40 overflow-auto"/>
    {bozza.bloccata && <p role="status" className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{bozza.bloccata}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" className="gap-1.5 bg-teal-800 text-white hover:bg-teal-900" disabled={salvataggio || invio || !!bozza.bloccata} onClick={onSalva}><Check className="h-4 w-4"/>{salvataggio ? t("Salvo…") : t("Salva come variante")}</Button>
      {rd && rd.revisione.interventi.length>0 && <Button size="sm" variant="outline" className="gap-1.5" disabled={salvataggio || invio} onClick={()=>annullaUltimo()}><Undo2 className="h-4 w-4"/>{t("Annulla l’ultimo")}</Button>}
      <Button size="sm" variant="ghost" disabled={salvataggio || invio} onClick={()=>onAnteprima(null)}>{t("Scarta")}</Button>
    </div>
  </section>;

  return <aside aria-label={t("Chat di Silvio sulla planimetria")} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex items-center gap-3 border-b bg-slate-50 px-4 py-3.5 dark:bg-slate-900/40">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><Sparkles className="h-4 w-4"/></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Silvio</h2><p className="truncate text-xs text-muted-foreground">{quanti>1 ? t("{quanti} ambienti selezionati", { quanti: String(quanti ?? "") }) : contesto?.piano ?? t("Planimetria")}</p></div>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={t("Chiudi Silvio")} onClick={onChiudi} disabled={salvataggio}><X className="h-4 w-4"/></Button>
    </div>
    <div className="border-b px-4 py-2.5">
      <Button type="button" size="sm" variant={analisi ? "secondary" : "outline"} aria-expanded={analisi} className="w-full justify-start gap-2" onClick={() => {
        if (analisi) onMostraSegnalazione?.(null);
        onAnalisi(!analisi);
      }}>
        <ScanSearch className="h-4 w-4" />{t("Analizza progetto")}
      </Button>
    </div>
    {correzioniInCorso && riepilogo}
    {analisi && <AnalisiProgettoPlanimetria documento={propostaAnalizzata?.documento ?? documento} ambito={propostaAnalizzata?.ambito ?? ambito}
      anteprima={!!propostaAnalizzata} occupato={invio || salvataggio} evidenziata={evidenziata} onMostra={onMostraSegnalazione}
      onApprofondisci={contesto && puoScrivere ? esito => void invia(esito) : undefined}
      onPreparaCorrezioni={puoScrivere && !bozza ? preparaCorrezioni : undefined}
      onEsodo={propostaAnalizzata ? undefined : onEsodo} onRiscontro={propostaAnalizzata ? undefined : onRiscontro} />}
    <div className="border-b px-4 py-3">
      <label className="block space-y-1.5 text-xs font-medium">
        <span>{t("Ambiente della chat")}</span>
        <UniformSelect value={selezione.localeId} onChange={e=>scegliAmbiente(e.target.value)} disabled={salvataggio || invio || correzioniInCorso} className="w-full">
          <option value="">{t("Scegli un ambiente")}</option>
          {locali.length>1 && <option value={TUTTA_LA_CASA}>{locali.length>MASSIMO_AMBIENTI_CHAT ? t("Tutto il piano · primi {MASSIMO_AMBIENTI_CHAT} ambienti", { MASSIMO_AMBIENTI_CHAT: String(MASSIMO_AMBIENTI_CHAT ?? "") }) : t("Tutto il piano")}</option>}
          {locali.map(l=><option key={l.id} value={l.id}>{l.nome}{locali.some(a=>a.id!==l.id && a.nome===l.nome) ? ` · ${superficie(l)}` : ""}</option>)}
        </UniformSelect>
      </label>
      {contesto && puoScrivere && !correzioniInCorso && opzioni.some(p=>p.locali.length>0) && <details ref={elencoAmbienti} className="mt-2 rounded-md border bg-background text-xs">
        <summary className="cursor-pointer px-2.5 py-2 font-medium">{t("Aggiungi ambienti")}{altri.length>0 ? ` · ${t(altri.length===1 ? "{n} aggiunto" : "{n} aggiunti", { n: altri.length })}` : ""}</summary>
        <div className="max-h-48 space-y-2 overflow-auto border-t p-2.5">
          {bozza && !bozza.disegno && <p className="text-muted-foreground">{t("Se cambi gli ambienti, l’anteprima corrente viene scartata.")}</p>}
          {opzioni.filter(p=>p.locali.length>0).map(p=><fieldset key={p.id} disabled={invio || salvataggio}>
            <legend className="mb-1 font-medium text-muted-foreground">{p.nome}</legend>
            {p.locali.map(l=>{
              const riferimento={livelloId:p.id,localeId:l.id};
              const selezionato=altri.some(a=>idAmbienteChat(a)===idAmbienteChat(riferimento));
              return <label key={l.id} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted">
                <input type="checkbox" checked={selezionato} disabled={!selezionato && quanti>=MASSIMO_AMBIENTI_CHAT}
                  onChange={e=>modificaSelezione(riferimento,e.target.checked)} className="accent-blue-700"/>
                <span className="min-w-0 flex-1">{l.nome}</span><span className="shrink-0 tabular-nums text-muted-foreground">{superficie(l)}</span>
              </label>;
            })}
          </fieldset>)}
        </div>
      </details>}
    </div>
    {!puoScrivere ? <div className="space-y-2 p-4 text-sm text-muted-foreground">
      <p>{onVaiAllaCorrente ? t("Le proposte si creano dalla versione corrente.") : t("Per usare Silvio serve l’accesso in modifica.")}</p>
      {onVaiAllaCorrente && <Button size="sm" variant="outline" onClick={onVaiAllaCorrente}>{t("Apri versione corrente")}</Button>}
    </div> : <>
      <div role="log" aria-label={t("Conversazione con Silvio")} className="min-h-32 flex-1 space-y-3 overflow-auto px-4 py-4 lg:max-h-[315px]">
        {messaggi.length===0 && <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{quanti>1 ? t("Indica quali ambienti vuoi modificare o chiedi una modifica per tutti.") : contesto ? t("Chiedi una misura, scrivi una modifica al disegno o proponi una finitura per l’ambiente selezionato.") : locali.length ? t("Scrivi una modifica al disegno («Porta tra cucina e soggiorno da 80 cm») o una domanda sul progetto.") : t("Traccia le stanze nell’editor per usare la chat.")}</p>
          {esempi.length>0 && <div className="flex flex-wrap gap-1.5">{esempi.map(e=><button type="button" key={e.etichetta} onClick={()=>setRichiesta(e.testo)}
            className="rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            {t(e.etichetta)}<ArrowDown className="ml-1 inline h-3 w-3 text-muted-foreground"/>
          </button>)}</div>}
        </div>}
        {messaggi.map((m,i)=><div key={i} className={cn("max-w-[91%] whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-sm leading-relaxed",
          m.ruolo==="utente" ? "ml-auto bg-blue-700 text-white" : "bg-muted text-foreground")}>
          <p>{m.ruolo==="utente" ? m.testo : conGrassetto(m.testo)}</p>
          {!!m.fatti?.length && <ul className="mt-1.5 space-y-1 text-xs">{m.fatti.map((f,j)=><li key={j} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-teal-700"/>{f}</li>)}</ul>}
          {!!m.avvisi?.length && <ul className="mt-1.5 space-y-1 text-xs text-amber-900 dark:text-amber-200">{m.avvisi.map((a,j)=><li key={j}>{a}</li>)}</ul>}
        </div>)}
        {invio && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>{fase || t("Silvio sta elaborando la risposta…")}</p>}
        <div ref={fine}/>
      </div>
      {!correzioniInCorso && riepilogo}
      {(errore || erroreSalvataggio) && <p role="alert" className="mx-4 mb-2 mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{erroreSalvataggio || errore}</p>}
      <form onSubmit={e=>{e.preventDefault();void invia();}} className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea aria-label={t("Scrivi a Silvio")} placeholder={correzioniInCorso ? t("Salva o scarta la proposta") : locali.length ? t("Una modifica o una domanda…") : t("Traccia le stanze nell’editor")}
            className="min-h-[58px] resize-y text-sm" value={richiesta} onChange={e=>setRichiesta(e.target.value)}
            maxLength={LIMITE_CHAT_PROGETTO} disabled={!locali.length || invio || salvataggio || correzioniInCorso}
            onKeyDown={e=>{if(e.key==="Enter" && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();void invia();}}}/>
          <Button type="submit" size="icon" aria-label={t("Invia a Silvio")} disabled={!locali.length || !richiesta.trim() || invio || salvataggio || correzioniInCorso}><Send className="h-4 w-4"/></Button>
        </div>
      </form>
    </>}
  </aside>;
}
