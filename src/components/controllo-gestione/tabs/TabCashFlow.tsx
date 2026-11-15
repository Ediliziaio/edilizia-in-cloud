/**
 * Scheda Cash Flow del Controllo di gestione: il RENDICONTO DI CASSA in una sola tabella.
 *
 * Colonne: i 12 mesi dell'anno + totale. Mesi passati = consuntivo (prima nota), mese in corso =
 * registrato fino a oggi + previsto, mesi futuri = previsione (stesso motore e stesse ipotesi
 * della pagina Previsionale). Righe a gruppi: saldo iniziale, incassi, uscite della gestione,
 * flusso operativo, investimenti, finanziamenti, flusso netto, saldo finale.
 * Un clic su un importo apre i movimenti che lo compongono.
 *
 * Dal 15/11/2026 la tabella si legge per le CATEGORIE del catalogo dell'azienda
 * (lo standard dell'Excel, modificabile in Configurazione e in Tesoreria):
 * area → categoria → voce. La vista «Riassunto» mostra le righe di prima.
 */
import { useDialogFocusReturn } from "@/hooks/useDialogFocusReturn";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Plus, Tags } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { CashFlowManualiEditor } from "@/components/controllo-gestione/CashFlowManualiEditor";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";
import { useRendicontoCassa } from "@/hooks/controlloGestione/useRendicontoCassa";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { ClassificaMovimentiDialog } from "@/components/controllo-gestione/ClassificaMovimentiDialog";
import { GraficiCassa } from "@/components/controllo-gestione/cashflow/GraficiCassa";
import { cn } from "@/lib/utils";
import {
  costruisciRendiconto,
  dettagliCella,
  etichettaVoce,
  righeEsportazione,
  vociDelGruppo,
  type DettaglioCella,
  type IpotesiRendiconto,
  type RendicontoCassa,
  type TipoColonna,
} from "@/lib/controlloGestione/rendicontoCassa";
import { GRUPPI_CASSA, VOCE_PER_CHIAVE, type GruppoCassa, type VoceCassa } from "@/lib/controlloGestione/vociCassa";
import { qualitaClassificazione, righeEsportazioneCategorie, totaliPerChiave, vistaPerCategorie, type AreaCassa } from "@/lib/controlloGestione/rendicontoCategorie";
import { useCatalogoCassa } from "@/lib/finance/cassaVoci";

interface Props {
  anno: number;
}

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const ETICHETTA_COLONNA: Record<TipoColonna, string> = {
  consuntivo: "Consuntivo",
  "in-corso": "In corso",
  previsione: "Previsione",
};
const SFONDO_COLONNA: Record<TipoColonna, string> = {
  consuntivo: "",
  "in-corso": "bg-amber-50/70",
  previsione: "bg-sky-50/70",
};

/** Stessa soglia di attenzione della pagina Previsionale (salvata su questo dispositivo). */
const SOGLIA_PREDEFINITA = 500000;
function sogliaSalvata(companyId: string | null | undefined): number {
  if (!companyId) return SOGLIA_PREDEFINITA;
  try {
    const v = localStorage.getItem(`forecast-threshold-v1:${companyId}`);
    if (v != null && Number(v) >= 0) return Number(v);
  } catch {
    /* preferenza facoltativa */
  }
  return SOGLIA_PREDEFINITA;
}

const euro = (cents: number | null | undefined) => (cents == null ? "—" : euroIntero(cents / 100));
const data = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT");

/** Cosa mostra il pannello laterale. */
interface Selezione {
  titolo: string;
  voci: VoceCassa[];
  mese: number | null;
  /** Vista per categorie: i movimenti della riga, già scelti (si filtrano per mese). */
  righe?: DettaglioCella[];
  daClassificare?: boolean;
}

type Vista = "categorie" | "riassunto";
const CHIAVE_VISTA = "eic:cashflow-vista:v1";
function vistaSalvata(): Vista {
  try {
    return localStorage.getItem(CHIAVE_VISTA) === "riassunto" ? "riassunto" : "categorie";
  } catch {
    return "categorie";
  }
}

