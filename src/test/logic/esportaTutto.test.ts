import { describe, expect, it } from "vitest";
import { appiattisci, etichetta, htmlEsportazione, nomeFoglio, tabellaInCsv, tabellePiano } from "@/lib/controlloGestione/esportaTutto";

describe("esportazione del controllo di gestione", () => {
  it("dà nomi leggibili alle chiavi del database", () => {
    expect(etichetta("debiti_fornitori")).toBe("Debiti fornitori");
    expect(etichetta("meta.patrimonio.tfr_iniziale")).toBe("Meta › Patrimonio › TFR iniziale");
  });

  it("appiattisce valori in un riepilogo ed elenchi in tabelle, senza trasformare i codici in numeri", () => {
    const t = appiattisci({ anno: 2026, quadrato: false, codice: "06", indici: { dso: 61.5 }, righe: [{ nome: "A", importo: 10 }, { nome: "B", extra: { x: 1 } }] }, "Prova");
    expect(t[0].titolo).toBe("Prova · riepilogo");
    expect(t[0].righe).toEqual([["Anno", 2026], ["Quadrato", "no"], ["Codice", "06"], ["Indici › DSO", 61.5]]);
    expect(t[1].titolo).toBe("Prova · Righe");
    expect(t[1].colonne).toEqual(["Nome", "Importo", "Extra › X"]);
    expect(t[1].righe).toEqual([["A", 10, null], ["B", null, 1]]);
  });

  it("scrive CSV per Excel italiano: punto e virgola, virgola decimale, niente formule", () => {
    const csv = tabellaInCsv({ titolo: "x", colonne: ["Voce", "Importo"], righe: [["=SOMMA(A1)", 1234.5], ["a;b", null]] });
    expect(csv).toBe("Voce;Importo\r\n'=SOMMA(A1);1234,5\r\n\"a;b\";");
  });

  it("dà nomi di foglio validi e unici", () => {
    const usati = new Set<string>();
    expect(nomeFoglio("Conto economico: mese/per [mese]", usati)).toBe("Conto economico mese per mes");
    expect(nomeFoglio("Conto economico: mese/per [mese]", usati)).toBe("Conto economico mese per m 2");
  });

  it("nel PDF scrive i testi senza interpretarli come HTML", () => {
    const html = htmlEsportazione([{ chiave: "x", titolo: "<b>Sezione</b>", dati: null, tabelle: [{ titolo: "T", colonne: ["A"], righe: [["<script>"]] }] }],
      { azienda: "Ditta & C", titolo: "Prova", anno: 2026 });
    expect(html).toContain("&lt;b&gt;Sezione&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Ditta &amp; C");
    expect(html).not.toContain("<script>");
  });

  it("mette il piano industriale anno per anno, con le ipotesi a parte", () => {
    const t = tabellePiano({
      meta: { scenario: "base", tasso_debito_pct: 4.5 },
      periodi: [
        { tipo: "consuntivo", anno: 2026, ricavi: 1000, utile: 100, rating_classe: "B" },
        { tipo: "proiezione", anno: 2027, ricavi: 1100, utile: 120, rating_classe: "BB" },
      ],
    });
    expect(t[0].colonne).toEqual(["Voce", "2026 (consuntivo)", "2027 (previsione)"]);
    expect(t[0].righe[0]).toEqual(["Ricavi", 1000, 1100]);
    expect(t[0].righe.find((r) => r[0] === "Classe di rating")).toEqual(["Classe di rating", "B", "BB"]);
    expect(t[1].righe).toEqual([["Scenario", "base"], ["Tasso debito %", 4.5]]);
    expect(tabellePiano(null)).toEqual([]);
  });
});
