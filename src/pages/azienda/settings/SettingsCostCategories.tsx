import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { Plus, Pencil, Trash2, Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CostCategory {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export default function SettingsCostCategories() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: queryKeys.costCategories.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data || []) as CostCategory[];
    },
    enabled: !!companyId,
  });

  // Usage count per category name
  const { data: usageCounts = {} } = useQuery({
    queryKey: ["cost-category-usage", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("category")
        .eq("company_id", companyId!)
        .not("category", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => {
        if (c.category) counts[c.category] = (counts[c.category] || 0) + 1;
      });
      return counts;
    },
    enabled: !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase.from("cost_categories").insert({
        company_id: companyId!,
        name: name.trim(),
        color,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-categories"] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      setNewName("");
      toast.success("Categoria aggiunta");
    },
    onError: (e: any) => toast.error(e.message || "Errore"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase.from("cost_categories").update({ name: name.trim(), color }).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error("Categoria già esistente");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-categories"] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      setEditingId(null);
      toast.success("Categoria aggiornata");
    },
    onError: (e: any) => toast.error(e.message || "Errore"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cost_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-categories"] });
      setDeleteId(null);
      toast.success("Categoria eliminata");
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      // Get existing categories from costs
      const { data: costs } = await supabase
        .from("company_costs")
        .select("category")
        .eq("company_id", companyId!)
        .not("category", "is", null);

      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("product_category")
        .eq("company_id", companyId!)
        .not("product_category", "is", null);

      const cats = new Set<string>();
      costs?.forEach((c: any) => { if (c.category) cats.add(c.category); });
      supplierData?.forEach((s: any) => { if (s.product_category) cats.add(s.product_category); });

      if (cats.size === 0) {
        toast.info("Nessuna categoria da importare");
        return;
      }

      const existing = categories.map(c => c.name);
      const toInsert = Array.from(cats)
        .filter(name => !existing.includes(name))
        .map(name => ({ company_id: companyId!, name }));

      if (toInsert.length === 0) {
        toast.info("Tutte le categorie sono già presenti");
        return;
      }

      const { error } = await supabase.from("cost_categories").insert(toInsert);
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["cost-categories"] });
      if (count) toast.success(`${count} categorie importate`);
    },
    onError: () => toast.error("Errore nell'importazione"),
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMutation.mutate({ name: newName, color: newColor });
  };

  const startEdit = (cat: CostCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || "#6366f1");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Categorie Costi</h1>
        <p className="text-muted-foreground">
          Gestisci le categorie utilizzate per classificare i costi aziendali
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" /> Categorie
              </CardTitle>
              <CardDescription>
                {categories.length} {categories.length === 1 ? "categoria" : "categorie"} configurate
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {importMutation.isPending ? "Importo..." : "Importa dai costi"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Nome categoria</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="es. Affitto, Utenze, Marketing..."
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="w-20">
              <Label>Colore</Label>
              <Input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-10 p-1 cursor-pointer"
              />
            </div>
            <Button onClick={handleAdd} disabled={!newName.trim() || addMutation.isPending}>
              <Plus className="h-4 w-4 mr-2" /> Aggiungi
            </Button>
          </div>

          {/* Table */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Caricamento...</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nessuna categoria configurata. Aggiungine una o importa quelle esistenti dai costi.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colore</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Utilizzi</TableHead>
                  <TableHead className="w-[120px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      {editingId === cat.id ? (
                        <Input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="h-8 w-12 p-1 cursor-pointer"
                        />
                      ) : (
                        <div
                          className="h-6 w-6 rounded-full border"
                          style={{ backgroundColor: cat.color || "#6366f1" }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === cat.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateMutation.mutate({ id: cat.id, name: editName, color: editColor });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium">{cat.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={usageCounts[cat.name] ? "secondary" : "outline"}>
                        {usageCounts[cat.name] || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === cat.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: cat.id, name: editName, color: editColor })}
                            disabled={!editName.trim() || updateMutation.isPending}
                          >
                            Salva
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Annulla
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(cat)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(cat.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina categoria</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteId && usageCounts[categories.find(c => c.id === deleteId)?.name || ""] ? (
                <>Attenzione: questa categoria è utilizzata da <strong>{usageCounts[categories.find(c => c.id === deleteId)?.name || ""]}</strong> costi. Eliminandola, i costi manterranno il valore attuale ma la categoria non sarà più selezionabile.</>
              ) : (
                "La categoria verrà rimossa dalla lista."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
