/**
 * L'SMS singolo (scheda cliente, invio rapido dai contatti) via Telnyx.
 *
 * telnyx-send-sms non funzionava dalla nascita: leggeva dal portafoglio colonne
 * che non esistono (crediti_disponibili, saldo_bloccato), quindi i crediti
 * risultavano sempre 0 e rispondeva sempre «Crediti SMS insufficienti»; leggeva
 * una chiave telnyx_api_key inesistente; scriveva `note` invece di `descrizione`
 * nelle transazioni, e passava a sms_messages valori fuori dai CHECK
 * (trigger_entity «contact»). In produzione non è mai partito un SMS.
 *
 * Ordine: credito → registro (queued) → Telnyx → addebito atomico. Se Telnyx
 * rifiuta, il messaggio resta «failed» e NON si addebita nulla. Chiave di
 * piattaforma (TELNYX_MASTER_API_KEY), come le campagne.
 */
import { risolviTelnyx } from "./telnyxApiKey.ts";

const ENTITA_AMMESSE = ["preventivo", "cantiere", "fattura", "intervento", "documento"];
const TIPI_AMMESSI = ["manual", "automation", "api"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** I valori di tracciamento che il registro dei messaggi accetta (CHECK sulla tabella); il resto diventa null. */
export function valoriTracciamento(tipo: unknown, entita: unknown, rif: unknown) {
  return {
    trigger_type: TIPI_AMMESSI.includes(String(tipo)) ? String(tipo) : "manual",
    trigger_entity: ENTITA_AMMESSE.includes(String(entita)) ? String(entita) : null,
    trigger_ref: typeof rif === "string" && UUID.test(rif) ? rif : null,
  };
}

export interface EsitoSmsSingolo {
  ok: boolean;
  status: number;
  error?: string;
  message_id?: string;
  telnyx_id?: string | null;
}

// deno-lint-ignore no-explicit-any
export async function inviaSmsSingolo(admin: any, p: {
  companyId: string;
  userId?: string | null;
  to: string;
  body: string;
  trigger_type?: unknown;
  trigger_entity?: unknown;
  trigger_ref?: unknown;
}): Promise<EsitoSmsSingolo> {
  const { data: prezzoRiga } = await admin.from("sms_pricing_config").select("prezzo_per_sms").limit(1).maybeSingle();
  const costo = Number(prezzoRiga?.prezzo_per_sms ?? 0.06);

  const { data: wallet } = await admin.from("sms_wallet").select("crediti, crediti_riservati").eq("company_id", p.companyId).maybeSingle();
  const disponibili = Number(wallet?.crediti ?? 0) - Number(wallet?.crediti_riservati ?? 0);
  if (!wallet || disponibili < costo) {
    return { ok: false, status: 402, error: "Crediti SMS insufficienti. Ricarica il wallet per continuare." };
  }

  const apiKey = (Deno.env.get("TELNYX_MASTER_API_KEY") ?? "").trim() || (await risolviTelnyx(admin))?.apiKey || "";
  if (!apiKey) return { ok: false, status: 500, error: "Chiave API Telnyx non configurata" };
  const profilo = (Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") ?? "").trim() || (await risolviTelnyx(admin))?.messagingProfileId || null;

  // Mittente: il numero dedicato dell'azienda se ce l'ha; altrimenti il suo nome (alfanumerico, max 11).
  const { data: numero } = await admin.from("sms_telnyx_numbers").select("numero_e164, messaging_profile_id").eq("company_id", p.companyId).eq("stato", "attivo").maybeSingle();
  let mittente: string;
  if (numero?.numero_e164) {
    mittente = numero.numero_e164;
  } else {
    const { data: az } = await admin.from("companies").select("name, business_name").eq("id", p.companyId).maybeSingle();
    mittente = String(az?.business_name || az?.name || "EdiliziaEiC").replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "EdiliziaEiC";
  }
  const profiloInvio = numero?.messaging_profile_id && !String(numero.messaging_profile_id).startsWith("mock_") ? numero.messaging_profile_id : profilo;

  const { data: riga, error: errRiga } = await admin.from("sms_messages").insert({
    company_id: p.companyId, direction: "outbound", status: "queued", to_number: p.to, from_number: mittente, body: p.body,
    created_by: p.userId ?? null, ...valoriTracciamento(p.trigger_type, p.trigger_entity, p.trigger_ref),
  }).select("id").single();
  if (errRiga || !riga) return { ok: false, status: 500, error: "Errore salvataggio messaggio" };

  let res: Response;
  try {
    res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mittente, to: p.to, text: p.body, type: "SMS", ...(profiloInvio ? { messaging_profile_id: profiloInvio } : {}) }),
    });
  } catch (e) {
    await admin.from("sms_messages").update({ status: "failed", error_message: `Rete: ${e instanceof Error ? e.message : e}`.slice(0, 500) }).eq("id", riga.id);
    return { ok: false, status: 502, error: "Errore invio SMS tramite Telnyx" };
  }
  if (!res.ok) {
    const errore = (await res.text().catch(() => "")).slice(0, 500);
    await admin.from("sms_messages").update({ status: "failed", error_message: `Telnyx ${res.status}: ${errore}` }).eq("id", riga.id);
    return { ok: false, status: 502, error: "Errore invio SMS tramite Telnyx" };
  }

  const dati = await res.json().catch(() => ({})) as { data?: { id?: string } };
  const telnyxId = dati?.data?.id ?? null;
  await admin.from("sms_messages").update({ status: "sending", telnyx_id: telnyxId, sent_at: new Date().toISOString() }).eq("id", riga.id);

  // Addebito atomico: se nel frattempo il saldo è sceso l'SMS è già partito, si segnala e basta.
  const { data: addebito } = await admin.rpc("addebita_sms_wallet", {
    p_company_id: p.companyId, p_importo: costo, p_tipo: "addebito_sms",
    p_descrizione: `SMS a ${p.to}`, p_riferimento_id: riga.id,
  });
  const esito = Array.isArray(addebito) ? addebito[0] : addebito;
  if (esito && esito.ok === false) console.warn("SMS inviato ma non addebitato:", esito.motivo);

  return { ok: true, status: 200, message_id: riga.id as string, telnyx_id: telnyxId };
}
