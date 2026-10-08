import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Explicit sender intent must never silently fall back to another number. */
export async function numeroMittente(admin: SupabaseClient, companyId: string, scelto: unknown): Promise<string | null> {
  if (scelto != null && (typeof scelto !== "string" || !scelto.trim())) throw new Error("Numero mittente non valido.");
  const numeri = () => admin.from("ai_whatsapp_numbers").select("id")
    .eq("company_id", companyId).eq("stato", "active").eq("webhook_verified", true)
    .not("phone_number_id", "is", null).not("access_token_encrypted", "is", null).is("deleted_at", null);
  if (typeof scelto === "string") {
    const { data, error } = await numeri().eq("id", scelto).maybeSingle();
    if (error) throw new Error("Verifica del numero mittente non disponibile. Nessun invio avviato.");
    if (!data?.id) throw new Error("Il numero mittente scelto non è più disponibile. Seleziona un numero attivo.");
    return data.id;
  }
  const { data, error } = await numeri().order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Verifica del numero mittente non disponibile. Nessun invio avviato.");
  // No explicit selection: legacy company configuration is resolved by whatsapp-send.
  return data?.id ?? null;
}
