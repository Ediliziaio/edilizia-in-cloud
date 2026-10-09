/**
 * L'SMS col codice di firma. Si manda IN PIÙ dell'email, mai al posto: se non
 * parte per qualunque motivo la firma prosegue con l'email e non si rompe niente.
 *
 * Paga l'azienda col suo portafoglio SMS (sms_pricing_config.prezzo_per_sms,
 * 0,06 € di partenza). Senza portafoglio o senza credito non si manda.
 *
 * Perché non telnyx-send-sms (che dal 05/10/2026 funziona, via _shared/smsSingolo.ts):
 * chiede un utente autenticato, e qui chiama il server per un firmatario che non ha
 * un account; e scrive nel registro dei messaggi il testo spedito, mentre il codice
 * nel registro non deve restare. Si usa la stessa chiave di piattaforma
 * (TELNYX_MASTER_API_KEY) e la stessa funzione atomica di addebito (addebita_sms_wallet).
 *
 * Il testo sta nell'alfabeto GSM-7 (le lettere accentate italiane ci sono: «è»; il nome
 * dell'azienda invece si riduce ad ASCII): un solo segmento da 160 caratteri.
 */
import { risolviTelnyx } from "./telnyxApiKey.ts";

export interface EsitoSmsFirma {
  inviato: boolean;
  motivo?: string;
}

/**
 * SMS di codice al massimo per richiesta di firma. Il link dura giorni: il tetto
 * tiene limitato il costo per l'azienda (il portafoglio SMS) e il numero di messaggi
 * al firmatario. Conta ogni tentativo registrato, anche quello che il provider ha rifiutato: i
 * tentativi sono limitati, non solo gli addebiti. Oltre il tetto resta l'email.
 */
export const MAX_SMS_PER_RICHIESTA = 5;
export const MOTIVO_TETTO_SMS = "tetto SMS per richiesta raggiunto";

// deno-lint-ignore no-explicit-any
async function smsDellaRichiesta(admin: any, companyId: string, richiestaId: string): Promise<number> {
  const { count, error } = await admin
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("trigger_entity", "documento")
    .eq("trigger_ref", richiestaId);
  if (error) throw new Error(`conteggio SMS non riuscito: ${error.message}`);
  return count ?? 0;
}

export function testoSmsCodice(otp: string, azienda: string): string {
  const nome = azienda.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .&'-]/g, "").trim().slice(0, 40).trim();
  // «S.r.l.» finisce già con un punto: non se ne aggiunge un secondo. Senza nome: «dell'azienda».
  const di = nome ? `di ${nome}${nome.endsWith(".") ? "" : "."}` : "dell'azienda.";
  return `${otp} è il tuo codice per firmare il documento ${di} Valido 10 minuti. Non condividerlo.`;
}

// deno-lint-ignore no-explicit-any
export async function inviaSmsCodiceFirma(admin: any, p: {
  companyId: string;
  richiestaId: string;
  to: string;
  otp: string;
  aziendaNome: string;
}): Promise<EsitoSmsFirma> {
  try {
    if ((await smsDellaRichiesta(admin, p.companyId, p.richiestaId)) >= MAX_SMS_PER_RICHIESTA) return { inviato: false, motivo: MOTIVO_TETTO_SMS };

    const { data: prezzoRiga } = await admin.from("sms_pricing_config").select("prezzo_per_sms").limit(1).maybeSingle();
    const costo = Number(prezzoRiga?.prezzo_per_sms ?? 0.06);
    const { data: wallet } = await admin.from("sms_wallet").select("crediti, crediti_riservati").eq("company_id", p.companyId).maybeSingle();
    const disponibili = Number(wallet?.crediti ?? 0) - Number(wallet?.crediti_riservati ?? 0);
    if (!wallet || disponibili < costo) return { inviato: false, motivo: "credito SMS insufficiente" };

    const apiKey = (Deno.env.get("TELNYX_MASTER_API_KEY") ?? "").trim() || (await risolviTelnyx(admin))?.apiKey || "";
    if (!apiKey) return { inviato: false, motivo: "provider SMS non configurato" };
    const profilo = (Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") ?? "").trim() || (await risolviTelnyx(admin))?.messagingProfileId || null;

    // Mittente: il numero dedicato dell'azienda, se ce l'ha; altrimenti il suo nome (max 11 caratteri).
    let mittente = "";
    const { data: numero } = await admin.from("sms_telnyx_numbers").select("numero_e164").eq("company_id", p.companyId).eq("stato", "attivo").maybeSingle();
    if (numero?.numero_e164) mittente = numero.numero_e164;
    else mittente = p.aziendaNome.replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "EdiliziaEiC";

    const testo = testoSmsCodice(p.otp, p.aziendaNome);
    // Il codice NON si scrive nel registro dei messaggi: resta nel messaggio inviato e basta.
    const { data: riga } = await admin.from("sms_messages").insert({
      company_id: p.companyId, direction: "outbound", status: "queued", to_number: p.to, from_number: mittente,
      body: testo.replace(p.otp, "******"), trigger_type: "api", trigger_entity: "documento", trigger_ref: p.richiestaId,
    }).select("id").single();
    // Senza la riga nel registro l'SMS sfuggirebbe al tetto: non parte.
    if (!riga?.id) return { inviato: false, motivo: "registro SMS non scritto" };

    // Il posto si prende PRIMA (la riga qui sopra) e si ricontrolla DOPO: con molte chiamate nello
    // stesso istante, chi arriva oltre il tetto lo vede qui e non spedisce. La riga resta, segnata
    // «failed», e continua a contare.
    if ((await smsDellaRichiesta(admin, p.companyId, p.richiestaId)) > MAX_SMS_PER_RICHIESTA) {
      await admin.from("sms_messages").update({ status: "failed", error_message: "Tetto SMS per richiesta raggiunto" }).eq("id", riga.id);
      return { inviato: false, motivo: MOTIVO_TETTO_SMS };
    }

    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mittente, to: p.to, text: testo, type: "SMS", ...(profilo ? { messaging_profile_id: profilo } : {}) }),
    });
    if (!res.ok) {
      const errore = (await res.text().catch(() => "")).slice(0, 300);
      if (riga?.id) await admin.from("sms_messages").update({ status: "failed", error_message: `Telnyx ${res.status}: ${errore}` }).eq("id", riga.id);
      return { inviato: false, motivo: `Telnyx ${res.status}` };
    }
    const dati = await res.json().catch(() => ({})) as { data?: { id?: string } };
    if (riga?.id) await admin.from("sms_messages").update({ status: "sending", telnyx_id: dati?.data?.id ?? null, sent_at: new Date().toISOString() }).eq("id", riga.id);

    // Addebito atomico. Se il saldo è cambiato nel frattempo l'SMS è già partito: si registra e basta.
    const { data: addebito } = await admin.rpc("addebita_sms_wallet", {
      p_company_id: p.companyId, p_importo: costo, p_tipo: "addebito_sms",
      p_descrizione: "SMS codice di firma", p_riferimento_id: riga?.id ?? null,
    });
    const esito = Array.isArray(addebito) ? addebito[0] : addebito;
    if (esito && esito.ok === false) console.warn("SMS firma inviato ma non addebitato:", esito.motivo);
    return { inviato: true };
  } catch (e) {
    console.error("inviaSmsCodiceFirma:", e instanceof Error ? e.message : e);
    return { inviato: false, motivo: "errore" };
  }
}
