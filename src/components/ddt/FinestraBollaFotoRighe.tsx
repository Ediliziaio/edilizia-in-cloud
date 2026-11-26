/**
 * «Controlla la bolla» (12/11/2026): a sinistra la foto o il PDF della bolla, sempre
 * aperti e ingrandibili; a destra testata e righe da correggere o scrivere a mano.
 *
 * Florin: «Scatto la foto, carico la bolla e poi da lì modifico e inserisco a mano le
 * cose». Prima l'originale si vedeva solo dentro «Carica più bolle», chiuso di default
 * e affiancato solo da 1280 px; nel «Nuovo DDT» non si vedeva proprio, e dal telefono
 * non si poteva scrivere niente. La stessa finestra ora vale per computer e telefono,
 * con o senza lettura AI. Su telefono la foto sta sopra, ridotta: un tocco la apre a
 * tutto schermo.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, ExternalLink, Loader2, Maximize2, Minus, Plus,
  RotateCw, Trash2, X, AlertTriangle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import { importoTotale } from "@/lib/ddt/letturaAI";
import { eUnPdf } from "@/lib/ddt/importBolle";
import { paginePdfComeImmagini } from "@/lib/ddt/dividiPdf";
import {
  aggiungiRiga, correggiRiga, numeroDaCampo, problemiBolla, togliRiga,
  type TestataBolla,
} from "@/lib/ddt/righeBolla";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";
import { createPdfPreviewUrl, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { toast } from "sonner";

// ─── L'originale ─────────────────────────────────────────────────────────

type Pagina = { tipo: "immagine"; src: string; nome: string } | { tipo: "pdf"; src: string; nome: string };

/** Foto come sono; i PDF diventano immagini, una per pagina. Se il PDF non si apre, resta il visore del browser. */
function usePagine(files: ReadonlyArray<File>): { pagine: Pagina[]; caricamento: boolean } {
  const [stato, setStato] = useState<{ per: ReadonlyArray<File> | null; pagine: Pagina[] }>({ per: null, pagine: [] });
  useEffect(() => {
    let vivo = true;
    const url: string[] = [];
    void (async () => {
      const pagine: Pagina[] = [];
      for (const f of files) {
        if (eUnPdf(f)) {
          try {
            const immagini = await paginePdfComeImmagini(f);
            if (!immagini.length) throw new Error("vuoto");
            immagini.forEach((src) => pagine.push({ tipo: "immagine", src, nome: f.name }));
          } catch {
            const u = URL.createObjectURL(f);
            url.push(u);
            pagine.push({ tipo: "pdf", src: u, nome: f.name });
          }
        } else {
          const u = URL.createObjectURL(f);
          url.push(u);
          pagine.push({ tipo: "immagine", src: u, nome: f.name });
        }
      }
      if (vivo) setStato({ per: files, pagine });
    })();
    return () => {
      vivo = false;
      url.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);
  // Finché le pagine non sono di questi file, si mostra il caricamento: niente foto di un'altra bolla.
  return stato.per === files ? { pagine: stato.pagine, caricamento: false } : { pagine: [], caricamento: true };
}

const ZOOM = [1, 1.5, 2, 3, 4];

/** Il visore: adatta, ingrandisci, sposta trascinando, ruota, pagine. */
export function VisoreBolla({ files, compatto = false }: { files: ReadonlyArray<File>; compatto?: boolean }) {
  const tr = useT();
  const { pagine, caricamento } = usePagine(files);
  const [indice, setIndice] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [rotazione, setRotazione] = useState(0);
  const [grande, setGrande] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const trascina = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const pagina = pagine[Math.min(indice, pagine.length - 1)];
  const scala = ZOOM[zoom];
  const ridotto = compatto && !grande;

  const vaiA = (i: number) => {
    setIndice(i);
    setZoom(0);
  };

  const apriOriginale = () => {
    const f = files.find((x) => x.name === pagina?.nome) ?? files[0];
    if (!f) return;
    const u = createPdfPreviewUrl(f);
    void apriDocumentoDopoAttesa(async () => u, f.name).then(aperto => {
      if (!aperto) toast.error(tr("Documento non disponibile. Riprova."));
    });
    window.setTimeout(() => revokePdfPreviewUrl(u), 60_000);
  };

  const comandi = (
    <div className="flex flex-wrap items-center gap-1 border-b bg-background/95 px-2 py-1.5 text-xs" role="toolbar" aria-label={tr("Comandi dell'originale")}>
      {pagine.length > 1 && (
        <>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Pagina precedente")} disabled={indice === 0} onClick={() => vaiA(Math.max(0, indice - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums" aria-live="polite">{tr("Pagina {indice} di {n}", { indice: indice + 1, n: pagine.length })}</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Pagina successiva")} disabled={indice >= pagine.length - 1} onClick={() => vaiA(Math.min(pagine.length - 1, indice + 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        </>
      )}
      {pagina?.tipo === "immagine" && (
        <>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Riduci")} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant={zoom === 0 ? "secondary" : "ghost"} className="h-8 px-2 text-xs" onClick={() => setZoom(0)}>
            {tr("Adatta")}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Ingrandisci")} disabled={zoom === ZOOM.length - 1} onClick={() => setZoom((z) => Math.min(ZOOM.length - 1, z + 1))}>
            <Plus className="h-4 w-4" />
          </Button>
          <span className="w-10 text-center tabular-nums text-muted-foreground">{Math.round(scala * 100)}%</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Ruota")} onClick={() => setRotazione((r) => (r + 90) % 360)}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="ghost" className="ml-auto h-8 gap-1 px-2 text-xs" onClick={apriOriginale}>
        {tr("Apri")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </Button>
      {grande && (
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" onClick={() => setGrande(false)}>
          <X className="h-3.5 w-3.5" aria-hidden="true" /> {tr("Chiudi foto")}
        </Button>
      )}
    </div>
  );

  const immagine = pagina?.tipo === "immagine" && (
    <img
      src={pagina.src}
      alt={`Originale ${pagina.nome}${pagine.length > 1 ? `, pagina ${indice + 1}` : ""}`}
      draggable={false}
      className={cn("select-none", zoom === 0 ? "mx-auto max-h-full max-w-full object-contain" : "max-w-none")}
      style={{
        ...(zoom === 0 ? {} : { width: `${scala * 100}%` }),
        ...(rotazione ? { transform: `rotate(${rotazione}deg)` } : {}),
      }}
    />
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-muted/30",
        grande ? "fixed inset-0 z-[60] bg-background" : "h-full",
      )}
      data-testid="visore-bolla"
    >
      {!ridotto && comandi}
      <div
        ref={area}
        className={cn(
          "relative min-h-0 flex-1 overflow-auto",
          zoom > 0 ? "cursor-grab active:cursor-grabbing" : "flex items-center justify-center p-2",
        )}
        onPointerDown={(e) => {
          if (zoom === 0 || !area.current || e.pointerType === "touch") return;
          trascina.current = { x: e.clientX, y: e.clientY, sl: area.current.scrollLeft, st: area.current.scrollTop };
        }}
        onPointerMove={(e) => {
          const t = trascina.current;
          if (!t || !area.current) return;
          area.current.scrollLeft = t.sl - (e.clientX - t.x);
          area.current.scrollTop = t.st - (e.clientY - t.y);
        }}
        onPointerUp={() => { trascina.current = null; }}
        onPointerLeave={() => { trascina.current = null; }}
      >
        {caricamento ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {tr("Apro l'originale…")}
          </p>
        ) : !pagina ? (
          <p className="text-sm text-muted-foreground">{tr("Nessun originale.")}</p>
        ) : pagina.tipo === "pdf" ? (
          <iframe title={tr("Originale {nome}", { nome: String(pagina.nome ?? "") })} src={pagina.src} className="h-full min-h-[50vh] w-full" />
        ) : ridotto ? (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center"
            aria-label={tr("Ingrandisci la foto della bolla")}
            onClick={() => setGrande(true)}
          >
            {immagine}
            <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[11px] font-medium shadow">
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
              {tr("Tocca per ingrandire")}{pagine.length > 1 ? ` ${tr("· {n} pagine", { n: pagine.length })}` : ""}
            </span>
          </button>
        ) : (
          immagine
        )}
      </div>
    </div>
  );
}

// ─── Le righe ────────────────────────────────────────────────────────────

const campoNumero = (v: number | null) => (v == null ? "" : String(v));

/** Le righe della merce, modificabili: le stesse in ogni finestra che salva bolle. */
const CLASSI_RIGA = {
  intestazione: "lg:grid", riga: "lg:grid-cols-[6.5rem_minmax(0,1fr)_5rem_4rem_6rem_2rem] lg:items-center",
  descrizione: "lg:order-2 lg:col-span-1", codice: "lg:order-1", quantita: "lg:order-3", um: "lg:order-4",
  prezzo: "lg:order-5", togli: "lg:order-6 lg:h-8 lg:w-8",
};
const CLASSI_RIGA_AFFIANCATA = {
  intestazione: "xl:grid", riga: "xl:grid-cols-[6.5rem_minmax(0,1fr)_5rem_4rem_6rem_2rem] xl:items-center",
  descrizione: "xl:order-2 xl:col-span-1", codice: "xl:order-1", quantita: "xl:order-3", um: "xl:order-4",
  prezzo: "xl:order-5", togli: "xl:order-6 xl:h-8 xl:w-8",
};

export function RigheBollaEditor({
  righe,
  onChange,
  disabled = false,
  affiancata = false,
}: {
  righe: DDTRigaNuova[];
  onChange: (r: DDTRigaNuova[]) => void;
  disabled?: boolean;
  /** Accanto all'originale la colonna è metà pagina: le sei colonne in riga partono da 1280px
   *  (xl) invece che da 1024 (lg). A 1280 con l'originale accanto la descrizione restava di 30px
   *  e si leggevano tre lettere («Rac», «Cav») — 25/11/2026. Le classi sono scritte per intero
   *  perché Tailwind le trovi. */
  affiancata?: boolean;
}) {
  const t = useT();
  const c = affiancata ? CLASSI_RIGA_AFFIANCATA : CLASSI_RIGA;
  const ultima = useRef<HTMLInputElement>(null);
  const aggiunta = useRef(false);
  useEffect(() => {
    if (aggiunta.current) {
      aggiunta.current = false;
      ultima.current?.focus();
    }
  }, [righe.length]);
  const aggiungi = () => {
    aggiunta.current = true;
    onChange(aggiungiRiga(righe));
  };
  const totale = importoTotale(righe);
  return (
    <fieldset className="rounded-lg border" disabled={disabled}>
      <legend className="sr-only">{t("Righe della merce")}</legend>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <p className="text-sm font-medium">{t("Merce sulla bolla")}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
          {righe.length} {righe.length === 1 ? t("riga") : t("righe")}
        </span>
        {totale != null && (
          <span className="ml-auto text-xs font-semibold tabular-nums">
            {totale.toLocaleString(intlCampo(), { style: "currency", currency: "EUR" })}
          </span>
        )}
      </div>
      {righe.length > 0 && (
        <div className={cn("hidden grid-cols-[6.5rem_minmax(0,1fr)_5rem_4rem_6rem_2rem] gap-1.5 px-2 pt-2 text-[11px] font-medium text-muted-foreground", c.intestazione)} aria-hidden="true">
          <span>{t("Codice")}</span><span>{t("Descrizione")}</span><span className="text-right">{t("Q.tà")}</span><span>UM</span><span className="text-right">{t("Prezzo €/UM")}</span><span />
        </div>
      )}
      {righe.length === 0 ? (
        <div className="space-y-2 px-3 py-4 text-sm text-muted-foreground">
          <p>{t("Nessuna riga: scrivile guardando la bolla. Il prezzo si può lasciare vuoto.")}</p>
        </div>
      ) : (
        <ol className="divide-y">
          {righe.map((r, i) => (
            <li
              key={i}
              className={cn("grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_2.25rem] gap-1.5 px-2 py-2", c.riga)}
            >
              <Input
                ref={i === righe.length - 1 ? ultima : undefined}
                aria-label={t("Descrizione riga {i}", { i: i + 1 })}
                placeholder={t("Descrizione")}
                value={r.descrizione}
                onChange={(e) => onChange(correggiRiga(righe, i, { descrizione: e.target.value }))}
                className={cn("col-span-5 h-9 text-sm", c.descrizione)}
              />
              <Input
                aria-label={t("Codice riga {i}", { i: i + 1 })}
                placeholder={t("Codice")}
                value={r.codice_articolo ?? ""}
                onChange={(e) => onChange(correggiRiga(righe, i, { codice_articolo: e.target.value || null }))}
                className={cn("h-9 font-mono text-xs", c.codice)}
              />
              <Input
                aria-label={t("Quantità riga {i}", { i: i + 1 })}
                placeholder={t("Q.tà")}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={campoNumero(r.quantita)}
                onChange={(e) => onChange(correggiRiga(righe, i, { quantita: numeroDaCampo(e.target.value) }))}
                className={cn("h-9 text-right text-sm", c.quantita)}
              />
              <Input
                aria-label={t("UM riga {i}", { i: i + 1 })}
                placeholder="UM"
                value={r.unita_misura ?? ""}
                onChange={(e) => onChange(correggiRiga(righe, i, { unita_misura: e.target.value || null }))}
                className={cn("h-9 text-sm", c.um)}
              />
              <Input
                aria-label={t("Prezzo riga {i}", { i: i + 1 })}
                placeholder={t("€/UM")}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={campoNumero(r.prezzo_unitario)}
                onChange={(e) => onChange(correggiRiga(righe, i, { prezzo_unitario: numeroDaCampo(e.target.value) }))}
                className={cn("h-9 text-right text-sm", c.prezzo)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("h-9 w-9 text-rose-600", c.togli)}
                aria-label={t("Elimina riga {i}", { i: i + 1 })}
                onClick={() => onChange(togliRiga(righe, i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t px-2 py-2">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={aggiungi}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t("Aggiungi riga")}
        </Button>
      </div>
    </fieldset>
  );
}

// ─── La spunta del magazzino ─────────────────────────────────────────────

export function SpuntaCaricoMagazzino({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", className)} title={t("Al salvataggio le righe entrano nella giacenza del magazzino di arrivo. Quelle che non possono entrare da sole restano da confermare nella pagina della bolla.")}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} aria-label={t("Carica in magazzino")} />
      {t("Carica in magazzino")}
    </label>
  );
}

// ─── La finestra ─────────────────────────────────────────────────────────

/** Da 1024 px foto e righe stanno affiancate; sotto, la foto è ridotta e si apre col tocco. */
function useSchermoLargo(): boolean {
  const domanda = "(min-width: 1024px)";
  const [largo, setLargo] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(domanda).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(domanda);
    const cambia = () => setLargo(m.matches);
    cambia();
    m.addEventListener?.("change", cambia);
    return () => m.removeEventListener?.("change", cambia);
  }, []);
  return largo;
}

export interface FinestraBollaProps {
  open: boolean;
  incorporata?: boolean;
  onOpenChange: (v: boolean) => void;
  files: ReadonlyArray<File>;
  testata: TestataBolla;
  onTestataChange: (patch: Partial<TestataBolla>) => void;
  righe: DDTRigaNuova[];
  onRigheChange: (r: DDTRigaNuova[]) => void;
  companyId: string | null | undefined;
  /** Il nome del fornitore letto sul documento, quando non è in rubrica. */
  fornitoreLetto?: string | null;
  /** Bolla di un ordine d'acquisto: fornitore e commessa vengono dall'ordine. */
  ordineAcquisto?: string | null;
  /** La commessa è decisa fuori (il cantiere scelto sul telefono): si mostra e basta. */
  commessaFissa?: string;
  mostraDestinazione?: boolean;
  carico?: { visibile: boolean; valore: boolean; onChange: (v: boolean) => void };
  conferma?: { etichetta: string; onConferma: () => void; inCorso?: boolean; bloccata?: string | null };
  /** Il bottone che chiude senza salvare. */
  etichettaChiudi?: string;
  disabled?: boolean;
  /** Cosa va guardato oltre ai problemi della testata (doppione, P.IVA diversa…). */
  avvisi?: string[];
  /** Una riga sopra la testata: «Sto leggendo la bolla…», «Letta dall'AI». */
  stato?: ReactNode;
  /** Altri campi della testata (l'ordine d'acquisto da scegliere). */
  testataExtra?: ReactNode;
  /** Le sezioni dopo le righe: trasporto, destinazione, ricevente, note. */
  children?: ReactNode;
  titolo?: string;
}

export function FinestraBollaFotoRighe(props: FinestraBollaProps) {
  const t = useT();
  const {
    open, incorporata = false, onOpenChange, files, testata, onTestataChange, righe, onRigheChange, companyId,
    fornitoreLetto, ordineAcquisto, commessaFissa, mostraDestinazione, carico, conferma,
    etichettaChiudi = "Chiudi", disabled = false, avvisi = [], stato, testataExtra, children,
    titolo = "Controlla la bolla",
  } = props;
  const conOriginale = files.length > 0;
  const largo = useSchermoLargo();
  const problemi = useMemo(() => problemiBolla({ ...testata, righe }), [testata, righe]);
  const bloccata = conferma?.bloccata ?? (problemi.length ? problemi.join(" · ") : null);
  const contenuto = (
    <>
        <div className={cn("min-h-0 flex-1", !incorporata && "overflow-y-auto",
          // L'originale prende 2/5, i dati 3/5 (25/11/2026: a metà e metà la colonna dei dati era di 300px).
          conOriginale && "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
          conOriginale && !incorporata && "lg:overflow-hidden")}>
          {conOriginale && (
            <div className={cn("border-b lg:border-b-0 lg:border-r", incorporata ? "h-72 lg:sticky lg:top-4 lg:h-[min(65dvh,42rem)]" : "h-56 lg:h-full")}>
              <VisoreBolla files={files} compatto={!largo} />
            </div>
          )}

          <div className={cn("min-w-0 space-y-3 p-3 sm:p-4", !incorporata && "lg:overflow-y-auto", !conOriginale && "mx-auto max-w-3xl")}>
            {stato}
            {/* Accanto all'originale due colonne (numero e data, poi fornitore e commessa): a quattro
                il fornitore si leggeva «N.» e la commessa «Faco…». */}
            <fieldset disabled={disabled} className={cn("grid grid-cols-2 gap-2", !conOriginale && "sm:grid-cols-4")}>
              <legend className="sr-only">{t("Testata della bolla")}</legend>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                {t("Numero")}
                <Input aria-label={t("Numero bolla")} value={testata.numero} className="h-9 text-sm text-foreground" onChange={(e) => onTestataChange({ numero: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                {t("Data")}
                <Input aria-label={t("Data bolla")} type="date" value={testata.data} className="h-9 text-sm text-foreground" onChange={(e) => onTestataChange({ data: e.target.value })} />
              </label>
              {ordineAcquisto ? (
                <p className="col-span-2 self-end rounded-md bg-muted/50 px-3 py-2 text-xs">
                  {t("Dall'ordine")} <span className="font-medium">{ordineAcquisto}</span>{t(": fornitore e commessa vengono da lì.")}
                </p>
              ) : (
                <>
                  <div className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
                    {t("Fornitore")}
                    <SupplierSelect
                      searchable
                      allowCreate={false}
                      value={testata.supplierId ?? undefined}
                      onValueChange={(v) => onTestataChange({ supplierId: v ?? null })}
                      placeholder={fornitoreLetto ? t("Non in rubrica: {fornitoreLetto}", { fornitoreLetto: String(fornitoreLetto ?? "") }) : undefined}
                      fallbackCompanyId={companyId ?? undefined}
                    />
                  </div>
                  <div className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">
                    {commessaFissa !== undefined ? t("Destinazione") : t("Commessa")}
                    {commessaFissa !== undefined ? (
                      <p className="flex h-9 items-center truncate rounded-md border bg-muted/40 px-2 text-sm text-foreground">{commessaFissa}</p>
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <OrderSelectCombobox
                            companyId={companyId ?? undefined}
                            filtroIniziale="all"
                            value={testata.orderId ?? undefined}
                            disabled={disabled}
                            placeholder={t("Facoltativa")}
                            onChange={(id) => onTestataChange({ orderId: id })}
                          />
                        </div>
                        {testata.orderId && (
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={t("Togli commessa")} onClick={() => onTestataChange({ orderId: null })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              {testataExtra}
              {mostraDestinazione && (
                <div className="col-span-full flex items-center gap-1" role="group" aria-label={t("Dove va la merce")}>
                  <span className="mr-1 text-xs font-medium text-muted-foreground">{t("Va in")}</span>
                  {(["magazzino", "cantiere"] as const).map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={testata.destinazione === d ? "secondary" : "ghost"}
                      aria-pressed={testata.destinazione === d}
                      className="h-8 text-xs"
                      onClick={() => onTestataChange({ destinazione: d })}
                    >
                      {d === "magazzino" ? t("Magazzino") : t("Cantiere")}
                    </Button>
                  ))}
                </div>
              )}
            </fieldset>

            <RigheBollaEditor righe={righe} onChange={onRigheChange} disabled={disabled} affiancata={conOriginale} />

            {children}

            {[...problemi, ...avvisi].length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {[...problemi, ...avvisi].join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4">
          {carico?.visibile && (
            <SpuntaCaricoMagazzino checked={carico.valore} onChange={carico.onChange} disabled={disabled || conferma?.inCorso} />
          )}
          <div className="ml-auto flex gap-2">
            {!incorporata && <Button type="button" variant="outline" disabled={conferma?.inCorso} onClick={() => onOpenChange(false)}>
              {etichettaChiudi}
            </Button>}
            {conferma && (
              <Button
                type="button"
                disabled={disabled || conferma.inCorso || !!bloccata}
                title={bloccata ?? undefined}
                onClick={conferma.onConferma}
              >
                {conferma.inCorso && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                {conferma.etichetta}
              </Button>
            )}
          </div>
        </div>
    </>
  );
  if (incorporata) {
    return <section aria-label={titolo} className="flex min-w-0 flex-col rounded-xl border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{titolo}</h2>
      {contenuto}
    </section>;
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!conferma?.inCorso) onOpenChange(v); }}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[94dvh] sm:max-h-[94dvh] sm:w-[96vw] sm:max-w-[1500px] sm:rounded-lg"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-2.5 pr-12">
          <DialogTitle className="text-base">{titolo}</DialogTitle>
          <DialogDescription className="text-xs">
            {conOriginale
              ? largo
                ? t("Correggi o scrivi i dati a destra guardando l’originale.")
                : t("Tocca l’originale per ingrandirlo e correggi i dati qui sotto.")
              : t("Scrivi i dati della bolla.")}
          </DialogDescription>
        </DialogHeader>
        {contenuto}
      </DialogContent>
    </Dialog>
  );
}

/** Una sezione compatta della finestra: titolo piccolo, campi in griglia. */
export function SezioneBolla({ titolo, children, className }: { titolo: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border p-3", className)} aria-label={titolo}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</h3>
      {children}
    </section>
  );
}
