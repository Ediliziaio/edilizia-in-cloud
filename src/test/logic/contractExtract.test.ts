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
