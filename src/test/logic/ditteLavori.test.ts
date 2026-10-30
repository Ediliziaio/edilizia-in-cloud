import { describe, expect, it } from "vitest";
import { costoFaseDitta, dittaProposta, elencoLavoriDitta, paroleFase, periodoFasi, somiglianzaFasi } from "@/lib/orders/ditteLavori";

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
