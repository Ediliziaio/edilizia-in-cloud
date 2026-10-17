import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

// Snapshots contain database rows: optional SQL fields can be null.
// Validate their shape without coercing quantities, prices or historical totals.
const snapshotSchema = z.looseObject({
  quote: z.looseObject({
    quote_number: z.string().nullish(),
    title: z.string().nullish(),
    status: z.string().nullish(),
    subtotal: z.number().nullish(),
    discount_percent: z.number().nullish(),
    discount_amount: z.number().nullish(),
    vat_amount: z.number().nullish(),
    total: z.number().nullish(),
    notes: z.string().nullish(),
  }),
  items: z.array(z.looseObject({
    id: z.string().optional(),
    name: z.string(),
    description: z.string().nullish(),
    quantity: z.number().nullable(),
    unit_of_measure: z.string().nullish(),
    unit_price: z.number().nullable(),
    discount_percent: z.number().nullish(),
    vat_rate: z.number().nullable(),
    line_total: z.number().nullish(),
    sort_order: z.number().nullish(),
  })),
  saved_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
});

export type VersionSnapshot = z.infer<typeof snapshotSchema>;

export function parseQuoteVersionSnapshot(value: Json): VersionSnapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error("La versione del preventivo contiene dati non leggibili.");
  return result.data;
}
