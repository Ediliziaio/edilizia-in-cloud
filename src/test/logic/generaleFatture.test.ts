import { describe, expect, it } from "vitest";
import {
  AVVISO_CAPARRA, CAUSALE_REVERSE_CHARGE, CAUSALE_SPLIT_PAYMENT,
  bozzaFatturaPagamento, bozzaFatturaSal, descrizioneUnita, etichettaFattura, fatturaDi,
  leggiDatiFattura, leggiElencoFatture, messaggioFattura,
  type DatiFatturaPagamento, type DatiFatturaSal,
} from "@/lib/orders/generali/fatture";

const committente = {
  anagrafica_id: "ana-1", tipo_cliente: "B2B", ragione_sociale: "Comune di Prova srl",
  partita_iva: "01234567890", codice_sdi: "ABC1234", indirizzo_via: "Via Roma 1",
  indirizzo_cap: "00100", indirizzo_comune: "Roma", indirizzo_provincia: "RM", indirizzo_nazione: "IT",
};

const rawSal = (sal: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  company_id: "c", generale_id: "g", ordine_id: "g",
  cliente: committente, esistente: null,
  sal: {
    id: "sal-1", numero: 3, stato: "emesso", data: "2026-10-30", dal: "2026-09-01", al: "2026-09-30",
    lordo: "1000.00", ritenuta_pct: "0.5", ritenuta: "5.00", recupero_pct: "10", recupero: "100.00", netto: "895.00",
    riferimento_contratto: "Rep. 12/2026", cig: "ABCDE12345", cup: "J12F34000000001",
    split_payment: false, reverse_charge: false, generale_codice: "CG-1", generale_nome: "Scuola via Verdi",
    ...sal,
  },
  ...extra,
});

const datiSal = (sal: Record<string, unknown> = {}) => leggiDatiFattura(rawSal(sal)) as DatiFatturaSal;

const rawPagamento = (m: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  company_id: "c", generale_id: "g", ordine_id: "figlia",
  cliente: { anagrafica_id: null, tipo_cliente: "B2C", nome: "Mario", cognome: "Rossi", codice_fiscale: "RSSMRA80A01H501U", indirizzo_nazione: "IT" },
  esistente: null,
  movimento: {
    id: "mov-1", tipo: "acconto", importo: "22000", data: "2026-10-15", descrizione: null,
    unita_sigla: "A1", edificio: "B", piano: "2", tipologia: "Trilocale", mq: "85.5",
    generale_codice: "SV-1", generale_nome: "Residenza Le Querce", indirizzo: "Via dei Pini 4, Bergamo",
    ...m,
  },
  ...extra,
});

const datiPagamento = (m: Record<string, unknown> = {}) => leggiDatiFattura(rawPagamento(m)) as DatiFatturaPagamento;

describe("leggiDatiFattura", () => {
  it("legge un SAL con i numeri del database", () => {
    const d = datiSal();
    expect(d.origine).toBe("sal");
    expect(d.sal.netto).toBe(895);
    expect(d.sal.generale).toBe("CG-1 — Scuola via Verdi");
    expect(d.cliente?.anagraficaId).toBe("ana-1");
    expect(d.esistente).toBeNull();
  });

  it("legge la fattura già esistente", () => {
    const d = leggiDatiFattura(rawSal({}, { esistente: { id: "doc-9", numero: "Bozza AB12", stato: "bozza" } }));
    expect(d.esistente).toEqual({ id: "doc-9", numero: "Bozza AB12", stato: "bozza" });
  });

  it("legge un pagamento di un'unità e un cliente senza tipo", () => {
    const d = leggiDatiFattura(rawPagamento({}, { cliente: { partita_iva: "01234567890", ragione_sociale: "Srl" } })) as DatiFatturaPagamento;
    expect(d.origine).toBe("movimento");
    expect(d.pagamento.mq).toBe(85.5);
    expect(d.cliente?.tipo).toBe("B2B");
  });

  it("senza cliente restituisce null", () => {
    expect(leggiDatiFattura(rawSal({}, { cliente: null })).cliente).toBeNull();
  });
});

