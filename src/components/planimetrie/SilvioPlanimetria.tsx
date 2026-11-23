import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, Loader2, ScanSearch, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { chiediSulProgetto } from "@/lib/planimetrie/assistenzaStudio";
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

const ESEMPI = [
  {etichetta:"Controlla la superficie",testo:"Qual è la superficie ricostruita della stanza? Confrontala con la misura scritta sul DWG, se c’è."},
  {etichetta:"Prova il parquet",testo:"Prova un parquet in rovere naturale nella stanza selezionata."},
  {etichetta:"Proponi un tramezzo",testo:"Proponi un tramezzo per dividere la stanza selezionata in due ambienti."},
];
const ESEMPI_GRUPPO = [
  {etichetta:"Confronta le superfici",testo:"Confronta le superfici degli ambienti selezionati."},
  {etichetta:"Prova il parquet nelle stanze",testo:"Prova un parquet in rovere in tutti gli ambienti selezionati."},
];
const superficie = (l:Locale) => `${(areaPoligono(l.contorno)/10_000).toLocaleString("it-IT",{maximumFractionDigits:2})} m²`;

const TUTTA_LA_CASA = "__tutto_il_piano";

export function SilvioPlanimetria({ documento, selezione, locali, companyId, puoScrivere, bozza, mostraPrima, salvataggio, erroreSalvataggio, analisi, onAnalisi, onEsodo, onRiscontro, evidenziata, onMostraSegnalazione, onSeleziona, onAnteprima, onSalva, onChiudi, onVaiAllaCorrente, gruppoIniziale, onGruppo }: {
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
}) {
  const [messaggi,setMessaggi]=useState<MessaggioChatProgetto[]>([]);
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
  const accessi=bozza?.piani.flatMap(p=>p.accessi.map(a=>({...a,piano:p.nome}))) ?? [];
  const correzioniInCorso = !!bozza?.piani.some(p => p.correzioni?.length);
  const propostaAnalizzata = mostraPrima ? null : bozza;
  // «Tutto il piano»: il primo ambiente è quello principale, gli altri entrano nel
  // gruppo (fino a MASSIMO_AMBIENTI_CHAT). Prima per una domanda sulla casa intera
  // si dovevano spuntare le stanze una per una (23/11/2026).
  const scegliAmbiente=(valore:string)=>{
    if (valore!==TUTTA_LA_CASA) { onSeleziona(valore); return; }
    if (!locali.length || invio || salvataggio) return;
    if (bozza) onAnteprima(null);
    const gruppo=locali.slice(1,MASSIMO_AMBIENTI_CHAT).map(l=>({livelloId:selezione.livelloId,localeId:l.id}));
    onSeleziona(locali[0].id);
    onGruppo?.(gruppo);
    setAltri(gruppo);
    setErrore("");
  };
  const modificaSelezione=(riferimento:RiferimentoAmbienteChat, scelto:boolean)=>{
    if (invio || salvataggio) return;
    if (bozza) onAnteprima(null);
    setAltri(v=>scelto ? [...v,riferimento].slice(0,MASSIMO_AMBIENTI_CHAT-1) : v.filter(a=>idAmbienteChat(a)!==idAmbienteChat(riferimento)));
    setErrore("");
  };
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
      setErrore("I ripristini richiedono una revisione sulla tavola prima di poter salvare la variante.");
      return;
    }
    setErrore("");
    onAnteprima(proposta);
  };

  async function invia(esito?: SegnalazioneProgetto) {
    const domanda = esito ? `Cosa devo verificare per «${esito.titolo}»?` : richiesta.trim();
    const testo = esito ? [
      "Spiega il controllo indicato con una risposta pratica, usando i dati forniti e senza proporre modifiche alla pianta o concludere che il progetto è conforme.",
      `${esito.area} · ${esito.titolo}${esito.piano ? " · Piano " + esito.piano : ""}.`,
      esito.descrizione,
      esito.verifica,
      esito.fonte?.nome,
    ].filter(Boolean).join("\n").slice(0, LIMITE_CHAT_PROGETTO) : domanda;
    if (!testo || !contesto || !puoScrivere || occupato.current || salvataggio || (!esito && correzioniInCorso)) return;
    occupato.current=true;
    if (elencoAmbienti.current) elencoAmbienti.current.open=false;
    setInvio(true); setErrore("");
    if (!esito) setRichiesta("");
    const nuovo: MessaggioChatProgetto = {ruolo:"utente",testo:domanda};
    setMessaggi(m=>[...m,nuovo]);
    try {
      const cronologia=bozza
        ? [...messaggi,{ruolo:"silvio" as const,testo:`Anteprima aperta · ${bozza.modifiche.map(m=>[m.ambiente,`${m.etichetta} → ${m.dopo}`].filter(Boolean).join(" · ")).join("\n")}`.slice(0,1400)}]
        : messaggi;
      const risposta=await chiediSulProgetto(companyId,testo,contesto,cronologia.slice(-8));
      if (!attivo.current) return;
      setMessaggi(m=>[...m,{ruolo:"silvio",testo:risposta.testo}]);
      if (risposta.modifiche.length && !esito) {
        const anteprima=anteprimaDaChatProgetto(documento,selezioneChat,risposta,testo,bozza);
        if (anteprima) onAnteprima(anteprima);
        else setErrore("La richiesta non produce una modifica applicabile agli ambienti selezionati.");
      }
    } catch(e) {
      if (attivo.current) {
        setErrore(e instanceof Error ? e.message : "Silvio non è disponibile.");
        if (!esito) setRichiesta(testo);
        setMessaggi(m=>m.at(-1)===nuovo ? m.slice(0,-1) : m);
      }
    } finally {
      occupato.current=false;
      if (attivo.current) setInvio(false);
    }
  }

  const riepilogo = bozza && puoScrivere && <section aria-label="Proposta di Silvio" className="border-t border-teal-200 bg-teal-50/65 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">Anteprima sulla tavola</p>
    <h3 className="text-sm font-semibold">{bozza.nomeVariante}</h3>
    <ul className="mt-2 max-h-36 space-y-1.5 overflow-auto text-xs">{bozza.modifiche.map((m,i)=><li className="flex flex-wrap items-baseline gap-1.5" key={i}>
      <span className="w-full font-medium">{m.etichetta}{m.ambiente && <span className="ml-1 font-normal text-muted-foreground">· {m.ambiente}</span>}</span><span className="text-muted-foreground">{m.prima}</span><ArrowRight className="h-3 w-3 self-center text-teal-700"/><span className="font-medium">{m.dopo}</span>
    </li>)}</ul>
    <AccessiProposta accessi={accessi} className="mt-2.5 max-h-40 overflow-auto"/>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" className="gap-1.5 bg-teal-800 text-white hover:bg-teal-900" disabled={salvataggio || invio} onClick={onSalva}><Check className="h-4 w-4"/>{salvataggio ? "Salvo…" : "Salva come variante"}</Button>
      <Button size="sm" variant="ghost" disabled={salvataggio || invio} onClick={()=>onAnteprima(null)}>Scarta</Button>
    </div>
  </section>;

  return <aside aria-label="Chat di Silvio sulla planimetria" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex items-center gap-3 border-b bg-slate-50 px-4 py-3.5 dark:bg-slate-900/40">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><Sparkles className="h-4 w-4"/></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Silvio</h2><p className="truncate text-xs text-muted-foreground">{quanti>1 ? `${quanti} ambienti selezionati` : contesto?.piano ?? "Planimetria"}</p></div>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Chiudi Silvio" onClick={onChiudi} disabled={salvataggio}><X className="h-4 w-4"/></Button>
    </div>
    <div className="border-b px-4 py-2.5">
      <Button type="button" size="sm" variant={analisi ? "secondary" : "outline"} aria-expanded={analisi} className="w-full justify-start gap-2" onClick={() => {
        if (analisi) onMostraSegnalazione?.(null);
        onAnalisi(!analisi);
      }}>
        <ScanSearch className="h-4 w-4" />Analizza progetto
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
        <span>Ambiente della chat</span>
        <UniformSelect value={selezione.localeId} onChange={e=>scegliAmbiente(e.target.value)} disabled={salvataggio || invio || correzioniInCorso} className="w-full">
          <option value="">Scegli un ambiente</option>
          {locali.length>1 && <option value={TUTTA_LA_CASA}>{locali.length>MASSIMO_AMBIENTI_CHAT ? `Tutto il piano · primi ${MASSIMO_AMBIENTI_CHAT} ambienti` : "Tutto il piano"}</option>}
          {locali.map(l=><option key={l.id} value={l.id}>{l.nome}{locali.some(a=>a.id!==l.id && a.nome===l.nome) ? ` · ${superficie(l)}` : ""}</option>)}
        </UniformSelect>
      </label>
      {contesto && puoScrivere && !correzioniInCorso && opzioni.some(p=>p.locali.length>0) && <details ref={elencoAmbienti} className="mt-2 rounded-md border bg-background text-xs">
        <summary className="cursor-pointer px-2.5 py-2 font-medium">Aggiungi ambienti{altri.length>0 ? ` · ${altri.length} ${altri.length===1 ? "aggiunto" : "aggiunti"}` : ""}</summary>
        <div className="max-h-48 space-y-2 overflow-auto border-t p-2.5">
          {bozza && <p className="text-muted-foreground">Se cambi gli ambienti, l’anteprima corrente viene scartata.</p>}
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
      <p>{onVaiAllaCorrente ? "Le proposte si creano dalla versione corrente." : "Per usare Silvio serve l’accesso in modifica."}</p>
      {onVaiAllaCorrente && <Button size="sm" variant="outline" onClick={onVaiAllaCorrente}>Apri versione corrente</Button>}
    </div> : <>
      <div role="log" aria-label="Conversazione con Silvio" className="min-h-32 flex-1 space-y-3 overflow-auto px-4 py-4 lg:max-h-[315px]">
        {messaggi.length===0 && <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{quanti>1 ? "Indica quali ambienti vuoi modificare o chiedi una modifica per tutti." : contesto ? "Chiedi una misura o proponi una modifica per l’ambiente selezionato." : "Seleziona una stanza sulla tavola oppure dal menu."}</p>
          {contesto && <div className="flex flex-wrap gap-1.5">{(quanti>1 ? ESEMPI_GRUPPO : ESEMPI).map(e=><button type="button" key={e.etichetta} onClick={()=>setRichiesta(e.testo)}
            className="rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            {e.etichetta}<ArrowDown className="ml-1 inline h-3 w-3 text-muted-foreground"/>
          </button>)}</div>}
        </div>}
        {messaggi.map((m,i)=><p key={i} className={cn("max-w-[91%] whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-sm leading-relaxed",
          m.ruolo==="utente" ? "ml-auto bg-blue-700 text-white" : "bg-muted text-foreground")}>{m.testo}</p>)}
        {invio && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Silvio sta elaborando la risposta…</p>}
        <div ref={fine}/>
      </div>
      {!correzioniInCorso && riepilogo}
      {(errore || erroreSalvataggio) && <p role="alert" className="mx-4 mb-2 mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{erroreSalvataggio || errore}</p>}
      <form onSubmit={e=>{e.preventDefault();void invia();}} className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea aria-label="Scrivi a Silvio" placeholder={correzioniInCorso ? "Salva o scarta la proposta" : contesto ? "Scrivi a Silvio…" : "Scegli un ambiente per iniziare"}
            className="min-h-[58px] resize-y text-sm" value={richiesta} onChange={e=>setRichiesta(e.target.value)}
            maxLength={LIMITE_CHAT_PROGETTO} disabled={!contesto || invio || salvataggio || correzioniInCorso}
            onKeyDown={e=>{if(e.key==="Enter" && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();void invia();}}}/>
          <Button type="submit" size="icon" aria-label="Invia a Silvio" disabled={!contesto || !richiesta.trim() || invio || salvataggio || correzioniInCorso}><Send className="h-4 w-4"/></Button>
        </div>
      </form>
    </>}
  </aside>;
}
