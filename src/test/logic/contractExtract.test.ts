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
import { deriveIvaPct, contractSommaVoci, contractCoherenceWarnings, contractTotaleAtteso, reconcileContractExtract } from "@/lib/orders/contractExtract";

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

describe("contratto complesso (offerta fornitore, sconti, altri costi)", () => {
  const base2 = {
    cliente: { nome_completo: "SC Cinnirella", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null },
    descrizione_lavori: "Serramenti Rehau", indirizzo_cantiere: null,
    modalita_pagamento: null, fasi_pagamento: [], data_inizio_lavori: null, data_fine_lavori: null,
    summary: "", confidence: 0.9, warnings: [],
  };

  it("caso Cinnirella: voci − sconto 15% + imballo + trasporto = totale → zero allarmi conti", () => {
    const ex = parseContractExtract({ ...base2,
      importo_totale_eur: 8462.7, iva_pct: 0, importo_totale_ivato_eur: 8462.7,
      sconto_globale_pct: 15,
      altri_costi: [
        { descrizione: "Costo imballaggio", importo_eur: 364.81 },
        { descrizione: "Costo trasporto Italia Nord", importo_eur: 583.72 },
      ],
      natura_documento: "offerta_fornitore",
      voci: [
        { descrizione: "Porta 1", quantita: 1, prezzo_unitario_eur: 1143.05 },
        { descrizione: "Finestra 2", quantita: 1, prezzo_unitario_eur: 2237.34 },
        { descrizione: "Finestra 3", quantita: 1, prezzo_unitario_eur: 298.24 },
        { descrizione: "Finestra 4", quantita: 1, prezzo_unitario_eur: 277.8 },
        { descrizione: "Finestra 5", quantita: 1, prezzo_unitario_eur: 405.1 },
        { descrizione: "Finestra 6", quantita: 1, prezzo_unitario_eur: 560.58 },
        { descrizione: "Finestra 7", quantita: 1, prezzo_unitario_eur: 359.56 },
        { descrizione: "Finestra 8", quantita: 3, prezzo_unitario_eur: 356.12 },
        { descrizione: "Pannello 9", quantita: 1, prezzo_unitario_eur: 1936.31 },
        { descrizione: "Set balamale Maco", quantita: 1, prezzo_unitario_eur: 12.69 },
        { descrizione: "Estensione 100/80 Bianca 13 ml", quantita: 1, prezzo_unitario_eur: 294.19 },
        { descrizione: "Coprifilo piatto 80x2", quantita: 15, prezzo_unitario_eur: 16.465333 },
      ],
    });
    // somma voci = 8286,34 + 553,86 = 8840,20 → −15% = 7514,17 + 364,81 + 583,72 = 8462,70
    expect(contractSommaVoci(ex)).toBeCloseTo(8840.2, 1);
    const atteso = contractTotaleAtteso(ex);
    expect(atteso).toBeCloseTo(8462.7, 1);
    const w = contractCoherenceWarnings(ex);
    expect(w.some((x) => x.includes("somma delle voci"))).toBe(false);
    // ma l'avviso sulla natura fornitore C'E'
    expect(w.some((x) => x.includes("PRODUTTORE"))).toBe(true);
  });

  it("IVA 0% dichiarata resta 0 (niente invenzioni)", () => {
    const ex = parseContractExtract({ ...base2, importo_totale_eur: 8462.7, iva_pct: 0, importo_totale_ivato_eur: 8462.7, voci: [], altri_costi: [], sconto_globale_pct: null, natura_documento: null });
    expect(deriveIvaPct(ex)).toBe(0);
  });
});

