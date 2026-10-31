import { describe, expect, it } from "vitest";
import { costoFaseDitta, dittaProposta, elencoLavoriDitta, paroleFase, periodoFasi, somiglianzaFasi, contrattoDellaDitta, schedeSicurezzaDitta, prezzoListinoPerDitta, elencoDaSalvare } from "@/lib/orders/ditteLavori";

// I nomi veri delle fasi di Dimora Torino (O-0001 e O-0002).
const storico = [
  { fase: "Impianto idraulico", external_team_id: "termotecnico" },
  { fase: "Impianto gas", external_team_id: "termotecnico" },
  { fase: "Riscaldamento", external_team_id: "termotecnico" },
  { fase: "Climatizzazione", external_team_id: "termotecnico" },
  { fase: "Impianto elettrico", external_team_id: "elettricista" },
  { fase: "Decorazione", external_team_id: "decoratore" },
  { fase: "Cartongesso", external_team_id: "cartongessista" },
  { fase: "Demolizione", external_team_id: "decoredil" },
  { fase: "Sottofondi e massetti", external_team_id: "felice" },
];

describe("ditta proposta dalle commesse passate", () => {
  it("plurali, maiuscole e «impianto di» non contano", () => {
    expect(paroleFase("IMPIANTO DI RISCALDAMENTO")).toEqual(["riscaldament"]);
    expect(somiglianzaFasi("CARTONGESSI", "Cartongesso")).toBe(1);
    expect(somiglianzaFasi("DEMOLIZIONI E SMALTIMENTI", "Demolizione")).toBe(0.5);
  });
  it("propone la ditta che fa sempre quel lavoro", () => {
    expect(dittaProposta("IMPIANTO IDRAULICO", storico)?.external_team_id).toBe("termotecnico");
    expect(dittaProposta("IMPIANTO DI RISCALDAMENTO", storico)?.external_team_id).toBe("termotecnico");
    expect(dittaProposta("IMPIANTO ELETTRICO", storico)?.external_team_id).toBe("elettricista");
    expect(dittaProposta("DECORAZIONE", storico)).toMatchObject({ external_team_id: "decoratore", come: "Decorazione" });
    expect(dittaProposta("SOTTOFONDI E MASSETTI", storico)?.external_team_id).toBe("felice");
  });
  it("senza fasi simili non propone niente", () => {
    expect(dittaProposta("Serramenti", storico)).toBeNull();
    expect(dittaProposta("Impianto", storico)).toBeNull();
  });
});

const fasi = [
  { id: "b", name: "Impianto gas", position: 2, start_date: "2026-11-10", end_date: "2026-11-12" },
  { id: "a", name: "Impianto idraulico", position: 1, start_date: "2026-11-03", end_date: "2026-11-07" },
  { id: "c", name: "Decorazione", position: 3, start_date: "2026-11-20", end_date: "2026-11-25" },
];
const voci = [
  { id: "1", phase_id: "a", position: 1, descrizione: "Punto acqua", unita: "pz", quantita: 6, costo_manodopera: 80, tariffa_id: "t1", origine_codice: "ID.01" },
  { id: "2", phase_id: "a", position: 2, descrizione: "Scarico", unita: "pz", quantita: 2, costo_manodopera: 50, tariffa_id: "t2" },
  { id: "3", phase_id: "b", position: 1, descrizione: "Linea gas", unita: "ml", quantita: 12.5, costo_manodopera: 20, tariffa_id: null },
  { id: "4", phase_id: "c", position: 1, descrizione: "Pittura", unita: "mq", quantita: 100, costo_manodopera: 6, tariffa_id: null },
];
const varianti = [{ tariffa_id: "t1", external_team_id: "termotecnico", costo: 70, attivo: true }];

describe("elenco dei lavori della ditta", () => {
  it("voci delle sue fasi, nell'ordine delle fasi, al suo prezzo di listino", () => {
    const e = elencoLavoriDitta(fasi, voci, ["b", "a"], "termotecnico", varianti);
    expect(e.map((r) => r.descrizione)).toEqual(["Punto acqua", "Scarico", "Linea gas"]);
    expect(e[0]).toMatchObject({ fase: "Impianto idraulico", prezzo: 70, importo: 420, codice: "ID.01" });
    expect(e[2]).toMatchObject({ quantita: 12.5, importo: 250 });
  });
  it("costo previsto della fase e periodo del contratto", () => {
    expect(costoFaseDitta("a", voci, "termotecnico", varianti)).toBe(520);
    expect(costoFaseDitta("a", voci, "altra", varianti)).toBe(580);
    expect(periodoFasi(fasi, ["a", "b"])).toEqual({ dal: "2026-11-03", al: "2026-11-12" });
  });
});

