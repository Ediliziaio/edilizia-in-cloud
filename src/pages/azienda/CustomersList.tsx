import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Search, Mail, Phone, ClipboardList, KeyRound, Copy, Check,
  Pencil, Trash2, Download, Upload, MoreVertical, AlertTriangle, ArrowUpDown,
  Calendar, UserCheck, ChevronLeft, ChevronRight,
  UserPlus, ShoppingBag, ShieldOff, Columns3, Filter, FileSpreadsheet,
  FileText, ChevronDown, X, CreditCard, HardHat, MapPin, StickyNote, Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/contactUtils";
import { escapeCsvCell, neutralizeXlsxCell } from "@/lib/csvExport";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
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
import {
  CustomerImportDialog,
  type ImportOptions,
} from "@/components/clients/CustomerImportDialog";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { logger } from "@/utils/logger";
// MP-CAN-001 Fase 2 — types/constants/formatters/anomalies estratti
import type {
  Salesperson, CustomerWithOrders, PaginatedResult, CustomerStats,
  ResetPasswordResult, SortField, SortDir, YesNoAll, PortalState,
  CustomerAnomalySeverity,
} from "./CustomersList/types";
import {
  PAGE_SIZES, CUSTOMER_IMPORT_FIELDS, ALL_COLUMNS,
  type ColumnKey,
} from "./CustomersList/constants";
import { formatDisplayName, formatInitials, formatLocality,
  formatPhone, formatCustomerEmail, truncate,
} from "./CustomersList/formatters";
import { getCustomerAnomalies, getWorstSeverity } from "./CustomersList/anomalies";
import { useColumnVisibility } from "./CustomersList/hooks/useColumnVisibility";


