import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cantiereCadeInGiorno } from "@/lib/campo/cantiereInGiorno";

const mai = () => false;
const nessuno = null as boolean | null; // `null` da solo, in un oggetto, è «any» per il controllo dei tipi
const ritardo = () => true;

describe("calendario Lavori: il cantiere cade in questo giorno?", () => {
  it("l'ultimo giorno del lavoro c'è ancora, a qualunque ora (era il bug: sparisce dopo mezzanotte)", () => {
    const ultimo = { inizio: "2026-10-01", fine: "2026-10-06", mio: nessuno, inRitardoAperto: mai };
    expect(cantiereCadeInGiorno({ ...ultimo, giorno: new Date(2026, 9, 6, 0, 0) })).toBe(true);
    expect(cantiereCadeInGiorno({ ...ultimo, giorno: new Date(2026, 9, 6, 9, 30) })).toBe(true);
    expect(cantiereCadeInGiorno({ ...ultimo, giorno: new Date(2026, 9, 6, 23, 59) })).toBe(true);
  });

  it("il primo giorno c'è, il giorno dopo la fine no", () => {
    const l = { inizio: "2026-10-01", fine: "2026-10-06", mio: nessuno, inRitardoAperto: mai };
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 1, 17, 0) })).toBe(true);
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 8, 30, 12, 0) })).toBe(false);
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 7, 12, 0) })).toBe(false);
  });

  it("le date personali vincono su quelle del cantiere, in un senso e nell'altro", () => {
    const l = { inizio: "2026-10-01", fine: "2026-10-06", inRitardoAperto: mai };
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 3), mio: false })).toBe(false);
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 20), mio: true })).toBe(true);
  });

  describe("lavoro aperto oltre la data di fine", () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 9, 11, 0)); });
    afterEach(() => vi.useRealTimers());
    const l = { inizio: "2026-10-01", fine: "2026-10-06", mio: nessuno };

    it("resta visibile su oggi, non sui giorni passati dopo la fine", () => {
      expect(cantiereCadeInGiorno({ ...l, giorno: new Date(), inRitardoAperto: ritardo })).toBe(true);
      expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 8), inRitardoAperto: ritardo })).toBe(false);
    });

    it("non è in ritardo: oggi non compare", () => {
      expect(cantiereCadeInGiorno({ ...l, giorno: new Date(), inRitardoAperto: mai })).toBe(false);
    });

    it("la domanda sul ritardo si fa solo se serve", () => {
      const domanda = vi.fn(() => true);
      cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 3), inRitardoAperto: domanda }); // dentro l'intervallo
      cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 8), inRitardoAperto: domanda }); // fuori, ma non oggi
      expect(domanda).not.toHaveBeenCalled();
    });
  });

  it("solo la data di inizio: da quel giorno in poi", () => {
    const l = { inizio: "2026-10-05", fine: null as string | null, mio: nessuno, inRitardoAperto: mai };
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 5, 8, 0) })).toBe(true);
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2026, 9, 4, 20, 0) })).toBe(false);
    expect(cantiereCadeInGiorno({ ...l, giorno: new Date(2027, 0, 1) })).toBe(true);
  });

  it("senza nessuna data è sempre in calendario", () => {
    expect(cantiereCadeInGiorno({ giorno: new Date(2026, 9, 5), mio: nessuno, inRitardoAperto: mai })).toBe(true);
  });
});
