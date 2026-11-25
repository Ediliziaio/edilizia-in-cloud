import { describe, expect, it } from "vitest";
import { appDaAggiornare, minimaDa } from "@/lib/campo/versioneApp";

// 25/11/2026: un operaio non vedeva i cantieri perché la sua app girava codice di tre
// giorni prima. Questo è il confronto che adesso glielo dice. Regola: nel dubbio tace.
describe("l'app sa di essere vecchia", () => {
  const MINIMA = "2026-11-25T09:30:00+01:00";

  it("avvisa quando il bundle è più vecchio della soglia", () => {
    expect(appDaAggiornare("2026-11-22T18:00:00+01:00", MINIMA)).toBe(true);
    expect(appDaAggiornare("2026-11-25T09:29:59+01:00", MINIMA)).toBe(true);
  });

  it("tace quando il bundle è alla soglia o più nuovo", () => {
    expect(appDaAggiornare(MINIMA, MINIMA)).toBe(false);
    expect(appDaAggiornare("2026-11-25T12:00:00+01:00", MINIMA)).toBe(false);
  });

  it("confronta istanti, non testi: i fusi diversi non ingannano", () => {
    // Stesso istante scritto in due fusi: non è vecchio, anche se la stringa è «minore».
    expect(appDaAggiornare("2026-11-25T08:30:00Z", MINIMA)).toBe(false);
    // Un'ora prima a Londra è prima della soglia italiana: vecchio.
    expect(appDaAggiornare("2026-11-25T07:30:00Z", MINIMA)).toBe(true);
  });

  it("nel dubbio non avvisa", () => {
    // Build senza data (bundle costruito fuori da git), soglia assente o illeggibile:
    // un avviso rosso sbagliato in cantiere costa più del silenzio.
    expect(appDaAggiornare("", MINIMA)).toBe(false);
    expect(appDaAggiornare(null, MINIMA)).toBe(false);
    expect(appDaAggiornare("2026-11-22T18:00:00+01:00", null)).toBe(false);
    expect(appDaAggiornare("2026-11-22T18:00:00+01:00", "")).toBe(false);
    expect(appDaAggiornare("ieri", MINIMA)).toBe(false);
    expect(appDaAggiornare("2026-11-22T18:00:00+01:00", "appena uscita")).toBe(false);
  });

  it("legge la soglia solo se è una data scritta", () => {
    expect(minimaDa({ minima: MINIMA })).toBe(MINIMA);
    expect(minimaDa({ minima: "  " })).toBeNull();
    expect(minimaDa({ minima: 20261125 })).toBeNull();
    expect(minimaDa({})).toBeNull();
    expect(minimaDa(null)).toBeNull();
    expect(minimaDa("2026-11-25")).toBeNull();
  });
});

describe("il file pubblicato dal sito", () => {
  it("ha una data che il confronto sa leggere", async () => {
    const { readFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync("public/versione-minima.json", "utf8")) as unknown;
    const minima = minimaDa(file);
    expect(minima).not.toBeNull();
    expect(Number.isNaN(Date.parse(minima as string))).toBe(false);
  });
});

describe("da dove si legge la soglia", () => {
  it("l'app installata la chiede al sito, non a se stessa", async () => {
    const { urlVersioneMinima, SITO_APP } = await import("@/lib/campo/versioneApp");
    // Nell'app installata «/» sono i file dentro il pacchetto: con un indirizzo relativo
    // leggerebbe la propria copia, sarebbe sempre d'accordo con se stessa e non
    // avviserebbe mai — proprio nel caso per cui l'avviso è nato.
    expect(urlVersioneMinima(true)).toBe(`${SITO_APP}/versione-minima.json`);
    expect(urlVersioneMinima(false)).toBe("/versione-minima.json");
  });

  it("il sito dà il permesso di leggerlo da un'altra origine e vieta la cache", async () => {
    const { readFileSync } = await import("node:fs");
    const headers = readFileSync("public/_headers", "utf8");
    const blocco = headers.split(/\n(?=\/)/).find(b => b.startsWith("/versione-minima.json"));
    expect(blocco, "manca la regola in public/_headers").toBeDefined();
    expect(blocco).toMatch(/Access-Control-Allow-Origin: \*/);
    expect(blocco).toMatch(/Cache-Control: no-store/);
  });
});
