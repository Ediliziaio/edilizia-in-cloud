import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES } from "@/lib/vatUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = [
  { value: "infissi", label: "Infissi" },
  { value: "posa", label: "Posa in Opera" },
  { value: "accessori", label: "Accessori" },
  { value: "pratiche", label: "Pratiche" },
  { value: "trasporto", label: "Trasporto" },
  { value: "altro", label: "Altro" },
];

interface ArticleTemplate {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_price: number;
  standard_cost: number;
  unit_of_measure: string;
  vat_rate: number;
  supplier_id: string | null;
  description: string | null;
}

export function ArticleCatalog() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [standardCost, setStandardCost] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("pz");
  const [vatRate, setVatRate] = useState(22);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [description, setDescription] = useState("");

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["article-templates-full", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as ArticleTemplate[];
    },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Company non trovata");
      const payload = {
        company_id: companyId,
        name: name.trim(),
        sku: sku.trim() || null,
        category: category || null,
        unit_price: parseFloat(unitPrice) || 0,
        standard_cost: parseFloat(standardCost) || 0,
        unit_of_measure: unitOfMeasure || "pz",
        vat_rate: vatRate,
        supplier_id: supplierId || null,
        description: description.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("article_templates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("article_templates")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
      queryClient.invalidateQueries({ queryKey: ["article-templates"] });
      toast({ title: editingId ? "Articolo aggiornato" : "Articolo creato" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare l'articolo.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("article_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
      queryClient.invalidateQueries({ queryKey: ["article-templates"] });
      toast({ title: "Articolo eliminato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare l'articolo.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setSku("");
    setCategory("");
    setUnitPrice("");
    setStandardCost("");
    setUnitOfMeasure("pz");
    setVatRate(22);
    setSupplierId(undefined);
    setDescription("");
    setEditingId(null);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (article: ArticleTemplate) => {
    setEditingId(article.id);
    setName(article.name);
    setSku(article.sku || "");
    setCategory(article.category || "");
    setUnitPrice(article.unit_price?.toString() || "");
    setStandardCost(article.standard_cost?.toString() || "");
    setUnitOfMeasure(article.unit_of_measure || "pz");
    setVatRate(article.vat_rate ?? 22);
    setSupplierId(article.supplier_id || undefined);
    setDescription(article.description || "");
    setDialogOpen(true);
  };

  const filtered = articles.filter((a) => {
    const matchesSearch =
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.sku && a.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || a.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Catalogo Articoli
            </CardTitle>
            <CardDescription>
              Gestisci il catalogo prodotti e servizi con prezzi e costi standard
            </CardDescription>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Articolo
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome o SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-6">Caricamento...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            {articles.length === 0
              ? "Nessun articolo nel catalogo. Clicca 'Nuovo Articolo' per iniziare."
              : "Nessun articolo corrisponde ai filtri."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((article) => (
              <div
                key={article.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{article.name}</span>
                    {article.sku && (
                      <Badge variant="outline" className="text-xs">
                        {article.sku}
                      </Badge>
                    )}
                    {article.category && (
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORIES.find((c) => c.value === article.category)?.label || article.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span>Vendita: {formatCurrency(article.unit_price)}</span>
                    <span>Costo: {formatCurrency(article.standard_cost)}</span>
                    <span>IVA: {article.vat_rate}%</span>
                    <span>U.M.: {article.unit_of_measure}</span>
                    {article.unit_price > 0 && article.standard_cost > 0 && (
                      <span
                        className={`font-medium ${
                          article.unit_price - article.standard_cost > 0
                            ? "text-green-600"
                            : "text-destructive"
                        }`}
                      >
                        Margine: {(((article.unit_price - article.standard_cost) / article.unit_price) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(article)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare "{article.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          L'articolo verrà rimosso dal catalogo. Gli ordini esistenti non verranno modificati.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(article.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifica Articolo" : "Nuovo Articolo"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Modifica i dati dell'articolo nel catalogo" : "Aggiungi un nuovo articolo al catalogo"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Finestra PVC 120x140" />
              </div>
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label>SKU / Codice</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="es. FIN-PVC-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unità di Misura</Label>
                <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pz">pz (pezzo)</SelectItem>
                    <SelectItem value="ml">ml (metro lineare)</SelectItem>
                    <SelectItem value="mq">mq (metro quadro)</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="h">h (ore)</SelectItem>
                    <SelectItem value="forfait">forfait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prezzo Vendita</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="pl-8"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Costo Standard</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={standardCost}
                    onChange={(e) => setStandardCost(e.target.value)}
                    className="pl-8"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Aliquota IVA</Label>
              <Select value={vatRate.toString()} onValueChange={(v) => setVatRate(parseInt(v))}>
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
            </div>
            <div className="space-y-2">
              <Label>Fornitore Predefinito</Label>
              <SupplierSelect
                value={supplierId}
                onValueChange={(id) => setSupplierId(id)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrizione opzionale..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Annulla
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? "Salvataggio..." : editingId ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
