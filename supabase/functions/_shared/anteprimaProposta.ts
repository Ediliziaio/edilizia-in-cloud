/**
 * L'anteprima della bozza da mostrare nella conferma (28/09/2026).
 *
 * Quando l'agente prepara un'email o un messaggio a un cliente (azione
 * «gialla»), prima di partire chiede conferma: chi approva deve poter LEGGERE
 * cosa sta per uscire, non solo un'etichetta. Qui si tira fuori oggetto e
 * corpo dalla proposta e si formatta per WhatsApp.
 */

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function testo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const CANALE_ETICHETTA: Record<string, string> = {
  email: "email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

/** "" se non c'è nessuna bozza da mostrare; altrimenti un blocco leggibile. */
export function anteprimaBozza(payload: unknown): string {
  const input = record(record(payload)?.input) ?? record(payload) ?? {};
  const oggetto = testo(input.oggetto ?? input.subject);
  const corpo = testo(input.corpo ?? input.messaggio ?? input.testo ?? input.body);
  const canale = testo(input.canale);
  if (!oggetto && !corpo) return "";

  const righe: string[] = [];
  if (canale && CANALE_ETICHETTA[canale]) righe.push(`Via ${CANALE_ETICHETTA[canale]}`);
  if (oggetto) righe.push(`Oggetto: ${oggetto}`);
  if (corpo) righe.push(corpo.length > 900 ? `${corpo.slice(0, 900)}…` : corpo);
  return `\n\n———\n${righe.join("\n")}\n———`;
}
