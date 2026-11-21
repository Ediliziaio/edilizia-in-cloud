import { Suspense, useState, useMemo } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowDownLeft, ArrowUpRight, BookOpen, Bot, ChevronLeft, ChevronRight, Download, ExternalLink, FileSpreadsheet, FileText, Loader2, MoreHorizontal, Pencil, Plus, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { perchePrimaNotaNonModificabile, usePrimaNota, type PrimaNotaEntry } from "@/hooks/usePrimaNota";
import { ModificaCollegamentiMovimento } from "@/components/prima-nota/ModificaCollegamentiMovimento";
import { AnteprimaAllegato } from "@/components/prima-nota/AnteprimaAllegato";
import { AllegatoPrimaNota } from "@/components/prima-nota/AllegatoPrimaNota";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { NotaRiga } from "@/components/shared/NotaRiga";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { costruisciRegistro, htmlRegistroPrimaNota, periodoInLettere, righeExcelPrimaNota } from "@/lib/contabilita/registroPrimaNota";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { DaVerificareCard } from "@/components/contabilita/DaVerificareCard";
import { toast } from "sonner";
import { NumeroVeloce } from "@/components/charts/grafici/NumeroVeloce";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";
import { usePermissions } from "@/hooks/usePermissions";
import { perchePrimaNotaNonEliminabile } from "@/hooks/usePrimaNota";
import { BarraSelezioneRighe, ErroriOperazioneRighe } from "@/components/shared/BarraSelezioneRighe";
import { linkFattura, linkTesoreriaMovimento } from "@/lib/finance/collegamentiFinanza";
import { AllineamentoPrimaNota } from "@/components/prima-nota/AllineamentoPrimaNota";
import { useContiPrimaNota } from "@/hooks/useContiPrimaNota";
import { StornaPagamentiCosto } from "@/components/prima-nota/StornaPagamentiCosto";

const GraficoEntrateUscite = lazyWithRetry(() => import("@/components/charts/grafici/GraficoEntrateUscite"));

const CATEGORY_LABELS: Record<string, string> = {
  incasso: "Incasso",
  fornitore: "Fornitore",
  costo: "Costo",
  fiscale: "Fiscale",
  stipendi: "Stipendi",
  utenze: "Utenze",
  affitto: "Affitto",
  altro: "Altro",
};

function origineMovimento(e: PrimaNotaEntry) {
  if (!e.is_auto) return "Manuale";
  const nomi: Record<string, string> = { fattura_emessa: "Fattura", incasso_fattura: "Incasso", invoice_payment: "Incasso o rimborso", bank_alignment: "Banca riconciliata", bank_transaction: "Movimento bancario", invoice: "Incasso importato", nota_credito: "Nota credito", company_cost_payment: "Pagamento costo", storno_pagamento: "Storno pagamento" };
  return nomi[e.auto_source ?? ""] ?? e.auto_source?.replaceAll("_", " ") ?? "Automatica";
}

