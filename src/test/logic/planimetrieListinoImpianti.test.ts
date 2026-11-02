import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { LISTINO_IMPIANTI, vociDallaPianta } from "@/lib/planimetrie/listinoImpianti";
import { quantitaPianta } from "@/lib/planimetrie/computo";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

const voce = (t: string) => CATALOGO.find((v) => v.tipo === t)!;

describe("voci impianti dalla pianta", () => {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  for (const [t, x, y] of [["quadro_elettrico", 0, 0], ["presa", 300, 0], ["presa", 600, 0], ["split", 0, 900], ["unita_esterna", 500, 900]] as const) {
    p = C.aggiungiElemento(p, voce(t), { x, y }).pianta;
  }
  const mappa = calcolaQuantita(aPlanimetria(p));

  it("ogni voce del listino punta a una chiave che la pianta sa produrre", () => {
    for (const v of LISTINO_IMPIANTI) expect(v.id).toMatch(/^(elementi:[a-z0-9_]+\.numero|impianti:[a-z]+\.[a-z_]+|esterni:[a-z]+\.(superficie_mq|recinzione_ml)|tetto:copertura\.superficie_mq)$/);
  });
  it("dallo stato di fatto: prese esistenti, metri stimati di cavo e rame", () => {
    const v = vociDallaPianta(mappa, "fatto");
    const per = Object.fromEntries(v.map((x) => [x.voce.id, x]));
    expect(per["elementi:presa.numero"]).toMatchObject({ chiave: "fatto:elementi:esistente:presa.numero", quantita: 2, stimata: false });
    expect(per["impianti:elettrico.cavo_ml"].stimata).toBe(true);
    expect(per["impianti:clima.rame_ml"].quantita).toBeGreaterThan(0);
    expect(per["elementi:termosifone.numero"]).toBeUndefined();
  });
  it("le linee stimate e gli appartamenti si possono scegliere anche in «Prendi dalla pianta»", () => {
    const ids = quantitaPianta(mappa, "fatto").map((s) => s.id);
    expect(ids).toContain("impianti:elettrico.corrugato_ml");
  });
});
