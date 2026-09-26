/**
 * Riprese dell'outreach (25/09/2026): la ripresa parte dalla stessa casella del
 * primo flusso, il P.S. esce sotto la firma, e chi risponde «più avanti» non
 * finisce fra gli «altro».
 */
import { describe, expect, it } from "vitest";
import { stickyDaStorico } from "../../../supabase/functions/_shared/outreach-dispatch-logic";
import { componiCorpo, inizioPostScriptum } from "../../../supabase/functions/_shared/outreach-uscita";
import { rispostaPiuAvanti } from "../../../supabase/functions/_shared/outreach-intent-parole";

describe("stickyDaStorico", () => {
  const riga = (enrollment_id: string, contact_id: string, brand_id: string) => ({ enrollment_id, contact_id, brand_id });
  const invio = (contact_id: string, brand_id: string, sender_account_id: string, sent_at: string) =>
    ({ contact_id, brand_id, sender_account_id, sent_at });

  it("la ripresa riparte dall'ultima casella che ha scritto a quel contatto per quel brand", () => {
    const m = stickyDaStorico([riga("enr-r1", "c1", "ME")], [
      invio("c1", "ME", "edoardo@me", "2026-09-01T08:00:00Z"),
      invio("c1", "ME", "filippo@me", "2026-09-20T08:00:00Z"),
      invio("c1", "EiC", "francesco@eic", "2026-09-25T08:00:00Z"),
    ]);
    expect(m.get("enr-r1")).toBe("filippo@me");
  });

  it("gli invii di un altro brand non contano, e senza storia non c'è casella fissa", () => {
    const m = stickyDaStorico([riga("enr-a", "c2", "ME"), riga("enr-b", "c3", "ME")], [
      invio("c2", "EiC", "francesco@eic", "2026-09-25T08:00:00Z"),
    ]);
    expect(m.size).toBe(0);
  });

  it("righe o invii senza dati vengono ignorati", () => {
    const m = stickyDaStorico(
      [{ enrollment_id: null, contact_id: "c1", brand_id: "ME" }, riga("enr-ok", "c1", "ME")],
      [{ contact_id: "c1", brand_id: "ME", sender_account_id: null, sent_at: "2026-09-25T08:00:00Z" },
        invio("c1", "ME", "edoardo@me", "2026-09-02T08:00:00Z")],
    );
    expect([...m.entries()]).toEqual([["enr-ok", "edoardo@me"]]);
  });
});

describe("P.S. sotto la firma", () => {
  const corpo = "Buongiorno Marco,<br><br>testo della mail.<br><br>Un saluto<br><br>P.S. Un esempio vero.";
  const firma = "Edoardo Bellini\nMarketing Edile";

  it("la firma va prima del P.S.", () => {
    const { html } = componiCorpo({ corpo, aggiungiUscita: false, firma });
    expect(html).toBe("Buongiorno Marco,<br><br>testo della mail.<br><br>Un saluto<br><br>Edoardo Bellini<br>Marketing Edile<br><br>P.S. Un esempio vero.");
  });

  it("anche la frase d'uscita del motore sta sopra la firma, e il P.S. in fondo", () => {
    const { html } = componiCorpo({ corpo, aggiungiUscita: true, frase: "Rispondi «no» e non ti scrivo più.", firma });
    expect(html.indexOf("non ti scrivo più")).toBeLessThan(html.indexOf("Edoardo Bellini"));
    expect(html.indexOf("Edoardo Bellini")).toBeLessThan(html.indexOf("P.S."));
    expect(html.endsWith("P.S. Un esempio vero.")).toBe(true);
  });

  it("senza P.S. o senza firma non cambia niente", () => {
    expect(componiCorpo({ corpo: "Ciao<br><br>Un saluto", aggiungiUscita: false, firma }).html)
      .toBe("Ciao<br><br>Un saluto<br><br>Edoardo Bellini<br>Marketing Edile");
    expect(componiCorpo({ corpo, aggiungiUscita: false, firma: "" }).html).toBe(corpo);
  });

  it("il controllo dei contenuti vede lo stesso testo di prima", () => {
    const { htmlDaControllare } = componiCorpo({ corpo, aggiungiUscita: false, firma });
    expect(htmlDaControllare).toBe(`${corpo}<br><br>Edoardo Bellini<br>Marketing Edile`);
  });

  it("riconosce solo il P.S. che apre un paragrafo", () => {
    expect(inizioPostScriptum("a<br><br>PS: b")).toBe(1);
    expect(inizioPostScriptum("a<br/><br />P.S. b")).toBe(1);
    expect(inizioPostScriptum("vedi il P.S. qui sotto")).toBe(-1);
    expect(inizioPostScriptum("a<br><br>Posso chiamarti?")).toBe(-1);
  });
});

describe("rispostaPiuAvanti", () => {
  it.each([
    "Più avanti",
    "piu avanti grazie",
    "Non adesso, siamo pieni fino a Natale",
    "Per ora no, magari in primavera",
    "Sentiamoci a gennaio",
    "Ricontattami tra due mesi",
    "Fra qualche mese ne riparliamo volentieri",
  ])("«%s» è un non adesso", (t) => expect(rispostaPiuAvanti(t)).toBe(true));

  it.each([
    "no",
    "Cancellatemi dalla lista",
    "Non ricontattatemi più",
    "Sì, chiamami domani alle 10",
    "Il nostro fornitore va benissimo",
  ])("«%s» non lo è", (t) => expect(rispostaPiuAvanti(t)).toBe(false));

  it("non si fa ingannare dalla nostra email citata sotto la risposta", () => {
    const risposta = "Grazie, va bene così.\n\nIl giorno 25 set 2026 alle 10:08 Edoardo ha scritto:\n> Se adesso non è il momento, scrivimi «più avanti»";
    expect(rispostaPiuAvanti(risposta)).toBe(false);
  });
});
