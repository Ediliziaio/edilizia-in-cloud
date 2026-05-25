import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Search,
  Trash2,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHODS as ORDER_PAYMENT_METHODS } from "@/components/orders/OrderItemsList";
import { useWarehouses } from "@/hooks/useWarehouses";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, StockItem, WarehouseItem } from "@/types/warehouse";

type PurchaseStatus = Extract<OrderItemStatus, "da_ordinare" | "ordinato" | "in_arrivo" | "in_magazzino">;
type PaymentState = "paid" | "partial" | "unpaid" | "unknown";

type SupplierOption = {
  id: string;
  name: string;
  payment_method?: string | null;
};

type ManualPurchaseItem = {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
  vatRate: number;
  supplierId: string | null;
  paymentMethod: string | null;
  paymentTerm: string | null;
  expectedPaymentDate: string;
  paid: boolean;
  paidDate: string;
  depositPaid: boolean;
  depositExpectedDate: string;
  balancePaid: boolean;
  balanceExpectedDate: string;
  status: PurchaseStatus;
  warehouseId: string | null;
  orderDate: string;
  arrivalDate: string;
  priority: "alta" | "media" | "bassa";
  dueDate: string;
  notes: string;
  completed: boolean;
};

type PurchaseRow = {
  id: string;
  source: "manual" | "stock" | "commessa";
  name: string;
  quantity: number;
  supplierId: string | null;
  warehouseId: string | null;
  status: PurchaseStatus;
  priority: "alta" | "media" | "bassa";
  dueDate: string | null;
  notes: string;
  estimatedCost: number | null;
  isPaid: boolean;
  paymentState: PaymentState;
  paymentLabel: string;
  paymentDetail: string;
  completed?: boolean;
  meta: string;
  orderItemId?: string;
  orderCode?: string | null;
  customerName?: string | null;
};

type ProductSuggestion = {
  id: string;
  name: string;
  supplierId: string | null;
  quantity: number | null;
  unitCost: number | null;
  source: "stock" | "storico";
};

interface WarehousePurchaseListTabProps {
  companyId: string;
  items: WarehouseItem[];
  stockItems: Array<StockItem | (Pick<StockItem, "id" | "name" | "quantity" | "unit_cost" | "min_stock_level"> & Partial<StockItem>)>;
  suppliers: SupplierOption[];
  warehouseFilter?: string | null;
  onStatusChange?: (itemId: string, status: OrderItemStatus) => void;
  onRegisterArrival?: () => void;
  readOnly?: boolean;
}

const SOURCE_LABELS: Record<PurchaseRow["source"], string> = {
  manual: "Manuale",
  stock: "Scorta",
  commessa: "Commessa",
};

const PRIORITY_STYLES: Record<PurchaseRow["priority"], string> = {
  alta: "border-red-200 bg-red-50 text-red-700",
  media: "border-amber-200 bg-amber-50 text-amber-700",
  bassa: "border-slate-200 bg-slate-50 text-slate-700",
};

const STATUS_BADGE_STYLES: Record<PurchaseStatus, string> = {
  da_ordinare: "border-amber-200 bg-amber-50 text-amber-700",
  ordinato: "border-blue-200 bg-blue-50 text-blue-700",
  in_arrivo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_magazzino: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const PAYMENT_BADGE_STYLES: Record<PaymentState, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-blue-200 bg-blue-50 text-blue-700",
  unpaid: "border-amber-200 bg-amber-50 text-amber-700",
  unknown: "border-slate-200 bg-slate-50 text-slate-600",
};

const PAYMENT_METHODS = [
  ...ORDER_PAYMENT_METHODS,
  { value: "bonifico", label: "Bonifico" },
  { value: "carta", label: "Carta" },
  { value: "assegno", label: "Assegno" },
  { value: "finanziamento", label: "Finanziamento" },
  { value: "rid", label: "RID/SDD" },
].filter((method, index, methods) => methods.findIndex((item) => item.value === method.value) === index);

const PAYMENT_TERMS = [
  { value: "immediato", label: "Pagamento immediato" },
  { value: "consegna", label: "Alla consegna" },
  { value: "30gg", label: "30 giorni data fattura" },
  { value: "acconto_saldo", label: "50% acconto + 50% saldo" },
  { value: "30_70", label: "30% acconto + 70% saldo" },
];

const VAT_RATE_OPTIONS = [0, 10, 22];
const PURCHASE_STATUSES: PurchaseStatus[] = ["da_ordinare", "ordinato", "in_arrivo", "in_magazzino"];

const todayIso = () => new Date().toISOString().slice(0, 10);

function createEmptyForm(): Omit<ManualPurchaseItem, "id" | "completed"> {
  return {
    name: "",
    quantity: 1,
    unitCost: 0,
    vatRate: 22,
    supplierId: null,
    paymentMethod: null,
    paymentTerm: "consegna",
    expectedPaymentDate: "",
    paid: false,
    paidDate: "",
    depositPaid: false,
    depositExpectedDate: "",
    balancePaid: false,
    balanceExpectedDate: "",
    status: "da_ordinare",
    warehouseId: null,
    orderDate: "",
    arrivalDate: "",
    priority: "media",
    dueDate: "",
    notes: "",
  };
}

