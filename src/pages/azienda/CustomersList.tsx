import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Search, Mail, Phone, ClipboardList, KeyRound, Copy, Check, Pencil, Trash2, Download, Upload, MoreVertical, AlertTriangle, ArrowUpDown, Calendar, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://guqgszwelffntrgtsycm.supabase.co";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  fiscal_code: string | null;
  address: string | null;
  site_address: string | null;
  notes: string | null;
  order_count: number;
  created_at: string;
  salesperson_id: string | null;
}

interface PaginatedResult {
  rows: CustomerWithOrders[];
  total_count: number;
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

export default function CustomersList() {
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

  const salespersonMap = new Map(salespeople.map(sp => [sp.id, sp]));

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

  const { data: paginatedData, isLoading, isError } = useQuery({
    queryKey: queryKeys.customersList.list(effectiveCompany?.id, searchQuery, filterSalesperson, filterOrders, sortField, sortDir, page, pageSize),
    queryFn: async (): Promise<PaginatedResult> => {
      if (!effectiveCompany?.id) return { rows: [], total_count: 0 };
      
      const { data, error } = await supabase.rpc("get_customers_paginated", rpcParams as any);
      if (error) throw error;
      return data as unknown as PaginatedResult;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 30 * 1000,
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
    onError: () => {
      toast({ title: "Errore", description: "Impossibile assegnare il venditore", variant: "destructive" });
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
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Impossibile resettare la password", variant: "destructive" });
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
      const { error } = await supabase.from("profiles").delete().eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast({ title: "Cliente eliminato", description: "Il cliente è stato eliminato con successo" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Impossibile eliminare il cliente", variant: "destructive" });
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
        c.first_name, c.last_name, c.email, c.phone || "", c.fiscal_code || "",
        c.address || "", c.site_address || "", c.notes || "", String(c.order_count),
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
      } as any);
      if (error) throw error;
      const result = data as unknown as PaginatedResult;
      const csvRows = [["Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Indirizzo", "Indirizzo Cantiere", "Note", "N. Ordini", "Data Inserimento", "Venditore"]];
      (result.rows || []).forEach((c) => {
        const sp = c.salesperson_id ? salespersonMap.get(c.salesperson_id) : null;
        csvRows.push([
          c.first_name, c.last_name, c.email, c.phone || "", c.fiscal_code || "",
          c.address || "", c.site_address || "", c.notes || "", String(c.order_count),
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
    } catch {
      toast({ title: "Errore", description: "Impossibile esportare i clienti", variant: "destructive" });
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

        const { data, error: fnError } = await supabase.functions.invoke("create-customer", {
          body: {
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            phone: row.phone?.trim() || null,
            fiscal_code: row.fiscal_code?.trim() || null,
            address: row.address?.trim() || null,
            site_address: row.site_address?.trim() || null,
            notes: row.notes?.trim() || null,
            company_id: effectiveCompany.id,
          },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        success++;
      } catch (err: any) {
        errors.push(`Riga ${i + 1} (${row.email || ""}): ${err?.message || "Errore"}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    return { success, errors };
  }, [effectiveCompany?.id, queryClient]);

  const handleInlineSalesperson = (customerId: string, value: string) => {
    assignSalespersonMutation.mutate({
      customerId,
      salespersonId: value === "none" ? null : value,
    });
  };

  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-muted-foreground">Gestisci i clienti dell'azienda</p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
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
              Nuovo Cliente
            </Link>
          </Button>
        </div>
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
            <SelectTrigger className="w-[200px]">
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
            <SelectTrigger className="w-[180px]">
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
            <p className="text-muted-foreground text-center mt-2">
              Impossibile caricare la lista clienti. Riprova più tardi.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
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
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessun cliente trovato</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery || filterSalesperson !== "all" || filterOrders !== "all"
                ? "Prova a modificare i filtri o i termini di ricerca"
                : "Inizia aggiungendo il primo cliente"}
            </p>
            {!searchQuery && filterSalesperson === "all" && filterOrders === "all" && (
              <Button asChild className="mt-4">
                <Link to="/azienda/clienti/nuovo">
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Cliente
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
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
                <TableHead>Email</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => toggleSort("created_at")}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Data
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>Venditore</TableHead>
                <TableHead className="text-center">Ordini</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const sp = customer.salesperson_id ? salespersonMap.get(customer.salesperson_id) : null;
                return (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.first_name} {customer.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="truncate max-w-[180px]">{customer.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.phone ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          {customer.phone}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {customer.created_at ? format(new Date(customer.created_at), "dd MMM yyyy", { locale: it }) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span>{customer.order_count}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/azienda/clienti/${customer.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={resetPasswordMutation.isPending}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reset Password</AlertDialogTitle>
                              <AlertDialogDescription>
                                Vuoi resettare la password per {customer.first_name} {customer.last_name}?
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={deleteCustomerMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Elimina Cliente</AlertDialogTitle>
                              <AlertDialogDescription>
                                {customer.order_count > 0 ? (
                                  <>
                                    Impossibile eliminare {customer.first_name} {customer.last_name} perché ha{" "}
                                    <strong>{customer.order_count} ordini</strong> associati.
                                    <br />
                                    Elimina prima tutti gli ordini del cliente.
                                  </>
                                ) : (
                                  <>
                                    Sei sicuro di voler eliminare {customer.first_name} {customer.last_name}?
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

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Mostrando {rangeStart}–{rangeEnd} di {totalCount} clienti
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
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
              <span className="text-sm text-muted-foreground">
                Pagina {page + 1} di {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
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
              La password per {resetPasswordDialog.customer?.first_name}{" "}
              {resetPasswordDialog.customer?.last_name} è stata resettata con successo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground mb-2">Nuova Password:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-lg">
                  {resetPasswordDialog.newPassword}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyPassword}>
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
