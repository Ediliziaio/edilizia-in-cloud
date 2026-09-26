import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "./companyAuth.ts";

/**
 * L'utente può fare questa cosa in questa azienda? Serve alle funzioni che
 * scrivono con la chiave di servizio, dove la RLS non protegge: è la stessa
 * regola delle policy che chiedono aziende_con_permesso.
 *   - il super admin sempre;
 *   - poi l'accesso all'azienda (verifyCompanyAccess: profilo, accesso
 *     multi-azienda attivo e non scaduto, impersonificazione);
 *   - un utente bloccato mai: il suo token vale fino a un'ora dopo il blocco;
 *   - l'amministratore dell'azienda, anche da accesso multi-azienda, o chi ha
 *     almeno uno dei permessi (has_permission_for_company).
 *
 * Fino al 26/09/2026 le funzioni che installano il listino e i pacchetti, che
 * indicizzano il catalogo e che mandano le campagne SMS guardavano solo che
 * l'utente fosse dell'azienda, e contavano anche gli accessi sospesi o scaduti.
 *
 * Se non può, lancia un Error che comincia con «Non autorizzato».
 */
export async function verificaPermessoAzienda(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  permessi: string[],
  cosa: string,
): Promise<void> {
  const { data: ruoli } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if ((ruoli ?? []).some((r: { role: string }) => r.role === "super_admin")) return;

  await verifyCompanyAccess(admin, userId, companyId);

  const { data: profilo } = await admin.from("profiles").select("is_blocked").eq("id", userId).maybeSingle();
  if ((profilo as { is_blocked?: boolean | null } | null)?.is_blocked) {
    throw new Error("Non autorizzato: utente bloccato");
  }

  for (const permesso of permessi) {
    const { data, error } = await admin.rpc("has_permission_for_company", {
      _user_id: userId,
      _permission: permesso,
      _company_id: companyId,
    });
    if (!error && data === true) return;
  }
  throw new Error(`Non autorizzato: serve il permesso per ${cosa}`);
}
