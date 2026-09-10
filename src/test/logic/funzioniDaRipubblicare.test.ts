import { describe, expect, it } from "vitest";
import { funzioniDaRipubblicare } from "../../../scripts/funzioni-da-ripubblicare.mjs";

/**
 * Quali edge function ripubblicare dopo un push.
 *
 * Il CI guardava solo le cartelle delle funzioni e saltava `_shared/`, perché
 * «non sono funzioni». Ma quel codice finisce dentro il pacchetto di ognuna al
 * momento della pubblicazione: cambiarlo senza toccare anche un file della
 * funzione lasciava in produzione la versione vecchia, con la CI verde.
 *
 * Il 10/09/2026 è costato mezza giornata: la correzione al client IMAP stava
 * tutta in `_shared/imapSmtpClient.ts`. `email-poll-inbox` l'ha presa perché
 * aveva anche un file suo modificato, `email-send` no — così la posta si
 * riceveva e non si riusciva a inviarla, con l'invio che restava appeso per
 * minuti.
 */
describe("Le funzioni da ripubblicare", () => {
  it("una funzione con un file suo modificato", () => {
    expect(funzioniDaRipubblicare(["supabase/functions/email-send/index.ts"]))
      .toEqual(["email-send"]);
  });

  it("cambiando il client IMAP si ripubblica anche chi lo usa per inviare", () => {
    const funzioni = funzioniDaRipubblicare(["supabase/functions/_shared/imapSmtpClient.ts"]);
    expect(funzioni).toContain("email-send");      // il caso di quel giorno
    expect(funzioni).toContain("email-poll-inbox");
    expect(funzioni).toContain("email-imap-test");
  });

  it("segue la catena anche fra librerie", () => {
    // `emailProvider` importa il client con `./imapSmtpClient`, e a sua volta
    // è dentro a mezza piattaforma: se si guardassero solo gli import scritti
    // come `../_shared/…` questa catena resterebbe invisibile.
    const daLibreria = funzioniDaRipubblicare(["supabase/functions/_shared/imapSmtpClient.ts"]);
    const daProvider = funzioniDaRipubblicare(["supabase/functions/_shared/emailProvider.ts"]);
    expect(daProvider.length).toBeGreaterThan(10);
    for (const f of daProvider as string[]) expect(daLibreria).toContain(f);
  });

  it("una libreria di poche funzioni non ne trascina mezzo mondo", () => {
    const funzioni = funzioniDaRipubblicare(["supabase/functions/_shared/appuntamentiPubblici.ts"]);
    expect(funzioni).toContain("public-booking-crea");
    expect(funzioni.length).toBeLessThan(10);
  });

  it("i file fuori da supabase/functions non ripubblicano niente", () => {
    expect(funzioniDaRipubblicare([
      "src/pages/Home.tsx",
      "supabase/migrations/20280914000000_x.sql",
    ])).toEqual([]);
  });

  it("le cartelle di libreria non diventano mai funzioni da pubblicare", () => {
    const funzioni = funzioniDaRipubblicare(["supabase/functions/_shared/imapSmtpClient.ts"]);
    expect(funzioni.some((f) => f.startsWith("_"))).toBe(false);
  });
});