describe("bozzaFatturaSal", () => {
  it("fattura il netto del SAL con CIG, CUP e riferimento al contratto", () => {
    const b = bozzaFatturaSal(datiSal(), "22");
    expect(b.tipo).toBe("fattura");
    expect(b.imponibile_totale).toBe(895);
    expect(b.iva_totale).toBe(196.9);
    expect(b.totale_documento).toBe(1091.9);
    expect(b.totale_da_pagare).toBe(1091.9);
    expect(b.cig).toBe("ABCDE12345");
    expect(b.cup).toBe("J12F34000000001");
    expect(b.riferimenti_ordine).toEqual([{ IdDocumento: "Rep. 12/2026" }]);
    expect(b.causale?.[0]).toBe("SAL n. 3 del contratto Rep. 12/2026");
    expect(b.righe?.[0].descrizione).toContain("ritenuta di garanzia 0,5%");
    expect(b.righe?.[0].descrizione).toContain("recupero anticipazione 10%");
    expect(b.cliente_snapshot?.ragione_sociale).toBe("Comune di Prova srl");
    expect(b.cliente_snapshot?.cig).toBe("ABCDE12345");
  });

  it("rispetta l'aliquota scelta", () => {
    const b = bozzaFatturaSal(datiSal(), "10");
    expect(b.iva_totale).toBe(89.5);
    expect(b.riepilogo_iva?.[0].aliquota).toBe("10");
  });

  it("reverse charge: IVA zero, natura N6.3 e dicitura", () => {
    const b = bozzaFatturaSal(datiSal({ reverse_charge: true, split_payment: true }), "22");
    expect(b.iva_totale).toBe(0);
    expect(b.righe?.[0].natura_iva).toBe("N6_3");
    expect(b.causale).toContain(CAUSALE_REVERSE_CHARGE);
    // Reverse charge e split payment non stanno insieme: vince l'inversione contabile.
    expect(b.causale).not.toContain(CAUSALE_SPLIT_PAYMENT);
    expect(b.esigibilita_iva).toBeUndefined();
    expect(b.totale_documento).toBe(895);
  });

  it("split payment: esigibilità S e da incassare solo l'imponibile", () => {
    const b = bozzaFatturaSal(datiSal({ split_payment: true }), "22");
    expect(b.esigibilita_iva).toBe("S");
    expect(b.riepilogo_iva?.every((r) => r.esigibilita === "S")).toBe(true);
    expect(b.totale_documento).toBe(1091.9);
    expect(b.totale_da_pagare).toBe(895);
    expect(b.causale).toContain(CAUSALE_SPLIT_PAYMENT);
  });

  it("una PA riceve una fattura PA", () => {
    const d = leggiDatiFattura(rawSal({}, { cliente: { ...committente, tipo_cliente: "PA" } })) as DatiFatturaSal;
    expect(bozzaFatturaSal(d).tipo).toBe("fattura_pa");
  });

  it("senza riferimento al contratto usa il nome della generale e tronca l'IdDocumento", () => {
    expect(bozzaFatturaSal(datiSal({ riferimento_contratto: null })).causale?.[0]).toBe("SAL n. 3 del contratto CG-1 — Scuola via Verdi");
    const lungo = bozzaFatturaSal(datiSal({ riferimento_contratto: "Contratto rep. 123456789/2026" }));
    expect((lungo.riferimenti_ordine?.[0] as { IdDocumento: string }).IdDocumento).toHaveLength(20);
  });
});

