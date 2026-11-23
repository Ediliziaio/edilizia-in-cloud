import { describe, expect, it } from "vitest";
import { messaggioParetiBloccate, paretiBloccateToccate } from "../../../shared/planimetrie/vincoli";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { eliminaMuro, modificaMuro } from "@/components/planimetrie/editor/comandi";
import { piantaCollaudo } from "../fixtures/piantaCollaudo";

const muro = (id: string, x: number, bloccato = false, stato = "esistente") => ({ id, p1: { x, y: 0 }, p2: { x, y: 400 }, spessore: 10, stato, ...(bloccato ? { bloccato } : {}) });

describe("pareti bloccate", () => {
  it("ferma spostamento, assottigliamento, demolizione e cancellazione; il resto passa", () => {
    const prima = [muro("a", 0, true), muro("b", 500)];
    expect(paretiBloccateToccate(prima, [muro("a", 0, true), muro("b", 540)])).toEqual([]);
    expect(paretiBloccateToccate(prima, [muro("a", 40, true), muro("b", 500)])).toEqual([{ id: "a", motivo: "spostata" }]);
    expect(paretiBloccateToccate(prima, [{ ...muro("a", 0, true), spessore: 8 }, muro("b", 500)])).toEqual([{ id: "a", motivo: "spostata" }]);
    expect(paretiBloccateToccate(prima, [muro("a", 0, true, "da_demolire"), muro("b", 500)])).toEqual([{ id: "a", motivo: "demolita" }]);
    expect(paretiBloccateToccate(prima, [muro("b", 500)])).toEqual([{ id: "a", motivo: "tolta" }]);
    // togliere il blocco è una scelta dell'utente: passa
    expect(paretiBloccateToccate([muro("a", 0, true)], [muro("a", 0)])).toEqual([]);
    expect(messaggioParetiBloccate([{ motivo: "demolita" }])).toMatch(/demolirebbe una parete bloccata/);
    expect(messaggioParetiBloccate([])).toBe("");
  });

  it("il blocco si salva nel documento, torna nell'editor, e demolire la parete viene riconosciuto", () => {
    const doc = piantaCollaudo();
    const pianta = modificaMuro(daPlanimetria(doc, "pt"), "t1", { bloccato: true });
    const salvato = aPlanimetria(pianta, doc, "pt");
    expect(salvato.livelli[0].fatto.muri.find((m) => m.id === "t1")?.bloccato).toBe(true);
    expect(salvato.livelli[0].fatto.muri.find((m) => m.id === "t2")?.bloccato).toBeUndefined();
    expect(validaPlanimetria(salvato)).toMatchObject({ ok: true });
    const riaperta = daPlanimetria(salvato, "pt");
    expect(riaperta.muri.find((m) => m.id === "t1")?.bloccato).toBe(true);
    expect(paretiBloccateToccate(riaperta.muri, eliminaMuro(riaperta, "t1", "progetto").muri)).toEqual([{ id: "t1", motivo: "demolita" }]);
    expect(paretiBloccateToccate(riaperta.muri, eliminaMuro(riaperta, "t2", "progetto").muri)).toEqual([]);
  });
});
