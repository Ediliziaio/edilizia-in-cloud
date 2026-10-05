// Il prezzo del preventivo fotovoltaico, calcolato sul wizard come lo calcola il
// server: le righe dei componenti (una funzione sola, usata dal salvataggio della
// Fase 5 e dall'anteprima) e il prezzo con sconto, IVA e margine.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ArticoloFv,
  type ConfigurazioneComponentiFv,
  righeComponentiFv,
} from "@/lib/fotovoltaico/componentiConfigurazione";
import { type InputPrezzoFv, calcolaPrezzoFv } from "@/lib/fotovoltaico/prezzoPreventivo";

const CONFIG: ConfigurazioneComponentiFv = {
  kit_bundle_id: null, kit_nome: null, kit_prezzo: null, potenza_kwp: 8.64, con_accumulo: false, capacita_accumulo_kwh: 0,
  numero_pannelli_scelti: 16, pannello_id: null, inverter_id: null, accumulo_id: null, prodotti_extra: [],
};

const PANNELLI: ArticoloFv[] = [{ id: "p1", descrizione: "Pannello 540 W", prezzo_vendita: 150, prezzo_acquisto: 90, potenza_w: 540, garanzia_anni: 25 }];
const INVERTER: ArticoloFv[] = [{ id: "i1", descrizione: "Inverter 6 kW", prezzo_vendita: 1200, prezzo_acquisto: 800, potenza_kw: 6 }];
const ACCUMULI: ArticoloFv[] = [{ id: "a1", descrizione: "Batteria 10 kWh", prezzo_vendita: 5200, prezzo_acquisto: 3900, capacita_kwh: 10, garanzia_anni: 12 }];
const LISTINO = { pannelli: PANNELLI, inverter: INVERTER, accumuli: ACCUMULI };

