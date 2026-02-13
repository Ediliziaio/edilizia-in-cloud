import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Search, Mail, Phone, ClipboardList, KeyRound, Copy, Check, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CustomerWithOrders {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
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

export default function CustomersList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [resetPasswordDialog, setResetPasswordDialog] = useState<{
    open: boolean;
    customer: CustomerWithOrders | null;
    newPassword: string | null;
    copied: boolean;
  }>({ open: false, customer: null, newPassword: null, copied: false });
  
  const { effectiveCompany, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customers for the company
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers-list", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      // Step 1: get customer user IDs
      const { data: customerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "customer");

      const customerIds = (customerRoles || []).map(r => r.user_id);
      if (customerIds.length === 0) return [];

      // Step 2: fetch profiles for those IDs within the company
      const { data: customerProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", effectiveCompany.id)
        .in("id", customerIds);

      if (profilesError) throw profilesError;

      // Get order counts for each customer
      const { data: orderCounts, error: ordersError } = await supabase
        .from("orders")
        .select("customer_id")
        .eq("company_id", effectiveCompany.id);

      if (ordersError) throw ordersError;

      const orderCountMap = new Map<string, number>();
      orderCounts.forEach((order) => {
        orderCountMap.set(
          order.customer_id,
          (orderCountMap.get(order.customer_id) || 0) + 1
        );
      });

      return (customerProfiles || []).map((customer) => ({
        ...customer,
        order_count: orderCountMap.get(customer.id) || 0,
      })) as CustomerWithOrders[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000, // 5 minuti
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Non autenticato");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-customer-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ customer_id: customerId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Errore durante il reset della password");
      }

      return data as { success: boolean; newPassword: string; customer: ResetPasswordResult["customer"] };
    },
    onSuccess: (data, customerId) => {
      const customer = customers.find((c) => c.id === customerId);
      setResetPasswordDialog({
        open: true,
        customer: customer || null,
        newPassword: data.newPassword,
        copied: false,
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Impossibile resettare la password",
        variant: "destructive",
      });
    },
  });

  const handleCopyPassword = async () => {
    if (resetPasswordDialog.newPassword) {
      await navigator.clipboard.writeText(resetPasswordDialog.newPassword);
      setResetPasswordDialog((prev) => ({ ...prev, copied: true }));
      toast({
        title: "Copiato",
        description: "Password copiata negli appunti",
      });
    }
  };

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast({
        title: "Cliente eliminato",
        description: "Il cliente è stato eliminato con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Impossibile eliminare il cliente",
        variant: "destructive",
      });
    },
  });

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-muted-foreground">Gestisci i clienti dell'azienda</p>
        </div>
        <Button asChild>
          <Link to="/azienda/clienti/nuovo">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Cliente
          </Link>
        </Button>
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
      {isLoading ? (
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
              {searchQuery
                ? "Prova a modificare i termini di ricerca"
                : "Inizia aggiungendo il primo cliente"}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <Link to={`/azienda/clienti/${customer.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={resetPasswordMutation.isPending}
                          >
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
                            <AlertDialogAction
                              onClick={() => resetPasswordMutation.mutate(customer.id)}
                            >
                              Conferma Reset
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleteCustomerMutation.isPending}
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
          if (!open) {
            setResetPasswordDialog({
              open: false,
              customer: null,
              newPassword: null,
              copied: false,
            });
          }
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
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPassword}
                >
                {resetPasswordDialog.copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm text-warning-foreground">
                <strong>Importante:</strong> Comunica questa password al cliente in modo sicuro.
                La password non sarà più visibile dopo aver chiuso questa finestra.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() =>
                setResetPasswordDialog({
                  open: false,
                  customer: null,
                  newPassword: null,
                  copied: false,
                })
              }
            >
              Ho Copiato la Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
