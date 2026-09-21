import { supabase } from "@/integrations/supabase/client";
import { buildStaffPermissionsUpdate } from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

/**
 * Salva i permessi di un utente in un'azienda. L'unico punto da cui passano.
 *
 * Prima si faceva un UPDATE sulla riga di staff_permissions: se la riga non
 * c'era, non si salvava niente e la pagina diceva comunque «Permessi salvati».
 * Il 21/09/2026 erano senza riga i 26 venditori di Ener Italia (importati tutti
 * insieme il 12/09) e 13 utenti delle aziende demo: i loro permessi non si
 * potevano cambiare, in silenzio.
 *
 * Qui la riga si crea se manca (la chiave è user_id + company_id) e si pretende
 * che il database la restituisca: un salvataggio che non tocca niente diventa
 * un errore, non un «fatto». Una riga nuova prende dal database anche
 * must_change_password = true, come ogni utente creato dall'app: chi non ha la
 * riga non è mai passato dalla creazione normale.
 */
export async function salvaPermessiUtente(
  userId: string,
  companyId: string,
  permissions: StaffPermissions,
): Promise<void> {
  const { data, error } = await supabase
    .from("staff_permissions")
    .upsert(
      { ...buildStaffPermissionsUpdate(permissions), user_id: userId, company_id: companyId },
      { onConflict: "user_id,company_id" },
    )
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("I permessi non sono stati salvati: il database non ha confermato. Ricarica la pagina e riprova.");
  }
}
