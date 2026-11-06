/**
 * La conversazione con Silvio dentro il suo popup (05/11/2026). Florin: «non mi piace che si
 * apra la chat, voglio che si lavori nel popup». Si chiede, Silvio risponde qui sotto, e quello
 * che propone di cambiare (date, sottofasi nuove, chi le fa) compare come elenco da spuntare
 * con «Applica»: niente si scrive senza il clic.
 */
import { useEffect, useRef, useState } from "react";
import { Brain, Check, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PropostaFasi } from "../../../shared/silvio-commessa/chatFasi";

export interface RispostaSilvio { testo: string; proposte: PropostaFasi[]; scartate: string[]; note?: string[] }
export interface AllegatoSilvio { path: string; nome: string }
/** Quanti file in una conversazione: Silvio li rilegge a ogni domanda. */
export const MAX_ALLEGATI = 3;
const MAX_BYTE_ALLEGATO = 20 * 1024 * 1024;
export interface ConversazioneSilvio {
  chiedi: (messaggio: string, storia: ReadonlyArray<{ ruolo: "persona" | "silvio"; testo: string }>, allegati: ReadonlyArray<AllegatoSilvio>) => Promise<RispostaSilvio>;
  /** Carica un file nella cartella dell'azienda; senza, niente graffetta. */
  carica?: (file: File) => Promise<AllegatoSilvio>;
  applica: (proposte: ReadonlyArray<PropostaFasi>) => Promise<void>;
}

type Messaggio =
  | { ruolo: "persona"; testo: string }
  | { ruolo: "silvio"; testo: string; proposte: PropostaFasi[]; scartate: string[]; note: string[]; scelte: boolean[]; applicate: boolean }
  | { ruolo: "errore"; testo: string };

const giorno = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
const GENERE = { persona: "persona", squadra: "squadra", ditta: "ditta" } as const;

export function descriviProposta(p: PropostaFasi): string {
  if (p.tipo === "date") return `${p.nome}: dal ${giorno(p.dal)} al ${giorno(p.al)}${p.primaDal ? ` (era ${giorno(p.primaDal)} → ${giorno(p.primaAl)})` : ""}`;
  if (p.tipo === "sottofasi") return `${p.fase}: nuove sottofasi ${p.nomi.join(", ")}`;
  return `${p.sottofase}: la fa ${p.chi} (${GENERE[p.genere]})`;
}

const TITOLI: Record<PropostaFasi["tipo"], string> = { sottofasi: "Sottofasi nuove", date: "Date", chi: "Chi le fa" };

