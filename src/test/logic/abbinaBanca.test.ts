// Abbinare un bonifico alla fattura (30/10/2026): quale accredito proporre per
// primo e come descrivere il pagamento. Solo logica, senza rete.
import { describe, expect, it } from "vitest";
import {
  causaleCitaCliente,
  causaleCitaNumero,
  descriviPagamentoBanca,
  incassiSenzaBonifico,
  ordinaMovimentiPerFattura,
  type IncassoFattura,
  type MovimentoBanca,
} from "@/lib/fatturazione/abbinaBanca";

const mov = (x: Partial<MovimentoBanca> & { id: string }): MovimentoBanca => ({
  data: "2026-10-20", importo: 100, descrizione: "", controparte: null, riferimento: null, conto: null, ...x,
});

const incasso = (x: Partial<IncassoFattura> & { id: string }): IncassoFattura => ({
  data_movimento: "2026-10-15", importo: 100, metodo: "bonifico", riferimento: null, note: null,
  created_at: "2026-10-15T10:00:00Z", parlante: false, riconciliazione_id: null, abbinamento: null,
  bonifico_id: null, bonifico_data: null, bonifico_importo: null, bonifico_descrizione: null, ...x,
});

const fattura = {
  numero: "FT-2026-0037", numero_progressivo: 37, anno: 2026,
  cliente: "Rossi Costruzioni Srl", residuo: 6171, data_emissione: "2026-10-01",
};

describe("il numero della fattura nella causale", () => {
  it("numero pieno, numero breve, numero senza trattini", () => {
    expect(causaleCitaNumero("SALDO FT-2026-0037 ROSSI", fattura)).toBe(true);
    expect(causaleCitaNumero("Saldo fatt. 37/2026", fattura)).toBe(true);
    expect(causaleCitaNumero("saldo fattura 37/26", fattura)).toBe(true);
    expect(causaleCitaNumero("PAGAMENTO FT20260037", fattura)).toBe(true);
  });

  it("non dentro un altro numero", () => {
    expect(causaleCitaNumero("Saldo fatt. 137/2026", fattura)).toBe(false);
    expect(causaleCitaNumero("Saldo fatt. 37/20261", fattura)).toBe(false);
    expect(causaleCitaNumero("Bonifico generico", fattura)).toBe(false);
  });
});

describe("il cliente nella causale o nell'ordinante", () => {
  it("bastano metà delle parole che contano (srl, spa… non contano)", () => {
    expect(causaleCitaCliente("BONIFICO DA ROSSI COSTRUZIONI", "Rossi Costruzioni Srl")).toBe(true);
    expect(causaleCitaCliente("ROSSI MARIO", "Rossi Costruzioni Srl")).toBe(true);
    expect(causaleCitaCliente("Bianchi Srl", "Rossi Costruzioni Srl")).toBe(false);
    expect(causaleCitaCliente("qualcosa", "Srl")).toBe(false);
  });

  it("accenti e maiuscole non contano", () => {
    expect(causaleCitaCliente("NICOLO DE ANDRE", "Nicolò De André")).toBe(true);
  });
});

describe("ordinaMovimentiPerFattura: prima i più probabili", () => {
  it("importo uguale al residuo + numero + cliente vince su tutto", () => {
    const proposte = ordinaMovimentiPerFattura(
      [
        mov({ id: "a", importo: 6171, descrizione: "Bonifico" }),
        mov({ id: "b", importo: 6171, descrizione: "SALDO FATTURA 37/2026", controparte: "Rossi Costruzioni Srl" }),
        mov({ id: "c", importo: 50, descrizione: "Rimborso" }),
      ],
      fattura,
    );
    expect(proposte.map((p) => p.movimento.id)).toEqual(["b", "a", "c"]);
    expect(proposte[0].motivi).toEqual(["Importo uguale al residuo", "Numero fattura nella causale", "Nome del cliente"]);
    expect(proposte[0].punteggio).toBe(100);
  });

  it("a parità, il più vicino alla data della fattura", () => {
    const proposte = ordinaMovimentiPerFattura(
      [mov({ id: "lontano", importo: 6171, data: "2027-02-01" }), mov({ id: "vicino", importo: 6171, data: "2026-10-12" })],
      fattura,
    );
    expect(proposte[0].movimento.id).toBe("vicino");
  });

  it("già pagata a mano: il bonifico uguale all'incasso registrato è riconosciuto come quello", () => {
    const registrato = incasso({ id: "m1", importo: 6171 });
    const proposte = ordinaMovimentiPerFattura(
      [mov({ id: "x", importo: 300 }), mov({ id: "y", importo: 6171 })],
      { ...fattura, residuo: 0 },
      [registrato],
    );
    expect(proposte[0].movimento.id).toBe("y");
    expect(proposte[0].incassoUguale?.id).toBe("m1");
    expect(proposte[0].motivi).toContain("Importo uguale all'incasso già registrato");
  });

  it("un incasso che ha già il suo bonifico, o è con ritenuta, non si propone di nuovo", () => {
    const proposte = ordinaMovimentiPerFattura(
      [mov({ id: "y", importo: 500 })],
      { ...fattura, residuo: 0 },
      [incasso({ id: "m1", importo: 500, bonifico_id: "tx-9" }), incasso({ id: "m2", importo: 500, parlante: true })],
    );
    expect(proposte[0].incassoUguale).toBeNull();
  });
});

describe("incassiSenzaBonifico", () => {
  it("solo quelli fatti a mano, senza bonifico e senza ritenuta", () => {
    const elenco = [
      incasso({ id: "a" }),
      incasso({ id: "b", bonifico_id: "tx" }),
      incasso({ id: "c", parlante: true }),
    ];
    expect(incassiSenzaBonifico(elenco).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("descriviPagamentoBanca", () => {
  it("«Pagata · abbinata al bonifico del gg/mm»", () => {
    expect(descriviPagamentoBanca("pagata", [incasso({ id: "a", bonifico_id: "tx", bonifico_data: "2026-10-12" })]))
      .toBe("Pagata · abbinata al bonifico del 12/10");
  });

  it("in parte, o con più bonifici", () => {
    const due = [
      incasso({ id: "a", bonifico_id: "tx1", bonifico_data: "2026-10-12" }),
      incasso({ id: "b", bonifico_id: "tx2", bonifico_data: "2026-10-20" }),
    ];
    expect(descriviPagamentoBanca("parzialmente_pagata", due)).toBe("Pagata in parte · 2 bonifici abbinati");
  });

  it("senza bonifico, o tolto l'abbinamento: niente", () => {
    expect(descriviPagamentoBanca("pagata", [incasso({ id: "a" })])).toBeNull();
    expect(descriviPagamentoBanca("consegnata", [])).toBeNull();
  });
});
