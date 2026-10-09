/** Le stesse credenziali e gli stessi stati valgono per tutte le fasi della firma. */
export const STATI_FIRMA_APERTA = ["pending", "sent", "viewed", "otp_verified"];

export function variantiTokenFirma(token: unknown): string[] {
  if (typeof token !== "string") return [];
  const pulito = token.trim();
  return /^[A-Za-z0-9-]{8,80}$/.test(pulito) ? [...new Set([pulito, pulito.replace(/-/g, "")])] : [];
}

export function erroreStatoFirma(r: { status: string; expires_at: string | null }, ora = Date.now()): { status: number; error: string } | null {
  if (r.status === "signed") return { status: 409, error: "Documento già firmato" };
  if (!STATI_FIRMA_APERTA.includes(r.status)) return { status: 410, error: "Questo link di firma non è più utilizzabile: è scaduto, annullato o rifiutato." };
  const scadenza = r.expires_at ? Date.parse(r.expires_at) : NaN;
  if (!Number.isFinite(scadenza) || scadenza <= ora) return { status: 410, error: "Link di firma scaduto" };
  return null;
}

/** Sei cifre generate crittograficamente, senza bias del modulo. */
export function nuovoCodiceFirma(): string {
  const limite = Math.floor(0x100000000 / 900000) * 900000;
  const n = new Uint32Array(1);
  do { crypto.getRandomValues(n); } while (n[0] >= limite);
  return String(100000 + n[0] % 900000);
}