describe("righeComponentiFv — le righe che la Fase 5 salva e l'anteprima mostra", () => {
  it("un kit chiavi in mano è una voce sola col prezzo del kit, senza costo noto", () => {
    const righe = righeComponentiFv({ ...CONFIG, kit_bundle_id: "k1", kit_nome: "Kit 6 kWp + batteria", kit_prezzo: 9800, potenza_kwp: 6, con_accumulo: true, capacita_accumulo_kwh: 10 }, LISTINO);
    expect(righe).toEqual([{
      articolo_id: null, categoria: "altro", descrizione: "Kit 6 kWp + batteria", quantita: 1, unita_misura: "kit",
      prezzo_unitario_netto: 0, prezzo_unitario_vendita: 9800, margine_pct: null, potenza_unitaria_w: null,
      potenza_unitaria_kw: 6, capacita_kwh: 10, garanzia_anni: 25, ordinamento: 1,
    }]);
  });

  it("un kit senza nome si chiama dalla potenza; senza prezzo non è un kit: si va dal listino", () => {
    expect(righeComponentiFv({ ...CONFIG, kit_bundle_id: "k1", kit_prezzo: 5000, potenza_kwp: 4.32 }, LISTINO)[0].descrizione).toBe("Kit FV 4.32 kWp");
    expect(righeComponentiFv({ ...CONFIG, kit_bundle_id: "k1", kit_prezzo: null, pannello_id: "p1" }, LISTINO).map((r) => r.categoria)).toEqual(["pannello"]);
  });

  it("pannello e inverter dal listino: quantità, prezzi, margine, garanzia di serie", () => {
    const [pannello, inverter] = righeComponentiFv({ ...CONFIG, pannello_id: "p1", inverter_id: "i1" }, LISTINO);
    expect(pannello).toMatchObject({
      articolo_id: "p1", categoria: "pannello", descrizione: "Pannello 540 W", quantita: 16, prezzo_unitario_netto: 90,
      prezzo_unitario_vendita: 150, potenza_unitaria_w: 540, garanzia_anni: 25, ordinamento: 1,
    });
    expect(pannello.margine_pct).toBeCloseTo(0.4, 10); // (150 − 90) / 150
    expect(inverter).toMatchObject({ articolo_id: "i1", categoria: "inverter", quantita: 1, potenza_unitaria_kw: 6, garanzia_anni: 10, ordinamento: 2 });
  });

  it("l'accumulo c'è solo se acceso: dal listino col suo modello, altrimenti generico a 800 € al kWh senza costo", () => {
    const base = { ...CONFIG, pannello_id: "p1", inverter_id: "i1", capacita_accumulo_kwh: 10 };
    expect(righeComponentiFv({ ...base, con_accumulo: false, accumulo_id: "a1" }, LISTINO).map((r) => r.categoria)).toEqual(["pannello", "inverter"]);
    const conModello = righeComponentiFv({ ...base, con_accumulo: true, accumulo_id: "a1" }, LISTINO).at(-1)!;
    expect(conModello).toMatchObject({ articolo_id: "a1", categoria: "accumulo", descrizione: "Batteria 10 kWh", prezzo_unitario_vendita: 5200, capacita_kwh: 10, garanzia_anni: 12, ordinamento: 3 });
    const generico = righeComponentiFv({ ...base, con_accumulo: true, accumulo_id: null }, LISTINO).at(-1)!;
    expect(generico).toMatchObject({ articolo_id: null, descrizione: "Accumulo 10 kWh", prezzo_unitario_vendita: 8000, prezzo_unitario_netto: 0, margine_pct: null, capacita_kwh: 10, garanzia_anni: 10 });
  });

  it("un modello non scelto (o sparito dal listino) non fa una riga", () => {
    expect(righeComponentiFv({ ...CONFIG, pannello_id: null, inverter_id: "i-che-non-c-e" }, LISTINO)).toEqual([]);
  });

  it("i prodotti extra: via quelli senza nome o a quantità 0, nome ripulito, ordine dal loro posto nell'elenco", () => {
    const righe = righeComponentiFv({
      ...CONFIG,
      prodotti_extra: [
        { descrizione: "  ", quantita: 1, prezzo_vendita: 100, prezzo_acquisto: null },
        { descrizione: " Colonnina 7 kW ", quantita: 1, prezzo_vendita: 1500, prezzo_acquisto: 1000 },
        { descrizione: "Cavo", quantita: 0, prezzo_vendita: 10, prezzo_acquisto: 5 },
        { descrizione: "Climatizzatore", quantita: 2, prezzo_vendita: 900, prezzo_acquisto: null },
      ],
    }, LISTINO);
    expect(righe.map((r) => [r.descrizione, r.ordinamento, r.quantita])).toEqual([["Colonnina 7 kW", 11, 1], ["Climatizzatore", 13, 2]]);
    expect(righe[0]).toMatchObject({ categoria: "altro", unita_misura: "pz", prezzo_unitario_netto: 1000, prezzo_unitario_vendita: 1500 });
    expect(righe[0].margine_pct).toBeCloseTo(1 / 3, 10);
    expect(righe[1]).toMatchObject({ prezzo_unitario_netto: 0, margine_pct: null });
  });

  it("gli extra si aggiungono anche al kit", () => {
    const righe = righeComponentiFv({ ...CONFIG, kit_bundle_id: "k1", kit_prezzo: 7000, prodotti_extra: [{ descrizione: "Wallbox", quantita: 1, prezzo_vendita: 1200, prezzo_acquisto: 800 }] }, LISTINO);
    expect(righe.map((r) => r.categoria)).toEqual(["altro", "altro"]);
    expect(righe.map((r) => r.unita_misura)).toEqual(["kit", "pz"]);
  });
});

const INPUT: InputPrezzoFv = {
  componenti: [
    { quantita: 16, prezzo_unitario_vendita: 150, prezzo_unitario_netto: 90 }, // 2.400 / 1.440
    { quantita: 1, prezzo_unitario_vendita: 1200, prezzo_unitario_netto: 800 }, // 1.200 / 800
  ],
  manodopera: [{ ore: 20, tariffa_oraria_vendita: 40, tariffa_oraria_netta: 25 }], // 800 / 500
  servizi: [{ quantita: 1, prezzo_vendita: 600, prezzo_netto: 400 }], // 600 / 400
  prezzoManuale: null,
  sconto: { tipo: null, valore: null },
  scontoMaxPct: 10,
  margineMinPct: 0,
  ivaAliquota: 0.1,
};

