/**
 * Il POS da stampare segue il modello del DI 9/9/2014: una bozza lo dice in
 * testa con le voci mancanti, il testo dell'utente non diventa HTML, le firme
 * dell'impresa affidataria e del CSE compaiono solo quando servono, i DPI
 * forniti si raccolgono dalle schede delle lavorazioni.
 */
import { describe, expect, it } from "vitest";
import { costruisciHtmlPos } from "@/lib/sicurezza/posHtml";
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";

const base = (fn?: (p: PosContenuto) => void) => {
  const p = posVuoto();
  p.impresa.ragione_sociale = "Demo Azienda S.r.l.";
  p.opera.cantiere = { via: "Via Mazzini 14", localita: "Como", provincia: "CO" };
  fn?.(p);
  return p;
};

describe("POS stampabile", () => {
  it("una bozza porta l'avviso e l'elenco delle voci mancanti", () => {
    const html = costruisciHtmlPos({ contenuto: base(), stato: "bozza", revisione: 0, revisioni: [] });
    expect(html).toContain("BOZZA — non vale come POS approvato");
    expect(html).toContain("Nominativo del datore di lavoro");
    expect(html).toContain("PIANO OPERATIVO DI SICUREZZA");
    expect(html).toContain("D.I. 9 settembre 2014, Allegato I");
  });

  it("un POS approvato non ha l'avviso e ricorda chi l'ha approvato", () => {
    const html = costruisciHtmlPos({
      contenuto: base(), stato: "approvato", revisione: 1,
      revisioni: [{ rev: 0, data: "2026-09-01", descrizione: "Prima emissione" }, { rev: 1, data: "2026-09-20", descrizione: "Lavori in quota" }],
      approvatoDa: "Mario Rossi", approvatoIl: "2026-09-21T10:00:00Z",
    });
    expect(html).not.toContain("BOZZA");
    expect(html).toContain("Lavori in quota");
    expect(html).toContain("20/09/2026");
    expect(html).toContain("Approvato nell'app da Mario Rossi il 21/09/2026");
  });

  it("il testo scritto dall'utente non diventa HTML", () => {
    const html = costruisciHtmlPos({ contenuto: base((p) => { p.opera.descrizione_attivita = "<script>alert(1)</script> & co"; }), stato: "bozza", revisione: 0, revisioni: [] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
  });

  it("firme dell'affidataria solo in subappalto, del CSE solo con il PSC", () => {
    const semplice = costruisciHtmlPos({ contenuto: base(), stato: "bozza", revisione: 0, revisioni: [] });
    expect(semplice).not.toContain("per congruenza del presente documento");
    expect(semplice).not.toContain("Il CSE, se presente");
    const completo = costruisciHtmlPos({
      contenuto: base((p) => {
        p.impresa.ruolo = "esecutrice_subappalto";
        p.impresa.subappalto_a = "Grande Impresa S.p.A.";
        p.procedure_psc.psc_presente = true;
      }),
      stato: "bozza", revisione: 0, revisioni: [],
    });
    expect(completo).toContain("per congruenza del presente documento rispetto al proprio POS");
    expect(completo).toContain("Il CSE, se presente, per verifica di coerenza con il PSC");
    expect(completo).toContain("&#9746; Impresa esecutrice in subappalto a: Grande Impresa S.p.A.");
  });

  it("le lavorazioni hanno la loro scheda e i DPI finiscono nell'elenco della lettera i)", () => {
    const html = costruisciHtmlPos({
      contenuto: base((p) => {
        p.lavorazioni = [
          { ...lavorazioneVuota("a"), titolo: "Montaggio ponteggio", dpi: "Elmetto EN 397\nImbracatura EN 361" },
          { ...lavorazioneVuota("b"), titolo: "Posa pannelli", dpi: "- Elmetto EN 397; Guanti EN 388" },
        ];
      }),
      stato: "bozza", revisione: 0, revisioni: [],
    });
    expect(html).toContain("Montaggio ponteggio");
    expect(html).toContain("Posa pannelli");
    const elenco = html.slice(html.indexOf("Elenco dei dispositivi di protezione individuale"));
    expect(elenco.match(/<li>Elmetto EN 397<\/li>/g)).toHaveLength(1);
    expect(elenco).toContain("<li>Imbracatura EN 361</li>");
    expect(elenco).toContain("<li>Guanti EN 388</li>");
  });
});
