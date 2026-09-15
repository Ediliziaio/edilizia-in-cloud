// Add-on WhatsApp Business (Meta): a pagamento, incluso nei piani da 247 €/mese
// in su, sbloccabile a mano dal super admin (decisione di Florin, 15/09/2026).
//
// Chi può usare WhatsApp non lo decide questo file ma il database: la chiave
// "whatsapp" di resolve_company_feature, la stessa che mostra o nasconde l'area
// nell'app. Piano che la include, add-on pagato con Stripe (override
// "addon_stripe:<abbonamento>", scritto da stripe-webhook) e sblocco del super
// admin finiscono tutti lì. Qui c'è solo la domanda, fatta allo stesso modo da
// ogni edge function che collega un numero o manda un messaggio.

// Tipo strutturale: le edge function importano minor diversi di supabase-js.
// deno-lint-ignore no-explicit-any
type ClientConRpc = { rpc: (fn: string, args?: Record<string, unknown>) => any };

/** Platform Admin CRM: i numeri della piattaforma (notifiche, outreach) non passano dall'add-on. */
const AZIENDA_PIATTAFORMA = "00000000-0000-0000-0000-000000000001";

/** Demo Azienda 1 e 2, vetrine interne: stessi id di requirePaymentMethod.ts. */
const AZIENDE_DEMO = new Set([
  "778a2c76-1253-49f2-a5e8-283363ac3e29",
  "d2000000-0000-4000-a000-000000000002",
]);

/** Codice che il client riconosce (src/lib/creditoEsaurito.ts) per aprire l'offerta dell'add-on. */
export const CODICE_ADDON_WHATSAPP = "whatsapp_addon_required";

export const MESSAGGIO_ADDON_WHATSAPP =
  "WhatsApp Business non è attivo per questa azienda: va attivato l'add-on WhatsApp.";

export interface OpzioniAddonWhatsApp {
  /**
   * Se il database non risponde. "blocca" dove chi aspetta può riprovare
   * (collegare un numero); "consenti" negli invii, dove un intoppo di un
   * secondo non deve far perdere un messaggio già dovuto.
   */
  seNonVerificabile: "blocca" | "consenti";
}

export async function addonWhatsAppAttivo(
  client: ClientConRpc,
  companyId: string | null | undefined,
  { seNonVerificabile }: OpzioniAddonWhatsApp,
): Promise<boolean> {
  if (!companyId) return false;
  if (companyId === AZIENDA_PIATTAFORMA || AZIENDE_DEMO.has(companyId)) return true;
  try {
    const { data, error } = await client.rpc("resolve_company_feature", {
      p_company_id: companyId,
      p_feature_key: "whatsapp",
    });
    if (error) throw error;
    const riga = Array.isArray(data) ? data[0] : data;
    return riga?.is_enabled === true;
  } catch (err) {
    console.error(`[wa-addon] verifica non riuscita per ${companyId}:`, (err as Error)?.message ?? err);
    return seNonVerificabile === "consenti";
  }
}

/** La risposta 402 che il client trasforma nell'offerta dell'add-on. */
export function rispostaAddonWhatsApp(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: MESSAGGIO_ADDON_WHATSAPP, code: CODICE_ADDON_WHATSAPP }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/** Per le funzioni che rispondono a un utente: `null` se si procede, altrimenti la risposta 402. */
export async function cancelloAddonWhatsApp(
  client: ClientConRpc,
  companyId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (await addonWhatsAppAttivo(client, companyId, { seNonVerificabile: "blocca" })) return null;
  return rispostaAddonWhatsApp(corsHeaders);
}
