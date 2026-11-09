/**
 * Un modello di «Contratti e condizioni», a pagina intera (07/11/2026).
 *
 * Florin, sul popup di prima: «a livello di design è un casino, e l'anteprima non rispecchia il PDF reale».
 * Quindi una pagina, come gli altri editor del gestionale:
 *   · in alto una riga sola — nome, per quale documento, predefinito, Salva;
 *   · a sinistra l'elenco stretto delle clausole, nell'ordine in cui escono;
 *   · al centro UN editor, quello della clausola scelta (grassetto, dimensione, carattere, elenchi);
 *   · a destra il PDF vero, disegnato dallo stesso componente dei preventivi (`anteprimaCondizioniUrl`).
 *
 * Salvando, la versione sale e quella di prima resta fotografata: i documenti già partiti non cambiano.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Plus, Save, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import {
  AMBITI_CONDIZIONI, DOVE_SI_USA, NOMI_AMBITI, testoPiano,
  type AmbitoCondizioni, type Clausola,
} from "@/lib/condizioni/archivio";
import { PAGINA_CONDIZIONI } from "@/lib/condizioni/indirizzi";
import { anteprimaCondizioniUrl, aziendaPerAnteprima } from "@/lib/condizioni/anteprimaPdf";
import { htmlPerEditorContratto } from "@/lib/preventivi/contrattoEditor";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Il testo di prima (Markdown importato) diventa HTML una volta sola, all'apertura. */
const comeHtml = (testo: string | null | undefined): string => DOMPurify.sanitize(htmlPerEditorContratto(String(testo ?? "")));

interface Bozza { nome: string; ambito: AmbitoCondizioni; predefinito: boolean; clausole: Clausola[] }