describe("bozzaFatturaPagamento", () => {
  it("acconto al 10% con IVA inclusa: il totale è l'importo versato", () => {
    const b = bozzaFatturaPagamento(datiPagamento(), "10", true);
    expect(b.totale_documento).toBe(22000);
    expect(b.imponibile_totale).toBe(20000);
    expect(b.iva_totale).toBe(2000);
    expect(b.righe?.[0].descrizione).toContain("Acconto prezzo del 15/10/2026");
    expect(b.righe?.[0].descrizione).toContain("unità A1, Trilocale, edificio B, piano 2, 85,5 m² commerciali");
    expect(b.causale?.[1]).toContain("127-undecies");
    expect(b.cliente_snapshot?.ragione_sociale).toBe("Mario Rossi");
    expect(b.cliente_snapshot?.tipo_cliente).toBe("B2C");
  });

  it("lo scorporo non perde centesimi", () => {
    const b = bozzaFatturaPagamento(datiPagamento({ importo: "10000" }), "10", true);
    expect(b.totale_documento).toBe(10000);
    expect(Math.round(((b.imponibile_totale ?? 0) + (b.iva_totale ?? 0)) * 100) / 100).toBe(10000);
  });

  it("prima casa al 4%, IVA in più", () => {
    const b = bozzaFatturaPagamento(datiPagamento({ importo: "10000" }), "4", false);
    expect(b.imponibile_totale).toBe(10000);
    expect(b.iva_totale).toBe(400);
    expect(b.causale?.[1]).toContain("prima casa");
  });

  it("esente: natura N4, niente scorporo", () => {
    const b = bozzaFatturaPagamento(datiPagamento({ importo: "10000" }), "esente", true);
    expect(b.iva_totale).toBe(0);
    expect(b.imponibile_totale).toBe(10000);
    expect(b.righe?.[0].natura_iva).toBe("N4");
    expect(b.causale?.[1]).toContain("8-bis");
  });

  it("la caparra si chiama caparra e c'è l'avviso", () => {
    const b = bozzaFatturaPagamento(datiPagamento({ tipo: "caparra" }), "10");
    expect(b.righe?.[0].descrizione).toMatch(/^Caparra confirmatoria/);
    expect(AVVISO_CAPARRA).toMatch(/non si fattura/);
  });

  it("descrizione dell'unità senza dati facoltativi", () => {
    const d = datiPagamento({ edificio: null, piano: null, tipologia: null, mq: null, indirizzo: null });
    expect(descrizioneUnita(d.pagamento)).toBe("unità A1 — SV-1 — Residenza Le Querce");
  });
});

describe("elenco delle fatture", () => {
  const elenco = leggiElencoFatture({
    puo_fatturare: true,
    fatture: [
      { documento_id: "d1", sal_id: "sal-1", movimento_id: null, numero: "FT-2026-0012", stato: "emessa", data: "2026-10-30", totale: "1091.9", pagato: "0" },
      { documento_id: "d2", sal_id: null, movimento_id: "mov-1", numero: "Bozza ABCD1234", stato: "bozza", totale: 22000, pagato: null },
      { sal_id: "senza-documento" },
    ],
  });

  it("legge le fatture e il permesso", () => {
    expect(elenco.puoFatturare).toBe(true);
    expect(elenco.fatture).toHaveLength(2);
    expect(elenco.fatture[0].totale).toBe(1091.9);
  });

  it("trova la fattura del SAL o del pagamento", () => {
    expect(fatturaDi(elenco.fatture, { salId: "sal-1" })?.documentoId).toBe("d1");
    expect(fatturaDi(elenco.fatture, { movimentoId: "mov-1" })?.documentoId).toBe("d2");
    expect(fatturaDi(elenco.fatture, { salId: "altro" })).toBeNull();
    expect(fatturaDi(undefined, { salId: "sal-1" })).toBeNull();
  });

  it("l'etichetta non mostra il numero provvisorio della bozza", () => {
    expect(etichettaFattura(elenco.fatture[0])).toBe("Fattura FT-2026-0012 (emessa)");
    expect(etichettaFattura(elenco.fatture[1])).toBe("Fattura (bozza)");
  });

  it("senza permesso o dati vuoti: niente fatture, niente bottone", () => {
    expect(leggiElencoFatture(null)).toEqual({ fatture: [], puoFatturare: false });
  });
});

describe("messaggioFattura", () => {
  it("mostra i rifiuti del database e nasconde il resto", () => {
    expect(messaggioFattura({ code: "42501", message: "Per preparare una fattura serve il permesso «Fatturazione»." }))
      .toContain("Fatturazione");
    expect(messaggioFattura({ code: "XX000", message: "stack interno" })).toMatch(/Riprova/);
    expect(messaggioFattura(null)).toMatch(/Riprova/);
  });
});
