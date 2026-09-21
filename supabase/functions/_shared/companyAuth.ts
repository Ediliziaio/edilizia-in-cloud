import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aziendaAccessibile } from "./auth.ts";

/**
 * L'utente può operare su questa azienda? Se no, lancia un errore.
 *
 * Azienda del profilo o accesso multi-azienda attivo e non scaduto: la regola
 * è quella di aziendaAccessibile (auth.ts), la stessa di requireCompanyAccess.
 * Fino al 21/09/2026 qui bastava che la riga di multi_company_access
 * esistesse: un accesso sospeso, ancora da accettare o scaduto passava lo
 * stesso, mentre i guardiani del database lo fermavano già.
 */
export async function verifyCompanyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<void> {
  if (await aziendaAccessibile(supabase, userId, companyId)) return;

  // Check active impersonations (super admin)
  const { data: imp } = await supabase
    .from("active_impersonations")
    .select("id")
    .eq("admin_user_id", userId)
    .eq("target_company_id", companyId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (imp) return;

  throw new Error("Non autorizzato: accesso negato a questa azienda");
}
