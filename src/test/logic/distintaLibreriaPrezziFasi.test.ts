import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoComeScomposizioni, SCOMPOSIZIONI_STANDARD, vociPerImport } from "@/lib/distinta/scomposizioniStandard";
import { generaDistinta, normalizzaTesto, trovaScomposizione } from "@/lib/distinta/generaDistinta";
import { prezzoAttuale, scegliPrezzo, totaleStimato, chiaveDescrizione } from "@/lib/distinta/prezziMateriali";
import { capitoliIncerti, fondiProposte, leggiSuggerimentiFase, VALORE_NUOVA, VALORE_SENZA } from "@/lib/distinta/faseProposta";
import { propostaFasi } from "@/lib/distinta/fasiMateriali";
import { messaggioFasi, pulisciProposteFasi } from "../../../supabase/functions/_shared/distintaFasiAI";

const catalogo = catalogoComeScomposizioni();
const riconosce = (descrizione: string, unita: string | null = "cad") =>
  trovaScomposizione(catalogo, { testo: normalizzaTesto(descrizione), unita })?.id ?? null;

describe("libreria standard delle scomposizioni", () => {
  it("struttura: codici unici, componenti sensati, unità ammesse, sfrido tra 0 e 30", () => {
    const codici = SCOMPOSIZIONI_STANDARD.map((s) => s.codice_standard);
    expect(new Set(codici).size).toBe(codici.length);
    for (const s of SCOMPOSIZIONI_STANDARD) {
      expect(s.parole_chiave.length, s.nome).toBeGreaterThan(0);
      expect(s.componenti.length, s.nome).toBeGreaterThan(0);
      for (const c of s.componenti) {
        expect(c.descrizione.trim(), s.nome).not.toBe("");
        expect(c.quantita_per_unita, `${s.nome} · ${c.descrizione}`).toBeGreaterThan(0);
        expect(c.sfrido_percentuale).toBeGreaterThanOrEqual(0);
        expect(c.sfrido_percentuale).toBeLessThanOrEqual(30);
        expect(["pz", "m", "mq", "kg", "l", "conf"]).toContain(c.unita_misura);
      }
    }
  });

  it("copre i quattro ambiti", () => {
    const ambiti = new Set(SCOMPOSIZIONI_STANDARD.map((s) => s.ambito));
    expect([...ambiti].sort()).toEqual(["antincendio", "climatizzazione", "elettrico", "fotovoltaico"]);
    expect(vociPerImport(["fotovoltaico"]).every((v) => v.categoria === "Fotovoltaico")).toBe(true);
    expect(vociPerImport()[0].note).toContain("libreria standard");
  });

  it("le parole chiave riconoscono le voci tipiche di computo e di legenda", () => {
    expect(riconosce("Punto luce interrotto con comando da parete")).toBe("EL-PUNTO-LUCE-INT");
    expect(riconosce("Punto luce deviato da due posizioni")).toBe("EL-PUNTO-LUCE-DEV");
    expect(riconosce("Punto luce deviato a soffitto")).toBe("EL-PUNTO-LUCE-DEV");
    expect(riconosce("Punto luce invertito da tre posizioni")).toBe("EL-PUNTO-LUCE-INV");
    expect(riconosce("Punto luce a soffitto")).toBe("EL-PUNTO-LUCE-SOFFITTO");
    expect(riconosce("Punto luce a parete per applique")).toBe("EL-PUNTO-LUCE-PARETE");
    expect(riconosce("Punto presa 10/16 A bipasso", "n.")).toBe("EL-PUNTO-PRESA-10-16");
    expect(riconosce("Punto presa Schuko 16 A")).toBe("EL-PRESA-SCHUKO");
    expect(riconosce("Punto presa dati RJ45 cat. 6")).toBe("EL-PRESA-DATI-RJ45");
    expect(riconosce("Punto presa telefonica RJ11")).toBe("EL-PRESA-TELEFONO-RJ11");
    expect(riconosce("Punto presa TV-SAT")).toBe("EL-PRESA-TV");
    expect(riconosce("Interruttore magnetotermico differenziale 2P C16")).toBe("EL-INT-MAGNETOTERMICO-DIFF");
    expect(riconosce("Interruttore magnetotermico 1P+N C10")).toBe("EL-INT-MAGNETOTERMICO");
    expect(riconosce("Rivelatore ottico di fumo indirizzato")).toBe("AI-RIVELATORE-OTTICO");
    expect(riconosce("Rilevatore ottico di fumo")).toBe("AI-RIVELATORE-OTTICO");
    expect(riconosce("Pulsante di allarme a rottura vetro")).toBe("AI-PULSANTE-ALLARME");
    expect(riconosce("Centrale di rivelazione incendi 2 loop")).toBe("AI-CENTRALE");
    expect(riconosce("Cavo FTE29OHM16 2x1,5 mmq", "m")).toBe("AI-CAVO-FTE29OHM16");
    expect(riconosce("Linea frigorifera in rame preisolato", "m")).toBe("CL-LINEA-FRIGORIFERA");
    expect(riconosce("Modulo fotovoltaico monocristallino 430 Wp")).toBe("FV-MODULO");
    expect(riconosce("Cavo solare H1Z2Z2-K 1x6", "m")).toBe("FV-CAVO-SOLARE");
    expect(riconosce("Lampada di emergenza autonomia 1 h")).toBe("EL-LAMPADA-EMERGENZA");
  });

  it("le voci a metro non riconoscono una voce a pezzi, e viceversa le quantità tornano", () => {
    expect(riconosce("Linea dorsale", "cad")).toBeNull();
    const r = generaDistinta({
      voci: [{ id: "v1", descrizione_breve: "Punto luce interrotto", unita_misura: "cad", quantita: 10 }],
      scomposizioni: catalogo,
    });
    const cavo = r.righe.find((x) => x.descrizione === "Cavo unipolare");
    expect(cavo?.quantita_calcolata).toBe(330); // 10 punti × 30 m + 10% di sfrido
    expect(r.righe.find((x) => x.descrizione === "Interruttore unipolare")?.quantita_calcolata).toBe(10);
  });
});

