import { BOTTONE_NUOVO, BOTTONE_SECONDARIO, RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { filtraScadenzario, queryFontiScadenzario, linkFonteScadenza } from "@/lib/finance/fontiScadenzario";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Search, Download, Ellipsis, ChevronDown, ChevronLeft, ChevronRight, CalendarClock, BarChart3 } from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { readAllPages } from "@/lib/personale/readAllPages";
import { exportToCSV } from "@/lib/csvExport";
import { commesseScadenza, completaCommesseScadenze, noteFattureScadenze } from "@/lib/finance/commesseScadenza";
import { useScadenzario, type ScadenzarioFilters } from "@/hooks/useScadenzario";
import { invalidaFattureImportate } from "@/components/fatturazione/GestionaleEsterno";
import { AnnullaIncassoDialog } from "@/components/scadenzario/AnnullaIncassoDialog";
import ScadenzarioKPIs from "@/components/scadenzario/ScadenzarioKPIs";
import { RateFornitori } from "@/components/scadenzario/RateFornitori";
import { DistintePagamenti } from "@/components/scadenzario/DistintePagamenti";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import { ScadenzaDettaglio } from "@/components/scadenzario/ScadenzaDettaglio";
import MarkPaidDialog from "@/components/scadenzario/MarkPaidDialog";
import NewScadenzaDialog from "@/components/scadenzario/NewScadenzaDialog";
import AdempimentiFiscali from "@/components/scadenzario/AdempimentiFiscali";
import { IncassiPerSettimanaVista } from "@/components/scadenzario/IncassiPerSettimana";
import { TablePagination } from "@/components/ui/table-pagination";
import type { Scadenza } from "@/hooks/useScadenzario";
import { useAuth } from "@/contexts/AuthContext";
import FattureDaRegistrareCard from "@/components/scadenzario/FattureDaRegistrareCard";
import { GraficoEntrateUscite } from "@/components/charts/grafici/GraficoEntrateUscite";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, addDays, addMonths, format } from "date-fns";
import { GRUPPI_METODO, etichettaMetodo, type GruppoMetodo } from "@/lib/finance/metodoScadenza";

import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, DateFiltro, DettaglioFiltri, GruppoFiltri, KpiMobili, PannelloFiltri, SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";
import { BarraSelezioneRighe, ErroriOperazioneRighe } from "@/components/shared/BarraSelezioneRighe";
import { ModificaScadenzaDialog } from "@/components/scadenzario/ModificaScadenzaDialog";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";
import { formatCurrency } from "@/lib/formatters";
import { FiltriScadenzario, FiltriScadenzarioAttivi, FiltroStatoScadenzeCompatto, type ValoriFiltriScadenzario } from "@/components/scadenzario/FiltriScadenzario";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
// Il grafico per mese si apre a richiesta (25/11/2026): chiuso, l'elenco parte sotto i numeri.
const CHIAVE_GRAFICO_MESI = "scadenzario.graficoMesiAperto";
const leggiGraficoAperto = () => { try { return localStorage.getItem(CHIAVE_GRAFICO_MESI) === "1"; } catch { return false; } };

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Periodi rapidi nella barra; le date personalizzate stanno in «Altri filtri».
const DATE_PRESETS = [
  { label: "Oggi", value: "oggi" },
  { label: "Questa settimana", value: "settimana" },
  { label: "Settimana prossima", value: "settimana_prossima" },
  { label: "Questo mese", value: "questo_mese" },
  { label: "Mese prossimo", value: "mese_prossimo" },
  { label: "Prossimi 30gg", value: "30gg" },
  { label: "Prossimi 90gg", value: "90gg" },
  { label: "Questo trimestre", value: "trimestre" },
  { label: "Personalizzato", value: "custom" },
];

function getDateRange(preset: string, today = new Date()): { from: string; to: string } | null {
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "oggi":
      return { from: f(today), to: f(today) };
    case "settimana":
      return { from: f(startOfWeek(today, { weekStartsOn: 1 })), to: f(endOfWeek(today, { weekStartsOn: 1 })) };
    case "settimana_prossima": {
      const d = addDays(today, 7);
      return { from: f(startOfWeek(d, { weekStartsOn: 1 })), to: f(endOfWeek(d, { weekStartsOn: 1 })) };
    }
    case "questo_mese":
      return { from: f(startOfMonth(today)), to: f(endOfMonth(today)) };
    case "mese_prossimo": {
      const d = addMonths(today, 1);
      return { from: f(startOfMonth(d)), to: f(endOfMonth(d)) };
    }
    case "30gg":
      return { from: f(today), to: f(addDays(today, 30)) };
    case "90gg":
      return { from: f(today), to: f(addDays(today, 90)) };
    case "trimestre":
      return { from: f(startOfQuarter(today)), to: f(endOfQuarter(today)) };
    default:
      return null;
  }
}

