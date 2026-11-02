import { describe, expect, it } from "vitest";
import { passiPerPartire, perPartireServe } from "@/lib/orders/generali/perPartire";
import { controllaRaggruppo, effettoSpostamento } from "@/lib/orders/listaGenerali";

/** Commesse generali: i pezzi del piano completati il 02/11/2026 (Per partire, F3, F8). */
describe("«Per partire»", () => {
  const vuota = { figlie: 0, contrattoCompilato: false, vociPianoConImporto: 0, fonti: 0 };

  it("i passi dipendono dal modello", () => {
    expect(passiPerPartire("appalto", vuota).map((p) => p.id)).toEqual(["contratto", "figlie", "piano"]);
    expect(passiPerPartire("sviluppo", vuota).map((p) => p.id)).toEqual(["figlie", "piano", "fonti"]);
  });

  it("un passo di cui non si sa niente non compare: meglio tacere che dire «da fare»", () => {
    expect(passiPerPartire("appalto", { ...vuota, contrattoCompilato: null, vociPianoConImporto: null }).map((p) => p.id)).toEqual(["figlie"]);
  });

  it("il piano con le voci tipiche a zero è ancora da scrivere", () => {
    expect(passiPerPartire("sviluppo", { ...vuota, figlie: 4, vociPianoConImporto: 0 }).find((p) => p.id === "piano")?.fatto).toBe(false);
  });

  it("sparisce quando è tutto fatto", () => {
    const fatti = passiPerPartire("sviluppo", { figlie: 2, contrattoCompilato: null, vociPianoConImporto: 1, fonti: 1 });
    expect(perPartireServe(fatti)).toBe(false);
    expect(perPartireServe(passiPerPartire("sviluppo", vuota))).toBe(true);
  });
});

describe("spostare una commessa", () => {
  it("chi la perde ha meno assegnato e più da assegnare, chi la riceve il contrario", () => {
    expect(effettoSpostamento({ assegnato: 1000, daAssegnare: 500 }, 300, -1)).toEqual({ assegnatoDopo: 700, daAssegnareDopo: 800 });
    expect(effettoSpostamento({ assegnato: 1000, daAssegnare: 100 }, 300, 1)).toEqual({ assegnatoDopo: 1300, daAssegnareDopo: -200 });
  });

  it("senza valore o senza permesso non inventa numeri", () => {
    expect(effettoSpostamento({ assegnato: null, daAssegnare: null }, 300, -1)).toEqual({ assegnatoDopo: null, daAssegnareDopo: null });
  });
});

describe("raggruppare commesse", () => {
  const mappa = { figliePerGenerale: new Map([["g", 1]]), generaleDellaFiglia: new Map([["dentro", {}]]) };

  it("stesso cliente: proposto da solo, con il totale", () => {
    const c = controllaRaggruppo([{ id: "a", customer_id: "c1", total_amount: 100.1 }, { id: "b", customer_id: "c1", total_amount: 200.2 }], mappa);
    expect(c).toMatchObject({ commesse: ["a", "b"], clienteUnico: "c1", clientiDiversi: false, totale: 300.3 });
  });

  it("clienti diversi o una commessa senza cliente: nessun cliente proposto", () => {
    expect(controllaRaggruppo([{ id: "a", customer_id: "c1" }, { id: "b", customer_id: "c2" }], mappa)).toMatchObject({ clienteUnico: null, clientiDiversi: true });
    expect(controllaRaggruppo([{ id: "a", customer_id: "c1" }, { id: "b", customer_id: null }], mappa)).toMatchObject({ clienteUnico: null, clientiDiversi: false });
  });

  it("una generale resta fuori; una commessa già dentro un'altra generale si segnala", () => {
    const c = controllaRaggruppo([{ id: "g" }, { id: "dentro" }, { id: "a" }], mappa);
    expect(c.commesse).toEqual(["dentro", "a"]);
    expect(c.generaliEscluse).toBe(1);
    expect(c.giaInUnaGenerale).toBe(1);
  });
});
