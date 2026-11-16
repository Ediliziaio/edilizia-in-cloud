import { describe, expect, it } from "vitest";
import { avvisoNumerazione, haNumerazioneFiscale } from "@/lib/fatturazione/primaEmissione";

describe("avviso sulla numerazione prima di emettere", () => {
  it("la prima fattura di un'azienda si fa guardare, anche senza storia importata", () => {
    expect(avvisoNumerazione({ prima: true, prossimo: 1, massimoArchivio: null }))
      .toEqual({ tipo: "prima", prossimo: 1 });
  });

  it("il caso Vulcano: contatore indietro rispetto all'archivio, il numero sarebbe già usato", () => {
    // Contatore a 226 → prossimo 227, ma l'archivio importato arriva alla 238.
    expect(avvisoNumerazione({ prima: true, prossimo: 227, massimoArchivio: 238 }))
      .toEqual({ tipo: "conflitto", prossimo: 227, massimoArchivio: 238, suggerito: 239 });
  });

  it("il conflitto vale anche quando non è la prima: il contatore si può rimettere indietro a mano", () => {
    expect(avvisoNumerazione({ prima: false, prossimo: 100, massimoArchivio: 238 }))
      .toMatchObject({ tipo: "conflitto", suggerito: 239 });
  });

  it("numero uguale all'ultimo dell'archivio: è un doppione, non un dubbio", () => {
    expect(avvisoNumerazione({ prima: false, prossimo: 238, massimoArchivio: 238 }).tipo).toBe("conflitto");
  });

  it("numero giusto dopo l'archivio: non si dice niente", () => {
    expect(avvisoNumerazione({ prima: false, prossimo: 239, massimoArchivio: 238 })).toEqual({ tipo: "nessuno" });
    // Prima fattura ma col numero già sistemato: resta l'invito a controllare, non l'allarme.
    expect(avvisoNumerazione({ prima: true, prossimo: 239, massimoArchivio: 238 }).tipo).toBe("prima");
  });

  it("senza numero o senza archivio non si inventa un conflitto", () => {
    expect(avvisoNumerazione({ prima: false, prossimo: null, massimoArchivio: 238 })).toEqual({ tipo: "nessuno" });
    expect(avvisoNumerazione({ prima: false, prossimo: 5, massimoArchivio: null })).toEqual({ tipo: "nessuno" });
  });
});

describe("quali documenti hanno una numerazione da proteggere", () => {
  it("le fatture e le note sì, preventivi e DDT no", () => {
    expect(haNumerazioneFiscale("fattura")).toBe(true);
    expect(haNumerazioneFiscale("nota_credito")).toBe(true);
    expect(haNumerazioneFiscale("fattura_pa")).toBe(true);
    expect(haNumerazioneFiscale("preventivo")).toBe(false);
    expect(haNumerazioneFiscale("ddt")).toBe(false);
    expect(haNumerazioneFiscale("proforma")).toBe(false);
  });
});