function PrimaNotaInner() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const contiPrimaNota = useContiPrimaNota(effectiveCompany?.id);
  const [contoFiltro, setContoFiltro] = useState("tutti");
  const permessi = usePermissions();
  const confirm = useConfirm();
  const apriOrigine = (e: PrimaNotaEntry) => navigate(e.bank_transaction_id ? linkTesoreriaMovimento(e.bank_transaction_id) : e.documento_fiscale_id ? linkFattura(e.documento_fiscale_id, true) : e.cost_id ? `/azienda/costi?costo=${encodeURIComponent(e.cost_id)}` : e.scadenza_id ? "/azienda/scadenzario" : e.invoice_id ? linkFattura(e.invoice_id, false) : "/azienda/documenti");
  const [dettaglioId, setDettaglioId] = useState<string | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [allineaAperto, setAllineaAperto] = useState(false);
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [direction, setDirection] = useState<"entrata" | "uscita" | "">("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  // La registrazione da modificare: lo stesso modulo della nuova, già compilato.
  const [modificaDalDettaglio, setModificaDalDettaglio] = useState(false);
  const [daModificare, setDaModificare] = useState<PrimaNotaEntry | null>(null);
  const [autoView, setAutoView] = useState<"tutte" | "auto" | "manuali">("tutte");

  const isAutoFilter = autoView === "auto" ? true : autoView === "manuali" ? false : null;

  // Mobile: direzione, tipo di registrazione e periodo in un pannello dal basso
  // (prima tre righe di controlli, con le date che uscivano dallo schermo).
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const meseCorrente = { da: format(startOfMonth(new Date()), "yyyy-MM-dd"), a: format(endOfMonth(new Date()), "yyyy-MM-dd") };
  const periodiRapidi = [
    { value: "mese", label: "Questo mese", ...meseCorrente },
    { value: "scorso", label: "Mese scorso", da: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), a: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
    { value: "tre", label: "Ultimi 3 mesi", da: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"), a: meseCorrente.a },
    { value: "anno", label: `Anno ${new Date().getFullYear()}`, da: `${new Date().getFullYear()}-01-01`, a: `${new Date().getFullYear()}-12-31` },
  ];
  const periodoScelto = periodiRapidi.find((p) => p.da === fromDate && p.a === toDate)?.value ?? "altro";
  const nFiltriMobile = [direction !== "", autoView !== "tutte", periodoScelto !== "mese", contoFiltro !== "tutti"].filter(Boolean).length;
  const filtroConto = <Select value={contoFiltro} onValueChange={v => { setContoFiltro(v); setPage(1); }}>
    <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Filtra per conto"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="tutti">Tutti i conti</SelectItem><SelectItem value="cassa">Cassa</SelectItem>{contiPrimaNota.data?.map(c => <SelectItem key={c.valore} value={c.valore}>{c.etichetta}</SelectItem>)}</SelectContent>
  </Select>;

  // Chi cerca un nome non sa in che mese sta: la ricerca guarda tutte le date, non il periodo aperto.
  const cercaSuTutteLeDate = search.trim() !== "";

  const { entries, isLoading, erroreElenco, ricaricaElenco, totalCount, totalPages, saldo, isSaldoLoading, saldoError, ricaricaSaldo, monthlyChart, create, remove, removeMany, update, updateNotes, fetchAllForExport } = usePrimaNota({
    fromDate: cercaSuTutteLeDate ? undefined : fromDate,
    toDate: cercaSuTutteLeDate ? undefined : toDate,
    direction: direction || undefined,
    search,
    isAuto: isAutoFilter,
    bankAccountId: contoFiltro.startsWith("banca:") ? contoFiltro.slice(6) : undefined,
    liquiditaId: contoFiltro.startsWith("conto:") ? contoFiltro.slice(6) : undefined,
    accountLabel: contoFiltro === "cassa" ? "cassa" : undefined,
  }, page, pageSize, { includeMonthlyChart: !isMobile });
  const selezione = useSelezioneRighe(entries, JSON.stringify([effectiveCompany?.id, page, pageSize, fromDate, toDate, direction, search, autoView, contoFiltro]));
  const eliminabili = selezione.selezionate.filter((e) => !perchePrimaNotaNonEliminabile(e));
  const escluse = selezione.selezionate.flatMap((e) => {
    const motivo = perchePrimaNotaNonEliminabile(e);
    return motivo ? [{ nome: e.description, motivo }] : [];
  });
  const [erroriEliminazione, setErroriEliminazione] = useState<Array<{ nome: string; motivo: string }>>([]);
  const eliminaSelezionate = async () => {
    if (removeMany.isPending || eliminabili.length === 0) return;
    const righe = [...eliminabili];
    const somma = (verso: string) => righe.filter((r) => r.direction === verso).reduce((n, r) => n + Number(r.amount), 0);
    if (!await confirm({ title: `Eliminare ${righe.length} registrazioni?`, description: `Entrate: ${formatCurrency(somma("entrata"))}. Uscite: ${formatCurrency(somma("uscita"))}. ${escluse.length ? `${escluse.length} righe collegate a documenti restano escluse. ` : ""}Il saldo dei costi e delle fatture verrà ricalcolato. Eliminando un pagamento si elimina anche l’eventuale storno collegato; eliminando solo uno storno si ripristina l’effetto del pagamento originale. L’eliminazione è definitiva.`, confirmLabel: "Elimina registrazioni", variant: "destructive" })) return;
    setErroriEliminazione([]);
    const esito = await removeMany.mutateAsync(righe);
    selezione.mantieni(esito.errori.map((e) => e.riga.id));
    setErroriEliminazione(esito.errori.map((e) => ({ nome: e.riga.description, motivo: e.motivo })));
  };
  const eliminaSingola = async (riga: PrimaNotaEntry) => {
    if (remove.isPending || removeMany.isPending) return;
    const effetto = riga.cost_id
      ? riga.reversal_of
        ? "Eliminando questo storno si ripristina l’effetto del pagamento originale sul costo."
        : "Il costo e le sue scadenze seguiranno il saldo dei pagamenti rimasti. Verrà eliminato anche l’eventuale storno di questo movimento."
      : riga.invoice_id ? "La fattura collegata verrà ricalcolata sul saldo degli incassi rimasti." : "";
    if (await confirm({ title: "Eliminare il movimento?", description: `${riga.description}: ${formatCurrency(riga.amount)}. La registrazione verrà rimossa dalla prima nota. ${effetto} L’eliminazione è definitiva.`, confirmLabel: "Elimina", variant: "destructive" })) {
      remove.mutate(riga.id, { onSuccess: () => setDettaglioId(null) });
    }
  };
  const [isExporting, setIsExporting] = useState(false);

  // Running balance (from oldest to newest, then reverse for display)
  const entriesWithBalance = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    let balance = 0;
    const withBal: Array<PrimaNotaEntry & { runningBalance: number }> = [];
    for (const e of sorted) {
      balance += e.direction === "entrata" ? e.amount : -e.amount;
      withBal.push({ ...e, runningBalance: balance });
    }
    return withBal.reverse();
  }, [entries]);
  if (!isLoading && !erroreElenco && page > totalPages) setPage(totalPages);
  const dettaglio = entriesWithBalance.find(e => e.id === dettaglioId);

  // Grafico ultimi 6 mesi: alimentato dalla query dedicata `monthlyChart` (tutte
  // le registrazioni degli ultimi 6 mesi), NON dalla lista paginata/filtrata —
  // prima mostrava solo il mese corrente perché leggeva `entries`.
  const chartData = useMemo(() => {
    const now = new Date();
    const rows: { month: string; entrate: number; uscite: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      const b = monthlyChart?.[key];
      rows.push({ month: format(d, "MMM yy", { locale: it }), entrate: b?.entrate ?? 0, uscite: b?.uscite ?? 0 });
    }
    return rows;
  }, [monthlyChart]);

  // Esporta TUTTE le righe filtrate (non solo la pagina visibile): prima il CSV
  // conteneva solo i 50 movimenti della pagina corrente → export incompleto.
  const exportCSV = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllForExport();
      if (all.length === 0) { toast.info("Nessun movimento da esportare"); return; }
      const header = "Data,Direzione,Categoria,Descrizione,Importo,Metodo,Riferimento,Note,Auto\n";
      const rows = all.map((e) =>
        [
          e.entry_date,
          e.direction,
          e.category,
          e.description,
          e.direction === "uscita" ? `-${e.amount}` : e.amount,
          e.payment_method || "",
          e.reference_number || "",
          e.notes || "",
          e.is_auto ? "Sì" : "No",
        ].map((v) => escapeCsvCell(v as string | number, ",")).join(",")
      ).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prima-nota-${fromDate}-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Errore durante l'export");
    } finally {
      setIsExporting(false);
    }
  };

  // Stampa e Excel del registro (09/11/2026): il CSV non dice di chi è né di
  // che periodo, e in pagina i movimenti vanno dal più recente. Su carta il
  // registro si legge dal primo giorno, col saldo che cammina.
  const [stampa, setStampa] = useState<string | null>(null);
  const [preparo, setPreparo] = useState(false);
  const anagrafica = useAnagraficaAzienda();
  const intestazione = {
    ragione_sociale: anagrafica.data?.ragione_sociale ?? "",
    partita_iva: anagrafica.data?.partita_iva ?? null,
    codice_fiscale: anagrafica.data?.codice_fiscale ?? null,
    indirizzo_via: anagrafica.data?.indirizzo_via ?? null,
    indirizzo_numero_civico: anagrafica.data?.indirizzo_numero_civico ?? null,
    indirizzo_cap: anagrafica.data?.indirizzo_cap ?? null,
    indirizzo_comune: anagrafica.data?.indirizzo_comune ?? null,
    indirizzo_provincia: anagrafica.data?.indirizzo_provincia ?? null,
    logo_url: anagrafica.data?.logo_url ?? null,
  };

  const preparaRegistro = async () => {
    const tutte = await fetchAllForExport();
    if (!tutte.length) { toast.info("Nessun movimento da stampare in questo periodo"); return null; }
    return tutte.map((e) => ({
      entry_date: e.entry_date,
      direction: e.direction,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      payment_method: e.payment_method,
      reference_number: e.reference_number,
      account_label: e.account_label,
      notes: e.notes,
      is_auto: e.is_auto,
    }));
  };

  const apriStampa = async () => {
    setPreparo(true);
    try {
      const movimenti = await preparaRegistro();
      if (movimenti) setStampa(htmlRegistroPrimaNota({ azienda: intestazione, movimenti, dal: fromDate, al: toDate }));
    } catch { toast.error("Non riesco a preparare la stampa: riprova."); }
    finally { setPreparo(false); }
  };

  const scaricaExcel = async () => {
    setPreparo(true);
    try {
      const movimenti = await preparaRegistro();
      if (!movimenti) return;
      const registro = costruisciRegistro(movimenti);
      await exportXlsx({
        filename: `prima-nota-${fromDate}-${toDate}.xlsx`,
        brand: {
          company_name: intestazione.ragione_sociale || undefined,
          title: "Prima nota",
          subtitle: periodoInLettere(fromDate, toDate),
        },
        sheets: [{
          name: "Prima nota",
          rows: righeExcelPrimaNota(registro) as unknown[],
          columns: [
            { header: "N.", key: "numero", type: "number", width: 6 },
            { header: "Data", key: "data", width: 12 },
            { header: "Descrizione", key: "descrizione", width: 46 },
            { header: "Categoria", key: "categoria", width: 16 },
            { header: "Riferimento", key: "riferimento", width: 16 },
            { header: "Metodo", key: "metodo", width: 14 },
            { header: "Conto", key: "conto", width: 10 },
            { header: "Entrate", key: "entrate", type: "number", width: 14 },
            { header: "Uscite", key: "uscite", type: "number", width: 14 },
            { header: "Saldo", key: "saldo", type: "number", width: 14 },
            { header: "Origine", key: "origine", width: 12 },
            { header: "Note", key: "note", width: 30 },
          ],
        }] as never,
      });
    } catch { toast.error("Non riesco a preparare il file: riprova."); }
    finally { setPreparo(false); }
  };

  // Nei KPI di testata i centesimi non servono e troncano: 0 decimali
  // come nel pannello navy delle Commesse.
  const eurTondo = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);
  const testoSaldo = isSaldoLoading ? "…" : saldoError && !saldo ? "—" : undefined;
  return (
    <div className="space-y-6 max-sm:space-y-3">
      <AllineamentoPrimaNota company={effectiveCompany?.id} open={allineaAperto} onOpenChange={setAllineaAperto} />
      {/* Header */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Prima Nota</h1>
              <p className="mt-0.5 text-sm text-slate-500">Movimenti di cassa e banca, incassi, pagamenti e saldo progressivo.</p>
            </div>
          </div>
        <div className="flex gap-2 flex-wrap">
          {/* Mobile: solo «Nuova»; CSV, XBRL e importa automatico al desktop,
              in un menu «⋯» accanto a «Nuova registrazione»: erano tre
              bottoni in fila prima dell'azione principale. */}
          {/* Contabilità → Da verificare: un pulsante con il numero, l'elenco in una finestra (16/11/2026). */}
          <span className="max-sm:hidden"><DaVerificareCard companyId={effectiveCompany?.id} variante="pillola" /></span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="max-sm:hidden" aria-label="Altre azioni" title="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => setAllineaAperto(true)}
                title="Importa automaticamente da movimenti bancari riconciliati e fatture pagate"
              >
                <RefreshCw className="h-4 w-4" />
                Allinea banca e fatture
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onSelect={() => { void apriStampa(); }} disabled={preparo}>
                {preparo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Stampa il registro
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => { void scaricaExcel(); }} disabled={preparo}>
                <FileSpreadsheet className="h-4 w-4" />
                Scarica Excel
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => { void exportCSV(); }} disabled={isExporting}>
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Esporta CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><Button className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm max-sm:h-8 max-sm:px-3 max-sm:text-xs"><Plus className="mr-1 h-4 w-4" />Nuova registrazione</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={() => setNewOpen(true)}>Movimento di cassa o banca</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(`/azienda/documenti?tab=fiscalita&sezione=contabilita&vista=scritture&nuova=scrittura&anno=${fromDate.slice(0, 4)}`)}>Scrittura Dare/Avere · stipendi e altri costi</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
        <p className="text-muted-foreground">Per rilevare un costo prima del pagamento, registrare gli stipendi o gestire più conti usa le scritture Dare/Avere.</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate("/azienda/documenti?tab=fiscalita&sezione=contabilita&vista=scritture")}>Scritture Dare/Avere</Button><Button size="sm" variant="outline" onClick={() => setAllineaAperto(true)}>Verifica allineamento</Button><Button size="sm" variant="outline" onClick={() => navigate("/azienda/tesoreria")}>Banca e riconciliazione</Button></div>
      </div>

      {stampa && (
        <PrintPreviewModal
          open
          onOpenChange={(v) => { if (!v) setStampa(null); }}
          htmlContent={stampa}
          title="Prima nota — anteprima di stampa"
          fileName={`prima-nota-${fromDate}-${toDate}`}
          soloPdf
        />
      )}
      {/* I numeri del periodo filtrato, nella stessa veste delle fatture e dello Scadenzario
          (16/11/2026): riquadri chiari con l'entrata a cascata, al posto della testata blu. */}
      <div className="grid grid-cols-2 gap-2 max-sm:hidden lg:grid-cols-4">
        <NumeroVeloce indice={0} etichetta="Entrate" valore={saldo?.entrate || 0} testo={testoSaldo} tono="buono" nota="nel periodo filtrato" />
        <NumeroVeloce indice={1} etichetta="Uscite" valore={saldo?.uscite || 0} testo={testoSaldo} tono={(saldo?.uscite || 0) > 0 ? "cattivo" : "neutro"} nota="nel periodo filtrato" />
        <NumeroVeloce
          indice={2}
          etichetta="Saldo netto"
          valore={saldo?.saldo || 0}
          testo={testoSaldo}
          tono={(saldo?.saldo || 0) >= 0 ? "buono" : "cattivo"}
          nota="entrate meno uscite"
        />
        <NumeroVeloce indice={3} etichetta="Movimenti" testo={String(totalCount ?? 0)} nota="registrazioni nel periodo" />
      </div>

      {/* Entrate e uscite degli ultimi 6 mesi (16/11/2026): stessa veste dei grafici del
          Controllo di Gestione e delle fatture (fondo a puntini, barre sfumate, tooltip a
          scheda, totali sopra). Vetrina → non su mobile (bastano i numeri sopra). */}
      {!isMobile && chartData.some((d) => d.entrate > 0 || d.uscite > 0) && (
        <ErrorBoundary fallback={<p role="alert" className="text-sm text-muted-foreground">Grafico non disponibile.</p>}>
          <Suspense fallback={null}>
            <GraficoEntrateUscite dati={chartData} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Mobile: entrate e uscite del periodo, nome e cifra (al posto del
          riquadro blu con tre numeri, icone e spiegazioni). */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: "Entrate", valore: testoSaldo ?? eurTondo(saldo?.entrate || 0), tono: "text-green-700" },
          { label: "Uscite", valore: testoSaldo ?? eurTondo(saldo?.uscite || 0), tono: "text-destructive" },
        ]}
      />
      {saldoError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{saldo ? "Totali in attesa di aggiornamento." : "Totali non disponibili."}</span>
          <Button variant="link" size="sm" onClick={() => void ricaricaSaldo()}>Riprova</Button>
        </div>
      )}

      {/* Mobile: ricerca e bottone dei filtri. */}
      <CercaConFiltri
        className="sm:hidden"
        valore={search}
        onCambia={(v) => { setSearch(v); setPage(1); }}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {cercaSuTutteLeDate && (
        <p className="text-xs text-muted-foreground">Stai cercando su tutte le date: il periodo scelto non vale finché c'è testo nella ricerca.</p>
      )}

      {/* Filters */}
      {/* Una riga di filtri senza riquadro attorno; la ricerca non scende sotto
          i 220px (a 1024 si riduceva a «C…») e, se non c'è posto, gli altri
          filtri vanno a capo. */}
      <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-3 max-sm:hidden">
        {filtroConto}
        {/* Search — full width on mobile, flexible on desktop */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            aria-label="Cerca nella prima nota"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-10"
          />
        </div>
        {/* Second row on mobile: toggles + direction */}
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={autoView}
            onValueChange={(v) => { if (v) { setAutoView(v as typeof autoView); setPage(1); } }}
            className="border rounded-md"
          >
            <ToggleGroupItem value="tutte" className="text-xs h-9 px-3">Tutte</ToggleGroupItem>
            <ToggleGroupItem value="auto" className="text-xs h-9 px-3">
              <Bot className="h-3 w-3 mr-1" /> Auto
            </ToggleGroupItem>
            <ToggleGroupItem value="manuali" className="text-xs h-9 px-3">Manuali</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={direction || "all"}
            onValueChange={(v) => {
              setDirection(v === "all" ? "" : (v as "entrata" | "uscita"));
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filtra movimenti per direzione" className="h-9 w-[110px]"><SelectValue placeholder="Direzione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="entrata">Entrate</SelectItem>
              <SelectItem value="uscita">Uscite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Movimenti dal" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
          <span className="text-muted-foreground text-sm shrink-0">→</span>
          <Input type="date" aria-label="Movimenti al" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
        </div>
      </div>

      {permessi.isAdmin && entries.length > 0 && <BarraSelezioneRighe
        nome="i movimenti" selezionate={selezione.selezionate.length} consentite={eliminabili.length}
        tutte={selezione.tutte} parziale={selezione.parziale}
        entrate={eliminabili.filter((e) => e.direction === "entrata").reduce((n, e) => n + Number(e.amount), 0)}
        uscite={eliminabili.filter((e) => e.direction === "uscita").reduce((n, e) => n + Number(e.amount), 0)}
        azione="Elimina selezionate" inCorso={removeMany.isPending} escluse={escluse}
        onPagina={selezione.pagina} onAzione={() => void eliminaSelezionate()} />}
      <ErroriOperazioneRighe errori={erroriEliminazione} />
      {permessi.isAdmin && selezione.selezionate.length > 0 && <div className="mb-3 space-y-2">
        {eliminabili.length === 0 && <p className="text-sm text-muted-foreground">Le registrazioni selezionate hanno collegamenti da gestire nella schermata di origine.</p>}
        <StornaPagamentiCosto righe={selezione.selezionate} />
      </div>}
      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : erroreElenco ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-3 text-sm">
          Impossibile caricare i movimenti.
          <Button size="sm" variant="outline" onClick={() => void ricaricaElenco()}>Riprova</Button>
        </div>
      ) : entriesWithBalance.length === 0 ? (
        // Mobile: una riga di testo (c'è «Nuova» in testata).
        <div className="rounded-lg border max-sm:border-0">
          <div className="flex flex-col items-center justify-center py-12 text-center px-4 max-sm:py-4">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-3 max-sm:hidden" />
            <p className="font-medium text-muted-foreground max-sm:text-xs max-sm:font-normal">Nessun movimento trovato</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-sm:hidden">Prova a modificare i filtri o aggiungi la prima registrazione</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <BarraScorrimentoOrizzontale contenitore={scrollContainer} className="mx-3 my-2" />
          <div ref={setScrollContainer} className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Scorri movimenti di prima nota">
          <table aria-label="Movimenti di prima nota" className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_td]:py-2">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-9 px-3"><span className="sr-only">Selezione</span></th>
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Categoria</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="p-3 text-right font-medium" title="Somma progressiva dei movimenti visualizzati nella pagina">Progressivo pagina</th>
                {["Metodo", "Conto", "Origine", "Documento", "Commessa", "Fornitore", "Riferimento", "Allegato", "Azioni"].map(titolo =>
                  <th key={titolo} className="p-3 text-left font-medium">{titolo}</th>)}
              </tr>
            </thead>
            <tbody>
              {entriesWithBalance.map((e) => (
                <tr key={e.id} className="cursor-pointer border-b hover:bg-muted/40 data-[selected=true]:bg-primary/5" data-selected={selezione.ids.has(e.id)}
                  onClick={event => {
                    const target = event.target;
                    if (target instanceof Element && event.currentTarget.contains(target) && !target.closest("button, a, input")) {
                      setDettaglioId(e.id);
                    }
                  }}>
                  <td className="p-3" onClick={event => event.stopPropagation()}>{permessi.isAdmin && <Checkbox aria-label={`Seleziona ${e.description}`} checked={selezione.ids.has(e.id)} disabled={removeMany.isPending} onCheckedChange={() => selezione.alterna(e.id)} />}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <button type="button" aria-haspopup="dialog" className="block max-w-[24rem] truncate text-left font-medium hover:underline"
                      title={e.description} onClick={() => setDettaglioId(e.id)}>{e.description}</button>
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={`flex items-center justify-end gap-1 ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                      {e.direction === "entrata"
                        ? <ArrowDownLeft className="h-3.5 w-3.5" />
                        : <ArrowUpRight className="h-3.5 w-3.5" />
                      }
                      {e.direction === "uscita" ? "-" : "+"}{formatCurrency(e.amount)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={e.runningBalance >= 0 ? "" : "text-destructive"}>
                      {formatCurrency(e.runningBalance)}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize">
                    {e.payment_method || "—"}
                  </td>
                  <td>{e.account_label || "—"}</td>
                  <td>{origineMovimento(e)}</td>
                  <td>{e.documenti_fiscali?.id ? (
                        <button
                          onClick={() => navigate(linkFattura(e.documenti_fiscali!.id, true))}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          {e.documenti_fiscali.tipo === "nota_credito" ? "NC" : "Fatt."} #{e.documenti_fiscali.numero}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : e.invoices?.invoice_number || "—"}</td>
                  <td>{e.orders?.order_code && e.order_id
                    ? <button className="text-primary hover:underline" onClick={() => navigate(`/azienda/ordini/${e.order_id}`)}>{e.orders.order_code}</button>
                    : "—"}</td>
                  <td>{e.suppliers?.name || "—"}</td>
                  <td>{e.reference_number || "—"}</td>
                  <td>{e.attachment_url ? <AllegatoPrimaNota url={e.attachment_url} nome={e.attachment_name} /> : "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-0.5">
                    <NotaRiga
                      nota={e.notes}
                      titolo={`${format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })} · ${e.description}`}
                      onSalva={(nota) => updateNotes(e.id, nota)}
                    />
                    {!perchePrimaNotaNonModificabile(e) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Modifica ${e.description}`}
                        title="Modifica"
                        onClick={() => setDaModificare(e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {permessi.isAdmin && !perchePrimaNotaNonEliminabile(e) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Elimina movimento di prima nota"
                        disabled={removeMany.isPending || remove.isPending}
                        onClick={() => void eliminaSingola(e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {perchePrimaNotaNonModificabile(e) && <Button size="sm" variant="ghost" className="text-xs" title={perchePrimaNotaNonModificabile(e) ?? undefined} aria-label={`Apri origine di ${e.description}`} onClick={() => apriOrigine(e)}>Apri origine</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pagination — mobile: solo precedente/successiva. Il contenitore c'è
          solo quando la paginazione compare (niente margine vuoto sul desktop). */}
      {!isLoading && totalCount > 25 && (
        <div className="max-sm:hidden">
          <TablePagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalCount}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between sm:hidden">
          <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Pagina precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{page} di {totalPages}</span>
          <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Pagina successiva">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile: direzione, registrazioni e periodo. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setDirection(""); setAutoView("tutte"); setContoFiltro("tutti"); setFromDate(meseCorrente.da); setToDate(meseCorrente.a); setPage(1); }}
        risultati={isLoading ? undefined : totalCount}
      >
        {filtroConto}
        <PilloleFiltro
          titolo="Periodo"
          valore={periodoScelto}
          onScegli={(v) => {
            const p = periodiRapidi.find((x) => x.value === v);
            if (p) { setFromDate(p.da); setToDate(p.a); setPage(1); }
          }}
          scelte={periodiRapidi.map((p) => ({ value: p.value, label: p.label }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Dal" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 text-xs" />
          <Input type="date" aria-label="Al" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 text-xs" />
        </div>
        <PilloleFiltro
          titolo="Movimenti"
          valore={direction || "all"}
          onScegli={(v) => { setDirection(v === "all" ? "" : (v as "entrata" | "uscita")); setPage(1); }}
          scelte={[
            { value: "all", label: "Tutti" },
            { value: "entrata", label: "Entrate" },
            { value: "uscita", label: "Uscite" },
          ]}
        />
        <PilloleFiltro
          titolo="Registrazioni"
          valore={autoView}
          onScegli={(v) => { setAutoView(v); setPage(1); }}
          scelte={[
            { value: "tutte" as const, label: "Tutte" },
            { value: "auto" as const, label: "Automatiche" },
            { value: "manuali" as const, label: "Manuali" },
          ]}
        />
      </PannelloFiltri>

      {/* Dialog */}
      <Dialog open={!!dettaglio} onOpenChange={open => { if (!open) setDettaglioId(null); }}>
        {dettaglio && <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dettaglio movimento</DialogTitle>
            <DialogDescription className="break-words">{dettaglio.description}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between border-y py-3">
            <span>{dettaglio.direction === "entrata" ? "Entrata" : "Uscita"} · {format(new Date(dettaglio.entry_date), "dd/MM/yyyy")}</span>
            <strong className={dettaglio.direction === "entrata" ? "text-green-700" : "text-destructive"}>
              {dettaglio.direction === "entrata" ? "+" : "−"}{formatCurrency(dettaglio.amount)}
            </strong>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Categoria", CATEGORY_LABELS[dettaglio.category] || dettaglio.category],
              ["Origine", origineMovimento(dettaglio)], ["Metodo", dettaglio.payment_method],
              ["Conto", dettaglio.account_label], ["Fornitore", dettaglio.suppliers?.name],
              ["Riferimento", dettaglio.reference_number], ["Progressivo pagina", formatCurrency(dettaglio.runningBalance)],
              ["Documento", dettaglio.documenti_fiscali?.numero ?? dettaglio.invoices?.invoice_number],
            ].filter(([, valore]) => valore).map(([nome, valore]) =>
              <div key={nome}><dt className="text-xs text-muted-foreground">{nome}</dt><dd className="break-words">{valore}</dd></div>)}
          </dl>
          {dettaglio.notes && <div><p className="text-xs text-muted-foreground">Note</p><p className="whitespace-pre-wrap break-words text-sm">{dettaglio.notes}</p></div>}
          <div className="space-y-3 border-y py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Commessa o macrocommessa</p>
              {dettaglio.order_id
                ? <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/azienda/ordini/${dettaglio.order_id}`)}>{dettaglio.orders?.order_code || "Apri commessa"}</Button>
                : <p>Nessuna commessa collegata</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Allegato del movimento</p>
              {dettaglio.attachment_url
                ? <AnteprimaAllegato key={dettaglio.attachment_url} url={dettaglio.attachment_url} nome={dettaglio.attachment_name} />
                : <p>Nessun allegato</p>}
            </div>
            {perchePrimaNotaNonModificabile(dettaglio) && <p className="text-xs text-muted-foreground">Per correggere importo e data, apri la registrazione di origine.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {permessi.isAdmin && !perchePrimaNotaNonEliminabile(dettaglio) && <Button variant="destructive" disabled={remove.isPending || removeMany.isPending} onClick={() => void eliminaSingola(dettaglio)}>Elimina registrazione</Button>}
            {permessi.isAdmin && <StornaPagamentiCosto righe={[dettaglio]} onFatto={() => setDettaglioId(null)} />}
            {perchePrimaNotaNonModificabile(dettaglio) && <Button variant="outline" onClick={() => apriOrigine(dettaglio)}>Apri origine</Button>}
            {dettaglio.documenti_fiscali?.id && <Button variant="outline" onClick={() => navigate(linkFattura(dettaglio.documenti_fiscali!.id, true))}>Apri documento</Button>}
            {perchePrimaNotaNonModificabile(dettaglio) ? <ModificaCollegamentiMovimento key={dettaglio.id} movimento={dettaglio} /> : <Button onClick={() => { setModificaDalDettaglio(true); setDaModificare(dettaglio); setDettaglioId(null); }}>Modifica movimento e collegamenti</Button>}
          </div>
        </DialogContent>}
      </Dialog>
      <NewEntryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => create.mutate(p, { onSuccess: () => setNewOpen(false) })}
        isPending={create.isPending}
      />
      <NewEntryDialog
        open={!!daModificare}
        entry={daModificare}
        mostraAllegato={modificaDalDettaglio}
        onOpenChange={(v) => { if (!v) { if (modificaDalDettaglio) setDettaglioId(daModificare?.id ?? null); setModificaDalDettaglio(false); setDaModificare(null); } }}
        onConfirm={(dati) => daModificare && update.mutate({ id: daModificare.id, dati, prima: daModificare }, { onSuccess: () => { if (modificaDalDettaglio) setDettaglioId(daModificare.id); setModificaDalDettaglio(false); setDaModificare(null); } })}
        isPending={update.isPending}
      />
    </div>
  );
}

export default function PrimaNota() {
  return (
    <ErrorBoundary title="Errore nella prima nota">
      <PrimaNotaInner />
    </ErrorBoundary>
  );
}