describe("prezzo d'acquisto proposto: priorità delle fonti", () => {
  const ultimo = { prezzo: 0.42, unita: "m", data: "2026-09-12", oda: "ODA-14" };
  it("listino prima di tutto (netto, poi costo standard)", () => {
    expect(scegliPrezzo({ unita: "m", listino: { prezzo_acquisto_netto: 0.5, standard_cost: 0.6 }, ultimoAcquisto: ultimo })?.fonte).toBe("listino");
    expect(scegliPrezzo({ unita: "m", listino: { prezzo_acquisto_netto: 0, standard_cost: 0.6 } })?.prezzo).toBe(0.6);
  });
  it("poi l'ultimo acquisto, solo con la stessa unità", () => {
    const p = scegliPrezzo({ unita: "ml", listino: null, ultimoAcquisto: ultimo, scomposizione: { prezzo_unitario: 1 } });
    expect(p).toMatchObject({ prezzo: 0.42, fonte: "ultimo_acquisto" });
    expect(p?.dettaglio).toContain("ODA-14");
    expect(scegliPrezzo({ unita: "pz", ultimoAcquisto: ultimo, scomposizione: { prezzo_unitario: 1 } })?.fonte).toBe("scomposizione");
  });
  it("niente fonte, niente prezzo", () => {
    expect(scegliPrezzo({ unita: "pz" })).toBeNull();
    expect(scegliPrezzo({ unita: "pz", scomposizione: { prezzo_unitario: 0 } })).toBeNull();
  });
  it("il prezzo già scritto vince; totale con i proposti e i mancanti", () => {
    expect(prezzoAttuale({ purchase_price: 3, prezzo_fonte: "offerta" })?.fonte).toBe("offerta");
    expect(prezzoAttuale({ purchase_price: 3, article_template_id: "a" })?.fonte).toBe("listino");
    const t = totaleStimato(
      [{ id: "a", quantity: 2, purchase_price: 10 }, { id: "b", quantity: 3, purchase_price: 0 }, { id: "c", quantity: 1 }],
      new Map([["b", { prezzo: 5, fonte: "ultimo_acquisto" as const, dettaglio: null }]]),
    );
    expect(t).toEqual({ totale: 35, proposto: 15, senzaPrezzo: 1 });
    expect(chiaveDescrizione("  Cavo   FS17 ")).toBe("cavo fs17");
  });
});

