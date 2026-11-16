import { describe, it, expect } from "vitest";
import {
  modelloPdfStandard,
  normalizzaModelloPdf,
} from "@/lib/modelliPdf/catalogo";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { documentoEsempio } from "@/lib/modelliPdf/anteprima";
import {
  applicaModelloAlDocumento,
  clausoleDocumento,
  clausoleStandard,
  condizioniDocumento,
} from "@/lib/documentiOperativi/modello";

const azienda = { id: "a", name: "Azienda prova" };
/** L'ordine come lo manda Vulcano: senza prezzi, in attesa della conferma del fornitore. */
const ordineSenzaPrezzi = () => ({
  ...documentoEsempio("materiali"),
  prezziDaConfermare: true,
  numero: "26132",
  commessa: "25000073",
});

describe("Clausole dell'ordine d'acquisto (16/11/2026)", () => {
  it("di serie stampa tutte le clausole, come prima", () => {
    const c = condizioniDocumento(ordineSenzaPrezzi());
    expect(c).toContain("Prezzi da confermare dal fornitore");
    expect(c).toContain("Confermateci data di consegna");
    expect(c).toContain("Riportate «Ordine 26132 - Commessa 25000073» su DDT e fattura");
    expect(c).toContain("Avvisateci almeno il giorno prima dello scarico");
  });
  it("una clausola spenta sparisce dalle condizioni", () => {
    const d = applicaModelloAlDocumento(ordineSenzaPrezzi(), {
      clausole: { conferma: { attiva: false }, preavviso: { attiva: false } },
    });
    const c = condizioniDocumento(d);
    expect(c).not.toContain("Confermateci data di consegna");
    expect(c).not.toContain("Avvisateci almeno");
    expect(c).toContain("Riportate «Ordine 26132");
  });
  it("si può spegnere anche la dicitura sui prezzi da confermare", () => {
    const d = applicaModelloAlDocumento(ordineSenzaPrezzi(), {
      clausole: { prezzi: { attiva: false } },
    });
    expect(condizioniDocumento(d)).not.toContain("Prezzi da confermare");
    // Con i prezzi concordati la dicitura non c'era comunque.
    expect(clausoleDocumento({ ...ordineSenzaPrezzi(), prezziDaConfermare: false }).map((c) => c.id)).not.toContain("prezzi");
  });
  it("il testo riscritto sostituisce lo standard e compila i segnaposto", () => {
    const d = applicaModelloAlDocumento(ordineSenzaPrezzi(), {
      clausole: { riferimento: { testo: "Riportate «Ordine {riferimento}» su DDT e fattura." } },
    });
    const c = condizioniDocumento(d);
    expect(c).toContain("Riportate «Ordine 26132 - Commessa 25000073» su DDT e fattura.");
    expect(c).not.toContain("così li abbiniamo subito all'ordine");
  });
  it("le condizioni scritte sul documento battono le clausole; quelle del modello le sostituiscono", () => {
    const conModello = applicaModelloAlDocumento(ordineSenzaPrezzi(), {
      condizioni: "Testo unico aziendale",
      clausole: { conferma: { attiva: false } },
    });
    expect(condizioniDocumento(conModello)).toContain("Testo unico aziendale");
    expect(condizioniDocumento(conModello)).not.toContain("Riportate");
    const conDocumento = applicaModelloAlDocumento(
      { ...ordineSenzaPrezzi(), condizioni: "Solo per questo ordine" },
      { condizioni: "Testo unico aziendale" },
    );
    expect(condizioniDocumento(conDocumento)).toContain("Solo per questo ordine");
    expect(condizioniDocumento(conDocumento)).not.toContain("Testo unico aziendale");
  });
  it("il PDF toglie le clausole spente e il riquadro «Da indicare nella vostra conferma»", () => {
    const m = {
      ...modelloPdfStandard("materiali"),
      mostraDaIndicare: false,
      clausole: {
        prezzi: { attiva: false },
        conferma: { attiva: false },
        preavviso: { attiva: false },
        riferimento: { testo: "Riportate «Ordine {riferimento}» su DDT e fattura." },
      },
    };
    const p = creaPdfOperativo(ordineSenzaPrezzi(), azienda, undefined, m).output();
    expect(p).not.toContain("Tempi di consegna");
    expect(p).not.toContain("Trasporto e scarico");
    expect(p).not.toContain("Prezzi da confermare");
    expect(p).not.toContain("Confermateci data di consegna");
    expect(p).not.toContain("Avvisateci almeno");
    expect(p).toContain("su DDT e fattura.");
    expect(p).toContain("PER UNA CONSEGNA SENZA INTOPPI");
  });
  it("senza nessuna clausola attiva sparisce anche il titolo della sezione", () => {
    const m = {
      ...modelloPdfStandard("materiali"),
      clausole: Object.fromEntries(
        clausoleStandard("materiali").map((c) => [c.id, { attiva: false }]),
      ),
    };
    const p = creaPdfOperativo(ordineSenzaPrezzi(), azienda, undefined, m).output();
    expect(p).not.toContain("PER UNA CONSEGNA SENZA INTOPPI");
  });
  it("il riquadro resta acceso di serie, anche sui modelli salvati prima", () => {
    expect(normalizzaModelloPdf("materiali", { titolo: "X" }).mostraDaIndicare).toBe(true);
    expect(normalizzaModelloPdf("materiali", { titolo: "X" }).clausole).toEqual({});
    const p = creaPdfOperativo(ordineSenzaPrezzi(), azienda, undefined, modelloPdfStandard("materiali")).output();
    expect(p).toContain("Tempi di consegna");
  });
  it("scarta le clausole scritte male senza toccare il resto", () => {
    const r = normalizzaModelloPdf("materiali", {
      clausole: {
        conferma: { attiva: false },
        "NOME SBAGLIATO": { attiva: false },
        riferimento: { attiva: "no", testo: 12 },
        preavviso: "spenta",
        vuota: {},
        lunga: { testo: "X".repeat(900) },
      },
      mostraDaIndicare: "forse",
    });
    expect(r.clausole).toEqual({ conferma: { attiva: false }, lunga: { testo: "X".repeat(600) } });
    expect(r.mostraDaIndicare).toBe(true);
  });
  it("ogni tipo di documento ha le sue clausole, con identificativi unici", () => {
    for (const tipo of ["richiesta", "materiali", "servizi", "trasporti", "economia"] as const) {
      const ids = clausoleStandard(tipo).map((c) => c.id);
      expect(ids.length).toBe(new Set(ids).size);
      expect(ids.length).toBeGreaterThan(0);
    }
  });
});
