/**
 * La terza destinazione di una fattura: commesse + magazzino + spese generali = imponibile.
 *
 * La quota a magazzino non è costo di nessuna commessa — lo diventa quando la merce esce,
 * perché lo scarico porta sulla commessa il costo medio della scheda — e non è nemmeno
 * spesa generale della struttura: è valore fermo in giacenza. Contarla da una delle due
 * parti vorrebbe dire pagare la stessa merce due volte.
 *
 * Il calcolo del costo medio sta nel database (`magazzino_medio_ponderato`) e si verifica
 * su un database vero con `supabase/tests/magazzino_costo_medio_verifica.sql`.
 */
import { describe, expect, it } from "vitest";
import { quotaNonRipartita } from "@/lib/controlloGestione/strutturaCommessa";
import {
  DESTINAZIONE_MAGAZZINO,
  magazzinoDaVoci,
  magazzinoInNetto,
  problemaRipartizione,
  quotaMagazzinoDelCosto,
  quoteDaVoci,
  quoteLordeInNette,
  residuoDaAssegnare,
  righeMagazzinoDelCosto,
  type QuotaCommessa,
} from "@/lib/fatturazione/ripartizioneFattura";

const quota = (order_id: string, importo: number): QuotaCommessa => ({ order_id, importo });

describe("la quota a magazzino non è spesa generale", () => {
  it("esce dalle spese generali, non dalle commesse", () => {
    // 1.000 € di fattura: 400 su una commessa, 300 a magazzino, 300 di spese generali.
    expect(quotaNonRipartita(1000, [{ order_id: "a", pct: 40 }], 300)).toBe(300);
  });
  it("senza ripartizione sulle commesse, il magazzino scala comunque dalle generali", () => {
    expect(quotaNonRipartita(1000, [], 250)).toBe(750);
    expect(quotaNonRipartita(1000, null, 1000)).toBe(0);
  });
  it("non va sotto zero e ignora i valori impossibili", () => {
    expect(quotaNonRipartita(1000, [{ order_id: "a", pct: 80 }], 500)).toBe(0);
    expect(quotaNonRipartita(1000, [], -5)).toBe(1000);
    expect(quotaNonRipartita(1000, [], null)).toBe(1000);
    expect(quotaNonRipartita(1000, [], undefined)).toBe(1000);
  });
  it("chi non la passa vede quello che vedeva prima", () => {
    expect(quotaNonRipartita(1000, [{ order_id: "a", pct: 25 }])).toBe(750);
  });
});

describe("la somma deve tornare all'imponibile", () => {
  it("commesse più magazzino dentro l'imponibile: nessun problema", () => {
    expect(problemaRipartizione([quota("a", 400), quota("b", 300)], 1000, 300)).toBeNull();
  });
  it("commesse più magazzino oltre l'imponibile: lo dice", () => {
    expect(problemaRipartizione([quota("a", 800)], 1000, 300))
      .toBe("Commesse e magazzino insieme superano l'imponibile della fattura.");
  });
  it("senza magazzino il messaggio resta quello di prima", () => {
    expect(problemaRipartizione([quota("a", 1500)], 1000))
      .toBe("Le quote superano l'imponibile della fattura.");
  });
  it("una quota a magazzino negativa è un errore", () => {
    expect(problemaRipartizione([quota("a", 100)], 1000, -1))
      .toBe("La quota a magazzino non può essere negativa.");
  });
  it("il residuo è quello che resta alle spese generali", () => {
    expect(residuoDaAssegnare([quota("a", 400)], 1000, 300)).toBe(300);
    expect(residuoDaAssegnare([quota("a", 400), quota("b", 300)], 1000, 300)).toBe(0);
    expect(residuoDaAssegnare([quota("a", 400)], 1000)).toBe(600);
  });
});

describe("dal lordo che si vede al netto che si salva", () => {
  it("la quota a magazzino segue la strada delle commesse", () => {
    expect(magazzinoInNetto(220, 1220, 1000)).toBe(180.33);
    expect(magazzinoInNetto(1220, 1220, 1000)).toBe(1000);
  });
  it("zero, niente o numeri impossibili danno zero", () => {
    expect(magazzinoInNetto(0, 1220, 1000)).toBe(0);
    expect(magazzinoInNetto(-5, 1220, 1000)).toBe(0);
    expect(magazzinoInNetto(100, 0, 1000)).toBe(0);
    expect(magazzinoInNetto(100, 1220, 0)).toBe(0);
  });
  it("tutto assegnato fra commesse e magazzino: i centesimi tornano esatti", () => {
    // 1.220 lordi: 220 a magazzino (180,33 netti) e il resto diviso in tre.
    const lorde = [quota("a", 333.34), quota("b", 333.33), quota("c", 333.33)];
    const nette = quoteLordeInNette(lorde, 1220, 1000, 220);
    const somma = nette.reduce((n, q) => n + q.importo, 0) + magazzinoInNetto(220, 1220, 1000);
    expect(Math.round(somma * 100) / 100).toBe(1000);
  });
  it("senza magazzino si comporta come prima", () => {
    const nette = quoteLordeInNette([quota("a", 610), quota("b", 610)], 1220, 1000);
    expect(nette.map((q) => q.importo)).toEqual([500, 500]);
  });
});

describe("voce per voce, una voce può restare a magazzino", () => {
  const voci = [
    { numero: 1, descrizione: "Moduli", imponibile: 700 },
    { numero: 2, descrizione: "Viti avanzate", imponibile: 300 },
  ];
  it("la voce a magazzino non diventa una quota di commessa", () => {
    const scelte = { 1: "c1", 2: DESTINAZIONE_MAGAZZINO };
    expect(quoteDaVoci(voci, scelte)).toEqual([{ order_id: "c1", importo: 700, righe: [1] }]);
    expect(magazzinoDaVoci(voci, scelte)).toBe(300);
    expect(problemaRipartizione(quoteDaVoci(voci, scelte), 1000, magazzinoDaVoci(voci, scelte))).toBeNull();
    expect(residuoDaAssegnare(quoteDaVoci(voci, scelte), 1000, magazzinoDaVoci(voci, scelte))).toBe(0);
  });
  it("nessuna voce a magazzino: zero", () => {
    expect(magazzinoDaVoci(voci, { 1: "c1", 2: "c2" })).toBe(0);
    expect(magazzinoDaVoci(voci, {})).toBe(0);
  });
});

describe("rileggere quello che è stato salvato", () => {
  it("l'importo e le voci tornano come erano", () => {
    const costo = { quota_magazzino: 300, quota_magazzino_righe: [2, 3] };
    expect(quotaMagazzinoDelCosto(costo)).toBe(300);
    expect(righeMagazzinoDelCosto(costo)).toEqual([2, 3]);
  });
  it("un costo senza quota a magazzino non ne ha", () => {
    expect(quotaMagazzinoDelCosto(null)).toBe(0);
    expect(quotaMagazzinoDelCosto({})).toBe(0);
    expect(quotaMagazzinoDelCosto({ quota_magazzino: null })).toBe(0);
    expect(quotaMagazzinoDelCosto({ quota_magazzino: "pippo" })).toBe(0);
    expect(righeMagazzinoDelCosto(null)).toEqual([]);
    expect(righeMagazzinoDelCosto({ quota_magazzino_righe: "no" })).toEqual([]);
  });
});
