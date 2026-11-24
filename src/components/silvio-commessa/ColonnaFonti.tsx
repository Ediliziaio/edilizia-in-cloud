import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Fonti del popup «Crea con Silvio»: file da trascinare, preventivo o computo da scegliere,
 * vocale e testo libero; lo stato di ogni lettura, con la stima del costo prima e «Riprova»
 * dopo un errore. Vedi docs/piano-silvio-commessa-ai.md, 3.3–3.4.
 *
 * In «Completa» (fase 2) in cima ci sono i documenti già allegati alla commessa: ognuno si
 * legge con un tocco su «Leggi», che porta davanti la stima del costo.
 *
 * 01/11/2026: il testo libero e il vocale si scrivono nella chat (prima c'era un secondo
 * campo qui, doppione); qui restano file, preventivi e computi.
 *
 * Fase 4: l'offerta di una ditta «da collegare» si collega qui alla sua richiesta d'offerta,
 * scelta fra quelle aperte; la lettura parte col tocco che mostra il costo.
 */
import { useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, FileText, Loader2, Plus, RotateCcw, Search, Upload, X, Calculator, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import type { AllegatoCommessa } from "@/lib/silvio-commessa/lettori";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";
import { euroAI, stimaLettura } from "./presentazione";
import { STIMA_OFFERTA_EUR, type FonteDaAggiungere, type FonteNelPopup } from "./useBozzaSilvio";
import type { RichiestaOfferta } from "../../../shared/silvio-commessa/risorse.ts";
import type { ServiziSilvioCommessa } from "./servizi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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

/** A quale richiesta d'offerta risponde l'offerta: si sceglie fra le aperte, poi si legge. */
function CollegaOfferta({ companyId, servizi, onCollega }: {
  companyId: string; servizi: ServiziSilvioCommessa; onCollega: (r: RichiestaOfferta) => void;
}) {
  const t = useT();
  const id = useId();
  const [scelta, setScelta] = useState("");
  const richieste = useQuery({
    queryKey: ["silvio-commessa-richieste-offerta", companyId],
    queryFn: () => servizi.richiesteOfferta(companyId),
    staleTime: 60_000,
  });
  const elenco = richieste.data ?? [];
  const r = elenco.find((x) => x.id === scelta);
  if (richieste.isLoading) return <p className="mt-2 text-xs lg:text-[11px] text-slate-500">{t("Cerco le richieste d'offerta aperte…")}</p>;
  if (richieste.error) return <p className="mt-2 text-xs lg:text-[11px] text-slate-600">{t("Non riesco a leggere le richieste d'offerta: riprova tra poco.")}</p>;
  if (!elenco.length) {
    return <p className="mt-2 text-xs lg:text-[11px] text-slate-600">{t("Non ci sono richieste d'offerta aperte: creane una da Acquisti → Richieste d'offerta, poi collegala qui.")}</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 text-xs lg:text-[11px] text-slate-600">
        {t("A quale richiesta risponde?")}
        <UniformSelect id={id} value={scelta} onChange={(e) => setScelta(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border bg-white lg:h-9 px-2 text-sm lg:text-[13px] text-slate-900">
          <option value="">{t("Scegli…")}</option>
          {elenco.map((x) => (
            <option key={x.id} value={x.id}>{[x.rfq_number, x.titolo, x.fornitore].filter(Boolean).join(" · ")}</option>
          ))}
        </UniformSelect>
      </label>
      <Button type="button" size="sm" className="h-11 lg:h-9" disabled={!r} onClick={() => r && onCollega(r)}>{t("Leggi l'offerta · ~{stima}", { stima: euroAI(STIMA_OFFERTA_EUR) })}</Button>
    </div>
  );
}

function SchedaFonte({ f, onRiprova, onTogli, collega, onComeDocumento }: {
  f: FonteNelPopup; onRiprova: () => void; onTogli: () => void;
  /** Per un'offerta da collegare: la scelta della richiesta. */
  collega?: ReactNode;
  /** L'uscita per un'offerta che non è un'offerta (P6). */
  onComeDocumento?: () => void;
}) {
  const t = useT();
  const [togliendo, setTogliendo] = useState(false);
  // Una fonte letta si toglie coi dati che ha portato; la commessa che si completa resta.
  const togliLetta = f.stato === "fatta" && f.tipo !== "commessa";
  const dati = f.valori ?? 0;
  return (
    <li className="rounded-lg border bg-white px-3 py-2 text-sm lg:text-[13px] shadow-sm" aria-busy={f.stato === "in_lettura" || undefined}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0"><IconaStato f={f} /></span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-medium text-slate-900" title={f.etichetta}>{f.etichetta}</p>
          <p className="text-xs lg:text-[11px] text-slate-500">
            {t(STATI[f.stato])}
            {f.stato === "fatta" && f.valori != null ? ` · ${t(f.valori === 1 ? "{n} dato preso" : "{n} dati presi", { n: f.valori })}` : ""}
            {f.stato === "fatta" && f.costoEur ? ` · ${euroAI(f.costoEur)}` : ""}
            {f.stato === "fatta" && f.tipo !== "ripresa" && f.tipo !== "commessa" && !f.costoEur ? ` · ${t("gratis")}` : ""}
            {(f.stato === "da_confermare" || f.stato === "in_coda" || f.stato === "in_lettura") && f.stimaEur > 0
              ? ` · ${t("circa {stima}", { stima: euroAI(f.stimaEur) })}` : ""}
          </p>
        </div>
        {(f.stato === "errore" || f.stato === "da_confermare" || f.stato === "da_collegare") && (
          <button type="button" onClick={onTogli} className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:m-0 lg:h-7 lg:w-7"
            aria-label={t("Togli {nome}", { nome: String(f.etichetta ?? "") })}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {f.stato === "errore" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs lg:text-[11px] text-red-700">{f.errore}</p>
          {(f.tipo !== "file" || f.file) && !/formato|foglio di calcolo|foglio Excel|Non sembra un computo|troppo grande/.test(f.errore ?? "") && (
            <Button type="button" size="sm" variant="outline" className="h-11 gap-1 lg:h-8" onClick={onRiprova}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t("Riprova")}
            </Button>
          )}
        </div>
      )}
      {f.stato === "da_collegare" && (
        <>
          <p className="mt-2 text-xs lg:text-[11px] text-amber-800">
            {t("È l'offerta di una ditta: il suo totale è un costo, non l'importo della commessa. Collegala alla sua richiesta d'offerta e diventa l'ordine in bozza a quel fornitore.")}
          </p>
          {f.errore && <p className="mt-1 text-xs lg:text-[11px] text-red-700">{f.errore}</p>}
          {collega}
          {onComeDocumento && (
            <Button type="button" size="sm" variant="outline" className="mt-2 h-auto min-h-11 w-full whitespace-normal lg:min-h-8" onClick={onComeDocumento}>
              {t("Leggilo come documento normale")}{f.stimaEur > 0 ? ` · ~${euroAI(f.stimaEur)}` : ""}
            </Button>
          )}
        </>
      )}
      {togliLetta && !togliendo && (
        <Button type="button" size="sm" variant="ghost" className="mt-1 h-11 w-full justify-start px-1 text-xs text-slate-500 lg:h-7 lg:text-[11px]"
          aria-label={t("Togli questa fonte: {etichetta}", { etichetta: String(f.etichetta ?? "") })} onClick={() => setTogliendo(true)}>
          <X className="h-3.5 w-3.5" aria-hidden />{t("Togli questa fonte")}
        </Button>
      )}
      {togliLetta && togliendo && (
        <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs lg:text-[11px] text-slate-700" role="group" aria-label={t("Togliere {etichetta}", { etichetta: String(f.etichetta ?? "") })}>
          <p>{dati ? t(dati === 1 ? "Tolgo anche il dato che ha portato. Quello che hai scritto tu resta." : "Tolgo anche i {n} dati che ha portato. Quello che hai scritto tu resta.", { n: dati }) : t("Quello che hai scritto tu resta.")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-11 border-red-200 text-red-800 lg:h-7" onClick={onTogli}>{t("Sì, togli")}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-7" onClick={() => setTogliendo(false)}>{t("Lascia")}</Button>
          </div>
        </div>
      )}
      {f.avvisi.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs lg:text-[11px] text-amber-800">
          {f.avvisi.slice(0, 3).map((a) => <li key={a}>• {a}</li>)}
          {f.avvisi.length > 3 && <li>{f.avvisi.length === 4 ? t("e un altro avviso") : t("e altri {n} avvisi", { n: f.avvisi.length - 3 })}</li>}
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
  const t = useT();
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
        stato: t(QUOTE_STATUS_CONFIG[p.status as QuoteStatus]?.label ?? p.status), totale: p.total, etichetta: `preventivo ${p.quote_number}`,
      }));
    }
    return (computi.data ?? []).map((c) => ({
      id: c.id, titolo: c.titolo || t("Computo senza titolo"), sotto: c.committente, stato: t("{n} voci", { n: c.numeroVoci }),
      totale: c.totale, etichetta: `computo ${c.titolo || ""}`.trim(),
    }));
  }, [tipo, preventivi.data, computi.data, t]).filter((r) => !q || `${r.titolo} ${r.sotto}`.toLowerCase().includes(q));
  const caricamento = tipo === "preventivo" ? preventivi.isLoading : computi.isLoading;
  const errore = tipo === "preventivo" ? preventivi.error : computi.error;

  return (
    <div data-silvio-elenco className="rounded-lg border border-orange-200 bg-orange-50/50 p-2" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onChiudi(); }
    }}>
      <div className="flex items-center gap-2">
        <label htmlFor={idRicerca} className="sr-only">{tipo === "preventivo" ? t("Cerca un preventivo") : t("Cerca un computo")}</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id={idRicerca} autoFocus value={cerca} onChange={(e) => setCerca(e.target.value)} className="h-11 bg-white pl-8 lg:h-9"
            placeholder={tipo === "preventivo" ? t("Numero, cliente, titolo…") : t("Titolo o committente…")} />
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-11 w-11 lg:h-9 lg:w-9" onClick={onChiudi} aria-label={t("Chiudi l'elenco")}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="mt-2 max-h-56 overflow-y-auto" aria-label={tipo === "preventivo" ? t("Preventivi") : t("Computi")}>
        {caricamento && <li className="flex items-center gap-2 p-2 text-sm lg:text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("Carico…")}</li>}
        {errore && <li className="p-2 text-sm lg:text-[13px] text-red-700">{erroreLeggibile(errore, t("Elenco non disponibile: riprova tra poco."))}</li>}
        {!caricamento && !errore && !righe.length && <li className="p-2 text-sm lg:text-[13px] text-slate-500">{t("Niente da mostrare.")}</li>}
        {righe.map((r) => (
          <li key={r.id}>
            <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white focus-visible:bg-white lg:min-h-0"
              onClick={() => onScegli({ tipo, id: r.id, etichetta: r.etichetta })}>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-sm lg:text-[13px] font-medium">{r.titolo}</span>
                <span className="line-clamp-2 break-words text-xs lg:text-[11px] text-slate-500">{[r.stato, r.sotto].filter(Boolean).join(" · ")}</span>
              </span>
              {r.totale != null && <span className="shrink-0 text-xs lg:text-[11px] font-medium">{formatCurrency(r.totale)}</span>}
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
  const t = useT();
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
    return <p className="flex items-center gap-2 text-xs lg:text-[11px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("Cerco i documenti della commessa…")}</p>;
  }
  if (allegati.error || !leggibili.length) return null;
  return (
    <section className="rounded-lg border bg-white p-2" aria-labelledby="silvio-documenti-commessa">
      <h4 id="silvio-documenti-commessa" className="px-1 text-xs lg:text-[11px] font-semibold text-slate-700">{t("Documenti della commessa")}</h4>
      <p className="px-1 text-xs lg:text-[11px] text-slate-500">{t("Silvio li legge solo se tocchi «Leggi».")}</p>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
        {leggibili.map(({ a, stima }: { a: AllegatoCommessa; stima: number }) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 text-sm lg:text-[13px]">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {/* Nella colonna stretta il pulsante scende sotto: «Capitolat…» non si riconosceva. */}
            <span className="line-clamp-2 min-w-0 flex-1 basis-40 break-words" title={a.nome}>{a.nome}</span>
            <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 px-2 text-xs lg:h-8 lg:text-[11px]" disabled={aggiunti.has(a.id)}
              aria-label={aggiunti.has(a.id) ? t("{nome}: già tra le fonti", { nome: String(a.nome ?? "") }) : stima ? t("Leggi {nome}, circa {stima}", { nome: String(a.nome ?? ""), stima: euroAI(stima) }) : t("Leggi {nome}, gratis", { nome: String(a.nome ?? "") })}
              onClick={() => onAggiungi([{ tipo: "allegato", allegato: a }])}>
              {aggiunti.has(a.id) ? t("Aggiunto") : stima ? t("Leggi · ~{stima}", { stima: euroAI(stima) }) : t("Leggi · gratis")}
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
  /** Fase 4: collega un'offerta da collegare alla sua richiesta d'offerta. */
  onCollegaOfferta?: (id: string, r: RichiestaOfferta) => void;
  /** Non è un'offerta: si legge come un documento qualsiasi. */
  onComeDocumento?: (id: string) => void;
}

export function ColonnaFonti({
  companyId, orderId, fonti, servizi, onAggiungi, onConferma, onRiprova, onTogli, onCollegaOfferta, onComeDocumento,
}: ColonnaFontiProps) {
  const t = useT();
  const [sopra, setSopra] = useState(false);
  const [elenco, setElenco] = useState<Elenco>(null);
  const inputFile = useRef<HTMLInputElement>(null);
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
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {orderId && <DocumentiDellaCommessa orderId={orderId} fonti={fonti} servizi={servizi} onAggiungi={onAggiungi} />}
      <div
        onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
        onDragLeave={() => setSopra(false)}
        onDrop={lascia}
        className={cn("rounded-xl border-2 border-dashed p-3 text-center transition-colors",
          sopra ? "border-orange-400 bg-orange-50" : "border-slate-300 bg-white")}
      >
        <p className="flex items-center justify-center gap-1.5 text-sm lg:text-[13px] font-medium text-slate-900"><Upload className="h-4 w-4 shrink-0 text-orange-600" aria-hidden /><span className="sm:hidden">{t("Carica i documenti")}</span><span className="max-sm:hidden">{t("Trascina qui i documenti")}</span></p>
        <p className="text-xs lg:text-[11px] text-slate-500">{t("Contratti, capitolati, PDF, foto, Excel: un PDF circa 0,01 €, un computo in Excel gratis.")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2 h-11 gap-1 lg:h-9" onClick={() => inputFile.current?.click()}>
          <Plus className="h-4 w-4" aria-hidden />{t("Scegli i file")}
        </Button>
        <input ref={inputFile} type="file" multiple className="sr-only" tabIndex={-1} aria-label={t("Scegli i file da far leggere a Silvio")}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.xpwe,.dcf,.xml,.xlsx,.xlsm,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { file(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={elenco === "preventivo" ? "secondary" : "outline"} size="sm" className="h-11 gap-1 lg:h-9"
          aria-expanded={elenco === "preventivo"} onClick={() => setElenco(elenco === "preventivo" ? null : "preventivo")}>
          <FileText className="h-4 w-4" aria-hidden />{t("Preventivo")}
        </Button>
        <Button type="button" variant={elenco === "computo" ? "secondary" : "outline"} size="sm" className="h-11 gap-1 lg:h-9"
          aria-expanded={elenco === "computo"} onClick={() => setElenco(elenco === "computo" ? null : "computo")}>
          <Calculator className="h-4 w-4" aria-hidden />{t("Computo")}
        </Button>
      </div>
      {elenco && (
        <ElencoDaScegliere tipo={elenco} companyId={companyId} servizi={servizi} onChiudi={() => setElenco(null)}
          onScegli={(f) => { onAggiungi([f]); setElenco(null); }} />
      )}

      <p className="text-xs lg:text-[11px] text-slate-500">
        {t("Non hai un documento? Scrivi o detta il lavoro nella chat: Silvio lo legge come una fonte.")}
      </p>

      {daConfermare.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm lg:text-[13px]" role="group" aria-label={t("Letture da confermare")}>
          <p className="text-slate-800">
            {t(daConfermare.length === 1 ? "1 documento da leggere con l'AI:" : "{n} documenti da leggere con l'AI:", { n: daConfermare.length })}
            {" "}<strong>{t("circa {stima}", { stima: euroAI(stima) })}</strong>{stima >= 0.01 ? ` ${t("(di più se sono scansioni)")}` : ""}.
          </p>
          <Button type="button" size="sm" className="mt-2 h-11 w-full bg-orange-700 hover:bg-orange-800 lg:h-9" onClick={onConferma}>
            {daConfermare.length === 1 ? t("Leggi il documento") : t("Leggi i documenti")}
          </Button>
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label={t("Fonti caricate")}>
        {fonti.map((f) => (
          <SchedaFonte key={f.id} f={f} onRiprova={() => onRiprova(f.id)} onTogli={() => onTogli(f.id)}
            collega={f.stato === "da_collegare" && onCollegaOfferta
              ? <CollegaOfferta companyId={companyId} servizi={servizi} onCollega={(r) => onCollegaOfferta(f.id, r)} /> : null}
            onComeDocumento={onComeDocumento ? () => onComeDocumento(f.id) : undefined} />
        ))}
      </ul>
    </div>
  );
}
