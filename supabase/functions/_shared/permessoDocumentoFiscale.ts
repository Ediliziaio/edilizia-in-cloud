// Chi può agire su un documento fiscale (09/11/2026). Appartenere all'azienda non basta:
// invio allo SDI e spedizione vogliono il permesso «Fatturazione», come il database.
// Le funzioni girano con la chiave di servizio, dove auth.uid() è vuoto: il controllo si
// fa col token di chi chiama.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function comeUtente(token: string) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

export async function puoGestireDocumento(token: string, companyId: string, tipo: string): Promise<boolean> {
  const { data, error } = await comeUtente(token).rpc("puo_gestire_documento_fiscale", { _company_id: companyId, _tipo: tipo });
  return !error && data === true;
}

/** Leggere (scaricare il PDF) segue le regole di accesso alla riga, commercialista compreso. */
export async function puoLeggereDocumento(token: string, documentoId: string): Promise<boolean> {
  const { data, error } = await comeUtente(token).from("documenti_fiscali").select("id").eq("id", documentoId).maybeSingle();
  return !error && !!data;
}
