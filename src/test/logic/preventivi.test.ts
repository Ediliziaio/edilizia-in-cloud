import { describe, it, expect } from "vitest";

/**
 * Test logica preventivi (offerte commerciali).
 * Copre: calcolo sconto, IVA, totali, validità, transizioni di stato
 * e applicazione sconto su righe vs totale.
 * Test puri — zero dipendenze React/Supabase.
 */

// ─── Strutture dati ────────────────────────────────────────────────────────

interface RigaPreventivo {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_perc: number; // 0–100
  aliquota_iva: number; // es. 22, 10, 4, 0
}

interface Preventivo {
  righe: RigaPreventivo[];
  sconto_globale_perc: number; // sconto sul subtotale
  note?: string;
}

// ─── Calcolo riga ─────────────────────────────────────────────────────────

function calcolaRiga(riga: RigaPreventivo): {
  subtotale: number;
  sconto_importo: number;
  imponibile: number;
  iva: number;
  totale: number;
} {
  const subtotale = parseFloat((riga.quantita * riga.prezzo_unitario).toFixed(2));
  const sconto_importo = parseFloat((subtotale * (riga.sconto_perc / 100)).toFixed(2));
  const imponibile = parseFloat((subtotale - sconto_importo).toFixed(2));
  const iva = parseFloat((imponibile * (riga.aliquota_iva / 100)).toFixed(2));
  const totale = parseFloat((imponibile + iva).toFixed(2));
  return { subtotale, sconto_importo, imponibile, iva, totale };
}

// ─── Calcolo preventivo completo ─────────────────────────────────────────

function calcolaPreventivo(p: Preventivo): {
  subtotale_lordo: number;
  sconto_righe_totale: number;
  imponibile_pre_sconto_globale: number;
  sconto_globale_importo: number;
  imponibile_netto: number;
  iva_totale: number;
  totale: number;
} {
  let subtotale_lordo = 0;
  let sconto_righe_totale = 0;
  let imponibile_pre_sconto_globale = 0;
  let iva_righe = 0;

  for (const r of p.righe) {
    const res = calcolaRiga(r);
    subtotale_lordo = parseFloat((subtotale_lordo + res.subtotale).toFixed(2));
    sconto_righe_totale = parseFloat((sconto_righe_totale + res.sconto_importo).toFixed(2));
    imponibile_pre_sconto_globale = parseFloat((imponibile_pre_sconto_globale + res.imponibile).toFixed(2));
    iva_righe = parseFloat((iva_righe + res.iva).toFixed(2));
  }

  const sconto_globale_importo = parseFloat(
    (imponibile_pre_sconto_globale * (p.sconto_globale_perc / 100)).toFixed(2)
  );
  const imponibile_netto = parseFloat(
    (imponibile_pre_sconto_globale - sconto_globale_importo).toFixed(2)
  );

  // Ricalcola IVA sul netto dopo sconto globale (approccio standard italiano)
  let iva_totale = 0;
  if (p.sconto_globale_perc > 0) {
    const ratio = imponibile_pre_sconto_globale > 0
      ? imponibile_netto / imponibile_pre_sconto_globale
      : 1;
    iva_totale = parseFloat((iva_righe * ratio).toFixed(2));
  } else {
    iva_totale = iva_righe;
  }

  const totale = parseFloat((imponibile_netto + iva_totale).toFixed(2));
  return {
    subtotale_lordo,
    sconto_righe_totale,
    imponibile_pre_sconto_globale,
    sconto_globale_importo,
    imponibile_netto,
    iva_totale,
    totale,
  };
}

// ─── Validità preventivo ──────────────────────────────────────────────────

function calcolaScadenzaPreventivo(dataEmissione: string, giorniValidita: number): string {
  const d = new Date(dataEmissione);
  d.setDate(d.getDate() + giorniValidita);
  return d.toISOString().split("T")[0];
}

function isPreventivoScaduto(scadenza: string, oggi: string): boolean {
  return new Date(scadenza) < new Date(oggi);
}

// ─── Transizioni di stato ─────────────────────────────────────────────────

type StatoPreventivo = "bozza" | "inviato" | "accettato" | "rifiutato" | "scaduto" | "annullato";

const TRANSIZIONI: Record<StatoPreventivo, StatoPreventivo[]> = {
  bozza:     ["inviato", "annullato"],
  inviato:   ["accettato", "rifiutato", "scaduto", "annullato"],
  accettato: ["annullato"],
  rifiutato: ["bozza"],
  scaduto:   ["bozza", "annullato"],
  annullato: [],
};

function puoTransizionare(da: StatoPreventivo, a: StatoPreventivo): boolean {
  return TRANSIZIONI[da]?.includes(a) ?? false;
}

// ─── Sconto: validazione ──────────────────────────────────────────────────

function isScontoValido(sconto: number): boolean {
  return sconto >= 0 && sconto <= 100;
}

