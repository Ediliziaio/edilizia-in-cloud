import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Trash2, Pencil, Package, Warehouse, CheckCircle, Clock, Copy, Link2, Tag, Truck, Wallet, Paperclip, Upload, FileText, X, ChevronsUpDown, Check, PackageCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderItemAttachments, OrderItemAttachment } from "./OrderItemAttachments";
import { ArticleCombobox, ArticleTemplateData } from "./ArticleCombobox";
import { SupplierSelect } from "./SupplierSelect";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES } from "@/lib/vatUtils";
import type { StockItem } from "@/types/warehouse";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_produzione' | 'in_arrivo' | 'in_magazzino' | 'installato';

export const PAYMENT_METHODS = [
  { value: "bonifico_unico", label: "Bonifico unico" },
  { value: "50_50", label: "50% acconto + 50% saldo" },
  { value: "30_70", label: "30% acconto + 70% saldo" },
  { value: "riba", label: "RIBA" },
  { value: "contanti", label: "Contanti" },
  { value: "altro", label: "Altro" },
] as const;

export interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  position: number;
  supplier_id?: string;
  supplier_name?: string;
  purchase_price?: number;
  vat_rate?: number;
  stock_item_id?: string;
  attachments?: OrderItemAttachment[];
  is_paid?: boolean;
  paid_date?: string;
  payment_method?: string;
  // Installment tracking fields
  deposit_amount?: number;
  deposit_paid?: boolean;
  deposit_paid_date?: string;
  deposit_expected_date?: string;
  balance_amount?: number;
  balance_paid?: boolean;
  balance_paid_date?: string;
  balance_expected_date?: string;
  // v8.6.35 — Tracking & ODA
  delivery_date?: string; // arrivo previsto YYYY-MM-DD
  linked_purchase_order_id?: string; // link a purchase_orders esistente
  // Legacy fields kept for backwards compat
  unit_price?: number;
  discount_percent?: number;
  standard_cost?: number;
  // ── Aggancio listino (controllo di gestione costo standard vs reale) ──
  // article_template_id = link al listino; categoria = snapshot per analisi;
  // standard_cost = baseline da listino (€ pianificato) vs purchase_price (€ reale).
  article_template_id?: string | null;
  categoria?: string | null;
  // ── Ciclo misure (prodotti su misura) — spina dorsale articolo ──
  // Copiati dal preventivo (famiglia + assi + misura iniziale), poi arricchiti
  // dal sopralluogo con la misura definitiva. Vedi migration order_items_measure_lifecycle.
  family_id?: string | null;
  axis_selections?: Record<string, string> | null;
  misure_preventivo?: Record<string, number> | null;
  misure_rilevate?: Record<string, number> | null;
  measure_status?: 'da_rilevare' | 'rilevato' | 'confermato' | null;
  measure_variance?: Record<string, { prev: number; def: number; delta: number }> | null;
  survey_id?: string | null;
  survey_element_id?: string | null;
}

interface OrderItemsListProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  editable?: boolean;
  allowEdit?: boolean;
  showStatusControls?: boolean;
  showOdaCoverage?: boolean;
  onAttachmentsRefresh?: () => void;
  onStockPick?: (stockItemId: string, quantity: number) => void;
  onItemUpdate?: (item: OrderItem) => void;
  /**
   * v8.6.34 — Company id della commessa.
   * Necessario per super_admin (effectiveCompany è null senza impersonation):
   * altrimenti articoli/fornitori/magazzino non vengono caricati e l'utente
   * vede "Nessun articolo / Nessun fornitore" anche se ne esistono nel DB.
   */
  fallbackCompanyId?: string;
}

const STATUS_CONFIG: Record<OrderItemStatus, { label: string; badgeColor: string; borderColor: string }> = {
  da_ordinare: { 
    label: "Da Ordinare", 
    badgeColor: "bg-amber-500 text-white hover:bg-amber-500",
    borderColor: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20"
  },
  ordinato: {
    label: "Ordinato",
    badgeColor: "bg-blue-500 text-white hover:bg-blue-500",
    borderColor: "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
  },
  in_produzione: {
    label: "In Produzione",
    badgeColor: "bg-cyan-500 text-white hover:bg-cyan-500",
    borderColor: "border-l-4 border-l-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
  },
  in_arrivo: {
    label: "In Arrivo",
    badgeColor: "bg-indigo-500 text-white hover:bg-indigo-500",
    borderColor: "border-l-4 border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
  },
  in_magazzino: { 
    label: "In Magazzino", 
    badgeColor: "bg-emerald-500 text-white hover:bg-emerald-500",
    borderColor: "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
  },
  installato: { 
    label: "Installato", 
    badgeColor: "bg-gray-500 text-white hover:bg-gray-500",
    borderColor: "border-l-4 border-l-gray-400 bg-gray-50 dark:bg-gray-950/20"
  },
};

interface Supplier {
  id: string;
  name: string;
  vat_rate: number;
  payment_method: string | null;
}

