import { useState, useMemo } from "react";
import { PAYMENT_METHODS } from "@/components/orders/OrderItemsList";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, Loader2, Search, Check, ChevronsUpDown } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
  vat_rate: number | null;
  is_foreign: boolean;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  product_category: string | null;
  notes: string | null;
  payment_method: string | null;
  created_at: string;
  company_id: string;
}

interface SupplierFormData {
  name: string;
  vat_rate: number;
  is_foreign: boolean;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  vat_number: string;
  fiscal_code: string;
  email: string;
  phone: string;
  website: string;
  product_category: string;
  notes: string;
  payment_method: string;
}

const emptyForm: SupplierFormData = {
  name: "",
  vat_rate: 22,
  is_foreign: false,
  address: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Italia",
  vat_number: "",
  fiscal_code: "",
  email: "",
  phone: "",
  website: "",
  product_category: "",
  notes: "",
  payment_method: "",
};

function supplierToForm(s: Supplier): SupplierFormData {
  return {
    name: s.name,
    vat_rate: s.vat_rate || 22,
    is_foreign: s.is_foreign,
    address: s.address || "",
    city: s.city || "",
    province: s.province || "",
    postal_code: s.postal_code || "",
    country: s.country || "Italia",
    vat_number: s.vat_number || "",
    fiscal_code: s.fiscal_code || "",
    email: s.email || "",
    phone: s.phone || "",
    website: s.website || "",
    product_category: s.product_category || "",
    notes: s.notes || "",
    payment_method: s.payment_method || "",
  };
}

const getPaymentMethodLabel = (value: string | null) => {
  if (!value) return "—";
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || value;
};

