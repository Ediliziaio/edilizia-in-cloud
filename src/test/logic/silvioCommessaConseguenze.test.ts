/**
 * Quello che una modifica del popup si porta dietro (01/11/2026): la data d'inizio nuova
 * sposta anche le fasi già datate; togliere una ditta toglie il suo contratto.
 */
import { describe, expect, it } from "vitest";
import { applica, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import type { PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { conConseguenze } from "@/components/silvio-commessa/useBozzaSilvio";

const fonte = { tipo: "preventivo" as const, etichetta: "preventivo PR-0001" };
function piano(): PianoCommessa {
  const p = pianoVuoto("d2000000-0000-4000-a000-000000000002");
  p.aree.fasi = {
    "fasi.work_start_date": { valore: "2026-12-01", fiducia: 1, stato: "fatto", fonte },
    "fasi.order_work_phases": {
      valore: [{ name: "Demolizioni", start_date: "2026-12-01", end_date: "2026-12-03" }, { name: "Impianti", start_date: "2026-12-04", end_date: "2026-12-09" }],
      fiducia: 1, stato: "fatto", fonte,
    },
  };
  p.aree.ditte = {
    "ditte.assegnate": { valore: [{ nome: "Ditta Uno" }, { nome: "Ditta Due" }], fiducia: 0.9, stato: "proposta", fonte },
    "ditte.contratti": { valore: [{ nome: "Ditta Due" }, { nome: "Ditta Uno" }], fiducia: 0.9, stato: "proposta", fonte },
  };
  return p;
}

describe("conConseguenze", () => {
  it("l'inizio due settimane dopo sposta le fasi degli stessi giorni lavorativi (l'8 dicembre è festa)", () => {
    const p = piano();
    const m = conConseguenze(p, [{ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-12-15" }]);
    expect(m[0]).toEqual({ tipo: "sposta_date", giorniLavorativi: 9, daFase: null });
    let x = p;
    for (const k of m) x = applica(x, k).piano;
    const fasi = x.aree.fasi!["fasi.order_work_phases"].valore as { start_date: string }[];
    expect(fasi[0].start_date).toBe("2026-12-15");
    expect(x.aree.fasi!["fasi.work_start_date"].valore).toBe("2026-12-15");
  });

  it("la stessa data non sposta niente", () => {
    const m = conConseguenze(piano(), [{ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-12-01" }]);
    expect(m).toHaveLength(1);
  });

  it("togliere una ditta toglie il suo contratto; tutte le ditte, tutti i contratti", () => {
    const una = conConseguenze(piano(), [{ tipo: "togli", area: "ditte", chiave: "ditte.assegnate", indice: 0 }]);
    expect(una[1]).toEqual({ tipo: "togli", area: "ditte", chiave: "ditte.contratti", indice: 1 });
    const tutte = conConseguenze(piano(), [{ tipo: "togli", area: "ditte", chiave: "ditte.assegnate" }]);
    expect(tutte[1]).toEqual({ tipo: "togli", area: "ditte", chiave: "ditte.contratti" });
  });
});
