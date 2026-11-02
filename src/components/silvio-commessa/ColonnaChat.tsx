/**
 * La chat del popup. Fase 1: Silvio dice cosa ha letto e cosa manca, e le domande sono
 * pulsanti (una alla volta). Fase 3 (lotto 3.1): si scrive o si detta («sposta tutto di una
 * settimana e togli la ditta»), la risposta è breve e la modifica si vede subito a destra,
 * segnata finché non la guardi («Vedi»). «annulla» in chat, o Cmd+Z, la toglie.
 *
 * Il costo si vede prima: sotto il campo la stima di un messaggio e della dettatura.
 *
 * 01/11/2026, revisione dell'esperienza: il campo è quello del preventivatore AI
 * (`ThinkingPromptInput`), con graffetta e microfono sempre in vista; al primo ingresso una
 * frase e due esempi da toccare; mentre legge, Silvio dice cosa sta leggendo passo per passo
 * (`ThinkingProgress`); sotto i messaggi i suggerimenti che cambiano con la bozza.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Eye, FileText, Loader2, Mic, Paperclip, Sparkles, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThinkingProgress, ThinkingPromptInput, type ThinkingStep } from "@/components/ui/thinking-prompt-input";
import { cn } from "@/lib/utils";
import type { Modifica } from "../../../shared/silvio-commessa/piano.ts";
import { MAX_MESSAGGIO_CHAT, STIMA_CHAT_EUR } from "../../../shared/silvio-commessa/chat.ts";
import {
  ESEMPI_PRIMO_INGRESSO, euroAI, STIMA_DETTATURA_EUR, type DaDecidere, type Domanda, type Suggerimento,
} from "./presentazione";
import type { FonteNelPopup, Messaggio } from "./useBozzaSilvio";
import { useDettatura, type Dettatura } from "./useDettatura";

/** I file che il popup sa leggere: gli stessi della colonna Fonti. */
export const FILE_LEGGIBILI = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.xpwe,.dcf,.xml,application/pdf,image/jpeg,image/png,image/webp,text/plain";

export interface ColonnaChatProps {
  messaggi: Messaggio[];
  domanda: Domanda | null;
  /** Silvio sta ancora leggendo qualcosa. */
  legge: boolean;
  onModifica: (m: Modifica | Modifica[]) => void;
  onApri: (chiave: string) => void;
  /** Manda un messaggio; false se non è partito (il testo resta nel campo). */
  onScrivi?: (testo: string) => Promise<boolean>;
  /** Silvio sta rispondendo. */
  scrivendo?: boolean;
  /** «Vedi» su una risposta: mostra a destra le variabili cambiate. */
  onVedi?: (chiavi: string[]) => void;
  /** C'è qualcosa da annullare. */
  annullabile?: boolean;
  onAnnulla?: () => void;
  /** L'audio diventa testo; senza, niente microfono. */
  trascrivi?: (audio: Blob) => Promise<string>;
  /** Prima di dettare: i crediti. Null = si può. */
  primaDiDettare?: () => Promise<string | null>;
  /** Le fonti: per dire cosa sta leggendo e cosa aspetta il via. */
  fonti?: FonteNelPopup[];
  /** La graffetta: i file vanno tra le fonti. */
  onAllega?: (file: File[]) => void;
  /** «Leggi» sulle letture che aspettano il via. */
  onConferma?: () => void;
  /** I suggerimenti sotto i messaggi. */
  suggerimenti?: Suggerimento[];
  /** Per «Cosa manca?»: la risposta la dà il popup, senza AI. */
  daDecidere?: DaDecidere | null;
  /** Le cose che mancano ancora, per nome. */
  mancano?: { chiave: string; etichetta: string }[];
  /** Porta alla colonna Fonti (sul telefono è un'altra scheda). */
  onFonti?: () => void;
  /** Il campo ha il fuoco: sul telefono il popup nasconde la barra di «Crea». */
  onFuoco?: (dentro: boolean) => void;
}

