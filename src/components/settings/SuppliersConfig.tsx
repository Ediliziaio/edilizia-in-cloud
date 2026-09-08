import { useState, useMemo } from "react";
import { PAYMENT_METHODS } from "@/components/orders/OrderItemsList";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, Loader2, Search, Check, ChevronsUpDown, QrCode, AlertCircle, Merge, ArrowUpDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { VAT_RATES, getVatRateLabel } from "@/lib/vatUtils";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { testoTecnico } from "@/lib/userErrorMessage";

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
  is_active: boolean;
  created_at: string;
  company_id: string;
}

type QrFormat = "" | "ean13" | "gtin14" | "gs1_128" | "gs1_qr" | "custom";

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
  is_active: boolean;
  // ── QR system (MP1 P0) ──────────────────────────────
  barcode_prefix: string;
  uses_gs1: boolean;
  default_qr_format: QrFormat;
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
  is_active: true,
  barcode_prefix: "",
  uses_gs1: false,
  default_qr_format: "",
};

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

function normalizeSupplierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function supplierNameKey(name: string) {
  return normalizeSupplierName(name).toLowerCase();
}

function normalizeVatNumber(value: string) {
  return value.trim().replace(/[\s.-]/g, "").toUpperCase();
}

function normalizeOptional(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  if (!value.trim()) return true;
  return /^[+()0-9\s.-]{6,25}$/.test(value.trim());
}

function isValidItalianVat(value: string, isForeign: boolean) {
  const normalized = normalizeVatNumber(value);
  if (!normalized || isForeign) return true;
  return /^(IT)?\d{11}$/.test(normalized);
}

function getUsageTotal(usage: SupplierUsageCounts | undefined) {
  if (!usage) return 0;
  return Object.values(usage).reduce((sum, value) => sum + value, 0);
}

