/**
 * Fonti del popup «Crea con Silvio»: file da trascinare, preventivo o computo da scegliere,
 * vocale e testo libero; lo stato di ogni lettura, con la stima del costo prima e «Riprova»
 * dopo un errore. Vedi docs/piano-silvio-commessa-ai.md, 3.3–3.4.
 *
 * In «Completa» (fase 2) in cima ci sono i documenti già allegati alla commessa: ognuno si
 * legge con un tocco su «Leggi», che porta davanti la stima del costo.
 */
import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, FileText, Loader2, Mic, Plus, RotateCcw, Search, Square, Upload, X, Calculator, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { formatCurrency } from "@/lib/formatters";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import type { AllegatoCommessa } from "@/lib/silvio-commessa/lettori";
import { euroAI, stimaLettura } from "./presentazione";
import type { FonteDaAggiungere, FonteNelPopup } from "./useBozzaSilvio";
import type { ServiziSilvioCommessa } from "./servizi";

const STATI: Record<FonteNelPopup["stato"], string> = {
  da_confermare: "aspetta il via",
  in_coda: "in coda",
  in_lettura: "sto leggendo",
  fatta: "letta",
  errore: "non letta",
  da_collegare: "da collegare",
};

function IconaStato({ f }: { f: FonteNelPopup }) {
  if (f.stato === "in_lettura" || f.stato === "in_coda") return <Loader2 className="h-4 w-4 animate-spin text-orange-600 motion-reduce:animate-none" aria-hidden />;
  if (f.stato === "fatta") return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (f.stato === "errore") return <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />;
  if (f.stato === "da_collegare") return <Link2 className="h-4 w-4 text-amber-600" aria-hidden />;
  return <FileText className="h-4 w-4 text-slate-500" aria-hidden />;
}