export default function SettingsCondizioniModello() {
  const { id } = useParams<{ id: string }>();
  const [parametri] = useSearchParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const puoGestire = !permessi.isLoading && (!!permessi.isAdmin || !!permessi.canManageCondizioni);
  const archivio = useCondizioniArchivio();
  const nuovo = id === "nuovo";
  const salvato = useMemo(() => archivio.modelli.find((m) => m.id === id) ?? null, [archivio.modelli, id]);

  // La bozza nasce una volta, quando il modello è arrivato (o subito, se è nuovo).
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [scelta, setScelta] = useState(0);
  const base: Bozza | null = useMemo(() => {
    if (nuovo) {
      const ambito = (parametri.get("ambito") as AmbitoCondizioni | null) ?? "preventivo";
      const valido = AMBITI_CONDIZIONI.includes(ambito) ? ambito : "preventivo";
      return { nome: "", ambito: valido, predefinito: !archivio.modelli.some((m) => m.attivo && m.ambito === valido && m.predefinito), clausole: [] };
    }
    if (!salvato) return null;
    return {
      nome: salvato.nome, ambito: salvato.ambito, predefinito: salvato.predefinito,
      clausole: (salvato.clausole ?? []).map((c) => ({ ...c, testo: comeHtml(c.testo) })),
    };
  }, [nuovo, parametri, archivio.modelli, salvato]);
  const attiva = bozza ?? base;
  const cambia = useCallback((patch: Partial<Bozza>) => setBozza((b) => ({ ...(b ?? base!), ...patch })), [base]);

  // Chi esce con modifiche non salvate se ne accorge: chiudendo la scheda il browser chiede conferma.
  const modificato = bozza !== null;
  useEffect(() => {
    if (!modificato) return;
    const avvisa = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [modificato]);
  // ⌘S / Ctrl+S salva, come in ogni editor: il ref tiene sempre la versione aggiornata di `salva`.
  const salvaRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); salvaRef.current?.(); }
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, []);

  const anteprima = useCallback(() => anteprimaCondizioniUrl(
    { id: salvato?.id ?? "nuovo", nome: attiva?.nome || "Nuovo modello", ambito: attiva?.ambito ?? "preventivo", attivo: true, versione: salvato?.versione ?? 1, clausole: attiva?.clausole ?? [] },
    aziendaPerAnteprima(effectiveCompany),
  ), [attiva, salvato, effectiveCompany]);
  const chiaveAnteprima = JSON.stringify(attiva?.clausole ?? []) + (attiva?.nome ?? "");

  if (archivio.inCaricamento) return <p role="status" className="p-4 text-sm text-muted-foreground">Apro il modello…</p>;
  if (!attiva) {
    return (
      <div className="space-y-2 p-4">
        <p role="alert" className="text-sm">Questo modello non c'è più: forse è stato archiviato.</p>
        <Button asChild variant="outline" size="sm"><Link to={PAGINA_CONDIZIONI}>Torna a Contratti e condizioni</Link></Button>
      </div>
    );
  }

  const dentro = attiva.clausole;
  const corrente = dentro[scelta] ?? null;
  const cambiaClausola = (i: number, patch: Partial<Clausola>) =>
    cambia({ clausole: dentro.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const sposta = (i: number, di: number) => {
    const j = i + di;
    if (j < 0 || j >= dentro.length) return;
    const copia = [...dentro];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    cambia({ clausole: copia });
    setScelta(j);
  };
  const aggiungi = (c: Clausola) => { cambia({ clausole: [...dentro, c] }); setScelta(dentro.length); };
  const togli = (i: number) => { cambia({ clausole: dentro.filter((_, j) => j !== i) }); setScelta(Math.max(0, Math.min(i, dentro.length - 2))); };

  const valido = attiva.nome.trim().length > 0 && dentro.some((c) => testoPiano(c.testo) || c.titolo.trim());
  const salva = () => {
    if (!puoGestire || !valido || !bozza || archivio.salvaModello.isPending) return;
    archivio.salvaModello.mutate(
      { id: salvato?.id, nome: attiva.nome, ambito: attiva.ambito, clausole: dentro, predefinito: attiva.predefinito },
      { onSuccess: (m) => { setBozza(null); if (nuovo && m?.id) navigate(`${PAGINA_CONDIZIONI}/modello/${m.id}`, { replace: true }); } },
    );
  };

  salvaRef.current = salva;
  const esci = (e: { preventDefault: () => void }) => {
    if (modificato && !window.confirm("Ci sono modifiche non salvate. Uscire lo stesso?")) e.preventDefault();
  };

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* ── La riga in alto: tutto quello che riguarda il modello intero ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-9 px-2"><Link to={PAGINA_CONDIZIONI} onClick={esci} aria-label="Torna a Contratti e condizioni"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <Input aria-label="Nome del modello" className="h-9 min-w-[12rem] flex-1" value={attiva.nome} disabled={!puoGestire}
          placeholder="Es. Condizioni standard 2026" onChange={(e) => cambia({ nome: e.target.value })} />
        <select aria-label="Per quale documento" className="h-9 rounded-md border bg-background px-2 text-sm" value={attiva.ambito} disabled={!puoGestire}
          onChange={(e) => cambia({ ambito: e.target.value as AmbitoCondizioni })}>
          {AMBITI_CONDIZIONI.map((a) => <option key={a} value={a}>{NOMI_AMBITI[a]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={attiva.predefinito} disabled={!puoGestire} onCheckedChange={(v) => cambia({ predefinito: v })} aria-label="Modello predefinito" />
          Predefinito
        </label>
        {puoGestire && (
          <Button size="sm" className="h-9" disabled={!valido || archivio.salvaModello.isPending || !bozza} onClick={salva}>
            <Save className="mr-1.5 h-4 w-4" />{archivio.salvaModello.isPending ? "Salvo…" : bozza ? "Salva" : "Salvato"}
            {bozza && !archivio.salvaModello.isPending && <kbd className="ml-2 hidden rounded bg-primary-foreground/20 px-1 text-[10px] sm:inline">⌘S</kbd>}
          </Button>
        )}
        {modificato && <span role="status" className="text-xs font-medium text-amber-700">Modifiche non salvate</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {DOVE_SI_USA[attiva.ambito]}. I documenti già partiti non cambiano.
      </p>

      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,26rem)]">
        {/* ── Le clausole, nell'ordine in cui escono ── */}
        <nav aria-label="Clausole del modello" className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clausole ({dentro.length})</p>
          {dentro.map((c, i) => (
            <div key={i} className={cn("group flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm",
              i === scelta ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setScelta(i)} aria-current={i === scelta}>
                {c.titolo.trim() || <span className="italic text-muted-foreground">Senza titolo</span>}
                {c.vessatoria && <span className="ml-1 text-[10px] font-medium text-amber-700">· a parte</span>}
              </button>
              {puoGestire && (
                <span className="flex shrink-0 opacity-60 group-hover:opacity-100">
                  <button type="button" aria-label={`Sposta su ${c.titolo}`} disabled={i === 0} onClick={() => sposta(i, -1)} className="p-0.5 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Sposta giù ${c.titolo}`} disabled={i === dentro.length - 1} onClick={() => sposta(i, 1)} className="p-0.5 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
          ))}
          {puoGestire && (
            <div className="space-y-1 pt-1">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => aggiungi({ titolo: "", testo: "" })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Scrivi una clausola
              </Button>
              {archivio.clausole.length > 0 && (
                <select aria-label="Aggiungi dalla libreria" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value=""
                  onChange={(e) => {
                    const c = archivio.clausole.find((x) => x.id === e.target.value);
                    if (c) aggiungi({ clausola_id: c.id, titolo: c.titolo, testo: comeHtml(c.testo), vessatoria: c.vessatoria });
                  }}>
                  <option value="">+ Dalla libreria…</option>
                  {archivio.clausole.filter((c) => c.attiva).map((c) => <option key={c.id} value={c.id}>{c.titolo}</option>)}
                </select>
              )}
            </div>
          )}
        </nav>

        {/* ── La clausola scelta: un editor solo ── */}
        <section aria-label="Clausola scelta" className="min-w-0 space-y-2">
          {corrente ? (
            <>
              <div className="flex items-center gap-2">
                <Input aria-label="Titolo della clausola" className="h-9 flex-1 font-medium" value={corrente.titolo} disabled={!puoGestire}
                  placeholder="Es. Modalità di pagamento" onChange={(e) => cambiaClausola(scelta, { titolo: e.target.value })} />
                {puoGestire && (
                  <>
                    <Button variant="ghost" size="sm" className="h-9 px-2" aria-label="Duplica la clausola"
                      onClick={() => aggiungi({ ...corrente, clausola_id: null })}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-9 px-2" aria-label="Togli la clausola" onClick={() => togli(scelta)}><X className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
              {/* `key`: cambiando clausola l'editor riparte dal suo testo, senza portarsi dietro il cursore dell'altra. */}
              <RichTextEditor key={scelta} senzaFont value={corrente.testo} readOnly={!puoGestire} minHeight={420}
                placeholder="Il testo della clausola, come lo vuoi sul documento."
                onChange={(html) => cambiaClausola(scelta, { testo: html })} />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!corrente.vessatoria} disabled={!puoGestire} onCheckedChange={(v) => cambiaClausola(scelta, { vessatoria: v })} />
                Il cliente la approva a parte, con una seconda firma (art. 1341 c.c.)
              </label>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Ancora nessuna clausola: scrivine una, o prendila dalla libreria.
            </div>
          )}
        </section>

        {/* ── Il PDF vero ── */}
        <aside aria-label="Come esce sul documento" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <p className="mb-1 text-xs text-muted-foreground">Come esce, con dati d'esempio.</p>
          <div className="h-[70dvh] min-h-[420px]">
            <PdfBlobLivePreviewPanel renderBlobUrl={anteprima} depsKey={chiaveAnteprima} debounceMs={700}
              enabled={dentro.length > 0} downloadFileName={`${(attiva.nome || "condizioni").replace(/[^\w-]+/g, "-")}.pdf`} headerLabel="Anteprima" />
          </div>
        </aside>
      </div>
    </div>
  );
}

