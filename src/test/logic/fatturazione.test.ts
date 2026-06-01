import { describe, it, expect } from "vitest";
import { calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import type { RigaDocumento } from "@/types/fatturazione";

/**
 * Test logica fatturazione italiana (FatturaPA / D.Lgs. 127/2015).
 * Copre: calcolo IVA, imponibile, totale, ritenuta d'acconto, scadenze,
 * numero progressivo e transizioni di stato.
 * Test puri — zero dipendenze React/Supabase.
 */

// ─── Aliquote IVA italiane ─────────────────────────────────────────────────

const IVA_RATES: Record<string, number> = {
  ordinaria: 0.22,
  ridotta: 0.10,
  super_ridotta: 0.04,
  esente: 0.00,
};

function calcolaIva(imponibile: number, aliquota: string): number {
  const rate = IVA_RATES[aliquota] ?? 0.22;
  return parseFloat((imponibile * rate).toFixed(2));
}

function calcolaTotale(imponibile: number, aliquota: string): number {
  const iva = calcolaIva(imponibile, aliquota);
  return parseFloat((imponibile + iva).toFixed(2));
}

// ─── Ritenuta d'acconto (art. 25 DPR 600/73) ──────────────────────────────

const RITENUTA_RATE = 0.20; // 20% sul compenso

function calcolaRitenuta(compenso: number): number {
  return parseFloat((compenso * RITENUTA_RATE).toFixed(2));
}

function calcolaNettoDaPagare(totale: number, ritenuta: number): number {
  return parseFloat((totale - ritenuta).toFixed(2));
}

// ─── Numero progressivo FatturaPA ─────────────────────────────────────────

function formatNumeroFattura(anno: number, progressivo: number): string {
  return `${anno}/${String(progressivo).padStart(4, "0")}`;
}

function parseNumeroFattura(numero: string): { anno: number; progressivo: number } | null {
  const match = numero.match(/^(\d{4})\/(\d+)$/);
  if (!match) return null;
  return { anno: parseInt(match[1]), progressivo: parseInt(match[2]) };
}

// ─── Scadenze di pagamento ────────────────────────────────────────────────

function calcolaScadenza(dataEmissione: string, giorniPagamento: number): string {
  const d = new Date(dataEmissione);
  d.setDate(d.getDate() + giorniPagamento);
  return d.toISOString().split("T")[0];
}

function isScaduta(scadenza: string, oggi: string): boolean {
  return new Date(scadenza) < new Date(oggi);
}

// ─── Transizioni di stato ─────────────────────────────────────────────────

type StatoFattura = "bozza" | "emessa" | "pagata" | "scaduta" | "annullata";

const TRANSIZIONI_VALIDE: Record<StatoFattura, StatoFattura[]> = {
  bozza:     ["emessa", "annullata"],
  emessa:    ["pagata", "scaduta", "annullata"],
  pagata:    [],
  scaduta:   ["pagata", "annullata"],
  annullata: [],
};

function puoTransizionare(da: StatoFattura, a: StatoFattura): boolean {
  return TRANSIZIONI_VALIDE[da]?.includes(a) ?? false;
}

// ─── Line items ───────────────────────────────────────────────────────────

interface LineaFattura {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  aliquota_iva: string;
}

function calcolaTotaleLinea(linea: LineaFattura): { imponibile: number; iva: number; totale: number } {
  const imponibile = parseFloat((linea.quantita * linea.prezzo_unitario).toFixed(2));
  const iva = calcolaIva(imponibile, linea.aliquota_iva);
  const totale = parseFloat((imponibile + iva).toFixed(2));
  return { imponibile, iva, totale };
}

function calcolaTotaleLinee(linee: LineaFattura[]): { imponibile: number; iva: number; totale: number } {
  let imponibile = 0;
  let iva = 0;
  for (const l of linee) {
    const r = calcolaTotaleLinea(l);
    imponibile += r.imponibile;
    iva += r.iva;
  }
  imponibile = parseFloat(imponibile.toFixed(2));
  iva = parseFloat(iva.toFixed(2));
  return { imponibile, iva, totale: parseFloat((imponibile + iva).toFixed(2)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("calcolo IVA italiana", () => {
  it("IVA ordinaria 22% su 1000€", () => {
    expect(calcolaIva(1000, "ordinaria")).toBe(220);
  });

  it("IVA ridotta 10% su 500€ (ristrutturazioni edilizie)", () => {
    expect(calcolaIva(500, "ridotta")).toBe(50);
  });

  it("IVA super-ridotta 4% su 200€ (prima abitazione)", () => {
    expect(calcolaIva(200, "super_ridotta")).toBe(8);
  });

  it("esente IVA: importo IVA = 0", () => {
    expect(calcolaIva(1000, "esente")).toBe(0);
  });

  it("aliquota sconosciuta → fallback 22%", () => {
    expect(calcolaIva(100, "sconosciuta")).toBe(22);
  });

  it("totale = imponibile + IVA 22%", () => {
    expect(calcolaTotale(1000, "ordinaria")).toBe(1220);
  });

  it("arrotondamento a 2 decimali", () => {
    // 333.33 * 22% = 73.3326 → 73.33
    expect(calcolaIva(333.33, "ordinaria")).toBe(73.33);
  });
});

describe("ritenuta d'acconto (art. 25 DPR 600/73)", () => {
  it("ritenuta 20% su compenso 1000€ = 200€", () => {
    expect(calcolaRitenuta(1000)).toBe(200);
  });

  it("netto da pagare = totale fattura - ritenuta", () => {
    const totale = calcolaTotale(1000, "ordinaria"); // 1220
    const ritenuta = calcolaRitenuta(1000);          // 200
    expect(calcolaNettoDaPagare(totale, ritenuta)).toBe(1020);
  });

  it("compenso piccolo: arrotondamento corretto", () => {
    expect(calcolaRitenuta(333.33)).toBe(66.67);
  });
});

describe("numero progressivo FatturaPA", () => {
  it("formatta anno/NNNN correttamente", () => {
    expect(formatNumeroFattura(2024, 1)).toBe("2024/0001");
    expect(formatNumeroFattura(2024, 42)).toBe("2024/0042");
    expect(formatNumeroFattura(2024, 1000)).toBe("2024/1000");
  });

  it("parse numero progressivo valido", () => {
    const r = parseNumeroFattura("2024/0001");
    expect(r).toEqual({ anno: 2024, progressivo: 1 });
  });

  it("parse numero progressivo con >4 cifre", () => {
    const r = parseNumeroFattura("2024/10000");
    expect(r).toEqual({ anno: 2024, progressivo: 10000 });
  });

  it("parse formato errato → null", () => {
    expect(parseNumeroFattura("FT2024/001")).toBeNull();
    expect(parseNumeroFattura("")).toBeNull();
    expect(parseNumeroFattura("2024-001")).toBeNull();
  });
});

describe("scadenze di pagamento", () => {
  it("pagamento a 30 giorni", () => {
    expect(calcolaScadenza("2024-01-01", 30)).toBe("2024-01-31");
  });

  it("pagamento a 60 giorni", () => {
    expect(calcolaScadenza("2024-01-01", 60)).toBe("2024-03-01");
  });

  it("pagamento a 90 giorni", () => {
    // 2024 è bisestile: gen(30) + feb(29) + mar(31) = 90 → 31 marzo
    expect(calcolaScadenza("2024-01-01", 90)).toBe("2024-03-31");
  });

  it("fattura scaduta: data passata", () => {
    expect(isScaduta("2023-12-31", "2024-01-01")).toBe(true);
  });

  it("fattura non scaduta: data futura", () => {
    expect(isScaduta("2025-12-31", "2024-01-01")).toBe(false);
  });

  it("stessa data: non è scaduta (scadenza = oggi)", () => {
    // Date comparison: today is NOT less than today
    expect(isScaduta("2024-01-01", "2024-01-01")).toBe(false);
  });
});

describe("transizioni di stato fattura", () => {
  it("bozza → emessa: permesso", () => {
    expect(puoTransizionare("bozza", "emessa")).toBe(true);
  });

  it("emessa → pagata: permesso", () => {
    expect(puoTransizionare("emessa", "pagata")).toBe(true);
  });

  it("emessa → scaduta: permesso", () => {
    expect(puoTransizionare("emessa", "scaduta")).toBe(true);
  });

  it("scaduta → pagata: permesso (saldo tardivo)", () => {
    expect(puoTransizionare("scaduta", "pagata")).toBe(true);
  });

  it("pagata → bozza: NON permesso (finale)", () => {
    expect(puoTransizionare("pagata", "bozza")).toBe(false);
  });

  it("annullata → emessa: NON permesso (terminale)", () => {
    expect(puoTransizionare("annullata", "emessa")).toBe(false);
  });

  it("bozza → pagata: NON permesso (salta stato)", () => {
    expect(puoTransizionare("bozza", "pagata")).toBe(false);
  });
});

describe("calcolo totale linee fattura", () => {
  it("linea singola: quantità × prezzo + IVA", () => {
    const linea: LineaFattura = { descrizione: "Lavori", quantita: 10, prezzo_unitario: 100, aliquota_iva: "ordinaria" };
    const r = calcolaTotaleLinea(linea);
    expect(r.imponibile).toBe(1000);
    expect(r.iva).toBe(220);
    expect(r.totale).toBe(1220);
  });

  it("più linee con IVA diverse", () => {
    const linee: LineaFattura[] = [
      { descrizione: "Opere murarie", quantita: 5, prezzo_unitario: 200, aliquota_iva: "ridotta" },    // 1000 + 100 = 1100
      { descrizione: "Progettazione", quantita: 1, prezzo_unitario: 500, aliquota_iva: "ordinaria" },  // 500 + 110 = 610
    ];
    const r = calcolaTotaleLinee(linee);
    expect(r.imponibile).toBe(1500);
    expect(r.iva).toBe(210);
    expect(r.totale).toBe(1710);
  });

  it("linea con quantità decimale", () => {
    const linea: LineaFattura = { descrizione: "Cemento (m³)", quantita: 2.5, prezzo_unitario: 80, aliquota_iva: "ordinaria" };
    const r = calcolaTotaleLinea(linea);
    expect(r.imponibile).toBe(200);
    expect(r.iva).toBe(44);
    expect(r.totale).toBe(244);
  });

  it("lista vuota → tutti zero", () => {
    const r = calcolaTotaleLinee([]);
    expect(r.imponibile).toBe(0);
    expect(r.iva).toBe(0);
    expect(r.totale).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcolaTotaliDocumento — fix fiscali (modulo reale src/lib/fatturazione/calcoli.ts)
// Copre: contributo cassa previdenziale dentro la base IVA (FIX #1),
// ritenuta sulla base imponibile+cassa (FIX #2), bollo dentro totale_documento (FIX #3).
// ═══════════════════════════════════════════════════════════════════════════

function mkRiga(over: Partial<RigaDocumento>): RigaDocumento {
  return {
    id: "r1",
    numero_linea: 1,
    descrizione: "Prestazione professionale",
    quantita: 1,
    unita_misura: "nr",
    prezzo_unitario: 0,
    imponibile: 0,
    aliquota_iva: "22",
    imposta: 0,
    totale_riga: 0,
    ...over,
  };
}

describe("calcolaTotaliDocumento — cassa previdenziale (FIX #1 + #2)", () => {
  it("contributo cassa 4% (IVA 22%) soggetto a ritenuta: IVA cassa in iva_totale, ritenuta su imponibile+cassa", () => {
    const righe = [mkRiga({ prezzo_unitario: 1000, aliquota_iva: "22" })];
    const t = calcolaTotaliDocumento(righe, {
      cassaPrevidenziale: true,
      cassaAliquota: 4,
      cassaAliquotaIva: "22",
      cassaRitenuta: true,
      ritenutaAcconto: true,
      ritenutaAliquota: 20,
    });
    expect(t.cassa_importo).toBe(40); // 1000 × 4%
    // riepilogo 22%: imponibile 1040 (1000 + cassa 40), imposta 228.80 — coerente con XML DatiRiepilogo
    const r22 = t.riepilogo_iva.find((r) => parseFloat(r.aliquota) === 22)!;
    expect(r22.imponibile).toBe(1040);
    expect(r22.imposta).toBe(228.8);
    expect(t.iva_totale).toBe(228.8); // FIX #1: include l'IVA sul contributo cassa
    expect(t.totale_documento).toBe(1268.8); // 1000 + 40 + 228.80
    expect(t.ritenuta_importo).toBe(208); // FIX #2: 20% su (1000 + 40)
    expect(t.totale_da_pagare).toBe(1060.8); // 1268.80 − 208.00
  });

  it("cassa NON soggetta a ritenuta: base ritenuta = solo imponibile (1000)", () => {
    const righe = [mkRiga({ prezzo_unitario: 1000, aliquota_iva: "22" })];
    const t = calcolaTotaliDocumento(righe, {
      cassaPrevidenziale: true,
      cassaAliquota: 4,
      cassaAliquotaIva: "22",
      cassaRitenuta: false,
      ritenutaAcconto: true,
      ritenutaAliquota: 20,
    });
    expect(t.totale_documento).toBe(1268.8); // invariato rispetto al caso con ritenuta su cassa
    expect(t.ritenuta_importo).toBe(200); // 20% su 1000 (cassa esclusa dalla base)
    expect(t.totale_da_pagare).toBe(1068.8); // 1268.80 − 200.00
  });

  it("cassa con aliquota IVA diversa dalle righe: crea una nuova riga di riepilogo", () => {
    const righe = [mkRiga({ prezzo_unitario: 1000, aliquota_iva: "10" })];
    const t = calcolaTotaliDocumento(righe, {
      cassaPrevidenziale: true,
      cassaAliquota: 4,
      cassaAliquotaIva: "22",
    });
    const r10 = t.riepilogo_iva.find((r) => parseFloat(r.aliquota) === 10)!;
    const r22 = t.riepilogo_iva.find((r) => parseFloat(r.aliquota) === 22)!;
    expect(r10.imponibile).toBe(1000);
    expect(r10.imposta).toBe(100);
    expect(r22.imponibile).toBe(40); // solo il contributo cassa
    expect(r22.imposta).toBe(8.8); // 40 × 22%
    expect(t.iva_totale).toBe(108.8);
    expect(t.totale_documento).toBe(1148.8); // 1000 + 40 + 108.80
  });
});

describe("calcolaTotaliDocumento — bollo (FIX #3)", () => {
  it("bollo virtuale incluso in totale_documento, non solo nel totale da pagare", () => {
    const righe = [mkRiga({ prezzo_unitario: 1000, aliquota_iva: "0", natura_iva: "N2_2" })];
    const t = calcolaTotaliDocumento(righe, { bolloVirtuale: true, bolloImporto: 2 });
    expect(t.iva_totale).toBe(0);
    expect(t.totale_documento).toBe(1002); // FIX #3: 1000 + bollo 2 (prima era 1000)
    expect(t.totale_da_pagare).toBe(1002); // bollo non sommato due volte
  });
});

describe("calcolaTotaliDocumento — regressione (nessun fix deve alterare i casi base)", () => {
  it("fattura semplice 22% senza cassa/bollo/ritenuta: totali invariati", () => {
    const righe = [mkRiga({ prezzo_unitario: 1000, aliquota_iva: "22" })];
    const t = calcolaTotaliDocumento(righe);
    expect(t.imponibile_totale).toBe(1000);
    expect(t.iva_totale).toBe(220);
    expect(t.totale_documento).toBe(1220);
    expect(t.cassa_importo).toBe(0);
    expect(t.totale_da_pagare).toBe(1220);
  });
});
