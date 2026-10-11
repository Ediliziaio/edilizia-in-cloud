/** Remove presentation separators, never infer a country or strip extensions. */
export function normalizeVoicePhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const number = value.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

export interface VoiceContact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  optout_call?: boolean | null;
  opt_out?: boolean | null;
  deleted_at?: string | null;
  marketing_consent?: boolean | null;
  ricontatta_dopo?: string | null;
}

/** Marketing campaigns use a stricter guard than an individual service call. */
export function voiceContactExclusion(contact: VoiceContact, marketing = false, now = Date.now()): string | null {
  if (contact.deleted_at) return "Contatto eliminato";
  if (contact.optout_call || contact.opt_out) return "Contatto escluso dalle chiamate";
  if (contact.ricontatta_dopo) {
    const date = Date.parse(contact.ricontatta_dopo);
    if (!Number.isFinite(date)) return "Data di richiamo non valida";
    if (date > now) return "Richiamo rinviato";
  }
  if (!normalizeVoicePhone(contact.phone)) return "Numero non valido: serve il prefisso internazionale";
  if (marketing && contact.marketing_consent !== true) return "Consenso marketing non registrato";
  return null;
}

export function prepareVoiceRecipients(contacts: VoiceContact[], now = Date.now()) {
  const seen = new Set<string>();
  const recipients: { contact_id: string; nome: string; telefono: string }[] = [];
  const excluded: { contact_id: string; reason: string }[] = [];
  for (const contact of [...contacts].sort((a, b) => a.id.localeCompare(b.id))) {
    const reason = voiceContactExclusion(contact, true, now);
    const phone = normalizeVoicePhone(contact.phone);
    if (reason || !phone) { excluded.push({ contact_id: contact.id, reason: reason || "Numero non valido" }); continue; }
    if (seen.has(phone)) { excluded.push({ contact_id: contact.id, reason: "Numero duplicato nella selezione" }); continue; }
    seen.add(phone);
    recipients.push({ contact_id: contact.id, nome: [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim(), telefono: phone });
  }
  return { recipients, excluded };
}