function SchedaFonte({ f, onRiprova, onTogli }: { f: FonteNelPopup; onRiprova: () => void; onTogli: () => void }) {
  return (
    <li className="rounded-lg border bg-white p-3 text-sm shadow-sm" aria-busy={f.stato === "in_lettura" || undefined}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0"><IconaStato f={f} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900" title={f.etichetta}>{f.etichetta}</p>
          <p className="text-xs text-slate-500">
            {STATI[f.stato]}
            {f.stato === "fatta" && f.valori != null ? ` · ${f.valori} ${f.valori === 1 ? "valore" : "valori"}` : ""}
            {f.stato === "fatta" && f.costoEur ? ` · ${euroAI(f.costoEur)}` : ""}
            {f.stato === "fatta" && f.tipo !== "ripresa" && f.tipo !== "commessa" && !f.costoEur ? " · gratis" : ""}
            {(f.stato === "da_confermare" || f.stato === "in_coda" || f.stato === "in_lettura") && f.stimaEur > 0
              ? ` · circa ${euroAI(f.stimaEur)}` : ""}
          </p>
        </div>
        {(f.stato === "errore" || f.stato === "da_confermare" || f.stato === "da_collegare") && (
          <button type="button" onClick={onTogli} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Togli ${f.etichetta}`}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {f.stato === "errore" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-red-700">{f.errore}</p>
          {(f.tipo !== "file" || f.file) && !/formato|foglio di calcolo/.test(f.errore ?? "") && (
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={onRiprova}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />Riprova
            </Button>
          )}
        </div>
      )}
      {f.stato === "da_collegare" && (
        <p className="mt-2 text-xs text-amber-800">
          È l'offerta di una ditta: il suo totale è un costo. Si collega a una richiesta d'offerta, con ditte e costi.
        </p>
      )}
      {f.avvisi.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {f.avvisi.slice(0, 3).map((a) => <li key={a}>• {a}</li>)}
          {f.avvisi.length > 3 && <li>e altri {f.avvisi.length - 3} avvisi</li>}
        </ul>
      )}
    </li>
  );
}

type Elenco = "preventivo" | "computo" | null;

function ElencoDaScegliere({ tipo, companyId, servizi, onScegli, onChiudi }: {
  tipo: "preventivo" | "computo"; companyId: string; servizi: ServiziSilvioCommessa;
  onScegli: (f: FonteDaAggiungere) => void; onChiudi: () => void;
}) {
  const [cerca, setCerca] = useState("");
  const idRicerca = useId();
  const preventivi = useQuery({
    queryKey: ["silvio-commessa", "preventivi", companyId], enabled: tipo === "preventivo", staleTime: 60_000,
    queryFn: () => servizi.elencaPreventivi(companyId),
  });
  const computi = useQuery({
    queryKey: ["silvio-commessa", "computi", companyId], enabled: tipo === "computo", staleTime: 60_000,
    queryFn: () => servizi.elencaComputi(companyId),
  });
  const q = cerca.trim().toLowerCase();
  const righe = useMemo(() => {
    if (tipo === "preventivo") {
      return (preventivi.data ?? []).map((p) => ({
        id: p.id, titolo: `${p.quote_number}${p.client_name ? ` · ${p.client_name}` : ""}`, sotto: p.title ?? "",
        stato: QUOTE_STATUS_CONFIG[p.status as QuoteStatus]?.label ?? p.status, totale: p.total, etichetta: `preventivo ${p.quote_number}`,
      }));
    }
    return (computi.data ?? []).map((c) => ({
      id: c.id, titolo: c.titolo || "Computo senza titolo", sotto: c.committente, stato: `${c.numeroVoci} voci`,
      totale: c.totale, etichetta: `computo ${c.titolo || ""}`.trim(),
    }));
  }, [tipo, preventivi.data, computi.data]).filter((r) => !q || `${r.titolo} ${r.sotto}`.toLowerCase().includes(q));
  const caricamento = tipo === "preventivo" ? preventivi.isLoading : computi.isLoading;
  const errore = tipo === "preventivo" ? preventivi.error : computi.error;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2">
      <div className="flex items-center gap-2">
        <label htmlFor={idRicerca} className="sr-only">Cerca {tipo === "preventivo" ? "un preventivo" : "un computo"}</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id={idRicerca} autoFocus value={cerca} onChange={(e) => setCerca(e.target.value)} className="h-9 bg-white pl-8"
            placeholder={tipo === "preventivo" ? "Numero, cliente, titolo…" : "Titolo o committente…"} />
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onChiudi} aria-label="Chiudi l'elenco">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="mt-2 max-h-56 overflow-y-auto" aria-label={tipo === "preventivo" ? "Preventivi" : "Computi"}>
        {caricamento && <li className="flex items-center gap-2 p-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Carico…</li>}
        {errore && <li className="p-2 text-sm text-red-700">{errore instanceof Error ? errore.message : "Elenco non disponibile."}</li>}
        {!caricamento && !errore && !righe.length && <li className="p-2 text-sm text-slate-500">Niente da mostrare.</li>}
        {righe.map((r) => (
          <li key={r.id}>
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white focus-visible:bg-white"
              onClick={() => onScegli({ tipo, id: r.id, etichetta: r.etichetta })}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.titolo}</span>
                <span className="block truncate text-xs text-slate-500">{[r.stato, r.sotto].filter(Boolean).join(" · ")}</span>
              </span>
              {r.totale != null && <span className="shrink-0 text-xs font-medium">{formatCurrency(r.totale)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** I documenti della commessa che Silvio sa leggere, con la stima di ognuno. */
function DocumentiDellaCommessa({ orderId, fonti, servizi, onAggiungi }: {
  orderId: string; fonti: FonteNelPopup[]; servizi: ServiziSilvioCommessa; onAggiungi: (f: FonteDaAggiungere[]) => void;
}) {
  const allegati = useQuery({
    queryKey: ["silvio-commessa", "allegati", orderId], staleTime: 60_000,
    queryFn: () => servizi.elencaAllegati(orderId),
  });
  const leggibili = useMemo(() => (allegati.data ?? [])
    .map((a) => ({ a, r: riconosciDocumento({ nome: a.nome, mime: a.mime ?? "" }) }))
    .filter(({ r }) => r.lettore !== "non_letto")
    .map(({ a, r }) => ({ a, stima: stimaLettura(r, a.dimensione ?? 0) })), [allegati.data]);
  const aggiunti = new Set(fonti.filter((f) => f.allegato).map((f) => f.allegato!.id));
  if (allegati.isLoading) {
    return <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cerco i documenti della commessa…</p>;
  }
  if (allegati.error || !leggibili.length) return null;
  return (
    <section className="rounded-lg border bg-white p-2" aria-labelledby="silvio-documenti-commessa">
      <h4 id="silvio-documenti-commessa" className="px-1 text-xs font-semibold text-slate-700">Documenti della commessa</h4>
      <p className="px-1 text-xs text-slate-500">Silvio li legge solo se tocchi «Leggi».</p>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
        {leggibili.map(({ a, stima }: { a: AllegatoCommessa; stima: number }) => (
          <li key={a.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={a.nome}>{a.nome}</span>
            <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" disabled={aggiunti.has(a.id)}
              aria-label={aggiunti.has(a.id) ? `${a.nome}: già tra le fonti` : `Leggi ${a.nome}${stima ? `, circa ${euroAI(stima)}` : ", gratis"}`}
              onClick={() => onAggiungi([{ tipo: "allegato", allegato: a }])}>
              {aggiunti.has(a.id) ? "Aggiunto" : `Leggi · ${stima ? `~${euroAI(stima)}` : "gratis"}`}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ColonnaFontiProps {
  companyId: string;
  /** «Completa»: la commessa di cui mostrare i documenti. */
  orderId?: string | null;
  fonti: FonteNelPopup[];
  servizi: ServiziSilvioCommessa;
  onAggiungi: (f: FonteDaAggiungere[]) => void;
  onConferma: () => void;
  onRiprova: (id: string) => void;
  onTogli: (id: string) => void;
}

export function ColonnaFonti({ companyId, orderId, fonti, servizi, onAggiungi, onConferma, onRiprova, onTogli }: ColonnaFontiProps) {
  const [sopra, setSopra] = useState(false);
  const [elenco, setElenco] = useState<Elenco>(null);
  const [testo, setTesto] = useState("");
  const inputFile = useRef<HTMLInputElement>(null);
  const idTesto = useId();
  const voce = useVoiceInput((t) => setTesto((p) => (p.trim() ? `${p.trim()}\n${t}` : t)));
  const daConfermare = fonti.filter((f) => f.stato === "da_confermare");
  const stima = daConfermare.reduce((s, f) => s + f.stimaEur, 0);

  const file = (lista: FileList | null) => {
    if (lista?.length) onAggiungi([...lista].map((f) => ({ tipo: "file", file: f })));
  };
  const lascia = (e: DragEvent) => {
    e.preventDefault();
    setSopra(false);
    file(e.dataTransfer.files);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {orderId && <DocumentiDellaCommessa orderId={orderId} fonti={fonti} servizi={servizi} onAggiungi={onAggiungi} />}
      <div
        onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
        onDragLeave={() => setSopra(false)}
        onDrop={lascia}
        className={cn("rounded-xl border-2 border-dashed p-4 text-center transition-colors",
          sopra ? "border-orange-400 bg-orange-50" : "border-slate-300 bg-white")}
      >
        <Upload className="mx-auto h-6 w-6 text-orange-600" aria-hidden />
        <p className="mt-1 text-sm font-medium text-slate-900">Trascina qui contratti, capitolati, PDF, foto</p>
        <p className="text-xs text-slate-500">Preventivi e computi sono gratis; un PDF circa 0,01 €, una foto 0,005 €.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-1" onClick={() => inputFile.current?.click()}>
          <Plus className="h-4 w-4" aria-hidden />Scegli i file
        </Button>
        <input ref={inputFile} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Scegli i file da far leggere a Silvio"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.xpwe,.dcf,.xml,application/pdf,image/jpeg,image/png,image/webp,text/plain"
          onChange={(e) => { file(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={elenco === "preventivo" ? "secondary" : "outline"} size="sm" className="gap-1"
          aria-expanded={elenco === "preventivo"} onClick={() => setElenco(elenco === "preventivo" ? null : "preventivo")}>
          <FileText className="h-4 w-4" aria-hidden />Preventivo
        </Button>
        <Button type="button" variant={elenco === "computo" ? "secondary" : "outline"} size="sm" className="gap-1"
          aria-expanded={elenco === "computo"} onClick={() => setElenco(elenco === "computo" ? null : "computo")}>
          <Calculator className="h-4 w-4" aria-hidden />Computo
        </Button>
      </div>
      {elenco && (
        <ElencoDaScegliere tipo={elenco} companyId={companyId} servizi={servizi} onChiudi={() => setElenco(null)}
          onScegli={(f) => { onAggiungi([f]); setElenco(null); }} />
      )}

      <div className="space-y-2">
        <label htmlFor={idTesto} className="text-xs font-medium text-slate-600">Oppure scrivi o detta il lavoro</label>
        <Textarea id={idTesto} value={testo} onChange={(e) => setTesto(e.target.value)} rows={3} className="bg-white text-sm"
          placeholder="Rifare il bagno di 6 mq a Monza, 12.000 €, inizio a metà novembre" />
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="outline" size="sm" className={cn("gap-1", voce.recording && "border-red-300 text-red-700")}
            onClick={voce.toggle} disabled={voce.transcribing} aria-pressed={voce.recording}>
            {voce.transcribing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : voce.recording ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
            {voce.transcribing ? "Trascrivo…" : voce.recording ? `Ferma (${Math.round(voce.recordingMs / 1000)} s)` : "Parla"}
          </Button>
          <Button type="button" size="sm" className="min-w-0 whitespace-normal" disabled={!testo.trim()}
            onClick={() => { onAggiungi([{ tipo: "testo", testo: testo.trim() }]); setTesto(""); }}>
            Leggi il testo
          </Button>
        </div>
        <p className="text-xs text-slate-500">Leggere il testo costa circa {euroAI(0.005)}; il vocale si trascrive nel campo.</p>
      </div>

      {daConfermare.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm" role="group" aria-label="Letture da confermare">
          <p className="text-slate-800">
            {daConfermare.length === 1 ? "1 documento" : `${daConfermare.length} documenti`} da leggere con l'AI:
            {" "}<strong>circa {euroAI(stima)}</strong>{stima >= 0.01 ? " (di più se sono scansioni)" : ""}.
          </p>
          <Button type="button" size="sm" className="mt-2 w-full bg-orange-600 hover:bg-orange-700" onClick={onConferma}>
            Leggi {daConfermare.length === 1 ? "il documento" : "i documenti"}
          </Button>
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="Fonti caricate">
        {fonti.map((f) => <SchedaFonte key={f.id} f={f} onRiprova={() => onRiprova(f.id)} onTogli={() => onTogli(f.id)} />)}
      </ul>
    </div>
  );
}
