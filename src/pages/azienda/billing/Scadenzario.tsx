import { useState, useMemo, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Search, Filter, X, Download, ChevronLeft, ChevronRight } from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";
import { exportToCSV } from "@/lib/csvExport";
import { useScadenzario, type ScadenzarioFilters } from "@/hooks/useScadenzario";
import { invalidaFattureImportate } from "@/components/fatturazione/GestionaleEsterno";
import { AnnullaIncassoDialog } from "@/components/scadenzario/AnnullaIncassoDialog";
import ScadenzarioKPIs from "@/components/scadenzario/ScadenzarioKPIs";
import { RateFornitori } from "@/components/scadenzario/RateFornitori";
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
import { GRUPPI_METODO, etichettaMetodo, filtroMetodo, type GruppoMetodo } from "@/lib/finance/metodoScadenza";

import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";
import { BarraSelezioneRighe, ErroriOperazioneRighe } from "@/components/shared/BarraSelezioneRighe";
import { ModificaScadenzaDialog } from "@/components/scadenzario/ModificaScadenzaDialog";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";
import { formatCurrency } from "@/lib/formatters";
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Periodi rapidi (16/11/2026): quelli che servono davvero a chi paga e incassa. «Da» e «A»
// restano sempre visibili accanto: toccarli rende il periodo «Personalizzato».
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
  const confirm = useConfirm();
  const permessi = usePermissions();
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Si apre su «Aperte» (16/11/2026): quello che resta da incassare e da pagare, scadute comprese.
  // Lo scadenzario serve a vedere cosa manca; le pagate stanno in «Tutte» e «Pagate».
  const [tab, setTab] = useState("aperte");
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<Scadenza | null>(null);
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

  const hasActiveFilters = datePreset || filterTipo || filterStatus || filterMetodo;
  // Mobile: linguette, periodo e tipo in un pannello dal basso.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const nFiltriMobile = [tab !== "aperte", !!datePreset && datePreset !== "all", !!filterTipo && filterTipo !== "all"].filter(Boolean).length;

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
  }, [datePreset, customFrom, customTo, yearFilter]);

  // La ricerca va al server con un attimo di attesa: prima filtrava solo le
  // righe gia' scaricate, quindi cercare una fattura finita in seconda pagina
  // rispondeva "nessuna scadenza trovata" pur essendoci.
  const [searchServer, setSearchServer] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      // Nuova ricerca = si riparte dalla prima pagina, altrimenti restando su
      // pagina 3 di un elenco piu' corto si vedrebbe il vuoto.
      setSearchServer((prev) => {
        const next = search.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const serverFilters: ScadenzarioFilters = useMemo(() => ({
    direction: tabDirection,
    status: filterStatus && filterStatus !== "all" ? filterStatus : tabStatus,
    dateFrom: serverDateRange?.from ?? null,
    dateTo: serverDateRange?.to ?? null,
    search: searchServer || null,
    soloScadute: tab === "scadute",
    soloAperte: tab === "aperte" || tab === "da_incassare" || tab === "da_pagare",
    tipo: filterTipo && filterTipo !== "all" ? filterTipo : null,
    metodo: filterMetodo && filterMetodo !== "all" ? (filterMetodo as GruppoMetodo) : null,
  }), [tabDirection, tabStatus, filterStatus, serverDateRange, searchServer, tab, filterTipo, filterMetodo]);

  const { scadenze, isLoading, isError, refetch, totalCount, totalPages, summary, isSummaryLoading, isSummaryError, refetchSummary, markPaid, create, cancel, cancelMany, update, annullaIncasso, updateNotes } = useScadenzario(page, pageSize, serverFilters);
  const [daAnnullare, setDaAnnullare] = useState<Scadenza | null>(null);
  const [daModificare, setDaModificare] = useState<Scadenza | null>(null);
  const [erroriAnnullamento, setErroriAnnullamento] = useState<Array<{ nome: string; motivo: string }>>([]);
  // Il dettaglio segue la riga aggiornata: dopo un incasso si vede il nuovo stato.
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const scadenzaAperta = dettaglio ? scadenze.find((x) => x.id === dettaglio) ?? null : null;
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Da incassare e da pagare per mese di scadenza dell'anno scelto (16/11/2026): il grafico
  // sopra l'elenco. Solo da tablet in su e con un anno scelto; le annullate non contano.
  const conGraficoMesi = !isMobile && yearFilter !== "all" && tab !== "rate" && tab !== "settimane" && tab !== "adempimenti";
  const { data: mesiScadenze } = useQuery({
    queryKey: ["scadenzario", "mesi", companyId, yearFilter],
    enabled: !!companyId && conGraficoMesi,
    staleTime: 60_000,
    queryFn: async () => {
      const righe = await readAllPages<{ direction: string; amount: number | null; due_date: string }>((from, to) => supabase
        .from("scadenze").select("direction, amount, due_date")
        .eq("company_id", companyId!).neq("status", "annullata")
        .gte("due_date", `${yearFilter}-01-01`).lte("due_date", `${yearFilter}-12-31`)
        .order("id").range(from, to) as never);
      const mesi = MESI_BREVI.map((m) => ({ month: m, entrate: 0, uscite: 0 }));
      for (const r of righe) {
        const i = Number(r.due_date?.slice(5, 7)) - 1;
        if (!(i >= 0 && i < 12)) continue;
        if (r.direction === "entrata") mesi[i].entrate += Number(r.amount ?? 0);
        else if (r.direction === "uscita") mesi[i].uscite += Number(r.amount ?? 0);
      }
      return mesi;
    },
  });
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
    setShowFilters(true);
    setPage(1);
  };
  const [exporting, setExporting] = useState(false);

  // Export CSV di TUTTE le scadenze che rispettano i filtri correnti (anno/tab/ricerca),
  // non solo la pagina visibile. Anti formula-injection via exportToCSV.
  const handleExport = async () => {
    if (!companyId) return;
    setExporting(true);
    try {
      const data = await readAllPages(async (from, to) => {
      let q = supabase
        .from("scadenze")
        .select("due_date, direction, description, amount, paid_amount, status, invoices(invoice_number), orders(order_code)")
        .eq("company_id", companyId)
        .order("due_date", { ascending: true })
        .order("id", { ascending: true });
      if (serverFilters.dateFrom) q = q.gte("due_date", serverFilters.dateFrom);
      if (serverFilters.dateTo) q = q.lte("due_date", serverFilters.dateTo);
      if (serverFilters.direction) q = q.eq("direction", serverFilters.direction);
      if (serverFilters.status) q = q.eq("status", serverFilters.status);
      else q = q.neq("status", "annullata");
      if (serverFilters.soloAperte || serverFilters.soloScadute) q = q.in("status", ["da_pagare", "parziale"]);
      if (serverFilters.soloScadute) q = q.lt("due_date", format(new Date(), "yyyy-MM-dd"));
      if (serverFilters.tipo) q = q.eq("tipo", serverFilters.tipo);
      if (serverFilters.metodo) q = q.or(filtroMetodo(serverFilters.metodo));
      if (serverFilters.search) q = q.ilike("description", `%${serverFilters.search}%`);
      return await q.range(from, to);
      });
      const s = (search || "").toLowerCase();
      const rows = (data || [])
        .filter((r: any) => !s || (r.description || "").toLowerCase().includes(s) || (r.invoices?.invoice_number || "").toLowerCase().includes(s))
        .map((r: any) => ({
          scadenza: r.due_date || "",
          tipo: r.direction === "entrata" ? "Incasso" : "Pagamento",
          descrizione: r.description || "",
          riferimento: r.invoices?.invoice_number ? `Fatt. ${r.invoices.invoice_number}` : r.orders?.order_code ? `Ord. ${r.orders.order_code}` : "",
          metodo: etichettaMetodo(r.payment_method) ?? "",
          importo: String(r.amount ?? 0).replace(".", ","),
          residuo: String(Math.round((Number(r.amount || 0) - Number(r.paid_amount || 0)) * 100) / 100).replace(".", ","),
          stato: r.status === "da_pagare" ? (r.direction === "entrata" ? "Da incassare" : "Da pagare") : r.status === "pagata" ? (r.direction === "entrata" ? "Incassata" : "Pagata") : r.status === "parziale" ? "Parziale" : r.status === "annullata" ? "Annullata" : r.status || "",
        }));
      if (rows.length === 0) { toast.info("Nessuna scadenza da esportare"); return; }
      exportToCSV(rows, [
        { key: "scadenza", label: "Scadenza" },
        { key: "tipo", label: "Tipo" },
        { key: "descrizione", label: "Descrizione" },
        { key: "riferimento", label: "Riferimento" },
        { key: "metodo", label: "Modalità" },
        { key: "importo", label: "Importo" },
        { key: "residuo", label: "Residuo" },
        { key: "stato", label: "Stato" },
      ], `scadenzario_${yearFilter}.csv`);
    } catch {
      toast.error("Errore durante l'export");
    } finally {
      setExporting(false);
    }
  };

  // Client-side search filter (text search remains client-side)
  const filtered = useMemo(() => {
    if (!search.trim()) return scadenze;
    const q = search.toLowerCase();
    return scadenze.filter((s) =>
      s.description.toLowerCase().includes(q) ||
      s.suppliers?.name?.toLowerCase().includes(q) ||
      s.invoices?.client_company_name?.toLowerCase().includes(q) ||
      s.invoices?.invoice_number?.toLowerCase().includes(q) ||
      s.marketing_contacts?.company_name?.toLowerCase().includes(q)
    );
  }, [scadenze, search]);
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
    if (!await confirm({ title: `Annullare ${righe.length} scadenze?`, description: `Entrate previste: ${formatCurrency(somma("entrata"))}. Uscite previste: ${formatCurrency(somma("uscita"))}. ${escluse.length ? `${escluse.length} righe collegate a documenti o pagamenti restano escluse. ` : ""}Le scadenze manuali selezionate usciranno dagli importi ancora aperti. I pagamenti registrati restano invariati.`, confirmLabel: "Annulla scadenze", variant: "destructive" })) return;
    setErroriAnnullamento([]);
    const esito = await cancelMany.mutateAsync(righe);
    selezione.mantieni(esito.errori.map((e) => e.riga.id));
    setErroriAnnullamento(esito.errori.map((e) => ({ nome: e.riga.description, motivo: e.motivo })));
  };
  const annullaSingola = async (s: Scadenza) => {
    if (!await confirm({ title: "Annullare questa scadenza?", description: `${s.description}: ${formatCurrency(s.amount)}. La scadenza uscirà dagli importi ancora aperti.`, confirmLabel: "Annulla scadenza", variant: "destructive" })) return;
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

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header — mobile: titolo 18px, anno e «Nuova» piccoli sulla stessa riga
          (prima il bottone usciva dallo schermo: pagina larga 488px). */}
      <div className="flex items-center justify-between max-sm:gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold max-sm:text-lg">Scadenzario</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* «Per settimana» guarda avanti e tutto lo scaduto: l'anno lì non conta. */}
          {tab !== "settimane" && (
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[140px] font-semibold max-sm:h-8 max-sm:w-[84px] max-sm:text-xs" aria-label="Anno"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli anni</SelectItem>
                {Array.from({ length: 6 }, (_, i) => String(currentYear - i)).map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setNewOpen(true)} className="tap-compact bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-8 max-sm:px-3 max-sm:text-xs">
            <Plus className="h-4 w-4 mr-1" /> <span className="max-sm:hidden">Nuova Scadenza</span><span className="sm:hidden">Nuova</span>
          </Button>
        </div>
      </div>

      {/* KPIs — mobile: due numeri (lo scaduto da incassare filtra le scadute). */}
      {/* «Per settimana» ha i suoi numeri, dalla stessa fonte dell'elenco: questi leggono solo la tabella delle
          scadenze dell'anno scelto, e accanto a quell'elenco dicevano cifre diverse per la stessa domanda. */}
      {tab !== "rate" && tab !== "settimane" && (isSummaryError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>Riepilogo scadenze non disponibile. I totali non sono aggiornati.</p>
          <Button variant="outline" size="sm" onClick={() => void refetchSummary()}>Riprova riepilogo</Button>
        </div>
      ) : <ScadenzarioKPIs summary={summary} isLoading={isSummaryLoading} className="max-sm:hidden" scaduteAttive={tab === "scadute"} onScadute={() => { setTab((t) => (t === "scadute" ? "aperte" : "scadute")); setPage(1); }} />)}
      {summary && !isSummaryError && tab !== "rate" && tab !== "settimane" && (
        <KpiMobili
          className="sm:hidden"
          voci={[
            {
              // filtra l'elenco sulle scadute: il numero è quello delle scadenze qui sotto
              label: "Scadenze scadute",
              valore: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(summary.scadute_entrata_amount ?? summary.scadute_amount ?? 0),
              tono: (summary.scadute_entrata_amount ?? summary.scadute_amount ?? 0) > 0 ? "text-rose-600" : undefined,
              onClick: () => { setTab((t) => (t === "scadute" ? "aperte" : "scadute")); setPage(1); },
              attivo: tab === "scadute",
            },
            {
              label: "Prossimi 30 giorni",
              valore: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(summary.prossimi_30gg_amount ?? 0),
            },
          ]}
        />
      )}

      {conGraficoMesi && mesiScadenze && mesiScadenze.some((m) => m.entrate > 0 || m.uscite > 0) && (
        <GraficoEntrateUscite
          dati={mesiScadenze}
          titolo={`Incassi e pagamenti per mese di scadenza, ${yearFilter}`}
          nomeEntrate="Incassi"
          nomeUscite="Pagamenti"
          notaPeriodo={`scadenze del ${yearFilter}`}
          onMese={scegliMeseGrafico}
          meseScelto={meseGrafico}
        />
      )}

      {/* Fatture passive caricate in chat (Silvio) da confermare */}
      <FattureDaRegistrareCard companyId={companyId} />

      {/* Mobile: ricerca e bottone dei filtri (linguette, periodo e tipo nel pannello). */}
      <CercaConFiltri
        className="sm:hidden"
        valore={search}
        onCambia={(v) => { setSearch(v); setPage(1); }}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Tabs + Search + Filters toggle */}
      <div className="flex flex-col gap-3 max-sm:hidden">
        {/* Linguette su una riga sola e ricerca accanto se ci stanno, sotto se
            no: a 1024 le linguette andavano su due righe dentro il riquadro. */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
            <TabsList className="flex h-auto gap-1 p-1 justify-start">
              {/* Conteggi su tutti i tab (year-scoped, dalla summary server-side).
                  Sotto 1280 resta solo quello delle scadute: con tutti i numeri la
                  riga era 753px e a 768/1024 usciva dal riquadro. */}
              <TabsTrigger value="aperte">Aperte<span className="hidden xl:inline">&nbsp;({counts.aperte})</span></TabsTrigger>
              <TabsTrigger value="tutte">Tutte<span className="hidden xl:inline">&nbsp;({counts.tutte})</span></TabsTrigger>
              <TabsTrigger value="da_incassare">Da Incassare<span className="hidden xl:inline">&nbsp;({counts.da_incassare})</span></TabsTrigger>
              <TabsTrigger value="rate">Rate fornitori</TabsTrigger>
              <TabsTrigger value="da_pagare">Da Pagare<span className="hidden xl:inline">&nbsp;({counts.da_pagare})</span></TabsTrigger>
              <TabsTrigger value="scadute">
                Scadute {counts.scadute > 0 && <span className="ml-1 text-destructive font-bold">({counts.scadute})</span>}
              </TabsTrigger>
              <TabsTrigger value="pagate">Pagate<span className="hidden xl:inline">&nbsp;({counts.pagate})</span></TabsTrigger>
              <TabsTrigger value="settimane">Per settimana</TabsTrigger>
              <TabsTrigger value="adempimenti">Adempimenti Fiscali</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Cerca nello scadenzario"
                placeholder="Cerca..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Filtri avanzati scadenzario"
              aria-expanded={showFilters}
              className={tab === "rate" ? "hidden" : "relative"}
            >
              <Filter className="h-4 w-4" />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
              )}
            </Button>
            {/* Niente export su telefono: icon-only non lo rende un'altra cosa. */}
            {!isMobile && tab !== "rate" && (
              <Button variant="outline" size="icon" onClick={handleExport} disabled={exporting || isLoading || isError} title="Esporta CSV" aria-label="Esporta CSV">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Advanced filters row */}
        {showFilters && tab !== "rate" && (
          <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Periodo</label>
              <Select value={datePreset} onValueChange={(v) => { setDatePreset(v); setPage(1); }}>
                <SelectTrigger aria-label="Periodo scadenze" className="w-[170px] h-9 text-sm">
                  <SelectValue placeholder={yearFilter === "all" ? "Tutti gli anni" : `Tutto il ${yearFilter}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{yearFilter === "all" ? "Tutti gli anni" : `Tutto il ${yearFilter}`}</SelectItem>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* «Da» e «A» sempre a vista, con le date del periodo scelto: cambiarle lo rende «Personalizzato». */}
            {(() => {
              const r = datePreset && datePreset !== "custom" && datePreset !== "all" ? getDateRange(datePreset) : null;
              const da = datePreset === "custom" ? customFrom : r?.from ?? (yearFilter !== "all" && !datePreset ? `${yearFilter}-01-01` : "");
              const a = datePreset === "custom" ? customTo : r?.to ?? (yearFilter !== "all" && !datePreset ? `${yearFilter}-12-31` : "");
              const personalizza = (campo: "da" | "a", v: string) => {
                setDatePreset("custom");
                setCustomFrom(campo === "da" ? v : da);
                setCustomTo(campo === "a" ? v : a);
                setPage(1);
              };
              return (
                <>
                  <div className="space-y-1">
                    <label htmlFor="scad-da" className="text-xs font-medium text-muted-foreground">Da</label>
                    <Input id="scad-da" type="date" value={da} onChange={(e) => personalizza("da", e.target.value)} className="h-9 w-[150px] text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="scad-a" className="text-xs font-medium text-muted-foreground">A</label>
                    <Input id="scad-a" type="date" value={a} min={da || undefined} onChange={(e) => personalizza("a", e.target.value)} className="h-9 w-[150px] text-sm" />
                  </div>
                </>
              );
            })()}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Modalità</label>
              <Select value={filterMetodo} onValueChange={(v) => { setFilterMetodo(v); setPage(1); }}>
                <SelectTrigger aria-label="Modalità di pagamento" className="w-[150px] h-9 text-sm">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {GRUPPI_METODO.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); setPage(1); }}>
                <SelectTrigger aria-label="Tipo di scadenza" className="w-[160px] h-9 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="incasso_cliente">Incasso cliente</SelectItem>
                  <SelectItem value="pagamento_fornitore">Pagamento fornitore</SelectItem>
                  <SelectItem value="costo_aziendale">Costo aziendale</SelectItem>
                  <SelectItem value="scadenza_fiscale">Scadenza fiscale</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stato</label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger aria-label="Stato della scadenza" className="w-[140px] h-9 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="da_pagare">Da pagare</SelectItem>
                  <SelectItem value="parziale">Parziale</SelectItem>
                  <SelectItem value="pagata">Pagata</SelectItem>
                  <SelectItem value="annullata">Annullata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1">
                <X className="h-3 w-3" /> Pulisci
              </Button>
            )}
          </div>
        )}
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
        isLoading ? (
          <div role="status" aria-label="Caricamento scadenze" className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>Non riesco a caricare le scadenze. Riprova senza modificare i filtri.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova scadenze</Button>
          </div>
        ) : (
          <>
            {!permessi.solaLettura && filtered.length > 0 && <BarraSelezioneRighe nome="le scadenze" selezionate={selezione.selezionate.length} consentite={annullabili.length}
              tutte={selezione.tutte} parziale={selezione.parziale}
              entrate={annullabili.filter((s) => s.direction === "entrata").reduce((n, s) => n + Number(s.amount), 0)}
              uscite={annullabili.filter((s) => s.direction === "uscita").reduce((n, s) => n + Number(s.amount), 0)}
              azione="Annulla selezionate" inCorso={cancelMany.isPending} escluse={escluse} onPagina={selezione.pagina} onAzione={() => void annullaSelezionate()} />}
            <ErroriOperazioneRighe errori={erroriAnnullamento} />
            <ScadenzarioTable
              scadenze={filtered}
              onNota={(s, nota) => updateNotes(s.id, nota)}
              onMarkPaid={(s) => setPayDialog(s)}
              onCancel={(id) => { const s = scadenze.find((x) => x.id === id); if (s) void annullaSingola(s); }}
              onModifica={!permessi.solaLettura ? setDaModificare : undefined}
              selezionate={selezione.ids}
              onSeleziona={!permessi.solaLettura ? selezione.alterna : undefined}
              inCorso={cancelMany.isPending || cancel.isPending || update.isPending}
              onAnnullaIncasso={setDaAnnullare}
              onAdd={() => setNewOpen(true)}
              onRowClick={(s) => setDettaglio(s.id)}
            />
            {/* Mobile: solo precedente/successiva (via righe per pagina e salti). Il
                contenitore c'è solo quando la paginazione compare, per non
                lasciare un margine vuoto sul desktop. */}
            {totalCount > 25 && (
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
            {totalPages > 1 && (
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
          </>
        )
      )}

      {/* Mobile: cosa mostrare, periodo e tipo. Adempimenti fiscali e date
          personalizzate restano al desktop. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setTab("aperte"); clearFilters(); }}
        risultati={isLoading || tab === "rate" ? undefined : totalCount}
      >
        <PilloleFiltro
          titolo="Mostra"
          valore={tab === "adempimenti" || tab === "settimane" ? "aperte" : tab}
          onScegli={(v) => { setTab(v); setPage(1); }}
          scelte={[
            { value: "rate", label: "Rate fornitori" },
            { value: "settimane", label: "Per settimana" },
            { value: "aperte", label: "Aperte", n: counts.aperte },
            { value: "tutte", label: "Tutte", n: counts.tutte },
            { value: "da_incassare", label: "Da incassare", n: counts.da_incassare },
            { value: "da_pagare", label: "Da pagare", n: counts.da_pagare },
            { value: "scadute", label: "Scadute", n: counts.scadute },
            { value: "pagate", label: "Pagate", n: counts.pagate },
          ]}
        />
        {tab !== "rate" && <>
        <PilloleFiltro
          titolo="Periodo"
          valore={datePreset && datePreset !== "custom" ? datePreset : "all"}
          onScegli={(v) => { setDatePreset(v === "all" ? "" : v); setPage(1); }}
          scelte={[
            { value: "all", label: yearFilter === "all" ? "Tutti gli anni" : `Tutto il ${yearFilter}` },
            ...DATE_PRESETS.filter((p) => p.value !== "custom"),
          ]}
        />
        <PilloleFiltro
          titolo="Tipo"
          valore={filterTipo || "all"}
          onScegli={(v) => { setFilterTipo(v === "all" ? "" : v); setPage(1); }}
          scelte={[
            { value: "all", label: "Tutti" },
            { value: "incasso_cliente", label: "Incasso cliente" },
            { value: "pagamento_fornitore", label: "Fornitore" },
            { value: "costo_aziendale", label: "Costo aziendale" },
            { value: "scadenza_fiscale", label: "Fiscale" },
            { value: "altro", label: "Altro" },
          ]}
        />
        </>}
      </PannelloFiltri>

      {/* Dialogs */}
      {scadenzaAperta && (
        <ScadenzaDettaglio
          scadenza={scadenzaAperta}
          onClose={() => setDettaglio(null)}
          onMarkPaid={(x) => { setDettaglio(null); setPayDialog(x); }}
          onAnnullaIncasso={(x) => { setDettaglio(null); setDaAnnullare(x); }}
          onNota={(x, nota) => updateNotes(x.id, nota)}
          onModifica={!permessi.solaLettura ? (s) => { setDettaglio(null); setDaModificare(s); } : undefined}
          onAnnullaScadenza={!permessi.solaLettura ? (s) => void annullaSingola(s) : undefined}
        />
      )}
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
