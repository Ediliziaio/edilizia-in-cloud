import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Search, Mail, Phone, ClipboardList, KeyRound, Copy, Check, Pencil, Trash2, Download, Upload, MoreVertical, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

  const { data: customers = [], isLoading, isError } = useQuery({
    queryKey: ["customers-list", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      // Fetch roles and order counts in parallel
      const [rolesRes, ordersRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "customer"),
        supabase.from("orders").select("customer_id").eq("company_id", effectiveCompany.id),
      ]);

      const customerIds = (rolesRes.data || []).map(r => r.user_id);
      if (customerIds.length === 0) return [];

      const { data: customerProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, fiscal_code, address, site_address, notes")
        .eq("company_id", effectiveCompany.id)
        .in("id", customerIds);

      if (profilesError) throw profilesError;

      const orderCountMap = new Map<string, number>();
      (ordersRes.data || []).forEach((order) => {
        orderCountMap.set(order.customer_id, (orderCountMap.get(order.customer_id) || 0) + 1);
      });

      return (customerProfiles || []).map((customer) => ({
        ...customer,
        order_count: orderCountMap.get(customer.id) || 0,
      })) as CustomerWithOrders[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-customer-password`,
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

  const filteredCustomers = customers.filter(
    (customer) => {
      const q = searchQuery.toLowerCase();
      return (
        customer.first_name.toLowerCase().includes(q) ||
        customer.last_name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        (customer.phone?.toLowerCase().includes(q) ?? false) ||
        (customer.fiscal_code?.toLowerCase().includes(q) ?? false)
      );
    }
  );

  // Export CSV
  const exportCustomersCSV = useCallback(() => {
    const rows = [["Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Indirizzo", "Indirizzo Cantiere", "Note", "N. Ordini"]];
    filteredCustomers.forEach((c) => {
      rows.push([
        c.first_name, c.last_name, c.email, c.phone || "", c.fiscal_code || "",
        c.address || "", c.site_address || "", c.notes || "", String(c.order_count),
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
  }, [filteredCustomers, toast]);

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
                Esporta CSV
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per nome o email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
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
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessun cliente trovato</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery ? "Prova a modificare i termini di ricerca" : "Inizia aggiungendo il primo cliente"}
            </p>
            {!searchQuery && (
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
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead className="text-center">Ordini</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    {customer.first_name} {customer.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {customer.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.phone ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {customer.phone}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
              ))}
            </TableBody>
          </Table>
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
