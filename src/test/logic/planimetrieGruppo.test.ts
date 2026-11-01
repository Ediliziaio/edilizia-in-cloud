import { describe, expect, it } from "vitest";
import { aPlanimetria, piantaVuota, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

const voce = (t: string) => CATALOGO.find((v) => v.tipo === t)!;

function scena() {
  let p: Pianta = piantaVuota();
  const a = C.aggiungiElemento(p, voce("wc"), { x: 0, y: 0 }); p = a.pianta;
  const b = C.aggiungiElemento(p, voce("lavabo"), { x: 100, y: 0 }); p = b.pianta;
  const q = C.aggiungiQuota(p, { x: 0, y: 100 }, { x: 100, y: 100 }, 40); p = q.pianta;
  const t = C.aggiungiTesto(p, { x: 50, y: -50 }, "Bagno"); p = t.pianta;
  const lontano = C.aggiungiElemento(p, voce("doccia"), { x: 900, y: 900 }); p = lontano.pianta;
  const g: C.Gruppo = { elementi: [a.id, b.id], quote: [q.id], testi: [t.id] };
  return { p, g, a: a.id, b: b.id, q: q.id, t: t.id, lontano: lontano.id };
}

describe("più oggetti insieme (fase 4)", () => {
  it("il riquadro prende solo ciò che ci sta dentro", () => {
    const { p, g } = scena();
    const r = C.gruppoNelRiquadro(p, { x: -10, y: -60 }, { x: 110, y: 110 }, "fatto");
    expect(r).toEqual(g);
    expect(C.quantiNelGruppo(C.gruppoNelRiquadro(p, { x: 20, y: 20 }, { x: 30, y: 30 }, "fatto"))).toBe(0);
  });

  it("sposta tutti insieme e lascia il resto", () => {
    const { p, g, a, q, t, lontano } = scena();
    const d = C.spostaGruppo(p, g, { x: 20, y: -10 });
    expect(d.elementi!.find((e) => e.id === a)!.centro).toEqual({ x: 20, y: -10 });
    expect(d.quote!.find((x) => x.id === q)!.p1).toEqual({ x: 20, y: 90 });
    expect(d.testi!.find((x) => x.id === t)!.posizione).toEqual({ x: 70, y: -60 });
    expect(d.elementi!.find((e) => e.id === lontano)!.centro).toEqual({ x: 900, y: 900 });
  });

  it("ruota di 90° attorno al centro e quattro rotazioni tornano al punto di partenza", () => {
    const { p, g, a } = scena();
    const c = C.centroGruppo(p, g)!;
    expect(c).toEqual({ x: 50, y: 25 });
    const r = C.ruotaGruppo(p, g);
    const wc = r.elementi!.find((e) => e.id === a)!;
    // (0,0) attorno a (50,25), orario sullo schermo (y in giù) → (75,-25)
    expect(wc.centro).toEqual({ x: 75, y: -25 });
    expect(wc.rotazione).toBe(90);
    const giro = C.ruotaGruppo(C.ruotaGruppo(C.ruotaGruppo(r, g), g), g);
    expect(giro.elementi).toEqual(p.elementi);
    expect(giro.quote).toEqual(p.quote);
    expect(giro.testi).toEqual(p.testi);
  });

  it("specchia: due volte è l'originale, e la quota resta dal suo lato", () => {
    const { p, g, a, q } = scena();
    const s = C.specchiaGruppo(p, g);
    expect(s.elementi!.find((e) => e.id === a)!.centro).toEqual({ x: 100, y: 0 });
    const qs = s.quote!.find((x) => x.id === q)!;
    // i capi si scambiano: la quota va ancora da sinistra a destra, dallo stesso lato
    expect(qs.p1).toEqual({ x: 0, y: 100 });
    expect(qs.p2).toEqual({ x: 100, y: 100 });
    expect(qs.scostamento).toBe(40);
    expect(C.specchiaGruppo(s, g)).toEqual(p);
  });

  it("copia: oggetti nuovi spostati, gli originali restano", () => {
    const { p, g } = scena();
    const r = C.duplicaGruppo(p, g, "fatto");
    expect(C.quantiNelGruppo(r.gruppo)).toBe(4);
    expect(r.pianta.elementi).toHaveLength(p.elementi!.length + 2);
    expect(r.pianta.testi!.find((x) => x.id === r.gruppo.testi[0])!.testo).toBe("Bagno");
    expect(validaPlanimetria(aPlanimetria(r.pianta)).ok).toBe(true);
  });

  it("elimina: nel progetto gli arredi di oggi diventano «da demolire», quote e testi spariscono", () => {
    const { p, g, a } = scena();
    const e = C.eliminaGruppo(p, g, "progetto");
    expect(e.elementi!.find((x) => x.id === a)!.stato).toBe("da_demolire");
    expect(e.quote).toHaveLength(0);
    expect(e.testi).toHaveLength(0);
    expect(C.gruppoModificabile(p, g, "progetto").elementi).toEqual([]);
    expect(C.eliminaGruppo(p, g, "fatto").elementi).toHaveLength(1);
  });
});
