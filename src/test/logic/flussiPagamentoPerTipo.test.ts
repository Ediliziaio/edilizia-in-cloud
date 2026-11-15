/**
 * I modi in cui un'impresa edile viene pagata (15/11/2026): ogni commessa mostra il suo strumento, non tutti.
 * - serramenti ad acconto e saldo: niente «SAL al cliente»;
 * - ristrutturazione a SAL: la vista c'è (rate «al SAL» o SAL già fatti);
 * - lavoro in appalto per un committente: il Rendiconto, non un secondo «SAL»;
 * - figlia di una commessa generale: il SAL di contratto sta nella generale.
 * E la ritenuta decisa nel preventivo con computo arriva alla commessa.
 */
import { describe, expect, it } from "vitest";
import { mostraSalAlCliente } from "@/lib/orders/detailNavigation";
import { ritenutaPerCommessa } from "@/lib/computo/commessaDaComputo";

const base = { salEsistenti: 0, inAppalto: false, figliaDiGenerale: false, rate: [] as Array<{ trigger_evento?: string | null }>, aziendaUsaSal: false };

describe("«SAL al cliente» solo dove serve", () => {
  it("serramenti ad acconto e saldo, in un'azienda che non fa SAL: niente vista", () => {
    expect(mostraSalAlCliente({ ...base, rate: [{ trigger_evento: "firma_contratto" }, { trigger_evento: "data_posa" }] })).toBe(false);
  });
  it("ristrutturazione con rate «al SAL» o «al X% dei lavori»: la vista c'è", () => {
    expect(mostraSalAlCliente({ ...base, rate: [{ trigger_evento: "firma_contratto" }, { trigger_evento: "sal_numero" }] })).toBe(true);
    expect(mostraSalAlCliente({ ...base, rate: [{ trigger_evento: "sal_percentuale" }] })).toBe(true);
  });
  it("un'azienda che i SAL li fa già li ritrova su ogni commessa cliente", () => {
    expect(mostraSalAlCliente({ ...base, aziendaUsaSal: true })).toBe(true);
  });
  it("lavoro in appalto o figlia di una generale: c'è il Rendiconto o il SAL di contratto", () => {
    expect(mostraSalAlCliente({ ...base, inAppalto: true, aziendaUsaSal: true, rate: [{ trigger_evento: "sal_numero" }] })).toBe(false);
    expect(mostraSalAlCliente({ ...base, figliaDiGenerale: true, aziendaUsaSal: true })).toBe(false);
  });
  it("i SAL già fatti non spariscono mai", () => {
    expect(mostraSalAlCliente({ ...base, salEsistenti: 2, inAppalto: true })).toBe(true);
  });
});

describe("la ritenuta del preventivo con computo passa alla commessa", () => {
  it("con una percentuale scritta all'italiana", () => {
    expect(ritenutaPerCommessa({ percentuale: "0,50", su: "tutte", svincolo: "collaudo", mesi: 12 }))
      .toEqual({ percentuale: 0.5, su: "tutte", svincolo: "collaudo", mesi: 12 });
    expect(ritenutaPerCommessa({ percentuale: "5", su: "sal", svincolo: "mesi", mesi: 24 })).toMatchObject({ percentuale: 5, svincolo: "mesi", mesi: 24 });
  });
  it("vuota o senza senso: nessuna ritenuta", () => {
    expect(ritenutaPerCommessa({ percentuale: "" })).toBeNull();
    expect(ritenutaPerCommessa({ percentuale: "150" })).toBeNull();
    expect(ritenutaPerCommessa(undefined)).toBeNull();
  });
});