export function OrderItemsList({
  items,
  onItemsChange,
  editable = true,
  allowEdit = false,
  showStatusControls = false,
  onAttachmentsRefresh,
  onStockPick,
  onItemUpdate,
  showOdaCoverage = false,
  fallbackCompanyId,
}: OrderItemsListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogTab, setDialogTab] = useState<"new" | "stock">("new");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemSupplierId, setItemSupplierId] = useState<string | undefined>();
  const [itemPurchasePrice, setItemPurchasePrice] = useState("");
  const [itemVatRate, setItemVatRate] = useState<number>(22);
  // Aggancio listino: baseline costo standard (€ da listino) + link + categoria
  const [itemStandardCost, setItemStandardCost] = useState<number | undefined>();
  const [itemArticleTemplateId, setItemArticleTemplateId] = useState<string | undefined>();
  const [itemCategoria, setItemCategoria] = useState<string | undefined>();
  const [itemStatus, setItemStatus] = useState<OrderItemStatus>("da_ordinare");
  const [itemIsPaid, setItemIsPaid] = useState(false);
  const [itemPaidDate, setItemPaidDate] = useState<Date | undefined>();
  const [itemPaymentMethod, setItemPaymentMethod] = useState<string>("");
  // Installment tracking state — getter prefissato `_` perché solo scritto
  // (verrà letto in iterazione futura quando esponiamo l'edit completo
  // dell'installment). Lint convention: _x → unused intenzionale.
  const [_itemDepositAmount, setItemDepositAmount] = useState<number>(0);
  const [itemDepositPaid, setItemDepositPaid] = useState(false);
  const [itemDepositPaidDate, setItemDepositPaidDate] = useState<Date | undefined>();
  const [_itemBalanceAmount, setItemBalanceAmount] = useState<number>(0);
  const [itemBalancePaid, setItemBalancePaid] = useState(false);
  const [itemBalancePaidDate, setItemBalancePaidDate] = useState<Date | undefined>();
  const [itemBalanceExpectedDate, setItemBalanceExpectedDate] = useState<Date | undefined>();
  const [itemDepositExpectedDate, setItemDepositExpectedDate] = useState<Date | undefined>();
  // v8.6.35 — Tracking & ODA state nel dialog
  const [itemDeliveryDate, setItemDeliveryDate] = useState<Date | undefined>();
  const [itemLinkedPoId, setItemLinkedPoId] = useState<string | undefined>();
  /** Deferred upload: file selezionato in memoria, viene caricato DOPO
   *  che l'articolo è salvato (necessita order_item_id). */
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  /**
   * v8.6.35 — Map "nome articolo + ts" → file in attesa di upload.
   * Quando l'utente crea un articolo nuovo con allegato, l'item non ha
   * ancora id; il parent fa insert in DB → items[] si aggiorna con l'id.
   * Un useEffect osserva items e quando trova un match per name+timestamp
   * recente che ha id ma non ha ancora l'attachment caricato, processa
   * l'upload. Per articoli in edit mode l'upload è immediato.
   */
  const pendingUploadsRef = useRef<Map<string, File>>(new Map());
  // Stock picking state
  const [selectedStockItem, setSelectedStockItem] = useState<string>("");
  const [stockPickQuantity, setStockPickQuantity] = useState("1");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<"all" | "stock" | "supplier">("all");

  const { effectiveCompany } = useAuth();
  // v8.6.34 — Usa fallbackCompanyId (companyId della commessa corrente) se
  // effectiveCompany è null. Necessario per super_admin che opera su una
  // company senza essere in impersonation: senza fallback, queries
  // article_templates / suppliers / warehouse_stock vengono saltate
  // (enabled: !!companyId === false) e l'utente vede dropdown vuoti.
  const companyId = effectiveCompany?.id ?? fallbackCompanyId;

  // Fetch suppliers to display names and get VAT rates
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_rate, payment_method")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  // Fetch warehouse stock for picking — lazy (solo se dialog aperto +
  // tab "Da Magazzino" selezionata). Select solo le colonne usate, limit
  // 500 per scalare con cataloghi grossi (utente cerca via search per
  // trovare oltre i 500 più frequenti).
  const { data: stockItems = [] } = useQuery({
    queryKey: ["warehouse-stock-with-wh", companyId],
    enabled: !!companyId && dialogOpen,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, unit_cost, tracking_mode, internal_code, barcode, description, warehouse:warehouse_id(id, name)")
        .eq("company_id", companyId!)
        .order("quantity", { ascending: false })
        .order("name")
        .limit(500);
      if (error) throw error;
      return data as Array<StockItem & { warehouse?: { id: string; name: string } | null }>;
    },
  });

  // Search testuale debounced
  const [stockSearch, setStockSearch] = useState("");
  const [stockSearchDebounced, setStockSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setStockSearchDebounced(stockSearch.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [stockSearch]);

  // Filter + group per warehouse
  const stockItemsFiltered = useMemo(() => {
    let list = stockItems;
    if (stockSearchDebounced) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(stockSearchDebounced) ||
        (s.internal_code && s.internal_code.toLowerCase().includes(stockSearchDebounced)) ||
        (s.barcode && s.barcode.toLowerCase().includes(stockSearchDebounced))
      );
    }
    return list;
  }, [stockItems, stockSearchDebounced]);

  const stockGroups = useMemo(() => {
    const map = new Map<string, typeof stockItemsFiltered>();
    for (const s of stockItemsFiltered) {
      const whName = s.warehouse?.name ?? "Senza magazzino";
      const existing = map.get(whName);
      if (existing) existing.push(s);
      else map.set(whName, [s]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [stockItemsFiltered]);
  const [stockPickerOpen, setStockPickerOpen] = useState(false);

  // v8.6.35 — Fetch ODA (purchase_orders) esistenti per questa company,
  // opzionalmente filtrabile per fornitore selezionato nel dialog.
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders-for-link", companyId, itemSupplierId],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("id, oda_number, supplier_id, status, expected_delivery_date")
        .eq("company_id", companyId!)
        .neq("status", "annullato")
        .order("created_at", { ascending: false })
        .limit(50);
      if (itemSupplierId) {
        q = q.eq("supplier_id", itemSupplierId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && dialogOpen,
  });

  // v8.6.35 — Upload helper riusabile per pendingAttachment
  const uploadAttachmentForItem = async (orderItemId: string, file: File) => {
    if (!companyId) return;
    try {
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${companyId}/${orderItemId}/ODA-${ts}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("order-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("order_item_attachments").insert({
        order_item_id: orderItemId,
        file_name: file.name,
        file_url: path,
        file_type: file.type,
        file_size: file.size,
      });
      if (dbErr) throw dbErr;
      onAttachmentsRefresh?.();
      toast({ title: "ODA caricato", description: `${file.name} allegato all'articolo.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Upload ODA fallito", description: msg });
    }
  };

  // v8.6.35 — Processor di pendingUploads: osserva quando items[] si aggiorna
  // dal DB con nuovi id. Per ogni item nuovo con un file in attesa, lancia
  // l'upload e rimuove dalla mappa.
  useEffect(() => {
    if (pendingUploadsRef.current.size === 0) return;
    items.forEach((item) => {
      if (!item.id) return;
      // chiave temporanea = name + position
      const tempKey = `${item.name}::${item.position}`;
      const file = pendingUploadsRef.current.get(tempKey);
      if (file) {
        pendingUploadsRef.current.delete(tempKey);
        void uploadAttachmentForItem(item.id, file);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Fetch PO item coverage (which order items have linked purchase_order_items)
  const orderItemIds = useMemo(() => items.filter(i => i.id).map(i => i.id!), [items]);
  const { data: poItemCoverage = [] } = useQuery({
    queryKey: ["po-item-coverage", orderItemIds],
    queryFn: async () => {
      if (orderItemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("order_item_id, purchase_orders!inner(oda_number, status)")
        .in("order_item_id", orderItemIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        order_item_id: string;
        purchase_orders: { oda_number: string; status: string };
      }>;
    },
    enabled: showOdaCoverage && orderItemIds.length > 0,
    staleTime: 30000,
  });

  // Map: order_item_id → PO info
  const poItemMap = useMemo(() => {
    const map = new Map<string, { oda_number: string; status: string }[]>();
    for (const row of poItemCoverage) {
      if (!row.order_item_id) continue;
      const existing = map.get(row.order_item_id) || [];
      existing.push(row.purchase_orders);
      map.set(row.order_item_id, existing);
    }
    return map;
  }, [poItemCoverage]);

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null;
    return suppliers.find(s => s.id === supplierId)?.name || null;
  };

  const getPaymentMethodLabel = (value?: string) => {
    if (!value) return null;
    return PAYMENT_METHODS.find(m => m.value === value)?.label || value;
  };

  const resetForm = () => {
    setItemName("");
    setItemDescription("");
    setItemQuantity("1");
    setItemSupplierId(undefined);
    setItemPurchasePrice("");
    setItemVatRate(22);
    setItemStandardCost(undefined);
    setItemArticleTemplateId(undefined);
    setItemCategoria(undefined);
    setItemStatus("da_ordinare");
    setItemIsPaid(false);
    setItemPaidDate(undefined);
    setItemPaymentMethod("");
    setItemDepositAmount(0);
    setItemDepositPaid(false);
    setItemDepositPaidDate(undefined);
    setItemBalanceAmount(0);
    setItemBalancePaid(false);
    setItemBalancePaidDate(undefined);
    setItemBalanceExpectedDate(undefined);
    setItemDepositExpectedDate(undefined);
    // v8.6.35
    setItemDeliveryDate(undefined);
    setItemLinkedPoId(undefined);
    setPendingAttachment(null);
    setEditingIndex(null);
    setSelectedStockItem("");
    setStockPickQuantity("1");
    setDialogTab("new");
    setDialogError(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
    const item = items[index];
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemQuantity(item.quantity.toString());
    setItemSupplierId(item.supplier_id);
    setItemPurchasePrice(item.purchase_price?.toString() || "");
    setItemVatRate(item.vat_rate ?? 22);
    setItemStandardCost(item.standard_cost != null && item.standard_cost > 0 ? item.standard_cost : undefined);
    setItemArticleTemplateId(item.article_template_id ?? undefined);
    setItemCategoria(item.categoria ?? undefined);
    setItemStatus(item.status);
    setItemIsPaid(item.is_paid || false);
    setItemPaidDate(item.paid_date ? new Date(item.paid_date) : undefined);
    setItemPaymentMethod(item.payment_method || "");
    setItemDepositAmount(item.deposit_amount || 0);
    setItemDepositPaid(item.deposit_paid || false);
    setItemDepositPaidDate(item.deposit_paid_date ? new Date(item.deposit_paid_date) : undefined);
    setItemBalanceAmount(item.balance_amount || 0);
    setItemBalancePaid(item.balance_paid || false);
    setItemBalancePaidDate(item.balance_paid_date ? new Date(item.balance_paid_date) : undefined);
    setItemBalanceExpectedDate(item.balance_expected_date ? new Date(item.balance_expected_date) : undefined);
    setItemDepositExpectedDate(item.deposit_expected_date ? new Date(item.deposit_expected_date) : undefined);
    // v8.6.35
    setItemDeliveryDate(item.delivery_date ? new Date(item.delivery_date) : undefined);
    setItemLinkedPoId(item.linked_purchase_order_id);
    setPendingAttachment(null); // file deferred non si "pre-popola" in edit
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSaveItem = (): boolean => {
    setDialogError(null);
    if (!itemName.trim()) {
      setDialogError("Inserisci il nome dell'articolo.");
      return false;
    }

    const quantity = Math.round(Number(itemQuantity));
    const purchasePrice = itemPurchasePrice.trim() ? Number(itemPurchasePrice) : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDialogError("La quantità deve essere maggiore di zero.");
      return false;
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setDialogError("Il costo di acquisto non può essere negativo.");
      return false;
    }
    if (!Number.isFinite(itemVatRate) || itemVatRate < 0 || itemVatRate > 100) {
      setDialogError("L'IVA acquisto deve essere compresa tra 0 e 100.");
      return false;
    }
    const totalCost = purchasePrice * quantity;
    
    const isInstallment = itemPaymentMethod === "50_50" || itemPaymentMethod === "30_70";
    let depositAmt = 0;
    let balanceAmt = 0;
    if (isInstallment) {
      const depositPercent = itemPaymentMethod === "50_50" ? 0.5 : 0.3;
      depositAmt = Math.round(totalCost * depositPercent * 100) / 100;
      balanceAmt = Math.round((totalCost - depositAmt) * 100) / 100;
    }

    // For installment: is_paid = both deposit and balance paid
    const isPaidGlobal = isInstallment 
      ? (itemDepositPaid && itemBalancePaid)
      : itemIsPaid;
    
    const commonFields = {
      name: itemName.trim(),
      description: itemDescription.trim() || undefined,
      quantity,
      supplier_id: itemSupplierId,
      purchase_price: purchasePrice,
      vat_rate: itemVatRate,
      status: itemStatus,
      is_paid: isPaidGlobal,
      paid_date: !isInstallment && itemIsPaid && itemPaidDate ? itemPaidDate.toLocaleDateString("en-CA") : undefined,
      payment_method: itemPaymentMethod || undefined,
      deposit_amount: isInstallment ? depositAmt : 0,
      deposit_paid: isInstallment ? itemDepositPaid : false,
      deposit_paid_date: isInstallment && itemDepositPaid && itemDepositPaidDate ? itemDepositPaidDate.toLocaleDateString("en-CA") : undefined,
      deposit_expected_date: isInstallment && !itemDepositPaid && itemDepositExpectedDate ? itemDepositExpectedDate.toLocaleDateString("en-CA") : undefined,
      balance_amount: isInstallment ? balanceAmt : 0,
      balance_paid: isInstallment ? itemBalancePaid : false,
      balance_paid_date: isInstallment && itemBalancePaid && itemBalancePaidDate ? itemBalancePaidDate.toLocaleDateString("en-CA") : undefined,
      balance_expected_date: isInstallment && itemBalanceExpectedDate ? itemBalanceExpectedDate.toLocaleDateString("en-CA") : undefined,
      // v8.6.35 — Tracking & ODA
      delivery_date: itemDeliveryDate ? itemDeliveryDate.toLocaleDateString("en-CA") : undefined,
      linked_purchase_order_id: itemLinkedPoId,
      // Aggancio listino: baseline da listino (€ standard) + link + categoria.
      // standard_cost NON è più hardcoded a 0 — porta il costo da listino così
      // da poterlo confrontare con purchase_price (€ realmente pagato).
      standard_cost: itemStandardCost ?? 0,
      article_template_id: itemArticleTemplateId ?? null,
      categoria: itemCategoria ?? null,
      // Legacy fields zeroed out
      unit_price: 0,
      discount_percent: 0,
    };

    if (editingIndex !== null) {
      const existing = items[editingIndex];
      const updatedItem = {
        ...existing,
        ...commonFields,
      };
      if (onItemUpdate && allowEdit) {
        onItemUpdate(updatedItem);
      } else {
        const newItems = [...items];
        newItems[editingIndex] = updatedItem;
        onItemsChange(newItems);
      }
      // v8.6.35 — Edit mode: item ha già id → upload immediato + link PO
      if (existing.id) {
        if (pendingAttachment) {
          void uploadAttachmentForItem(existing.id, pendingAttachment);
        }
        if (itemLinkedPoId && itemLinkedPoId !== existing.linked_purchase_order_id) {
          void linkExistingPoToItem(existing.id, itemLinkedPoId);
        }
      }
    } else {
      const newItem: OrderItem = {
        ...commonFields,
        position: items.length,
      };
      // v8.6.35 — Create mode: pendingAttachment va in coda (no id ancora).
      // Quando il parent farà insert in DB e items[] si refresha con id,
      // useEffect su `items` processerà l'upload.
      if (pendingAttachment) {
        const tempKey = `${commonFields.name}::${items.length}`;
        pendingUploadsRef.current.set(tempKey, pendingAttachment);
        toast({
          title: "Allegato in attesa",
          description: "Il PDF sarà caricato dopo il salvataggio della commessa.",
        });
      }
      onItemsChange([...items, newItem]);
    }

    setDialogOpen(false);
    resetForm();
    return true;
  };

  // v8.6.35 — Helper link ODA esistente: crea record in purchase_order_items
  // collegando l'articolo al PO selezionato. Mantiene tracking DDT/ricezione.
  const linkExistingPoToItem = async (orderItemId: string, poId: string) => {
    if (!companyId) return;
    try {
      // Trova item nel parent items (per dati base)
      const item = items.find((i) => i.id === orderItemId);
      if (!item) return;
      const { error } = await supabase.from("purchase_order_items").insert({
        company_id: companyId,
        purchase_order_id: poId,
        order_item_id: orderItemId,
        description: item.name,
        quantity: item.quantity,
        unit_price: item.purchase_price ?? 0,
        vat_rate: item.vat_rate ?? 22,
        line_total: (item.purchase_price ?? 0) * item.quantity,
        vat_amount: ((item.purchase_price ?? 0) * item.quantity) * ((item.vat_rate ?? 22) / 100),
      });
      if (error) throw error;
      toast({ title: "ODA collegato", description: "L'articolo è ora associato all'ODA selezionato." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Collegamento ODA fallito", description: msg });
    }
  };

  /**
   * 🆕 2026-05-10 — "Aggiungi e continua": stesso flow di handleSaveItem
   * MA non chiude il dialog. Resetta solo i campi (quantità, costi, descrizione)
   * mantenendo fornitore + IVA + stato così l'utente che inserisce 5 righe
   * dello stesso fornitore non deve riselezionarli ogni volta.
   *
   * Ottimizza il caso "ho appena ricevuto un DDT, devo aggiungere 8 articoli
   * dello stesso fornitore" — prima erano 8 cicli di apri/chiudi dialog.
   */
  const handleSaveAndContinue = () => {
    setDialogError(null);
    if (!itemName.trim()) { setDialogError("Inserisci il nome dell'articolo."); return; }
    const quantity = Math.round(Number(itemQuantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDialogError("La quantità deve essere maggiore di zero."); return;
    }
    const purchasePrice = itemPurchasePrice.trim() ? Number(itemPurchasePrice) : 0;
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setDialogError("Il costo di acquisto non può essere negativo."); return;
    }

    // Salva l'item (riusa la stessa logica di handleSaveItem).
    // Riapriamo il dialog SOLO se il salvataggio è andato a buon fine:
    // se la validazione di handleSaveItem fallisce non dobbiamo riaprire.
    const keepSupplier = itemSupplierId;
    const keepVat = itemVatRate;
    const keepStatus = itemStatus;
    const saved = handleSaveItem();
    if (!saved) return;

    // handleSaveItem chiude il dialog e resetta tutto. Lo riapriamo con i
    // campi "contestuali" pre-compilati (fornitore + IVA + stato) per
    // velocizzare l'inserimento di righe simili.
    setTimeout(() => {
      setDialogOpen(true);
      setItemSupplierId(keepSupplier);
      setItemVatRate(keepVat);
      setItemStatus(keepStatus);
    }, 0);
  };

  const handleArticleSelect = (name: string, templateData?: ArticleTemplateData) => {
    setItemName(name);
    if (templateData) {
      // Aggancio listino: salviamo il link + la categoria (snapshot) e la
      // BASELINE da listino in standard_cost (€ pianificato). Il purchase_price
      // parte uguale ma resta editabile = € realmente pagato → scostamento.
      setItemArticleTemplateId(templateData.id);
      setItemCategoria(templateData.category ?? undefined);
      if (templateData.standard_cost > 0) {
        setItemStandardCost(templateData.standard_cost);
        setItemPurchasePrice(templateData.standard_cost.toString());
      } else {
        setItemStandardCost(undefined);
      }
      if (templateData.vat_rate !== undefined) setItemVatRate(templateData.vat_rate);
      if (templateData.supplier_id) setItemSupplierId(templateData.supplier_id);
      if (templateData.description) setItemDescription(templateData.description);
    } else {
      // Nome digitato a mano (non dal listino) → nessuna baseline/link.
      setItemArticleTemplateId(undefined);
      setItemCategoria(undefined);
      setItemStandardCost(undefined);
    }
  };

  const handleSupplierChange = (supplierId: string | undefined, supplierVatRate?: number, paymentMethod?: string) => {
    setItemSupplierId(supplierId);
    if (supplierVatRate !== undefined) {
      setItemVatRate(supplierVatRate);
    }
    if (paymentMethod) {
      setItemPaymentMethod(paymentMethod);
    } else if (!supplierId) {
      setItemPaymentMethod("");
    }
  };

  const handleDuplicateItem = (index: number) => {
    const source = items[index];
    const duplicate: OrderItem = {
      ...source,
      id: undefined,
      position: items.length,
      status: "da_ordinare",
      is_paid: false,
      paid_date: undefined,
      deposit_paid: false,
      deposit_paid_date: undefined,
      balance_paid: false,
      balance_paid_date: undefined,
      attachments: [],
    };
    onItemsChange([...items, duplicate]);
  };

  const handleDeleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    newItems.forEach((item, i) => { item.position = i; });
    onItemsChange(newItems);
  };

  const handleStatusChange = (index: number, status: OrderItemStatus) => {
    const updatedItem = { ...items[index], status };
    if (onItemUpdate) {
      onItemUpdate(updatedItem);
    } else {
      const newItems = [...items];
      newItems[index] = updatedItem;
      onItemsChange(newItems);
    }
  };

  const handlePickFromStock = () => {
    setDialogError(null);
    const stock = stockItems.find((s) => s.id === selectedStockItem);
    if (!stock) {
      setDialogError("Seleziona un articolo da magazzino.");
      return;
    }
    const qty = Math.round(Number(stockPickQuantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      setDialogError("La quantità da prelevare deve essere maggiore di zero.");
      return;
    }
    if (qty > stock.quantity) {
      setDialogError("La quantità richiesta supera la disponibilità di magazzino.");
      return;
    }

    const newItem: OrderItem = {
      name: stock.name,
      description: stock.description || undefined,
      quantity: qty,
      status: "in_magazzino",
      position: items.length,
      supplier_id: stock.supplier_id || undefined,
      purchase_price: stock.unit_cost,
      vat_rate: stock.vat_rate ?? 22,
      stock_item_id: stock.id,
    };
    onItemsChange([...items, newItem]);
    onStockPick?.(stock.id, qty);
    setDialogOpen(false);
    resetForm();
  };

  const renderNewArticleForm = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      {/* ── Section 1: Articolo ─────────────────────────── */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Package className="h-4 w-4" /> Articolo
        </h4>
        <div className="space-y-2">
          <Label>Nome Articolo *</Label>
          <ArticleCombobox value={itemName} onValueChange={handleArticleSelect} placeholder="Cerca o digita nome articolo…" fallbackCompanyId={fallbackCompanyId} />
        </div>
        <div className="space-y-2">
          <Label>Descrizione <span className="text-xs text-muted-foreground font-normal">(opzionale)</span></Label>
          <Input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Es. dimensioni, finitura, codice fornitore…" />
        </div>
        <div className="space-y-2">
          <Label>Stato Articolo</Label>
          <Select value={itemStatus} onValueChange={(v: OrderItemStatus) => setItemStatus(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <SelectItem key={status} value={status}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* ── Section 2: Costi & IVA ─────────────────────────── */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Tag className="h-4 w-4" /> Costi
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Quantità</Label>
            <Input type="number" min="1" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Costo Acquisto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
              <Input type="number" min="0" step="0.01" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="pl-8" placeholder="0.00" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>IVA Acquisto</Label>
          <Select value={itemVatRate.toString()} onValueChange={(v) => setItemVatRate(parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VAT_RATES.map((rate) => (
                <SelectItem key={rate.value} value={rate.value.toString()}>{rate.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* ── Section 3: Fornitore & Pagamento ─────────────────────────── */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Truck className="h-4 w-4" /> Fornitore & Pagamento
        </h4>
        <div className="space-y-2">
          <Label>Fornitore <span className="text-xs text-muted-foreground font-normal">(opzionale)</span></Label>
          <SupplierSelect value={itemSupplierId} onValueChange={handleSupplierChange} fallbackCompanyId={fallbackCompanyId} />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            Modalità Pagamento
          </Label>
          <Select value={itemPaymentMethod} onValueChange={setItemPaymentMethod}>
            <SelectTrigger><SelectValue placeholder="Seleziona modalità…" /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conditional: single payment vs installments */}
        {itemPaymentMethod && itemPaymentMethod !== "50_50" && itemPaymentMethod !== "30_70" && (
          <>
            <div className="flex items-center justify-between">
              <Label>Pagato</Label>
              <Switch checked={itemIsPaid} onCheckedChange={setItemIsPaid} />
            </div>
            {itemIsPaid && (
              <div className="space-y-2">
                <Label>Data Pagamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !itemPaidDate && "text-muted-foreground")}
                      type="button"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {itemPaidDate ? format(itemPaidDate, "dd/MM/yyyy", { locale: it }) : "Seleziona data..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={itemPaidDate} onSelect={setItemPaidDate} locale={it} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </>
        )}

        {/* Installment tracking: 50/50 or 30/70 */}
        {(itemPaymentMethod === "50_50" || itemPaymentMethod === "30_70") && (() => {
          const qty = Math.max(1, parseInt(itemQuantity) || 1);
          const price = Math.max(0, parseFloat(itemPurchasePrice) || 0);
          const totalCost = price * qty;
          const depositPercent = itemPaymentMethod === "50_50" ? 0.5 : 0.3;
          const depositAmt = Math.round(totalCost * depositPercent * 100) / 100;
          const balanceAmt = Math.round((totalCost - depositAmt) * 100) / 100;
          return (
            <div className="space-y-4 bg-muted/50 rounded-lg p-3">
              {/* Acconto */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-sm">Acconto ({itemPaymentMethod === "50_50" ? "50%" : "30%"})</Label>
                  <span className="text-sm font-medium">{formatCurrency(depositAmt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Pagato</Label>
                  <Switch checked={itemDepositPaid} onCheckedChange={setItemDepositPaid} />
                </div>
                {itemDepositPaid && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data Pagamento Acconto</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm h-9", !itemDepositPaidDate && "text-muted-foreground")} type="button">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {itemDepositPaidDate ? format(itemDepositPaidDate, "dd/MM/yyyy", { locale: it }) : "Seleziona data..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={itemDepositPaidDate} onSelect={setItemDepositPaidDate} locale={it} className="pointer-events-auto" /></PopoverContent>
                    </Popover>
                  </div>
                )}
                {!itemDepositPaid && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data Prevista Acconto</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm h-9", !itemDepositExpectedDate && "text-muted-foreground")} type="button">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {itemDepositExpectedDate ? format(itemDepositExpectedDate, "dd/MM/yyyy", { locale: it }) : "Data prevista..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={itemDepositExpectedDate} onSelect={setItemDepositExpectedDate} locale={it} className="pointer-events-auto" /></PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              {/* Saldo */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-sm">Saldo ({itemPaymentMethod === "50_50" ? "50%" : "70%"})</Label>
                  <span className="text-sm font-medium">{formatCurrency(balanceAmt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Pagato</Label>
                  <Switch checked={itemBalancePaid} onCheckedChange={setItemBalancePaid} />
                </div>
                {itemBalancePaid && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data Pagamento Saldo</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm h-9", !itemBalancePaidDate && "text-muted-foreground")} type="button">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {itemBalancePaidDate ? format(itemBalancePaidDate, "dd/MM/yyyy", { locale: it }) : "Seleziona data..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={itemBalancePaidDate} onSelect={setItemBalancePaidDate} locale={it} /></PopoverContent>
                    </Popover>
                  </div>
                )}
                {!itemBalancePaid && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data Prevista Saldo</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm h-9", !itemBalanceExpectedDate && "text-muted-foreground")} type="button">
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {itemBalanceExpectedDate ? format(itemBalanceExpectedDate, "dd/MM/yyyy", { locale: it }) : "Data prevista..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={itemBalanceExpectedDate} onSelect={setItemBalanceExpectedDate} locale={it} /></PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <Separator />

      {/* ── Section 4: Tracking & ODA (v8.6.35) ─────────────────────────── */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <FileText className="h-4 w-4" /> Tracking & Ordine di Acquisto
        </h4>

        {/* Data Arrivo Prevista */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Data Arrivo Prevista <span className="text-xs text-muted-foreground font-normal">(opzionale)</span>
          </Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  type="button"
                  className={cn("flex-1 justify-start text-left font-normal", !itemDeliveryDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {itemDeliveryDate ? format(itemDeliveryDate, "dd/MM/yyyy", { locale: it }) : "Quando arriva la merce…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={itemDeliveryDate} onSelect={setItemDeliveryDate} locale={it} />
              </PopoverContent>
            </Popover>
            {itemDeliveryDate && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setItemDeliveryDate(undefined)}
                title="Rimuovi data"
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ODA: link esistente */}
        {purchaseOrders.length > 0 && (
          <div className="space-y-2">
            <Label>Collega ODA esistente <span className="text-xs text-muted-foreground font-normal">(opzionale)</span></Label>
            <Select
              value={itemLinkedPoId || "none"}
              onValueChange={(v) => setItemLinkedPoId(v === "none" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nessun ODA collegato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Nessun ODA collegato</span>
                </SelectItem>
                {purchaseOrders.map((po: { id: string; oda_number?: string | null; status?: string | null; expected_delivery_date?: string | null }) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.oda_number || `ODA #${po.id.substring(0, 8)}`}
                    {po.status && <span className="ml-2 text-xs text-muted-foreground">· {po.status}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Solo ODA di {itemSupplierId ? "questo fornitore" : "tutti i fornitori"} (max 50 più recenti).
            </p>
          </div>
        )}

        {/* Upload PDF/foto ODA */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            Allega PDF ordine di acquisto <span className="text-xs text-muted-foreground font-normal">(opzionale)</span>
          </Label>
          {pendingAttachment ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate" title={pendingAttachment.name}>{pendingAttachment.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(pendingAttachment.size / 1024).toFixed(0)} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPendingAttachment(null)}
                title="Rimuovi"
                className="h-6 w-6 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
              <Upload className="h-4 w-4" />
              <span>Clicca per scegliere file (PDF/JPG/PNG, max 10MB)</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    toast({ variant: "destructive", title: "File troppo grande", description: "Massimo 10 MB. Comprimi il PDF e riprova." });
                    e.target.value = "";
                    return;
                  }
                  setPendingAttachment(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Caricato come allegato all'articolo dopo il salvataggio.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 min-w-0">
            <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="truncate">Articoli della Commessa</span>
          </CardTitle>
          {editable && (
            <Button type="button" size="sm" onClick={openAddDialog} className="shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Aggiungi</span>
            </Button>
          )}
        </div>
        {/* Status summary chips */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(Object.entries(
              items.reduce((acc, item) => {
                acc[item.status] = (acc[item.status] || 0) + 1;
                return acc;
              }, {} as Record<OrderItemStatus, number>)
            ) as [OrderItemStatus, number][]).map(([status, count]) => (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${(STATUS_CONFIG[status] ?? STATUS_CONFIG.da_ordinare).badgeColor}`}
              >
                {count} {(STATUS_CONFIG[status] ?? STATUS_CONFIG.da_ordinare).label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Source filter */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-none pb-1">
            <span className="text-sm text-muted-foreground shrink-0">Filtra:</span>
            <div className="flex gap-1">
              <Button type="button" variant={sourceFilter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs shrink-0" onClick={() => setSourceFilter("all")}>Tutti</Button>
              <Button type="button" variant={sourceFilter === "stock" ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setSourceFilter("stock")}>
                <Warehouse className="h-3 w-3" />Da Giacenza
              </Button>
              <Button type="button" variant={sourceFilter === "supplier" ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setSourceFilter("supplier")}>
                <Package className="h-3 w-3" />Da Fornitore
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            Nessun articolo aggiunto. {editable && "Clicca su 'Aggiungi' per inserire articoli."}
          </p>
        ) : (
          <div className="space-y-3">
            {items
              .filter(item => {
                if (sourceFilter === "stock") return !!item.stock_item_id;
                if (sourceFilter === "supplier") return !item.stock_item_id;
                return true;
              })
              .map((item) => {
                const index = items.indexOf(item);
                return (
              <div
                key={item.id || index}
                className={`p-3 rounded-lg space-y-2 ${STATUS_CONFIG[item.status]?.borderColor || STATUS_CONFIG.da_ordinare.borderColor}`}
              >
                {/* Item info (full width) */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="text-sm text-muted-foreground">(x{item.quantity})</span>
                    )}
                    {item.stock_item_id ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 gap-1">
                        <Warehouse className="h-3 w-3" />
                        Da Giacenza
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Package className="h-3 w-3" />
                        Da Fornitore
                      </Badge>
                    )}
                    {/* Payment status badge */}
                    {(item.payment_method === "50_50" || item.payment_method === "30_70") ? (
                      <>
                        {item.deposit_paid && item.balance_paid ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 gap-1">
                            <CheckCircle className="h-3 w-3" />Tutto pagato
                          </Badge>
                        ) : item.deposit_paid ? (
                          <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 gap-1">
                            <Clock className="h-3 w-3" />Acconto pagato
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 gap-1">
                            <Clock className="h-3 w-3" />Non pagato
                          </Badge>
                        )}
                      </>
                    ) : item.is_paid ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 gap-1">
                        <CheckCircle className="h-3 w-3" />Pagato
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 gap-1">
                        <Clock className="h-3 w-3" />Non pagato
                      </Badge>
                    )}
                    {/* OdA coverage badge */}
                    {showOdaCoverage && item.id && poItemMap.has(item.id) && (
                      <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-700 gap-1">
                        <Link2 className="h-3 w-3" />
                        OdA {poItemMap.get(item.id)!.map(p => p.oda_number).join(", ")}
                      </Badge>
                    )}
                    {showOdaCoverage && item.id && !poItemMap.has(item.id) && !item.stock_item_id && (
                      <Badge variant="outline" className="text-xs text-muted-foreground gap-1 border-dashed">
                        <Link2 className="h-3 w-3" />
                        Senza OdA
                      </Badge>
                    )}
                    {/* v8.6.35 — Badge data arrivo prevista */}
                    {item.delivery_date && (() => {
                      const arr = new Date(item.delivery_date);
                      const now = new Date();
                      const diffDays = Math.floor((arr.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const isPast = diffDays < 0;
                      const isImminent = diffDays >= 0 && diffDays <= 3;
                      const isInArrival = item.status === "in_arrivo" || item.status === "in_magazzino";
                      // Highlight giallo se prossima/imminente, rosso se scaduta
                      // e status non è ancora in_arrivo (auto-suggest), grigio normale altrimenti
                      const colorClass = isPast && !isInArrival
                        ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-700"
                        : isImminent && !isInArrival
                          ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700"
                          : "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-700";
                      const title = isPast && !isInArrival
                        ? `Arrivo previsto ${format(arr, "dd/MM/yyyy", { locale: it })} — già passata. Aggiorna stato a 'In Arrivo' o 'In Magazzino'.`
                        : isImminent && !isInArrival
                          ? `Arrivo previsto in ${diffDays === 0 ? "oggi" : `${diffDays} gg`}`
                          : `Arrivo previsto ${format(arr, "dd/MM/yyyy", { locale: it })}`;
                      return (
                        <Badge className={`text-xs gap-1 ${colorClass}`} title={title}>
                          <CalendarIcon className="h-3 w-3" />
                          Arrivo {format(arr, "dd/MM", { locale: it })}
                          {isPast && !isInArrival && " ⚠"}
                        </Badge>
                      );
                    })()}
                    {/* v8.6.35 — Badge allegato ODA */}
                    {item.attachments && item.attachments.some((a) => a.file_name.startsWith("ODA") || a.file_name.toLowerCase().includes("oda")) && (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 cursor-pointer hover:bg-muted/50"
                        title="Allegato ODA disponibile — click per scaricare"
                        onClick={async () => {
                          const odaAtt = item.attachments?.find(
                            (a) => a.file_name.startsWith("ODA") || a.file_name.toLowerCase().includes("oda")
                          );
                          if (!odaAtt) return;
                          try {
                            // file_url può essere un path relativo o un URL completo:
                            // estrai il path dello storage dopo il nome del bucket.
                            let filePath = odaAtt.file_url;
                            if (filePath.startsWith("http")) {
                              const parts = filePath.split("/order-attachments/");
                              if (parts.length > 1) filePath = decodeURIComponent(parts[1]);
                            }
                            const { data, error } = await supabase.storage
                              .from("order-attachments")
                              .createSignedUrl(filePath, 3600);
                            if (error || !data?.signedUrl) throw error ?? new Error("URL non disponibile");
                            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            toast({ variant: "destructive", title: "Apertura ODA fallita", description: msg });
                          }
                        }}
                      >
                        <Paperclip className="h-3 w-3" />
                        ODA allegato
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                    {(item.supplier_id || item.supplier_name) && (
                      <span>Fornitore: {item.supplier_name || getSupplierName(item.supplier_id) || "—"}</span>
                    )}
                    {item.purchase_price != null && item.purchase_price > 0 && (
                      <span>Costo: {formatCurrency(item.purchase_price * item.quantity)} <span className="text-xs">({item.vat_rate ?? 22}% IVA)</span></span>
                    )}
                    {item.standard_cost != null && item.standard_cost > 0 && (() => {
                      // Confronto costo STANDARD (da listino) vs REALE (pagato).
                      const realeUnit = item.purchase_price ?? 0;
                      const deltaLine = (realeUnit - item.standard_cost!) * item.quantity;
                      const pct = (realeUnit - item.standard_cost!) / item.standard_cost! * 100;
                      const over = deltaLine > 0.005;
                      const under = deltaLine < -0.005;
                      return (
                        <span title="Costo da listino (standard) vs costo realmente pagato">
                          Listino: {formatCurrency(item.standard_cost! * item.quantity)}
                          {(over || under) && (
                            <span className={`ml-1 font-medium ${over ? "text-red-600" : "text-emerald-600"}`}>
                              {over ? "▲" : "▼"} {deltaLine > 0 ? "+" : ""}{formatCurrency(deltaLine)} ({pct > 0 ? "+" : ""}{pct.toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    {item.payment_method && (
                      <span>Mod.: {getPaymentMethodLabel(item.payment_method)}</span>
                    )}
                  </div>
                  {(item.payment_method === "50_50" || item.payment_method === "30_70") && (item.deposit_amount || item.balance_amount) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span>Acconto: {formatCurrency(item.deposit_amount || 0)} {item.deposit_paid ? "✓" : "—"}</span>
                      <span>Saldo: {formatCurrency(item.balance_amount || 0)} {item.balance_paid ? "✓" : item.balance_expected_date ? `prev. ${item.balance_expected_date}` : "—"}</span>
                    </div>
                  )}
                  {item.description && (
                    <p className="text-sm text-muted-foreground truncate mt-1">{item.description}</p>
                  )}
                </div>

                {/* Status + actions row */}
                <div className="flex items-center justify-between gap-2">
                  {showStatusControls ? (
                    <Select
                      value={item.status || "da_ordinare"}
                      onValueChange={(value: OrderItemStatus) => handleStatusChange(index, value)}
                    >
                      <SelectTrigger className={cn(
                        "flex-1 sm:flex-none sm:w-40 h-8 text-xs font-medium border",
                        STATUS_CONFIG[item.status]
                          ? STATUS_CONFIG[item.status].badgeColor.replace(/hover:\S+/g, '')
                          : STATUS_CONFIG.da_ordinare.badgeColor.replace(/hover:\S+/g, '')
                      )}>
                        <SelectValue placeholder="Seleziona stato..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                          <SelectItem key={status} value={status}>
                            <span className="flex items-center gap-2">
                              <span className={cn("w-2 h-2 rounded-full", config.badgeColor.split(' ')[0])} />
                              {config.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={STATUS_CONFIG[item.status]?.badgeColor || STATUS_CONFIG.da_ordinare.badgeColor}>
                      {STATUS_CONFIG[item.status]?.label || "Da Ordinare"}
                    </Badge>
                  )}
                  {(editable || allowEdit) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEditDialog(index)} title="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {editable && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDuplicateItem(index)} title="Duplica">
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      {editable && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteItem(index)} title="Elimina">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Attachments section */}
                {item.id && (
                  <div className="pt-2 border-t">
                    <OrderItemAttachments
                      itemId={item.id}
                      itemName={item.name}
                      attachments={item.attachments || []}
                      editable={editable || showStatusControls}
                      onAttachmentsChange={() => onAttachmentsRefresh?.()}
                    />
                  </div>
                )}
              </div>
            );
              })}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingIndex !== null ? "Modifica Articolo" : "Nuovo Articolo"}
              </DialogTitle>
              <DialogDescription>
                {editingIndex !== null
                  ? "Modifica i dettagli dell'articolo"
                  : "Aggiungi un articolo alla commessa"}
              </DialogDescription>
            </DialogHeader>
            {dialogError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dialogError}
              </div>
            )}

            {editingIndex === null && stockItems.length > 0 ? (
              <Tabs value={dialogTab} onValueChange={(v) => setDialogTab(v as "new" | "stock")}>
                <TabsList className="w-full">
                  <TabsTrigger value="new" className="flex-1 gap-1">
                    <Plus className="h-3 w-3" />
                    Nuovo Articolo
                  </TabsTrigger>
                  <TabsTrigger value="stock" className="flex-1 gap-1">
                    <Warehouse className="h-3 w-3" />
                    Da Magazzino
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="new">
                  {renderNewArticleForm()}
                  {/* Footer: ordine logico per scan-pattern italiano (sinistra→destra):
                      [Annulla] [Aggiungi e continua] [Aggiungi]
                      "Aggiungi" è la primary action (destra). "Aggiungi e continua"
                      è secondary (per inserimenti rapidi). Tooltip su "continua"
                      per chiarire la differenza alla prima visita. */}
                  <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="sm:order-1">
                      Annulla
                    </Button>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleSaveAndContinue}
                            disabled={!itemName.trim()}
                            className="sm:order-2 gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Aggiungi e continua
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Salva l'articolo e riapre subito il form col fornitore, IVA e stato già compilati. Utile per inserire più articoli simili in fila.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button type="button" onClick={handleSaveItem} disabled={!itemName.trim()} className="sm:order-3">
                      Aggiungi
                    </Button>
                  </DialogFooter>
                </TabsContent>

                <TabsContent value="stock">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Articolo da Magazzino *</Label>
                      <Popover open={stockPickerOpen} onOpenChange={setStockPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between text-left font-normal h-9"
                          >
                            {selectedStockItem ? (() => {
                              const s = stockItems.find((it) => it.id === selectedStockItem);
                              if (!s) return "Seleziona articolo…";
                              return (
                                <span className="truncate">
                                  {s.name}
                                  <span className="text-muted-foreground text-xs ml-2">· {s.warehouse?.name ?? "—"} · {s.quantity} pz</span>
                                </span>
                              );
                            })() : (
                              <span className="text-muted-foreground">Seleziona articolo… (cerca per nome o codice)</span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          avoidCollisions={false}
                        >
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Filtra per nome, codice o barcode…"
                              value={stockSearch}
                              onValueChange={setStockSearch}
                            />
                            <CommandList
                              className="!max-h-[320px] overscroll-contain"
                              onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}
                            >
                              {stockGroups.length === 0 ? (
                                <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                                  {stockSearchDebounced
                                    ? `Nessun articolo trovato per "${stockSearchDebounced}"`
                                    : "Nessun articolo in magazzino"}
                                </CommandEmpty>
                              ) : (
                                stockGroups.map(([whName, items]) => (
                                  <CommandGroup key={whName} heading={`📦 ${whName} (${items.length})`}>
                                    {items.map((s) => {
                                      const noStock = s.quantity <= 0;
                                      return (
                                        <CommandItem
                                          key={s.id}
                                          value={s.id}
                                          onSelect={() => {
                                            setSelectedStockItem(s.id);
                                            setStockPickerOpen(false);
                                          }}
                                          className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                                        >
                                          <div className="flex items-center gap-2 w-full">
                                            <Check className={cn("h-3.5 w-3.5 shrink-0", selectedStockItem === s.id ? "opacity-100" : "opacity-0")} />
                                            <span className={cn("font-medium text-sm truncate", noStock && "text-muted-foreground")}>{s.name}</span>
                                            {s.internal_code && (
                                              <Badge variant="outline" className="text-[10px] h-4 shrink-0 ml-auto">{s.internal_code}</Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 pl-5 text-[11px]">
                                            <PackageCheck className={cn("h-2.5 w-2.5", noStock ? "text-destructive" : "text-emerald-600")} />
                                            <span className={noStock ? "text-destructive" : "text-muted-foreground"}>
                                              Disp: <span className="font-semibold tabular-nums">{s.quantity}</span> pz
                                            </span>
                                            <span className="text-muted-foreground">· {formatCurrency(s.unit_cost)}/pz</span>
                                            {s.tracking_mode === "serialized" && (
                                              <Badge variant="secondary" className="text-[9px] h-4" title="Articolo serializzato — ogni unità ha un codice univoco">SN</Badge>
                                            )}
                                            {noStock && <Badge variant="destructive" className="text-[9px] h-4">esaurito</Badge>}
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                ))
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {selectedStockItem && (() => {
                      const stock = stockItems.find((s) => s.id === selectedStockItem);
                      if (!stock) return null;
                      return (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                            <div className="flex justify-between"><span>Costo unitario:</span><span className="font-medium">{formatCurrency(stock.unit_cost)}</span></div>
                            <div className="flex justify-between"><span>Disponibili:</span><span className="font-medium">{stock.quantity}</span></div>
                            {stock.description && <p className="text-muted-foreground">{stock.description}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label>Quantità da prelevare</Label>
                            <Input type="number" min="1" max={stock.quantity} value={stockPickQuantity} onChange={(e) => setStockPickQuantity(e.target.value)} />
                            {parseInt(stockPickQuantity) > stock.quantity && (
                              <p className="text-xs text-destructive">Quantità superiore alla disponibilità</p>
                            )}
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50 text-sm">
                            <div className="flex justify-between font-medium">
                              <span>Costo totale:</span>
                              <span>{formatCurrency(stock.unit_cost * (parseInt(stockPickQuantity) || 0))}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
                    <Button
                      type="button"
                      onClick={handlePickFromStock}
                      disabled={!selectedStockItem || !parseInt(stockPickQuantity) || parseInt(stockPickQuantity) > (stockItems.find((s) => s.id === selectedStockItem)?.quantity || 0)}
                    >
                      <Warehouse className="h-4 w-4 mr-2" />
                      Preleva
                    </Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>
            ) : (
              <>
                {renderNewArticleForm()}
                <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="sm:order-1">
                    Annulla
                  </Button>
                  {/* "Aggiungi e continua" solo in creazione (non in edit) */}
                  {editingIndex === null && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleSaveAndContinue}
                            disabled={!itemName.trim()}
                            className="sm:order-2 gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Aggiungi e continua
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Salva l'articolo e riapre subito il form col fornitore, IVA e stato già compilati. Utile per inserire più articoli simili in fila.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button type="button" onClick={handleSaveItem} disabled={!itemName.trim()} className="sm:order-3">
                    {editingIndex !== null ? "Salva modifiche" : "Aggiungi"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
