import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aPlanimetria, daPlanimetria, duplicaProposta, eliminaProposta, prossimaProposta, rinominaProposta,
} from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));
const conProposta = (doc: Planimetria) => doc.livelli.find((l) => l.proposte.length > 0)!;

describe("proposte B, C… (fase 5)", () => {
  it("duplica la proposta con un id nuovo e un nome, senza toccare l'originale", () => {
    const doc = carica("trilocale.json");
    const liv = conProposta(doc);
    const r = duplicaProposta(doc, liv.id, liv.proposte[0].id);
    const dopo = r.documento.livelli.find((l) => l.id === liv.id)!;
    expect(dopo.proposte).toHaveLength(liv.proposte.length + 1);
    expect(r.id).toBe(prossimaProposta(liv));
    const nuova = dopo.proposte.find((p) => p.id === r.id)!;
    expect(nuova.nome).toBe(`Proposta ${r.id}`);
    expect(nuova.muri).toEqual(liv.proposte[0].muri);
    expect(validaPlanimetria(r.documento).ok).toBe(true);
    expect(doc.livelli.find((l) => l.id === liv.id)!.proposte).toHaveLength(liv.proposte.length);
  });

  it("modificare la B nell'editor non cambia la A", () => {
    const doc = carica("trilocale.json");
    const liv = conProposta(doc);
    const a = liv.proposte[0].id;
    const { documento, id: b } = duplicaProposta(doc, liv.id, a);
    const pianta = daPlanimetria(documento, liv.id, b);
    const wc = CATALOGO.find((v) => v.tipo === "wc")!;
    const r = C.aggiungiElemento(pianta, wc, { x: 10, y: 10 });
    const salvato = aPlanimetria(r.pianta, documento, liv.id, b);
    const l2 = salvato.livelli.find((l) => l.id === liv.id)!;
    expect(l2.proposte.find((p) => p.id === b)!.elementi.some((e) => e.id === r.id)).toBe(true);
    expect(l2.proposte.find((p) => p.id === a)!.elementi.some((e) => e.id === r.id)).toBe(false);
    expect(l2.proposte.find((p) => p.id === a)).toEqual(liv.proposte[0]);
    expect(validaPlanimetria(salvato).ok).toBe(true);
  });

  it("andata e ritorno sulla B non cambia le quantità", () => {
    const doc = carica("trilocale.json");
    const liv = conProposta(doc);
    const { documento, id } = duplicaProposta(doc, liv.id);
    const dopo = aPlanimetria(daPlanimetria(documento, liv.id, id), documento, liv.id, id);
    expect(calcolaQuantita(dopo)).toEqual(calcolaQuantita(documento));
  });

  it("rinomina e toglie", () => {
    const doc = carica("trilocale.json");
    const liv = conProposta(doc);
    const { documento, id } = duplicaProposta(doc, liv.id);
    const r = rinominaProposta(documento, liv.id, id, "  Bagno con vasca ");
    expect(r.livelli.find((l) => l.id === liv.id)!.proposte.find((p) => p.id === id)!.nome).toBe("Bagno con vasca");
    expect(rinominaProposta(documento, liv.id, id, "   ")).toBe(documento);
    const t = eliminaProposta(r, liv.id, id);
    expect(t.livelli.find((l) => l.id === liv.id)!.proposte.map((p) => p.id)).toEqual(liv.proposte.map((p) => p.id));
  });

  it("le lettere libere vanno in ordine", () => {
    const liv = conProposta(carica("trilocale.json"));
    expect(prossimaProposta({ ...liv, proposte: [] })).toBe("A");
    expect(prossimaProposta({ ...liv, proposte: [{ ...liv.proposte[0], id: "A" }, { ...liv.proposte[0], id: "C" }] })).toBe("B");
  });
});
