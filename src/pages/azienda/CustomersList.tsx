import { useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Search, Mail, Phone, ClipboardList, KeyRound, Copy, Check,
  Pencil, Trash2, Download, Upload, MoreVertical, AlertTriangle, ArrowUpDown,
  Calendar, UserCheck, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  UserPlus, ShoppingBag, ShieldOff, Info,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/contactUtils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";

interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
}

interface CustomerWithOrders {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  fiscal_code: string | null;
  address: string | null;
  site_address: string | null;
  notes: string | null;
  order_count: number;
  created_at: string;
  salesperson_id: string | null;
  portal_disabled?: boolean | null;
}

interface PaginatedResult {
  rows: CustomerWithOrders[];
  total_count: number;
}

interface CustomerStats {
  total: number;
  month_current: number;
  month_previous: number;
  with_orders: number;
  without_orders: number;
  portal_disabled: number;
}

interface ResetPasswordResult {
  newPassword: string;
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

type SortField = "name" | "created_at";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100];

const CUSTOMER_IMPORT_FIELDS: ImportField[] = [
  { key: "first_name", label: "Nome", required: true },
  { key: "last_name", label: "Cognome", required: true },
  { key: "email", label: "Email", required: true, type: "email" },
  { key: "phone", label: "Telefono", required: false },
  { key: "fiscal_code", label: "Codice Fiscale", required: false },
  { key: "address", label: "Indirizzo", required: false },
  { key: "site_address", label: "Indirizzo Cantiere", required: false },
  { key: "notes", label: "Note", required: false },
];

/* ─────────────────────────────────────────────────────────
 * Helper: display sicuro di nome/cognome
 * BUG-FIX: evita "null null" o "undefined Rossi" quando un
 * campo è mancante (in passato alcuni record arrivavano con
 * first_name = "" e lastName = null).
 * ───────────────────────────────────────────────────────── */
function formatFullName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const joined = `${f} ${l}`.trim();
  return joined || "(senza nome)";
}

function formatInitials(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return (`${f.charAt(0)}${l.charAt(0)}`.toUpperCase()) || "?";
}

/* ─────────────────────────────────────────────────────────
 * Helper: display sicuro del telefono
 * BUG-FIX: in diversi import il telefono arrivava con spazi
 * trailing o caratteri invisibili; lo normalizziamo per la
 * visualizzazione senza toccare il dato salvato.
 * ───────────────────────────────────────────────────────── */
function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, " ").trim();
  return clean || null;
}

