import { describe, it, expect } from "vitest";
import {
  normalizzaModelloPdf,
  modelloPdfStandard,
  TIPI_MODELLI_PDF,
} from "@/lib/modelliPdf/catalogo";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { documentoEsempio } from "@/lib/modelliPdf/anteprima";
const azienda = { id: "a", name: "Azienda prova" };
describe("Modelli PDF operativi", () => {
  it("offre uno standard indipendente per i sette tipi", () => {
    for (const tipo of TIPI_MODELLI_PDF) {
      expect(normalizzaModelloPdf(tipo, null)).toEqual(
        modelloPdfStandard(tipo),
      );
    }
    expect(JSON.stringify(normalizzaModelloPdf("materiali", {}))).toBe(
      JSON.stringify(modelloPdfStandard("materiali")),
    );
    const uno = modelloPdfStandard("materiali");
    uno.titolo = "Altro";
    expect(modelloPdfStandard("materiali").titolo).toBe("");
  });
  it("normalizza dati non validi senza introdurre font o opzioni arbitrarie", () => {
    const r = normalizzaModelloPdf("richiesta", {
      carattere: "javascript",
      colore: "red",
      mostraLogo: "false",
      titolo: "X".repeat(500),
      introduzione: { html: "x" },
      nome: "  ",
    });
    expect(r.carattere).toBe("helvetica");
    expect(r.colore).toBe("");
    expect(r.mostraLogo).toBe(true);
    expect(r.titolo).toHaveLength(70);
    expect(r.introduzione).toBe("");
    expect(r.nome).toBeTruthy();
  });
  it("il PDF reale usa titolo, testi, carattere e dicitura personalizzati", () => {
    const m = {
      ...modelloPdfStandard("materiali"),
      titolo: "ORDINE PERSONALIZZATO",
      introduzione: "Introduzione salvata",
      conclusione: "Conclusione salvata",
      condizioni: "Condizioni aziendali",
      carattere: "times" as const,
      etichettaFirma: "Firma per conferma",
    };
    const p = creaPdfOperativo(
      documentoEsempio("materiali"),
      azienda,
      undefined,
      m,
    ).output();
    for (const v of [
      m.titolo,
      m.introduzione,
      m.conclusione,
      m.condizioni,
      m.etichettaFirma,
    ])
      expect(p).toContain(v);
    expect(p).toContain("Times-Roman");
  });
  it("le condizioni della singola commessa prevalgono, la dicitura dei prezzi da confermare rimane", () => {
    const m = {
      ...modelloPdfStandard("materiali"),
      condizioni: "Default azienda",
    };
    const d = {
      ...documentoEsempio("materiali"),
      prezziDaConfermare: true,
      condizioni: "Specifiche ordine",
    };
    const p = creaPdfOperativo(d, azienda, undefined, m).output();
    expect(p).toContain("Specifiche ordine");
    expect(p).not.toContain("Default azienda");
    expect(p).toContain("Prezzi da confermare dal fornitore");
  });
  it("rimuove lo spazio per la firma solo quando richiesto", () => {
    const m = { ...modelloPdfStandard("materiali"), mostraFirma: false };
    expect(
      creaPdfOperativo(
        documentoEsempio("materiali"),
        azienda,
        undefined,
        m,
      ).output(),
    ).not.toContain("Per accettazione");
  });
});

it.each([
  "materiali",
  "richiesta",
  "servizi",
  "trasporti",
  "economia",
] as const)("%s usa il modello del proprio tipo", (tipo) => {
  const m = {
    ...modelloPdfStandard(tipo),
    titolo: `MODELLO ${tipo.toUpperCase()}`,
    introduzione: `INTRO ${tipo}`,
    conclusione: `FINE ${tipo}`,
  };
  const p = creaPdfOperativo(
    documentoEsempio(tipo),
    azienda,
    undefined,
    m,
  ).output();
  expect(p).toContain(m.titolo);
  expect(p).toContain(m.introduzione);
  expect(p).toContain(m.conclusione);
});

describe("Impaginazione personalizzata", () => {
  it("ignora misure fuori intervallo e conserva i valori standard dei modelli precedenti", () => {
    const m = normalizzaModelloPdf("materiali", {
      margine: -1,
      dimensioneTesto: 999,
      scalaLogo: Infinity,
      numerazione: "false",
      coloreRiquadri: "red",
      notaPagina: "X".repeat(300),
    });
    expect(m).toMatchObject({
      margine: 0,
      dimensioneTesto: 0,
      scalaLogo: 100,
      numerazione: true,
      coloreRiquadri: "",
    });
    expect(m.notaPagina).toHaveLength(100);
  });
  it.each([10, 14, 18])(
    "genera tutti i documenti con margini %s, testi grandi e nota su ogni pagina",
    (margine) => {
      for (const tipo of [
        "materiali",
        "richiesta",
        "servizi",
        "trasporti",
        "economia",
      ] as const) {
        const d = documentoEsempio(tipo);
        d.righe = Array.from({ length: 35 }, (_, i) => ({
          ...d.righe[i % 2],
          descrizione: `Articolo nuovo ${i + 1} con descrizione estesa per verifica di impaginazione`,
        }));
        const m = {
          ...modelloPdfStandard(tipo),
          margine,
          dimensioneTesto: 10,
          righeAlternate: true,
          coloreRiquadri: "#eef3f8",
          notaPagina: "NOTA AZIENDALE DI PROVA",
          numerazione: false,
        };
        const pdf = creaPdfOperativo(d, azienda, undefined, m);
        expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
        const output = pdf.output();
        expect(output.match(/NOTA AZIENDALE DI PROVA/g)).toHaveLength(
          pdf.getNumberOfPages(),
        );
        expect(output).not.toContain("Pagina 1 di");
        if (tipo !== "trasporti") expect(output).toContain("Articolo nuovo 35");
        else expect(output).toContain("Magazzino principale");
      }
    },
  );
});