describe("riconciliazione prezzi voce (totale-riga scambiato per unitario)", () => {
  const base3 = {
    cliente: { nome_completo: "SC Cinnirella", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null },
    descrizione_lavori: "Serramenti", indirizzo_cantiere: null,
    modalita_pagamento: null, fasi_pagamento: [], data_inizio_lavori: null, data_fine_lavori: null,
    summary: "", confidence: 0.9, warnings: [],
    importo_totale_eur: 8462.7, iva_pct: 0, importo_totale_ivato_eur: 8462.7,
    sconto_globale_pct: 15, natura_documento: "offerta_fornitore",
    altri_costi: [
      { descrizione: "Imballaggio", importo_eur: 364.81 },
      { descrizione: "Trasporto", importo_eur: 583.72 },
    ],
  };

  it("caso Termoplast VERO: accessori gonfi riconciliati, Finestra 8 (giusta) intatta", () => {
    const ex = reconcileContractExtract(parseContractExtract({ ...base3,
      voci: [
        { descrizione: "Porta 1", quantita: 1, prezzo_unitario_eur: 1143.05 },
        { descrizione: "Finestra 2", quantita: 1, prezzo_unitario_eur: 2237.34 },
        { descrizione: "Finestra 3", quantita: 1, prezzo_unitario_eur: 298.24 },
        { descrizione: "Finestra 4", quantita: 1, prezzo_unitario_eur: 277.8 },
        { descrizione: "Finestra 5", quantita: 1, prezzo_unitario_eur: 405.1 },
        { descrizione: "Finestra 6", quantita: 1, prezzo_unitario_eur: 560.58 },
        { descrizione: "Finestra 7", quantita: 1, prezzo_unitario_eur: 359.56 },
        { descrizione: "Finestra 8", quantita: 3, prezzo_unitario_eur: 356.12 }, // GIUSTA: non toccarla
        { descrizione: "Pannello 9", quantita: 1, prezzo_unitario_eur: 1936.31 },
        { descrizione: "Set balamale", quantita: 5, prezzo_unitario_eur: 12.69 },     // gonfia ×5
        { descrizione: "Estensione 13 ml", quantita: 13, prezzo_unitario_eur: 294.19 }, // gonfia ×13
        { descrizione: "Coprifilo", quantita: 15, prezzo_unitario_eur: 246.98 },       // gonfia ×15
      ],
    }));
    // Finestra 8 intatta
    const f8 = ex.voci.find((v) => v.descrizione === "Finestra 8")!;
    expect(f8.prezzo_unitario_eur).toBe(356.12);
    // Accessori riconciliati (unit = totale/q)
    expect(ex.voci.find((v) => v.descrizione.startsWith("Estensione"))!.prezzo_unitario_eur).toBeCloseTo(294.19 / 13, 2);
    expect(ex.voci.find((v) => v.descrizione === "Coprifilo")!.prezzo_unitario_eur).toBeCloseTo(246.98 / 15, 2);
    // I conti ora tornano: niente allarme somma
    const w = contractCoherenceWarnings(ex);
    expect(w.some((x) => x.includes("somma delle voci"))).toBe(false);
    // E il warning di riconciliazione c'è
    expect(ex.warnings.some((x) => x.includes("Riconciliati"))).toBe(true);
  });

  it("estratto già coerente: nessuna correzione applicata", () => {
    const ex = reconcileContractExtract(parseContractExtract({ ...base3,
      sconto_globale_pct: null, altri_costi: [], importo_totale_eur: 1068.36, importo_totale_ivato_eur: 1068.36,
      voci: [{ descrizione: "Finestra 8", quantita: 3, prezzo_unitario_eur: 356.12 }],
    }));
    expect(ex.voci[0].prezzo_unitario_eur).toBe(356.12);
    expect(ex.warnings.some((x) => x.includes("Riconciliati"))).toBe(false);
  });
});

describe("imponibile parziale con IVA 0 (variabilità tra run del modello)", () => {
  it("l'ivato comanda: imp dichiarato 7514,17 (parziale) + ivato 8462,70 + IVA 0 → 8462,70", () => {
    const ex = parseContractExtract({
      cliente: { nome_completo: "X", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null },
      descrizione_lavori: "S", indirizzo_cantiere: null, modalita_pagamento: null, fasi_pagamento: [],
      data_inizio_lavori: null, data_fine_lavori: null, summary: "", confidence: 0.9, warnings: [],
      importo_totale_eur: 7514.17, iva_pct: 0, importo_totale_ivato_eur: 8462.7,
      sconto_globale_pct: null, altri_costi: [], natura_documento: null, voci: [],
    });
    expect(contractImponibile(ex)).toBe(8462.7);
  });
});

describe("valuta non-euro (audit punto 8)", () => {
  const base4 = {
    cliente: { nome_completo: "X", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null },
    descrizione_lavori: "S", indirizzo_cantiere: null, modalita_pagamento: null, fasi_pagamento: [],
    data_inizio_lavori: null, data_fine_lavori: null, summary: "", confidence: 0.9, warnings: [],
    importo_totale_eur: 1000, iva_pct: 0, importo_totale_ivato_eur: 1000,
    sconto_globale_pct: null, altri_costi: [], natura_documento: null,
    voci: [{ descrizione: "V", quantita: 1, prezzo_unitario_eur: 1000 }],
  };
  it("CHF → allarme conversione", () => {
    const ex = parseContractExtract({ ...base4, valuta: "chf" });
    expect(ex.valuta).toBe("CHF");
    expect(contractCoherenceWarnings(ex).some((w) => w.includes("CHF"))).toBe(true);
  });
  it("EUR o assente → nessun allarme valuta", () => {
    expect(contractCoherenceWarnings(parseContractExtract({ ...base4, valuta: "EUR" })).some((w) => w.includes("euro"))).toBe(false);
    expect(parseContractExtract({ ...base4, valuta: "franchi" }).valuta).toBeNull();
  });
});