describe("le due schede della ditta: campo e sicurezza", () => {
  const schede = [
    { id: "sic-altra-commessa", campo_subappaltatore_id: "campo-1", order_id: "altra", created_at: "2026-10-01" },
    { id: "sic-generale", campo_subappaltatore_id: "campo-1", order_id: null, created_at: "2026-10-21" },
    { id: "sic-commessa", campo_subappaltatore_id: "campo-1", order_id: "o1", created_at: "2026-10-25" },
    { id: "sic-altro", campo_subappaltatore_id: "campo-2", order_id: null, created_at: "2026-10-21" },
  ];

  it("trova il contratto anche se punta alla scheda sicurezza (id diverso dalla ditta)", () => {
    const contratti = [{ id: "c1", subappaltatore_id: "sic-generale" }, { id: "c2", subappaltatore_id: "sic-altro" }];
    expect(contrattoDellaDitta("campo-1", contratti, schede)?.id).toBe("c1");
    expect(contrattoDellaDitta("campo-2", contratti, schede)?.id).toBe("c2");
    expect(contrattoDellaDitta("campo-3", contratti, schede)).toBeNull();
    expect(contrattoDellaDitta(null, contratti, schede)).toBeNull();
  });

  it("un contratto risolto non blocca il contratto nuovo con la stessa ditta", () => {
    const solo = [{ id: "vecchio", subappaltatore_id: "campo-1", stato: "risolto" }];
    expect(contrattoDellaDitta("campo-1", solo, [])).toBeNull();
    const due = [...solo, { id: "nuovo", subappaltatore_id: "campo-1", stato: "bozza" }];
    expect(contrattoDellaDitta("campo-1", due, [])?.id).toBe("nuovo");
  });

  it("per un contratto nuovo usa prima la scheda della commessa, poi quella generale, mai quella di un'altra commessa", () => {
    expect(schedeSicurezzaDitta("campo-1", schede, "o1").map((s) => s.id)).toEqual(["sic-commessa", "sic-generale"]);
    expect(schedeSicurezzaDitta("campo-1", schede, "o2").map((s) => s.id)).toEqual(["sic-generale"]);
    expect(schedeSicurezzaDitta(null, schede, "o1")).toEqual([]);
  });
});

describe("elenco dei lavori del contratto, modificabile", () => {
  const varianti = [{ tariffa_id: "t1", external_team_id: "d1", costo: 12, is_default: true, attivo: true, sort_order: 0 }];
  it("propone il prezzo concordato con la ditta, altrimenti il costo del listino", () => {
    expect(prezzoListinoPerDitta({ id: "t1", costo: 15 }, "d1", varianti as never)).toEqual({ prezzo: 12, concordato: true });
    expect(prezzoListinoPerDitta({ id: "t1", costo: 15 }, "d2", varianti as never)).toEqual({ prezzo: 15, concordato: false });
    expect(prezzoListinoPerDitta({ id: "t2", costo: 9 }, null, varianti as never)).toEqual({ prezzo: 9, concordato: false });
  });
  it("rifà gli importi e scarta righe vuote o a quantità zero", () => {
    const righe = elencoDaSalvare([
      { fase: "Demolizione", descrizione: " Tramezzi ", unita: "mq", quantita: 14.55, prezzo: 15, importo: 0 },
      { fase: "", descrizione: "Extra", unita: "cad", quantita: 1, prezzo: 99.999, importo: 0 },
      { fase: "X", descrizione: "   ", unita: null, quantita: 2, prezzo: 1, importo: 2 },
      { fase: "X", descrizione: "Zero", unita: null, quantita: 0, prezzo: 1, importo: 0 },
    ]);
    expect(righe).toEqual([
      { fase: "Demolizione", descrizione: "Tramezzi", unita: "mq", quantita: 14.55, prezzo: 15, importo: 218.25 },
      { fase: "Altri lavori", descrizione: "Extra", unita: "cad", quantita: 1, prezzo: 99.999, importo: 100 },
    ]);
  });
});
