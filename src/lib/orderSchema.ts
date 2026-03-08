import { z } from "zod";
import type { PaymentType } from "@/components/orders/FinancialSummary";

export const orderSchema = z.object({
  customer_id: z.string().min(1, "Seleziona un cliente"),
  order_code: z.string().max(50).optional().default(""),
  description: z.string().min(3, "La descrizione deve avere almeno 3 caratteri").max(1000),
  internal_notes: z.string().max(1000).optional().default(""),
  status_id: z.string().optional().default(""),
  salesperson_id: z.string().optional().default(""),
  salesperson_data: z.object({
    commission_type: z.string(),
    commission_value: z.number(),
  }).nullable().default(null),
  assigned_to: z.string().optional().default(""),
  // Dates
  expected_date: z.date().optional(),
  warehouse_arrival_date: z.date().optional(),
  work_start_date: z.date().optional(),
  work_end_date: z.date().optional(),
  // Financial
  payment_type: z.enum(["standard", "financing"]).default("standard"),
  total_amount: z.string().default(""),
  vat_rate: z.string().default("22"),
  financing_cost: z.string().optional().default(""),
  has_building_bonus: z.boolean().default(false),
});

export type OrderFormValues = z.infer<typeof orderSchema>;

export const orderDefaultValues: OrderFormValues = {
  customer_id: "",
  order_code: "",
  description: "",
  internal_notes: "",
  status_id: "",
  salesperson_id: "",
  salesperson_data: null,
  assigned_to: "",
  expected_date: undefined,
  warehouse_arrival_date: undefined,
  work_start_date: undefined,
  work_end_date: undefined,
  payment_type: "standard",
  total_amount: "",
  vat_rate: "22",
  financing_cost: "",
  has_building_bonus: false,
};