export function TabCashFlow({ anno }: Props) {
  const q = useRendicontoCassa(anno);
  // L'anno prima, solo per il confronto nella vista per categorie (consuntivo, già in cache se aperto).
  const qPrima = useRendicontoCassa(anno - 1);
  const companyId = useEffectiveCompanyId();
  const isMobile = useIsMobile();
  const [ipotesi, setIpotesi] = useState<IpotesiRendiconto>({
    includeOverdueIncome: false,
    includeOverdueExpense: false,
    includeEstimates: true,
  });
  const [chiusi, setChiusi] = useState<Set<GruppoCassa>>(() => new Set());
  const [selezione, setSelezione] = useState<Selezione | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [classifica, setClassifica] = useState(false);
  const [vista, setVistaStato] = useState<Vista>(vistaSalvata);
  const [aree, setAreeChiuse] = useState<Set<string>>(() => new Set());
  const setVista = (v: Vista) => {
    setVistaStato(v);
    try { localStorage.setItem(CHIAVE_VISTA, v); } catch { /* preferenza facoltativa */ }
  };
  const catalogo = useCatalogoCassa(companyId);
  const permessi = usePermissions();
  const soglia = useMemo(() => sogliaSalvata(companyId), [companyId]);

  const r = useMemo<RendicontoCassa | null>(() => {
    if (!q.data) return null;
    return costruisciRendiconto({
      anno,
      today: q.data.today,
      saldoOggiCents: q.data.saldoOggiCents,
      saldoFonte: q.data.saldoFonte,
      saldoAggiornatoAl: q.data.saldoAggiornatoAl,
      registrati: q.data.registrati,
      flussoDopoAnnoCents: q.data.flussoDopoAnnoCents,
      previsti: q.data.previsti,
      manuali: q.data.manuali,
      mutui: q.data.mutui,
      ipotesi,
      sogliaCents: soglia,
    });
  }, [q.data, anno, ipotesi, soglia]);
  const perCategorie = useMemo<AreaCassa[] | null>(
    () => (r && catalogo.data?.length ? vistaPerCategorie(r, catalogo.data) : null),
    [r, catalogo.data],
  );
  const confronto = useMemo(() => {
    if (!qPrima.data || !catalogo.data?.length) return null;
    const rp = costruisciRendiconto({
      anno: anno - 1,
      today: qPrima.data.today,
      saldoOggiCents: qPrima.data.saldoOggiCents,
      saldoFonte: qPrima.data.saldoFonte,
      registrati: qPrima.data.registrati,
      flussoDopoAnnoCents: qPrima.data.flussoDopoAnnoCents,
      previsti: null,
      ipotesi,
      sogliaCents: soglia,
    });
    // Un anno senza movimenti non è un confronto: colonna nascosta.
    if (!rp.dettagli.size) return null;
    return { anno: anno - 1, totali: totaliPerChiave(vistaPerCategorie(rp, catalogo.data)), netto: rp.flussoNetto.reduce((x, c) => x + c, 0) };
  }, [qPrima.data, catalogo.data, anno, ipotesi, soglia]);
  const qualita = useMemo(() => (r ? qualitaClassificazione(r) : null), [r]);
  // Senza catalogo (non ancora letto o non disponibile) resta il riassunto.
  const vistaAttiva: Vista = vista === "categorie" && perCategorie ? "categorie" : "riassunto";

  if (q.isLoading)
    return (
      <div className="space-y-3" aria-label="Caricamento del rendiconto di cassa">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  if (q.isError)
    return (
      <div className="space-y-2">
        <ErrorBlock onRetry={() => q.refetch()} />
        <p className="text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "Riprova tra poco."}
        </p>
      </div>
    );
  if (!r || !q.data) return null;

  const haPrevisione = r.colonne.some((c) => c.tipo !== "consuntivo");
  const linkPrevisionale = (() => {
    const p = new URLSearchParams();
    if (ipotesi.includeOverdueIncome) p.set("incassi-scaduti", "1");
    if (ipotesi.includeOverdueExpense) p.set("uscite-scadute", "1");
    if (!ipotesi.includeEstimates) p.set("stime", "0");
    const s = p.toString();
    return `/azienda/previsionale${s ? `?${s}` : ""}`;
  })();
  const apri = (titolo: string, voci: VoceCassa[], mese: number | null) => setSelezione({ titolo, voci, mese });
  const apriRighe = (titolo: string, righe: DettaglioCella[], mese: number | null, daClassificare = false) =>
    setSelezione({ titolo, voci: [], mese, righe, daClassificare });
  const toggleArea = (k: string) =>
    setAreeChiuse((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleGruppo = (g: GruppoCassa) =>
    setChiusi((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const esporta = async () => {
    const righe = vistaAttiva === "categorie" && perCategorie ? righeEsportazioneCategorie(r, perCategorie) : righeEsportazione(r);
    await exportXlsx({
      filename: `rendiconto_cassa_${anno}.xlsx`,
      brand: { title: "Rendiconto di cassa", subtitle: `Anno ${anno} · importi in euro` },
      sheets: [
        {
          name: `Cassa ${anno}`,
          columns: [
            { header: vistaAttiva === "categorie" ? "Categoria" : "Voce", key: "voce", width: 46 },
            ...r.colonne.map((c) => ({
              header: `${MESI[c.mese - 1]} (${ETICHETTA_COLONNA[c.tipo]})`,
              key: `m${c.mese}`,
              width: 16,
              type: "number" as const,
            })),
            { header: `Totale ${anno}`, key: "totale", width: 16, type: "number" as const },
          ],
          rows: righe.map((riga) => ({
            voce: riga.voce,
            ...Object.fromEntries(riga.valori.map((v, i) => [`m${i + 1}`, v])),
            totale: riga.totale,
          })),
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      {q.data.fontiNonLette.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Non è stato possibile leggere: {q.data.fontiNonLette.join(", ")}. I numeri riguardano solo il resto.
        </p>
      )}

      <Riquadri r={r} haPrevisione={haPrevisione} dopo={q.data.saldoDopoMovimenti ? { cents: q.data.saldoDopoCents ?? 0, n: q.data.saldoDopoMovimenti, banca: q.data.saldoBancaCents ?? null } : null} />

      <GraficiCassa r={r} onApriMese={(mese) => apri(`Movimenti di ${MESI_LUNGHI[mese - 1]} ${r.anno}`, r.vociVisibili, mese)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {haPrevisione ? (
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <legend className="sr-only">Ipotesi della previsione</legend>
            <Interruttore
              id="cf-incassi-scaduti"
              label="Includi incassi scaduti"
              checked={ipotesi.includeOverdueIncome}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeOverdueIncome: v }))}
            />
            <Interruttore
              id="cf-uscite-scadute"
              label="Includi uscite scadute"
              checked={ipotesi.includeOverdueExpense}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeOverdueExpense: v }))}
            />
            <Interruttore
              id="cf-stime"
              label="Includi stime"
              checked={ipotesi.includeEstimates}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeEstimates: v }))}
            />
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">Il {anno} è chiuso: tutti i mesi sono a consuntivo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {perCategorie && !isMobile && (
            <div role="group" aria-label="Come leggere la tabella" className="inline-flex rounded-md border p-0.5">
              {([["categorie", "Per categorie"], ["riassunto", "Riassunto"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={vistaAttiva === k}
                  onClick={() => setVista(k)}
                  className={cn("rounded px-2.5 py-1 text-xs font-medium", vistaAttiva === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {companyId && permessi.canViewTesoreria && (
            <Button
              size="sm"
              variant={r.nonClassificati.numero ? "default" : "outline"}
              onClick={() => setClassifica(true)}
              title="Assegna le categorie ai movimenti di banca"
            >
              <Tags className="mr-2 h-4 w-4" />
              Classifica movimenti
              {r.nonClassificati.numero > 0 && (
                <span className="ml-2 rounded-full bg-background/20 px-1.5 text-xs tabular-nums">{r.nonClassificati.numero}</span>
              )}
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to={linkPrevisionale}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Apri il previsionale completo
            </Link>
          </Button>
          <span className="max-sm:hidden">
            <ExportButton onExport={esporta} />
          </span>
          {haPrevisione && (
            <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)} className="max-sm:hidden">
              <Plus className="mr-2 h-4 w-4" />
              Voci manuali
            </Button>
          )}
        </div>
      </div>

      <Avvisi r={r} daBanca={q.data.daBanca} bancaForseDoppi={q.data.bancaForseDoppi} onClassifica={permessi.canViewTesoreria ? () => setClassifica(true) : undefined} />

      {isMobile ? (
        <VistaMese r={r} onApri={apri} />
      ) : vistaAttiva === "categorie" && perCategorie ? (
        <>
          {qualita && qualita.totale > 0 && (
            <QualitaClassificazione q={qualita} onClassifica={permessi.canViewTesoreria && companyId ? () => setClassifica(true) : undefined} />
          )}
          <TabellaCategorie r={r} aree={perCategorie} chiuse={aree} onToggle={toggleArea} onApri={apriRighe} confronto={confronto} />
        </>
      ) : (
        <TabellaRendiconto r={r} chiusi={chiusi} onToggle={toggleGruppo} onApri={apri} />
      )}

      <DettaglioSheet
        r={r}
        selezione={selezione}
        onClose={() => setSelezione(null)}
        onClassifica={permessi.canViewTesoreria ? () => { setSelezione(null); setClassifica(true); } : undefined}
      />
      {classifica && companyId && (
        <ClassificaMovimentiDialog
          open={classifica}
          onOpenChange={setClassifica}
          company={companyId}
          anno={anno}
          puoModificare={permessi.canReconcileBankTransactions}
        />
      )}
      {haPrevisione && <CashFlowManualiEditor open={editorOpen} onOpenChange={setEditorOpen} anno={anno} />}
    </div>
  );
}

function Interruttore({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

// ── Riquadri ────────────────────────────────────────────────────────────────

function Riquadri({ r, haPrevisione, dopo }: { r: RendicontoCassa; haPrevisione: boolean; dopo: { cents: number; n: number; banca: number | null } | null }) {
  const { kpi, saldo } = r;
  const fonte =
    saldo.fonte === "banca"
      ? dopo && saldo.aggiornatoAl
        // 15/11/2026: il saldo dei conti è vecchio: si dice da dove viene il numero di oggi.
        ? `Conti al ${data(saldo.aggiornatoAl.slice(0, 10))} ${euro(dopo.banca)} ${dopo.cents >= 0 ? "+" : "−"} ${euro(Math.abs(dopo.cents))} registrati dopo (${dopo.n})`
        : `Conti in Tesoreria${saldo.aggiornatoAl ? ` · al ${data(saldo.aggiornatoAl.slice(0, 10))}` : ""}`
      : saldo.fonte === "prima-nota"
        ? "Dalla prima nota (nessun conto)"
        : "Manca il saldo dei conti";
  const sottoSoglia = kpi.minimo != null && kpi.minimo.cents < r.sogliaCents;
  return (
    <div className="grid grid-cols-2 gap-3 max-sm:gap-2 lg:grid-cols-4">
      <Riquadro label="Saldo di cassa oggi" value={euro(kpi.saldoOggi)} sub={fonte} />
      <Riquadro
        label={`Flusso operativo ${r.anno}`}
        value={euro(kpi.flussoOperativoAnno)}
        sub="Incassi meno uscite della gestione"
        tone={kpi.flussoOperativoAnno < 0 ? "red" : "neutral"}
      />
      <Riquadro
        label={haPrevisione ? "Punto più basso previsto" : "Saldo più basso a fine mese"}
        value={kpi.minimo ? euro(kpi.minimo.cents) : "—"}
        sub={kpi.minimo ? `${kpi.minimo.giornaliero ? "il" : "a fine"} ${kpi.minimo.giornaliero ? data(kpi.minimo.data) : MESI_LUNGHI[Number(kpi.minimo.data.slice(5, 7)) - 1]}${sottoSoglia ? ` · sotto la soglia di ${euro(r.sogliaCents)}` : ""}` : "Saldo non disponibile"}
        tone={kpi.minimo && kpi.minimo.cents < 0 ? "red" : sottoSoglia ? "amber" : "neutral"}
      />
      <Riquadro
        label={haPrevisione ? `Saldo previsto a fine ${r.anno}` : `Saldo a fine ${r.anno}`}
        value={euro(kpi.saldoFineAnno)}
        sub={saldo.ricostruito && !haPrevisione ? "Ricostruito dal saldo di oggi" : undefined}
        tone={kpi.saldoFineAnno != null && kpi.saldoFineAnno < 0 ? "red" : "neutral"}
      />
    </div>
  );
}

function Riquadro({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "red" | "amber" }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3 sm:p-4",
        tone === "red" ? "border-rose-200 bg-rose-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "bg-card",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words text-lg font-bold tabular-nums sm:text-xl", tone === "red" && "text-rose-700")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Avvisi ──────────────────────────────────────────────────────────────────

function Avvisi({ r, daBanca, bancaForseDoppi, onClassifica }: {
  r: RendicontoCassa;
  daBanca?: number;
  bancaForseDoppi?: { numero: number; cents: number };
  onClassifica?: () => void;
}) {
  const righe: { chiave: string; testo: ReactNode }[] = [];
  if (r.saldo.avviso) righe.push({ chiave: "saldo", testo: r.saldo.avviso });
  else if (r.saldo.ricostruito)
    righe.push({
      chiave: "ricostruito",
      testo:
        "Il saldo dei mesi passati è ricostruito all'indietro: saldo dei conti di oggi meno i movimenti registrati in prima nota dopo quella data. Se in prima nota manca qualche movimento di banca, è un valore indicativo.",
    });
  const e = r.esclusi;
  if (e.incassiScaduti.numero)
    righe.push({ chiave: "inc", testo: <>{e.incassiScaduti.numero} incassi già scaduti per {euro(e.incassiScaduti.cents)} sono fuori dalla previsione: li conti solo se accendi «Includi incassi scaduti».</> });
  if (e.usciteScadute.numero)
    righe.push({ chiave: "usc", testo: <>{e.usciteScadute.numero} pagamenti scaduti e non segnati pagati per {euro(-e.usciteScadute.cents)}: spesso sono già pagati, controllali nel <Link className="font-medium underline" to="/azienda/previsionale?uscite-scadute=1">Previsionale</Link>.</> });
  if (e.stime.numero)
    righe.push({ chiave: "stime", testo: <>{e.stime.numero} stime (netto {euro(e.stime.cents)}) sono fuori perché hai spento «Includi stime».</> });
  if (e.senzaData.numero)
    righe.push({ chiave: "data", testo: <>{e.senzaData.numero} movimenti senza data (netto {euro(e.senzaData.cents)}): mettigli una data per vederli nel mese giusto.</> });
  if (e.forseDoppi.numero)
    righe.push({ chiave: "doppi", testo: <>{e.forseDoppi.numero} incassi forse già compresi nelle rate (netto {euro(e.forseDoppi.cents)}) restano fuori: collegali alla rata giusta.</> });
  if (r.nonClassificati.numero)
    righe.push({
      chiave: "nc",
      testo: (
        <>
          {r.nonClassificati.numero} movimenti senza categoria ({euro(r.nonClassificati.cents)}) sono nelle righe «Da classificare»: contano nel saldo e nei totali, ma non in una categoria.{" "}
          {onClassifica ? (
            <button type="button" className="font-medium underline" onClick={onClassifica}>Classificali</button>
          ) : (
            <Link className="font-medium underline" to="/azienda/prima-nota">Dagli una categoria in Prima nota</Link>
          )}.
        </>
      ),
    });
  if (daBanca)
    righe.push({ chiave: "banca", testo: `${daBanca} movimenti di banca non ancora registrati in prima nota sono contati nel consuntivo: sono soldi già passati dal conto.` });
  if (bancaForseDoppi?.numero)
    righe.push({ chiave: "banca-doppi", testo: <>{bancaForseDoppi.numero} movimenti di banca (netto {euro(bancaForseDoppi.cents)}) hanno una scrittura di prima nota con lo stesso importo, nello stesso verso e a pochi giorni, non collegata: conto solo quella. Collegale in Tesoreria per toglierle da qui.</> });
  if (r.registratiScartati)
    righe.push({ chiave: "scartati", testo: `${r.registratiScartati} movimenti di prima nota con importo o data da verificare non sono contati.` });
  if (r.registratiFuturi)
    righe.push({ chiave: "futuri", testo: `${r.registratiFuturi} movimenti di prima nota con data futura non sono contati come registrati.` });
  if (r.mutuiGiaPrevisti)
    righe.push({ chiave: "mutui", testo: "Le rate dei mutui sembrano già tra le spese previste: non le aggiungo una seconda volta." });
  if (!righe.length) return null;
  return (
    <details className="rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-medium">Come leggere i numeri ({righe.length})</summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
        {righe.map((x) => <li key={x.chiave}>{x.testo}</li>)}
      </ul>
    </details>
  );
}

// ── Tabella (da scrivania) ──────────────────────────────────────────────────

function TabellaRendiconto({ r, chiusi, onToggle, onApri }: {
  r: RendicontoCassa;
  chiusi: Set<GruppoCassa>;
  onToggle: (g: GruppoCassa) => void;
  onApri: (titolo: string, voci: VoceCassa[], mese: number | null) => void;
}) {
  const totale = (a: number[]) => a.reduce((s, c) => s + c, 0);
  const cellaImporto = (cents: number, label: string, onClick?: () => void) => (
    <span className={cn("tabular-nums", cents < 0 && "text-rose-700")}>
      {cents === 0 ? <span className="text-muted-foreground">—</span> : onClick ? (
        <button type="button" aria-label={`Apri il dettaglio di ${label}: ${euro(cents)}`} onClick={onClick} className="rounded px-0.5 hover:bg-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {euro(cents)}
        </button>
      ) : euro(cents)}
    </span>
  );
  const td = (tipo: TipoColonna, extra?: string) => cn("whitespace-nowrap px-2 py-1.5 text-right text-xs", SFONDO_COLONNA[tipo], extra);
  const prima = "sticky left-0 z-10 min-w-[220px] max-w-[280px] px-3 py-1.5 text-left";

  const rigaImporti = (label: string, valori: number[], voci: VoceCassa[], classe: string, primaClasse: string, forte = false) => (
    <tr className={cn("border-t", classe)}>
      <th scope="row" className={cn(prima, "font-normal", primaClasse)}>{label}</th>
      {r.colonne.map((c, i) => (
        <td key={c.mese} className={td(c.tipo, forte ? "font-semibold" : undefined)}>
          {cellaImporto(valori[i], `${label} · ${MESI_LUNGHI[c.mese - 1]} ${r.anno}`, voci.length ? () => onApri(`${label} · ${MESI_LUNGHI[c.mese - 1]} ${r.anno}`, voci, c.mese) : undefined)}
        </td>
      ))}
      <td className="whitespace-nowrap bg-muted/50 px-2 py-1.5 text-right text-xs font-semibold">
        {cellaImporto(totale(valori), `${label} · ${r.anno}`, voci.length ? () => onApri(`${label} · ${r.anno}`, voci, null) : undefined)}
      </td>
    </tr>
  );
  const rigaSaldo = (label: string, valori: (number | null)[], totaleAnno: number | null, fine = false) => (
    <tr className={cn(fine ? "border-t-2 border-foreground/30 font-bold" : "border-t font-semibold", "bg-muted/40")}>
      <th scope="row" className={cn(prima, "bg-muted")}>{label}</th>
      {r.colonne.map((c, i) => {
        const v = valori[i];
        return (
          <td
            key={c.mese}
            className={cn(
              td(c.tipo),
              v != null && v < 0 ? "bg-rose-100 text-rose-800" : v != null && fine && v < r.sogliaCents ? "bg-amber-100 text-amber-900" : "",
            )}
            title={v == null ? r.saldo.avviso ?? undefined : undefined}
          >
            <span className="tabular-nums">{euro(v)}</span>
          </td>
        );
      })}
      <td className={cn("whitespace-nowrap bg-muted px-2 py-1.5 text-right text-xs tabular-nums", totaleAnno != null && totaleAnno < 0 && "text-rose-700")}>
        {euro(totaleAnno)}
      </td>
    </tr>
  );

  return (
    <div className="max-w-full overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Rendiconto di cassa {r.anno}: saldo, incassi, uscite, investimenti e finanziamenti per mese</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(prima, "z-20 bg-card py-2 text-xs font-medium text-muted-foreground")}>
              Importi in euro, IVA compresa
            </th>
            {r.colonne.map((c) => (
              <th key={c.mese} scope="col" className={cn("min-w-[96px] px-2 py-2 text-right text-xs font-semibold", SFONDO_COLONNA[c.tipo])}>
                <span className="block">{MESI[c.mese - 1]}</span>
                <span className={cn("block text-[10px] font-normal", c.tipo === "consuntivo" ? "text-muted-foreground" : c.tipo === "in-corso" ? "text-amber-800" : "text-sky-800")}>
                  {ETICHETTA_COLONNA[c.tipo]}
                </span>
              </th>
            ))}
            <th scope="col" className="min-w-[108px] bg-muted/50 px-2 py-2 text-right text-xs font-semibold">Totale {r.anno}</th>
          </tr>
        </thead>
        <tbody>
          {rigaSaldo("Saldo di cassa a inizio mese", r.saldoInizio, r.saldoInizio[0])}
          {GRUPPI_CASSA.map((g) => {
            const aperto = !chiusi.has(g.key);
            const voci = r.vociVisibili.filter((v) => VOCE_PER_CHIAVE.get(v)?.gruppo === g.key);
            return (
              <Fragment key={g.key}>
                <tr className="border-t bg-muted/20">
                  <th scope="rowgroup" colSpan={r.colonne.length + 2} className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => onToggle(g.key)}
                      aria-expanded={aperto}
                      className="sticky left-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground/80 hover:text-foreground"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !aperto && "-rotate-90")} aria-hidden />
                      {g.label}
                    </button>
                  </th>
                </tr>
                {aperto &&
                  voci.map((v) => (
                    <Fragment key={v}>
                      {VOCE_PER_CHIAVE.get(v)?.daClassificare
                        ? rigaImporti(`⚠ ${etichettaVoce(v)}`, r.righe[v], [v], "bg-amber-50/80 dark:bg-amber-950/40", "bg-amber-50 pl-7 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200")
                        : rigaImporti(etichettaVoce(v), r.righe[v], [v], "", "bg-card pl-7")}
                    </Fragment>
                  ))}
                {rigaImporti(g.totale, r.gruppi[g.key], vociDelGruppo(g.key), "bg-muted/30", "bg-muted font-semibold", true)}
                {g.key === "uscite" &&
                  rigaImporti(
                    "Flusso della gestione operativa",
                    r.flussoOperativo,
                    [...vociDelGruppo("incassi"), ...vociDelGruppo("uscite")],
                    "border-t-2 bg-primary/5",
                    "bg-muted font-bold",
                    true,
                  )}
              </Fragment>
            );
          })}
          {rigaImporti(
            "Flusso netto del mese",
            r.flussoNetto,
            GRUPPI_CASSA.flatMap((g) => vociDelGruppo(g.key)),
            "border-t-2 bg-primary/5",
            "bg-muted font-bold",
            true,
          )}
          {rigaSaldo("Saldo di cassa a fine mese", r.saldoFine, r.saldoFine[11], true)}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabella per categorie del catalogo ──────────────────────────────────────

/** Quanto del consuntivo ha una voce precisa, quanto è stimato dalla prima nota, quanto è da classificare. */
function QualitaClassificazione({ q, onClassifica }: { q: { precisa: number; stimata: number; daClassificare: number; totale: number }; onClassifica?: () => void }) {
  const pct = (x: number) => Math.round((x / q.totale) * 100);
  const parti = [
    { k: "precisa", label: "con voce precisa", v: q.precisa, classe: "bg-emerald-500" },
    { k: "stimata", label: "stimato dalla prima nota", v: q.stimata, classe: "bg-sky-400" },
    { k: "da", label: "da classificare", v: q.daClassificare, classe: "bg-amber-400" },
  ];
  return (
    <section aria-label="Qualità della classificazione del consuntivo" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-3 py-2 text-xs">
      <span className="font-medium">Consuntivo classificato</span>
      <div className="flex h-2 w-40 overflow-hidden rounded-full bg-muted" role="img" aria-label={parti.map((p) => `${pct(p.v)}% ${p.label}`).join(", ")}>
        {parti.map((p) => p.v > 0 && <span key={p.k} className={p.classe} style={{ width: `${(p.v / q.totale) * 100}%` }} />)}
      </div>
      {parti.map((p) => (
        <span key={p.k} className="inline-flex items-center gap-1 text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", p.classe)} aria-hidden />
          <strong className="tabular-nums text-foreground">{pct(p.v)}%</strong> {p.label}
        </span>
      ))}
      {onClassifica && q.daClassificare + q.stimata > 0 && (
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onClassifica}>
          <Tags className="mr-1 h-3.5 w-3.5" /> Migliora la classificazione
        </Button>
      )}
    </section>
  );
}

function TabellaCategorie({ r, aree, chiuse, onToggle, onApri, confronto = null }: {
  r: RendicontoCassa;
  aree: AreaCassa[];
  chiuse: Set<string>;
  onToggle: (chiave: string) => void;
  onApri: (titolo: string, righe: DettaglioCella[], mese: number | null, daClassificare?: boolean) => void;
  /** Totali dell'anno prima per categoria (chiave) e area (`area:chiave`). */
  confronto?: { anno: number; totali: Map<string, number>; netto: number } | null;
}) {
  const extra = confronto ? 2 : 0;
  const colonneConfronto = (attuale: number, prima: number | null | undefined, forte = false) => {
    if (!confronto) return null;
    const p = prima ?? 0;
    const variazione = p === 0 ? null : Math.round(((Math.abs(attuale) - Math.abs(p)) / Math.abs(p)) * 100);
    return (
      <>
        <td className={cn("whitespace-nowrap border-l px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground", forte && "font-semibold", p < 0 && "text-rose-700/80")}>
          {p === 0 ? "—" : euro(p)}
        </td>
        <td
          className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground"
          title="Variazione dell'importo (in valore assoluto) rispetto all'anno prima"
        >
          {variazione == null ? (attuale === 0 ? "—" : "nuova") : `${variazione > 0 ? "+" : ""}${variazione}%`}
        </td>
      </>
    );
  };
  const [aperte, setAperte] = useState<Set<string>>(() => new Set());
  const totale = (a: number[]) => a.reduce((s, c) => s + c, 0);
  const td = (tipo: TipoColonna, extra?: string) => cn("whitespace-nowrap px-2 py-1.5 text-right text-xs", SFONDO_COLONNA[tipo], extra);
  const prima = "sticky left-0 z-10 min-w-[240px] max-w-[300px] px-3 py-1.5 text-left";
  const importo = (cents: number, label: string, righe: DettaglioCella[], mese: number | null, daClassificare: boolean) => (
    <span className={cn("tabular-nums", cents < 0 && "text-rose-700")}>
      {cents === 0 && !righe.some((d) => mese == null || Number(d.data.slice(5, 7)) === mese) ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <button
          type="button"
          aria-label={`Apri il dettaglio di ${label}: ${euro(cents)}`}
          onClick={() => onApri(label, righe, mese, daClassificare)}
          className="rounded px-0.5 hover:bg-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {euro(cents)}
        </button>
      )}
    </span>
  );
  const celle = (nome: string, valori: number[], righe: DettaglioCella[], daClassificare: boolean, forte = false, prima?: number | null | false) => (
    <>
      {r.colonne.map((c, i) => (
        <td key={c.mese} className={td(c.tipo, forte ? "font-semibold" : undefined)}>
          {importo(valori[i], `${nome} · ${MESI_LUNGHI[c.mese - 1]} ${r.anno}`, righe, c.mese, daClassificare)}
        </td>
      ))}
      <td className="whitespace-nowrap bg-muted/50 px-2 py-1.5 text-right text-xs font-semibold">
        {importo(totale(valori), `${nome} · ${r.anno}`, righe, null, daClassificare)}
      </td>
      {confronto && (prima === false ? <><td className="border-l" /><td /></> : colonneConfronto(totale(valori), prima, forte))}
    </>
  );
  const saldo = (label: string, valori: (number | null)[], totaleAnno: number | null, fine = false) => (
    <tr className={cn(fine ? "border-t-2 border-foreground/30 font-bold" : "border-t font-semibold", "bg-muted/40")}>
      <th scope="row" className={cn(prima, "bg-muted")}>{label}</th>
      {r.colonne.map((c, i) => {
        const v = valori[i];
        return (
          <td
            key={c.mese}
            className={cn(td(c.tipo), v != null && v < 0 ? "bg-rose-100 text-rose-800" : v != null && fine && v < r.sogliaCents ? "bg-amber-100 text-amber-900" : "")}
            title={v == null ? r.saldo.avviso ?? undefined : undefined}
          >
            <span className="tabular-nums">{euro(v)}</span>
          </td>
        );
      })}
      <td className={cn("whitespace-nowrap bg-muted px-2 py-1.5 text-right text-xs tabular-nums", totaleAnno != null && totaleAnno < 0 && "text-rose-700")}>{euro(totaleAnno)}</td>
      {confronto && <><td className="border-l bg-muted/40" /><td className="bg-muted/40" /></>}
    </tr>
  );
  const tutte = aree.flatMap((a) => a.categorie.flatMap((c) => c.dettagli));

  return (
    <div className="max-w-full overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Cash flow {r.anno} per area, categoria e voce, mese per mese</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(prima, "z-20 bg-card py-2 text-xs font-medium text-muted-foreground")}>Categorie · euro, IVA compresa</th>
            {r.colonne.map((c) => (
              <th key={c.mese} scope="col" className={cn("min-w-[96px] px-2 py-2 text-right text-xs font-semibold", SFONDO_COLONNA[c.tipo])}>
                <span className="block">{MESI[c.mese - 1]}</span>
                <span className={cn("block text-[10px] font-normal", c.tipo === "consuntivo" ? "text-muted-foreground" : c.tipo === "in-corso" ? "text-amber-800" : "text-sky-800")}>
                  {ETICHETTA_COLONNA[c.tipo]}
                </span>
              </th>
            ))}
            <th scope="col" className="min-w-[108px] bg-muted/50 px-2 py-2 text-right text-xs font-semibold">Totale {r.anno}</th>
            {confronto && (
              <>
                <th scope="col" className="min-w-[100px] border-l px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Totale {confronto.anno}</th>
                <th scope="col" className="min-w-[72px] px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Variazione</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {saldo("Saldo di cassa a inizio mese", r.saldoInizio, r.saldoInizio[0])}
          {aree.map((a) => {
            const aperta = !chiuse.has(a.chiave);
            return (
              <Fragment key={a.chiave}>
                <tr className="border-t bg-muted/20">
                  <th scope="rowgroup" colSpan={r.colonne.length + 2 + extra} className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => onToggle(a.chiave)}
                      aria-expanded={aperta}
                      className="sticky left-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground/80 hover:text-foreground"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !aperta && "-rotate-90")} aria-hidden />
                      {a.nome}
                    </button>
                  </th>
                </tr>
                {aperta &&
                  a.categorie.map((c) => {
                    const dettagliabile = c.voci.length > 1 || !!c.voci[0]?.codice;
                    const espansa = aperte.has(c.chiave);
                    return (
                      <Fragment key={c.chiave}>
                        <tr className={cn("border-t", c.daClassificare && "bg-amber-50/80 dark:bg-amber-950/40")}>
                          <th scope="row" className={cn(prima, "font-normal", c.daClassificare ? "bg-amber-50 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-card")}>
                            <span className="flex items-center gap-1.5 pl-3">
                              {dettagliabile ? (
                                <button
                                  type="button"
                                  aria-expanded={espansa}
                                  aria-label={`${espansa ? "Chiudi" : "Apri"} le voci di ${c.nome}`}
                                  onClick={() => setAperte((p) => { const n = new Set(p); if (n.has(c.chiave)) n.delete(c.chiave); else n.add(c.chiave); return n; })}
                                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", espansa && "rotate-90")} aria-hidden />
                                </button>
                              ) : (
                                <span className="w-[18px]" aria-hidden />
                              )}
                              {c.codice && <span className="w-6 shrink-0 font-mono text-[10px] text-muted-foreground">{c.codice}</span>}
                              <span className="truncate" title={c.nome}>{c.daClassificare ? `⚠ ${c.nome}` : c.nome}</span>
                            </span>
                          </th>
                          {celle(c.nome, c.valori, c.dettagli, c.daClassificare, false, confronto?.totali.get(c.chiave))}
                        </tr>
                        {espansa &&
                          c.voci.map((v) => (
                            <tr key={v.chiave} className="border-t border-dashed text-muted-foreground">
                              <th scope="row" className={cn(prima, "bg-card pl-14 text-xs font-normal")}>
                                <span className="flex items-center gap-1.5">
                                  {v.codice && <span className="shrink-0 font-mono text-[10px]">{v.codice}</span>}
                                  <span className={cn("truncate", !v.codice && "italic")} title={v.nome}>{v.nome}</span>
                                </span>
                              </th>
                              {celle(`${c.nome} · ${v.nome}`, v.valori, v.dettagli, c.daClassificare, false, false)}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                <tr className="border-t bg-muted/30">
                  <th scope="row" className={cn(prima, "bg-muted font-semibold")}>Totale {a.nome.toLocaleLowerCase("it-IT")}</th>
                  {celle(`Totale ${a.nome}`, a.valori, a.categorie.flatMap((c) => c.dettagli), false, true, confronto?.totali.get(`area:${a.chiave}`))}
                </tr>
              </Fragment>
            );
          })}
          <tr className="border-t-2 bg-primary/5">
            <th scope="row" className={cn(prima, "bg-muted font-bold")}>Flusso netto del mese</th>
            {celle("Flusso netto del mese", r.flussoNetto, tutte, false, true, confronto?.netto)}
          </tr>
          {saldo("Saldo di cassa a fine mese", r.saldoFine, r.saldoFine[11], true)}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista per mese (telefono) ───────────────────────────────────────────────

function VistaMese({ r, onApri }: { r: RendicontoCassa; onApri: (titolo: string, voci: VoceCassa[], mese: number | null) => void }) {
  const meseIniziale = r.anno === Number(r.today.slice(0, 4)) ? Number(r.today.slice(5, 7)) : 1;
  const [mese, setMese] = useState(meseIniziale);
  const i = mese - 1;
  const col = r.colonne[i];
  const riga = (label: string, cents: number | null, voci: VoceCassa[], forte = false, rientro = false) => (
    <li key={label} className={cn("flex items-center justify-between gap-3 px-3 py-2", forte && "bg-muted/40 font-semibold", rientro && "pl-6")}>
      <span className="min-w-0 text-[13px]">{label}</span>
      {cents == null || cents === 0 || !voci.length ? (
        <span className={cn("shrink-0 text-[13px] tabular-nums", cents != null && cents < 0 && "text-rose-700")}>{cents === 0 ? "—" : euro(cents)}</span>
      ) : (
        <button
          type="button"
          aria-label={`Apri il dettaglio di ${label} · ${MESI_LUNGHI[i]} ${r.anno}: ${euro(cents)}`}
          onClick={() => onApri(`${label} · ${MESI_LUNGHI[i]} ${r.anno}`, voci, mese)}
          className={cn("shrink-0 text-[13px] tabular-nums underline-offset-2 hover:underline", cents < 0 && "text-rose-700")}
        >
          {euro(cents)}
        </button>
      )}
    </li>
  );
  const fine = r.saldoFine[i];
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className={cn("flex items-center gap-2 border-b px-2 py-2", SFONDO_COLONNA[col.tipo])}>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={mese === 1} onClick={() => setMese(mese - 1)} aria-label="Mese precedente">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={String(mese)} onValueChange={(v) => setMese(Number(v))}>
          <SelectTrigger className="h-8 flex-1" aria-label="Mese"><SelectValue /></SelectTrigger>
          <SelectContent>
            {r.colonne.map((c) => (
              <SelectItem key={c.mese} value={String(c.mese)}>
                {MESI_LUNGHI[c.mese - 1]} · {ETICHETTA_COLONNA[c.tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={mese === 12} onClick={() => setMese(mese + 1)} aria-label="Mese successivo">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <ul className="divide-y">
        {riga("Saldo a inizio mese", r.saldoInizio[i], [], true)}
        {GRUPPI_CASSA.map((g) => (
          <Fragment key={g.key}>
            {r.vociVisibili
              .filter((v) => VOCE_PER_CHIAVE.get(v)?.gruppo === g.key)
              .map((v) => riga(etichettaVoce(v), r.righe[v][i], [v], false, true))}
            {riga(g.totale, r.gruppi[g.key][i], vociDelGruppo(g.key), true)}
            {g.key === "uscite" && riga("Flusso della gestione operativa", r.flussoOperativo[i], [...vociDelGruppo("incassi"), ...vociDelGruppo("uscite")], true)}
          </Fragment>
        ))}
        {riga("Flusso netto del mese", r.flussoNetto[i], GRUPPI_CASSA.flatMap((g) => vociDelGruppo(g.key)), true)}
        <li className={cn("flex items-center justify-between gap-3 px-3 py-2.5 font-bold", fine != null && fine < 0 ? "bg-rose-100 text-rose-800" : "bg-muted/60")}>
          <span>Saldo a fine mese</span>
          <span className="tabular-nums">{euro(fine)}</span>
        </li>
      </ul>
    </div>
  );
}

// ── Pannello dei movimenti ──────────────────────────────────────────────────

function DettaglioSheet({ r, selezione, onClose, onClassifica }: { r: RendicontoCassa; selezione: Selezione | null; onClose: () => void; onClassifica?: () => void }) {
  const focusReturn = useDialogFocusReturn();
  const righe: DettaglioCella[] = !selezione
    ? []
    : selezione.righe
      ? selezione.righe
          .filter((d) => selezione.mese == null || Number(d.data.slice(5, 7)) === selezione.mese)
          .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
      : dettagliCella(r, selezione.voci, selezione.mese);
  const totale = righe.reduce((s, d) => s + d.cents, 0);
  return (
    <Sheet open={!!selezione} onOpenChange={(o) => !o && onClose()}>
      <SheetContent {...focusReturn} side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-6 text-base">{selezione?.titolo}</SheetTitle>
          <SheetDescription>
            {righe.length} movimenti · totale <span className={cn("font-semibold tabular-nums", totale < 0 && "text-rose-700")}>{euro(totale)}</span>
          </SheetDescription>
        </SheetHeader>
        {onClassifica && (selezione?.daClassificare || selezione?.voci.some((v) => VOCE_PER_CHIAVE.get(v)?.daClassificare)) && righe.some((d) => d.bankTransactionId) && (
          <Button size="sm" className="mt-3" onClick={onClassifica}>
            <Tags className="mr-2 h-4 w-4" /> Classifica questi movimenti
          </Button>
        )}
        {righe.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nessun movimento.</p>
        ) : (
          <ul className="mt-4 divide-y rounded-lg border">
            {righe.map((d) => (
              <li key={`${d.id}:${d.data}`} className="space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{d.descrizione}</p>
                  <p className={cn("shrink-0 font-semibold tabular-nums", d.cents < 0 && "text-rose-700")}>{euro(d.cents)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{data(d.data)}</span>
                  {d.controparte && <span>· {d.controparte}</span>}
                  <span>· {d.fonte}</span>
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", d.tipo === "previsto" ? "border-sky-300 text-sky-800" : "")}>
                    {d.tipo === "registrato" ? "Registrato" : d.stimato ? "Stima" : "Previsto"}
                  </Badge>
                  {d.href && (
                    <Link to={d.href} className="font-medium text-blue-700 underline">
                      Apri
                    </Link>
                  )}
                </div>
                {d.nota && <p className="text-[11px] text-muted-foreground">{d.nota}</p>}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
