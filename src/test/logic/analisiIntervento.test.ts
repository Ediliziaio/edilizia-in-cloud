import { describe, expect, it } from "vitest";
import { avvisoIpotesi, beneficioMateriale, completaUwDaScheda, confrontoUw, leggiAnalisiIntervento, nuovaAnalisiIntervento, SCENARI_ESISTENTI } from "@/lib/serramenti/analisiIntervento";

describe("Standard di confronto dei serramenti", () => {
  it("preinclude le cinque lavorazioni abituali senza cambiare preventivi esistenti", () => {
    const a = nuovaAnalisiIntervento();
    expect(a.posa).toEqual({ rimozione: "inclusa", controtelaio: "inclusa", sigillature: "inclusa", smaltimento: "inclusa", ripristini: "inclusa", cassonetti: "da_definire" });
    a.posa.smaltimento = "esclusa";
    expect(leggiAnalisiIntervento(JSON.parse(JSON.stringify(a)))?.posa.smaltimento).toBe("esclusa");
    expect(nuovaAnalisiIntervento().posa.smaltimento).toBe("inclusa");
    expect(a.uwPrima).toBeNull(); expect(confrontoUw(a)).toBeNull();
  });
  it("segnala ipotesi non piu coerenti senza inventare un risparmio nuovo", () => {
    const a = nuovaAnalisiIntervento(); a.risparmio = { uwAttuale: 4, uwNuovo: 1.2, bolletta: 1200, m2Casa: 100, zona: "E", superficie: 10, fonteBolletta: "cliente" };
    expect(avvisoIpotesi(a, 10)).toBeNull(); expect(avvisoIpotesi(a, 12)).toContain("composizione");
    a.uwPrima = 5; expect(avvisoIpotesi(a, 10)).toContain("differiscono");
  });
  it.each(["alluminio_freddo", "legno", "pvc"] as const)("%s non assegna prestazioni dal solo materiale", scenario => {
    const a = { ...nuovaAnalisiIntervento(), esistente: scenario };
    expect(leggiAnalisiIntervento(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(confrontoUw(a)).toBeNull();
    expect(SCENARI_ESISTENTI[scenario].descrizione).not.toMatch(/\d.*%|\bdB\b/);
  });
  it("calcola la sola differenza Uw soltanto con valori e fonti", () => {
    const a = { ...nuovaAnalisiIntervento(), uwPrima: 4, uwDopo: 1.2, fontePrima: "Rilievo", fonteDopo: "Scheda configurazione" };
    expect(confrontoUw(a)?.riduzione).toBe(70);
    expect(confrontoUw({ ...a, fonteDopo: "" })).toBeNull();
    expect(confrontoUw({ ...a, uwDopo: 5 })?.riduzione).toBe(-25);
    expect(confrontoUw({ ...a, uwPrima: 0 })).toBeNull();
  });
  it("non confonde il valore limite della linea con il dato della finestra", () => {
    const a = nuovaAnalisiIntervento();
    expect(completaUwDaScheda(a, [{ nome: "Linea", dati: [{ etichetta: "Isolamento termico", valore: "Uw fino a 1,1 W/m²K" }] }])).toEqual(a);
    const r = completaUwDaScheda(a, [{ nome: "Configurazione", dati: [{ etichetta: "Uw", valore: "1,2 W/m²K" }] }]);
    expect(r.uwDopo).toBe(1.2); expect(r.fonteDopo).toContain("Configurazione");
    expect(completaUwDaScheda(a, [{ nome: "A", dati: [] }, { nome: "B", dati: [] }])).toEqual(a);
  });
  it("non sovrascrive il valore specificato dal tecnico", () => {
    const a = { ...nuovaAnalisiIntervento(), uwDopo: 1.4, fonteDopo: "Scheda finestra" };
    expect(completaUwDaScheda(a, [{ nome: "Linea", dati: [{ etichetta: "Uw", valore: "1.1" }] }])).toEqual(a);
  });
  it("rifiuta dati corrotti, valori non finiti e stati di posa arbitrari", () => {
    expect(leggiAnalisiIntervento(null)).toBeNull();
    expect(leggiAnalisiIntervento({ ...nuovaAnalisiIntervento(), uwPrima: Infinity })).toBeNull();
    expect(leggiAnalisiIntervento({ ...nuovaAnalisiIntervento(), posa: { rimozione: "gratis" } })).toBeNull();
    expect(leggiAnalisiIntervento({ ...nuovaAnalisiIntervento(), motivo: "x".repeat(1201) })).toBeNull();
  });
  it("non presenta il PVC come automaticamente migliore degli altri materiali", () => {
    expect(SCENARI_ESISTENTI.pvc.descrizione).toContain("non e' automaticamente migliore");
    expect(SCENARI_ESISTENTI.legno.descrizione).toContain("gia un materiale isolante");
    expect(beneficioMateriale("alluminio")).toContain("taglio termico");
  });
});
