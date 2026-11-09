// Chi può agire su un documento fiscale (09/11/2026). Appartenere all'azienda non basta:
// invio allo SDI e spedizione vogliono il permesso «Fatturazione», come il database.
// Le funzioni girano con la chiave di servizio, dove auth.uid() è vuoto: il controllo si
// fa col token di chi chiama.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// x-azienda-scheda: l'azienda scelta in questa scheda vale anche per il controllo.
function comeUtente(token: string, aziendaScheda?: string | null) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}`, ...(aziendaScheda ? { "x-azienda-scheda": aziendaScheda } : {}) } },
    auth: { persistSession: false },
  });
}

export async function puoGestireDocumento(token: string, companyId: string, tipo: string, aziendaScheda?: string | null): Promise<boolean> {
  const { data, error } = await comeUtente(token, aziendaScheda).rpc("puo_gestire_documento_fiscale", { _company_id: companyId, _tipo: tipo });
  return !error && data === true;
}

/** Leggere (scaricare il PDF) segue le regole di accesso alla riga, commercialista compreso. */
export async function puoLeggereDocumento(token: string, documentoId: string, aziendaScheda?: string | null): Promise<boolean> {
  const { data, error } = await comeUtente(token, aziendaScheda).from("documenti_fiscali").select("id").eq("id", documentoId).maybeSingle();
  return !error && !!data;
}

/** Caricare una fattura ricevuta: anche da commessa, con costi, commesse o fornitori. */
export async function puoCaricareFatturaRicevuta(token: string, companyId: string, aziendaScheda?: string | null): Promise<boolean> {
  const { data, error } = await comeUtente(token, aziendaScheda).rpc("puo_caricare_fattura_ricevuta", { _company_id: companyId });
  return !error && data === true;
}
