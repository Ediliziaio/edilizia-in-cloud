import { supabase } from "@/integrations/supabase/client";
import { jsonPayload } from "@/lib/jsonPayload";
import { withClientTimeout } from "@/lib/query-timeout";

type TabellaSessione = "render_facciata_sessions" | "render_persiane_sessions" | "render_pavimento_sessions" | "render_stanza_sessions" | "render_tetto_sessions";

/** La generazione può partire solo dopo un salvataggio effettivo nella propria azienda. */
export async function salvaConfigurazioneSessione(input: {
  tabella: TabellaSessione;
  sessionId: string;
  companyId: string;
  config: unknown;
  analisiPavimento?: unknown;
}): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  try {
    if (!input.sessionId || !input.companyId) throw new Error("Sessione o azienda mancante");
    const payload = {
      config: jsonPayload(input.config), status: "pending", result_urls: null as null, error_message: null as null,
    };
    // Il campo analisi appartiene solo alle sessioni pavimento.
    const update = input.tabella === "render_pavimento_sessions"
      ? supabase.from("render_pavimento_sessions").update({
          ...payload,
          ...(input.analisiPavimento != null ? { analisi_pavimento: jsonPayload(input.analisiPavimento) } : {}),
        })
      : supabase.from(input.tabella).update(payload);
    const { data, error } = await withClientTimeout(
      update.eq("id", input.sessionId).eq("company_id", input.companyId).select("id").single(),
      "Salvataggio configurazione render", 15000,
    );
    if (error || !data?.id) throw error ?? new Error("Nessuna sessione aggiornata");
    return { ok: true };
  } catch {
    return { ok: false, messaggio: "Non è stato possibile salvare la configurazione. Il render non è stato avviato. Riprova." };
  }
}
