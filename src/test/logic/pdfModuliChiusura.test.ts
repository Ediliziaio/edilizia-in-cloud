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

const DOCUMENTO = "src/components/preventivi/pdf/DocumentoEdilePDF.tsx";

describe("validità dell'offerta", () => {
  it("il testo libero del template vince, senza doppioni", () => {
    expect(fraseValiditaChiusura("Offerta valida 15 giorni.", 30)).toBe("Offerta valida 15 giorni.");
    expect(fraseValiditaChiusura("fino al 31 ottobre", 30)).toBe("Questo preventivo è valido fino al 31 ottobre.");
    expect(testoValiditaCondizioni("Valida fino a fine mese", 30)).toBe("Valida fino a fine mese");
    expect(fraseValiditaChiusura("Esempio dimostrativo, non utilizzabile come offerta.", 30)).toBe("Esempio dimostrativo, non utilizzabile come offerta.");
    expect(fraseValiditaChiusura("30 giorni dalla data di emissione", 10)).toBe("Questo preventivo è valido 30 giorni dalla data di emissione.");
    expect(fraseValiditaChiusura("Le condizioni scadono il 30 ottobre.", 10)).toBe("Le condizioni scadono il 30 ottobre.");
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

describe("chiusura nel documento edile condiviso", () => {
  const src = read(DOCUMENTO);

  it("non promette materiali, tempi, prezzi bloccati né un sopralluogo dopo la firma", () => {
    for (const frase of [
      "conformi e certificati",
      "senza sorprese",
      "blocchi le condizioni",
      'titolo: "Sopralluogo"',
      "sopralluogo tecnico",
      "valido 30 giorni",
    ]) {
      expect(src).not.toContain(frase);
    }
  });

  it("garanzie, percorso, domande e recensioni escono solo se l'azienda le ha scritte", () => {
    expect(src).toContain("const haPercorso = modello.mostraPercorso && modello.percorso.length > 0;");
    // Dal 22/09/2026 garanzie e domande sono due capitoli, con lo stesso interruttore.
    expect(src).toContain("const haGaranzie = modello.mostraGaranzie && modello.garanzie.length > 0;");
    expect(src).toContain("const haDomande = modello.mostraGaranzie && modello.faq.length > 0;");
    // «Dicono di noi»: le parole dei clienti o il voto del Profilo azienda, mai inventati.
    expect(src).toContain("const haRecensioni = modello.testimonianze.length > 0 || votiOnline.length > 0;");
  });

  it("la validità viene dal modello, mai da un numero scritto a mano", () => {
    expect(src).toContain("fraseValiditaChiusura(modello.testoValidita, modello.giorniValidita)");
    // Dal 21/09/2026 la validità sta anche nella fascia del prezzo (non più in una
    // colonna sua, che con un computo lungo finiva da sola su una pagina bianca).
    expect(src).toContain("offerta valida ${modello.giorniValidita} giorni");
    expect(src).not.toContain("Preventivo valido 30 giorni");
  });

  it("il testo sopra il colore dell'azienda si legge anche con un colore chiaro", () => {
    const tema = read("src/components/preventivi/pdf/temaDocumento.ts");
    // I fondi pieni non usano mai il colore grezzo: passano da fondoPerTestoBianco.
    expect(tema).toContain("const fondo = fondoPerTestoBianco(marca);");
    expect(src).not.toMatch(/backgroundColor: tema\.marca\b/);
  });
});