export default function Scadenzario() {
  const tr = useT();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const permessi = usePermissions();
  const vistaCompatta = useIsMobile(1024);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Si apre su «Aperte» (16/11/2026): quello che resta da incassare e da pagare, scadute comprese.
  // Lo scadenzario serve a vedere cosa manca; le pagate stanno in «Tutte» e «Pagate».
  const [tab, setTab] = useState("aperte");
  const [graficoAperto, setGraficoAperto] = useState(leggiGraficoAperto);
  const alternaGrafico = () => setGraficoAperto((v) => {
    try { localStorage.setItem(CHIAVE_GRAFICO_MESI, v ? "0" : "1"); } catch { /* solo comodità */ }
    return !v;
  });
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<Scadenza | null>(null);
  // 23/11/2026: la rata di una fattura fornitore si paga qui. Prima «Segna pagata» portava alla
  // pagina Costi, e da lì riepilogo, popup e modulo: un'azienda cliente non riusciva a registrare.
  const [pagaCosto, setPagaCosto] = useState<{ costId: string; importo: number } | null>(null);
  const pagaSulPosto = (s: Scadenza) => s.auto_source === "fonte_costo" && !!s.cost_id && permessi.canViewCosts && !permessi.solaLettura;
  const apriPagamento = (s: Scadenza) => {
    if (pagaSulPosto(s) && s.cost_id) {
      setPagaCosto({ costId: s.cost_id, importo: Math.max(0, Number(s.amount) - Number(s.paid_amount ?? 0)) });
      return;
    }
    const href = linkFonteScadenza(s);
    if (href) navigate(href); else setPayDialog(s);
  };
  const [newOpen, setNewOpen] = useState(false);
  // Anno selezionato (default anno corrente): scopa KPI + lista a quell'anno invece
  // di mostrare il cumulato di tutti gli anni. "all" = tutti gli anni.
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(String(currentYear));

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMetodo, setFilterMetodo] = useState("");

  // Mobile: linguette, periodo e tipo in un pannello dal basso.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const nAltriFiltri = [filterTipo, filterStatus, filterMetodo].filter(v => v && v !== "all").length;
  const nFiltriMobile = nAltriFiltri + Number(tab !== "aperte") + Number(!!datePreset || yearFilter !== String(currentYear));

  const clearFilters = useCallback(() => {
    setDatePreset("");
    setCustomFrom("");
    setCustomTo("");
    setFilterTipo("");
    setFilterStatus("");
    setFilterMetodo("");
    setPage(1);
  }, []);

  // Derive direction from active tab for server-side filtering
  const tabDirection: 'entrata' | 'uscita' | null = useMemo(() => {
    if (tab === "da_incassare") return "entrata";
    if (tab === "da_pagare") return "uscita";
    return null;
  }, [tab]);

  // Derive status from active tab for server-side filtering
  const tabStatus: string | null = useMemo(() => {
    if (tab === "pagate") return "pagata";
    return null;
  }, [tab]);

  // Compute date range for server-side filtering
  const serverDateRange = useMemo(() => {
    if (tab === "senza_data") return null;
    if (datePreset === "custom") {
      return customFrom || customTo ? { from: customFrom || null, to: customTo || null } : null;
    }
    if (datePreset && datePreset !== "all") {
      const range = getDateRange(datePreset);
      return range ? { from: range.from, to: range.to } : null;
    }
    // Nessun preset attivo: scopa all'anno selezionato (default anno corrente).
    if (yearFilter !== "all") {
      return { from: `${yearFilter}-01-01`, to: `${yearFilter}-12-31` };
    }
    return null;
  }, [datePreset, customFrom, customTo, yearFilter, tab]);

  const valoriFiltri: ValoriFiltriScadenzario = {
    periodo: datePreset, dal: serverDateRange?.from ?? "", al: serverDateRange?.to ?? "",
    metodo: filterMetodo, tipo: filterTipo, stato: filterStatus,
  };
  const cambiaFiltri = (patch: Partial<ValoriFiltriScadenzario>) => {
    if (patch.periodo !== undefined) setDatePreset(patch.periodo);
    if (patch.dal !== undefined) setCustomFrom(patch.dal);
    if (patch.al !== undefined) setCustomTo(patch.al);
    if (patch.metodo !== undefined) setFilterMetodo(patch.metodo);
    if (patch.tipo !== undefined) setFilterTipo(patch.tipo);
    if (patch.stato !== undefined) setFilterStatus(patch.stato);
    setPage(1);
  };
  const vistaElenco = !["rate", "settimane", "adempimenti"].includes(tab);
  const viste = [{ value: "rate", label: tr("Rate fornitori") }, { value: "settimane", label: tr("Per settimana") }, { value: "adempimenti", label: tr("Adempimenti fiscali") }];

  // La ricerca va al server con un attimo di attesa: prima filtrava solo le
  // righe gia' scaricate, quindi cercare una fattura finita in seconda pagina
  // rispondeva "nessuna scadenza trovata" pur essendoci.
  const [searchServer, setSearchServer] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSearchServer(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);
  const ricercaInAttesa = search.trim() !== searchServer;
  const dateInvertite = tab !== "senza_data" && datePreset === "custom" && !!customFrom && !!customTo && customFrom > customTo;

  // Da incassare e da pagare per mese di scadenza dell'anno scelto (16/11/2026): il grafico
  // sopra l'elenco. Solo da tablet in su e con un anno scelto; le annullate non contano.
  const conGraficoMesi = !vistaCompatta && yearFilter !== "all" && tab !== "rate" && tab !== "settimane" && tab !== "adempimenti" && tab !== "senza_data";

  const serverFilters: ScadenzarioFilters = useMemo(() => ({
    includiSenzaData: !datePreset || tab === "senza_data",
    soloSenzaData: tab === "senza_data",
    direction: tabDirection,
    status: filterStatus && filterStatus !== "all" ? filterStatus : tabStatus,
    dateFrom: serverDateRange?.from ?? null,
    dateTo: serverDateRange?.to ?? null,
    search: searchServer || null,
    soloScadute: tab === "scadute",
    soloAperte: tab === "aperte" || tab === "da_incassare" || tab === "da_pagare",
    tipo: filterTipo && filterTipo !== "all" ? filterTipo : null,
    metodo: filterMetodo && filterMetodo !== "all" ? (filterMetodo as GruppoMetodo) : null,
    // L'anno del grafico viaggia coi totali: i dodici mesi arrivano insieme al
    // riepilogo, da una sola costruzione dello scadenzario (23/11/2026).
    annoGrafico: conGraficoMesi ? Number(yearFilter) : null,
  }), [tabDirection, tabStatus, filterStatus, serverDateRange, searchServer, tab, filterTipo, filterMetodo, datePreset, conGraficoMesi, yearFilter]);

  const { scadenze, isLoading, isError, refetch, totalCount, totalPages, summary, mesiScadenze: mesiDalServer, isSummaryLoading, isSummaryError, refetchSummary, markPaid, create, cancel, cancelMany, update, annullaIncasso, updateNotes } = useScadenzario(page, pageSize, serverFilters);
  const [daAnnullare, setDaAnnullare] = useState<Scadenza | null>(null);
  const [daModificare, setDaModificare] = useState<Scadenza | null>(null);
  const [erroriAnnullamento, setErroriAnnullamento] = useState<Array<{ nome: string; motivo: string }>>([]);
  // Il dettaglio segue la riga aggiornata: dopo un incasso si vede il nuovo stato.
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const scadenzaAperta = dettaglio ? scadenze.find((x) => x.id === dettaglio) ?? null : null;
  const queryClient = useQueryClient();
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id;

  // I nomi dei mesi restano qui: dal database arrivano dodici coppie di numeri,
  // da gennaio a dicembre, già sommate.
  const mesiScadenze = useMemo(
    () => mesiDalServer?.map((m, i) => ({ month: MESI_BREVI[i], entrate: Number(m.entrate), uscite: Number(m.uscite) })),
    [mesiDalServer],
  );
  // Il mese scelto nel grafico è il filtro «Personalizzato» di quel mese esatto.
  const meseGrafico = useMemo(() => {
    if (datePreset !== "custom" || !customFrom || !customTo || !customFrom.startsWith(yearFilter)) return null;
    const m = Number(customFrom.slice(5, 7));
    const fine = format(endOfMonth(new Date(Number(yearFilter), m - 1, 1)), "yyyy-MM-dd");
    return customFrom.endsWith("-01") && customTo === fine ? m - 1 : null;
  }, [datePreset, customFrom, customTo, yearFilter]);
  const scegliMeseGrafico = (i: number) => {
    if (meseGrafico === i) { clearFilters(); return; }
    const inizio = new Date(Number(yearFilter), i, 1);
    setDatePreset("custom");
    setCustomFrom(format(inizio, "yyyy-MM-dd"));
    setCustomTo(format(endOfMonth(inizio), "yyyy-MM-dd"));
    setPage(1);
  };
  const [exporting, setExporting] = useState(false);

  // Export CSV di TUTTE le scadenze che rispettano i filtri correnti (anno/tab/ricerca),
  // non solo la pagina visibile. Anti formula-injection via exportToCSV.
  const handleExport = async () => {
    if (!companyId || ricercaInAttesa || dateInvertite) return;
    setExporting(true);
    try {
      const data = await readAllPages(async (from, to) => {
      const q = filtraScadenzario(queryFontiScadenzario(companyId)
        .select("id, due_date, direction, description, amount, paid_amount, payment_method, status, notes, order_id, cost_id, invoices(invoice_number), orders(order_code), company_costs(name, order_id, allocations, notes)"), serverFilters)
        .order("due_date", { ascending: true, nullsFirst: false }).order("id");
      return await q.range(from, to);
      });
      const [complete, note] = await Promise.all([
        completaCommesseScadenze(companyId, data as unknown as Scadenza[]),
        noteFattureScadenze(companyId, data as unknown as Scadenza[]),
      ]);
      const rows = complete.map(r => ({
          scadenza: r.due_date || "",
          tipo: r.direction === "entrata" ? "Incasso" : "Pagamento",
          descrizione: r.description || "",
          riferimento: r.invoices?.invoice_number ? `Fatt. ${r.invoices.invoice_number}` : r.orders?.order_code ? `Ord. ${r.orders.order_code}` : "",
          commesse: commesseScadenza(r),
          note: note.get(r.id) ?? "",
          metodo: etichettaMetodo(r.payment_method) ?? "",
          importo: String(r.amount ?? 0).replace(".", ","),
          residuo: String(Math.round((Number(r.amount || 0) - Number(r.paid_amount || 0)) * 100) / 100).replace(".", ","),
          stato: r.status === "da_pagare" ? (r.direction === "entrata" ? "Da incassare" : "Da pagare") : r.status === "pagata" ? (r.direction === "entrata" ? "Incassata" : "Pagata") : r.status === "parziale" ? "Parziale" : r.status === "annullata" ? "Annullata" : r.status || "",
        }));
      if (rows.length === 0) { toast.info(tr("Nessuna scadenza da esportare")); return; }
      exportToCSV(rows, [
        { key: "scadenza", label: "Scadenza" },
        { key: "tipo", label: "Tipo" },
        { key: "descrizione", label: "Descrizione" },
        { key: "riferimento", label: "Riferimento" },
        { key: "commesse", label: "Commesse" },
        { key: "note", label: "Note" },
        { key: "metodo", label: "Modalità" },
        { key: "importo", label: "Importo" },
        { key: "residuo", label: "Residuo" },
        { key: "stato", label: "Stato" },
      ], `scadenzario_${yearFilter}.csv`);
    } catch {
      toast.error(tr("Errore durante l'export"));
    } finally {
      setExporting(false);
    }
  };

  const filtered = ricercaInAttesa || dateInvertite ? [] : scadenze;
  const selezione = useSelezioneRighe(filtered, JSON.stringify([companyId, page, pageSize, serverFilters, search]));
  const annullabili = selezione.selezionate.filter((s) => !percheScadenzaNonModificabile(s));
  const escluse = selezione.selezionate.flatMap((s) => {
    const motivo = percheScadenzaNonModificabile(s);
    return motivo ? [{ nome: s.description, motivo }] : [];
  });
  const annullaSelezionate = async () => {
    const righe = [...annullabili];
    if (righe.length === 0 || cancelMany.isPending) return;
    const somma = (verso: string) => righe.filter((s) => s.direction === verso).reduce((n, s) => n + Number(s.amount), 0);
    if (!await confirm({ title: tr("Annullare {n} scadenze?", { n: righe.length }), description: tr("Entrate previste: {entrate}. Uscite previste: {uscite}. {escluse}Le scadenze manuali selezionate usciranno dagli importi ancora aperti. I pagamenti registrati restano invariati.", { entrate: formatCurrency(somma("entrata")), uscite: formatCurrency(somma("uscita")), escluse: escluse.length ? `${tr("{n} righe collegate a documenti o pagamenti restano escluse.", { n: escluse.length })} ` : "" }), confirmLabel: tr("Annulla scadenze"), variant: "destructive" })) return;
    setErroriAnnullamento([]);
    const esito = await cancelMany.mutateAsync(righe);
    selezione.mantieni(esito.errori.map((e) => e.riga.id));
    setErroriAnnullamento(esito.errori.map((e) => ({ nome: e.riga.description, motivo: e.motivo })));
  };
  const annullaSingola = async (s: Scadenza) => {
    if (!await confirm({ title: tr("Annullare questa scadenza?"), description: tr("{description}: {amount}. La scadenza uscirà dagli importi ancora aperti.", { description: String(s.description ?? ""), amount: formatCurrency(s.amount) }), confirmLabel: tr("Annulla scadenza"), variant: "destructive" })) return;
    try { await cancel.mutateAsync(s.id); setDettaglio(null); } catch { /* Il messaggio è gestito dalla mutation. */ }
  };

  // Counts for tabs — use totalCount from server for the active tab; use summary for overdue badge
  // Conteggi per tutti i tab dalla summary (year-scoped, server-side). Fallback al
  // totalCount del tab attivo se la summary non è ancora arrivata.
  const counts = useMemo(() => {
    return {
      tutte: summary?.tutte_count ?? (tab === "tutte" ? totalCount : 0),
      aperte: summary ? (summary.da_incassare_count ?? 0) + (summary.da_pagare_count ?? 0) : (tab === "aperte" ? totalCount : 0),
      da_incassare: summary?.da_incassare_count ?? (tab === "da_incassare" ? totalCount : 0),
      da_pagare: summary?.da_pagare_count ?? (tab === "da_pagare" ? totalCount : 0),
      scadute: summary?.scadute_count ?? (tab === "scadute" ? totalCount : 0),
      pagate: summary?.pagate_count ?? (tab === "pagate" ? totalCount : 0),
    };
  }, [tab, totalCount, summary]);

  const anni = Array.from({ length: 6 }, (_, i) => String(currentYear - i));
  const periodiRapidi = DATE_PRESETS.map((p) => ({ ...p, label: tr(p.label) }));
  const periodiAnno = [
    ...anni.map(anno => ({ value: `anno:${anno}`, label: tr("Tutto il {anno}", { anno }) })),
    { value: "anno:all", label: tr("Tutti gli anni") },
  ];
  const visteCompatte = [
    { value: "aperte", label: tr("Aperte") },
    { value: "tutte", label: tr("Tutte") },
    { value: "da_incassare", label: tr("Da incassare") },
    { value: "da_pagare", label: tr("Da pagare") },
    { value: "scadute", label: tr("Scadute") },
    { value: "pagate", label: tr("Pagate") },
    ...viste,
    ...((summary?.senza_data_count || tab === "senza_data") ? [{ value: "senza_data", label: tr("Senza data") }] : []),
  ];
  const nSenzaData = summary?.senza_data_count ?? 0;
  const conDatiMesi = !!mesiScadenze?.some((m) => m.entrate > 0 || m.uscite > 0);
  const conDistinte = !!companyId && !permessi.solaLettura && (permessi.canManagePayments || role === "company_admin" || role === "super_admin");
  const exportDisabilitato = exporting || isLoading || isError || ricercaInAttesa || dateInvertite;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between max-sm:gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold max-sm:text-lg">{tr("Scadenzario")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* «Per settimana» guarda avanti e tutto lo scaduto: l'anno lì non conta. */}
          {tab !== "settimane" && tab !== "senza_data" && (
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
              <SelectTrigger className="hidden h-8 w-[120px] text-xs font-semibold lg:flex" aria-label={tr("Anno")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Tutti gli anni")}</SelectItem>
                {anni.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {vistaElenco && <div className="lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="size-11" aria-label={tr("Altre azioni dello scadenzario")}>
                  <Ellipsis aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={exportDisabilitato} onSelect={() => void handleExport()}>
                  <Download aria-hidden="true" className="mr-2 size-4" />
                  {tr("Esporta CSV")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>}
          <Button size="sm" onClick={() => setNewOpen(true)} className={cn(BOTTONE_NUOVO, "max-lg:min-h-11 max-sm:px-3 max-sm:text-sm")}>
            <Plus className="h-3.5 w-3.5" /> <span className="max-sm:hidden">{tr("Nuova Scadenza")}</span><span className="sm:hidden">{tr("Nuova")}</span>
          </Button>
        </div>
      </div>

      {nSenzaData > 0 && vistaCompatta && (
        // Da computer è un bottone nella riga delle viste (25/11/2026): la fascia occupava 58px.
        <div className="flex flex-wrap items-center gap-2 rounded-lg border text-sm lg:hidden">
          <span className="max-lg:hidden">{tr("{nSenzaData} importi aperti senza data. Completa la data nella commessa o nel costo.", { nSenzaData: String(nSenzaData ?? "") })}</span>
          {tab === "senza_data" ? (
            <Button size="sm" variant="ghost" className="lg:h-8 lg:px-2.5 lg:text-xs max-lg:min-h-11 max-lg:w-full max-lg:justify-start"
              onClick={() => { setTab("aperte"); setPage(1); }}>
              <ChevronLeft aria-hidden="true" className="mr-1.5 size-4 lg:hidden" />
              {tr("Torna alle aperte")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="lg:h-8 lg:px-2.5 lg:text-xs max-lg:min-h-11 max-lg:w-full max-lg:justify-between max-lg:border-0"
              onClick={() => { clearFilters(); setTab("senza_data"); }}>
              <span className="hidden lg:inline">{tr("Mostra senza data")}</span>
              <span className="flex items-center gap-2 lg:hidden">
                <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
                {tr("{n} senza data", { n: nSenzaData })}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground lg:hidden" />
            </Button>
          )}
        </div>
      )}

      {/* KPIs — mobile: due numeri (lo scaduto da incassare filtra le scadute). */}
      {/* «Per settimana» ha i suoi numeri, dalla stessa fonte dell'elenco: questi leggono solo la tabella delle
          scadenze dell'anno scelto, e accanto a quell'elenco dicevano cifre diverse per la stessa domanda. */}
      {tab !== "rate" && tab !== "settimane" && (isSummaryError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{tr("Riepilogo scadenze non disponibile. I totali non sono aggiornati.")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchSummary()}>{tr("Riprova riepilogo")}</Button>
        </div>
      ) : <ScadenzarioKPIs summary={summary} isLoading={isSummaryLoading} className="max-lg:hidden" scaduteAttive={tab === "scadute"} onScadute={() => { setTab((t) => (t === "scadute" ? "aperte" : "scadute")); setPage(1); }} />)}
      {summary && !isSummaryError && tab !== "rate" && tab !== "settimane" && (
        <KpiMobili
          className="lg:hidden"
          voci={[
            {
              // filtra l'elenco sulle scadute: il numero è quello delle scadenze qui sotto
              label: tr("Scadenze scadute"),
              valore: new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(summary.scadute_entrata_amount ?? summary.scadute_amount ?? 0),
              tono: (summary.scadute_entrata_amount ?? summary.scadute_amount ?? 0) > 0 ? "text-rose-600" : undefined,
              onClick: () => { setTab((t) => (t === "scadute" ? "aperte" : "scadute")); setPage(1); },
              attivo: tab === "scadute",
            },
            {
              label: tr("Prossimi 30 giorni"),
              valore: new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(summary.prossimi_30gg_amount ?? 0),
            },
          ]}
        />
      )}

      {graficoAperto && conGraficoMesi && conDatiMesi && (
        <GraficoEntrateUscite
          dati={mesiScadenze}
          titolo={tr("Incassi e pagamenti per mese di scadenza, {yearFilter}", { yearFilter })}
          nomeEntrate={tr("Incassi")}
          nomeUscite={tr("Pagamenti")}
          notaPeriodo={tr("scadenze del {anno}", { anno: yearFilter })}
          onMese={scegliMeseGrafico}
          meseScelto={meseGrafico}
        />
      )}

      {companyId && conDistinte && vistaCompatta && <div className="flex justify-end lg:hidden"><DistintePagamenti key={companyId} companyId={companyId} /></div>}

      {/* Fatture passive caricate in chat (Silvio) da confermare */}
      <FattureDaRegistrareCard companyId={companyId} />

      {/* Mobile: ricerca e bottone dei filtri (linguette, periodo e tipo nel pannello). */}
      <CercaConFiltri
        className="lg:hidden"
        segnaposto={tr("Cerca scadenze")}
        valore={search}
        onCambia={(v) => { setSearch(v); setPage(1); }}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      <div className="space-y-2 max-lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Tabs className="min-w-0 flex-1 overflow-x-auto" value={tab} onValueChange={v => { setTab(v); setPage(1); }}>
            <TabsList className="inline-flex h-8 w-max justify-start gap-0.5 p-0.5 [&>button]:px-2.5 [&>button]:text-xs">
              <TabsTrigger value="aperte">{tr("Aperte")}<span className="hidden xl:inline">&nbsp;({counts.aperte})</span></TabsTrigger>
              <TabsTrigger value="tutte">{tr("Tutte")}<span className="hidden xl:inline">&nbsp;({counts.tutte})</span></TabsTrigger>
              <TabsTrigger value="da_incassare">{tr("Da Incassare")}<span className="hidden xl:inline">&nbsp;({counts.da_incassare})</span></TabsTrigger>
              <TabsTrigger value="da_pagare">{tr("Da Pagare")}<span className="hidden xl:inline">&nbsp;({counts.da_pagare})</span></TabsTrigger>
              <TabsTrigger value="scadute">{tr("Scadute")}{counts.scadute > 0 && <span className="ml-1 font-semibold text-destructive">({counts.scadute})</span>}</TabsTrigger>
              <TabsTrigger value="pagate">{tr("Pagate")}<span className="hidden xl:inline">&nbsp;({counts.pagate})</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant={vistaElenco ? "outline" : "secondary"} size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" aria-label={tr("Altre viste dello scadenzario")}>
              {viste.find(v => v.value === tab)?.label ?? tr("Altre viste")}<ChevronDown className="h-3.5 w-3.5" />
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{viste.map(v => <DropdownMenuItem key={v.value} onSelect={() => { setTab(v.value); setPage(1); }}>{v.label}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          {nSenzaData > 0 && !vistaCompatta && (tab === "senza_data" ? (
            <Button size="sm" variant="ghost" className={cn(BOTTONE_SECONDARIO, "shrink-0")} onClick={() => { setTab("aperte"); setPage(1); }}>
              <ChevronLeft aria-hidden="true" />{tr("Torna alle aperte")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className={cn(BOTTONE_SECONDARIO, "shrink-0")}
              title={tr("{nSenzaData} importi aperti senza data. Completa la data nella commessa o nel costo.", { nSenzaData: String(nSenzaData ?? "") })}
              onClick={() => { clearFilters(); setTab("senza_data"); }}>
              <CalendarClock aria-hidden="true" className="text-amber-600" />{tr("{n} senza data", { n: nSenzaData })}
            </Button>
          ))}
          {conGraficoMesi && conDatiMesi && (
            <Button size="sm" variant={graficoAperto ? "secondary" : "outline"} className={cn(BOTTONE_SECONDARIO, "shrink-0")}
              aria-expanded={graficoAperto} title={tr("Andamento nei mesi")} onClick={alternaGrafico}>
              <BarChart3 aria-hidden="true" />{tr("Grafico")}
            </Button>
          )}
          {companyId && conDistinte && !vistaCompatta && <DistintePagamenti key={companyId} companyId={companyId} />}
        </div>
        {tab !== "adempimenti" && <div className="flex flex-wrap items-center gap-2">
          <div className={cn(RICERCA_BARRA, "max-sm:w-full")}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={tr("Cerca nello scadenzario")} placeholder={tr("Cerca cliente, fornitore o descrizione…")} value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-8 pl-8 text-xs" />
          </div>
          {vistaElenco && <>
            <FiltriScadenzario valore={valoriFiltri} anno={yearFilter} periodi={periodiRapidi}
              aperto={showFilters} onAperto={setShowFilters} cambia={cambiaFiltri} azzera={clearFilters} />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleExport}
              disabled={exportDisabilitato} title={tr("Esporta CSV")} aria-label={tr("Esporta CSV")}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </>}
        </div>}
        {vistaElenco && <FiltriScadenzarioAttivi valore={valoriFiltri} cambia={cambiaFiltri} azzera={clearFilters} />}
      </div>

      {/* Adempimenti Fiscali tab */}
      {tab === "rate" ? (
        companyId && <RateFornitori key={companyId} companyId={companyId} anno={yearFilter} cerca={search} />
      ) : tab === "settimane" ? (
        <IncassiPerSettimanaVista cerca={search} />
      ) : tab === "adempimenti" ? (
        <AdempimentiFiscali />
      ) : (
        /* Table */
        dateInvertite ? (
          <p role="alert" className="text-sm text-destructive">{tr("La data finale deve essere uguale o successiva a quella iniziale.")}</p>
        ) : isLoading || ricercaInAttesa ? (
          <div role="status" aria-label={tr("Caricamento scadenze")} className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{tr("Non riesco a caricare le scadenze. Riprova senza modificare i filtri.")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{tr("Riprova scadenze")}</Button>
          </div>
        ) : (
          <>
            {!permessi.solaLettura && selezione.selezionate.length > 0 && <BarraSelezioneRighe nome={tr("le scadenze")} selezionate={selezione.selezionate.length} consentite={annullabili.length}
              tutte={selezione.tutte} parziale={selezione.parziale}
              entrate={annullabili.filter((s) => s.direction === "entrata").reduce((n, s) => n + Number(s.amount), 0)}
              uscite={annullabili.filter((s) => s.direction === "uscita").reduce((n, s) => n + Number(s.amount), 0)}
              azione={tr("Annulla selezionate")} inCorso={cancelMany.isPending} escluse={escluse} onPagina={selezione.pagina} onAzione={() => void annullaSelezionate()} />}
            <ErroriOperazioneRighe errori={erroriAnnullamento} />
            <ScadenzarioTable
              scadenze={filtered}
              onNota={(s, nota) => updateNotes(s.id, nota)}
              onMarkPaid={apriPagamento}
              pagaSulPosto={pagaSulPosto}
              onCancel={(id) => { const s = scadenze.find((x) => x.id === id); if (s) void annullaSingola(s); }}
              onModifica={!permessi.solaLettura ? setDaModificare : undefined}
              selezionate={selezione.ids}
              onSeleziona={!permessi.solaLettura ? selezione.alterna : undefined}
              onSelezionaPagina={!permessi.solaLettura ? selezione.pagina : undefined}
              tutteSelezionate={selezione.tutte}
              selezioneParziale={selezione.parziale}
              inCorso={cancelMany.isPending || cancel.isPending || update.isPending}
              onAnnullaIncasso={setDaAnnullare}
              onAdd={() => setNewOpen(true)}
              onRowClick={(s) => setDettaglio(s.id)}
            />
            {/* Mobile: solo precedente/successiva (via righe per pagina e salti). Il
                contenitore c'è solo quando la paginazione compare, per non
                lasciare un margine vuoto sul desktop. */}
            {totalCount > 25 && (
              <div className="max-lg:hidden">
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between lg:hidden">
                <Button variant="outline" size="icon" className="size-11" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={tr("Pagina precedente")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">{tr("{n} di {totale}", { n: String(page ?? ""), totale: String(totalPages ?? "") })}</span>
                <Button variant="outline" size="icon" className="size-11" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label={tr("Pagina successiva")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )
      )}

      {/* Filtri di telefono e tablet. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setTab("aperte"); setYearFilter(String(currentYear)); clearFilters(); }}
        risultati={isLoading || ricercaInAttesa || dateInvertite || !vistaElenco ? undefined : totalCount}
      >
        <GruppoFiltri>
          <SceltaFiltro titolo={tr("Vista")} valore={tab} scelte={visteCompatte}
            onScegli={v => { setTab(v); setPage(1); }} />
          {((vistaElenco && tab !== "senza_data") || tab === "rate") && (
            <SceltaFiltro titolo={tr("Periodo")} valore={tab === "rate" ? `anno:${yearFilter}` : datePreset || `anno:${yearFilter}`}
              scelte={tab === "rate" ? periodiAnno : [...periodiAnno, ...periodiRapidi]}
              onScegli={v => {
                if (v.startsWith("anno:")) {
                  setYearFilter(v.slice(5));
                  if (tab !== "rate") setDatePreset("");
                } else {
                  setDatePreset(v);
                }
                setPage(1);
              }} />
          )}
          {vistaElenco && tab !== "senza_data" && datePreset === "custom" && (
            <DateFiltro dal={customFrom} al={customTo}
              cambiaDal={dal => cambiaFiltri({ dal })} cambiaAl={al => cambiaFiltri({ al })} />
          )}
          {vistaElenco && <DettaglioFiltri titolo={tr("Altri filtri")} riepilogo={nAltriFiltri ? String(nAltriFiltri) : undefined}>
            <SceltaFiltro titolo={tr("Pagamento")} valore={filterMetodo || "all"}
              onScegli={v => cambiaFiltri({ metodo: v === "all" ? "" : v })}
              scelte={[{ value: "all", label: tr("Tutti") }, ...GRUPPI_METODO.map((g) => ({ ...g, label: tr(g.label) }))]} />
            <SceltaFiltro titolo={tr("Tipo")} valore={filterTipo || "all"}
              onScegli={v => cambiaFiltri({ tipo: v === "all" ? "" : v })}
              scelte={[
                { value: "all", label: tr("Tutti") },
                { value: "incasso_cliente", label: tr("Incasso cliente") },
                { value: "pagamento_fornitore", label: tr("Fornitore") },
                { value: "costo_aziendale", label: tr("Costo aziendale") },
                { value: "scadenza_fiscale", label: tr("Fiscale") },
                { value: "altro", label: tr("Altro") },
              ]} />
            <FiltroStatoScadenzeCompatto stato={filterStatus} cambia={stato => cambiaFiltri({ stato })} />
          </DettaglioFiltri>}
        </GruppoFiltri>
      </PannelloFiltri>

      {/* Dialogs */}
      {scadenzaAperta && (
        <ScadenzaDettaglio
          scadenza={scadenzaAperta}
          onClose={() => setDettaglio(null)}
          onMarkPaid={(x) => { setDettaglio(null); apriPagamento(x); }}
          pagaSulPosto={pagaSulPosto}
          onAnnullaIncasso={(x) => { setDettaglio(null); setDaAnnullare(x); }}
          onNota={(x, nota) => updateNotes(x.id, nota)}
          onModifica={!permessi.solaLettura ? (s) => { setDettaglio(null); setDaModificare(s); } : undefined}
          onAnnullaScadenza={!permessi.solaLettura ? (s) => void annullaSingola(s) : undefined}
        />
      )}
      {pagaCosto && <ExpensePaymentDialog key={pagaCosto.costId} costId={pagaCosto.costId} importoProposto={pagaCosto.importo}
        apriInRegistrazione onClose={() => setPagaCosto(null)} />}
      <MarkPaidDialog
        scadenza={payDialog}
        open={!!payDialog}
        onOpenChange={(o) => !o && setPayDialog(null)}
        onConfirm={(p) => {
          markPaid.mutate(p, { onSuccess: () => setPayDialog(null) });
        }}
        isPending={markPaid.isPending}
      />
      {daModificare && <ModificaScadenzaDialog key={`${daModificare.id}-${daModificare.updated_at}`} scadenza={daModificare} onClose={() => setDaModificare(null)} isPending={update.isPending}
        onConfirm={async (dati) => { await update.mutateAsync({ riga: daModificare, dati }); setDaModificare(null); }} />}
      <AnnullaIncassoDialog
        scadenza={daAnnullare}
        onClose={() => setDaAnnullare(null)}
        isPending={annullaIncasso.isPending}
        onConfirm={(id) => annullaIncasso.mutate(id, {
          onSuccess: () => {
            invalidaFattureImportate(queryClient, effectiveCompany?.id);
            setDaAnnullare(null);
          },
        })}
      />
      <NewScadenzaDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => {
          create.mutate(p, { onSuccess: () => setNewOpen(false) });
        }}
        isPending={create.isPending}
      />
    </div>
  );
}
