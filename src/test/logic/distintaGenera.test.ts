import { describe, expect, it } from "vitest";
import {
  arrotondaPerAcquisto,
  chiaveRiga,
  classificaVoce,
  generaDistinta,
  normalizzaUnita,
  type Scomposizione,
  type VoceComputo,
} from "@/lib/distinta/generaDistinta";
import { fasiDaCreare, propostaFasi, riepilogoFase, statoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";

// Computo finto di un impianto elettrico per un lavoro pubblico (righe come le
// scrive PriMus): lavorazioni a punto, forniture, oneri e voci a corpo.
const voce = (v: Partial<VoceComputo> & { id: string; descrizione_breve: string }): VoceComputo => ({
  unita_misura: "cad", quantita: 1, ...v,
});

const PUNTO_PRESA: Scomposizione = {
  id: "s-presa",
  nome: "Punto presa 10/16 A",
  codice_prezzario: "EL.05.010",
  parole_chiave: ["punto presa"],
  unita_misura: "cad",
  attiva: true,
  categoria: "Impianto elettrico",
  componenti: [
    { descrizione: "Scatola da incasso 503", unita_misura: "pz", quantita_per_unita: 1 },
    { descrizione: "Presa bipasso 10/16 A", specifiche: "2P+T, serie civile", unita_misura: "pz", quantita_per_unita: 1 },
    { descrizione: "Placca 3 moduli", unita_misura: "pz", quantita_per_unita: 1 },
    { descrizione: "Cavo FS17 1x2,5 mmq", specifiche: "450/750 V", unita_misura: "m", quantita_per_unita: 18, sfrido_percentuale: 10 },
    { descrizione: "Tubo corrugato Ø20", unita_misura: "m", quantita_per_unita: 15, sfrido_percentuale: 5 },
  ],
};

const PUNTO_LUCE: Scomposizione = {
  id: "s-luce",
  nome: "Punto luce interrotto",
  parole_chiave: ["punto luce"],
  attiva: true,
  componenti: [
    { descrizione: "Scatola da incasso 503", unita_misura: "pz", quantita_per_unita: 1 },
    { descrizione: "Cavo FS17 1x2,5 mmq", specifiche: "450/750 V", unita_misura: "m", quantita_per_unita: 12, sfrido_percentuale: 10 },
  ],
};

const PROPOSTA_AI_NON_APPROVATA: Scomposizione = {
  id: "s-ai",
  nome: "Rilevatore (proposta AI)",
  parole_chiave: ["rilevatore"],
  attiva: false,
  componenti: [{ descrizione: "Base rilevatore", unita_misura: "pz", quantita_per_unita: 1 }],
};

describe("scomposizione × quantità della voce, con lo sfrido", () => {
  it("37 punti presa → 37 scatole, 37 prese, 37 placche, 732,6 m di cavo, 582,75 m di corrugato", () => {
    const r = generaDistinta({
      voci: [voce({ id: "v1", codice_prezzario: "EL.05.010", descrizione_breve: "Punto presa 10/16 A da incasso", quantita: 37 })],
      scomposizioni: [PUNTO_PRESA],
    });
    const per = Object.fromEntries(r.righe.map((x) => [x.descrizione, x]));
    expect(per["Scatola da incasso 503"].quantita_calcolata).toBe(37);
    expect(per["Presa bipasso 10/16 A"].specifiche).toBe("2P+T, serie civile");
    expect(per["Cavo FS17 1x2,5 mmq"].quantita_netta).toBe(666);
    expect(per["Cavo FS17 1x2,5 mmq"].quantita_calcolata).toBe(732.6);
    expect(per["Cavo FS17 1x2,5 mmq"].sfrido).toBe(10);
    expect(per["Tubo corrugato Ø20"].quantita_calcolata).toBe(582.75);
    expect(per["Scatola da incasso 503"].scomposizione_id).toBe("s-presa");
    expect(per["Scatola da incasso 503"].categoria).toBe("Impianto elettrico");
    expect(r.escluse).toEqual([]);
  });

  it("riconosce per codice di prezzario anche senza le parole chiave, e per parole chiave senza codice", () => {
    const perCodice = classificaVoce(voce({ id: "a", codice_prezzario: "EL.05.010", descrizione_breve: "Presa di corrente" }), [PUNTO_PRESA]);
    const perParole = classificaVoce(voce({ id: "b", descrizione_breve: "Punto presa di servizio" }), [PUNTO_PRESA]);
    expect(perCodice.tipo).toBe("scomposta");
    expect(perParole.tipo).toBe("scomposta");
  });

  it("una scomposizione proposta dall'AI e non approvata non si usa", () => {
    const r = generaDistinta({
      voci: [voce({ id: "v", descrizione_breve: "Punto rilevatore ottico di fumo", quantita: 5 })],
      scomposizioni: [PROPOSTA_AI_NON_APPROVATA],
    });
    expect(r.righe).toEqual([]);
    expect(r.senzaScomposizione.map((v) => v.id)).toEqual(["v"]);
    expect(r.avvisi[0].tipo).toBe("senza_scomposizione");
  });

  it("i pezzi si arrotondano all'unità per eccesso, i metri al centesimo", () => {
    expect(arrotondaPerAcquisto(2.01, "pz")).toBe(3);
    expect(arrotondaPerAcquisto(3, "cad")).toBe(3);
    expect(arrotondaPerAcquisto(10.001, "m")).toBe(10.01);
    expect(arrotondaPerAcquisto(0, "m")).toBe(0);
  });
});

describe("forniture dirette: la voce è già il materiale", () => {
  it("cavo, pompa di calore e moduli FV diventano una riga con la voce stessa", () => {
    const r = generaDistinta({
      voci: [
        voce({ id: "c", descrizione_breve: "Cavo FG16OR16 3G1,5", unita_misura: "m", quantita: 8390 }),
        voce({ id: "p", descrizione_breve: "Fornitura e posa in opera di pompa di calore aria-acqua 12 kW", unita_misura: "cad", quantita: 8 }),
        voce({ id: "m", descrizione_breve: "Moduli fotovoltaici monocristallini 450 Wp", unita_misura: "cad", quantita: 90 }),
      ],
      scomposizioni: [],
    });
    expect(r.righe.map((x) => [x.descrizione, x.unita_misura, x.quantita_calcolata])).toEqual(
      expect.arrayContaining([
        ["Cavo FG16OR16 3G1,5", "m", 8390],
        ["Fornitura e posa in opera di pompa di calore aria-acqua 12 kW", "cad", 8],
        ["Moduli fotovoltaici monocristallini 450 Wp", "cad", 90],
      ]),
    );
    expect(r.righe.every((x) => x.origine === "computo" && x.origini.length === 1)).toBe(true);
  });

  it("«fornitura e posa di punto luce» è una lavorazione, non una fornitura", () => {
    expect(classificaVoce(voce({ id: "x", descrizione_breve: "Fornitura e posa in opera di punto luce interrotto" }), []).tipo)
      .toBe("senza_scomposizione");
  });
});

describe("escluse, con il motivo", () => {
  const r = generaDistinta({
    voci: [
      voce({ id: "s", descrizione_breve: "Recinzione di cantiere", is_sicurezza: true, unita_misura: "m", quantita: 120 }),
      voce({ id: "o", descrizione_breve: "Oneri per la redazione del piano di sicurezza", unita_misura: "a corpo" }),
      voce({ id: "t", descrizione_breve: "Collaudo e certificazione dell'impianto (DiCo)", unita_misura: "cad" }),
      voce({ id: "n", descrizione_breve: "Nolo di piattaforma aerea", unita_misura: "h", quantita: 16 }),
      voce({ id: "c", descrizione_breve: "Opere di finitura varie", a_corpo: true, unita_misura: "a corpo" }),
      voce({ id: "d", descrizione_breve: "Detrazione per materiale recuperato", is_detrazione: true }),
      voce({ id: "z", descrizione_breve: "Cavo FS17 1x1,5", unita_misura: "m", quantita: 0 }),
      voce({ id: "i", descrizione_breve: "Cavo FS17 1x1,5", unita_misura: "m", quantita: 10, is_included: false }),
      voce({ id: "h", descrizione_breve: "Operaio specializzato", unita_misura: "h", quantita: 40 }),
    ],
    scomposizioni: [],
  });

  it("nessuna riga di materiale", () => expect(r.righe).toEqual([]));
  it.each([
    ["s", /sicurezza/i],
    ["o", /sicurezza|oneri/i],
    ["t", /prestazione tecnica/i],
    ["n", /nolo/i],
    ["c", /a corpo/i],
    ["d", /detrazione/i],
    ["z", /quantità/i],
    ["i", /tolta/i],
    ["h", /manodopera/i],
  ])("%s esclusa: %s", (id, motivo) => {
    const e = r.escluse.find((x) => x.voce_id === id);
    expect(e?.motivo).toMatch(motivo);
  });
});

describe("righe uguali sommate, con la traccia delle voci d'origine", () => {
  it("la scatola 503 di prese e luci diventa una riga sola; il cavo uguale si somma", () => {
    const r = generaDistinta({
      voci: [
        voce({ id: "v1", descrizione_breve: "Punto presa 10/16 A", quantita: 10 }),
        voce({ id: "v2", descrizione_breve: "Punto luce interrotto", quantita: 20 }),
        voce({ id: "v3", descrizione_breve: "Punto presa 10/16 A bagno", quantita: 2 }),
      ],
      scomposizioni: [PUNTO_PRESA, PUNTO_LUCE],
    });
    const scatole = r.righe.filter((x) => x.descrizione === "Scatola da incasso 503");
    expect(scatole).toHaveLength(1);
    expect(scatole[0].quantita_calcolata).toBe(32);
    expect(scatole[0].origini.map((o) => (o.tipo === "computo" ? o.voce_id : ""))).toEqual(["v1", "v2", "v3"]);
    expect(scatole[0].scomposizione_id).toBeNull(); // viene da due scomposizioni diverse
    const cavo = r.righe.filter((x) => x.descrizione.startsWith("Cavo FS17"));
    expect(cavo).toHaveLength(1);
    // (10+2)×18 + 20×12 = 456 m netti, +10 % = 501,6
    expect(cavo[0].quantita_netta).toBe(456);
    expect(cavo[0].quantita_calcolata).toBe(501.6);
  });

  it("la chiave ignora maiuscole, accenti, spazi e sinonimi di unità", () => {
    expect(chiaveRiga("Tubo  corrugato Ø20", "ml", null, "computo")).toBe(chiaveRiga("tubo corrugato ø20", "m", "", "computo"));
    expect(normalizzaUnita("n.")).toBe("cad");
    expect(normalizzaUnita("Nr")).toBe("cad");
    expect(normalizzaUnita("m²")).toBe("mq");
  });

  it("stesso materiale con specifiche diverse resta su righe diverse", () => {
    const r = generaDistinta({
      voci: [
        voce({ id: "a", descrizione_breve: "Cavo FS17", unita_misura: "m", quantita: 10 }),
        voce({ id: "b", descrizione_breve: "Punto presa", quantita: 1 }),
      ],
      scomposizioni: [PUNTO_PRESA],
    });
    expect(r.righe.filter((x) => normalizzaUnita(x.unita_misura) === "m").length).toBeGreaterThanOrEqual(2);
  });
});

describe("conteggi confermati delle planimetrie", () => {
  it("37 «PA» con la scomposizione del punto → materiali; senza scomposizione → pezzi con avviso", () => {
    const PA: Scomposizione = { ...PUNTO_PRESA, id: "s-pa", codice_prezzario: "PA", parole_chiave: ["punto alimentazione"] };
    const r = generaDistinta({
      voci: [],
      scomposizioni: [PA],
      conteggi: [
        { id: "k1", simbolo: "PA", descrizione_legenda: "PUNTO ALIMENTAZIONE UTILIZZATORI", quantita: 37, documento_id: "doc", documento_nome: "Tavola FM piano terra.pdf", locale: null },
        { id: "k2", simbolo: "PLAFONIERA LED 600X600 35W", descrizione_legenda: "Plafoniera LED 600x600 35 W", quantita: 40, documento_id: "doc2", documento_nome: "LUCI.pdf", locale: "sala lettura" },
      ],
    });
    const scatole = r.righe.find((x) => x.descrizione === "Scatola da incasso 503");
    expect(scatole?.quantita_calcolata).toBe(37);
    expect(scatole?.origine).toBe("planimetria");
    expect(scatole?.planimetria_documento).toBe("Tavola FM piano terra.pdf");
    const plafo = r.righe.find((x) => x.descrizione === "Plafoniera LED 600x600 35 W");
    expect(plafo?.quantita_calcolata).toBe(40);
    expect(plafo?.locale).toBe("sala lettura");
    expect(r.avvisi.some((a) => a.tipo === "conteggio_senza_scomposizione" && a.conteggio_id === "k2")).toBe(true);
  });

  it("lo stesso materiale dal computo e dalle tavole resta su due righe, con l'avviso del possibile doppione", () => {
    const r = generaDistinta({
      voci: [voce({ id: "v1", descrizione_breve: "Punto presa 10/16 A", quantita: 37 })],
      scomposizioni: [PUNTO_PRESA],
      conteggi: [{ id: "k", simbolo: "EL.05.010", quantita: 37 }],
    });
    expect(r.righe.filter((x) => x.descrizione === "Scatola da incasso 503")).toHaveLength(2);
    expect(r.avvisi.some((a) => a.tipo === "possibile_doppione")).toBe(true);
  });
});

describe("materiali divisi per fase di lavoro", () => {
  it("la stessa scatola in due fasi resta su due righe, ognuna nella sua fase", () => {
    const r = generaDistinta({
      voci: [
        voce({ id: "v1", descrizione_breve: "Punto presa 10/16 A", quantita: 10, super_categoria: "Impianto elettrico" }),
        voce({ id: "v2", descrizione_breve: "Punto luce interrotto", quantita: 20, super_categoria: "Illuminazione" }),
      ],
      scomposizioni: [PUNTO_PRESA, PUNTO_LUCE],
      faseVoce: (v) => (v.super_categoria === "Illuminazione" ? "fase-luci" : "fase-fm"),
    });
    const scatole = r.righe.filter((x) => x.descrizione === "Scatola da incasso 503");
    expect(scatole.map((s) => [s.phase_id, s.quantita_calcolata])).toEqual(
      expect.arrayContaining([["fase-fm", 10], ["fase-luci", 20]]),
    );
  });

  it("propone la fase dal capitolo del computo e, se manca, la fase da creare", () => {
    const voci = [
      voce({ id: "a", descrizione_breve: "x", super_categoria: "IMPIANTO ELETTRICO - FM" }),
      voce({ id: "b", descrizione_breve: "y", super_categoria: "Impianti di climatizzazione (CDZ)" }),
      voce({ id: "c", descrizione_breve: "z", super_categoria: "Predisposizione antincendio" }),
      voce({ id: "d", descrizione_breve: "w", categoria: "Opere murarie" }),
    ];
    const fasi = [
      { id: "f-el", name: "Impianti elettrici" },
      { id: "f-term", name: "Impianto termoidraulico e riscaldamento" },
      { id: "f-mur", name: "Muratura e tramezzi" },
    ];
    const p = propostaFasi(voci, fasi);
    expect(p.get("IMPIANTO ELETTRICO - FM")).toBe("f-el");
    expect(p.get("Impianti di climatizzazione (CDZ)")).toBe("f-term");
    expect(p.get("Opere murarie")).toBe("f-mur");
    expect(p.get("Predisposizione antincendio")).toBeNull();
    expect(fasiDaCreare(voci, p)).toEqual(["Predisposizione antincendio"]);
  });

  it("stato d'acquisto dalla copertura degli ordini e riepilogo della fase", () => {
    const s = [
      statoAcquistoMateriale({ quantity: 10 }),
      statoAcquistoMateriale({ quantity: 10, supplier_rfq_item_id: "r" }),
      statoAcquistoMateriale({ quantity: 10, drafted: 10 }),
      statoAcquistoMateriale({ quantity: 10, issued: 10 }),
      statoAcquistoMateriale({ quantity: 10, issued: 10, received: 10 }),
    ];
    expect(s).toEqual(["da_ordinare", "in_offerta", "in_bozza_oda", "ordinato", "consegnato"]);
    const r = riepilogoFase(s.map((stato) => ({ stato, quantity: 10, purchase_price: 1.5 })));
    expect(r).toEqual({ totale: 5, daOrdinare: 1, inCorso: 2, ordinati: 1, consegnati: 1, importo: 75 });
  });
});