function Microfono({ d }: { d: Dettatura }) {
  return (
    <button type="button" onClick={d.tocca} disabled={d.trascrive} aria-pressed={d.registra}
      aria-label={d.registra ? `Ferma la dettatura (${d.secondi} s)` : d.trascrive ? "Trascrivo…" : `Detta a Silvio (circa ${euroAI(STIMA_DETTATURA_EUR)})`}
      title={d.registra ? "Ferma" : `Detta · circa ${euroAI(STIMA_DETTATURA_EUR)}`}
      className={cn("grid h-11 w-11 place-items-center rounded-full transition-colors lg:h-9 lg:w-9",
        d.registra ? "bg-red-600 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100")}>
      {d.trascrive ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : d.registra ? <Square className="h-4 w-4" fill="currentColor" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
    </button>
  );
}

/** I passi della lettura per `ThinkingProgress`: cosa ha letto, cosa sta leggendo, cosa aspetta. */
function passiDellaLettura(fonti: FonteNelPopup[]): ThinkingStep[] {
  const nome = (f: FonteNelPopup) => (f.tipo === "testo" && f.testo
    ? `quello che hai scritto («${f.testo.length > 60 ? `${f.testo.slice(0, 57)}…` : f.testo}»)` : f.etichetta);
  return fonti
    .filter((f) => f.stato !== "da_confermare" && f.tipo !== "commessa" && f.tipo !== "ripresa")
    .map((f) => ({ ...f, etichetta: nome(f) }))
    .map((f) => ({
      id: f.id,
      status: f.stato === "in_lettura" ? "active" : f.stato === "in_coda" ? "pending" : f.stato === "errore" ? "stopped" : "complete",
      text: f.stato === "in_lettura" ? `Leggo ${f.etichetta}${f.stimaEur ? ` (circa ${euroAI(f.stimaEur)})` : ""}…`
        : f.stato === "in_coda" ? `Poi ${f.etichetta}`
          : f.stato === "errore" ? `${f.etichetta}: non sono riuscito a leggerlo`
            : f.stato === "da_collegare" ? `${f.etichetta}: da collegare alla sua richiesta d'offerta`
              : `${f.etichetta}: ${f.valori ? `${f.valori} ${f.valori === 1 ? "dato preso" : "dati presi"}` : "letto"}`,
    }));
}

/** Da quanti secondi legge: riparte a ogni giro di letture. */
function useSecondi(attivo: boolean): number {
  const [secondi, setSecondi] = useState(0);
  useEffect(() => {
    if (!attivo) return;
    const t = setInterval(() => setSecondi((s) => s + 1), 1000);
    return () => { clearInterval(t); setSecondi(0); };
  }, [attivo]);
  return secondi;
}

/** Una scelta da toccare, come i pulsanti delle risposte del preventivatore. */
function Pillola({ children, onClick, disabled, primaria }: { children: ReactNode; onClick: () => void; disabled?: boolean; primaria?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-2 text-left text-sm leading-snug lg:px-3 lg:py-1.5 lg:text-[13px] transition-colors disabled:opacity-50 lg:min-h-9",
        primaria ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-700" : "border-slate-300 bg-white text-slate-800 hover:border-orange-300 hover:bg-orange-50")}>
      {!primaria && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />}
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}

export function ColonnaChat({
  messaggi, domanda, legge, onModifica, onApri, onScrivi, scrivendo = false, onVedi, annullabile = false, onAnnulla, trascrivi, primaDiDettare,
  fonti = [], onAllega, onConferma, suggerimenti = [], daDecidere = null, mancano = [], onFonti, onFuoco,
}: ColonnaChatProps) {
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);
  const inputFile = useRef<HTMLInputElement>(null);
  const [testo, setTesto] = useState("");
  const [cosaManca, setCosaManca] = useState(false);
  const daLeggere = fonti.filter((f) => f.stato === "da_confermare");
  const stima = daLeggere.reduce((s, f) => s + f.stimaEur, 0);
  const passi = passiDellaLettura(fonti);
  const secondi = useSecondi(legge);
  useEffect(() => { fondo.current?.scrollIntoView?.({ block: "end" }); }, [messaggi.length, domanda?.testo, scrivendo, legge, cosaManca, daLeggere.length]);
  const dettatura = useDettatura(
    trascrivi ?? (async () => ""),
    (t) => { setTesto((p) => (p.trim() ? `${p.trim()} ${t}` : t)); campo.current?.focus(); },
    primaDiDettare,
  );
  const ultimaConModifiche = [...messaggi].reverse().find((m) => m.chiavi?.length)?.id;
  const vuota = !messaggi.length && !fonti.length;

  const manda = async (t = testo.trim()) => {
    if (!t || !onScrivi || scrivendo) return;
    setCosaManca(false);
    if (t === testo.trim()) setTesto("");
    const partito = await onScrivi(t);
    if (!partito && t) setTesto(t);
  };
  const suggerisci = (s: Suggerimento) => {
    if ("locale" in s) setCosaManca(true);
    else void manda(s.testo);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1" role="log" aria-label="Messaggi con Silvio" aria-live="off">
        {vuota && (
          <div className="rounded-2xl border border-orange-100 bg-white p-3.5 shadow-sm">
            <p className="flex items-start gap-2 text-[15px] font-medium leading-relaxed text-slate-900 lg:text-[13px]">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-orange-600" aria-hidden />
              Carica un preventivo, un contratto o una foto, oppure scrivimi il lavoro in due righe: la commessa la compongo io.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {onAllega && (
                <Pillola primaria onClick={() => inputFile.current?.click()}>
                  <span className="inline-flex items-center gap-1.5"><Paperclip className="h-4 w-4" aria-hidden />Carica un file</span>
                </Pillola>
              )}
              {onFonti && (
                <Pillola onClick={onFonti}>
                  <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" aria-hidden />Parti da un preventivo</span>
                </Pillola>
              )}
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">Oppure tocca un esempio e cambialo:</p>
            <div className="mt-1.5 flex flex-col gap-2">
              {ESEMPI_PRIMO_INGRESSO.map((e) => (
                <Pillola key={e} onClick={() => { setTesto(e); campo.current?.focus(); }}>«{e}»</Pillola>
              ))}
            </div>
          </div>
        )}
        {!vuota && !messaggi.length && !legge && (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm">
            Compongo la commessa qui accanto mentre leggo. Poi correggi a parole: «sposta tutto di una settimana».
          </p>
        )}
        {messaggi.map((m) => (
          <div key={m.id} className={cn("flex", m.tono === "persona" && "justify-end")}>
            <div className={cn("max-w-[92%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed lg:text-[13px]",
              m.tono === "persona" ? "rounded-br-md border border-[#e3ecf9] bg-[#f0f5ff] text-slate-800"
                : m.tono === "errore" ? "rounded-bl-md bg-red-50 text-red-800"
                  : m.tono === "avviso" ? "rounded-bl-md bg-amber-50 text-amber-900" : "rounded-bl-md bg-white text-slate-700 shadow-sm")}>
              <p className="whitespace-pre-line break-words">{m.testo}</p>
              {m.chiavi?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {onVedi && (
                    <Button type="button" size="sm" variant="outline" className="h-11 gap-1 bg-white lg:h-8" onClick={() => onVedi(m.chiavi!)}>
                      <Eye className="h-4 w-4" aria-hidden />Vedi
                    </Button>
                  )}
                  {onAnnulla && annullabile && m.id === ultimaConModifiche && (
                    <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" onClick={onAnnulla}>
                      <Undo2 className="h-4 w-4" aria-hidden />Annulla
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {legge && passi.length > 0 && (
          <div className="rounded-2xl bg-white px-3.5 py-1 shadow-sm">
            <ThinkingProgress status="thinking" steps={passi} elapsedSeconds={secondi} busyLabel="Sto leggendo" />
          </div>
        )}
        {legge && !passi.length && <p className="px-1 text-sm text-slate-500" role="status">Sto leggendo…</p>}
        {scrivendo && (
          <p className="flex items-center gap-1.5 px-1 text-sm text-slate-500" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Silvio sta cambiando la bozza…
          </p>
        )}
        {daLeggere.length > 0 && onConferma && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3" role="group" aria-label="Da leggere">
            <p className="text-[15px] text-slate-800 lg:text-[13px]">
              {daLeggere.length === 1 ? `Leggo ${daLeggere[0].etichetta}?` : `Leggo questi ${daLeggere.length} documenti?`}
              {" "}Costa circa <strong>{euroAI(stima)}</strong>.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pillola primaria onClick={onConferma}>{daLeggere.length === 1 ? "Sì, leggilo" : "Sì, leggili"}</Pillola>
            </div>
          </div>
        )}
        {domanda && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3">
            <p className="flex gap-2 text-[15px] leading-relaxed text-slate-800 lg:text-[13px]">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-orange-600" aria-hidden />{domanda.testo}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {domanda.risposte.map((r, i) => (
                <Button key={r.etichetta} type="button" size="sm" variant={i === 0 ? "default" : "outline"}
                  className={cn("h-auto min-h-11 whitespace-normal rounded-full px-4 text-left lg:min-h-9", i === 0 ? "bg-orange-600 hover:bg-orange-700" : "bg-white")}
                  onClick={() => ("modifica" in r ? onModifica(r.modifica) : onApri(r.apri))}>
                  {r.etichetta}
                </Button>
              ))}
            </div>
          </div>
        )}
        {cosaManca && (
          <div className="rounded-2xl rounded-bl-md bg-white p-3 text-[15px] text-slate-700 shadow-sm lg:text-[13px]" role="status">
            {!daDecidere?.totale && !mancano.length
              ? <p>Non manca niente: puoi creare la commessa.</p>
              : (
                <>
                  {daDecidere && daDecidere.totale > 0 && (
                    <p>Prima di creare: {daDecidere.conflitti.length ? `${daDecidere.conflitti.length === 1 ? "un valore" : `${daDecidere.conflitti.length} valori`} su cui i documenti non sono d'accordo, ` : ""}
                      {daDecidere.nonDisponibili.length ? `${daDecidere.nonDisponibili.map((n) => n.nome).join(", ")} non ${daDecidere.nonDisponibili.length === 1 ? "è libero" : "sono liberi"}, ` : ""}
                      {daDecidere.proposte.length ? `${daDecidere.proposte.length} ${daDecidere.proposte.length === 1 ? "mia proposta" : "mie proposte"} da guardare` : ""}.
                      {" "}Le trovi in cima a «La commessa».</p>
                  )}
                  {mancano.length > 0 && (
                    <>
                      <p className="mt-2">Mancano ancora, ma puoi aggiungerli anche dopo:</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {mancano.slice(0, 6).map((m) => <Pillola key={m.chiave} onClick={() => onApri(m.chiave)}>{m.etichetta}</Pillola>)}
                      </div>
                    </>
                  )}
                </>
              )}
          </div>
        )}
        <div ref={fondo} />
      </div>

      {suggerimenti.length > 0 && !vuota && (
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible" role="group" aria-label="Suggerimenti">
          {suggerimenti.map((s) => (
            <button key={s.etichetta} type="button" disabled={scrivendo || !onScrivi} onClick={() => suggerisci(s)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-3.5 text-sm text-slate-700 lg:min-h-8 lg:px-3 lg:text-[13px] hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 lg:min-h-9">
              {s.etichetta}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 [&_.thinking-composer]:rounded-2xl [&_.thinking-composer]:border-slate-300 [&_.thinking-composer]:p-2 [&_.thinking-composer_textarea]:text-base lg:[&_.thinking-composer_textarea]:text-sm [&_.thinking-composer-send-tools>button[data-busy]]:h-11 [&_.thinking-composer-send-tools>button[data-busy]]:w-11 [&_.thinking-composer-send-tools>button[data-busy]]:rounded-full [&_.thinking-composer-send-tools>button[data-busy]]:bg-orange-600 lg:[&_.thinking-composer-send-tools>button[data-busy]]:h-9 lg:[&_.thinking-composer-send-tools>button[data-busy]]:w-9">
        <ThinkingPromptInput compact inline value={testo} onValueChange={setTesto} onSubmit={() => void manda()} onStop={() => {}}
          busy={false} disabled={!onScrivi} maxLength={MAX_MESSAGGIO_CHAT} label="Scrivi a Silvio"
          placeholder={dettatura.registra ? "Ti ascolto…" : vuota ? "Scrivi il lavoro, o tocca il microfono e parla" : "Scrivi o detta una correzione"}
          textareaRef={(el) => { campo.current = el; }} onFocus={() => onFuoco?.(true)} onBlur={() => onFuoco?.(false)}
          trailingTools={<>
            {onAllega && (
              <button type="button" onClick={() => inputFile.current?.click()} aria-label="Allega un documento" title="Allega un documento"
                className="grid h-11 w-11 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:h-9 lg:w-9">
                <Paperclip className="h-5 w-5" aria-hidden />
              </button>
            )}
            {trascrivi && dettatura.disponibile && <Microfono d={dettatura} />}
          </>} />
        {onAllega && (
          <input ref={inputFile} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden accept={FILE_LEGGIBILI}
            onChange={(e) => { if (e.target.files?.length) onAllega([...e.target.files]); e.target.value = ""; }} />
        )}
        <p className="mt-1 px-1 text-xs text-slate-500">
          {dettatura.errore
            ? <span className="text-red-700">{dettatura.errore}</span>
            : dettatura.registra ? `Ti ascolto… ${dettatura.secondi} s (tocca ■ quando hai finito)`
              : vuota ? <>Circa {euroAI(0.005)} per leggere quello che scrivi</>
                : <>Circa {euroAI(STIMA_CHAT_EUR)} a messaggio · «annulla» è gratis</>}
        </p>
      </div>
    </div>
  );
}

