import { describe, it, expect } from "vitest";
import {
  parseContractExtract,
  contractImponibile,
  contractToInstallments,
} from "@/lib/orders/contractExtract";

describe("contract AI extract", () => {
  const raw = {
    cliente: { nome_completo: "Edilizia Rossi SRL", partita_iva: "01234567890", email: "info@rossi.it", telefono: null, indirizzo: "Via Roma 1", codice_fiscale: null },
    descrizione_lavori: "Rifacimento tetto",
    indirizzo_cantiere: "Via Verdi 9",
    importo_totale_eur: 10000,
    iva_pct: 10,
    importo_totale_ivato_eur: 11000,
    voci: [{ descrizione: "Smontaggio", quantita: 1, prezzo_unitario_eur: 2000 }, { descrizione: "", quantita: 1, prezzo_unitario_eur: 0 }],
    modalita_pagamento: "Bonifico bancario",
    fasi_pagamento: [
      { descrizione: "Acconto alla firma", percentuale: 30, importo_eur: null },
      { descrizione: "Saldo a fine lavori", percentuale: 70, importo_eur: null },
    ],
    data_inizio_lavori: "2026-09-01",
    data_fine_lavori: null,
    summary: "Contratto tetto",
    confidence: 0.9,
    warnings: [],
  };

  it("parses + normalizes, dropping empty voci", () => {
    const ex = parseContractExtract(raw);
    expect(ex.cliente.nome_completo).toBe("Edilizia Rossi SRL");
    expect(ex.voci).toHaveLength(1); // la voce vuota è scartata
    expect(ex.fasi_pagamento).toHaveLength(2);
  });

  it("is defensive against junk / missing", () => {
    const ex = parseContractExtract(null);
    expect(ex.cliente.nome_completo).toBe("");
    expect(ex.voci).toEqual([]);
    expect(ex.fasi_pagamento).toEqual([]);
    expect(ex.importo_totale_eur).toBeNull();
  });

  it("parses italian number strings", () => {
    const ex = parseContractExtract({ importo_totale_eur: "12.500,50", iva_pct: "22" });
    expect(ex.importo_totale_eur).toBe(12500.5);
    expect(ex.iva_pct).toBe(22);
  });

  it("imponibile: prefers explicit, else scorpora IVA dal totale ivato", () => {
    expect(contractImponibile(parseContractExtract(raw))).toBe(10000);
    const soloIvato = parseContractExtract({ importo_totale_ivato_eur: 1220, iva_pct: 22 });
    expect(contractImponibile(soloIvato)).toBe(1000); // 1220 / 1.22
  });

  it("fasi → installments: tipo inferito, importo da percentuale sul totale", () => {
    const insts = contractToInstallments(parseContractExtract(raw), 10000);
    expect(insts.map((i) => i.type)).toEqual(["deposit", "balance"]);
    expect(insts.map((i) => i.amount)).toEqual([3000, 7000]);
  });

  it("fasi → installments: usa importo esplicito se presente", () => {
    const ex = parseContractExtract({
      fasi_pagamento: [{ descrizione: "Acconto", percentuale: null, importo_eur: 500 }, { descrizione: "Saldo", percentuale: null, importo_eur: 1500 }],
    });
    const insts = contractToInstallments(ex, 2000);
    expect(insts.map((i) => i.amount)).toEqual([500, 1500]);
  });
});

// ── Irrobustimento 2026-09: aritmetica deterministica e controlli di coerenza ──
import { deriveIvaPct, contractSommaVoci, contractCoherenceWarnings } from "@/lib/orders/contractExtract";

describe("contract extract — potenziamento anti-fragilità", () => {
  const base = {
    cliente: { nome_completo: "X", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null },
    descrizione_lavori: "Serramenti", indirizzo_cantiere: null,
    modalita_pagamento: null, fasi_pagamento: [], data_inizio_lavori: null, data_fine_lavori: null,
    summary: "", confidence: 0.9, warnings: [],
  };

  it("deriveIvaPct: deduce il 10% dai totali quando l'aliquota manca (caso Cosmet)", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: 11130, iva_pct: null, importo_totale_ivato_eur: 12243, voci: [] });
    expect(deriveIvaPct(ex)).toBe(10);
  });

  it("deriveIvaPct: non inventa aliquote se i totali non ci sono", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: null, iva_pct: null, importo_totale_ivato_eur: 12243, voci: [] });
    expect(deriveIvaPct(ex)).toBeNull();
  });

  it("contractImponibile: lo scorporo deterministico batte l'imponibile sbagliato del modello", () => {
    // Il modello aveva detto 10.413; ivato 12.243 con IVA 10 → 11.130,00
    const ex = parseContractExtract({ ...base, importo_totale_eur: 10413, iva_pct: 10, importo_totale_ivato_eur: 12243, voci: [] });
    expect(contractImponibile(ex)).toBe(11130);
  });

  it("contractImponibile: senza ivato usa la somma voci quando il modello tace", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: null, iva_pct: null, importo_totale_ivato_eur: null,
      voci: [{ descrizione: "A", quantita: 2, prezzo_unitario_eur: 100 }, { descrizione: "B", quantita: 1, prezzo_unitario_eur: 50 }] });
    expect(contractSommaVoci(ex)).toBe(250);
    expect(contractImponibile(ex)).toBe(250);
  });

  it("coerenza: segnala voci che non sommano all'imponibile", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: 11130, iva_pct: 10, importo_totale_ivato_eur: 12243,
      voci: [{ descrizione: "Unica voce", quantita: 1, prezzo_unitario_eur: 5000 }] });
    const w = contractCoherenceWarnings(ex);
    expect(w.some((x) => x.includes("somma delle voci"))).toBe(true);
  });

  it("coerenza: fasi di pagamento che non coprono il totale", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: 11130, iva_pct: 10, importo_totale_ivato_eur: 12243,
      voci: [{ descrizione: "V", quantita: 1, prezzo_unitario_eur: 11130 }],
      fasi_pagamento: [{ descrizione: "Acconto", percentuale: null, importo_eur: 443 }] });
    const w = contractCoherenceWarnings(ex);
    expect(w.some((x) => x.includes("fasi di pagamento"))).toBe(true);
  });

  it("coerenza: tutto torna → zero avvisi (443 + 11.800 = 12.243)", () => {
    const ex = parseContractExtract({ ...base, importo_totale_eur: 11130, iva_pct: 10, importo_totale_ivato_eur: 12243,
      voci: [{ descrizione: "V", quantita: 1, prezzo_unitario_eur: 11130 }],
      fasi_pagamento: [
        { descrizione: "Acconto", percentuale: null, importo_eur: 443 },
        { descrizione: "Finanziamento", percentuale: null, importo_eur: 11800 },
      ] });
    expect(contractCoherenceWarnings(ex)).toEqual([]);
  });
});
