import { supabase } from '@/integrations/supabase/client';
// RPC additive: la validazione, i lock e l'idempotenza risiedono nel database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
/** Importi con centesimi, anche nel formato italiano 1.234,56. */
export function importoPagamento(testo: string): number | null {
  let s = testo.trim().replace(/\s/g, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isSafeInteger(Math.round(n * 100)) ? n : null;
}
export async function registerExpensePayment(input: {
  costId: string; requestId: string; amount?: number; date: string; method?: string;
  reference?: string; bankId?: string; existingId?: string;
  account?: { bankAccountId: string | null; liquidityAccountId: string | null };
}) {
  if (input.account) {
    const { data, error } = await db.rpc('registra_pagamento_costo_con_conto', {
      p_costo: input.costId, p_richiesta: input.requestId, p_importo: input.amount ?? null,
      p_data: input.date, p_metodo: input.method ?? 'bonifico', p_riferimento: input.reference ?? null,
      p_conto_banca: input.account.bankAccountId, p_conto_liquidita: input.account.liquidityAccountId,
    });
    if (error) throw new Error(error.message);
    return data;
  }
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
