import { describe, expect, it } from "vitest";
import { citazionePrecedente } from "../../../supabase/functions/_shared/outreach-threading";

// Una versione minima di htmlToPlainText: paragrafi a capo, tag via, entità sciolte.
const testoDa = (h: string) => h
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();

/**
 * Il follow-up cita il messaggio precedente, come fa chi preme «Rispondi».
 * Un follow-up nudo, senza il messaggio a cui risponde, è una delle cose che
 * distinguono un mailer da una persona — e al destinatario toglie il contesto.
 */
describe("citazionePrecedente", () => {
  const prev = {
    messageId: "<a@b.it>", subject: "Serramenti", body: "<p>Buongiorno,</p><p>le scrivo per…</p>",
    sentAt: "2026-09-10T07:12:00Z", fromName: "Filippo", fromEmail: "filippo@thermodmr.it",
  };

  it("nel testo: riga «ha scritto:» e ogni riga con «> » davanti", () => {
    const c = citazionePrecedente(prev, testoDa);
    expect(c.testo).toContain("Filippo <filippo@thermodmr.it> ha scritto:");
    expect(c.testo).toContain("> Buongiorno,");
    expect(c.testo).toContain("> le scrivo per…");
    expect(c.testo).toMatch(/Il giorno .*2026 alle ore 09:12/); // ora di Roma
  });

  it("nell'HTML: un blockquote, con il testo protetto", () => {
    const c = citazionePrecedente({ ...prev, body: "<p>a &lt; b</p>" }, testoDa);
    expect(c.html).toContain("<blockquote");
    expect(c.html).toContain("a &lt; b");
  });

  it("senza un precedente, o senza testo, non aggiunge niente", () => {
    expect(citazionePrecedente(null, testoDa)).toEqual({ testo: "", html: "" });
    expect(citazionePrecedente({ ...prev, body: "   " }, testoDa)).toEqual({ testo: "", html: "" });
  });

  it("se manca la data, resta almeno chi ha scritto", () => {
    const c = citazionePrecedente({ ...prev, sentAt: null }, testoDa);
    expect(c.testo).toContain("Filippo <filippo@thermodmr.it> ha scritto:");
    expect(c.testo).not.toContain("Il giorno");
  });
});
