import { describe, expect, it } from "vitest";
import { correzioniDallaTavola, tornaConLaTavola } from "@/components/planimetrie/editor/misure";
import { impostaLatoStanza } from "@/components/planimetrie/editor/comandi";
import { quantitaLocale, type Pianta } from "@/components/planimetrie/editor/adattatore";

describe("correggere la stanza con la superficie scritta sulla tavola", () => {
  it("propone un lato per volta, che riporta il rettangolo alla superficie della tavola", () => {
    // 450 × 655 = 29,48 m²; la tavola dice 32,40
    const c = correzioniDallaTavola([450, 655, 450, 655], 29.4750, 32.4);
    expect(c).toEqual([{ lato: 0, da: 450, a: 494.5 }, { lato: 1, da: 655, a: 720 }]);
    for (const { lato, a } of c) {
      const altro = lato === 0 ? 655 : 450;
      expect(tornaConLaTavola(a * altro / 10_000, 32.4)).toBe(true);
    }
  });
  it("niente proposte se torna già, se non è un rettangolo o se lo scarto è enorme", () => {
    expect(tornaConLaTavola(9.26, 9.3)).toBe(true);
    expect(correzioniDallaTavola([300, 310, 300, 310], 9.26, 9.3)).toEqual([]);
    expect(correzioniDallaTavola([300, 310, 250, 310], 8.5, 9.3)).toEqual([]);
    expect(correzioniDallaTavola([300, 200, 300], 6, 9)).toEqual([]);
    expect(correzioniDallaTavola([300, 300, 300, 300], 9, 30)).toEqual([]);
  });
  it("applicata con «lato della stanza», la stanza torna con la tavola", () => {
    const muro = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 0, altezza: 300, tipo: "tramezzo", stato: "esistente", origine: "rilevata" });
    const pianta = {
      muri: [muro("a", 0, 0, 400, 0), muro("b", 400, 0, 400, 300), muro("c", 400, 300, 0, 300), muro("d", 0, 300, 0, 0)],
      aperture: [], elementi: [], quote: [], testi: [],
      locali: [{ id: "l", nome: "letto", destinazione: "camera", altezza: 300, origine: "rilevata", contorno: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }],
    } as unknown as Pianta;
    const q = quantitaLocale(pianta, pianta.locali[0]);
    const [prima] = correzioniDallaTavola(q.lati, q.mq, 13.2);
    const dopo = impostaLatoStanza(pianta, "l", prima.lato, prima.a);
    expect(tornaConLaTavola(quantitaLocale(dopo, dopo.locali[0]).mq, 13.2)).toBe(true);
  });
  it("stanza da DWG senza pareti agli angoli: si sposta tutto il lato in fondo, resta un rettangolo", () => {
    // Come il letto di Callimaco: muri spezzati che non toccano gli angoli della stanza.
    const muro = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 10, altezza: 300, tipo: "tramezzo", stato: "nuovo", origine: "da_documento" });
    const pianta = {
      muri: [muro("su", 996, 1766.6, 1439.8, 1766.6), muro("su2", 1449.8, 1766.6, 1628.4, 1766.6)],
      aperture: [], elementi: [], quote: [], testi: [],
      locali: [{ id: "l", nome: "letto", destinazione: "camera", altezza: 300, origine: "stimata", contorno: [{ x: 1077.23, y: 2292.64 }, { x: 1077.23, y: 1771.64 }, { x: 1643.23, y: 1771.64 }, { x: 1643.26, y: 2292.64 }] }],
    } as unknown as Pianta;
    const q = quantitaLocale(pianta, pianta.locali[0]);
    const proposte = correzioniDallaTavola(q.lati, q.mq, 32.4);
    expect(proposte).toHaveLength(2);
    for (const p of proposte) {
      const dopo = impostaLatoStanza(pianta, "l", p.lato, p.a);
      const qd = quantitaLocale(dopo, dopo.locali[0]);
      expect(tornaConLaTavola(qd.mq, 32.4)).toBe(true);
      expect(Math.abs(qd.lati[0] - qd.lati[2])).toBeLessThan(1);
      expect(Math.abs(qd.lati[1] - qd.lati[3])).toBeLessThan(1);
    }
  });
});
