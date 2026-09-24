/**
 * Gli avvisi di sicurezza di Supabase passano da auth-email-hook (24/09/2026).
 *
 * Il hook non li conosceva e li trattava come un recupero password: in 30 giorni
 * 38 persone, appena cambiata la password, hanno ricevuto «Hai chiesto una nuova
 * password» con un pulsante che non portava da nessuna parte. Un avviso dice
 * solo cosa è successo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { avvisoPer, corpoAvviso } from "../../../supabase/functions/_shared/avvisiSicurezza";

const TIPI = [
  "password_changed_notification",
  "email_changed_notification",
  "phone_changed_notification",
  "identity_linked_notification",
  "identity_unlinked_notification",
  "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
];

describe("avvisi di sicurezza", () => {
  it("la password cambiata si annuncia come tale, non come un reset", () => {
    const a = avvisoPer("password_changed_notification");
    expect(a?.oggetto).toBe("La password del tuo account è cambiata");
    expect(a?.corpo).not.toMatch(/nuova password|reimposta/i);
  });

  it("ogni avviso di Supabase ha il suo testo, e uno nuovo prende quello generico", () => {
    const oggetti = TIPI.map((t) => avvisoPer(t)?.oggetto);
    expect(new Set(oggetti).size).toBe(TIPI.length);
    expect(avvisoPer("qualcosa_di_nuovo_notification")?.oggetto).toBe("Una modifica al tuo account");
  });

  it("le email di accesso restano quelle di prima", () => {
    for (const t of ["recovery", "signup", "invite", "magiclink", "email_change", "reauthentication"]) {
      expect(avvisoPer(t), t).toBeNull();
    }
  });

  it("il corpo non ha pulsanti né link d'accesso, solo a chi scrivere", () => {
    const html = corpoAvviso(avvisoPer("password_changed_notification")!, "393501780908");
    expect(html).toContain("Password cambiata");
    expect(html.match(/href="/g)).toHaveLength(1);
    expect(html).toContain('href="https://wa.me/393501780908"');
    expect(html).not.toContain("/auth/v1/verify");
  });
});

describe("il hook usa gli avvisi", () => {
  const hook = readFileSync(resolve(process.cwd(), "supabase/functions/auth-email-hook/index.ts"), "utf8");

  it("oggetto e corpo vengono dall'avviso quando c'è", () => {
    expect(hook).toContain("const avviso = avvisoPer(azione);");
    expect(hook).toContain("subject: `${(avviso ?? testi).oggetto} — Edilizia in Cloud`");
    expect(hook).toContain("html: avviso ? corpoAvviso(avviso, SUPPORT_WHATSAPP) : corpoHtml(testi, link, email_data.token)");
  });

  it("l'avviso di email cambiata va al vecchio indirizzo", () => {
    expect(hook).toContain('azione === "email_changed_notification"');
    expect(hook).toContain("(email_data.old_email || user.email)");
  });
});
