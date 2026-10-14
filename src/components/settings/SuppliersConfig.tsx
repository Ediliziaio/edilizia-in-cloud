import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { useIsMobile } from "@/hooks/use-mobile";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { FornitoreEditor } from "@/components/suppliers/FornitoreEditor";
import {
  normalizeSupplierName,
  supplierNameKey,
  normalizeVatNumber,
  payloadFornitore,
  contattiPerUnione,
  ricercaFornitore,
  type Supplier,
  type SupplierFormData,
} from "@/lib/suppliers/anagraficaFornitore";
import { useState, useMemo } from "react";
import { etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  AlertCircle,
  Merge,
  ArrowUpDown,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getVatRateLabel } from "@/lib/vatUtils";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { testoTecnico, userErrorMessage } from "@/lib/userErrorMessage";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";

interface SupplierUsageCounts {
  articleTemplates: number;
  companyCosts: number;
  orderItems: number;
  purchaseOrders: number;
  scadenze: number;
  primaNota: number;
  warehouseStock: number;
}

const emptyUsageCounts: SupplierUsageCounts = {
  articleTemplates: 0,
  companyCosts: 0,
  orderItems: 0,
  purchaseOrders: 0,
  scadenze: 0,
  primaNota: 0,
  warehouseStock: 0,
};

const supplierUsageLabels: Record<keyof SupplierUsageCounts, string> = {
  articleTemplates: "Articoli/listino",
  companyCosts: "Costi aziendali",
  orderItems: "Righe ordine",
  purchaseOrders: "Ordini di acquisto",
  scadenze: "Scadenze/pagamenti",
  primaNota: "Prima nota",
  warehouseStock: "Magazzino",
};

function getUsageTotal(usage: SupplierUsageCounts | undefined) {
  if (!usage) return 0;
  return Object.values(usage).reduce((sum, value) => sum + value, 0);
}