function getDaysUntil(date: string | null): number | null {
  if (!date) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function getDefaultPaymentTerm(paymentMethod?: string | null) {
  if (paymentMethod === "50_50") return "acconto_saldo";
  if (paymentMethod === "30_70") return "30_70";
  if (paymentMethod === "bonifico_unico") return "immediato";
  return "consegna";
}

function getDepositPercent(paymentTerm?: string | null) {
  return paymentTerm === "30_70" ? 0.3 : 0.5;
}

function getManualTotal(item: Pick<ManualPurchaseItem, "quantity" | "unitCost" | "vatRate">) {
  return Math.max(1, Number(item.quantity || 1)) * Math.max(0, Number(item.unitCost || 0)) * (1 + Math.max(0, Number(item.vatRate || 0)) / 100);
}

export default function WarehousePurchaseListTab({
  companyId,
  items,
  stockItems,
  suppliers,
  warehouseFilter = null,
  onStatusChange,
  onRegisterArrival,
  readOnly = false,
}: WarehousePurchaseListTabProps) {
  const { warehouses, defaultWarehouse } = useWarehouses(true);
  const [manualItems, setManualItems] = useState<ManualPurchaseItem[]>([]);
  const [form, setForm] = useState(createEmptyForm);
  const [costInputMode, setCostInputMode] = useState<"unit" | "total">("unit");
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | PurchaseRow["source"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseStatus>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentState>("all");
  const [dismissedRowIds, setDismissedRowIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const storageKey = `warehouse-purchase-list:${companyId}`;
  const dismissedStorageKey = `warehouse-purchase-dismissed:${companyId}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const safeItems = Array.isArray(parsed)
        ? parsed
            .filter((item) => item && typeof item.name === "string" && item.name.trim())
            .map((item, index) => ({
              id: typeof item.id === "string" ? item.id : `manual-${Date.now()}-${index}`,
              name: item.name.trim(),
              quantity: Math.max(1, Number(item.quantity || 1)),
              unitCost: Math.max(0, Number(item.unitCost || 0)),
              vatRate: VAT_RATE_OPTIONS.includes(Number(item.vatRate)) ? Number(item.vatRate) : 22,
              supplierId: typeof item.supplierId === "string" ? item.supplierId : null,
              paymentMethod: typeof item.paymentMethod === "string" ? item.paymentMethod : null,
              paymentTerm: typeof item.paymentTerm === "string" ? item.paymentTerm : "consegna",
              expectedPaymentDate: typeof item.expectedPaymentDate === "string" ? item.expectedPaymentDate : "",
              paid: Boolean(item.paid),
              paidDate: typeof item.paidDate === "string" ? item.paidDate : "",
              depositPaid: Boolean(item.depositPaid),
              depositExpectedDate: typeof item.depositExpectedDate === "string" ? item.depositExpectedDate : "",
              balancePaid: Boolean(item.balancePaid),
              balanceExpectedDate: typeof item.balanceExpectedDate === "string" ? item.balanceExpectedDate : "",
              status: PURCHASE_STATUSES.includes(item.status) ? item.status : (item.completed ? "in_magazzino" : "da_ordinare"),
              warehouseId: typeof item.warehouseId === "string" ? item.warehouseId : null,
              orderDate: typeof item.orderDate === "string" ? item.orderDate : "",
              arrivalDate: typeof item.arrivalDate === "string" ? item.arrivalDate : "",
              priority: item.priority === "alta" || item.priority === "bassa" ? item.priority : "media",
              dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
              notes: typeof item.notes === "string" ? item.notes : "",
              completed: Boolean(item.completed),
            }))
        : [];
      setManualItems(safeItems);
    } catch {
      setManualItems([]);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(manualItems));
    } catch {
      // localStorage can be unavailable or full in some browser modes.
    }
  }, [manualItems, storageKey]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(dismissedStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      setDismissedRowIds(new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []));
    } catch {
      setDismissedRowIds(new Set());
    }
  }, [dismissedStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(dismissedRowIds)));
    } catch {
      // localStorage can be unavailable or full in some browser modes.
    }
  }, [dismissedRowIds, dismissedStorageKey]);

  const supplierNameById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])),
    [warehouses],
  );
  const editingItem = useMemo(
    () => manualItems.find((item) => item.id === editingItemId) ?? null,
    [editingItemId, manualItems],
  );

  const updateManualItem = (id: string, patch: Partial<ManualPurchaseItem>) => {
    if (readOnly) return;
    setManualItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const getPaymentDone = useCallback((item: ManualPurchaseItem) =>
    item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70"
      ? item.depositPaid && item.balancePaid
      : item.paid, []);

  const getPaymentState = useCallback((item: ManualPurchaseItem): PaymentState => {
    if (item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70") {
      if (item.depositPaid && item.balancePaid) return "paid";
      if (item.depositPaid || item.balancePaid) return "partial";
      return "unpaid";
    }
    return item.paid ? "paid" : "unpaid";
  }, []);

  const getPaymentLabel = useCallback((item: ManualPurchaseItem) => {
    if (item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70") {
      if (item.depositPaid && item.balancePaid) return "pagato tutto";
      if (item.depositPaid) return "acconto pagato";
      if (item.balancePaid) return "saldo pagato";
      return "pagamento da fare";
    }
    return item.paid ? "pagato" : "da pagare";
  }, []);

  const getPaymentDetail = useCallback((item: ManualPurchaseItem) => {
    const total = getManualTotal(item);
    if (item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70") {
      const deposit = total * getDepositPercent(item.paymentTerm);
      const balance = total - deposit;
      return `Acconto ${formatCurrency(deposit)} ${item.depositPaid ? "pagato" : "da pagare"} · Saldo ${formatCurrency(balance)} ${item.balancePaid ? "pagato" : "da pagare"}`;
    }
    return item.paid ? `Pagato${item.paidDate ? ` il ${item.paidDate}` : ""}` : "Pagamento non registrato";
  }, []);

  const renderWarehouseArrivalSelect = (
    value: string | null,
    onChange: (warehouseId: string | null) => void,
  ) => (
    <Select value={value ?? "__none__"} onValueChange={(nextValue) => onChange(nextValue === "__none__" ? null : nextValue)}>
      <SelectTrigger>
        <SelectValue placeholder="Seleziona magazzino" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Da decidere</SelectItem>
        {warehouses.map((warehouse) => (
          <SelectItem key={warehouse.id} value={warehouse.id}>
            {warehouse.name}{warehouse.is_default ? " · predefinito" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const productSuggestions = useMemo<ProductSuggestion[]>(() => {
    const suggestions = new Map<string, ProductSuggestion>();

    stockItems.forEach((item) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const key = name.toLowerCase();
      if (!key) return;
      suggestions.set(key, {
        id: `stock-${item.id}`,
        name,
        supplierId: item.supplier_id ?? null,
        quantity: Number(item.quantity ?? 0),
        unitCost: Number(item.unit_cost ?? 0) || null,
        source: "stock",
      });
    });

    manualItems.forEach((item) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const key = name.toLowerCase();
      if (!key || suggestions.has(key)) return;
      suggestions.set(key, {
        id: `manual-${item.id}`,
        name,
        supplierId: item.supplierId,
        quantity: null,
        unitCost: null,
        source: "storico",
      });
    });

    return Array.from(suggestions.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [manualItems, stockItems]);

  const matchingSuggestions = useMemo(() => {
    const normalized = form.name.trim().toLowerCase();
    if (!normalized) return productSuggestions;
    return productSuggestions
      .filter((suggestion) => suggestion.name.toLowerCase().includes(normalized));
  }, [form.name, productSuggestions]);

  const rows = useMemo<PurchaseRow[]>(() => {
    const stockRows = stockItems
      .filter((item) => Number(item.min_stock_level ?? 0) > 0)
      .filter((item) => Number(item.quantity ?? 0) <= Number(item.min_stock_level ?? 0))
      .map((item): PurchaseRow => {
        const currentQty = Number(item.quantity ?? 0);
        const minQty = Number(item.min_stock_level ?? 0);
        const suggestedQty = Math.max(1, minQty - currentQty);
        const unitCost = Number(item.unit_cost ?? 0);
        return {
          id: `stock-${item.id}`,
          source: "stock",
          name: item.name,
          quantity: suggestedQty,
          supplierId: item.supplier_id ?? null,
          warehouseId: item.warehouse_id ?? warehouseFilter ?? null,
          status: "da_ordinare",
          priority: currentQty <= 0 ? "alta" : "media",
          dueDate: null,
          notes: `Giacenza ${currentQty} / soglia ${minQty}`,
          estimatedCost: unitCost > 0 ? unitCost * suggestedQty : null,
          isPaid: false,
          paymentState: "unknown",
          paymentLabel: "pagamento da definire",
          paymentDetail: "Non ancora collegato a un ordine fornitore",
          meta: "riordino per scorta minima",
        };
      });

    const commessaRows = items
      .filter((item) => PURCHASE_STATUSES.includes(item.status as PurchaseStatus))
      .map((item): PurchaseRow => {
        const dueDate = item.order.expected_date ?? item.order.work_start_date ?? null;
        const daysUntil = getDaysUntil(dueDate);
        const quantity = Number(item.quantity ?? 1);
        const unitCost = Number(item.purchase_price ?? 0);
        const customerName = item.order.customer
          ? `${item.order.customer.first_name ?? ""} ${item.order.customer.last_name ?? ""}`.trim()
          : "";
        return {
          id: `commessa-${item.id}`,
          source: "commessa",
          name: item.name,
          quantity,
          supplierId: item.supplier_id,
          warehouseId: item.destination_warehouse_id ?? warehouseFilter ?? null,
          status: PURCHASE_STATUSES.includes(item.status as PurchaseStatus) ? item.status as PurchaseStatus : "da_ordinare",
          priority: daysUntil !== null && daysUntil <= 7 ? "alta" : "media",
          dueDate,
          notes: [item.order.order_code ?? "Commessa", customerName].filter(Boolean).join(" · "),
          estimatedCost: unitCost > 0 ? unitCost * quantity : null,
          isPaid: false,
          paymentState: "unknown",
          paymentLabel: "pagamento da gestire",
          paymentDetail: "Gestito nella commessa/ordine fornitore",
          meta: "fabbisogno collegato a commessa",
          orderItemId: item.id,
          orderCode: item.order.order_code ?? null,
          customerName: customerName || null,
        };
      });

    const manualRows = manualItems
      .map((item): PurchaseRow => {
        const estimatedCost = Number(item.unitCost ?? 0) > 0 ? getManualTotal(item) : null;
        return {
          id: item.id,
          source: "manual",
          name: item.name,
          quantity: Number(item.quantity ?? 1),
          supplierId: item.supplierId ?? null,
          warehouseId: item.warehouseId ?? null,
          status: item.status ?? "da_ordinare",
          priority: item.priority ?? "media",
          dueDate: item.dueDate || null,
          notes: [
            item.notes,
            item.paymentMethod ? `Metodo: ${PAYMENT_METHODS.find((method) => method.value === item.paymentMethod)?.label ?? item.paymentMethod}` : "",
            item.paymentTerm ? `Condizioni: ${PAYMENT_TERMS.find((term) => term.value === item.paymentTerm)?.label ?? item.paymentTerm}` : "",
            item.orderDate ? `Ordinato: ${item.orderDate}` : "",
            item.arrivalDate ? `Arrivo: ${item.arrivalDate}` : "",
            item.expectedPaymentDate ? `Pagamento previsto: ${item.expectedPaymentDate}` : "",
            (item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70") && item.depositExpectedDate ? `Acconto previsto: ${item.depositExpectedDate}` : "",
            (item.paymentTerm === "acconto_saldo" || item.paymentTerm === "30_70") && item.balanceExpectedDate ? `Saldo previsto: ${item.balanceExpectedDate}` : "",
            Number(item.vatRate ?? 0) > 0 ? `IVA ${Number(item.vatRate ?? 0)}%` : "",
          ].filter(Boolean).join(" · "),
          estimatedCost,
          isPaid: getPaymentDone(item),
          paymentState: getPaymentState(item),
          paymentLabel: getPaymentLabel(item),
          paymentDetail: getPaymentDetail(item),
          completed: item.completed,
          meta: "inserito manualmente",
        };
      });

    return [...manualRows, ...stockRows, ...commessaRows].sort((a, b) => {
      const priorityOrder = { alta: 0, media: 1, bassa: 2 };
      const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
    });
  }, [getPaymentDetail, getPaymentDone, getPaymentLabel, getPaymentState, items, manualItems, stockItems, warehouseFilter]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (dismissedRowIds.has(row.id)) return false;
      const matchesSource = sourceFilter === "all" || row.source === sourceFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesPayment = paymentFilter === "all" || row.paymentState === paymentFilter;
      const matchesQuery =
        !normalizedQuery ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.notes.toLowerCase().includes(normalizedQuery) ||
        (row.warehouseId ? warehouseNameById.get(row.warehouseId)?.toLowerCase().includes(normalizedQuery) : false) ||
        (row.supplierId ? supplierNameById.get(row.supplierId)?.toLowerCase().includes(normalizedQuery) : false);
      return matchesSource && matchesStatus && matchesPayment && matchesQuery;
    });
  }, [dismissedRowIds, paymentFilter, query, rows, sourceFilter, statusFilter, supplierNameById, warehouseNameById]);

  const totals = useMemo(() => {
    const urgent = rows.filter((row) => row.priority === "alta").length;
    const estimated = rows.reduce((sum, row) => sum + (row.estimatedCost ?? 0), 0);
    const toPay = rows.reduce((sum, row) => sum + (row.paymentState === "paid" ? 0 : row.estimatedCost ?? 0), 0);
    return {
      total: rows.length,
      urgent,
      stock: rows.filter((row) => row.source === "stock").length,
      ordered: rows.filter((row) => row.status === "ordinato" || row.status === "in_arrivo").length,
      arrived: rows.filter((row) => row.status === "in_magazzino").length,
      estimated,
      toPay,
    };
  }, [rows]);

  useEffect(() => {
    setSelectedRowIds((current) => {
      const visibleIds = new Set(filteredRows.map((row) => row.id));
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredRows]);

  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedRowIds.has(row.id)),
    [filteredRows, selectedRowIds],
  );

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedRowIds.has(row.id));
  const hasPartialSelection = selectedRowIds.size > 0 && !allFilteredSelected;

  const toggleRowSelection = (rowId: string) => {
    if (readOnly) return;
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    if (readOnly) return;
    setSelectedRowIds((current) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(current);
      filteredRows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const updateSelectedRowsStatus = (status: PurchaseStatus) => {
    if (readOnly) return;
    selectedRows.forEach((row) => updateRowStatus(row, status, { openArrival: false }));
    setSelectedRowIds(new Set());
    if (status === "in_magazzino") onRegisterArrival?.();
  };

  const removeSelectedRows = () => {
    if (readOnly) return;
    selectedRows.forEach(removePurchaseRow);
    setSelectedRowIds(new Set());
  };

  const addManualItem = () => {
    if (readOnly) return;
    const name = form.name.trim();
    if (!name) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `manual-${Date.now()}`;
    setManualItems((current) => [
      {
        ...form,
        id,
        name,
        quantity: Math.max(1, Number(form.quantity || 1)),
        unitCost: Math.max(0, Number(form.unitCost || 0)),
        vatRate: VAT_RATE_OPTIONS.includes(Number(form.vatRate)) ? Number(form.vatRate) : 22,
        paidDate: form.paid ? form.paidDate : "",
        depositPaid: form.paymentTerm === "acconto_saldo" || form.paymentTerm === "30_70" ? form.depositPaid : false,
        depositExpectedDate: form.paymentTerm === "acconto_saldo" || form.paymentTerm === "30_70" ? form.depositExpectedDate : "",
        balancePaid: form.paymentTerm === "acconto_saldo" || form.paymentTerm === "30_70" ? form.balancePaid : false,
        balanceExpectedDate: form.paymentTerm === "acconto_saldo" || form.paymentTerm === "30_70" ? form.balanceExpectedDate : "",
        status: form.status,
        warehouseId: form.warehouseId ?? warehouseFilter ?? defaultWarehouse?.id ?? null,
        orderDate: form.status === "da_ordinare" ? "" : form.orderDate || todayIso(),
        arrivalDate: form.status === "in_magazzino" ? form.arrivalDate || todayIso() : form.arrivalDate,
        completed: false,
      },
      ...current,
    ]);
    setForm(createEmptyForm());
    setAddDialogOpen(false);
  };

  const openAddDialog = () => {
    if (readOnly) return;
    setForm({ ...createEmptyForm(), warehouseId: warehouseFilter ?? defaultWarehouse?.id ?? null });
    setCostInputMode("unit");
    setShowProductSuggestions(false);
    setAddDialogOpen(true);
  };

  const openAddDialogFromRow = (row: PurchaseRow) => {
    if (readOnly) return;
    setForm({
      ...createEmptyForm(),
      name: row.name,
      quantity: Math.max(1, Number(row.quantity || 1)),
      supplierId: row.supplierId,
      warehouseId: row.warehouseId ?? warehouseFilter ?? defaultWarehouse?.id ?? null,
      priority: row.priority,
      dueDate: row.dueDate ?? "",
      notes: [row.meta, row.notes].filter(Boolean).join(" · "),
      unitCost: row.estimatedCost ? row.estimatedCost / Math.max(1, Number(row.quantity || 1)) : 0,
    });
    setCostInputMode("unit");
    setShowProductSuggestions(false);
    setAddDialogOpen(true);
  };

  const updateRowStatus = (
    row: PurchaseRow,
    status: PurchaseStatus,
    options: { openArrival?: boolean } = {},
  ) => {
    if (readOnly) return;
    if (row.source === "manual") {
      const currentItem = manualItems.find((item) => item.id === row.id);
      updateManualItem(row.id, {
        status,
        orderDate: status === "da_ordinare" ? "" : currentItem?.orderDate || todayIso(),
        arrivalDate: status === "in_magazzino" ? currentItem?.arrivalDate || todayIso() : currentItem?.arrivalDate ?? "",
        completed: status === "in_magazzino",
      });
      if (status === "in_magazzino" && options.openArrival !== false) onRegisterArrival?.();
      return;
    }
    if (row.source === "commessa" && row.orderItemId) {
      onStatusChange?.(row.orderItemId, status);
      if (status === "in_magazzino" && options.openArrival !== false) onRegisterArrival?.();
    }
  };

  const selectSuggestion = (suggestion: ProductSuggestion) => {
    const supplierPaymentMethod = suggestion.supplierId ? supplierById.get(suggestion.supplierId)?.payment_method : null;
    setForm((current) => ({
      ...current,
      name: suggestion.name,
      supplierId: suggestion.supplierId,
      paymentMethod: supplierPaymentMethod || current.paymentMethod,
      paymentTerm: supplierPaymentMethod ? getDefaultPaymentTerm(supplierPaymentMethod) : current.paymentTerm,
      unitCost: suggestion.unitCost ?? current.unitCost,
      notes: suggestion.source === "stock"
        ? `Giacenza attuale: ${suggestion.quantity ?? 0}${suggestion.unitCost ? ` · costo indicativo ${formatCurrency(suggestion.unitCost)}` : ""}`
        : current.notes,
    }));
    setShowProductSuggestions(false);
  };

  const updateSupplier = (supplierId: string | null) => {
    const supplierPaymentMethod = supplierId ? supplierById.get(supplierId)?.payment_method : null;
    setForm((current) => ({
      ...current,
      supplierId,
      paymentMethod: supplierPaymentMethod || current.paymentMethod,
      paymentTerm: supplierPaymentMethod ? getDefaultPaymentTerm(supplierPaymentMethod) : current.paymentTerm,
    }));
  };

  const completeManualItem = (id: string) => {
    if (readOnly) return;
    setManualItems((current) => current.map((item) => (
      item.id === id
        ? { ...item, status: "in_magazzino", completed: true, arrivalDate: item.arrivalDate || todayIso() }
        : item
    )));
  };

  const removeManualItem = (id: string) => {
    if (readOnly) return;
    setManualItems((current) => current.filter((item) => item.id !== id));
  };

  const removePurchaseRow = (row: PurchaseRow) => {
    if (readOnly) return;
    if (row.source === "manual") {
      removeManualItem(row.id);
      return;
    }
    setDismissedRowIds((current) => {
      const next = new Set(current);
      next.add(row.id);
      return next;
    });
  };

  const formQuantity = Math.max(1, Number(form.quantity || 1));
  const formUnitCost = Math.max(0, Number(form.unitCost || 0));
  const formVatRate = Math.max(0, Number(form.vatRate || 0));
  const formSubtotal = formQuantity * formUnitCost;
  const formVatAmount = formSubtotal * (formVatRate / 100);
  const formTotal = formSubtotal + formVatAmount;
  const paymentTermLabel = PAYMENT_TERMS.find((term) => term.value === form.paymentTerm)?.label ?? "Da definire";
  const depositPercent = form.paymentTerm === "30_70" ? 0.3 : 0.5;
  const balancePercent = 1 - depositPercent;
  const depositAmount = formTotal * depositPercent;
  const balanceAmount = formTotal - depositAmount;

  const getUnitCostFromTotal = (total: number, quantity = formQuantity, vatRate = formVatRate) => {
    const vatFactor = 1 + Math.max(0, Number(vatRate || 0)) / 100;
    return Math.max(0, total / Math.max(1, quantity) / vatFactor);
  };

  const updateQuantity = (quantity: number) => {
    const nextQuantity = Math.max(1, Number(quantity || 1));
    const currentTotal = formTotal;
    setForm((current) => ({
      ...current,
      quantity: nextQuantity,
      unitCost: costInputMode === "total" && currentTotal > 0
        ? getUnitCostFromTotal(currentTotal, nextQuantity, current.vatRate)
        : current.unitCost,
    }));
  };

  const updateUnitCost = (unitCost: number) => {
    setCostInputMode("unit");
    setForm((current) => ({ ...current, unitCost: Math.max(0, Number(unitCost || 0)) }));
  };

  const updateTotalCost = (total: number) => {
    setCostInputMode("total");
    setForm((current) => ({
      ...current,
      unitCost: getUnitCostFromTotal(Number(total || 0), Math.max(1, Number(current.quantity || 1)), current.vatRate),
    }));
  };

  const updateVatRate = (vatRate: number) => {
    const nextVatRate = VAT_RATE_OPTIONS.includes(vatRate) ? vatRate : 22;
    const currentTotal = formTotal;
    setForm((current) => ({
      ...current,
      vatRate: nextVatRate,
      unitCost: costInputMode === "total" && currentTotal > 0
        ? getUnitCostFromTotal(currentTotal, Math.max(1, Number(current.quantity || 1)), nextVatRate)
        : current.unitCost,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-slate-300">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Da acquistare</p>
            <p className="mt-1 text-2xl font-bold">{totals.total}</p>
            <p className="text-xs text-muted-foreground">righe operative</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Urgenti</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{totals.urgent}</p>
            <p className="text-xs text-muted-foreground">lavori vicini o scorta zero</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Importo da acquistare</p>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totals.estimated)}</p>
            <p className="text-xs text-muted-foreground">totale stimato con IVA</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Da pagare</p>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totals.toPay)}</p>
            <p className="text-xs text-muted-foreground">{totals.ordered} ordinati/in arrivo · {totals.arrived} arrivati</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Lista acquisti operativa</p>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Vista consulente: acquisti, fabbisogni e scorte sono consultabili senza azioni operative."
                : "Aggiungi prodotti manuali o usa i suggerimenti da inventario e storico acquisti."}
            </p>
          </div>
          {!readOnly && (
            <Button type="button" onClick={openAddDialog} className="gap-2 sm:w-auto">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              Aggiungi acquisto
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aggiungi prodotto da acquistare</DialogTitle>
            <DialogDescription>
              Cerca tra i materiali già presenti o inserisci un nuovo prodotto per la prossima spesa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="purchase-name">Prodotto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="purchase-name"
                    value={form.name}
                    onClick={() => setShowProductSuggestions(true)}
                    onChange={(event) => {
                      setShowProductSuggestions(true);
                      setForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  className="pl-9"
                  placeholder="Cerca o scrivi un prodotto..."
                />
              </div>

              {!showProductSuggestions ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  {form.name.trim()
                    ? "Prodotto selezionato. Clicca nel campo per cambiare articolo o cercarne un altro."
                    : "Clicca nel campo per aprire l'elenco prodotti, poi cerca o scrivi un nuovo articolo."}
                </div>
              ) : matchingSuggestions.length > 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-1">
                  {matchingSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                      className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-background"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{suggestion.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {suggestion.supplierId ? supplierNameById.get(suggestion.supplierId) ?? "Fornitore salvato" : "Fornitore da decidere"}
                          {suggestion.source === "stock" && suggestion.quantity !== null ? ` · giacenza ${suggestion.quantity}` : ""}
                        </span>
                      </span>
                      <Badge variant="outline">{suggestion.source === "stock" ? "Inventario" : "Storico"}</Badge>
                    </button>
                  ))}
                </div>
              ) : form.name.trim() ? (
                <div className="rounded-md border border-dashed p-3 text-sm">
                  <p className="font-medium">Nuovo prodotto</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nessun articolo trovato. Verrà creata una nuova riga acquisto con questo nome.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Inizia a scrivere oppure scorri l'elenco dei prodotti già usati.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[110px_150px_150px_120px]">
              <div className="space-y-2">
                <Label htmlFor="purchase-qty">Quantità</Label>
                <Input
                  id="purchase-qty"
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(event) => updateQuantity(Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-unit-cost">Costo unitario</Label>
                <Input
                  id="purchase-unit-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={Number(form.unitCost.toFixed(2))}
                  onChange={(event) => updateUnitCost(Number(event.target.value))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-total-cost">Costo totale</Label>
                <Input
                  id="purchase-total-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={Number(formTotal.toFixed(2))}
                  onChange={(event) => updateTotalCost(Number(event.target.value))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>IVA %</Label>
                <Select
                  value={String(form.vatRate)}
                  onValueChange={(value) => updateVatRate(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATE_OPTIONS.map((rate) => (
                      <SelectItem key={rate} value={String(rate)}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_160px]">
              <div className="space-y-2">
                <Label>Fornitore acquisto</Label>
                <Select
                  value={form.supplierId ?? "__none__"}
                  onValueChange={(value) => updateSupplier(value === "__none__" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Fornitore" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Da decidere</SelectItem>
                    {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                          {supplier.payment_method
                            ? ` · ${PAYMENT_METHODS.find((method) => method.value === supplier.payment_method)?.label ?? supplier.payment_method}`
                            : ""}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Magazzino di arrivo</Label>
                {renderWarehouseArrivalSelect(form.warehouseId, (warehouseId) => setForm((current) => ({ ...current, warehouseId })))}
              </div>
              <div className="space-y-2">
                <Label>Priorità</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm((current) => ({ ...current, priority: value as ManualPurchaseItem["priority"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="bassa">Bassa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Stato acquisto</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((current) => ({
                    ...current,
                    status: value as PurchaseStatus,
                    orderDate: value === "da_ordinare" ? "" : current.orderDate || todayIso(),
                    arrivalDate: value === "in_magazzino" ? current.arrivalDate || todayIso() : current.arrivalDate,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURCHASE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_CONFIG[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-order-date">Data ordine</Label>
                <Input
                  id="purchase-order-date"
                  type="date"
                  value={form.orderDate}
                  disabled={form.status === "da_ordinare"}
                  onChange={(event) => setForm((current) => ({ ...current, orderDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-arrival-date">Arrivo previsto/reale</Label>
                <Input
                  id="purchase-arrival-date"
                  type="date"
                  value={form.arrivalDate}
                  onChange={(event) => setForm((current) => ({ ...current, arrivalDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_150px]">
                <div className="space-y-2">
                  <Label>Modalità di pagamento</Label>
                  <Select
                    value={form.paymentMethod ?? "__none__"}
                    onValueChange={(value) => setForm((current) => ({ ...current, paymentMethod: value === "__none__" ? null : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Da definire" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Da definire</SelectItem>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condizioni pagamento</Label>
                  <Select
                    value={form.paymentTerm ?? "consegna"}
                    onValueChange={(value) => setForm((current) => ({
                      ...current,
                      paymentTerm: value,
                      paid: value === "acconto_saldo" || value === "30_70" ? false : current.paid,
                      paidDate: value === "acconto_saldo" || value === "30_70" ? "" : current.paidDate,
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((term) => (
                        <SelectItem key={term.value} value={term.value}>
                          {term.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Totale</p>
                  <p className="mt-1 text-lg font-bold">{formatCurrency(formTotal)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCurrency(formSubtotal)} + IVA {formatCurrency(formVatAmount)}
                  </p>
                </div>
              </div>

              {form.paymentTerm === "acconto_saldo" || form.paymentTerm === "30_70" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Acconto ({Math.round(depositPercent * 100)}%)</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(depositAmount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Pagato</span>
                        <Switch
                          checked={form.depositPaid}
                          onCheckedChange={(checked) => setForm((current) => ({ ...current, depositPaid: checked }))}
                        />
                      </div>
                    </div>
                    <Label htmlFor="purchase-deposit-date" className="mt-3 block text-xs">Data prevista acconto</Label>
                    <Input
                      id="purchase-deposit-date"
                      type="date"
                      value={form.depositExpectedDate}
                      onChange={(event) => setForm((current) => ({ ...current, depositExpectedDate: event.target.value }))}
                      className="mt-1"
                    />
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Saldo ({Math.round(balancePercent * 100)}%)</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(balanceAmount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Pagato</span>
                        <Switch
                          checked={form.balancePaid}
                          onCheckedChange={(checked) => setForm((current) => ({ ...current, balancePaid: checked }))}
                        />
                      </div>
                    </div>
                    <Label htmlFor="purchase-balance-date" className="mt-3 block text-xs">Data prevista saldo</Label>
                    <Input
                      id="purchase-balance-date"
                      type="date"
                      value={form.balanceExpectedDate}
                      onChange={(event) => setForm((current) => ({ ...current, balanceExpectedDate: event.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_1fr] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="purchase-payment-date">Data prevista pagamento</Label>
                    <Input
                      id="purchase-payment-date"
                      type="date"
                      value={form.expectedPaymentDate}
                      onChange={(event) => setForm((current) => ({ ...current, expectedPaymentDate: event.target.value }))}
                    />
                  </div>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border bg-background px-3">
                    <span className="text-sm">Pagato</span>
                    <Switch
                      checked={form.paid}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, paid: checked, paidDate: checked ? current.paidDate : "" }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase-paid-date">Data pagamento</Label>
                    <Input
                      id="purchase-paid-date"
                      type="date"
                      value={form.paidDate}
                      disabled={!form.paid}
                      onChange={(event) => setForm((current) => ({ ...current, paidDate: event.target.value }))}
                    />
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                Piano: {paymentTermLabel}. Il costo totale alimenta il budget stimato della lista acquisti.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="purchase-date">Serve entro</Label>
                <Input
                  id="purchase-date"
                  type="date"
                  min={todayIso()}
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase-notes">Note acquisto</Label>
                <Textarea
                  id="purchase-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Misure, marca preferita, cantiere, urgenze..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annulla
            </Button>
            <Button type="button" onClick={addManualItem} disabled={!form.name.trim()} className="gap-2">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              Aggiungi alla lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItemId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {editingItem && (
            <>
              <DialogHeader>
                <DialogTitle>Gestisci acquisto</DialogTitle>
                <DialogDescription>
                  Aggiorna stato, pagamento e magazzino di arrivo senza perdere la storia della riga.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-semibold">{editingItem.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quantità {editingItem.quantity} · {editingItem.unitCost > 0 ? formatCurrency(editingItem.quantity * editingItem.unitCost * (1 + editingItem.vatRate / 100)) : "costo non inserito"}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Stato acquisto</Label>
                    <Select
                      value={editingItem.status}
                      onValueChange={(value) => updateManualItem(editingItem.id, {
                        status: value as PurchaseStatus,
                        orderDate: value === "da_ordinare" ? "" : editingItem.orderDate || todayIso(),
                        arrivalDate: value === "in_magazzino" ? editingItem.arrivalDate || todayIso() : editingItem.arrivalDate,
                        completed: value === "in_magazzino" ? true : editingItem.completed,
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PURCHASE_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_CONFIG[status].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Magazzino di arrivo</Label>
                    {renderWarehouseArrivalSelect(editingItem.warehouseId, (warehouseId) => updateManualItem(editingItem.id, { warehouseId }))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data ordine</Label>
                    <Input
                      type="date"
                      value={editingItem.orderDate}
                      disabled={editingItem.status === "da_ordinare"}
                      onChange={(event) => updateManualItem(editingItem.id, { orderDate: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Arrivo previsto/reale</Label>
                    <Input
                      type="date"
                      value={editingItem.arrivalDate}
                      onChange={(event) => updateManualItem(editingItem.id, { arrivalDate: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Fornitore</Label>
                    <Select
                      value={editingItem.supplierId ?? "__none__"}
                      onValueChange={(value) => {
                        const supplierId = value === "__none__" ? null : value;
                        const supplierPaymentMethod = supplierId ? supplierById.get(supplierId)?.payment_method : null;
                        updateManualItem(editingItem.id, {
                          supplierId,
                          paymentMethod: supplierPaymentMethod || editingItem.paymentMethod,
                          paymentTerm: supplierPaymentMethod ? getDefaultPaymentTerm(supplierPaymentMethod) : editingItem.paymentTerm,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Da decidere</SelectItem>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Modalità pagamento</Label>
                    <Select
                      value={editingItem.paymentMethod ?? "__none__"}
                      onValueChange={(value) => updateManualItem(editingItem.id, { paymentMethod: value === "__none__" ? null : value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Da definire</SelectItem>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="space-y-2">
                    <Label>Condizioni pagamento</Label>
                    <Select
                      value={editingItem.paymentTerm ?? "consegna"}
                      onValueChange={(value) => updateManualItem(editingItem.id, {
                        paymentTerm: value,
                        paid: value === "acconto_saldo" || value === "30_70" ? false : editingItem.paid,
                        paidDate: value === "acconto_saldo" || value === "30_70" ? "" : editingItem.paidDate,
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map((term) => (
                          <SelectItem key={term.value} value={term.value}>
                            {term.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {editingItem.paymentTerm === "acconto_saldo" || editingItem.paymentTerm === "30_70" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border bg-background p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Acconto</p>
                            <p className="text-xs text-muted-foreground">pagamento iniziale</p>
                          </div>
                          <Switch
                            checked={editingItem.depositPaid}
                            onCheckedChange={(checked) => updateManualItem(editingItem.id, { depositPaid: checked })}
                          />
                        </div>
                        <Input
                          type="date"
                          value={editingItem.depositExpectedDate}
                          onChange={(event) => updateManualItem(editingItem.id, { depositExpectedDate: event.target.value })}
                          className="mt-3"
                        />
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Saldo</p>
                            <p className="text-xs text-muted-foreground">pagamento finale</p>
                          </div>
                          <Switch
                            checked={editingItem.balancePaid}
                            onCheckedChange={(checked) => updateManualItem(editingItem.id, { balancePaid: checked })}
                          />
                        </div>
                        <Input
                          type="date"
                          value={editingItem.balanceExpectedDate}
                          onChange={(event) => updateManualItem(editingItem.id, { balanceExpectedDate: event.target.value })}
                          className="mt-3"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_1fr] sm:items-end">
                      <div className="space-y-2">
                        <Label>Pagamento previsto</Label>
                        <Input
                          type="date"
                          value={editingItem.expectedPaymentDate}
                          onChange={(event) => updateManualItem(editingItem.id, { expectedPaymentDate: event.target.value })}
                        />
                      </div>
                      <div className="flex h-10 items-center justify-between gap-3 rounded-md border bg-background px-3">
                        <span className="text-sm">Pagato</span>
                        <Switch
                          checked={editingItem.paid}
                          onCheckedChange={(checked) => updateManualItem(editingItem.id, { paid: checked, paidDate: checked ? editingItem.paidDate || todayIso() : "" })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data pagamento</Label>
                        <Input
                          type="date"
                          value={editingItem.paidDate}
                          disabled={!editingItem.paid}
                          onChange={(event) => updateManualItem(editingItem.id, { paidDate: event.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {editingItem.status === "in_magazzino" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Merce arrivata: registra il DDT/carico per farla entrare nell'inventario reale.
                  </div>
                )}
              </div>

              <DialogFooter>
                {editingItem.status === "in_magazzino" && (
                  <Button type="button" className="gap-2" onClick={onRegisterArrival}>
                    <Truck className="h-4 w-4" aria-hidden="true" />
                    Registra DDT/carico
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setEditingItemId(null)}>
                  Chiudi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Cerca prodotto, fornitore o commessa..."
          />
        </div>
        <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as typeof sourceFilter)}>
          <SelectTrigger className="w-full lg:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le fonti</SelectItem>
            <SelectItem value="manual">Manuali</SelectItem>
            <SelectItem value="stock">Scorte</SelectItem>
            <SelectItem value="commessa">Commesse</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="w-full lg:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {PURCHASE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_CONFIG[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as typeof paymentFilter)}>
          <SelectTrigger className="w-full lg:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i pagamenti</SelectItem>
            <SelectItem value="unpaid">Da pagare</SelectItem>
            <SelectItem value="partial">Acconto/saldo parz.</SelectItem>
            <SelectItem value="paid">Pagati</SelectItem>
            <SelectItem value="unknown">Da definire</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!readOnly && selectedRowIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-950">
                {selectedRowIds.size} rig{selectedRowIds.size === 1 ? "a" : "he"} selezionat{selectedRowIds.size === 1 ? "a" : "e"}
              </p>
              <p className="text-xs text-blue-800">
                Applica un'azione comune agli acquisti selezionati.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => updateSelectedRowsStatus("ordinato")}>
                Segna ordinato
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => updateSelectedRowsStatus("in_arrivo")}>
                In arrivo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => updateSelectedRowsStatus("in_magazzino")}>
                Arrivato
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRowIds(new Set())}>
                Annulla selezione
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={removeSelectedRows}>
                Elimina
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Nessun prodotto da acquistare</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aggiungi una riga manuale o controlla le soglie minime dell'inventario.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <div
            className={cn(
              "hidden border-b bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xl:grid xl:items-center xl:gap-4",
              readOnly
                ? "xl:grid-cols-[minmax(280px,1.45fr)_118px_80px_150px_220px_210px_145px]"
                : "xl:grid-cols-[36px_minmax(280px,1.45fr)_118px_80px_150px_220px_210px_145px_72px]",
            )}
          >
            {!readOnly && (
              <Checkbox
                checked={allFilteredSelected ? true : hasPartialSelection ? "indeterminate" : false}
                onCheckedChange={toggleAllFiltered}
                aria-label="Seleziona tutti gli acquisti visibili"
              />
            )}
            <span>Articolo</span>
            <span>Stato</span>
            <span>Q.tà</span>
            <span>Importo</span>
            <span>Pagamento</span>
            <span>Fornitore / arrivo</span>
            <span>Entro</span>
            {!readOnly && <span className="text-right">Azioni</span>}
          </div>
          {filteredRows.map((row) => {
            const daysUntil = getDaysUntil(row.dueDate);
            const isOverdue = daysUntil !== null && daysUntil < 0;
            const canEditRow = !readOnly && row.source === "manual";
            const selected = selectedRowIds.has(row.id);
            return (
              <Card key={row.id} className="rounded-none border-0 border-b shadow-none last:border-b-0">
                <CardContent className="p-0">
                  <div
                    role={canEditRow ? "button" : undefined}
                    tabIndex={canEditRow ? 0 : undefined}
                    onClick={() => canEditRow && setEditingItemId(row.id)}
                    onKeyDown={(event) => {
                      if (!canEditRow) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditingItemId(row.id);
                      }
                    }}
                    className={cn(
                      "grid gap-4 border-l-4 border-l-slate-200 p-4 transition-colors hover:border-l-blue-500 hover:bg-slate-50/50 xl:items-center",
                      readOnly
                        ? "xl:grid-cols-[minmax(280px,1.45fr)_118px_80px_150px_220px_210px_145px]"
                        : "xl:grid-cols-[36px_minmax(280px,1.45fr)_118px_80px_150px_220px_210px_145px_72px]",
                      canEditRow && "cursor-pointer",
                      selected && "border-l-blue-600 bg-blue-50/60 hover:bg-blue-50",
                    )}
                  >
                    {!readOnly && (
                      <div className="flex items-center" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleRowSelection(row.id)}
                          aria-label={`Seleziona ${row.name}`}
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold" title={row.name}>
                          {row.name}
                        </p>
                        <Badge variant="outline">{SOURCE_LABELS[row.source]}</Badge>
                        <Badge variant="outline" className={PRIORITY_STYLES[row.priority]}>
                          {row.priority}
                        </Badge>
                        {row.priority === "alta" && <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{row.meta}</p>
                      {row.source === "commessa" && (
                        <p className="mt-1 inline-flex max-w-full items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          <span className="truncate">
                            Commessa collegata: {row.orderCode ?? "senza codice"}
                            {row.customerName ? ` · ${row.customerName}` : ""}
                          </span>
                        </p>
                      )}
                      {row.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.notes}</p>}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Stato</p>
                      {readOnly || row.source === "stock" ? (
                        <Badge variant="outline" className={cn("text-[11px] leading-none", STATUS_BADGE_STYLES[row.status])}>
                          {STATUS_CONFIG[row.status].label}
                        </Badge>
                      ) : (
                        <div onClick={(event) => event.stopPropagation()}>
                          <Select
                            value={row.status}
                            onValueChange={(value) => updateRowStatus(row, value as PurchaseStatus)}
                          >
                            <SelectTrigger className="h-8 w-full min-w-0 border-amber-200 bg-amber-50 px-2 text-[12px] leading-none text-amber-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PURCHASE_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {STATUS_CONFIG[status].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Quantità</p>
                      <p className="text-lg font-semibold tabular-nums">{row.quantity}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Importo</p>
                      <p className="text-base font-bold text-slate-950 tabular-nums">
                        {row.estimatedCost !== null ? formatCurrency(row.estimatedCost) : "Da stimare"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">IVA incl.</p>
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3 xl:bg-transparent xl:p-0 xl:border-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Pagamento</p>
                      <Badge variant="outline" className={PAYMENT_BADGE_STYLES[row.paymentState]}>
                        {row.paymentLabel}
                      </Badge>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.paymentDetail}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Fornitore / arrivo</p>
                      <p className="truncate text-sm font-semibold">
                        {row.supplierId ? supplierNameById.get(row.supplierId) ?? "Fornitore" : "Fornitore da decidere"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.warehouseId ? warehouseNameById.get(row.warehouseId) ?? "Magazzino" : "Magazzino da decidere"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground xl:hidden">Entro</p>
                      <p className={cn("text-sm font-semibold", isOverdue && "text-red-600")}>
                        {row.dueDate
                          ? row.dueDate
                          : "Non definito"}
                      </p>
                      {daysUntil !== null && (
                        <p className={cn("text-xs text-muted-foreground", isOverdue && "text-red-600")}>
                          {isOverdue ? "scaduto" : `${daysUntil} giorni`}
                        </p>
                      )}
                    </div>

                    {!readOnly && (
                      <div className="flex justify-start xl:justify-end" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Azioni per ${row.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Azioni acquisto</DropdownMenuLabel>
                          {row.source === "manual" ? (
                            <>
                              <DropdownMenuItem onClick={() => setEditingItemId(row.id)}>
                                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                                Modifica acquisto
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => completeManualItem(row.id)}>
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Segna arrivato
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => openAddDialogFromRow(row)}>
                              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                              Modifica
                            </DropdownMenuItem>
                          )}
                          {row.status === "in_magazzino" && (
                            <DropdownMenuItem onClick={onRegisterArrival}>
                              <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
                              Registra DDT/carico
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => removePurchaseRow(row)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
