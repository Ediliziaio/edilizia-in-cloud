/**
 * scripts/valuta-lettura: il confronto fra due cartelle di JSON (30/10/2026).
 * L'esempio incluso nel repository deve dare sempre lo stesso rapporto: è anche
 * la prova che lo strumento legge i formati in cui le funzioni rispondono.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { confrontaCartelle, estraiCampi } from "../../../scripts/valuta-lettura/confronta";

const ESEMPIO = resolve(__dirname, "../../../scripts/valuta-lettura/esempio");

describe("l'esempio incluso", () => {
  const r = confrontaCartelle(join(ESEMPIO, "atteso"), join(ESEMPIO, "letto"));

  it("tre documenti, nessuno perfetto, uno mai letto", () => {
    expect(r.casi.map((c) => c.nome)).toEqual(["ddt-01", "ddt-02", "fattura-01"]);
    expect(r.totale.documenti).toBe(3);
    expect(r.totale.perfetti).toBe(0);
    expect(r.nonLetti).toEqual(["ddt-02"]);
    expect(r.senzaAtteso).toEqual([]);
  });

  it("raggruppa per tipo di documento", () => {
    expect(Object.keys(r.perTipo)).toEqual(["ddt", "fattura_passiva"]);
    expect(r.perTipo.ddt.documenti).toBe(2);
    expect(r.perTipo.fattura_passiva.documenti).toBe(1);
  });

  it("la fattura: la partita IVA con due cifre scambiate è l'unico errore; data, nome e importi in altro formato sono giusti", () => {
    const fattura = r.casi.find((c) => c.nome === "fattura-01")!.valutazione;
    expect(fattura.conteggi).toMatchObject({ errato: 1, mancante: 0, inventato: 0 });
    expect(fattura.campi.find((c) => c.percorso === "cedente.piva")?.esito).toBe("errato");
    expect(fattura.campi.find((c) => c.percorso === "data_fattura")?.esito).toBe("equivalente");
    expect(fattura.campi.find((c) => c.percorso === "imponibile_totale")?.esito).toBe("equivalente");
  });

  it("il DDT: destinatario scambiato col mittente, una riga non letta", () => {
    const ddt = r.casi.find((c) => c.nome === "ddt-01")!.valutazione;
    expect(ddt.campi.find((c) => c.percorso === "destinatario.ragione_sociale")?.esito).toBe("errato");
    expect(ddt.conteggi.mancante).toBe(3);
  });

  it("un documento mai letto vale tutto mancante", () => {
    const mai = r.casi.find((c) => c.nome === "ddt-02")!;
    expect(mai.nonLetto).toBe(true);
    expect(mai.valutazione.accuratezza).toBe(0);
  });
});

describe("estraiCampi: dove stanno i campi", () => {
  const campi = { numero: "1" };
  it("riconosce la risposta delle funzioni, la riga del database e il file scritto a mano", () => {
    expect(estraiCampi({ success: true, extracted: campi })).toBe(campi);
    expect(estraiCampi({ success: true, ddt: campi })).toBe(campi);
    expect(estraiCampi({ id: "x", structured_fields: campi })).toBe(campi);
    expect(estraiCampi({ tipo: "ddt", campi })).toBe(campi);
  });
  it("altrimenti il file stesso", () => {
    const piatto = { numero: "1", totale: 5 };
    expect(estraiCampi(piatto)).toBe(piatto);
    expect(estraiCampi("testo")).toBe("testo");
    expect(estraiCampi(null)).toBeNull();
  });
});

describe("errori", () => {
  it("una cartella che non esiste lo dice", () => {
    expect(() => confrontaCartelle("/non/esiste", ESEMPIO)).toThrow(/«atteso» non trovata/);
    expect(() => confrontaCartelle(join(ESEMPIO, "atteso"), "/non/esiste")).toThrow(/«letto» non trovata/);
  });
  it("un file che non è JSON dice quale", () => {
    const base = mkdtempSync(join(tmpdir(), "valuta-lettura-"));
    mkdirSync(join(base, "atteso"));
    mkdirSync(join(base, "letto"));
    writeFileSync(join(base, "atteso", "rotto.json"), "{ non è json");
    expect(() => confrontaCartelle(join(base, "atteso"), join(base, "letto"))).toThrow(/rotto\.json/);
  });
  it("file letti senza un atteso corrispondente si segnalano e non contano", () => {
    const base = mkdtempSync(join(tmpdir(), "valuta-lettura-"));
    mkdirSync(join(base, "atteso"));
    mkdirSync(join(base, "letto"));
    writeFileSync(join(base, "atteso", "a.json"), JSON.stringify({ tipo: "ddt", campi: { numero: "1" } }));
    writeFileSync(join(base, "letto", "a.json"), JSON.stringify({ ddt: { numero: "1" } }));
    writeFileSync(join(base, "letto", "b.json"), JSON.stringify({ ddt: { numero: "2" } }));
    const r = confrontaCartelle(join(base, "atteso"), join(base, "letto"));
    expect(r.senzaAtteso).toEqual(["b"]);
    expect(r.totale.documenti).toBe(1);
    expect(r.totale.perfetti).toBe(1);
  });
});

describe("bozze delle email: i campi sono {valore, conf}", () => {
  it("la confidenza non conta come campo, né inventato né mancante", () => {
    const base = mkdtempSync(join(tmpdir(), "valuta-lettura-"));
    mkdirSync(join(base, "atteso"));
    mkdirSync(join(base, "letto"));
    writeFileSync(
      join(base, "atteso", "mail-1.json"),
      JSON.stringify({ tipo: "fattura", campi: { numero: "FT-1", totale: 100, iban: null } }),
    );
    // La riga di email_documento_estratto, com'è nel database.
    writeFileSync(
      join(base, "letto", "mail-1.json"),
      JSON.stringify({
        id: "x",
        tipo: "fattura",
        campi: { numero: { valore: "FT-1", conf: 0.97 }, totale: { valore: "100,00", conf: 0.9 }, iban: { valore: null, conf: 0 } },
      }),
    );
    const r = confrontaCartelle(join(base, "atteso"), join(base, "letto"));
    expect(r.totale.perfetti).toBe(1);
    expect(r.casi[0].valutazione.conteggi).toEqual({ esatto: 1, equivalente: 1, errato: 0, mancante: 0, inventato: 0 });
  });
});