describe("calcolaPrezzoFv — il prezzo come lo calcola il server", () => {
  it("senza sconto: somma di componenti, manodopera e servizi, IVA 10%, margine sui costi veri", () => {
    const p = calcolaPrezzoFv(INPUT);
    expect(p.prezzoPieno).toBe(5000);
    expect(p.costoNetto).toBe(3140);
    expect(p).toMatchObject({ imponibile: 5000, ivaImporto: 500, totale: 5500, scontoApplicato: 0, scontoLimitato: false, costiIncompleti: false, righeSenzaCosto: 0 });
    expect(p.margineEur).toBe(1860);
    expect(p.marginePct).toBeCloseTo(37.2, 5);
  });

  it("sconto in % entro le regole: si toglie dall'imponibile e l'IVA va sul netto", () => {
    const p = calcolaPrezzoFv({ ...INPUT, sconto: { tipo: "pct", valore: 5 } });
    expect(p).toMatchObject({ scontoRichiesto: 250, scontoApplicato: 250, scontoLimitato: false, imponibile: 4750, totale: 5225 });
    expect(p.margineEur).toBe(1610);
  });

  it("sconto in euro oltre il massimo delle regole: lo limita (10% di 5.000 = 500) e lo dice", () => {
    const p = calcolaPrezzoFv({ ...INPUT, sconto: { tipo: "importo", valore: 800 } });
    expect(p).toMatchObject({ scontoRichiesto: 800, scontoApplicato: 500, scontoLimitato: true, imponibile: 4500, totale: 4950 });
  });

  it("il margine minimo delle regole limita lo sconto: con i costi veri, (P − s − C)/(P − s) ≥ m", () => {
    // m = 30%: s ≤ 5.000 − 3.140/0,7 = 514,29 → il tetto delle regole (500) resta il più basso
    expect(calcolaPrezzoFv({ ...INPUT, margineMinPct: 30, sconto: { tipo: "pct", valore: 5 } }).scontoApplicato).toBe(250);
    expect(calcolaPrezzoFv({ ...INPUT, margineMinPct: 30, scontoMaxPct: 50, sconto: { tipo: "importo", valore: 900 } }).scontoApplicato).toBe(514.29);
    // m = 40%: già a prezzo pieno il margine (37,2%) è sotto il minimo → nessuno sconto
    const p = calcolaPrezzoFv({ ...INPUT, margineMinPct: 40, sconto: { tipo: "pct", valore: 5 } });
    expect(p).toMatchObject({ scontoApplicato: 0, scontoLimitato: true, imponibile: 5000 });
  });

  it("un componente venduto senza costo: i costi sono incompleti, il margine non c'è e il tetto di margine non si verifica", () => {
    const p = calcolaPrezzoFv({
      ...INPUT,
      componenti: [...INPUT.componenti, { quantita: 1, prezzo_unitario_vendita: 900, prezzo_unitario_netto: 0 }],
      margineMinPct: 40,
      sconto: { tipo: "pct", valore: 5 },
    });
    expect(p.costiIncompleti).toBe(true);
    expect(p.righeSenzaCosto).toBe(1);
    expect(p.margineEur).toBeNull();
    expect(p.marginePct).toBeNull();
    // senza costi veri vale solo il massimo delle regole (10% di 5.900 = 590): 5% di 5.900 = 295
    expect(p.scontoApplicato).toBe(295);
  });

  it("manodopera e servizi venduti senza costo contano come righe senza costo", () => {
    const p = calcolaPrezzoFv({
      ...INPUT,
      manodopera: [{ ore: 10, tariffa_oraria_vendita: 40, tariffa_oraria_netta: 0 }],
      servizi: [{ quantita: 1, prezzo_vendita: 300, prezzo_netto: 0 }, { quantita: 1, prezzo_vendita: 0, prezzo_netto: 0 }],
    });
    expect(p.righeSenzaCosto).toBe(2); // il servizio a 0 € non è venduto: non gli manca il costo
    expect(p.costiIncompleti).toBe(true);
  });

  it("col prezzo a corpo vale quello: lo sconto non si applica e il margine è prezzo meno costi di tutte le righe", () => {
    const p = calcolaPrezzoFv({ ...INPUT, prezzoManuale: 4000, sconto: { tipo: "pct", valore: 5 } });
    expect(p).toMatchObject({ usaPrezzoManuale: true, scontoApplicato: 0, scontoLimitato: false, imponibile: 4000, totale: 4400 });
    expect(p.margineEur).toBe(860);
  });

  it("un kit (costo non noto) non ha margine; il totale è il prezzo del kit più IVA", () => {
    const p = calcolaPrezzoFv({
      ...INPUT,
      componenti: [{ quantita: 1, prezzo_unitario_vendita: 9800, prezzo_unitario_netto: 0 }],
      manodopera: [], servizi: [],
    });
    expect(p).toMatchObject({ prezzoPieno: 9800, costiIncompleti: true, totale: 10780 });
    expect(p.margineEur).toBeNull();
  });

  it("senza righe non c'è niente da sommare: tutto a zero, costi incompleti", () => {
    const p = calcolaPrezzoFv({ ...INPUT, componenti: [], manodopera: [], servizi: [] });
    expect(p).toMatchObject({ prezzoPieno: 0, imponibile: 0, totale: 0, costiIncompleti: true, margineEur: null, marginePct: null });
  });

  it("l'aliquota IVA è quella del preventivo: 22%, 4%, 0%", () => {
    expect(calcolaPrezzoFv({ ...INPUT, ivaAliquota: 0.22 }).totale).toBe(6100);
    expect(calcolaPrezzoFv({ ...INPUT, ivaAliquota: 0.04 }).totale).toBe(5200);
    expect(calcolaPrezzoFv({ ...INPUT, ivaAliquota: 0 })).toMatchObject({ totale: 5000, ivaImporto: 0 });
  });
});

