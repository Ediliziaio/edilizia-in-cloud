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
