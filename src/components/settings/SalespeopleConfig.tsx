import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Plus, Pencil, Trash2, Loader2, Percent, DollarSign, Receipt, UserPlus, Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";

export interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  commission_type: "fixed" | "percentage_sold" | "percentage_collected";
  commission_value: number;
  is_active: boolean;
  user_id: string | null;
}

const COMMISSION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  fixed: { label: "Fisso", icon: <DollarSign className="h-3 w-3" /> },
  percentage_sold: { label: "% sul venduto", icon: <Percent className="h-3 w-3" /> },
  percentage_collected: { label: "% sull'incassato", icon: <Receipt className="h-3 w-3" /> },
};

export function SalespeopleConfig() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null);
  
  // Account creation state
  const [createAccountDialog, setCreateAccountDialog] = useState<{ open: boolean; salesperson: Salesperson | null }>({
    open: false,
    salesperson: null,
  });
  const [accountEmail, setAccountEmail] = useState("");
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; password: string; name: string }>({
    open: false,
    password: "",
    name: "",
  });

  // Fetch salespeople
  const { data: salespeople = [], isLoading } = useQuery({
    queryKey: ["salespeople", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("*")
        .eq("company_id", companyId!)
        .order("last_name", { ascending: true });

      if (error) throw error;
      return data as Salesperson[];
    },
    enabled: !!companyId,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Salesperson> & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("salespeople")
          .update({
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            commission_type: data.commission_type,
            commission_value: data.commission_value,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salespeople").insert({
          company_id: companyId!,
          first_name: data.first_name!,
          last_name: data.last_name!,
          email: data.email,
          phone: data.phone,
          commission_type: data.commission_type || "percentage_sold",
          commission_value: data.commission_value || 0,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      toast({
        title: editingSalesperson ? "Venditore aggiornato" : "Venditore creato",
        description: "Le modifiche sono state salvate.",
      });
      setDialogOpen(false);
      setEditingSalesperson(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile salvare il venditore.",
        variant: "destructive",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("salespeople")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salespeople").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      toast({
        title: "Venditore eliminato",
        description: "Il venditore è stato rimosso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message?.includes("order_salespeople")
          ? "Impossibile eliminare: il venditore ha ordini associati."
          : "Impossibile eliminare il venditore.",
        variant: "destructive",
      });
    },
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async ({ salesperson_id, email }: { salesperson_id: string; email: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Sessione non valida");
      }

      const response = await supabase.functions.invoke("create-salesperson-user", {
        body: { salesperson_id, email },
      });

      if (response.error) {
        throw new Error(response.error.message || "Errore nella creazione account");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Errore sconosciuto");
      }

      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      setCreateAccountDialog({ open: false, salesperson: null });
      setAccountEmail("");
      
      // Show password dialog
      const sp = createAccountDialog.salesperson;
      setPasswordDialog({
        open: true,
        password: data.temp_password,
        name: sp ? `${sp.first_name} ${sp.last_name}` : "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (salesperson: Salesperson) => {
    setEditingSalesperson(salesperson);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingSalesperson(null);
    setDialogOpen(true);
  };

  const handleOpenCreateAccount = (salesperson: Salesperson) => {
    setAccountEmail(salesperson.email || "");
    setCreateAccountDialog({ open: true, salesperson });
  };

  const handleCreateAccount = () => {
    if (!createAccountDialog.salesperson || !accountEmail) return;
    
    createAccountMutation.mutate({
      salesperson_id: createAccountDialog.salesperson.id,
      email: accountEmail,
    });
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(passwordDialog.password);
    toast({
      title: "Copiato",
      description: "Password copiata negli appunti",
    });
  };

  const formatCommissionValue = (type: string, value: number) => {
    if (type === "fixed") {
      return formatCurrency(value);
    }
    return `${value}%`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Venditori
            </CardTitle>
            <CardDescription>
              Gestisci i venditori e le loro provvigioni
            </CardDescription>
          </div>
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Venditore
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : salespeople.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun venditore configurato.</p>
            <p className="text-sm">Aggiungi i tuoi venditori per tracciare le provvigioni.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contatto</TableHead>
                <TableHead>Tipo Provvigione</TableHead>
                <TableHead>Valore</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Attivo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salespeople.map((sp) => (
                <TableRow key={sp.id} className={!sp.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {sp.first_name} {sp.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="text-sm">
                      {sp.email && <div>{sp.email}</div>}
                      {sp.phone && <div>{sp.phone}</div>}
                      {!sp.email && !sp.phone && "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.icon}
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCommissionValue(sp.commission_type, sp.commission_value)}
                  </TableCell>
                  <TableCell>
                    {sp.user_id ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        Attivo
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenCreateAccount(sp)}
                        disabled={createAccountMutation.isPending}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Crea Account
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={sp.is_active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: sp.id, is_active: checked })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(sp)}
                        title="Modifica"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Elimina">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare il venditore?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Il venditore {sp.first_name} {sp.last_name} verrà eliminato.
                              Questa azione è irreversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(sp.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SalespersonDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSalesperson(null);
        }}
        salesperson={editingSalesperson}
        onSave={(data) => saveMutation.mutate(data)}
        isLoading={saveMutation.isPending}
      />

      {/* Create Account Dialog */}
      <Dialog
        open={createAccountDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCreateAccountDialog({ open: false, salesperson: null });
            setAccountEmail("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Account Venditore</DialogTitle>
            <DialogDescription>
              Verrà creato un account per{" "}
              {createAccountDialog.salesperson?.first_name}{" "}
              {createAccountDialog.salesperson?.last_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="email@esempio.com"
              />
              <p className="text-sm text-muted-foreground">
                Questa email sarà usata per il login del venditore.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateAccountDialog({ open: false, salesperson: null })}
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreateAccount}
              disabled={!accountEmail || createAccountMutation.isPending}
            >
              {createAccountMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creazione...
                </>
              ) : (
                "Crea Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog
        open={passwordDialog.open}
        onOpenChange={(open) => {
          if (!open) setPasswordDialog({ open: false, password: "", name: "" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              Account Creato!
            </DialogTitle>
            <DialogDescription>
              L'account per {passwordDialog.name} è stato creato con successo.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertDescription className="space-y-3">
              <p className="font-medium">Password temporanea:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-muted rounded-md font-mono text-lg">
                  {passwordDialog.password}
                </code>
                <Button variant="outline" size="icon" onClick={copyPassword}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Comunica questa password al venditore. Dovrà cambiarla al primo accesso.
              </p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button onClick={() => setPasswordDialog({ open: false, password: "", name: "" })}>
              Ho capito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