/* ─────────────────────────────────────────────────────────
 * KPI Card component
 * ───────────────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  icon: Icon,
  accentClass,
  trend,
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  trend?: { value: number; positive: boolean } | null;
  hint?: string;
}) {
  return (
    <Card className={`border-l-4 ${accentClass}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              {label}
              {hint && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[220px] text-xs">{hint}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-2xl font-bold mt-1 leading-tight">{value}</p>
            {trend !== undefined && trend !== null && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
                trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}>
                {trend.positive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{trend.positive ? "+" : ""}{trend.value}% vs mese scorso</span>
              </div>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomersListInner() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSalesperson, setFilterSalesperson] = useState<string>("all");
  const [filterOrders, setFilterOrders] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [importOpen, setImportOpen] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState<{
    open: boolean;
    customer: CustomerWithOrders | null;
    newPassword: string | null;
    copied: boolean;
  }>({ open: false, customer: null, newPassword: null, copied: false });

  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Portal enabled flag (settings) ───────────────────
  const portalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  // Fetch salespeople for filter and inline select
  const { data: salespeople = [] } = useQuery({
    queryKey: queryKeys.salespeople.active(effectiveCompany?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as Salesperson[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const salespersonMap = useMemo(
    () => new Map(salespeople.map(sp => [sp.id, sp])),
    [salespeople]
  );

  // ── KPI Stats ─────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.customersList.stats(effectiveCompany?.id),
    queryFn: async (): Promise<CustomerStats> => {
      if (!effectiveCompany?.id) {
        return { total: 0, month_current: 0, month_previous: 0, with_orders: 0, without_orders: 0, portal_disabled: 0 };
      }
      const { data, error } = await supabase.rpc("get_customer_stats" as never, {
        p_company_id: effectiveCompany.id,
      } as never);
      if (error) throw error;
      return data as unknown as CustomerStats;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };
  const handleFilterSalesperson = (value: string) => {
    setFilterSalesperson(value);
    setPage(0);
  };
  const handleFilterOrders = (value: string) => {
    setFilterOrders(value);
    setPage(0);
  };
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(0);
  };

  // Build RPC params
  const rpcParams = {
    p_company_id: effectiveCompany?.id ?? "",
    p_search: searchQuery || null,
    p_salesperson_id: filterSalesperson !== "all" && filterSalesperson !== "none" ? filterSalesperson : null,
    p_salesperson_none: filterSalesperson === "none",
    p_has_orders: filterOrders,
    p_sort_field: sortField,
    p_sort_dir: sortDir,
    p_offset: page * pageSize,
    p_limit: pageSize,
  };

  const { data: paginatedData, isLoading, isError, error: listError } = useQuery({
    queryKey: queryKeys.customersList.list(effectiveCompany?.id, searchQuery, filterSalesperson, filterOrders, sortField, sortDir, page, pageSize),
    queryFn: async (): Promise<PaginatedResult> => {
      if (!effectiveCompany?.id) return { rows: [], total_count: 0 };

      const { data, error } = await supabase.rpc("get_customers_paginated" as never, rpcParams as never);
      if (error) throw error;
      return data as unknown as PaginatedResult;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev: PaginatedResult | undefined) => prev,
  });

  const customers = paginatedData?.rows ?? [];
  const totalCount = paginatedData?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Inline salesperson assignment mutation
  const assignSalespersonMutation = useMutation({
    mutationFn: async ({ customerId, salespersonId }: { customerId: string; salespersonId: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ salesperson_id: salespersonId })
        .eq("id", customerId)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile assegnare il venditore",
        variant: "destructive",
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reset-customer-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ customer_id: customerId }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Errore durante il reset della password");
      return data as { success: boolean; newPassword: string; customer: ResetPasswordResult["customer"] };
    },
    onSuccess: (data, customerId) => {
      const customer = customers.find((c) => c.id === customerId);
      setResetPasswordDialog({ open: true, customer: customer || null, newPassword: data.newPassword, copied: false });
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile resettare la password",
        variant: "destructive",
      });
    },
  });

  const handleCopyPassword = async () => {
    if (resetPasswordDialog.newPassword) {
      await navigator.clipboard.writeText(resetPasswordDialog.newPassword);
      setResetPasswordDialog((prev) => ({ ...prev, copied: true }));
      toast({ title: "Copiato", description: "Password copiata negli appunti" });
    }
  };

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-company-user", {
        body: { userId: customerId },
      });
      if (error) {
        let errorMessage = "Errore durante l'eliminazione";
        try {
          const ctx = (error as { context?: unknown }).context;
          let errBody: { error?: string } | null = null;
          if (ctx instanceof Response) errBody = await ctx.json();
          if (errBody?.error) errorMessage = errBody.error;
        } catch {
          if (error.message && !error.message.includes("non-2xx")) {
            errorMessage = error.message;
          }
        }
        throw new Error(errorMessage);
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: "Cliente eliminato", description: "Il cliente è stato eliminato con successo" });
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile eliminare il cliente",
        variant: "destructive",
      });
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  // Export CSV (current filtered page)
  const exportCustomersCSV = useCallback(() => {
    const rows = [["Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Indirizzo", "Indirizzo Cantiere", "Note", "N. Ordini", "Data Inserimento", "Venditore"]];
    customers.forEach((c) => {
      const sp = c.salesperson_id ? salespersonMap.get(c.salesperson_id) : null;
      rows.push([
        c.first_name ?? "",
        c.last_name ?? "",
        c.email,
        formatPhone(c.phone) ?? "",
        c.fiscal_code || "",
        c.address || "",
        c.site_address || "",
        c.notes || "",
        String(c.order_count),
        c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
        sp ? `${sp.first_name} ${sp.last_name}` : "",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clienti-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV esportato" });
  }, [customers, salespersonMap, toast]);

  // Export ALL filtered (no pagination)
  const exportAllCSV = useCallback(async () => {
    if (!effectiveCompany?.id) return;
    try {
      const { data, error } = await supabase.rpc("get_customers_paginated", {
        ...rpcParams,
        p_offset: 0,
        p_limit: 100000,
      } as never);
      if (error) throw error;
      const result = data as unknown as PaginatedResult;
      const csvRows = [["Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Indirizzo", "Indirizzo Cantiere", "Note", "N. Ordini", "Data Inserimento", "Venditore"]];
      (result.rows || []).forEach((c) => {
        const sp = c.salesperson_id ? salespersonMap.get(c.salesperson_id) : null;
        csvRows.push([
          c.first_name ?? "",
          c.last_name ?? "",
          c.email,
          formatPhone(c.phone) ?? "",
          c.fiscal_code || "",
          c.address || "",
          c.site_address || "",
          c.notes || "",
          String(c.order_count),
          c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
          sp ? `${sp.first_name} ${sp.last_name}` : "",
        ]);
      });
      const csv = csvRows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clienti-tutti-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV esportato", description: `${result.total_count} clienti esportati` });
    } catch (e) {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile esportare i clienti",
        variant: "destructive",
      });
    }
  }, [effectiveCompany?.id, rpcParams, salespersonMap, toast]);

  // Import handler
  const handleCustomersImport = useCallback(async (rows: Record<string, string>[]) => {
    if (!effectiveCompany?.id) return { success: 0, errors: ["Azienda non trovata"] };

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.first_name?.trim()) { errors.push(`Riga ${i + 1}: Nome mancante`); continue; }
        if (!row.last_name?.trim()) { errors.push(`Riga ${i + 1}: Cognome mancante`); continue; }
        if (!row.email?.trim()) { errors.push(`Riga ${i + 1}: Email mancante`); continue; }

        // BUG-FIX telefono: pulisci caratteri invisibili/doppi spazi prima dell'invio
        const cleanPhone = row.phone?.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim() || null;

        const { data, error: fnError } = await supabase.functions.invoke("create-customer", {
          body: {
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            phone: cleanPhone,
            fiscal_code: row.fiscal_code?.trim() || null,
            address: row.address?.trim() || null,
            site_address: row.site_address?.trim() || null,
            notes: row.notes?.trim() || null,
            company_id: effectiveCompany.id,
            // In import non inviamo mail di benvenuto per evitare spam
            // e rispettiamo il setting azienda per la creazione portale.
            send_welcome_email: false,
            create_portal_account: portalEnabled,
          },
        });
        if (fnError) {
          let errBody: { error?: string; message?: string } | null = null;
          try {
            const ctx = (fnError as { context?: unknown }).context;
            if (ctx instanceof Response) errBody = await ctx.json();
          } catch { /* ignore */ }
          throw new Error(errBody?.error ?? errBody?.message ?? fnError.message ?? "Errore");
        }
        if (data?.error) throw new Error(data.error);
        success++;
      } catch (err) {
        errors.push(`Riga ${i + 1} (${row.email || ""}): ${err instanceof Error ? err.message : "Errore"}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
    return { success, errors };
  }, [effectiveCompany?.id, portalEnabled, queryClient]);

  const handleInlineSalesperson = (customerId: string, value: string) => {
    assignSalespersonMutation.mutate({
      customerId,
      salespersonId: value === "none" ? null : value,
    });
  };

  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);

  // Trend calc: (current - previous) / previous * 100
  const trend = useMemo(() => {
    if (!stats) return null;
    const { month_current, month_previous } = stats;
    if (month_previous === 0) {
      return month_current > 0 ? { value: 100, positive: true } : null;
    }
    const pct = Math.round(((month_current - month_previous) / month_previous) * 100);
    return { value: Math.abs(pct), positive: pct >= 0 };
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* Header con icon pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Clienti</h1>
            <p className="text-sm text-muted-foreground">
              Gestisci l'anagrafica clienti, gli ordini e le credenziali di accesso al portale.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Altre azioni">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCustomersCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta pagina CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAllCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta tutti CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importa da file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild>
            <Link to="/azienda/clienti/nuovo">
              <Plus className="mr-2 h-4 w-4" />
              <span className="sm:hidden">Nuovo</span>
              <span className="hidden sm:inline">Nuovo Cliente</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statsLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="border-l-4 border-l-muted">
              <CardContent className="pt-5 pb-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              label="Totale clienti"
              value={stats?.total ?? 0}
              icon={Users}
              accentClass="border-l-primary"
              hint="Numero complessivo di clienti attivi in anagrafica."
            />
            <KpiCard
              label="Nuovi questo mese"
              value={stats?.month_current ?? 0}
              icon={UserPlus}
              accentClass="border-l-emerald-500"
              trend={trend}
              hint="Clienti creati dal 1° del mese corrente."
            />
            <KpiCard
              label="Con ordini"
              value={stats?.with_orders ?? 0}
              icon={ShoppingBag}
              accentClass="border-l-blue-500"
              hint="Clienti che hanno almeno un ordine associato."
            />
            <KpiCard
              label={portalEnabled ? "Solo anagrafica" : "Portale disattivato"}
              value={stats?.portal_disabled ?? 0}
              icon={ShieldOff}
              accentClass="border-l-amber-500"
              hint="Clienti creati senza account di accesso al portale privato."
            />
          </>
        )}
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, email, telefono, CF..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filterSalesperson} onValueChange={handleFilterSalesperson}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Venditore" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i venditori</SelectItem>
              <SelectItem value="none">Senza venditore</SelectItem>
              {salespeople.map((sp) => (
                <SelectItem key={sp.id} value={sp.id}>
                  {sp.first_name} {sp.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterOrders} onValueChange={handleFilterOrders}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Ordini" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="with">Con ordini</SelectItem>
              <SelectItem value="without">Senza ordini</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium">Errore nel caricamento</h3>
            <p className="text-muted-foreground text-center mt-2 max-w-md">
              {listError instanceof Error ? listError.message : "Impossibile caricare la lista clienti. Riprova più tardi."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all })}
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-[180px]" />
                <Skeleton className="h-5 w-[200px]" />
                <Skeleton className="h-5 w-[100px]" />
                <Skeleton className="h-5 w-[60px]" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Nessun cliente trovato</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              {searchQuery || filterSalesperson !== "all" || filterOrders !== "all"
                ? "Prova a modificare i filtri o i termini di ricerca per vedere più risultati."
                : "Non hai ancora clienti in anagrafica. Creane uno o importa da file CSV."}
            </p>
            {!searchQuery && filterSalesperson === "all" && filterOrders === "all" && (
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <Button asChild>
                  <Link to="/azienda/clienti/nuovo">
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi Cliente
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importa CSV
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {customers.map((customer) => {
              const initials = formatInitials(customer.first_name, customer.last_name);
              const fullName = formatFullName(customer.first_name, customer.last_name);
              const cleanPhone = formatPhone(customer.phone);
              const avatarColor = getAvatarColor(`${customer.first_name ?? ""}${customer.last_name ?? ""}`);
              return (
                <Link
                  key={customer.id}
                  to={`/azienda/clienti/${customer.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
                >
                  <Avatar className={`h-10 w-10 shrink-0 ${avatarColor}`}>
                    <AvatarFallback className="text-sm font-bold text-white bg-transparent">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{fullName}</p>
                      {customer.portal_disabled && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                          Anagrafica
                        </Badge>
                      )}
                    </div>
                    {cleanPhone && (
                      <p className="text-xs text-muted-foreground">{cleanPhone}</p>
                    )}
                    {customer.email && (
                      <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {customer.order_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span className="font-medium">{customer.order_count}</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => toggleSort("name")}
                  >
                    Nome
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Telefono</TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => toggleSort("created_at")}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Data
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Venditore</TableHead>
                <TableHead className="hidden sm:table-cell text-center">Ordini</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const sp = customer.salesperson_id ? salespersonMap.get(customer.salesperson_id) : null;
                const avatarColor = getAvatarColor(`${customer.first_name ?? ""}${customer.last_name ?? ""}`);
                const initials = formatInitials(customer.first_name, customer.last_name);
                const fullName = formatFullName(customer.first_name, customer.last_name);
                const cleanPhone = formatPhone(customer.phone);
                return (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/azienda/clienti/${customer.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className={`h-8 w-8 shrink-0 ${avatarColor}`}>
                          <AvatarFallback className="text-xs font-bold text-white bg-transparent">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm leading-tight truncate max-w-[160px]">
                              {fullName}
                            </p>
                            {customer.portal_disabled && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ShieldOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-[200px]">
                                      Cliente solo anagrafica: nessun accesso al portale privato.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {customer.address && (
                            <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {customer.address}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="truncate max-w-[180px]">{customer.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {cleanPhone ? (
                        <a
                          href={`tel:${cleanPhone}`}
                          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-4 w-4" />
                          {cleanPhone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {customer.created_at ? format(new Date(customer.created_at), "dd MMM yyyy", { locale: it }) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={customer.salesperson_id || "none"}
                        onValueChange={(val) => handleInlineSalesperson(customer.id, val)}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">Nessuno</span>
                          </SelectItem>
                          {salespeople.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.first_name} {s.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-center">
                      {customer.order_count === 0 ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <Badge
                          variant={customer.order_count > 3 ? "default" : "secondary"}
                          className={customer.order_count > 3
                            ? "bg-amber-100 text-amber-800 border-amber-200 font-bold"
                            : ""}
                        >
                          {customer.order_count}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                          <Link to={`/azienda/clienti/${customer.id}`} aria-label={`Modifica ${fullName}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        {/* Reset password visibile solo se il cliente ha accesso al portale */}
                        {!customer.portal_disabled && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={resetPasswordMutation.isPending}
                                aria-label={`Reset password ${fullName}`}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset Password</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Vuoi resettare la password per {fullName}?
                                  <br />
                                  <span className="text-muted-foreground">
                                    Verrà generata una nuova password che dovrai comunicare al cliente.
                                  </span>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={() => resetPasswordMutation.mutate(customer.id)}>
                                  Conferma Reset
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deleteCustomerMutation.isPending}
                              aria-label={`Elimina ${fullName}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Elimina Cliente</AlertDialogTitle>
                              <AlertDialogDescription>
                                {customer.order_count > 0 ? (
                                  <>
                                    Impossibile eliminare {fullName} perché ha{" "}
                                    <strong>{customer.order_count} ordini</strong> associati.
                                    <br />
                                    Elimina prima tutti gli ordini del cliente.
                                  </>
                                ) : (
                                  <>
                                    Sei sicuro di voler eliminare {fullName}?
                                    <br />
                                    Questa azione non può essere annullata.
                                  </>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              {customer.order_count === 0 && (
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteCustomerMutation.mutate(customer.id)}
                                >
                                  Elimina
                                </AlertDialogAction>
                              )}
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
            <p className="text-xs sm:text-sm text-muted-foreground">
              <span className="hidden sm:inline">Mostrando {rangeStart}–{rangeEnd} di </span>
              <span className="sm:hidden">{totalCount} </span>
              <span className="hidden sm:inline">{totalCount} </span>
              clienti
            </p>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Righe:</span>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-8 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Pagina precedente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Pagina successiva"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* New Password Dialog */}
      <Dialog
        open={resetPasswordDialog.open}
        onOpenChange={(open) => {
          if (!open) setResetPasswordDialog({ open: false, customer: null, newPassword: null, copied: false });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Resettata</DialogTitle>
            <DialogDescription>
              La password per {formatFullName(resetPasswordDialog.customer?.first_name, resetPasswordDialog.customer?.last_name)} è stata resettata con successo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground mb-2">Nuova Password:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-lg break-all">
                  {resetPasswordDialog.newPassword}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyPassword} aria-label="Copia password">
                  {resetPasswordDialog.copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-orange-300/30 bg-orange-50/50 dark:bg-orange-900/10 p-4">
              <p className="text-sm">
                <strong>Importante:</strong> Comunica questa password al cliente in modo sicuro.
                La password non sarà più visibile dopo aver chiuso questa finestra.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetPasswordDialog({ open: false, customer: null, newPassword: null, copied: false })}>
              Ho Copiato la Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CSVImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importa Clienti"
        fields={CUSTOMER_IMPORT_FIELDS}
        onImport={handleCustomersImport}
      />
    </div>
  );
}

export default function CustomersList() {
  return (
    <ErrorBoundary title="Errore nella lista clienti">
      <CustomersListInner />
    </ErrorBoundary>
  );
}
