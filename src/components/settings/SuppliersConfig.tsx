import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { VAT_RATES, getVatRateLabel } from "@/lib/vatUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Supplier {
  id: string;
  name: string;
  vat_rate: number | null;
  created_at: string;
  company_id: string;
}

export function SuppliersConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ name: "", vat_rate: 22 });

  // Fetch suppliers
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers-config", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  // Create supplier mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; vat_rate: number }) => {
      const { error } = await supabase
        .from("suppliers")
        .insert({
          name: data.name,
          vat_rate: data.vat_rate,
          company_id: companyId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornitore creato", description: "Il fornitore è stato aggiunto con successo." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Errore", description: "Impossibile creare il fornitore.", variant: "destructive" });
      console.error(error);
    },
  });

  // Update supplier mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; vat_rate: number }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ name: data.name, vat_rate: data.vat_rate })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornitore aggiornato", description: "Le modifiche sono state salvate." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Errore", description: "Impossibile aggiornare il fornitore.", variant: "destructive" });
      console.error(error);
    },
  });

  // Delete supplier mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornitore eliminato", description: "Il fornitore è stato rimosso." });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
    },
    onError: (error: Error) => {
      if (error.message.includes("foreign key") || error.message.includes("violates")) {
        toast({ 
          title: "Impossibile eliminare", 
          description: "Il fornitore è associato a degli articoli e non può essere eliminato.", 
          variant: "destructive" 
        });
      } else {
        toast({ title: "Errore", description: "Impossibile eliminare il fornitore.", variant: "destructive" });
      }
      console.error(error);
    },
  });

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({ name: "", vat_rate: 22 });
    setDialogOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({ name: supplier.name, vat_rate: supplier.vat_rate || 22 });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
    setFormData({ name: "", vat_rate: 22 });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Errore", description: "Il nome è obbligatorio.", variant: "destructive" });
      return;
    }

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleOpenDelete = (supplier: Supplier) => {
    setDeletingSupplier(supplier);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingSupplier) {
      deleteMutation.mutate(deletingSupplier.id);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Fornitori
            </CardTitle>
            <CardDescription>
              Gestisci i tuoi fornitori e le relative aliquote IVA predefinite
            </CardDescription>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Fornitore
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : suppliers && suppliers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome Fornitore</TableHead>
                <TableHead>Aliquota IVA</TableHead>
                <TableHead className="w-[100px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{getVatRateLabel(supplier.vat_rate || 22)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(supplier)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDelete(supplier)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun fornitore configurato</p>
            <p className="text-sm">Crea un fornitore per iniziare</p>
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Modifica Fornitore" : "Nuovo Fornitore"}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? "Modifica i dati del fornitore"
                : "Inserisci i dati del nuovo fornitore"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Fornitore *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Es. ABC Serramenti Srl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_rate">Aliquota IVA Predefinita</Label>
              <Select
                value={formData.vat_rate.toString()}
                onValueChange={(value) => setFormData({ ...formData, vat_rate: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Questa aliquota verrà applicata di default agli articoli di questo fornitore
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Annulla
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSupplier ? "Salva" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fornitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il fornitore "{deletingSupplier?.name}". 
              Questa azione non può essere annullata.
              {"\n\n"}
              Nota: non è possibile eliminare fornitori associati a degli articoli.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
