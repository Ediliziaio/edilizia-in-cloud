// src/test/logic/anteprimaAvanzamento.test.ts
import { describe, expect, it } from "vitest";
import { anteprimaAvanzamento } from "@/lib/orders/anteprimaAvanzamento";

const fase = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: `Fase ${id}`, status: "in_corso", percentuale: 20 as number | null, ...patch });
const sotto = (id: string, phase_id: string, fatta = false, peso = 1) => ({ id, phase_id, name: `Sotto ${id}`, position: 0, peso, fatta, fatta_il: null as string | null });

describe("anteprimaAvanzamento", () => {
  it("una fase libera sale alla percentuale dichiarata, e non scende", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 60 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 20, dopo: 60, chiude: false, sottofasiNuove: [], dichiarata: 60 },
    ]);
    expect(anteprimaAvanzamento([fase("a", { percentuale: 70 })], [], [{ phase_id: "a", percentuale: 30 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 70, dopo: 70, chiude: false, sottofasiNuove: [], dichiarata: 30 },
    ]);
  });

  it("100 chiude la fase", () => {
    const [riga] = anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 100 }]);
    expect(riga).toMatchObject({ prima: 20, dopo: 100, chiude: true });
  });

  it("l'avanzamento di oggi è quello vero: una fase chiusa dallo stato con la % a 0 vale 100", () => {
    expect(anteprimaAvanzamento([fase("a", { status: "completata", percentuale: 0 })], [], [{ phase_id: "a", percentuale: 50 }])).toEqual([
      { phaseId: "a", nome: "Fase a", prima: 100, dopo: 100, chiude: false, sottofasiNuove: [], dichiarata: 50 },
    ]);
  });

  it("una voce che non cambia niente non si mostra", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 20 }])).toEqual([]);
  });

  it("una fase con sottofasi: le spunte diventano fatte e l'avanzamento viene da loro", () => {
    const sottofasi = [sotto("s1", "f", true), sotto("s2", "f"), sotto("s3", "f")];
    expect(anteprimaAvanzamento([fase("f", { percentuale: 33 })], sottofasi, [{ phase_id: "f", percentuale: 99, sottofasi_fatte: ["s2"] }])).toEqual([
      { phaseId: "f", nome: "Fase f", prima: 33, dopo: 67, chiude: false, sottofasiNuove: ["Sotto s2"], dichiarata: null },
    ]);
  });

  it("tutte le sottofasi fatte chiudono la fase; già fatte e id sconosciuti non contano", () => {
    const sottofasi = [sotto("s1", "f", true), sotto("s2", "f")];
    const [riga] = anteprimaAvanzamento([fase("f", { percentuale: 50 })], sottofasi, [{ phase_id: "f", percentuale: 100, sottofasi_fatte: ["s1", "s2", "zzz"] }]);
    expect(riga).toMatchObject({ prima: 50, dopo: 100, chiude: true, sottofasiNuove: ["Sotto s2"] });
  });

  it("un rapportino scritto prima delle sottofasi (solo %) non cambia una fase che ora ne ha", () => {
    expect(anteprimaAvanzamento([fase("f")], [sotto("s1", "f")], [{ phase_id: "f", percentuale: 90 }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("f")], [sotto("s1", "f")], [{ phase_id: "f", percentuale: 90, sottofasi_fatte: [] }])).toEqual([]);
  });

  it("se le sottofasi della voce non ci sono più, vale la percentuale come per una fase libera", () => {
    expect(anteprimaAvanzamento([fase("f")], [], [{ phase_id: "f", percentuale: 60, sottofasi_fatte: ["s1"] }])).toMatchObject([{ prima: 20, dopo: 60 }]);
  });

  it("una fase che non è di questa commessa si salta; una % che non è un numero salta la voce (come fa il database); i valori si limitano a 0–100", () => {
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "altra", percentuale: 80 }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: "abc" }])).toEqual([]);
    expect(anteprimaAvanzamento([fase("a")], [], [{ phase_id: "a", percentuale: 250 }])[0]).toMatchObject({ dopo: 100, dichiarata: 100 });
  });
});
