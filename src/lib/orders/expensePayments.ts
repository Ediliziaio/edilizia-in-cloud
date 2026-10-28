import { supabase } from '@/integrations/supabase/client';
// RPC additive: la validazione, i lock e l'idempotenza risiedono nel database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export async function registerExpensePayment(input: {
  costId: string; requestId: string; amount?: number; date: string; method?: string;
  reference?: string; bankId?: string; existingId?: string;
}) {
  const { data, error } = await db.rpc('registra_pagamento_costo', {
    p_costo: input.costId, p_richiesta: input.requestId, p_importo: input.amount ?? null,
    p_data: input.date, p_metodo: input.method ?? 'bonifico', p_riferimento: input.reference ?? null,
    p_banca: input.bankId ?? null, p_esistente: input.existingId ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function reverseExpensePayments(costId: string) {
  const { error } = await db.rpc('storna_pagamenti_costo', { p_costo: costId });
  if (error) throw new Error(error.message);
}
