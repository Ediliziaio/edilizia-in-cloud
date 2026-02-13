export type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

export interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  updated_at?: string | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    warehouse_arrival_date?: string | null;
    company_id: string;
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

export const STATUS_CONFIG: Record<OrderItemStatus, { label: string }> = {
  da_ordinare: { label: "Da Ordinare" },
  ordinato: { label: "Ordinato" },
  in_magazzino: { label: "In Magazzino" },
  installato: { label: "Installato" },
};

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
