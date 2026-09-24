import { describe, it, expect } from "vitest";
import {
  vaPerEmail, destinatariDa, testoSenzaCitazione, htmlAvviso,
} from "../../../supabase/functions/_shared/avvisoEmail";

// 16/09/2026: il titolare vuole su Gmail gli avvisi di blocco. Dal 24/09/2026
// le RISPOSTE non più: erano 8-9 al giorno, e le vuole tutte insieme nel
// riepilogo del mattino. Qui la parte pura: cosa va per email e come appare.
describe("avvisoEmail", () => {
  it("vanno per email i blocchi di outreach e WhatsApp, non gli altri avvisi", () => {
    expect(vaPerEmail("outreach_casella_errore")).toBe(true);
    expect(vaPerEmail("outreach_poll_errore")).toBe(true);
    expect(vaPerEmail("whatsapp_numero_bannato")).toBe(true);
    expect(vaPerEmail("whatsapp_numero_disconnesso")).toBe(true);
    // 17/09/2026: anche i lead delle aziende fermi (coda Facebook, collegamento scaduto).
    expect(vaPerEmail("lead_coda_ferma")).toBe(true);
    expect(vaPerEmail("lead_collegamento_scaduto")).toBe(true);
    expect(vaPerEmail("prenotazione_nuova")).toBe(false);
  });

  it("le risposte, una per una, NON vanno per email: restano campanella e push", () => {
    expect(vaPerEmail("outreach_risposta_email")).toBe(false);
    expect(vaPerEmail("whatsapp_risposta")).toBe(false);
    expect(vaPerEmail("whatsapp_optout")).toBe(false);
    // Il riepilogo del mattino invece è proprio un'email.
    expect(vaPerEmail("outreach_riepilogo_giornaliero")).toBe(true);
  });

  it("i destinatari si leggono da lista JSON o da testo, senza doppioni né indirizzi rotti", () => {
    expect(destinatariDa("flo@esempio.it")).toEqual(["flo@esempio.it"]);
    expect(destinatariDa('["Flo@Esempio.it", "altro@esempio.it"]')).toEqual(["flo@esempio.it", "altro@esempio.it"]);
    expect(destinatariDa("a@b.it, a@b.it; non-una-email")).toEqual(["a@b.it"]);
    expect(destinatariDa(["x@y.com"])).toEqual(["x@y.com"]);
    expect(destinatariDa(null)).toEqual([]);
  });

  it("toglie la nostra email citata sotto la risposta e tiene gli a capo", () => {
    const risposta = "Buongiorno,\nmi interessa, chiamatemi domani.\n\nMario\n\nIl giorno mer 16 set 2026 alle 13:18 Filippo ha scritto:\n> Buongiorno,\n> ti scrivo perché…";
    expect(testoSenzaCitazione(risposta)).toBe("Buongiorno,\nmi interessa, chiamatemi domani.\n\nMario");
    expect(testoSenzaCitazione("Ok grazie\n-----Messaggio originale-----\nDa: filippo@marketingedile.blog")).toBe("Ok grazie");
    expect(testoSenzaCitazione("Sì\nOn Wed, Sep 16, 2026 at 1:18 PM Filippo wrote:\n> testo")).toBe("Sì");
  });

  it("l'HTML scappa i caratteri, salta le righe vuote e porta al pannello", () => {
    const html = htmlAvviso({
      titolo: "Risposta email da Rossi <Serramenti>",
      testo: "Mi interessa & chiamatemi",
      righe: [{ etichetta: "Da", valore: "mario@rossi.it" }, { etichetta: "Telefono", valore: "" }],
      url: "/admin/marketing?tab=posta",
    }, "https://app.ediliziaincloud.com/");
    expect(html).toContain("Rossi &lt;Serramenti&gt;");
    expect(html).toContain("Mi interessa &amp; chiamatemi");
    expect(html).toContain("mario@rossi.it");
    expect(html).not.toContain("Telefono");
    expect(html).toContain('href="https://app.ediliziaincloud.com/admin/marketing?tab=posta"');
  });
});
