// WhatsApp Locale — risoluzione dei LID.
//
// WhatsApp identifica sempre piu' spesso i contatti con un LID
// (`194360188621035@lid`) invece che col numero (`393483467567@c.us`). I
// messaggi in arrivo portano il LID: senza tradurlo, la risposta di una persona
// finisce in un thread separato da quello in cui le abbiamo scritto noi.
//
// La corrispondenza si scopre dagli invii: quando mandiamo a un numero,
// l'id del messaggio restituito dal gateway e' `true_<LID del destinatario>_<hash>`.
// La registriamo qui e la riusiamo per gli inbound successivi.

/** Cifre pure da un chatId/telefono ("39333...@c.us" → "39333..."). */
export function soloCifre(s: string): string {
  return (s || "").replace(/[^\d]/g, "");
}

/** true se l'identificativo e' un LID e non un numero di telefono. */
export function isLid(id: string): boolean {
  return /@lid$/i.test(id || "");
}

/**
 * Estrae il LID del destinatario dall'id di un messaggio inviato.
 * Formato OpenWA: `true_194360188621035@lid_3EB02E0A...` (o `..._false_...`
 * per gli inbound). Ritorna null se l'id non contiene un LID.
 */
export function lidDaMessageId(providerMsgId: string | null | undefined): string | null {
  if (!providerMsgId) return null;
  const m = String(providerMsgId).match(/([\d]+@lid)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Registra (o aggiorna) la corrispondenza LID → numero. Best-effort: un errore
 * qui non deve mai far fallire un invio o un webhook.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registraLid(
  admin: any,
  lid: string,
  phone: string,
  chatId: string,
  fonte = "outbound",
): Promise<void> {
  if (!lid || !isLid(lid) || !phone) return;
  try {
    await admin.from("openwa_lid_map").upsert(
      { lid: lid.toLowerCase(), phone, chat_id: chatId, fonte, updated_at: new Date().toISOString() },
      { onConflict: "lid" },
    );
  } catch (e) {
    console.warn("[openwaLid] registrazione fallita:", e);
  }
}

/** Numero conosciuto per questo LID, o null se non l'abbiamo mai visto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function risolviLid(admin: any, lid: string): Promise<{ phone: string; chatId: string } | null> {
  if (!lid || !isLid(lid)) return null;
  try {
    const { data } = await admin
      .from("openwa_lid_map")
      .select("phone, chat_id")
      .eq("lid", lid.toLowerCase())
      .maybeSingle();
    if (data?.phone) return { phone: data.phone, chatId: data.chat_id };
  } catch { /* best-effort */ }

  // Ripiego: cerca fra i messaggi gia' inviati uno il cui id contiene questo
  // LID — e' la stessa informazione, solo non ancora estratta nella mappa.
  try {
    const { data } = await admin
      .from("openwa_messages")
      .select("contact_phone, wa_chat_id")
      .eq("direction", "outbound")
      .ilike("provider_msg_id", `%${lid}%`)
      .not("contact_phone", "is", null)
      .limit(1);
    const riga = data?.[0];
    if (riga?.contact_phone) {
      await registraLid(admin, lid, riga.contact_phone, riga.wa_chat_id, "storico");
      return { phone: riga.contact_phone, chatId: riga.wa_chat_id };
    }
  } catch { /* best-effort */ }
  return null;
}

/**
 * Cerca un numero di telefono vero fra i campi che OpenWA puo' allegare al
 * messaggio (il contatto e' spesso completo anche quando `from` e' un LID).
 * Ritorna le sole cifre, o null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function numeroDalPayload(msg: any): string | null {
  const candidati = [
    msg?.sender?.id?._serialized, msg?.sender?.id, msg?.sender?.userid,
    msg?.author, msg?.participant, msg?.chatId?._serialized,
    msg?.sender?.formattedName, msg?.sender?.verifiedName, msg?.senderPhone, msg?.phone,
  ];
  for (const c of candidati) {
    if (typeof c !== "string" || !c) continue;
    if (isLid(c)) continue;
    const d = soloCifre(c);
    // Un numero E.164 sta fra 8 e 15 cifre. I LID ne hanno tipicamente 15+ e
    // comunque sono gia' esclusi sopra; questo filtro scarta id e hash casuali.
    if (d.length >= 8 && d.length <= 15) return d;
  }
  return null;
}