describe("fase proposta dall'AI", () => {
  const fasi = [{ id: "f1", nome: "Impianto elettrico" }, { id: "f2", nome: "Opere murarie" }];
  it("la funzione tiene solo capitoli chiesti e fasi vere", () => {
    const r = pulisciProposteFasi({
      proposte: [
        { capitolo: "IMPIANTI SPECIALI", phase_id: "f1", motivo: "Cavi e prese", confidenza: 0.8 },
        { capitolo: "Rivelazione", phase_id: "inventata", nuova_fase: "Rivelazione incendi", confidenza: 0.9 },
        { capitolo: "Altro capitolo", phase_id: "f2" },
      ],
    }, ["Impianti speciali", "Rivelazione"], fasi);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ capitolo: "Impianti speciali", phase_id: "f1", nuova_fase: null, confidenza: 0.8 });
    expect(r[1]).toMatchObject({ phase_id: null, nuova_fase: "Rivelazione incendi", confidenza: 0.3 });
    expect(pulisciProposteFasi("non json", ["x"], fasi)).toEqual([]);
    expect(messaggioFasi([{ nome: "Cap", esempi: ["voce"] }], fasi)).toContain("id: f1");
  });

  it("il browser legge la risposta con prudenza", () => {
    expect(leggiSuggerimentiFase(null, ["A"], [])).toEqual([]);
    const s = leggiSuggerimentiFase({ proposte: [{ capitolo: "A", phase_id: "zz", nuova_fase: " Nuova ", confidenza: 7 }] }, ["A"], [{ id: "f1" }]);
    expect(s[0]).toMatchObject({ phase_id: null, nuova_fase: "Nuova", confidenza: 1, motivo: "Proposta dell'AI" });
  });

  it("solo i capitoli incerti vanno all'AI; le scelte dell'utente vincono; senza AI resta la proposta per parole", () => {
    const voci = [
      { id: "1", descrizione_breve: "Punto luce", super_categoria: "Impianto elettrico" },
      { id: "2", descrizione_breve: "Rivelatore ottico", super_categoria: "Speciali" },
      { id: "3", descrizione_breve: "Senza nulla" },
    ];
    const perParole = propostaFasi(voci, [{ id: "f1", name: "Impianto elettrico" }]);
    expect(capitoliIncerti(voci, perParole)).toEqual([{ nome: "Speciali", esempi: ["Rivelatore ottico"] }]);
    const base = { "Impianto elettrico": "f1", Speciali: VALORE_NUOVA + "Speciali", "Senza capitolo": VALORE_SENZA };
    const sicuri = new Set(["Impianto elettrico"]);
    const ai = [
      { capitolo: "Speciali", phase_id: "f1", nuova_fase: null, motivo: "", confidenza: 0.7 },
      { capitolo: "Impianto elettrico", phase_id: null, nuova_fase: "Altro", motivo: "", confidenza: 0.2 },
    ];
    expect(fondiProposte(base, ai, sicuri, {})).toEqual({ ...base, Speciali: "f1" });
    expect(fondiProposte(base, ai, sicuri, { Speciali: VALORE_SENZA }).Speciali).toBe(VALORE_SENZA);
    expect(fondiProposte(base, [], sicuri, {})).toEqual(base);
  });

  it("la funzione edge passa dal router, che segnala gli errori del provider", () => {
    const s = readFileSync(resolve(process.cwd(), "supabase/functions/distinta-proponi-fasi/index.ts"), "utf8");
    expect(s).toContain('import { aiRouterComplete } from "../_shared/aiRouter.ts"');
    expect(s).toContain("requireCompanyAccess");
  });
});