function applicaSconto(prezzo: number, scontoPerc: number): number {
  if (!isScontoValido(scontoPerc)) throw new Error("Sconto non valido");
  return parseFloat((prezzo * (1 - scontoPerc / 100)).toFixed(2));
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("calcolo riga preventivo", () => {
  it("riga senza sconto: subtotale = quantità × prezzo", () => {
    const r = calcolaRiga({ descrizione: "Posa piastrelle", quantita: 20, prezzo_unitario: 50, sconto_perc: 0, aliquota_iva: 22 });
    expect(r.subtotale).toBe(1000);
    expect(r.sconto_importo).toBe(0);
    expect(r.imponibile).toBe(1000);
    expect(r.iva).toBe(220);
    expect(r.totale).toBe(1220);
  });

  it("riga con sconto 10%: imponibile ridotto del 10%", () => {
    const r = calcolaRiga({ descrizione: "Materiale", quantita: 1, prezzo_unitario: 500, sconto_perc: 10, aliquota_iva: 22 });
    expect(r.subtotale).toBe(500);
    expect(r.sconto_importo).toBe(50);
    expect(r.imponibile).toBe(450);
    expect(r.iva).toBe(99);
    expect(r.totale).toBe(549);
  });

  it("sconto 100%: tutto gratis", () => {
    const r = calcolaRiga({ descrizione: "Omaggio", quantita: 1, prezzo_unitario: 100, sconto_perc: 100, aliquota_iva: 22 });
    expect(r.imponibile).toBe(0);
    expect(r.iva).toBe(0);
    expect(r.totale).toBe(0);
  });

  it("IVA 10% (lavori ristrutturazione)", () => {
    const r = calcolaRiga({ descrizione: "Intonaco", quantita: 50, prezzo_unitario: 20, sconto_perc: 0, aliquota_iva: 10 });
    expect(r.imponibile).toBe(1000);
    expect(r.iva).toBe(100);
    expect(r.totale).toBe(1100);
  });

  it("IVA 0% (regime esente)", () => {
    const r = calcolaRiga({ descrizione: "Consulenza esente", quantita: 1, prezzo_unitario: 300, sconto_perc: 0, aliquota_iva: 0 });
    expect(r.iva).toBe(0);
    expect(r.totale).toBe(300);
  });
});

describe("calcolo preventivo completo", () => {
  it("due righe, nessuno sconto", () => {
    const p: Preventivo = {
      righe: [
        { descrizione: "A", quantita: 1, prezzo_unitario: 1000, sconto_perc: 0, aliquota_iva: 22 },
        { descrizione: "B", quantita: 2, prezzo_unitario: 200,  sconto_perc: 0, aliquota_iva: 22 },
      ],
      sconto_globale_perc: 0,
    };
    const r = calcolaPreventivo(p);
    expect(r.subtotale_lordo).toBe(1400);
    expect(r.imponibile_netto).toBe(1400);
    expect(r.iva_totale).toBe(308);
    expect(r.totale).toBe(1708);
  });

  it("sconto globale 5% sul totale righe", () => {
    const p: Preventivo = {
      righe: [
        { descrizione: "Lavori", quantita: 1, prezzo_unitario: 1000, sconto_perc: 0, aliquota_iva: 22 },
      ],
      sconto_globale_perc: 5,
    };
    const r = calcolaPreventivo(p);
    expect(r.imponibile_pre_sconto_globale).toBe(1000);
    expect(r.sconto_globale_importo).toBe(50);
    expect(r.imponibile_netto).toBe(950);
    // IVA su 950: 950 * 22% = 209
    expect(r.iva_totale).toBe(209);
    expect(r.totale).toBe(1159);
  });

  it("preventivo vuoto → tutti zero", () => {
    const r = calcolaPreventivo({ righe: [], sconto_globale_perc: 0 });
    expect(r.totale).toBe(0);
    expect(r.iva_totale).toBe(0);
  });
});

describe("validità e scadenza preventivo", () => {
  it("preventivo valido 30 giorni", () => {
    expect(calcolaScadenzaPreventivo("2024-01-01", 30)).toBe("2024-01-31");
  });

  it("preventivo scaduto", () => {
    expect(isPreventivoScaduto("2023-06-30", "2024-01-01")).toBe(true);
  });

  it("preventivo non scaduto", () => {
    expect(isPreventivoScaduto("2025-12-31", "2024-01-01")).toBe(false);
  });
});

describe("transizioni di stato preventivo", () => {
  it("bozza → inviato: permesso", () => {
    expect(puoTransizionare("bozza", "inviato")).toBe(true);
  });

  it("inviato → accettato: permesso", () => {
    expect(puoTransizionare("inviato", "accettato")).toBe(true);
  });

  it("inviato → rifiutato: permesso", () => {
    expect(puoTransizionare("inviato", "rifiutato")).toBe(true);
  });

  it("rifiutato → bozza: permesso (revisione)", () => {
    expect(puoTransizionare("rifiutato", "bozza")).toBe(true);
  });

  it("accettato → inviato: NON permesso", () => {
    expect(puoTransizionare("accettato", "inviato")).toBe(false);
  });

  it("annullato → qualsiasi: NON permesso (terminale)", () => {
    expect(puoTransizionare("annullato", "bozza")).toBe(false);
    expect(puoTransizionare("annullato", "inviato")).toBe(false);
  });

  it("bozza → accettato diretto: NON permesso (salta stato)", () => {
    expect(puoTransizionare("bozza", "accettato")).toBe(false);
  });
});

describe("validazione e applicazione sconto", () => {
  it("sconto valido: 0–100", () => {
    expect(isScontoValido(0)).toBe(true);
    expect(isScontoValido(50)).toBe(true);
    expect(isScontoValido(100)).toBe(true);
  });

  it("sconto invalido: negativo o > 100", () => {
    expect(isScontoValido(-1)).toBe(false);
    expect(isScontoValido(101)).toBe(false);
  });

  it("applica sconto 20% su 500€ = 400€", () => {
    expect(applicaSconto(500, 20)).toBe(400);
  });

  it("sconto 0% → prezzo invariato", () => {
    expect(applicaSconto(750, 0)).toBe(750);
  });

  it("sconto invalido → eccezione", () => {
    expect(() => applicaSconto(100, -5)).toThrow("Sconto non valido");
    expect(() => applicaSconto(100, 150)).toThrow("Sconto non valido");
  });
});