describe("calcolaPrezzoFv — resta uguale al calcolo del server", () => {
  const server = readFileSync(resolve(process.cwd(), "supabase/functions/fv-calcolo-finanziario/index.ts"), "utf8");

  it("il server ha ancora le formule che qui si ripetono (se cambiano, cambia anche prezzoPreventivo.ts)", () => {
    expect(server).toContain("const prezzo_pieno_netto = costo_componenti_vendita + costo_manodopera_vendita + costo_servizi_vendita;");
    expect(server).toContain("const costo_totale_netto = costo_componenti_netto + costo_manodopera_netto + costo_servizi_netto;");
    expect(server).toContain("const capRegoleEur = prezzo_pieno_netto * (scontoMaxPct / 100);");
    expect(server).toContain("Math.max(0, prezzo_pieno_netto - costo_totale_netto / (1 - margineMinPct / 100))");
    expect(server).toContain("const sconto_eur_applicato = usaPrezzoManuale ? 0 : round2(Math.min(sconto_eur_richiesto, scontoCapEur));");
    expect(server).toContain(": round2(prezzo_pieno_netto - sconto_eur_applicato);");
    expect(server).toContain("const prezzo_vendita_iva_inclusa = prezzo_vendita_netto * (1 + iva_aliquota);");
    expect(server).toContain("const margine_eur = prezzo_vendita_netto - costo_totale_netto;");
    expect(server).toContain("margine_eur: costi_incompleti ? null : round2(margine_eur)");
  });

  it("e la regola dei costi incompleti è la stessa", () => {
    expect(server).toContain("costo_totale_netto <= 0 ||");
    expect(server).toContain("componenti.some((c: Record<string, unknown>) => Number(c.quantita) > 0 && !(Number(c.prezzo_unitario_netto) > 0))");
    expect(server).toContain("const senzaCosto = (vendita: unknown, netto: unknown) => Number(vendita) > 0 && !(Number(netto) > 0);");
  });
});
