import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Plus, Pencil, Trash2, Loader2, Percent, DollarSign, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
        // Update
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
        // Create
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
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message?.includes("order_salespeople")
          ? "Impossibile eliminare: il venditore ha ordini associati."
          : "Impossibile eliminare il venditore.",
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
    </Card>
  );
}