async function getSupplierUsageCounts(companyId: string, supplierId: string): Promise<SupplierUsageCounts> {
  const [
    articleTemplates,
    companyCosts,
    orderItems,
    purchaseOrders,
    scadenze,
    primaNota,
    warehouseStock,
  ] = await Promise.all([
    supabase.from("article_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("company_costs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("scadenze").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("prima_nota_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("warehouse_stock").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
  ]);

  const errors = [articleTemplates, companyCosts, orderItems, purchaseOrders, scadenze, primaNota, warehouseStock]
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

function supplierToForm(s: Supplier): SupplierFormData {
  // Cast difensivo: i campi QR sono opzionali nel type Supplier
  // (esistono in DB dopo migration MP1, ma il type può non essere stato rigenerato).
  const qr = s as Partial<{
    barcode_prefix: string | null;
    uses_gs1: boolean | null;
    default_qr_format: QrFormat | null;
  }>;
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
    is_active: s.is_active ?? true,
    barcode_prefix: qr.barcode_prefix ?? "",
    uses_gs1: !!qr.uses_gs1,
    default_qr_format: (qr.default_qr_format ?? "") as QrFormat,
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
  emptyMessage = "Nessun fornitore in questa categoria",
  productCounts = {},
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
  emptyMessage?: string;
  productCounts?: Record<string, number>;
}) {
  if (suppliers.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/20">
        <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="font-medium text-foreground">Nessun fornitore trovato</p>
        <p className="text-sm mt-1">{emptyMessage}</p>
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
          <TableHead>Stato</TableHead>
          <TableHead>P.IVA</TableHead>
          <TableHead>Aliquota IVA</TableHead>
          <TableHead>Prodotti</TableHead>
          <TableHead className="w-[100px]">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="font-medium">{supplier.name}</TableCell>
            <TableCell>
              {supplier.product_category ? (
                <span className="inline-flex rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                  {supplier.product_category}
                </span>
              ) : "—"}
            </TableCell>
            <TableCell>{getPaymentMethodLabel(supplier.payment_method)}</TableCell>
            <TableCell>{supplier.city || "—"}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {supplier.is_active ? "Attivo" : "Inattivo"}
              </span>
            </TableCell>
            <TableCell>{supplier.vat_number || "—"}</TableCell>
            <TableCell>{getVatRateLabel(supplier.vat_rate || 22)}</TableCell>
            <TableCell>
              {(productCounts[supplier.id] ?? 0) > 0 ? (
                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title="Prodotti del listino collegati a questo fornitore">
                  {productCounts[supplier.id]} prod.
                </span>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(supplier)} aria-label={`Modifica ${supplier.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(supplier)} aria-label={`Elimina ${supplier.name}`}>
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
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [formData, setFormData] = useState<SupplierFormData>({ ...emptyForm });
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const { data: suppliers, isLoading, isError, error, refetch } = useQuery({
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
        .from("article_families").select("supplier_id")
        .eq("company_id", companyId).is("deleted_at", null).not("supplier_id", "is", null);
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
    const cats = new Set(suppliers.map(s => s.product_category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [suppliers]);

  const existingProvinces = useMemo(() => {
    if (!suppliers) return [];
    const provinces = new Set(suppliers.map((s) => s.province?.toUpperCase()).filter(Boolean) as string[]);
    return Array.from(provinces).sort();
  }, [suppliers]);

  const duplicateCandidates = useMemo(() => {
    const list = suppliers ?? [];
    return list.filter((supplier) => {
      const nameKey = supplierNameKey(supplier.name);
      const vatKey = normalizeVatNumber(supplier.vat_number || "");
      return list.some((other) => (
        other.id !== supplier.id &&
        (supplierNameKey(other.name) === nameKey ||
          (!!vatKey && normalizeVatNumber(other.vat_number || "") === vatKey))
      ));
    });
  }, [suppliers]);

  const applyFilters = (list: Supplier[]) => {
    const q = searchQuery.toLowerCase();
    const filtered = list.filter((s) => {
      const matchesSearch = !q.trim() ||
        s.name.toLowerCase().includes(q) ||
        (s.product_category && s.product_category.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.province && s.province.toLowerCase().includes(q)) ||
        (s.vat_number && s.vat_number.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && s.is_active) ||
        (statusFilter === "inactive" && !s.is_active);
      const matchesCategory = categoryFilter === "all" || s.product_category === categoryFilter;
      const matchesProvince = provinceFilter === "all" || s.province?.toUpperCase() === provinceFilter;
      return matchesSearch && matchesStatus && matchesCategory && matchesProvince;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "category") return (a.product_category || "").localeCompare(b.product_category || "") || a.name.localeCompare(b.name);
      if (sortBy === "city") return (a.city || "").localeCompare(b.city || "") || a.name.localeCompare(b.name);
      if (sortBy === "status") return Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  };

  const italiani = applyFilters(suppliers?.filter((s) => !s.is_foreign) || []);
  const esteri = applyFilters(suppliers?.filter((s) => s.is_foreign) || []);

  const { data: deletingUsage = emptyUsageCounts, isFetching: deletingUsageLoading, isError: deletingUsageIsError } = useQuery({
    queryKey: ["supplier-delete-usage", companyId, deletingSupplier?.id],
    queryFn: async () => {
      if (!companyId || !deletingSupplier?.id) return emptyUsageCounts;
      return getSupplierUsageCounts(companyId, deletingSupplier.id);
    },
    enabled: !!companyId && !!deletingSupplier?.id && deleteDialogOpen,
  });

  const deletingUsageTotal = getUsageTotal(deletingUsage);

  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers-export"] });
    queryClient.invalidateQueries({ queryKey: ["operational-suppliers"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName) throw new Error("La ragione sociale è obbligatoria.");
      const { error } = await supabase.from("suppliers").insert({
        name: safeName,
        vat_rate: data.vat_rate,
        is_foreign: data.is_foreign,
        address: normalizeOptional(data.address),
        city: normalizeOptional(data.city),
        province: normalizeOptional(data.province)?.toUpperCase() ?? null,
        postal_code: normalizeOptional(data.postal_code),
        country: normalizeOptional(data.country),
        vat_number: normalizeOptional(normalizeVatNumber(data.vat_number)),
        fiscal_code: normalizeOptional(data.fiscal_code.toUpperCase()),
        email: normalizeOptional(data.email.toLowerCase()),
        phone: normalizeOptional(data.phone),
        website: normalizeOptional(data.website),
        product_category: normalizeOptional(data.product_category),
        notes: normalizeOptional(data.notes),
        payment_method: normalizeOptional(data.payment_method),
        is_active: data.is_active,
        company_id: companyId,
        // ── QR system (MP1 P0) ──────────────────────────────
        barcode_prefix: data.barcode_prefix.trim() || null,
        uses_gs1: data.uses_gs1,
        default_qr_format: data.default_qr_format || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore creato", { description: "Il fornitore è stato aggiunto con successo." });
      handleCloseDialog();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Impossibile creare il fornitore.";
      toast.error("Errore", { description: message.includes("duplicate") || message.includes("unique") ? "Esiste già un fornitore con questa ragione sociale." : message });
      logger.error("Errore creazione fornitore", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SupplierFormData & { id: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName) throw new Error("La ragione sociale è obbligatoria.");
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: safeName,
          vat_rate: data.vat_rate,
          is_foreign: data.is_foreign,
          address: normalizeOptional(data.address),
          city: normalizeOptional(data.city),
          province: normalizeOptional(data.province)?.toUpperCase() ?? null,
          postal_code: normalizeOptional(data.postal_code),
          country: normalizeOptional(data.country),
          vat_number: normalizeOptional(normalizeVatNumber(data.vat_number)),
          fiscal_code: normalizeOptional(data.fiscal_code.toUpperCase()),
          email: normalizeOptional(data.email.toLowerCase()),
          phone: normalizeOptional(data.phone),
          website: normalizeOptional(data.website),
          product_category: normalizeOptional(data.product_category),
          notes: normalizeOptional(data.notes),
          payment_method: normalizeOptional(data.payment_method),
          is_active: data.is_active,
          // ── QR system (MP1 P0) ──────────────────────────────
          barcode_prefix: data.barcode_prefix.trim() || null,
          uses_gs1: data.uses_gs1,
          default_qr_format: data.default_qr_format || null,
        })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore aggiornato", { description: "Le modifiche sono state salvate." });
      handleCloseDialog();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Impossibile aggiornare il fornitore.";
      toast.error("Errore", { description: message.includes("duplicate") || message.includes("unique") ? "Esiste già un fornitore con questa ragione sociale." : message });
      logger.error("Errore aggiornamento fornitore", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const usage = await getSupplierUsageCounts(companyId, id);
      if (getUsageTotal(usage) > 0) {
        throw new Error("Fornitore già collegato a dati operativi: eliminazione bloccata per proteggere ordini, costi, pagamenti, magazzino e report.");
      }
      const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore eliminato", { description: "Il fornitore è stato rimosso." });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
    },
    onError: (error: Error) => {
      if ((error as { code?: string }).code === "23503" || testoTecnico(error).includes("foreign key") || testoTecnico(error).includes("violates")) {
        toast.error("Impossibile eliminare", {
          description: "Il fornitore è associato a dati operativi e non può essere eliminato.",
        });
      } else {
        toast.error("Errore", { description: error.message || "Impossibile eliminare il fornitore." });
      }
      logger.error("Errore eliminazione fornitore", error);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!sourceId || !targetId || sourceId === targetId) {
        throw new Error("Seleziona due fornitori diversi per il merge.");
      }
      const source = suppliers?.find((supplier) => supplier.id === sourceId);
      const target = suppliers?.find((supplier) => supplier.id === targetId);
      if (!source || !target) throw new Error("Fornitore sorgente o destinazione non trovato.");

      const operations = [
        supabase.from("article_templates").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("company_costs").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("order_items").update({ supplier_id: targetId }).eq("supplier_id", sourceId),
        supabase.from("purchase_orders").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("scadenze").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("prima_nota_entries").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("warehouse_stock").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
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
      setMergeSourceId("");
      setMergeTargetId("");
      toast.success("Merge completato", { description: "Storico, costi, ordini e pagamenti sono stati riassegnati al fornitore principale." });
    },
    onError: (error: Error) => {
      toast.error("Merge non completato", { description: error.message || "Impossibile unire i fornitori." });
      logger.error("Errore merge fornitori", error);
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
    setCategorySearch("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = normalizeSupplierName(formData.name);
    const safeNameKey = supplierNameKey(formData.name);
    const safeVatNumber = normalizeVatNumber(formData.vat_number);
    if (!safeName) {
      toast.error("Errore", { description: "Il nome è obbligatorio." });
      return;
    }
    if (suppliers?.some((supplier) => supplier.id !== editingSupplier?.id && supplierNameKey(supplier.name) === safeNameKey)) {
      toast.error("Fornitore duplicato", { description: "Esiste già un fornitore con questa ragione sociale." });
      return;
    }
    if (safeVatNumber && suppliers?.some((supplier) => supplier.id !== editingSupplier?.id && normalizeVatNumber(supplier.vat_number || "") === safeVatNumber)) {
      toast.error("P.IVA duplicata", { description: "Esiste già un fornitore con questa partita IVA." });
      return;
    }
    if (!isValidItalianVat(formData.vat_number, formData.is_foreign)) {
      toast.error("P.IVA non valida", { description: "Per fornitori italiani usa 11 cifre, con prefisso IT opzionale." });
      return;
    }
    if (!isValidEmail(formData.email)) {
      toast.error("Email non valida", { description: "Inserisci un indirizzo email valido." });
      return;
    }
    if (!isValidPhone(formData.phone)) {
      toast.error("Telefono non valido", { description: "Usa solo numeri, spazi, +, parentesi, punti o trattini." });
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
        {/* v8.6.74 — flex-wrap su mobile: prima i 2 button (Merge duplicati +
            Nuovo Fornitore) tagliavano fuori dal viewport iPhone 375px. */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 shrink-0" />
              Fornitori
            </CardTitle>
            <CardDescription>
              Gestisci i tuoi fornitori e le relative informazioni
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setMergeDialogOpen(true)}>
              <Merge className="h-4 w-4 mr-2" />
              Merge duplicati
            </Button>
            <Button size="sm" className="flex-1 sm:flex-none" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Nuovo Fornitore</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
              <p className="text-xs">{(error as Error | null)?.message || "Errore durante il caricamento dell'anagrafica fornitori."}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_180px_140px_160px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca nome, categoria, città, provincia o P.IVA..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Solo attivi</SelectItem>
                  <SelectItem value="inactive">Solo inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {existingCategories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={provinceFilter} onValueChange={setProvinceFilter}>
                <SelectTrigger><SelectValue placeholder="Provincia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le province</SelectItem>
                  {existingProvinces.map((province) => (
                    <SelectItem key={province} value={province}>{province}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
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
                <AlertTitle>Possibili duplicati rilevati</AlertTitle>
                <AlertDescription className="text-xs">
                  {duplicateCandidates.length} fornitori hanno nome o P.IVA sovrapponibili. Usa “Merge duplicati” per consolidare lo storico sul fornitore corretto.
                </AlertDescription>
              </Alert>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="italiani">Italiani ({italiani.length})</TabsTrigger>
                <TabsTrigger value="esteri">Esteri ({esteri.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="italiani">
                <SupplierTable suppliers={italiani} onEdit={handleOpenEdit} onDelete={handleOpenDelete} productCounts={productCounts} emptyMessage="Modifica ricerca o filtri, oppure crea un nuovo fornitore italiano." />
              </TabsContent>
              <TabsContent value="esteri">
                <SupplierTable suppliers={esteri} onEdit={handleOpenEdit} onDelete={handleOpenDelete} productCounts={productCounts} emptyMessage="Modifica ricerca o filtri, oppure crea un nuovo fornitore estero." />
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
                  <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Es. ABC Serramenti Srl" maxLength={100} />
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
                          maxLength={50}
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="italiano">Italiano</SelectItem>
                      <SelectItem value="estero">Estero</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-start gap-2 mt-4 rounded-md border p-3">
                <Checkbox
                  id="supplier-active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => updateField("is_active", checked === true)}
                />
                <div>
                  <Label htmlFor="supplier-active" className="cursor-pointer">Fornitore attivo</Label>
                  <p className="text-[11px] text-muted-foreground">
                    I fornitori inattivi restano nello storico, ma non dovrebbero essere usati per nuovi acquisti.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Dati Fiscali */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Dati Fiscali</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vat_number">P.IVA</Label>
                  <Input id="vat_number" value={formData.vat_number} onChange={(e) => updateField("vat_number", e.target.value)} placeholder="IT01234567890" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscal_code">Codice Fiscale</Label>
                  <Input id="fiscal_code" value={formData.fiscal_code} onChange={(e) => updateField("fiscal_code", e.target.value)} maxLength={20} />
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
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="info@fornitore.it" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+39 0123 456789" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Sito Web</Label>
                  <Input id="website" value={formData.website} onChange={(e) => updateField("website", e.target.value)} placeholder="www.fornitore.it" maxLength={100} />
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
                  <Input id="address" value={formData.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Via Roma 1" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Città</Label>
                  <Input id="city" value={formData.city} onChange={(e) => updateField("city", e.target.value)} maxLength={50} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province">Provincia</Label>
                  <Input id="province" value={formData.province} onChange={(e) => updateField("province", e.target.value)} placeholder="MI" maxLength={5} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">CAP</Label>
                  <Input id="postal_code" value={formData.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} placeholder="20100" maxLength={10} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Paese</Label>
                  <Input id="country" value={formData.country} onChange={(e) => updateField("country", e.target.value)} maxLength={50} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Note aggiuntive sul fornitore..." rows={3} maxLength={500} />
            </div>

            {/* ── QR & Barcode (MP1 P0) ────────────────────────── */}
            <Accordion type="single" collapsible className="border rounded-lg">
              <AccordionItem value="qr-barcode" className="border-0">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center gap-2 text-left">
                    <QrCode className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">QR & Barcode fornitore</span>
                      <span className="text-xs text-muted-foreground">
                        {formData.uses_gs1 ? "GS1 attivo" : "GS1 non attivo"}
                        {formData.barcode_prefix ? ` · prefisso ${formData.barcode_prefix}` : ""}
                        {formData.default_qr_format ? ` · formato ${formData.default_qr_format}` : ""}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3 space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Prefisso barcode tipico</Label>
                    <Input
                      value={formData.barcode_prefix}
                      onChange={(e) => updateField("barcode_prefix", e.target.value)}
                      placeholder="Es. 800012 (EAN italiano)"
                      maxLength={20}
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Usato per matching probabilistico quando il barcode scansionato non è ancora in anagrafica.
                    </p>
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="uses-gs1"
                      checked={formData.uses_gs1}
                      onCheckedChange={(checked) => updateField("uses_gs1", checked === true)}
                    />
                    <div className="flex-1">
                      <Label htmlFor="uses-gs1" className="text-sm font-medium cursor-pointer">
                        Questo fornitore usa GS1 (FNC1)
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Forza il parser GS1 a estrarre GTIN, lotto, seriale e scadenza dai QR scansionati.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Formato QR di default</Label>
                    <Select
                      value={formData.default_qr_format || "none"}
                      onValueChange={(v) =>
                        updateField("default_qr_format", v === "none" ? "" : (v as QrFormat))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nessuno" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuno</SelectItem>
                        <SelectItem value="ean13">EAN-13 (13 cifre)</SelectItem>
                        <SelectItem value="gtin14">GTIN-14 (14 cifre)</SelectItem>
                        <SelectItem value="gs1_128">GS1-128 (codice a barre)</SelectItem>
                        <SelectItem value="gs1_qr">GS1-QR (matrice 2D)</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Determina come il sistema stamperà le etichette per gli articoli di questo fornitore.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge duplicati fornitori</DialogTitle>
            <DialogDescription>
              Riassegna ordini, costi, scadenze, prima nota, listino e magazzino dal duplicato al fornitore principale. Il duplicato viene eliminato solo dopo la riassegnazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {duplicateCandidates.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Candidati rilevati: {duplicateCandidates.map((supplier) => supplier.name).join(", ")}
              </div>
            )}
            <div className="space-y-2">
              <Label>Fornitore duplicato da assorbire</Label>
              <Select value={mergeSourceId} onValueChange={setMergeSourceId}>
                <SelectTrigger><SelectValue placeholder="Seleziona duplicato..." /></SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fornitore principale da mantenere</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger><SelectValue placeholder="Seleziona destinazione..." /></SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).filter((supplier) => supplier.id !== mergeSourceId).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Operazione irreversibile</AlertTitle>
              <AlertDescription className="text-xs">
                Il merge preserva lo storico operativo riassegnando i riferimenti. Controlla bene sorgente e destinazione prima di procedere.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || mergeMutation.isPending}
              onClick={() => mergeMutation.mutate({ sourceId: mergeSourceId, targetId: mergeTargetId })}
            >
              {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Esegui merge sicuro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fornitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il fornitore "{deletingSupplier?.name}".
              {deletingUsageLoading ? (
                <> Verifico i collegamenti operativi prima di consentire l'eliminazione.</>
              ) : deletingUsageTotal > 0 ? (
                <>
                  {" "}Il fornitore è collegato a dati operativi e non può essere eliminato senza proteggere lo storico.
                  Usa lo stato inattivo se non deve essere più usato nei nuovi acquisti.
                </>
              ) : deletingUsageIsError ? (
                <> Non è stato possibile verificare tutti i collegamenti: l'eliminazione resta bloccata per sicurezza.</>
              ) : (
                <> Questa azione non può essere annullata.</>
              )}
            </AlertDialogDescription>
            {(deletingUsageTotal > 0 || deletingUsageIsError) && (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                {(Object.entries(deletingUsage) as Array<[keyof SupplierUsageCounts, number]>).map(([key, value]) => (
                  value > 0 ? <p key={key}>{supplierUsageLabels[key]} collegati: {value}</p> : null
                ))}
                {deletingUsageIsError && <p>Verifica collegamenti non riuscita.</p>}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingUsageLoading || deletingUsageTotal > 0 || deletingUsageIsError || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deletingUsageTotal > 0 || deletingUsageIsError ? "Bloccata" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
