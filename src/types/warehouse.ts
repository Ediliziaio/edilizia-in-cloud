import { differenceInDays } from "date-fns";
import { Package, ShoppingCart, Truck, CheckCircle2 } from "lucide-react";

export type OrderItemStatus = "da_ordinare" | "ordinato" | "in_arrivo" | "in_magazzino" | "prenotato" | "installato";

export interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  notes: string | null;
  updated_at?: string | null;
  section_id?: string | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    warehouse_arrival_date?: string | null;
    company_id: string;
    current_status_id: string | null;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

export interface OrderWithItems {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string | null;
  items: WarehouseItem[];
}

export const STATUS_CONFIG: Record<OrderItemStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Package;
}> = {
  da_ordinare: {
    label: "Da Ordinare",
    color: "text-amber-600",
    bgColor: "bg-amber-50/50 dark:bg-amber-950/20",
    icon: ShoppingCart,
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-600",
    bgColor: "bg-blue-50/50 dark:bg-blue-950/20",
    icon: Truck,
  },
  in_arrivo: {
    label: "In Arrivo",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50/50 dark:bg-indigo-950/20",
    icon: Truck,
  },
  in_magazzino: {
    label: "In Magazzino",
    color: "text-green-600",
    bgColor: "bg-green-50/50 dark:bg-green-950/20",
    icon: Package,
  },
  prenotato: {
    label: "Prenotato",
    color: "text-purple-600",
    bgColor: "bg-purple-50/50 dark:bg-purple-950/20",
    icon: Package,
  },
  installato: {
    label: "Installato",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
    icon: CheckCircle2,
  },
};

export const COST_CATEGORIES = ["Materiali", "Magazzino", "Attrezzature", "Consumabili", "Altro"];

// --- Urgency utilities ---

/** Returns days until posa (expected_date or work_start_date), or null if no date */
export function getDaysUntilPosa(item: WarehouseItem): number | null {
  const expectedDate = item.order.expected_date || item.order.work_start_date;
  if (!expectedDate) return null;
  return differenceInDays(new Date(expectedDate), new Date());
}

/** True if item is urgent: posa <= 7 days away and status is not ready */
export function isItemUrgent(item: WarehouseItem): boolean {
  if (item.status === "in_magazzino" || item.status === "installato") return false;
  const daysUntil = getDaysUntilPosa(item);
  if (daysUntil === null) return false;
  return daysUntil <= 7 && daysUntil >= 0;
}

/** True if item is critical: posa <= 3 days away and status is not ready */
export function isItemCritical(item: WarehouseItem): boolean {
  if (item.status === "in_magazzino" || item.status === "installato") return false;
  const daysUntil = getDaysUntilPosa(item);
  if (daysUntil === null) return false;
  return daysUntil <= 3 && daysUntil >= 0;
}

/** Returns urgency label: "OGGI", "Domani", or "{n}g" */
export function getUrgencyLabel(daysUntil: number): string {
  if (daysUntil === 0) return "OGGI";
  if (daysUntil === 1) return "Domani";
  return `${daysUntil}g`;
}

/** True if item is overdue: posa date is in the past and status is not ready */
export function isItemOverdue(item: WarehouseItem): boolean {
  if (item.status === "in_magazzino" || item.status === "installato") return false;
  const daysUntil = getDaysUntilPosa(item);
  if (daysUntil === null) return false;
  return daysUntil < 0;
}

// Stock types
export interface StockItem {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_cost: number;
  vat_rate: number | null;
  supplier_id: string | null;
  section_id: string | null;
  min_stock_level: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  stock_item_id: string;
  order_item_id: string | null;
  movement_type: "carico" | "scarico";
  quantity: number;
  notes: string | null;
  performed_by: string;
  created_at: string;
}