import { useIsMobile } from "@/hooks/use-mobile";
import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
/* ─── KPI Card ──────────────────────────────────────────────────── */
/* ─── Main ──────────────────────────────────────────────────────── */
function CustomersListInner() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSalesperson, setFilterSalesperson] = useState<string>("all");
  const [filterOrders, setFilterOrders] = useState<string>("all");
  // Filtri quick mobile collapsible (uniformato a pattern OrdersFilters)
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);

  // Advanced filters
  const [filterHasPhone, setFilterHasPhone] = useState<YesNoAll>("all");
  const [filterHasFC, setFilterHasFC] = useState<YesNoAll>("all");
  const [filterHasSite, setFilterHasSite] = useState<YesNoAll>("all");
  const [filterPortal, setFilterPortal] = useState<PortalState>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [advOpen, setAdvOpen] = useState(false);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [importOpen, setImportOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const confermaBulk = useConfermaQuantita(selectedIds.size, bulkDeleteOpen);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignValue, setBulkAssignValue] = useState<string>("none");

  const [resetPasswordDialog, setResetPasswordDialog] = useState<{
    open: boolean;
    customer: CustomerWithOrders | null;
    newPassword: string | null;
    copied: boolean;
  }>({ open: false, customer: null, newPassword: null, copied: false });

  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { visible, toggle, resetColumns } = useColumnVisibility();

  // 2026-05-27 (audit UX role-based): gating dei pulsanti Elimina/Assegna
  // — prima erano visibili a chi non aveva can_edit_customers, generando
  // 403 al click. Adesso nascosti del tutto se non hai i permessi.
  const customerPermissions = usePermissions();
  const canEditCustomers = customerPermissions.isAdmin || customerPermissions.canEditCustomers;

  const portalEnabled = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled === true;

  // ── Salespeople ────────────────────────────────────────
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

  // ── KPI Stats ──────────────────────────────────────────
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
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

  // log eventuale errore KPI (aiuta debug se la RPC non è deployata)
  useEffect(() => {
    if (statsError) logger.error("KPI stats error:", statsError);
  }, [statsError]);

  // ── Reset page on filter change ────────────────────────
  const resetPage = () => setPage(0);
  const wrapSet = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); resetPage(); };

  // ── RPC params ─────────────────────────────────────────
  const rpcParams = useMemo(() => ({
    p_company_id: effectiveCompany?.id ?? "",
    p_search: searchQuery || null,
    p_salesperson_id: filterSalesperson !== "all" && filterSalesperson !== "none" ? filterSalesperson : null,
    p_salesperson_none: filterSalesperson === "none",
    p_has_orders: filterOrders,
    p_sort_field: sortField,
    p_sort_dir: sortDir,
    p_offset: page * pageSize,
    p_limit: pageSize,
    p_date_from: filterDateFrom ? new Date(filterDateFrom + "T00:00:00").toISOString() : null,
    p_date_to: filterDateTo ? new Date(filterDateTo + "T23:59:59").toISOString() : null,
    p_has_phone: filterHasPhone,
    p_has_fiscal_code: filterHasFC,
    p_has_site_address: filterHasSite,
    p_portal_state: filterPortal,
  }), [
    effectiveCompany?.id,
    searchQuery,
    filterSalesperson,
    filterOrders,
    sortField,
    sortDir,
    page,
    pageSize,
    filterDateFrom,
    filterDateTo,
    filterHasPhone,
    filterHasFC,
    filterHasSite,
    filterPortal,
  ]);

  const { data: paginatedData, isLoading, isError, error: listError } = useQuery({
    queryKey: queryKeys.customersList.list(
      effectiveCompany?.id, searchQuery, filterSalesperson, filterOrders,
      sortField, sortDir, page, pageSize,
      filterDateFrom, filterDateTo, filterHasPhone, filterHasFC, filterHasSite, filterPortal,
    ),
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

  const customers = useMemo(() => paginatedData?.rows ?? [], [paginatedData?.rows]);
  const totalCount = paginatedData?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clear selection on page change / data change
  useEffect(() => { setSelectedIds(new Set()); }, [page, pageSize, searchQuery, filterSalesperson, filterOrders, filterDateFrom, filterDateTo, filterHasPhone, filterHasFC, filterHasSite, filterPortal]);

  // ── Active filters count (for badge) ───────────────────
  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (filterSalesperson !== "all") n++;
    if (filterOrders !== "all") n++;
    if (filterDateFrom) n++;
    if (filterDateTo) n++;
    if (filterHasPhone !== "all") n++;
    if (filterHasFC !== "all") n++;
    if (filterHasSite !== "all") n++;
    if (filterPortal !== "all") n++;
    return n;
  }, [filterSalesperson, filterOrders, filterDateFrom, filterDateTo, filterHasPhone, filterHasFC, filterHasSite, filterPortal]);

  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterSalesperson("all");
    setFilterOrders("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterHasPhone("all");
    setFilterHasFC("all");
    setFilterHasSite("all");
    setFilterPortal("all");
    setPage(0);
  };

  // ── Inline salesperson assignment ──────────────────────
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

  // ── Bulk assign ────────────────────────────────────────
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, salespersonId }: { ids: string[]; salespersonId: string | null }) => {
      const { data, error } = await supabase.rpc("bulk_assign_salesperson" as never, {
        p_company_id: effectiveCompany!.id,
        p_customer_ids: ids,
        p_salesperson_id: salespersonId,
      } as never);
      if (error) throw error;
      return data as unknown as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({
        title: "Venditore assegnato",
        description: `${count ?? 0} clienti aggiornati.`,
      });
      setBulkAssignOpen(false);
      setSelectedIds(new Set());
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Assegnazione massiva fallita",
        variant: "destructive",
      });
    },
  });

  // ── Reset password ─────────────────────────────────────
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

  // ── Delete (single) ────────────────────────────────────
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
          if (error.message && !error.message.includes("non-2xx")) errorMessage = error.message;
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

  // ── Bulk delete ────────────────────────────────────────
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const errors: string[] = [];
      let success = 0;
      for (const id of ids) {
        try {
          const { data, error } = await supabase.functions.invoke("delete-company-user", {
            body: { userId: id },
          });
          if (error) {
            let msg = "Errore";
            try {
              const ctx = (error as { context?: unknown }).context;
              if (ctx instanceof Response) {
                const body = await ctx.json();
                msg = body?.error ?? msg;
              }
            } catch { /* ignore */ }
            errors.push(`${id}: ${msg}`);
            continue;
          }
          if (data?.error) { errors.push(`${id}: ${data.error}`); continue; }
          success++;
        } catch (e) {
          errors.push(`${id}: ${e instanceof Error ? e.message : "Errore"}`);
        }
      }
      return { success, errors };
    },
    onSuccess: ({ success, errors }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      toast({
        title: `Eliminati ${success} clienti`,
        description: errors.length > 0
          ? `${errors.length} errori. Alcuni clienti potrebbero avere ordini associati.`
          : "Tutti i clienti selezionati sono stati eliminati.",
        variant: errors.length > 0 ? "destructive" : "default",
      });
    },
    onError: (e) => {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Eliminazione massiva fallita",
        variant: "destructive",
      });
    },
  });

  // ── Sort toggle ────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  // ── Fetch all filtered customers (for export / bulk ops) ──
  const fetchAllFiltered = useCallback(async (): Promise<CustomerWithOrders[]> => {
    if (!effectiveCompany?.id) return [];
    const { data, error } = await supabase.rpc("get_customers_paginated" as never, {
      ...rpcParams,
      p_offset: 0,
      p_limit: 100000,
    } as never);
    if (error) throw error;
    return (data as unknown as PaginatedResult).rows ?? [];
  }, [effectiveCompany?.id, rpcParams]);

  // ── Export CSV ─────────────────────────────────────────
  const buildCsvRows = (rows: CustomerWithOrders[]) => {
    const header = [
      "Tipo", "Ragione sociale", "Nome", "Cognome", "Email", "Telefono", "Codice Fiscale / P.IVA",
      "Indirizzo", "CAP", "Città", "Provincia",
      "Indirizzo Cantiere", "CAP Cantiere", "Città Cantiere", "Provincia Cantiere",
      "Note", "N. Ordini", "Data Inserimento", "Venditore", "Accesso Portale",
    ];
    const csvRows = [header];
    rows.forEach((c) => {
      const sp = c.salesperson_id ? salespersonMap.get(c.salesperson_id) : null;
      const firstClean = (c.first_name ?? "").trim();
      const lastClean = (c.last_name ?? "").trim();
      csvRows.push([
        c.is_business ? "Azienda" : "Persona",
        c.business_name ?? "",
        (firstClean === "—" || firstClean === "-") ? "" : firstClean,
        (lastClean === "—" || lastClean === "-") ? "" : lastClean,
        formatCustomerEmail(c.email) ?? "",
        formatPhone(c.phone) ?? "",
        c.fiscal_code || "",
        c.address || "",
        c.postal_code || "",
        c.city || "",
        c.province || "",
        c.site_address || "",
        c.site_postal_code || "",
        c.site_city || "",
        c.site_province || "",
        c.notes || "",
        String(c.order_count),
        c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "",
        sp ? `${sp.first_name} ${sp.last_name}` : "",
        c.portal_disabled ? "No" : "Sì",
      ]);
    });
    return csvRows;
  };

  const downloadCSV = (rows: CustomerWithOrders[], fileName: string) => {
    const csvRows = buildCsvRows(rows);
    const csv = csvRows.map((r) => r.map((v) => escapeCsvCell(v, ";")).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async (rows: CustomerWithOrders[], fileName: string) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clienti");
    const csvRows = buildCsvRows(rows);
    // Anti formula-injection anche su XLSX (come il path CSV): neutralizza le
    // celle "attive" (= + - @) prima di scriverle nel foglio.
    ws.addRows(csvRows.map((r) => r.map((v) => neutralizeXlsxCell(v))));
    // Header style
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    ws.columns.forEach((col) => {
      let max = 10;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value ? String(cell.value) : "";
          max = Math.max(max, Math.min(v.length + 2, 40));
        });
      }
      col.width = max;
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async (rows: CustomerWithOrders[], fileName: string) => {
    const jsPDFModule = await import("jspdf");
    const jsPDF = jsPDFModule.default ?? jsPDFModule.jsPDF;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Elenco Clienti — ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: it })}`, 40, 40);
    doc.setFontSize(9);

    const columns = ["Nome", "Email", "Telefono", "CF", "N. Ordini"];
    const startY = 70;
    const colW = [160, 220, 130, 140, 60];
    let y = startY;

    // Header row
    doc.setFont("helvetica", "bold");
    let x = 40;
    columns.forEach((c, i) => {
      doc.text(c, x + 4, y);
      x += colW[i];
    });
    y += 16;
    doc.setFont("helvetica", "normal");

    rows.forEach((c) => {
      if (y > 550) {
        doc.addPage();
        y = startY;
      }
      x = 40;
      const line = [
        truncate(formatDisplayName(c), 30),
        truncate(formatCustomerEmail(c.email) ?? "", 35),
        truncate(formatPhone(c.phone) ?? "", 20),
        truncate(c.fiscal_code ?? "", 20),
        String(c.order_count),
      ];
      line.forEach((v, i) => {
        doc.text(v, x + 4, y);
        x += colW[i];
      });
      y += 14;
    });

    doc.save(fileName);
  };

  const handleExport = async (format: "csv" | "xlsx" | "pdf", scope: "page" | "all" | "selected") => {
    try {
      let rows: CustomerWithOrders[] = [];
      if (scope === "page") rows = customers;
      else if (scope === "selected") rows = customers.filter((c) => selectedIds.has(c.id));
      else rows = await fetchAllFiltered();

      if (!rows.length) {
        toast({ title: "Nessun cliente", description: "Non ci sono clienti da esportare.", variant: "destructive" });
        return;
      }

      const stamp = formatDate(new Date(), "yyyy-MM-dd");
      const base = `clienti-${scope}-${stamp}`;
      if (format === "csv") downloadCSV(rows, `${base}.csv`);
      else if (format === "xlsx") await downloadExcel(rows, `${base}.xlsx`);
      else await downloadPDF(rows, `${base}.pdf`);

      toast({ title: "Export generato", description: `${rows.length} clienti esportati in ${format.toUpperCase()}.` });
    } catch (e) {
      toast({
        title: "Errore export",
        description: e instanceof Error ? e.message : "Impossibile generare l'export",
        variant: "destructive",
      });
    }
  };

  // date-fns format wrapper (per non dover importare due volte)
  const formatDate = (d: Date, pattern: string) => format(d, pattern);

  // ── Import handler ─────────────────────────────────────
  const handleCustomersImport = useCallback(
    async (
      rows: Record<string, string>[],
      options: ImportOptions,
    ): Promise<{ success: number; errors: string[] }> => {
      if (!effectiveCompany?.id) return { success: 0, errors: ["Azienda non trovata"] };
      let success = 0;
      const errors: string[] = [];

      // Pre-fetch existing emails for dedup (solo se opzione attiva)
      let existingEmails = new Set<string>();
      if (options.skip_duplicates_by_email) {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("email")
            .eq("company_id", effectiveCompany.id);
          existingEmails = new Set(
            (data ?? []).map((r) => String(r.email ?? "").toLowerCase()).filter(Boolean),
          );
        } catch { /* fallback: no dedup */ }
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Detect azienda vs persona: se business_name è valorizzato → azienda
          const businessName = row.business_name?.trim();
          const isBusinessRow = !!businessName;

          if (!isBusinessRow) {
            if (!row.first_name?.trim()) { errors.push(`Riga ${i + 1}: Nome mancante (per aziende usa "Ragione Sociale")`); continue; }
            if (!row.last_name?.trim()) { errors.push(`Riga ${i + 1}: Cognome mancante`); continue; }
          }

          const emailLower = row.email?.trim().toLowerCase() || "";
          if (options.create_portal_account && !emailLower) {
            errors.push(`Riga ${i + 1}: Email mancante per creare l'accesso al portale`);
            continue;
          }
          if (emailLower && options.skip_duplicates_by_email && existingEmails.has(emailLower)) {
            continue;
          }

          const cleanPhone = row.phone
            ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim() || null;

          const { data, error: fnError } = await supabase.functions.invoke("create-customer", {
            body: {
              is_business: isBusinessRow,
              business_name: businessName || null,
              first_name: row.first_name?.trim() || "",
              last_name: row.last_name?.trim() || "",
              email: emailLower || null,
              phone: cleanPhone,
              fiscal_code: row.fiscal_code?.trim() || null,
              address: row.address?.trim() || null,
              city: row.city?.trim() || null,
              postal_code: row.postal_code?.trim() || null,
              province: row.province?.trim().toUpperCase() || null,
              site_address: row.site_address?.trim() || null,
              site_city: row.site_city?.trim() || null,
              site_postal_code: row.site_postal_code?.trim() || null,
              site_province: row.site_province?.trim().toUpperCase() || null,
              notes: row.notes?.trim() || null,
              company_id: effectiveCompany.id,
              create_portal_account: options.create_portal_account,
              send_welcome_email: options.send_welcome_email,
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
          if (emailLower) existingEmails.add(emailLower);
          success++;
        } catch (err) {
          errors.push(`Riga ${i + 1} (${row.email || ""}): ${err instanceof Error ? err.message : "Errore"}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      return { success, errors };
    },
    [effectiveCompany?.id, queryClient],
  );

  const handleInlineSalesperson = (customerId: string, value: string) => {
    assignSalespersonMutation.mutate({
      customerId,
      salespersonId: value === "none" ? null : value,
    });
  };

  // ── Selection logic ────────────────────────────────────
  const allSelectedOnPage = customers.length > 0 && customers.every((c) => selectedIds.has(c.id));
  const someSelectedOnPage = customers.some((c) => selectedIds.has(c.id));
  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        customers.forEach((c) => next.delete(c.id));
      } else {
        customers.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Trend for KPI ─────────────────────────────────────
  const trend = useMemo(() => {
    if (!stats) return null;
    const { month_current, month_previous } = stats;
    if (month_previous === 0) {
      return month_current > 0 ? { value: 100, positive: true } : null;
    }
    const pct = Math.round(((month_current - month_previous) / month_previous) * 100);
    return { value: Math.abs(pct), positive: pct >= 0 };
  }, [stats]);

  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);
  const anomalyRows = useMemo(() => (
    customers
      .map((customer) => {
        const anomalies = getCustomerAnomalies(customer);
        return {
          customer,
          fullName: formatDisplayName(customer),
          anomalies,
          severity: getWorstSeverity(anomalies),
        };
      })
      .filter((row) => row.anomalies.length > 0)
  ), [customers]);
  const anomalyTotals = useMemo(() => ({
    total: anomalyRows.length,
    high: anomalyRows.filter((row) => row.severity === "high").length,
    medium: anomalyRows.filter((row) => row.severity === "medium").length,
    low: anomalyRows.filter((row) => row.severity === "low").length,
  }), [anomalyRows]);
  const topAnomalyRows = useMemo(() => {
    const weight: Record<CustomerAnomalySeverity | "ok", number> = { high: 0, medium: 1, low: 2, ok: 3 };
    return [...anomalyRows]
      .sort((a, b) => weight[a.severity] - weight[b.severity] || b.anomalies.length - a.anomalies.length)
      .slice(0, 3);
  }, [anomalyRows]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 sm:py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Clienti</h1>
              <p className="hidden sm:block mt-0.5 text-sm text-slate-500">
                Gestisci anagrafica, ordini, accessi al portale e import da file o AI.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Niente export su telefono: sei voci di scarico in un
              menu solo, e nessuna era protetta. */}
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Esporta clienti">
                  <Download className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Esporta</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[11px]">Pagina corrente</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport("csv", "page")}>
                  <FileText className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", "page")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", "page")}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px]">Tutti i filtrati</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport("csv", "all")}>
                  <FileText className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", "all")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", "all")}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </DropdownMenuItem>
                {selectedIds.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px]">
                      Solo {selectedIds.size} selezionati
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleExport("csv", "selected")}>
                      <FileText className="h-4 w-4 mr-2" /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("xlsx", "selected")}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("pdf", "selected")}>
                      <FileText className="h-4 w-4 mr-2" /> PDF
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Import */}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} aria-label="Importa clienti con AI">
            <Upload className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Importa</span>
            <Sparkles className="h-3.5 w-3.5 ml-1 text-primary" />
          </Button>

          {/* Columns — la scelta colonne agisce solo sulla tabella desktop;
              su mobile la lista è a card, quindi il bottone è inutile. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Colonne" className="hidden sm:inline-flex">
                <Columns3 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.filter((c) => !("required" in c) || !c.required).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible[c.key as ColumnKey]}
                  onCheckedChange={() => toggle(c.key as ColumnKey)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetColumns}>
                Ripristina default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New customer — la rotta chiede canEditCustomers: senza, il bottone
              portava a una pagina «Accesso negato». */}
          {canEditCustomers ? (
            <Button asChild size="sm" variant="brand">
              <Link to="/azienda/clienti/nuovo">
                <Plus className="mr-1.5 h-4 w-4" />
                <span className="sm:hidden">Nuovo</span>
                <span className="hidden sm:inline">Nuovo Cliente</span>
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="brand" disabled title={customerPermissions.solaLettura ? "Sei in sola lettura" : "Non hai il permesso di modifica"}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="sm:hidden">Nuovo</span>
              <span className="hidden sm:inline">Nuovo Cliente</span>
            </Button>
          )}
          </div>
        </div>
      </div>

      {/* Testata navy famiglia (come Costi/Commesse/Personale/Assistenza):
          i numeri dell'anagrafica clienti. "Con ordini"/"Solo anagrafica"
          restano nascosti su mobile (una riga pulita coi 2 principali). */}
      <div className="rounded-2xl bg-[#173b67] p-3 sm:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-100">Clienti</p>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/12 bg-white/9 p-2.5 sm:p-4">
                <Skeleton className="mb-2 h-3 w-20 bg-white/20" />
                <Skeleton className="h-6 w-12 bg-white/20" />
              </div>
            ))}
          </div>
        ) : statsError ? (
          <div className="flex items-start gap-2 rounded-xl border border-white/12 bg-white/9 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
            <div>
              <p className="font-semibold text-white">Dashboard non disponibile</p>
              <p className="mt-1 text-xs text-blue-100">
                {statsError instanceof Error ? statsError.message : "Errore statistiche"}
              </p>
            </div>
          </div>
        ) : (
          <div className="hidden sm:grid sm:grid-cols-4 sm:gap-3">
            <NavyStatCard
              label="Totale clienti"
              value={stats?.total ?? 0}
              sub="in anagrafica"
              icon={Users}
              tone="text-blue-100"
            />
            <NavyStatCard
              label="Nuovi questo mese"
              value={stats?.month_current ?? 0}
              sub={trend != null ? `${trend.positive ? "+" : ""}${trend.value}% vs mese scorso` : "vs mese scorso"}
              icon={UserPlus}
              tone="text-emerald-300"
            />
            <div className="hidden sm:contents">
              <NavyStatCard
                label="Con ordini"
                value={stats?.with_orders ?? 0}
                sub="almeno 1 ordine"
                icon={ShoppingBag}
                tone="text-blue-100"
              />
              <NavyStatCard
                label="Solo anagrafica"
                value={stats?.portal_disabled ?? 0}
                sub="senza portale"
                icon={ShieldOff}
                tone="text-blue-100"
              />
            </div>
          </div>
        )}
      </div>

      {/* Search + Filters — pattern uniformato a OrdersFilters (Commesse):
          Mobile: search + Filtri avanzati sempre visibili → toggle "Filtri rapidi" mostra 2 select
          Desktop: tutto inline una riga */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        {/* Riga 1: Search + Filtri avanzati button + Clear */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cliente…"
              value={searchQuery}
              onChange={(e) => wrapSet(setSearchQuery)(e.target.value)}
              className="pl-10 pr-9 h-10 sm:h-9"
              aria-label="Cerca per nome, email, telefono o codice fiscale"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => wrapSet(setSearchQuery)("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                aria-label="Pulisci ricerca"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="relative h-10 sm:h-9 shrink-0"
            onClick={() => setAdvOpen(true)}
            aria-label="Apri filtri avanzati"
            title="Filtri avanzati"
          >
            <Filter className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Filtri avanzati</span>
            {activeFiltersCount > 0 && (
              <Badge className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 text-[10px] bg-primary flex items-center justify-center">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearAllFilters}
              className="text-muted-foreground h-10 w-10 sm:h-9 sm:w-9 shrink-0"
              aria-label="Azzera tutti i filtri"
              title="Azzera filtri"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Toggle "Filtri rapidi" — solo mobile (su desktop i 2 select sono sempre visibili) */}
        <button
          type="button"
          onClick={() => setQuickFiltersOpen((v) => !v)}
          className="mt-2 sm:hidden flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          aria-expanded={quickFiltersOpen}
          aria-label="Apri filtri rapidi"
        >
          <span className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-slate-400" />
            Filtri rapidi
            {(filterSalesperson !== "all" || filterOrders !== "all") && (
              <span className="bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center font-bold">
                {[filterSalesperson !== "all", filterOrders !== "all"].filter(Boolean).length}
              </span>
            )}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", quickFiltersOpen && "rotate-180")} />
        </button>

        {/* Filtri rapidi (Venditore + Ordini): collapsed mobile, sempre visibili desktop */}
        <div className={cn(
          "mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 sm:mt-2.5",
          !quickFiltersOpen && "hidden sm:flex",
        )}>
          <Select value={filterSalesperson} onValueChange={wrapSet(setFilterSalesperson)}>
            <SelectTrigger className="w-full h-10 sm:h-9 sm:w-[180px] min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
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

          <Select value={filterOrders} onValueChange={wrapSet(setFilterOrders)}>
            <SelectTrigger className="w-full h-10 sm:h-9 sm:w-[160px] min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
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

      <Sheet open={advOpen} onOpenChange={setAdvOpen}>
        <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
            <SheetTitle>Filtri avanzati</SheetTitle>
            <SheetDescription>
              Affina l'anagrafica clienti per dati di contatto, cantiere, portale e date di inserimento.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Data dal</Label>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => wrapSet(setFilterDateFrom)(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Data al</Label>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => wrapSet(setFilterDateTo)(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Telefono</Label>
                <Select value={filterHasPhone} onValueChange={wrapSet((v: string) => setFilterHasPhone(v as YesNoAll))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="yes">Con telefono</SelectItem>
                    <SelectItem value="no">Senza telefono</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Codice Fiscale / P.IVA</Label>
                <Select value={filterHasFC} onValueChange={wrapSet((v: string) => setFilterHasFC(v as YesNoAll))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="yes">Con CF/P.IVA</SelectItem>
                    <SelectItem value="no">Senza CF/P.IVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Indirizzo cantiere</Label>
                <Select value={filterHasSite} onValueChange={wrapSet((v: string) => setFilterHasSite(v as YesNoAll))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="yes">Con cantiere</SelectItem>
                    <SelectItem value="no">Senza cantiere</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Stato portale</Label>
                <Select value={filterPortal} onValueChange={wrapSet((v: string) => setFilterPortal(v as PortalState))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="active">Con accesso portale</SelectItem>
                    <SelectItem value="disabled">Solo anagrafica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <SheetFooter className="border-t px-5 py-4 sm:justify-between">
            <Button
              variant="outline"
              onClick={clearAllFilters}
              disabled={activeFiltersCount === 0 && !searchQuery}
            >
              Azzera filtri
            </Button>
            <Button onClick={() => setAdvOpen(false)}>
              Applica
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Analisi anomalie: strumento da scrivania → nascosto su mobile
          ("il troppo non va bene" sul telefono). */}
      {customers.length > 0 && anomalyTotals.total > 0 && (
        <Card className="hidden md:block border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">Anomalie clienti</h2>
                  <Badge variant="outline" className="border-red-300 bg-white text-red-700">
                    {anomalyTotals.high} critiche
                  </Badge>
                  <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                    {anomalyTotals.medium} da gestire
                  </Badge>
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                    {anomalyTotals.low} leggere
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Controllo operativo sui clienti visibili: dati mancanti, portale, venditore e cantiere.
                </p>
              </div>

              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
                {topAnomalyRows.map((row) => {
                  const main = row.anomalies[0];
                  const Icon = main.icon;
                  const colorClass = row.severity === "high"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : row.severity === "medium"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-800";
                  return (
                    <button
                      key={row.customer.id}
                      type="button"
                      onClick={() => navigate(`/azienda/clienti/${row.customer.id}`)}
                      className={`rounded-lg border px-3 py-2 text-left transition hover:shadow-sm ${colorClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate text-xs font-semibold">{row.fullName}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] opacity-80">
                        {main.label}{row.anomalies.length > 1 ? ` +${row.anomalies.length - 1}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="border-l-4 border-l-primary bg-primary/5">
          <CardContent className="py-3 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">{selectedIds.size}</Badge>
              <span className="text-sm font-medium">
                {selectedIds.size === 1 ? "cliente selezionato" : "clienti selezionati"}
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedIds(new Set())}>
                Deseleziona
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canEditCustomers && (
                <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
                  <UserCheck className="h-4 w-4 mr-1.5" />
                  Assegna venditore
                </Button>
              )}
              {/* Niente export su telefono. */}
              {!isMobile && (
                <Button size="sm" variant="outline" onClick={() => handleExport("xlsx", "selected")}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Esporta Excel
                </Button>
              )}
              {canEditCustomers && (
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Elimina selezionati
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium">Errore nel caricamento</h3>
            <p className="text-muted-foreground text-center mt-2 max-w-md">
              {listError instanceof Error ? listError.message : "Impossibile caricare la lista clienti."}
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
              {searchQuery || activeFiltersCount > 0
                ? "Prova a modificare i filtri o i termini di ricerca."
                : "Non hai ancora clienti in anagrafica. Creane uno o importa da file / AI."}
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {(searchQuery || activeFiltersCount > 0) ? (
                <Button variant="outline" onClick={clearAllFilters}>Azzera filtri</Button>
              ) : (
                <>
                  <Button asChild>
                    <Link to="/azienda/clienti/nuovo">
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi Cliente
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importa
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {customers.map((customer) => {
              const initials = formatInitials(customer);
              const fullName = formatDisplayName(customer);
              const cleanPhone = formatPhone(customer.phone);
              const cleanEmail = formatCustomerEmail(customer.email);
              const anomalies = getCustomerAnomalies(customer);
              const severity = getWorstSeverity(anomalies);
              const avatarColor = getAvatarColor(fullName);
              const isSelected = selectedIds.has(customer.id);
              return (
                <div key={customer.id} className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors">
                  {/* Hit area 44×44 (touch target Apple HIG / Material). Checkbox 16px
                      centrato dentro. È uno <span role=checkbox>, NON un <button>:
                      la Checkbox interna è già un <button> Radix, e button-dentro-button
                      è HTML invalido (warning validateDOMNesting). Tastiera gestita a mano. */}
                  <span
                    role="checkbox"
                    tabIndex={0}
                    aria-label={`Seleziona ${fullName}`}
                    aria-checked={isSelected}
                    onClick={(e) => { e.stopPropagation(); toggleRow(customer.id); }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleRow(customer.id);
                      }
                    }}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center -ml-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Checkbox
                      checked={isSelected}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="pointer-events-none"
                    />
                  </span>
                  <Link to={`/azienda/clienti/${customer.id}`} className="flex-1 flex items-center gap-3 min-w-0">
                    <Avatar className={`h-10 w-10 shrink-0 ${avatarColor}`}>
                      <AvatarFallback className="text-sm font-bold text-white bg-transparent">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start flex-wrap gap-x-2 gap-y-1">
                        <p className="font-semibold text-sm leading-tight line-clamp-2 break-words">{fullName}</p>
                        {customer.is_business && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-500/40 text-blue-700 dark:text-blue-400">
                            Azienda
                          </Badge>
                        )}
                        {customer.portal_disabled && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                            Anagrafica
                          </Badge>
                        )}
                        {severity !== "ok" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-4 px-1 ${
                              severity === "high"
                                ? "border-red-500/40 text-red-700"
                                : severity === "medium"
                                  ? "border-amber-500/40 text-amber-700"
                                  : "border-slate-400 text-slate-600"
                            }`}
                          >
                            {anomalies.length} anomalie
                          </Badge>
                        )}
                      </div>
                      {cleanPhone && <p className="text-xs text-muted-foreground">{cleanPhone}</p>}
                      {cleanEmail ? (
                        <p className="text-xs text-muted-foreground truncate">{cleanEmail}</p>
                      ) : (
                        <p className="text-xs text-amber-700">Email non inserita</p>
                      )}
                      {customer.city && <p className="text-[11px] text-muted-foreground">{formatLocality(customer.city, customer.postal_code, customer.province)}</p>}
                    </div>
                    {customer.order_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span className="font-medium">{customer.order_count}</span>
                      </div>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelectedOnPage ? true : (someSelectedOnPage ? "indeterminate" : false)}
                    onCheckedChange={togglePageSelection}
                    aria-label="Seleziona pagina"
                  />
                </TableHead>
                {visible.avatar && <TableHead className="w-10"></TableHead>}
                {visible.name && (
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                      Nome <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                )}
                {visible.health && <TableHead>Salute</TableHead>}
                {visible.email && <TableHead>Email</TableHead>}
                {visible.phone && <TableHead>Telefono</TableHead>}
                {visible.fiscal_code && <TableHead>CF / P.IVA</TableHead>}
                {visible.address && <TableHead>Indirizzo</TableHead>}
                {visible.site_address && <TableHead>Cantiere</TableHead>}
                {visible.notes && <TableHead>Note</TableHead>}
                {visible.created_at && (
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort("created_at")}>
                      <Calendar className="h-3.5 w-3.5" /> Data <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                )}
                {visible.salesperson && <TableHead>Venditore</TableHead>}
                {visible.orders && (
                  <TableHead className="text-center">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => toggleSort("orders")}>
                      Ordini <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                )}
                {visible.portal && <TableHead>Portale</TableHead>}
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const initials = formatInitials(customer);
                const fullName = formatDisplayName(customer);
                const avatarColor = getAvatarColor(fullName);
                const cleanPhone = formatPhone(customer.phone);
                const cleanEmail = formatCustomerEmail(customer.email);
                const locality = formatLocality(customer.city, customer.postal_code, customer.province);
                const anomalies = getCustomerAnomalies(customer);
                const severity = getWorstSeverity(anomalies);
                const isSelected = selectedIds.has(customer.id);
                return (
                  <TableRow
                    key={customer.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/azienda/clienti/${customer.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(customer.id)}
                        aria-label={`Seleziona ${fullName}`}
                      />
                    </TableCell>
                    {visible.avatar && (
                      <TableCell>
                        <Avatar className={`h-8 w-8 shrink-0 ${avatarColor}`}>
                          <AvatarFallback className="text-xs font-bold text-white bg-transparent">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                    )}
                    {visible.name && (
                      <TableCell>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm leading-tight truncate max-w-[220px]">{fullName}</p>
                            {customer.is_business && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] border-blue-500/40 text-blue-700 dark:text-blue-400">
                                Azienda
                              </Badge>
                            )}
                            {customer.portal_disabled && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ShieldOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-[200px]">
                                      Cliente solo anagrafica: nessun accesso al portale.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {locality && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {locality}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {visible.health && (
                      <TableCell>
                        {severity === "ok" ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                            OK
                          </Badge>
                        ) : (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={
                                    severity === "high"
                                      ? "border-red-500/40 bg-red-50 text-red-700"
                                      : severity === "medium"
                                        ? "border-amber-500/40 bg-amber-50 text-amber-700"
                                        : "border-slate-300 text-slate-700"
                                  }
                                >
                                  {severity === "high" ? "Critico" : severity === "medium" ? "Da gestire" : "Da completare"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-[260px] space-y-1 text-xs">
                                  {anomalies.map((anomaly, index) => (
                                    <p key={`${anomaly.label}-${index}`}>
                                      <span className="font-semibold">{anomaly.label}:</span> {anomaly.action}
                                    </p>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                    )}
                    {visible.email && (
                      <TableCell>
                        {cleanEmail ? (
                          <a
                            href={`mailto:${cleanEmail}`}
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="h-4 w-4 shrink-0" />
                            <span className="truncate max-w-[200px]">{cleanEmail}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">Email non inserita</span>
                        )}
                      </TableCell>
                    )}
                    {visible.phone && (
                      <TableCell>
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
                    )}
                    {visible.fiscal_code && (
                      <TableCell>
                        {customer.fiscal_code ? (
                          <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                            <CreditCard className="h-3.5 w-3.5" />
                            {customer.fiscal_code}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {visible.address && (
                      <TableCell>
                        {customer.address ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[220px]">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{customer.address}</span>
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {visible.site_address && (
                      <TableCell>
                        {customer.site_address ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[220px]">
                            <HardHat className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{customer.site_address}</span>
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {visible.notes && (
                      <TableCell>
                        {customer.notes ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <StickyNote className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[180px]">{customer.notes}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-[300px] whitespace-pre-wrap">{customer.notes}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {visible.created_at && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {customer.created_at ? format(new Date(customer.created_at), "dd MMM yyyy", { locale: it }) : "—"}
                        </span>
                      </TableCell>
                    )}
                    {visible.salesperson && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={customer.salesperson_id || "none"}
                          onValueChange={(val) => handleInlineSalesperson(customer.id, val)}
                          disabled={assignSalespersonMutation.isPending}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-muted-foreground">Nessuno</span></SelectItem>
                            {salespeople.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {visible.orders && (
                      <TableCell className="text-center">
                        {customer.order_count === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <Badge
                            variant={customer.order_count > 3 ? "default" : "secondary"}
                            className={customer.order_count > 3 ? "bg-amber-100 text-amber-800 border-amber-200 font-bold" : ""}
                          >
                            {customer.order_count}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    {visible.portal && (
                      <TableCell>
                        {customer.portal_disabled ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">
                            <ShieldOff className="h-3 w-3 mr-1" />
                            No
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                            Sì
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Azioni ${fullName}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Azioni cliente</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate(`/azienda/clienti/${customer.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Apri scheda
                          </DropdownMenuItem>
                          {cleanEmail && (
                            <DropdownMenuItem onClick={() => window.location.href = `mailto:${cleanEmail}`}>
                              <Mail className="h-4 w-4 mr-2" />
                              Scrivi email
                            </DropdownMenuItem>
                          )}
                          {cleanPhone && (
                            <DropdownMenuItem onClick={() => window.location.href = `tel:${cleanPhone}`}>
                              <Phone className="h-4 w-4 mr-2" />
                              Chiama
                            </DropdownMenuItem>
                          )}
                          {!customer.portal_disabled && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    disabled={resetPasswordMutation.isPending}
                                  >
                                    <KeyRound className="h-4 w-4 mr-2" />
                                    Reset password
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Reset Password</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Vuoi resettare la password per {fullName}?
                                      <br />
                                      <span className="text-muted-foreground">Verrà generata una nuova password da comunicare al cliente.</span>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => resetPasswordMutation.mutate(customer.id)}>Conferma</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                          {canEditCustomers && <DropdownMenuSeparator />}
                          {canEditCustomers && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                disabled={deleteCustomerMutation.isPending}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Elimina Cliente</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {customer.order_count > 0 ? (
                                    <>Impossibile eliminare {fullName} perché ha <strong>{customer.order_count} ordini</strong> associati.</>
                                  ) : (
                                    <>Sei sicuro di voler eliminare {fullName}? Questa azione non può essere annullata.</>
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

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t flex-wrap">
            <p className="text-xs sm:text-sm text-muted-foreground">
              <span className="hidden sm:inline">Mostrando {rangeStart}–{rangeEnd} di </span>
              <span className="sm:hidden">{totalCount} </span>
              <span className="hidden sm:inline">{totalCount} </span>
              clienti
            </p>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Righe:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Pagina precedente">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Pagina successiva">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Password Resettata</DialogTitle>
            <DialogDescription>
              La password per {resetPasswordDialog.customer ? formatDisplayName(resetPasswordDialog.customer) : ""} è stata resettata con successo.
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

      {/* Bulk delete */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedIds.size} clienti?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati <strong>{selectedIds.size}</strong> clienti. I clienti con ordini associati
              saranno saltati. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Sopra la soglia si scrive il numero: «seleziona tutti» più
              «Elimina» erano due clic. */}
          <ConfermaQuantita stato={confermaBulk} cosa="clienti" disabled={bulkDeleteMutation.isPending} />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                if (!confermaBulk.valida) { e.preventDefault(); return; }
                bulkDeleteMutation.mutate(Array.from(selectedIds));
              }}
              disabled={bulkDeleteMutation.isPending || !confermaBulk.valida}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk assign salesperson */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assegna venditore a {selectedIds.size} clienti</DialogTitle>
            <DialogDescription>
              Scegli il venditore da assegnare. Sovrascriverà eventuali assegnazioni esistenti.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Venditore</Label>
            <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none"><span className="text-muted-foreground">Rimuovi venditore</span></SelectItem>
                {salespeople.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Annulla</Button>
            <Button
              onClick={() => bulkAssignMutation.mutate({
                ids: Array.from(selectedIds),
                salespersonId: bulkAssignValue === "none" ? null : bulkAssignValue,
              })}
              disabled={bulkAssignMutation.isPending}
            >
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Import */}
      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        fields={CUSTOMER_IMPORT_FIELDS}
        onImport={handleCustomersImport}
        portalEnabled={portalEnabled}
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