export function SilvioConversazione({ conversazione, domande, domandaIniziale, onDomandaUsata }: {
  conversazione: ConversazioneSilvio;
  domande: string[];
  /** Una domanda scelta fuori (le domande pronte del popup): parte subito. */
  domandaIniziale?: string | null;
  onDomandaUsata?: () => void;
}) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [applico, setApplico] = useState<number | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const scegliFile = useRef<HTMLInputElement>(null);
  const [allegati, setAllegati] = useState<AllegatoSilvio[]>([]);
  const [carico, setCarico] = useState(false);
  const [erroreFile, setErroreFile] = useState<string | null>(null);
  const aggiungiFile = async (files: FileList | null) => {
    if (!files?.length || !conversazione.carica) return;
    setErroreFile(null);
    const posto = MAX_ALLEGATI - allegati.length;
    const scelti = [...files].slice(0, Math.max(0, posto));
    if (files.length > posto) setErroreFile(`Al massimo ${MAX_ALLEGATI} file per conversazione.`);
    setCarico(true);
    try {
      for (const f of scelti) {
        if (f.size > MAX_BYTE_ALLEGATO) { setErroreFile(`«${f.name}» è troppo grande (massimo 20 MB).`); continue; }
        const a = await conversazione.carica(f);
        setAllegati((xs) => [...xs, a]);
      }
    } catch (e) {
      setErroreFile(e instanceof Error && e.message ? e.message : "File non caricato: riprova.");
    } finally {
      setCarico(false);
      if (scegliFile.current) scegliFile.current.value = "";
    }
  };

  useEffect(() => { fondo.current?.scrollIntoView?.({ block: "nearest" }); }, [messaggi.length, attesa]);

  const chiedi = async (domanda: string) => {
    const d = domanda.trim();
    if (!d || attesa) return;
    const storia = messaggi.flatMap((m) => (m.ruolo === "errore" ? [] : [{ ruolo: m.ruolo, testo: m.testo }]));
    setMessaggi((ms) => [...ms, { ruolo: "persona", testo: d }]);
    setTesto("");
    setAttesa(true);
    try {
      const r = await conversazione.chiedi(d, storia, allegati);
      setMessaggi((ms) => [...ms, { ruolo: "silvio", testo: r.testo, proposte: r.proposte, scartate: r.scartate, note: r.note ?? [], scelte: r.proposte.map(() => true), applicate: false }]);
    } catch (e) {
      setMessaggi((ms) => [...ms, { ruolo: "errore", testo: e instanceof Error && e.message ? e.message : "Silvio non risponde: riprova tra poco." }]);
    } finally {
      setAttesa(false);
    }
  };

  useEffect(() => {
    if (domandaIniziale) { void chiedi(domandaIniziale); onDomandaUsata?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domandaIniziale]);

  const scegli = (i: number, j: number, v: boolean) => setMessaggi((ms) => ms.map((m, k) => (k === i && m.ruolo === "silvio" ? { ...m, scelte: m.scelte.map((s, x) => (x === j ? v : s)) } : m)));
  const applica = async (i: number) => {
    const m = messaggi[i];
    if (m?.ruolo !== "silvio") return;
    const daFare = m.proposte.filter((_, j) => m.scelte[j]);
    if (!daFare.length) return;
    setApplico(i);
    try {
      await conversazione.applica(daFare);
      setMessaggi((ms) => ms.map((x, k) => (k === i && x.ruolo === "silvio" ? { ...x, applicate: true } : x)));
    } catch (e) {
      setMessaggi((ms) => [...ms, { ruolo: "errore", testo: `Non applicato: ${e instanceof Error ? e.message : "riprova"}` }]);
    } finally {
      setApplico(null);
    }
  };

  return (
    <div className="space-y-2">
      {messaggi.length > 0 && (
        <div className="max-h-[45dvh] space-y-2 overflow-y-auto pr-1" aria-live="polite" aria-label="Conversazione con Silvio">
          {messaggi.map((m, i) => m.ruolo === "persona" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white">{m.testo}</p>
          ) : m.ruolo === "errore" ? (
            <p key={i} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">{m.testo}</p>
          ) : (
            <div key={i} className="space-y-2 rounded-lg border bg-background p-3">
              {m.testo && <p className="flex gap-2 whitespace-pre-wrap text-sm"><Brain className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />{m.testo}</p>}
              {m.proposte.length > 0 && (
                <div className="space-y-2">
                  {(["sottofasi", "date", "chi"] as const).map((tipo) => {
                    const righe = m.proposte.map((p, j) => ({ p, j })).filter((x) => x.p.tipo === tipo);
                    if (!righe.length) return null;
                    return (
                      <fieldset key={tipo} className="space-y-1" disabled={m.applicate}>
                        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{TITOLI[tipo]} · {righe.length}</legend>
                        {righe.map(({ p, j }) => (
                          <label key={j} className="flex items-start gap-2 text-xs">
                            <Checkbox className="mt-0.5" checked={m.scelte[j]} onCheckedChange={(v) => scegli(i, j, v === true)} aria-label={descriviProposta(p)} />
                            <span className={cn(!m.scelte[j] && "text-muted-foreground line-through")}>{descriviProposta(p)}</span>
                          </label>
                        ))}
                      </fieldset>
                    );
                  })}
                  {m.applicate ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />Applicato: lo vedi nella tabella.</p>
                  ) : (
                    <Button size="sm" className="h-8 bg-orange-600 hover:bg-orange-700" disabled={applico !== null || !m.scelte.some(Boolean)} onClick={() => void applica(i)}>
                      {applico === i && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Applica {m.scelte.filter(Boolean).length}
                    </Button>
                  )}
                </div>
              )}
              {m.note.length > 0 && <p className="text-[11px] text-sky-800">{m.note.join("; ")}.</p>}
              {m.scartate.length > 0 && <p className="text-[11px] text-muted-foreground">Lasciate fuori: {m.scartate.join("; ")}.</p>}
            </div>
          ))}
          {attesa && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-orange-600" />Silvio guarda le fasi…</p>}
          <div ref={fondo} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {domande.map((d) => (
          <button key={d} type="button" disabled={attesa} onClick={() => void chiedi(d)}
            className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-900 hover:bg-orange-100 disabled:opacity-50">
            {d}
          </button>
        ))}
      </div>
      {(allegati.length > 0 || erroreFile) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Allegati per Silvio">
          {allegati.map((a) => (
            <span key={a.path} className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
              <Paperclip className="h-3 w-3" aria-hidden="true" />{a.nome}
              <button type="button" aria-label={`Togli ${a.nome}`} onClick={() => setAllegati((xs) => xs.filter((x) => x.path !== a.path))} className="hover:text-rose-700"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {erroreFile && <span role="alert" className="text-xs text-rose-700">{erroreFile}</span>}
        </div>
      )}
      <div className="flex items-end gap-2">
        {conversazione.carica && (
          <>
            <input ref={scegliFile} type="file" className="hidden" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,.txt,.md"
              aria-label="Scegli i file da allegare" onChange={(e) => void aggiungiFile(e.target.files)} />
            <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="Allega un file (PDF, foto, testo)"
              disabled={carico || attesa || allegati.length >= MAX_ALLEGATI} onClick={() => scegliFile.current?.click()}>
              {carico ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
          </>
        )}
        <Textarea rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi cosa vuoi sistemare…" aria-label="Domanda per Silvio"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void chiedi(testo); } }} />
        <Button size="icon" className="h-10 w-10 shrink-0 bg-orange-600 hover:bg-orange-700" aria-label="Manda a Silvio" disabled={!testo.trim() || attesa || carico} onClick={() => void chiedi(testo)}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Silvio propone, tu applichi: niente cambia senza il tuo clic.{conversazione.carica ? " Puoi allegare un cronoprogramma, un computo o una foto." : ""}</p>
    </div>
  );
}
