import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoXpwe, parseXml, MESSAGGIO_DCF } from "@/lib/computo/xpwe";
import { controllaTotali } from "@/lib/computo/computoStrutturato";
import { quadroEconomico } from "@/lib/computo/quadroEconomico";

const fixture = () => readFileSync(resolve(__dirname, "../fixtures/computoSintetico.xpwe"));

describe("XPWE di PriMus", () => {
  const computo = leggiComputoXpwe(new Uint8Array(fixture()));

  it("legge dati generali, voci e descrizioni complete dall'elenco prezzi", () => {
    expect(computo.metadata).toMatchObject({ oggetto_lavori: "Manutenzione straordinaria della scuola \"G. Verdi\"", committente: "Comune di Prova - Ufficio Tecnico" });
    expect(computo.voci).toHaveLength(6);
    expect(computo.voci[0].descrizione).toBe("Recinzione provvisionale di cantiere con pannelli metallici zincati su basi in calcestruzzo,\ncompreso montaggio, smontaggio e nolo per tutta la durata dei lavori.");
    expect(computo.voci[0].codici).toEqual(["S.01.010", "SR5014"]);
    expect(computo.voci[2].descrizione).toContain("materiali di risulta & gli oneri");
    expect(computo.voci[3].descrizione).toContain("tirato a frattazzo <fino> a regola d'arte");
  });

  it("ricostruisce gerarchia e sicurezza", () => {
    expect(computo.voci.map(v => v.categoria?.nome)).toEqual(["ONERI DELLA SICUREZZA", "ONERI DELLA SICUREZZA", "DEMOLIZIONI", "INTONACI E TINTEGGIATURE", "INTONACI E TINTEGGIATURE", "DEMOLIZIONI"]);
    expect(computo.voci.map(v => v.sotto_categoria?.nome ?? null)).toEqual([null, null, "Piano terra", "Piano terra", "Piano primo", null]);
    expect(computo.voci.every(v => v.super_categoria?.nome === "LAVORI EDILI")).toBe(true);
    expect(computo.voci.map(v => v.is_sicurezza)).toEqual([true, true, false, false, false, false]);
    expect(computo.voci[5]).toMatchObject({ a_corpo: true, quantita: 1, importo: 850 });
  });

  it("righe di misura con parti uguali, formule e detrazioni", () => {
    const [v1, v2, v3, , v5] = computo.voci;
    expect(v1.misure.map(m => [m.descrizione, m.parti_uguali, m.lunghezza, m.quantita])).toEqual([["Lato strada", null, 42, 42], ["Lato cortile", 2, 21, 42]]);
    expect(v2.misure[0]).toMatchObject({ parti_uguali: 25, altezza_peso: 3, quantita: 75, formula: "par.ug.=5*5" });
    expect(v3.misure[2]).toMatchObject({ parti_uguali: -6, quantita: -81 });
    expect(v3).toMatchObject({ quantita: 130.2, prezzo_unitario: 9.8, importo: 1275.96 });
    // Senza quantità scritta: si calcola dalle righe.
    expect(v5.misure.map(m => m.quantita)).toEqual([360, 102]);
    expect(v5).toMatchObject({ quantita: 462, importo: 2841.3 });
  });

  it("i totali tornano e la sicurezza è separata", () => {
    const controllo = controllaTotali(computo);
    expect(controllo.ok).toBe(true);
    expect(controllo.totale_calcolato).toBe(12034.87);
    expect(controllo.oneri_sicurezza).toBe(3903.75);
    expect(controllo.sintesi).toContain("6 voci lette");
  });

  it("decodifica windows-1252", () => {
    const xml = `<?xml version="1.0" encoding="windows-1252"?><PweDocumento><PweMisurazioni><PweElencoPrezzi><EPItem ID="1"><Tariffa>A</Tariffa><DesEstesa>Tinteggiatura più resistente</DesEstesa><UnMisura>mq</UnMisura><Prezzo1>2</Prezzo1></EPItem></PweElencoPrezzi><PweVociComputo><VCItem ID="1"><IDEP>1</IDEP><Quantita>3</Quantita></VCItem></PweVociComputo></PweMisurazioni></PweDocumento>`;
    const bytes = Uint8Array.from([...xml].map(c => c.charCodeAt(0)));
    expect(leggiComputoXpwe(bytes).voci[0]).toMatchObject({ descrizione: "Tinteggiatura più resistente", importo: 6 });
  });

  it("il .dcf binario riceve un messaggio chiaro", () => {
    expect(() => leggiComputoXpwe(new Uint8Array([0x44, 0x43, 0x46, 0x00, 0x01, 0xff]))).toThrow(MESSAGGIO_DCF);
    expect(MESSAGGIO_DCF).toContain("File › Esporta › formato XPWE");
  });

  it("XML rotto o di altro tipo: errore comprensibile", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(/non valido/);
    expect(() => leggiComputoXpwe("<?xml version=\"1.0\"?><Fattura/>")).toThrow(/non sembra un XPWE/);
  });
});

describe("quadro economico dei lavori pubblici", () => {
  it("il ribasso si applica solo ai lavori, non alla sicurezza", () => {
    expect(quadroEconomico(2642936.35, 153873.55, 12.5)).toEqual({
      importo_lavori: 2642936.35, oneri_sicurezza: 153873.55, soggetto_a_ribasso: 2489062.8,
      ribasso_percentuale: 12.5, ribasso_euro: 311132.85, importo_contrattuale: 2331803.5,
    });
  });
  it("senza ribasso il contrattuale è l'importo dei lavori", () => {
    expect(quadroEconomico(1000, 100, null).importo_contrattuale).toBe(1000);
    expect(quadroEconomico(1000, 100, 150).ribasso_percentuale).toBe(100);
  });
});
