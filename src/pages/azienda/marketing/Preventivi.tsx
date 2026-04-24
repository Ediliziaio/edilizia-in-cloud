import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AnalisiPreventivi from "./AnalisiPreventivi";
import QuoteApprovals from "./QuoteApprovals";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { queryKeys } from "@/lib/queryKeys";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";

// ─── Local types ───────────────────────────────────────────────────────────────

/** Shape returned by the quotes list query (partial select) */
interface QuoteRow {
  id: string;
  quote_number: string;
  client_name: string | null;
  title: string | null;
  status: string;
  total: number | null;
  created_at: string;
  expires_at: string | null;
  source?: string | null;
  salesperson_id?: string | null;
  approval_status?: string | null;
  contact_id?: string | null;
  opportunity_id?: string | null;
  margine_pct_snapshot?: number | null;
  commission_amount_snapshot?: number | null;
  pdf_storage_path?: string | null;
}

/** Shape returned by the KPI query (partial select) */
interface QuoteKpiRow {
  status: string;
  total: number | null;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Shape of duplicate mutation input (superset of QuoteRow) */
interface QuoteForDuplicate extends QuoteRow {
  contact_id?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_company?: string | null;
  client_address?: string | null;
  client_fiscal_code?: string | null;
  client_vat_number?: string | null;
  description?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  validity_days?: number | null;
  discount_percent?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  vat_amount?: number | null;
  [key: string]: unknown;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  QuotesFiltersSheet,
  EMPTY_QUOTE_FILTERS,
  countActiveQuoteFilters,
  type QuotesFilters,
} from "@/components/marketing/preventivi/QuotesFiltersSheet";
import { QuoteQuickViewSheet } from "@/components/marketing/preventivi/QuoteQuickViewSheet";
import {
  QuoteColumnsPicker,
  loadVisibleColumns,
  type QuoteColumnKey,
} from "@/components/marketing/preventivi/QuoteColumnsPicker";
import {
  QuoteBulkToolbar,
  type BulkQuoteLite,
} from "@/components/marketing/preventivi/QuoteBulkToolbar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Copy,
  Trash2,
  FileSignature,
  Loader2,
  FileText,
  Download,
  TrendingUp,
  Clock,
  Target,
  BrainCircuit,
  Percent,
  FileUp,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { ComputoUploadModal } from "@/components/computo/ComputoUploadModal";

export default function Preventivi() {
  const { effectiveCompany, user, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "lista";
  const isAdmin = role === "company_admin" || role === "super_admin";
  const handleTabChange = (tab: string) => {
    setSearchParams(tab === "lista" ? {} : { tab });
  };

  // Count richieste approvazione sconto pending (solo per admin — badge nel tab)
  const { data: pendingApprovalsCount = 0 } = useQuery({
    queryKey: ["quote-approvals-pending-count", companyId],
    enabled: !!companyId && isAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("quote_approvals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .is("decision", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Sprint 3: accetta drill-down da Sales OS via ?status=inviata
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const qpStatus = searchParams.get("status");
    return qpStatus || "tutti";
  });
  useEffect(() => {
    if (searchParams.has("status")) {
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState("");
  // Filtri avanzati v4 — centralizzati in QuotesFilters (sheet laterale)
  const [filters, setFilters] = useState<QuotesFilters>(EMPTY_QUOTE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteQuote, setDeleteQuote] = useState<QuoteRow | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [showComputoModal, setShowComputoModal] = useState(false);
  const [showFotoModal, setShowFotoModal] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  // Bulk + colonne (Sprint 5)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<QuoteColumnKey>>(() =>
    loadVisibleColumns()
  );
  const isColVisible = (k: QuoteColumnKey) => visibleColumns.has(k);

  // Debounce ricerca: aspetta 300ms prima di filtrare, resetta la pagina
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: quotesPage = { data: [], total: 0 }, isLoading } = useQuery({
    queryKey: [...queryKeys.quotes.list(companyId), currentPage, statusFilter, filters],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("quotes")
        .select("id, quote_number, client_name, title, status, total, created_at, expires_at, source, salesperson_id, approval_status, contact_id, opportunity_id, margine_pct_snapshot, commission_amount_snapshot, pdf_storage_path", { count: "exact" })
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "tutti") {
        query = query.eq("status", statusFilter);
      }
      if (filters.statuses.length > 0) {
        query = query.in("status", filters.statuses);
      }
      if (filters.salespersonId) {
        if (filters.salespersonId === "none") {
          query = query.is("salesperson_id", null);
        } else {
          query = query.eq("salesperson_id", filters.salespersonId);
        }
      }
      if (filters.source) {
        if (filters.source === "manuale") {
          query = query.or("source.is.null,source.eq.manual");
        } else {
          query = query.eq("source", filters.source);
        }
      }
      if (filters.approvalStatus) {
        query = query.eq("approval_status", filters.approvalStatus);
      }
      if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
      if (filters.importoMin) query = query.gte("total", parseFloat(filters.importoMin));
      if (filters.importoMax) query = query.lte("total", parseFloat(filters.importoMax));
      if (isAdmin && filters.marginMin) query = query.gte("margine_pct_snapshot", parseFloat(filters.marginMin));
      if (isAdmin && filters.marginMax) query = query.lte("margine_pct_snapshot", parseFloat(filters.marginMax));

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], total: count || 0 };
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch commerciali per filtro dropdown
  const { data: salespeopleList = [] } = useQuery({
    queryKey: ["salespeople-for-filter", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const salespersonNameById = useMemo(() => {
    const m = new Map<string, string>();
    salespeopleList.forEach((s) => m.set(s.id, `${s.first_name} ${s.last_name}`));
    return m;
  }, [salespeopleList]);

  // KPI charts — fetch aggregato ultimi 6 mesi (no paginazione)
  const { data: chartQuotes = [] } = useQuery({
    queryKey: ["quotes-chart", companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from("quotes")
        .select("status, total, created_at")
        .eq("company_id", companyId!)
        .gte("created_at", sixMonthsAgo.toISOString());
      if (error) throw error;
      return data as Array<{ status: string; total: number | null; created_at: string }>;
    },
  });

  const monthlyTrend = useMemo(() => {
    // Ultimi 6 mesi con count creati + accettati
    const now = new Date();
    const buckets: Array<{ label: string; key: string; created: number; accepted: number; value: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("it-IT", { month: "short" });
      buckets.push({ label, key, created: 0, accepted: 0, value: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    chartQuotes.forEach((q) => {
      const d = new Date(q.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = byKey.get(key);
      if (!b) return;
      b.created++;
      if (q.status === "accettata") {
        b.accepted++;
        b.value += q.total ?? 0;
      }
    });
    return buckets;
  }, [chartQuotes]);

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    chartQuotes.forEach((q) => map.set(q.status, (map.get(q.status) ?? 0) + 1));
    const colors: Record<string, string> = {
      bozza: "#94a3b8",
      inviata: "#3b82f6",
      visualizzata: "#8b5cf6",
      accettata: "#16a34a",
      rifiutata: "#ef4444",
      scaduta: "#f97316",
    };
    const labels: Record<string, string> = {
      bozza: "Bozza",
      inviata: "Inviata",
      visualizzata: "Visualizzata",
      accettata: "Accettata",
      rifiutata: "Rifiutata",
      scaduta: "Scaduta",
    };
    return Array.from(map.entries()).map(([status, value]) => ({
      name: labels[status] ?? status,
      value,
      color: colors[status] ?? "#64748b",
    }));
  }, [chartQuotes]);

  const quotes = quotesPage.data;
  const totalQuotes = quotesPage.total;
  const totalPages = Math.ceil(totalQuotes / PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      toast.success("Preventivo eliminato");
      setDeleteQuote(null);
    },
    onError: () => toast.error("Errore eliminazione"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (quote: QuoteForDuplicate) => {
      // 1. Carica righe originali
      const { data: originalItems, error: itemsErr } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quote.id)
        .order("sort_order");
      if (itemsErr) throw itemsErr;

      // 2. Carica allegati originali
      const { data: originalAttachments } = await supabase
        .from("quote_pdf_attachments")
        .select("material_id, sort_order")
        .eq("quote_id", quote.id);

      // 3. Genera nuovo numero (fail-fast: niente fallback 'OFF-YEAR-DUP',
      // altrimenti due duplicazioni concorrenti collidono sul UNIQUE quote_number)
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId!,
      });
      if (!numData) {
        throw new Error("Generazione numero preventivo fallita, riprova");
      }

      // 4. Inserisci testata (escludi campi univoci)
      const {
        id, created_at, updated_at, quote_number,
        signature_token, sent_at, viewed_at, signed_at,
        signed_by_name, signed_by_ip, refused_at, refused_reason,
        pdf_storage_path, pdf_generated_at, expires_at, created_by,
        ...rest
      } = quote;

      const { data: newQuote, error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          ...rest,
          quote_number: numData,
          status: "bozza",
          created_by: user?.id,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (quoteErr) throw quoteErr;

      // 5. Copia righe — P0-2: usa save_quote_items_atomic per preservare
      // le relazioni parent_item_id. Prima il codice spreadava `...item`
      // includendo `parent_item_id` che però puntava a UUID del preventivo
      // SORGENTE → le nuove righe avevano FK orfano (o peggio: cross-quote).
      // Qui passiamo l'ID sorgente come `client_temp_id` e il parent sorgente
      // come `parent_temp_id`: la RPC rimappa i temp id ai nuovi UUID generati.
      if (originalItems && originalItems.length > 0) {
        const payload = originalItems.map((oi, idx) => {
          const {
            id: _origId,
            created_at: _oiCa,
            updated_at: _oiUa,
            quote_id: _oiQid,
            parent_item_id: origParentId,
            ...itemRest
          } = oi;
          return {
            ...itemRest,
            sort_order: idx,
            client_temp_id: oi.id,
            parent_temp_id: origParentId ?? null,
          };
        });
        const { error: rpcErr } = await supabase.rpc("save_quote_items_atomic", {
          p_quote_id: newQuote.id,
          p_company_id: companyId!,
          p_items: payload,
        });
        if (rpcErr) throw rpcErr;
      }

      // 6. Copia allegati PDF
      if (originalAttachments && originalAttachments.length > 0) {
        await supabase.from("quote_pdf_attachments").insert(
          originalAttachments.map((a) => ({ ...a, quote_id: newQuote.id }))
        );
      }

      return newQuote.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      toast.success("Preventivo duplicato con tutte le righe");
      navigate(`/azienda/marketing/preventivi/${newId}`);
    },
    onError: (err: Error) => toast.error("Errore duplicazione: " + (err.message || "errore")),
  });

  // Reset to page 0 when status filter changes
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(0);
  };

  const filtered = quotes.filter((q: QuoteRow) => {
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      return (
        q.quote_number?.toLowerCase().includes(s) ||
        q.client_name?.toLowerCase().includes(s) ||
        q.title?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // KPIs — query separata senza paginazione né filtro status
  const { data: kpiData } = useQuery({
    queryKey: ["quotes-kpi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("status, total, sent_at, signed_at, expires_at, created_at")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
  const kpiRows: QuoteKpiRow[] = kpiData || [];
  const bozze = kpiRows.filter((q) => q.status === "bozza").length;
  const inviate = kpiRows.filter((q) => q.status === "inviata").length;
  const accettate = kpiRows.filter((q) => q.status === "accettata").length;
  const rifiutate = kpiRows.filter((q) => q.status === "rifiutata").length;
  const valoreTotale = kpiRows
    .filter((q) => q.status === "accettata")
    .reduce((sum, q) => sum + (q.total || 0), 0);

  // KPI avanzati
  const pipeline = kpiRows
    .filter((q) => q.status === "inviata")
    .reduce((sum, q) => sum + (q.total || 0), 0);

  const decisioni = accettate + rifiutate;
  const tassoConversione = decisioni > 0 ? Math.round((accettate / decisioni) * 100) : null;

  const conRisposta = kpiRows.filter(
    (q) => q.status === "accettata" && q.sent_at && q.signed_at
  );
  const tempoMedioMs = conRisposta.length > 0
    ? conRisposta.reduce((sum, q) => {
        return sum + (new Date(q.signed_at!).getTime() - new Date(q.sent_at!).getTime());
      }, 0) / conRisposta.length
    : null;
  const tempoMedioGiorni = tempoMedioMs !== null
    ? Math.round(tempoMedioMs / (1000 * 60 * 60 * 24))
    : null;

  const nonBozze = kpiRows.filter((q) => q.status !== "bozza");
  const valoremedioOfferta = nonBozze.length > 0
    ? nonBozze.reduce((s, q) => s + (q.total || 0), 0) / nonBozze.length
    : 0;

  // Export Excel
  const handleExportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const exportRows = filtered.map((q: QuoteRow) => {
      const sc = QUOTE_STATUS_CONFIG[q.status as QuoteStatus] || QUOTE_STATUS_CONFIG.bozza;
      return {
        Numero: q.quote_number || "",
        Titolo: q.title || "",
        Cliente: q.client_name || "",
        Stato: sc.label,
        "Totale (€)": q.total || 0,
        "Data creazione": q.created_at ? format(new Date(q.created_at), "dd/MM/yyyy", { locale: it }) : "",
        Scadenza: q.expires_at ? format(new Date(q.expires_at), "dd/MM/yyyy", { locale: it }) : "",
      };
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Preventivi");
    if (exportRows.length > 0) {
      const keys = Object.keys(exportRows[0]) as (keyof typeof exportRows[0])[];
      ws.columns = keys.map((k) => ({
        header: String(k),
        key: String(k),
        width: Math.max(String(k).length, ...exportRows.map((r) => String(r[k] ?? "").length)) + 2,
      }));
      ws.addRows(exportRows);
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preventivi_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* ─── Tab navigation ─────────────────────────────────────────── */}
      <div className="border-b mb-2">
        <nav className="-mb-px flex gap-4 md:gap-6 overflow-x-auto" role="tablist" aria-label="Sezioni preventivi">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "lista"}
            onClick={() => handleTabChange("lista")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "lista"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Lista Preventivi
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "approvazioni"}
              onClick={() => handleTabChange("approvazioni")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "approvazioni"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Percent className="h-4 w-4" aria-hidden="true" />
              Approvazioni sconto
              {pendingApprovalsCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {pendingApprovalsCount}
                </Badge>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "analisi"}
              onClick={() => handleTabChange("analisi")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "analisi"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <BrainCircuit className="h-4 w-4" aria-hidden="true" />
              Analisi AI
            </button>
          )}
        </nav>
      </div>

      {activeTab === "lista" && (
        <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Preventivi</h1>
          <p className="text-muted-foreground">Gestisci le offerte commerciali</p>
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Esporta Excel
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowComputoModal(true)}>
            <FileUp className="h-4 w-4 mr-2" />
            Da Computo Metrico
          </Button>
          <Button variant="outline" onClick={() => setShowFotoModal(true)} className="border-orange-300 text-orange-700 hover:bg-orange-50">
            <Sparkles className="h-4 w-4 mr-2" />
            Da Foto/PDF
          </Button>
          <Button onClick={() => navigate("/azienda/marketing/preventivi/nuovo")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Preventivo
          </Button>
        </div>
      </div>

      {/* KPI strip — base */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Bozze</p>
            <p className="text-2xl font-bold">{bozze}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Inviate</p>
            <p className="text-2xl font-bold">{inviate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Accettate</p>
            <p className="text-2xl font-bold">{accettate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Valore Accettate</p>
            <p className="text-2xl font-bold">{formatCurrency(valoreTotale)}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI avanzati */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Tasso conversione</p>
            </div>
            <p className="text-2xl font-bold">
              {tassoConversione !== null ? `${tassoConversione}%` : "—"}
            </p>
            {decisioni > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {accettate} / {decisioni} con risposta
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Pipeline attiva</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(pipeline)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {inviate} offert{inviate === 1 ? "a" : "e"} in attesa
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Valore medio offerta</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(valoremedioOfferta)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              su {nonBozze.length} offert{nonBozze.length === 1 ? "a" : "e"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Tempo medio firma</p>
            </div>
            <p className="text-2xl font-bold">
              {tempoMedioGiorni !== null ? `${tempoMedioGiorni}gg` : "—"}
            </p>
            {conRisposta.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                su {conRisposta.length} firmat{conRisposta.length === 1 ? "a" : "e"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grafici KPI — trend mensile + distribuzione stati */}
      {chartQuotes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">Trend ultimi 6 mesi</p>
                  <p className="text-xs text-muted-foreground">Preventivi creati vs accettati</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Valore accettato</p>
                  <p className="text-sm font-semibold text-green-600">
                    {formatCurrency(monthlyTrend.reduce((s, m) => s + m.value, 0))}
                  </p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyTrend} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                  <Bar dataKey="created" name="Creati" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="accepted" name="Accettati" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2">
                <p className="text-sm font-medium">Distribuzione stati</p>
                <p className="text-xs text-muted-foreground">{chartQuotes.length} preventivi (6 mesi)</p>
              </div>
              {statusDistribution.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
                  Nessun dato
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusDistribution.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per numero, cliente, titolo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className={countActiveQuoteFilters(filters) > 0 ? "border-primary text-primary" : ""}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filtri avanzati
            {countActiveQuoteFilters(filters) > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {countActiveQuoteFilters(filters)}
              </Badge>
            )}
          </Button>
          <QuoteColumnsPicker
            visible={visibleColumns}
            onChange={setVisibleColumns}
            isAdmin={isAdmin}
          />
        </div>

        {/* Bulk actions toolbar — visibile solo con selezione attiva */}
        <QuoteBulkToolbar
          selectedIds={selectedIds}
          selectedQuotes={
            filtered.filter((q: QuoteRow) => selectedIds.has(q.id)) as unknown as BulkQuoteLite[]
          }
          onClearSelection={() => setSelectedIds(new Set())}
          onReload={() => queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all })}
        />

        <Tabs value={statusFilter} onValueChange={handleStatusFilter}>
          <TabsList>
            <TabsTrigger value="tutti">Tutti</TabsTrigger>
            <TabsTrigger value="bozza">Bozze</TabsTrigger>
            <TabsTrigger value="inviata">Inviate</TabsTrigger>
            <TabsTrigger value="accettata">Accettate</TabsTrigger>
            <TabsTrigger value="rifiutata">Rifiutate</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileSignature className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-lg font-medium mb-1">Nessun preventivo</h3>
          <p className="text-muted-foreground mb-4">Crea il tuo primo preventivo</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowComputoModal(true)}>
              <FileUp className="h-4 w-4 mr-2" />
              Da Computo Metrico
            </Button>
            <Button onClick={() => navigate("/azienda/marketing/preventivi/nuovo")}>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Preventivo
            </Button>
          </div>
        </div>
      ) : (
        <>
        {/* Mobile card view */}
        <div className="sm:hidden divide-y">
          {filtered.map((q: QuoteRow) => {
            const sc = QUOTE_STATUS_CONFIG[q.status as QuoteStatus] || QUOTE_STATUS_CONFIG.bozza;
            return (
              <div
                key={q.id}
                className="p-3 flex items-center gap-3 active:bg-muted/50 cursor-pointer"
                onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{q.quote_number}</span>
                    <Badge variant={sc.variant} className="text-[10px] px-1.5 py-0">{sc.label}</Badge>
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">{q.client_name || "—"}</p>
                  {q.title && <p className="text-xs text-muted-foreground truncate">{q.title}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatCurrency(q.total || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(q.created_at), "dd MMM yy", { locale: it })}</p>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nessun preventivo trovato</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filtered.length > 0 &&
                      filtered.every((q: QuoteRow) => selectedIds.has(q.id))
                    }
                    onCheckedChange={(v) => {
                      if (v) {
                        setSelectedIds(new Set(filtered.map((q: QuoteRow) => q.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    aria-label="Seleziona tutti"
                  />
                </TableHead>
                {isColVisible("numero") && <TableHead>Numero</TableHead>}
                {isColVisible("cliente") && <TableHead>Cliente</TableHead>}
                {isColVisible("titolo") && <TableHead>Titolo</TableHead>}
                {isColVisible("commerciale") && <TableHead>Commerciale</TableHead>}
                {isColVisible("stato") && <TableHead>Stato</TableHead>}
                {isColVisible("approvazione") && <TableHead>Approvazione</TableHead>}
                {isColVisible("fonte") && <TableHead>Fonte</TableHead>}
                {isColVisible("totale") && <TableHead className="text-right">Totale</TableHead>}
                {isAdmin && isColVisible("margine") && (
                  <TableHead className="text-right">Margine %</TableHead>
                )}
                {isAdmin && isColVisible("commissione") && (
                  <TableHead className="text-right">Commissione</TableHead>
                )}
                {isColVisible("data") && <TableHead>Data</TableHead>}
                {isColVisible("scadenza") && <TableHead>Scadenza</TableHead>}
                {isColVisible("contatto") && <TableHead>Contatto</TableHead>}
                {isColVisible("opportunita") && <TableHead>Opp.</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q: QuoteRow) => {
                const sc = QUOTE_STATUS_CONFIG[q.status as QuoteStatus] || QUOTE_STATUS_CONFIG.bozza;
                const isSelected = selectedIds.has(q.id);
                return (
                  <TableRow
                    key={q.id}
                    className={`cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                    onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(q.id);
                            else next.delete(q.id);
                            return next;
                          });
                        }}
                        aria-label={`Seleziona ${q.quote_number}`}
                      />
                    </TableCell>
                    {isColVisible("numero") && (
                      <TableCell className="font-mono text-sm">
                        {q.quote_number}
                        {q.source === "computo_ai" && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] py-0 border-orange-300 text-orange-600 bg-orange-50">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            Computo AI
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    {isColVisible("cliente") && (
                      <TableCell>{q.client_name || "—"}</TableCell>
                    )}
                    {isColVisible("titolo") && (
                      <TableCell className="max-w-[200px] truncate">{q.title || "—"}</TableCell>
                    )}
                    {isColVisible("commerciale") && (
                      <TableCell className="text-xs">
                        {q.salesperson_id ? (
                          <span className="text-foreground">{salespersonNameById.get(q.salesperson_id) ?? "—"}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {isColVisible("stato") && (
                      <TableCell>
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </TableCell>
                    )}
                    {isColVisible("approvazione") && (
                      <TableCell>
                        {q.approval_status === "pending" && (
                          <Badge variant="outline" className="border-orange-500 text-orange-600 text-[10px]">Pending</Badge>
                        )}
                        {q.approval_status === "approved" && (
                          <Badge variant="outline" className="border-green-500 text-green-600 text-[10px]">OK</Badge>
                        )}
                        {q.approval_status === "rejected" && (
                          <Badge variant="outline" className="border-red-500 text-red-600 text-[10px]">Rifiutato</Badge>
                        )}
                        {!q.approval_status && <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {isColVisible("fonte") && (
                      <TableCell className="text-xs">
                        {q.source ? (
                          <Badge variant="secondary" className="text-[10px]">{q.source}</Badge>
                        ) : (
                          <span className="text-muted-foreground">manuale</span>
                        )}
                      </TableCell>
                    )}
                    {isColVisible("totale") && (
                      <TableCell className="text-right font-medium">
                        {formatCurrency(q.total || 0)}
                      </TableCell>
                    )}
                    {isAdmin && isColVisible("margine") && (
                      <TableCell className="text-right text-xs">
                        {q.margine_pct_snapshot != null
                          ? `${Number(q.margine_pct_snapshot).toFixed(1)}%`
                          : "—"}
                      </TableCell>
                    )}
                    {isAdmin && isColVisible("commissione") && (
                      <TableCell className="text-right text-xs">
                        {q.commission_amount_snapshot != null
                          ? formatCurrency(Number(q.commission_amount_snapshot))
                          : "—"}
                      </TableCell>
                    )}
                    {isColVisible("data") && (
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(q.created_at), "dd MMM yyyy", { locale: it })}
                      </TableCell>
                    )}
                    {isColVisible("scadenza") && (
                      <TableCell className="text-muted-foreground text-sm">
                        {q.expires_at
                          ? format(new Date(q.expires_at), "dd MMM yyyy", { locale: it })
                          : "—"}
                      </TableCell>
                    )}
                    {isColVisible("contatto") && (
                      <TableCell>
                        {q.contact_id ? (
                          <span className="text-primary text-xs">✓</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {isColVisible("opportunita") && (
                      <TableCell>
                        {q.opportunity_id ? (
                          <span className="text-primary text-xs">✓</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/azienda/marketing/preventivi/${q.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Apri
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuickViewId(q.id);
                              }}
                            >
                              <TrendingUp className="h-4 w-4 mr-2" />
                              Anteprima admin (margini)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateMutation.mutate(q);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplica
                          </DropdownMenuItem>
                          {q.contact_id && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/marketing/contatti/${q.contact_id}`);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Apri contatto
                            </DropdownMenuItem>
                          )}
                          {q.opportunity_id && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/marketing/opportunita?id=${q.opportunity_id}`);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Apri opportunità
                            </DropdownMenuItem>
                          )}
                          {q.status === "bozza" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteQuote(q);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalQuotes)} di {totalQuotes}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteQuote} onOpenChange={(o) => !o && setDeleteQuote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina preventivo</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminare il preventivo {deleteQuote?.quote_number}? L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteQuote && deleteMutation.mutate(deleteQuote.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Eliminazione...</>
              ) : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {activeTab === "approvazioni" && isAdmin && <QuoteApprovals />}

      {activeTab === "analisi" && isAdmin && <AnalisiPreventivi />}

      {/* Modal Computo Metrico AI */}
      <ComputoUploadModal
        open={showComputoModal}
        onOpenChange={setShowComputoModal}
        onComplete={(quoteId) => navigate(`/azienda/marketing/preventivi/${quoteId}`)}
      />

      {/* Modal Foto/PDF — AI vision estrae preventivo da foto cartaceo o PDF */}
      <ComputoUploadModal
        open={showFotoModal}
        onOpenChange={setShowFotoModal}
        intent="foto"
        onComplete={(quoteId) => navigate(`/azienda/marketing/preventivi/${quoteId}`)}
      />

      {/* Sidebar filtri avanzati (stile Contatti/Opportunità) */}
      <QuotesFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={(f) => { setFilters(f); setCurrentPage(0); }}
        salespeople={salespeopleList}
        isAdmin={isAdmin}
      />

      {/* Drawer anteprima admin con margini/provvigione/approvazioni */}
      {isAdmin && (
        <QuoteQuickViewSheet
          quoteId={quickViewId}
          open={!!quickViewId}
          onOpenChange={(o) => { if (!o) setQuickViewId(null); }}
        />
      )}
    </div>
  );
}
