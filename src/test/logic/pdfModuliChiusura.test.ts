/**
 * PDF degli otto moduli di preventivo: la chiusura non promette nulla a nome
 * dell'azienda, la validità viene dal template e il testo sopra i riquadri del
 * colore aziendale si legge anche con un colore chiaro.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fraseValiditaChiusura, giorniDiValidita, testoValiditaCondizioni,
} from "@/lib/preventivi/validitaOfferta";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const PDF_MODULI = [
  "src/components/bagni/BagniPDF.tsx",
  "src/components/climatizzazione/ClimatizzazionePDF.tsx",
  "src/components/elettrico/ElettricoPDF.tsx",
  "src/components/pavimenti/PavimentiPDF.tsx",
  "src/components/piscine/PiscinePDF.tsx",
  "src/components/ristrutturazione/RistrutturazionePDF.tsx",
  "src/components/tetti/TettiPDF.tsx",
  "src/components/termoidraulico/TermoidraulicoPDF.tsx",
];

describe("validità dell'offerta", () => {
  it("il testo libero del template vince, senza doppioni", () => {
    expect(fraseValiditaChiusura("Offerta valida 15 giorni.", 30)).toBe("Offerta valida 15 giorni.");
    expect(fraseValiditaChiusura("fino al 31 ottobre", 30)).toBe("Questo preventivo è valido fino al 31 ottobre.");
    expect(testoValiditaCondizioni("Valida fino a fine mese", 30)).toBe("Valida fino a fine mese");
  });

  it("senza testo contano i giorni del template", () => {
    expect(fraseValiditaChiusura(null, 45)).toBe("Questo preventivo è valido 45 giorni dalla data di emissione.");
    expect(fraseValiditaChiusura("  ", 1)).toBe("Questo preventivo è valido 1 giorno dalla data di emissione.");
    expect(testoValiditaCondizioni(null, 60)).toBe(
      "Preventivo valido 60 giorni dalla data di emissione, salvo diversa indicazione scritta.",
    );
  });

  it("senza giorni validi non inventa un numero", () => {
    for (const giorni of [null, undefined, 0, -5, "abc"]) {
      expect(fraseValiditaChiusura(null, giorni)).not.toMatch(/\d/);
      expect(testoValiditaCondizioni("", giorni)).not.toMatch(/\d/);
    }
    expect(giorniDiValidita(30.7)).toBe(30);
    expect(giorniDiValidita("20")).toBe(20);
  });
});

describe("chiusura vendita nei PDF dei moduli", () => {
  it("non promette materiali, tempi, prezzi bloccati né un sopralluogo dopo la firma", () => {
    const chiusura = read("src/components/preventivi/ChiusuraVenditaPdf.tsx");
    for (const frase of [
      "conformi e certificati",
      "senza sorprese",
      "blocchi le condizioni",
      't: "Sopralluogo"',
      "sopralluogo tecnico",
      "valido 30 giorni",
    ]) {
      expect(chiusura).not.toContain(frase);
    }
  });

  it.each(PDF_MODULI)("%s: validità dal template e testo leggibile sul colore aziendale", (rel) => {
    const src = read(rel);
    expect(src).toContain("validitaGiorni={t.default_validita_giorni}");
    expect(src).not.toContain("Preventivo valido 30 giorni");
    for (const stile of [
      "capHeaderTitle", "capHeaderSub", "totalsGrandLabel", "totalsGrandValue",
      "coverTotalLabel", "coverTotalValue", "cronoStepText",
    ]) {
      expect(src).not.toMatch(new RegExp(`${stile}: \\{[^}]*color: C\\.white`));
    }
  });
});