async function getSupplierUsageCounts(
  companyId: string,
  supplierId: string,
): Promise<SupplierUsageCounts> {
  const [
    articleTemplates,
    companyCosts,
    orderItems,
    purchaseOrders,
    scadenze,
    primaNota,
    warehouseStock,
  ] = await Promise.all([
    supabase
      .from("article_templates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("company_costs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("scadenze")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("prima_nota_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase
      .from("warehouse_stock")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
  ]);

  const errors = [
    articleTemplates,
    companyCosts,
    orderItems,
    purchaseOrders,
    scadenze,
    primaNota,
    warehouseStock,
  ]
    .map((result) => result.error)
    .filter(Boolean);
  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    articleTemplates: articleTemplates.count ?? 0,
    companyCosts: companyCosts.count ?? 0,
    orderItems: orderItems.count ?? 0,
    purchaseOrders: purchaseOrders.count ?? 0,
    scadenze: scadenze.count ?? 0,
    primaNota: primaNota.count ?? 0,
    warehouseStock: warehouseStock.count ?? 0,
  };
}

const getPaymentMethodLabel = (value: string | null) => {
  return etichettaPagamentoFornitore(value);
};

/** Un errore che la pagina ha già scritto in italiano: si mostra com'è. Tutto il resto passa da userErrorMessage. */
class ErroreFornitore extends Error {}

/** Il testo di un errore per chi usa la pagina: mai il messaggio del database così com'è. */
function descrizioneErrore(error: unknown, ripiego: string): string {
  if (error instanceof ErroreFornitore) return error.message;
  if (/duplicate|unique|already exists/i.test(testoTecnico(error)))
    return "Esiste già un fornitore con questa ragione sociale.";
  return userErrorMessage(error, ripiego);
}

function SupplierTable({
  suppliers,
  onEdit,
  onDelete,
  onApri,
  emptyMessage = "Nessun fornitore in questa categoria",
  productCounts = {},
  puoModificare = true,
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
  onApri?: (id: string) => void;
  emptyMessage?: string;
  productCounts?: Record<string, number>;
  /** Senza il permesso la tabella si legge soltanto: niente colonna «Azioni». */
  puoModificare?: boolean;
}) {
  const mobile = useIsMobile();
  if (suppliers.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/20">
        <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="font-medium text-foreground">Nessun fornitore trovato</p>
        <p className="text-sm mt-1">{emptyMessage}</p>
      </div>
    );
  }

  if (mobile)
    return (
      <div className="space-y-3">
        {suppliers.map((s) => (
          <article key={s.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {onApri ? (
                  <button
                    className="break-words text-left font-semibold text-primary hover:underline"
                    onClick={() => onApri(s.id)}
                  >
                    {s.name}
                  </button>
                ) : (
                  <p className="break-words font-semibold">{s.name}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[s.product_category, s.city].filter(Boolean).join(" · ") ||
                    "Categoria e città non indicate"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.is_active ? "Attivo" : "Inattivo"}
              </span>
            </div>
            <div className="rounded-md bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Referente</p>
              <p className="break-words font-medium">
                {s.contact_name || "Da aggiungere"}
                {s.contact_role ? ` · ${s.contact_role}` : ""}
              </p>
              {(s.contact_email || s.contact_phone) && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {[s.contact_email, s.contact_phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <p className="break-words text-xs text-muted-foreground">
              {[s.email, s.phone].filter(Boolean).join(" · ") ||
                "Recapiti aziendali non indicati"}
            </p>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>{getPaymentMethodLabel(s.payment_method)}</span>
              {puoModificare && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(s)}
                    aria-label={`Modifica ${s.name}`}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Modifica
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(s)}
                    aria-label={`Elimina ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* Da 768 a 1536 meno colonne: a 1024 la tabella chiedeva 984px su
              638. Pagamento e P.IVA tornano da 1280, IVA e prodotti da 1536.
              Sul telefono restano tutte (la tabella scorre come prima). */}
          <TableHead>Nome del fornitore</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="max-2xl:hidden">Pagamento</TableHead>
          <TableHead>Città</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="md:max-xl:hidden">P.IVA</TableHead>
          <TableHead className="md:max-2xl:hidden">Aliquota IVA</TableHead>
          <TableHead className="md:max-2xl:hidden">Prodotti</TableHead>
          {puoModificare && <TableHead className="w-[100px]">Azioni</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="min-w-[190px] font-medium">
              {onApri ? (
                <button
                  className="text-left text-primary hover:underline"
                  onClick={() => onApri(supplier.id)}
                >
                  {supplier.name}
                </button>
              ) : (
                supplier.name
              )}
              <p className="mt-1 text-xs font-normal text-muted-foreground">
                {supplier.contact_name
                  ? `${supplier.contact_name}${supplier.contact_role ? ` · ${supplier.contact_role}` : ""}`
                  : "Referente da aggiungere"}
              </p>
            </TableCell>
            <TableCell>
              {supplier.product_category ? (
                <span className="inline-flex rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                  {supplier.product_category}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="max-2xl:hidden">
              {getPaymentMethodLabel(supplier.payment_method)}
            </TableCell>
            <TableCell>{supplier.city || "—"}</TableCell>
            <TableCell>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs ${supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
              >
                {supplier.is_active ? "Attivo" : "Inattivo"}
              </span>
            </TableCell>
            <TableCell className="md:max-xl:hidden">
              {supplier.vat_number || "—"}
            </TableCell>
            <TableCell className="md:max-2xl:hidden">
              {getVatRateLabel(supplier.vat_rate ?? 22)}
            </TableCell>
            <TableCell className="md:max-2xl:hidden">
              {(productCounts[supplier.id] ?? 0) > 0 ? (
                <span
                  className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                  title="Prodotti del listino collegati a questo fornitore"
                >
                  {productCounts[supplier.id]} prod.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            {puoModificare && (
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(supplier)}
                    aria-label={`Modifica ${supplier.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(supplier)}
                    aria-label={`Elimina ${supplier.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Finestra «Unisci due fornitori» ────────────────────────────────────────

interface UnisciDialogProps {
  fornitori: Supplier[];
  /** Quelli che sembrano doppioni (stesso nome o stessa partita IVA): solo un suggerimento. */
  candidati: Supplier[];
  salvataggio: boolean;
  onChiudi: () => void;
  onUnisci: (doppioneId: string, principaleId: string) => void;
}

/** Si monta solo da aperta: ogni apertura riparte con le due scelte vuote. */
function UnisciFornitoriDialog({
  aperta,
  ...resto
}: UnisciDialogProps & { aperta: boolean }) {
  if (!aperta) return null;
  return <UnisciFornitoriDialogAperta {...resto} />;
}

function UnisciFornitoriDialogAperta({
  fornitori,
  candidati,
  salvataggio,
  onChiudi,
  onUnisci,
}: UnisciDialogProps) {
  const [doppioneId, setDoppioneId] = useState("");
  const [principaleId, setPrincipaleId] = useState("");
  // Chi ha già scelto qualcosa non lo perde con Esc o un clic fuori.
  const conferma = useSettingsDraftGuard(
    salvataggio || !!doppioneId || !!principaleId,
  );
  const chiudi = () => {
    if (!salvataggio && conferma()) onChiudi();
  };

  return (
    <Dialog
      open
      onOpenChange={(aperta) => {
        if (!aperta) chiudi();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unisci due fornitori</DialogTitle>
          <DialogDescription>
            Sposta ordini, costi, scadenze, prima nota, listino e magazzino dal
            doppione al fornitore principale, poi elimina il doppione.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {candidati.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Possibili doppioni:{" "}
              {candidati.map((supplier) => supplier.name).join(", ")}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="unisci-doppione">Doppione da eliminare</Label>
            <Select value={doppioneId} onValueChange={setDoppioneId}>
              <SelectTrigger id="unisci-doppione">
                <SelectValue placeholder="Scegli il doppione..." />
              </SelectTrigger>
              <SelectContent>
                {fornitori.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unisci-principale">Fornitore da tenere</Label>
            <Select value={principaleId} onValueChange={setPrincipaleId}>
              <SelectTrigger id="unisci-principale">
                <SelectValue placeholder="Scegli il fornitore da tenere..." />
              </SelectTrigger>
              <SelectContent>
                {fornitori
                  .filter((supplier) => supplier.id !== doppioneId)
                  .map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Non si può annullare</AlertTitle>
            <AlertDescription className="text-xs">
              Controlla bene quale tenere e quale eliminare prima di andare
              avanti.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={salvataggio}
            onClick={chiudi}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={
              !doppioneId ||
              !principaleId ||
              doppioneId === principaleId ||
              salvataggio
            }
            onClick={() => onUnisci(doppioneId, principaleId)}
          >
            {salvataggio && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Unisci i fornitori
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── La scheda «Anagrafica» ─────────────────────────────────────────────────

export function SuppliersConfig({
  puoModificare = true,
  onApriFornitore,
}: {
  puoModificare?: boolean;
  onApriFornitore?: (id: string) => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("italiani");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(
    null,
  );

  const {
    data: suppliers,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["suppliers-config", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return loadCatalogPages<Supplier>((from, to) =>
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId)
          .order("name")
          .order("id")
          .range(from, to),
      );
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Conteggio prodotti del listino collegati a ciascun fornitore (correlazione
  // article_families.supplier_id → suppliers.id). Mostrato in colonna "Prodotti".
  const { data: productCounts = {} } = useQuery({
    queryKey: ["supplier-product-counts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("article_families")
        .select("supplier_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("supplier_id", "is", null);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ supplier_id: string | null }>) {
        if (r.supplier_id) m[r.supplier_id] = (m[r.supplier_id] ?? 0) + 1;
      }
      return m;
    },
  });

  const existingCategories = useMemo(() => {
    if (!suppliers) return [];
    const cats = new Set(
      suppliers.map((s) => s.product_category).filter(Boolean) as string[],
    );
    return Array.from(cats).sort();
  }, [suppliers]);

  const existingProvinces = useMemo(() => {
    if (!suppliers) return [];
    const provinces = new Set(
      suppliers
        .map((s) => s.province?.toUpperCase())
        .filter(Boolean) as string[],
    );
    return Array.from(provinces).sort();
  }, [suppliers]);

  const duplicateCandidates = useMemo(() => {
    const list = suppliers ?? [];
    return list.filter((supplier) => {
      const nameKey = supplierNameKey(supplier.name);
      const vatKey = normalizeVatNumber(supplier.vat_number || "");
      return list.some(
        (other) =>
          other.id !== supplier.id &&
          (supplierNameKey(other.name) === nameKey ||
            (!!vatKey &&
              normalizeVatNumber(other.vat_number || "") === vatKey)),
      );
    });
  }, [suppliers]);

  const applyFilters = (list: Supplier[]) => {
    const q = searchQuery.toLowerCase();
    const filtered = list.filter((s) => {
      const matchesSearch = ricercaFornitore(s, q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && s.is_active) ||
        (statusFilter === "inactive" && !s.is_active);
      const matchesCategory =
        categoryFilter === "all" || s.product_category === categoryFilter;
      const matchesProvince =
        provinceFilter === "all" ||
        s.province?.toUpperCase() === provinceFilter;
      return (
        matchesSearch && matchesStatus && matchesCategory && matchesProvince
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "category")
        return (
          (a.product_category || "").localeCompare(b.product_category || "") ||
          a.name.localeCompare(b.name)
        );
      if (sortBy === "city")
        return (
          (a.city || "").localeCompare(b.city || "") ||
          a.name.localeCompare(b.name)
        );
      if (sortBy === "status")
        return (
          Number(b.is_active) - Number(a.is_active) ||
          a.name.localeCompare(b.name)
        );
      return a.name.localeCompare(b.name);
    });
  };

  const italiani = applyFilters(suppliers?.filter((s) => !s.is_foreign) || []);
  const esteri = applyFilters(suppliers?.filter((s) => s.is_foreign) || []);

  const {
    data: deletingUsage = emptyUsageCounts,
    isFetching: deletingUsageLoading,
    isError: deletingUsageIsError,
  } = useQuery({
    queryKey: ["supplier-delete-usage", companyId, deletingSupplier?.id],
    queryFn: async () => {
      if (!companyId || !deletingSupplier?.id) return emptyUsageCounts;
      return getSupplierUsageCounts(companyId, deletingSupplier.id);
    },
    enabled: !!companyId && !!deletingSupplier?.id && deleteDialogOpen,
  });

  const deletingUsageTotal = getUsageTotal(deletingUsage);

  const invalidateSuppliers = () => invalidaFornitori(queryClient);

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      if (!puoModificare)
        throw new ErroreFornitore(
          "Per creare un fornitore serve il permesso «Fornitori» in modifica.",
        );
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName)
        throw new ErroreFornitore("La ragione sociale è obbligatoria.");
      const { error } = await supabase
        .from("suppliers")
        .insert({
          ...payloadFornitore(data),
          company_id: companyId,
        })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateSuppliers();
      toast.success("Fornitore creato", {
        description: "Il fornitore è stato aggiunto con successo.",
      });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Errore", {
        description: descrizioneErrore(
          error,
          "Impossibile creare il fornitore.",
        ),
      });
      logger.error("Errore creazione fornitore", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SupplierFormData & { id: string }) => {
      if (!puoModificare)
        throw new ErroreFornitore(
          "Per modificare un fornitore serve il permesso «Fornitori» in modifica.",
        );
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName)
        throw new ErroreFornitore("La ragione sociale è obbligatoria.");
      const { error } = await supabase
        .from("suppliers")
        .update({
          ...payloadFornitore(data),
        })
        .eq("id", id)
        .eq("company_id", companyId!)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateSuppliers();
      toast.success("Fornitore aggiornato", {
        description: "Le modifiche sono state salvate.",
      });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Errore", {
        description: descrizioneErrore(
          error,
          "Impossibile aggiornare il fornitore.",
        ),
      });
      logger.error("Errore aggiornamento fornitore", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!puoModificare)
        throw new ErroreFornitore(
          "Per eliminare un fornitore serve il permesso «Fornitori» in modifica.",
        );
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const usage = await getSupplierUsageCounts(companyId, id);
      if (getUsageTotal(usage) > 0) {
        throw new ErroreFornitore(
          "Fornitore già collegato a dati operativi: eliminazione bloccata per proteggere ordini, costi, pagamenti, magazzino e report.",
        );
      }
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore eliminato", {
        description: "Il fornitore è stato rimosso.",
      });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
    },
    onError: (error: Error) => {
      if (
        (error as { code?: string }).code === "23503" ||
        testoTecnico(error).includes("foreign key")
      ) {
        toast.error("Impossibile eliminare", {
          description:
            "Il fornitore è associato a dati operativi e non può essere eliminato.",
        });
      } else {
        toast.error("Errore", {
          description: descrizioneErrore(
            error,
            "Impossibile eliminare il fornitore.",
          ),
        });
      }
      logger.error("Errore eliminazione fornitore", error);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => {
      if (!puoModificare)
        throw new ErroreFornitore(
          "Per unire due fornitori serve il permesso «Fornitori» in modifica.",
        );
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      if (!sourceId || !targetId || sourceId === targetId) {
        throw new ErroreFornitore("Scegli due fornitori diversi.");
      }
      const source = suppliers?.find((supplier) => supplier.id === sourceId);
      const target = suppliers?.find((supplier) => supplier.id === targetId);
      if (!source || !target)
        throw new ErroreFornitore(
          "Non trovo uno dei due fornitori: ricarica la pagina e riprova.",
        );

      let contatti: ReturnType<typeof contattiPerUnione>;
      try {
        contatti = contattiPerUnione(source, target);
      } catch (error) {
        throw new ErroreFornitore((error as Error).message);
      }
      if (Object.keys(contatti).length) {
        const { error } = await supabase
          .from("suppliers")
          .update(contatti)
          .eq("id", targetId)
          .eq("company_id", companyId)
          .select("id")
          .single();
        if (error) throw error;
      }

      const operations = [
        supabase
          .from("article_templates")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
        supabase
          .from("company_costs")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
        supabase
          .from("order_items")
          .update({ supplier_id: targetId })
          .eq("supplier_id", sourceId),
        supabase
          .from("purchase_orders")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
        supabase
          .from("scadenze")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
        supabase
          .from("prima_nota_entries")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
        supabase
          .from("warehouse_stock")
          .update({ supplier_id: targetId })
          .eq("company_id", companyId)
          .eq("supplier_id", sourceId),
      ];

      const results = await Promise.all(operations);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      const { error: deleteError } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", sourceId)
        .eq("company_id", companyId);
      if (deleteError) throw deleteError;

      const user = (await supabase.auth.getUser()).data.user;
      if (user?.id) {
        await supabase.from("company_activity_log").insert({
          company_id: companyId,
          user_id: user.id,
          action: "merge",
          target_type: "supplier",
          target_id: targetId,
          details: {
            source_id: sourceId,
            source_name: source.name,
            target_name: target.name,
          },
        });
      }
    },
    onSuccess: () => {
      invalidateSuppliers();
      setMergeDialogOpen(false);
      toast.success("Fornitori uniti", {
        description:
          "Storico, costi, ordini e pagamenti sono passati al fornitore da tenere.",
      });
    },
    onError: (error: Error) => {
      toast.error("Non sono riuscito a unire i fornitori.", {
        description: descrizioneErrore(error, "Riprova tra poco."),
      });
      logger.error("Errore unione fornitori", error);
    },
  });

  const handleOpenCreate = () => {
    if (!puoModificare) return;
    setEditingSupplier(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    if (!puoModificare) return;
    setEditingSupplier(supplier);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
  };

  const handleOpenDelete = (supplier: Supplier) => {
    if (!puoModificare) return;
    setDeletingSupplier(supplier);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingSupplier) deleteMutation.mutate(deletingSupplier.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      {puoModificare && (
        <CardHeader>
          {/* v8.6.74 — flex-wrap su mobile: prima i 2 button (Unisci doppioni +
              Nuovo fornitore) tagliavano fuori dal viewport iPhone 375px.
              Il titolo «Fornitori» lo mette già la testata delle Impostazioni:
              qui restano solo i bottoni, a destra. */}
          <div className="flex flex-wrap items-start justify-between gap-2 md:justify-end">
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                disabled={isLoading || isError || isSaving}
                onClick={() => setMergeDialogOpen(true)}
              >
                <Merge className="h-4 w-4 mr-2" />
                Unisci doppioni
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none"
                disabled={isLoading || isError || isSaving}
                onClick={handleOpenCreate}
              >
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Nuovo fornitore</span>
                <span className="sm:hidden">Nuovo fornitore</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(!puoModificare && "pt-6")}>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Impossibile caricare i fornitori</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs">
                {userErrorMessage(
                  error,
                  "Errore durante il caricamento dell'anagrafica fornitori.",
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Filtri compatti: due colonne sul telefono, una sola riga sui desktop ampi. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(180px,1fr)_140px_160px_120px_140px]">
              <div className="relative col-span-2 md:col-span-4 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca azienda, referente, email o P.IVA…"
                  aria-label="Cerca un fornitore"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filtra per stato">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Solo attivi</SelectItem>
                  <SelectItem value="inactive">Solo inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger aria-label="Filtra per categoria">
                  <SelectValue placeholder="Categoria">
                    {categoryFilter === "all" ? "Categoria" : categoryFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {existingCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={provinceFilter} onValueChange={setProvinceFilter}>
                <SelectTrigger aria-label="Filtra per provincia">
                  <SelectValue placeholder="Provincia">
                    {provinceFilter === "all" ? "Provincia" : provinceFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le province</SelectItem>
                  {existingProvinces.map((province) => (
                    <SelectItem key={province} value={province}>
                      {province}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label="Ordina i fornitori">
                  <ArrowUpDown className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Ordina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                  <SelectItem value="city">Città</SelectItem>
                  <SelectItem value="status">Stato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {duplicateCandidates.length > 0 && (
              <Alert>
                <Merge className="h-4 w-4" />
                <AlertTitle>Possibili doppioni</AlertTitle>
                <AlertDescription className="text-xs">
                  {puoModificare
                    ? `${duplicateCandidates.length} fornitori hanno nome o partita IVA simili. Usa «Unisci doppioni» per portare lo storico sul fornitore giusto.`
                    : `${duplicateCandidates.length} fornitori hanno nome o partita IVA simili.`}
                </AlertDescription>
              </Alert>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="italiani">
                  Italiani ({italiani.length})
                </TabsTrigger>
                <TabsTrigger value="esteri">
                  Esteri ({esteri.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="italiani">
                <SupplierTable
                  onApri={onApriFornitore}
                  suppliers={italiani}
                  onEdit={handleOpenEdit}
                  onDelete={handleOpenDelete}
                  productCounts={productCounts}
                  puoModificare={puoModificare}
                  emptyMessage={
                    puoModificare
                      ? "Modifica ricerca o filtri, oppure crea un nuovo fornitore italiano."
                      : "Modifica ricerca o filtri."
                  }
                />
              </TabsContent>
              <TabsContent value="esteri">
                <SupplierTable
                  onApri={onApriFornitore}
                  suppliers={esteri}
                  onEdit={handleOpenEdit}
                  onDelete={handleOpenDelete}
                  productCounts={productCounts}
                  puoModificare={puoModificare}
                  emptyMessage={
                    puoModificare
                      ? "Modifica ricerca o filtri, oppure crea un nuovo fornitore estero."
                      : "Modifica ricerca o filtri."
                  }
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>

      <FornitoreEditor
        aperta={puoModificare && dialogOpen}
        fornitore={editingSupplier}
        esteroIniziale={activeTab === "esteri"}
        fornitori={suppliers ?? []}
        categorieEsistenti={existingCategories}
        salvataggio={isSaving}
        onChiudi={handleCloseDialog}
        onSalva={(dati) => {
          if (editingSupplier)
            updateMutation.mutate({ id: editingSupplier.id, ...dati });
          else createMutation.mutate(dati);
        }}
      />

      <UnisciFornitoriDialog
        aperta={puoModificare && mergeDialogOpen}
        fornitori={suppliers ?? []}
        candidati={duplicateCandidates}
        salvataggio={mergeMutation.isPending}
        onChiudi={() => setMergeDialogOpen(false)}
        onUnisci={(sourceId, targetId) =>
          mergeMutation.mutate({ sourceId, targetId })
        }
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={puoModificare && deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fornitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il fornitore "{deletingSupplier?.name}".
              {deletingUsageLoading ? (
                <>
                  {" "}
                  Verifico i collegamenti operativi prima di consentire
                  l'eliminazione.
                </>
              ) : deletingUsageTotal > 0 ? (
                <>
                  {" "}
                  Il fornitore è collegato a dati operativi e non può essere
                  eliminato senza proteggere lo storico. Usa lo stato inattivo
                  se non deve essere più usato nei nuovi acquisti.
                </>
              ) : deletingUsageIsError ? (
                <>
                  {" "}
                  Non è stato possibile verificare tutti i collegamenti:
                  l'eliminazione resta bloccata per sicurezza.
                </>
              ) : (
                <> Questa azione non può essere annullata.</>
              )}
            </AlertDialogDescription>
            {(deletingUsageTotal > 0 || deletingUsageIsError) && (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                {(
                  Object.entries(deletingUsage) as Array<
                    [keyof SupplierUsageCounts, number]
                  >
                ).map(([key, value]) =>
                  value > 0 ? (
                    <p key={key}>
                      {supplierUsageLabels[key]} collegati: {value}
                    </p>
                  ) : null,
                )}
                {deletingUsageIsError && (
                  <p>Verifica collegamenti non riuscita.</p>
                )}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={
                deletingUsageLoading ||
                deletingUsageTotal > 0 ||
                deletingUsageIsError ||
                deleteMutation.isPending
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {deletingUsageTotal > 0 || deletingUsageIsError
                ? "Bloccata"
                : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