function SupplierTable({
  suppliers,
  onEdit,
  onDelete,
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
}) {
  if (suppliers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nessun fornitore in questa categoria</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome Fornitore</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Mod. Pagamento</TableHead>
          <TableHead>Città</TableHead>
          <TableHead>P.IVA</TableHead>
          <TableHead>Aliquota IVA</TableHead>
          <TableHead className="w-[100px]">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="font-medium">{supplier.name}</TableCell>
            <TableCell>{supplier.product_category || "—"}</TableCell>
            <TableCell>{getPaymentMethodLabel(supplier.payment_method)}</TableCell>
            <TableCell>{supplier.city || "—"}</TableCell>
            <TableCell>{supplier.vat_number || "—"}</TableCell>
            <TableCell>{getVatRateLabel(supplier.vat_rate || 22)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(supplier)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(supplier)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SuppliersConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("italiani");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>({ ...emptyForm });
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

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

  const existingCategories = useMemo(() => {
    if (!suppliers) return [];
    const cats = new Set(suppliers.map(s => s.product_category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [suppliers]);

  const filterBySearch = (list: Supplier[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.product_category && s.product_category.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.vat_number && s.vat_number.toLowerCase().includes(q))
    );
  };

  const italiani = filterBySearch(suppliers?.filter((s) => !s.is_foreign) || []);
  const esteri = filterBySearch(suppliers?.filter((s) => s.is_foreign) || []);

  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const { error } = await supabase.from("suppliers").insert({
        name: data.name,
        vat_rate: data.vat_rate,
        is_foreign: data.is_foreign,
        address: data.address || null,
        city: data.city || null,
        province: data.province || null,
        postal_code: data.postal_code || null,
        country: data.country || null,
        vat_number: data.vat_number || null,
        fiscal_code: data.fiscal_code || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        product_category: data.product_category || null,
        notes: data.notes || null,
        payment_method: data.payment_method || null,
        company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast({ title: "Fornitore creato", description: "Il fornitore è stato aggiunto con successo." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Errore", description: "Impossibile creare il fornitore.", variant: "destructive" });
      console.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SupplierFormData & { id: string }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: data.name,
          vat_rate: data.vat_rate,
          is_foreign: data.is_foreign,
          address: data.address || null,
          city: data.city || null,
          province: data.province || null,
          postal_code: data.postal_code || null,
          country: data.country || null,
          vat_number: data.vat_number || null,
          fiscal_code: data.fiscal_code || null,
          email: data.email || null,
          phone: data.phone || null,
          website: data.website || null,
          product_category: data.product_category || null,
          notes: data.notes || null,
          payment_method: data.payment_method || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast({ title: "Fornitore aggiornato", description: "Le modifiche sono state salvate." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Errore", description: "Impossibile aggiornare il fornitore.", variant: "destructive" });
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast({ title: "Fornitore eliminato", description: "Il fornitore è stato rimosso." });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
    },
    onError: (error: Error) => {
      if (error.message.includes("foreign key") || error.message.includes("violates")) {
        toast({
          title: "Impossibile eliminare",
          description: "Il fornitore è associato a degli articoli e non può essere eliminato.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Errore", description: "Impossibile eliminare il fornitore.", variant: "destructive" });
      }
      console.error(error);
    },
  });

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({ ...emptyForm, is_foreign: activeTab === "esteri" });
    setDialogOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData(supplierToForm(supplier));
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
    setFormData({ ...emptyForm });
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
    if (deletingSupplier) deleteMutation.mutate(deletingSupplier.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const updateField = (field: keyof SupplierFormData, value: string | number | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

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
              Gestisci i tuoi fornitori e le relative informazioni
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
        ) : (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, categoria, città o P.IVA..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="italiani">Italiani ({italiani.length})</TabsTrigger>
              <TabsTrigger value="esteri">Esteri ({esteri.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="italiani">
              <SupplierTable suppliers={italiani} onEdit={handleOpenEdit} onDelete={handleOpenDelete} />
            </TabsContent>
            <TabsContent value="esteri">
              <SupplierTable suppliers={esteri} onEdit={handleOpenEdit} onDelete={handleOpenDelete} />
            </TabsContent>
          </Tabs>
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Modifica Fornitore" : "Nuovo Fornitore"}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier ? "Modifica i dati del fornitore" : "Inserisci i dati del nuovo fornitore"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dati Generali */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Dati Generali</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Fornitore *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Es. ABC Serramenti Srl" />
                </div>
                <div className="space-y-2">
                  <Label>Categoria Prodotti</Label>
                  <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryPopoverOpen}
                        className="w-full justify-between font-normal"
                      >
                        {formData.product_category || "Seleziona categoria..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Cerca o crea categoria..."
                          value={categorySearch}
                          onValueChange={setCategorySearch}
                        />
                        <CommandList>
                          <CommandEmpty className="py-2 px-4 text-sm text-muted-foreground">
                            Nessuna categoria trovata
                          </CommandEmpty>
                          <CommandGroup>
                            {existingCategories
                              .filter(cat => !categorySearch || cat.toLowerCase().includes(categorySearch.toLowerCase()))
                              .map((cat) => (
                                <CommandItem
                                  key={cat}
                                  value={cat}
                                  onSelect={() => {
                                    updateField("product_category", cat);
                                    setCategoryPopoverOpen(false);
                                    setCategorySearch("");
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", formData.product_category === cat ? "opacity-100" : "opacity-0")} />
                                  {cat}
                                </CommandItem>
                              ))}
                            {categorySearch.trim() && !existingCategories.some(c => c.toLowerCase() === categorySearch.toLowerCase()) && (
                              <CommandItem
                                value={`create-${categorySearch}`}
                                onSelect={() => {
                                  updateField("product_category", categorySearch.trim());
                                  setCategoryPopoverOpen(false);
                                  setCategorySearch("");
                                }}
                                className="text-primary"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Crea "{categorySearch}"
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>Modalità di Pagamento</Label>
                  <Select value={formData.payment_method || "none"} onValueChange={(v) => updateField("payment_method", v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona modalità..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                <Label>Tipo Fornitore</Label>
                <Select value={formData.is_foreign ? "estero" : "italiano"} onValueChange={(v) => updateField("is_foreign", v === "estero")}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="italiano">Italiano</SelectItem>
                    <SelectItem value="estero">Estero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Dati Fiscali */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Dati Fiscali</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vat_number">P.IVA</Label>
                  <Input id="vat_number" value={formData.vat_number} onChange={(e) => updateField("vat_number", e.target.value)} placeholder="IT01234567890" />
              </div>
              </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscal_code">Codice Fiscale</Label>
                  <Input id="fiscal_code" value={formData.fiscal_code} onChange={(e) => updateField("fiscal_code", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vat_rate">Aliquota IVA</Label>
                  <Select value={formData.vat_rate.toString()} onValueChange={(v) => updateField("vat_rate", parseInt(v))}>
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
              </div>
            </div>

            <Separator />

            {/* Contatti */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Contatti</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="info@fornitore.it" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+39 0123 456789" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Sito Web</Label>
                  <Input id="website" value={formData.website} onChange={(e) => updateField("website", e.target.value)} placeholder="www.fornitore.it" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Indirizzo */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Indirizzo</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="address">Via / Indirizzo</Label>
                  <Input id="address" value={formData.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Via Roma 1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Città</Label>
                  <Input id="city" value={formData.city} onChange={(e) => updateField("city", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province">Provincia</Label>
                  <Input id="province" value={formData.province} onChange={(e) => updateField("province", e.target.value)} placeholder="MI" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">CAP</Label>
                  <Input id="postal_code" value={formData.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} placeholder="20100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Paese</Label>
                  <Input id="country" value={formData.country} onChange={(e) => updateField("country", e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Note aggiuntive sul fornitore..." rows={3} />
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
