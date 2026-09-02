/**
 * voiceCredits — la soglia sotto cui una chiamata AI non parte, in UN posto.
 *
 * Prima ogni funzione aveva la sua: il webhook inbound rifiutava sotto 0,04 €,
 * l'outbound sotto 0,04 €, il pre-check sotto max(costo/min, 0,10 €). Tre
 * risposte diverse alla stessa domanda. Vale il pre-check: almeno un minuto
 * pagato, cosi' una chiamata non parte con 5 secondi di credito e finisce in
 * negativo prima del "pronto".
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SOGLIA_MINIMA_CHIAMATA_EUR = 0.10;

export interface SaldoVoce {
  spendibile: number;
  bloccato: boolean;
  motivo: string | null;
}

/** Saldo spendibile = ricarica + omaggio del mese (che si azzera ogni mese). */
export async function saldoVoce(admin: SupabaseClient, companyId: string): Promise<SaldoVoce> {
  const { data } = await admin
    .from("ai_credits")
    .select("balance_eur, free_balance_eur, calls_blocked, blocked_reason")
    .eq("company_id", companyId)
    .maybeSingle();
  const spendibile = Number(data?.balance_eur ?? 0) + Number(data?.free_balance_eur ?? 0);
  return {
    spendibile,
    bloccato: !!data?.calls_blocked || spendibile < SOGLIA_MINIMA_CHIAMATA_EUR,
    motivo: data?.calls_blocked ? (data.blocked_reason as string | null) ?? "balance_zero"
      : spendibile < SOGLIA_MINIMA_CHIAMATA_EUR ? "insufficient_balance" : null,
  };
}
