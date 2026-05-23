import { z } from "zod";

const baseOrderSchema = z.object({
  customer_id: z.string().min(1, "Seleziona un cliente"),
  order_code: z.string().max(50).optional().default(""),
  description: z.string().min(3, "La descrizione deve avere almeno 3 caratteri").max(1000),
  internal_notes: z.string().max(1000).optional().default(""),
  status_id: z.string().optional().default(""),
  salesperson_id: z.string().optional().default(""),
  salesperson_data: z.object({
    commission_type: z.string(),
    commission_value: z.number(),
    compensation_mode: z.string().optional().nullable(),
  }).nullable().default(null),
  assigned_to: z.string().optional().default(""),
  // Dates
  expected_date: z.date().optional(),
  warehouse_arrival_date: z.date().optional(),
  work_start_date: z.date().optional(),
  work_end_date: z.date().optional(),
  // Magazzino destinazione materiali
  destination_warehouse_id: z.string().optional().nullable().default(null),
  // v8.6.42 — Sede operativa dell'ordine (showroom/magazzino/ufficio).
  // Usato per analytics disaggregati per sede in Cruscotto e Marginalità.
  sede_id: z.string().optional().nullable().default(null),
  // Financial
  payment_type: z.enum(["standard", "financing"]).default("standard"),
  total_amount: z.string().default(""),
  vat_rate: z.string().default("22"),
  financing_cost: z.string().optional().default(""),
  has_building_bonus: z.boolean().default(false),
});

export const orderSchema = baseOrderSchema.superRefine((data, ctx) => {
  const total = parseFloat(data.total_amount);
  if (!data.total_amount || isNaN(total)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "L'importo totale deve essere un numero valido",
      path: ["total_amount"],
    });
  } else if (total <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "L'importo totale deve essere maggiore di zero",
      path: ["total_amount"],
    });
  }

  const vat = parseFloat(data.vat_rate);
  if (!data.vat_rate || isNaN(vat) || vat < 0 || vat > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "L'IVA deve essere un valore tra 0 e 100",
      path: ["vat_rate"],
    });
  }

  if (data.financing_cost) {
    const financingCost = parseFloat(data.financing_cost);
    if (isNaN(financingCost) || financingCost < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Il costo finanziaria non può essere negativo",
        path: ["financing_cost"],
      });
    }
  }

  // Cross-validate: work_end_date >= work_start_date
  if (data.work_start_date && data.work_end_date) {
    if (data.work_end_date < data.work_start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La data di fine lavori non può essere precedente a quella di inizio",
        path: ["work_end_date"],
      });
    }
  }
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
  destination_warehouse_id: null,
  sede_id: null,
  payment_type: "standard",
  total_amount: "",
  vat_rate: "22",
  financing_cost: "",
  has_building_bonus: false,
};
