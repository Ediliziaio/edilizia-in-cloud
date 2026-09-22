/**
 * La regola del mittente delle email dell'appuntamento (22/09/2026), pura:
 * nome e indirizzo del calendario valgono solo se il dominio dell'indirizzo è
 * attivo e verificato per l'azienda. Provata in
 * src/test/logic/mittenteCalendario.test.ts; la usa mittenteCalendario.ts.
 */

export interface CalendarioConMittente {
  company_id: string;
  mittente_nome?: string | null;
  mittente_email?: string | null;
}

export interface DominioEmail {
  domain: string;
  is_active?: boolean | null;
  ee_spf_verified?: boolean | null;
  ee_dkim_verified?: boolean | null;
}

const EMAIL_RE = /^[^\s@<>"',;]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

/** «Nome <indirizzo>» se l'indirizzo sta su un dominio verificato dell'azienda; altrimenti null. */
export function mittenteDelCalendario(
  cal: CalendarioConMittente,
  domini: DominioEmail[],
): { from: string; email: string; dominio: string } | null {
  const email = String(cal.mittente_email ?? "").trim().toLowerCase();
  const m = EMAIL_RE.exec(email);
  if (!m) return null;
  const dominio = m[1].toLowerCase();
  const verificato = domini.some((d) =>
    String(d.domain ?? "").trim().toLowerCase() === dominio
    && d.is_active !== false
    && d.ee_spf_verified === true
    && d.ee_dkim_verified === true
  );
  if (!verificato) return null;
  const nome = String(cal.mittente_nome ?? "").replace(/["\\<>]/g, " ").replace(/\s+/g, " ").trim();
  return { from: nome ? `${nome} <${email}>` : email, email, dominio };
}
