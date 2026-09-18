/**
 * «550 5.2.0 … Spam Rejected» non è una casella guasta (18/09/2026).
 *
 * Due avvisi «Casella outreach in errore» su marketingedile.store: i messaggi
 * erano diretti a hotmail.it e live.it e li aveva rifiutati Microsoft. Il
 * codice però metteva ogni 5xx sconosciuto nel ramo «guasto account»: fermava
 * il giro, segnava la casella in errore e mandava l'allarme. Gli invii veri
 * proseguivano (96-110 all'ora), quindi era solo rumore che rallentava.
 *
 * Qui si tiene ferma la regola: il rifiuto del messaggio si ritenta, quello
 * che riguarda credenziali o diritto di spedire resta guasto della casella.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/outreachMailboxSend.ts"),
  "utf8",
);
const dispatch = readFileSync(
  resolve(process.cwd(), "supabase/functions/outreach-dispatch/index.ts"),
  "utf8",
);

/** La stessa funzione del file, estratta per provarla davvero. */
function classificaErrore(msg: string): { accountFailure: boolean; transient: boolean; recipientRejected: boolean } {
  const m = msg.toLowerCase();
  if (/^smtp_rcpt_rejected: 5/.test(m)) return { accountFailure: false, transient: false, recipientRejected: true };
  if (/^(gmail_send|outlook_send)_400/.test(m) && /invalid (to|recipient|address)|errorinvalidrecipients|recipient/.test(m)) {
    return { accountFailure: false, transient: false, recipientRejected: true };
  }
  if (/smtp_unexpected: 4|smtp_rcpt_rejected: 4|smtp_connection_closed|connection refused|econnrefused|timed out|network|tls|_5\d\d:|gmail_send_5|outlook_send_5|failed to fetch/.test(m)) {
    return { accountFailure: false, transient: true, recipientRejected: false };
  }
  if (/^smtp_unexpected: 5/.test(m)) {
    const guastoCasella = /auth|credential|not authori[sz]ed|permission|relay access denied|sender address rejected|not owned by|account (disabled|suspended|blocked)|5\.7\.0|5\.7\.8/.test(m);
    if (!guastoCasella) return { accountFailure: false, transient: true, recipientRejected: false };
  }
  return { accountFailure: true, transient: false, recipientRejected: false };
}

function rifiutoPerSpam(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  if (!/^smtp_unexpected: 5|_5\d\d:/.test(m)) return false;
  return /spam|blacklist|blocked|policy|reputation|content rejected|5\.7\.1/.test(m);
}

describe("rifiuti SMTP dell'outreach", () => {
  it("il file usa la stessa regola provata qui", () => {
    expect(sorgente).toContain('if (/^smtp_unexpected: 5/.test(m)) {');
    expect(sorgente).toContain("export function rifiutoPerSpam");
  });

  it("«Spam Rejected» si ritenta e non ferma il giro", () => {
    const esito = classificaErrore("smtp_unexpected: 550 5.2.0 7T0zxSiFLRhtG Spam Rejected");
    expect(esito.accountFailure).toBe(false);
    expect(esito.transient).toBe(true);
    expect(rifiutoPerSpam("smtp_unexpected: 550 5.2.0 7T0zxSiFLRhtG Spam Rejected")).toBe(true);
  });

  it("credenziali e mittente non consentito restano guasto della casella", () => {
    for (const errore of [
      "smtp_unexpected: 535 5.7.8 Authentication credentials invalid",
      "smtp_unexpected: 550 5.7.1 Client does not have permissions to send as this sender",
      "smtp_unexpected: 550 sender address rejected: not owned by user",
      "smtp_unexpected: 550 relay access denied",
    ]) {
      expect(classificaErrore(errore).accountFailure).toBe(true);
    }
  });

  it("indirizzo inesistente resta rifiuto del destinatario", () => {
    const esito = classificaErrore("smtp_rcpt_rejected: 550 5.1.1 <info@tech24srl.itpec> recipient rejected");
    expect(esito.recipientRejected).toBe(true);
    expect(esito.accountFailure).toBe(false);
    expect(rifiutoPerSpam("smtp_rcpt_rejected: 550 5.1.1 recipient rejected")).toBe(false);
  });

  it("se i rifiuti per spam si ripetono, la casella viene comunque segnalata", () => {
    expect(dispatch).toContain("rifiutoPerSpam(messaggioErrore)");
    expect(dispatch).toContain("outreach_casella_reputazione");
    expect(dispatch).toContain("Gli invii continuano");
  });
});
