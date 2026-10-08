import { buildStaffPermissionsRecord } from "./staffPermissionsDefaults.ts";
import { permessiCrmPiattaforma, PIATTAFORMA_COMPANY_ID } from "./callcenterPiattaforma.ts";

/**
 * Fa combaciare l'accesso al CRM della piattaforma con i permessi della persona.
 *  - Marketing completo → CRM + campagne; «CRM e chiamate» → solo contatti, opportunità, calendario.
 *  - Con accesso: profilo sull'azienda Piattaforma + riga staff_permissions (sono quelle che le regole di accesso ai
 *    dati leggono, come per ogni staff).
 *  - Senza accesso: la riga e il legame si tolgono.
 * Idempotente: si può rilanciare a ogni modifica dei permessi.
 */
export async function sincronizzaAccessoCrm(
  supabaseAdmin: any,
  userId: string,
  permessi: { can_manage_marketing?: boolean | null; crm_operatore?: boolean | null },
) {
  const insieme = permessiCrmPiattaforma(permessi);
  if (!insieme) {
    await supabaseAdmin.from("staff_permissions").delete().eq("user_id", userId).eq("company_id", PIATTAFORMA_COMPANY_ID);
    await supabaseAdmin.from("profiles").update({ company_id: null }).eq("id", userId).eq("company_id", PIATTAFORMA_COMPANY_ID);
    return;
  }
  const { error: profiloErr } = await supabaseAdmin
    .from("profiles").update({ company_id: PIATTAFORMA_COMPANY_ID }).eq("id", userId);
  if (profiloErr) throw new Error(`Profilo non legato alla piattaforma: ${profiloErr.message}`);

  const { error: permErr } = await supabaseAdmin
    .from("staff_permissions")
    .upsert(buildStaffPermissionsRecord(userId, PIATTAFORMA_COMPANY_ID, insieme), {
      onConflict: "user_id,company_id",
    });
  if (permErr) throw new Error(`Permessi sul CRM non salvati: ${permErr.message}`);
}
