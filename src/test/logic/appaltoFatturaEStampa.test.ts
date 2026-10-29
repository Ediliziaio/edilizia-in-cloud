/**
 * Il rendiconto raggruppato per cantiere e la fattura che ne nasce.
 *
 * Le due prove che contano davvero: che il reverse charge NON esponga l'IVA
 * (metterci il 22% in un subappalto edile è un errore fiscale), e che la
 * ritenuta scenda dal totale da pagare e non dall'imponibile.
 */
import { describe, it, expect } from "vitest";
import {
  raggruppaPerCantiere,
  prefillFatturaDaRendiconto,
  scadenzaDaGiorni,
  type RigaDaStampare,
  type DatiFatturaDaRendiconto,
} from "@/lib/appalto/fattura";

const riga = (o: Partial<RigaDaStampare> & { id: string; order_id: string; data: string; importo: number }): RigaDaStampare => ({
  descrizione: "Giornata uomo",
  unita_misura: "uomo_giorno",
  prezzo_unitario: 300,
  quantita: 1,
  maggiorazione_pct: 0,
  extra_contratto: false,
  ...o,
});

describe("raggruppaPerCantiere", () => {
  const cantieri = [
    { id: "o2", order_code: "C-002", description: "Via Roma" },
    { id: "o1", order_code: "C-001", description: "Via Milano" },
  ];

  it("mette ogni riga sotto il suo cantiere e somma", () => {
    const g = raggruppaPerCantiere(
      [
        riga({ id: "a", order_id: "o1", data: "2026-09-10", importo: 900 }),
        riga({ id: "b", order_id: "o2", data: "2026-09-11", importo: 600 }),
        riga({ id: "c", order_id: "o1", data: "2026-09-12", importo: 300 }),
      ],
      cantieri,
    );
    expect(g.map((x) => x.etichetta)).toEqual(["C-001", "C-002"]);
    expect(g[0].totale).toBe(1200);
    expect(g[0].righe.map((r) => r.id)).toEqual(["a", "c"]);
    expect(g[1].totale).toBe(600);
  });

  it("dentro un cantiere le righe sono in ordine di data, non di inserimento", () => {
    const g = raggruppaPerCantiere(
      [
        riga({ id: "tardi", order_id: "o1", data: "2026-09-30", importo: 100 }),
        riga({ id: "presto", order_id: "o1", data: "2026-09-01", importo: 100 }),
      ],
      cantieri,
    );
    expect(g[0].righe.map((r) => r.id)).toEqual(["presto", "tardi"]);
  });

  it("un cantiere senza codice non diventa una riga anonima", () => {
    const g = raggruppaPerCantiere(
      [riga({ id: "a", order_id: "ox", data: "2026-09-10", importo: 100 })],
      [{ id: "ox", order_code: null, description: "Capannone nord" }],
    );
    expect(g[0].etichetta).toBe("Capannone nord");

    const senzaNiente = raggruppaPerCantiere(
      [riga({ id: "a", order_id: "oy", data: "2026-09-10", importo: 100 })],
      [{ id: "oy", order_code: null, description: null }],
    );
    expect(senzaNiente[0].etichetta).toBe("Cantiere senza codice");
  });

  it("una riga di un cantiere che non è nell'elenco non viene persa", () => {
    const g = raggruppaPerCantiere([riga({ id: "a", order_id: "ignoto", data: "2026-09-10", importo: 50 })], []);
    expect(g).toHaveLength(1);
    expect(g[0].totale).toBe(50);
  });

  it("niente righe, niente cantieri", () => {
    expect(raggruppaPerCantiere([], cantieri)).toEqual([]);
  });
});

describe("la scadenza della fattura", () => {
  it("viene dai giorni di pagamento del contratto, contati da oggi", () => {
    expect(scadenzaDaGiorni(45, new Date(2026, 9, 29))).toBe("2026-12-13");
    expect(scadenzaDaGiorni(30, new Date(2026, 11, 20))).toBe("2027-01-19");
    expect(scadenzaDaGiorni(0, new Date(2026, 9, 29))).toBe("2026-10-29");
  });

  it("senza giorni di pagamento non si inventa una data", () => {
    expect(scadenzaDaGiorni(null)).toBeNull();
    expect(scadenzaDaGiorni(undefined)).toBeNull();
    expect(scadenzaDaGiorni(-5)).toBeNull();
  });
});

describe("prefillFatturaDaRendiconto", () => {
  const base: DatiFatturaDaRendiconto = {
    numero: 7,
    periodoDal: "2026-09-01",
    periodoAl: "2026-09-30",
    cantieri: [
      { orderId: "o1", codice: "C-001", descrizione: "Via Milano", etichetta: "C-001", righe: [], totale: 1000 },
      { orderId: "o2", codice: "C-002", descrizione: null, etichetta: "C-002", righe: [], totale: 500 },
    ],
    committente: { business_name: "Impresa Alfa S.r.l.", vat_number: "01234567890", city: "Milano" },
    riferimentoCommittente: "ORD-2026-88",
    regimeIva: "ordinaria",
    ritenutaPct: 4,
  };

  it("una riga per cantiere, con il periodo nella descrizione", () => {
    const f = prefillFatturaDaRendiconto(base);
    expect(f.righe).toHaveLength(2);
    expect(f.righe?.[0].descrizione).toContain("C-001");
    expect(f.righe?.[0].descrizione).toContain("Via Milano");
    expect(f.righe?.[0].descrizione).toContain("01/09/2026");
    expect(f.righe?.[0].descrizione).toContain("30/09/2026");
    expect(f.righe?.[0].prezzo_unitario).toBe(1000);
    expect(f.righe?.[1].numero_linea).toBe(2);
  });

  it("IVA ordinaria: 22% esposta, imponibile e totali coerenti", () => {
    const f = prefillFatturaDaRendiconto(base);
    expect(f.imponibile_totale).toBe(1500);
    expect(f.iva_totale).toBe(330);
    expect(f.totale_documento).toBe(1830);
    expect(f.riepilogo_iva?.[0].aliquota).toBe("22");
    expect(f.riepilogo_iva?.[0].natura).toBeUndefined();
  });

  it("reverse charge: nessuna IVA, natura N6.3 e la dicitura di legge", () => {
    const f = prefillFatturaDaRendiconto({ ...base, regimeIva: "reverse_charge" });
    expect(f.iva_totale).toBe(0);
    expect(f.righe?.every((r) => r.aliquota_iva === "0")).toBe(true);
    expect(f.righe?.every((r) => r.natura_iva === "N6_3")).toBe(true);
    expect(f.riepilogo_iva?.[0].natura).toBe("N6_3");
    expect(f.totale_documento).toBe(1500);
    expect((f.causale as string[]).some((c) => c.includes("17 comma 6 lettera a"))).toBe(true);
  });

  it("la ritenuta scende dal totale da pagare, non dall'imponibile", () => {
    const f = prefillFatturaDaRendiconto(base);
    expect(f.ritenuta_acconto).toBe(true);
    expect(f.ritenuta_importo).toBe(60); // 4% di 1500
    expect(f.imponibile_totale).toBe(1500);
    expect(f.totale_da_pagare).toBe(1770); // 1830 − 60
  });

  it("senza ritenuta non scrive campi di ritenuta a caso", () => {
    const f = prefillFatturaDaRendiconto({ ...base, ritenutaPct: 0 });
    expect(f.ritenuta_acconto).toBe(false);
    expect(f.ritenuta_importo).toBeUndefined();
    expect(f.totale_da_pagare).toBe(f.totale_documento);
    expect(f.righe?.every((r) => r.ritenuta === false)).toBe(true);
  });

  it("il riferimento del committente va dove il suo ufficio lo legge", () => {
    const f = prefillFatturaDaRendiconto(base);
    expect(f.codice_commessa_convenzione).toBe("ORD-2026-88");
    expect(f.riferimenti_ordine).toEqual([{ IdDocumento: "ORD-2026-88" }]);
    expect((f.causale as string[])[0]).toContain("Vs. rif. ORD-2026-88");
    expect(f.note_documento).toContain("Rendiconto n. 7");
  });

  it("senza riferimento non inventa un ordine d'acquisto vuoto", () => {
    const f = prefillFatturaDaRendiconto({ ...base, riferimentoCommittente: null });
    expect(f.riferimenti_ordine).toBeUndefined();
    expect(f.codice_commessa_convenzione).toBeUndefined();
    expect((f.causale as string[])[0]).not.toContain("Vs. rif.");
  });

  it("il committente è un'impresa: il cliente nasce B2B con la sua P.IVA", () => {
    const f = prefillFatturaDaRendiconto(base);
    expect(f.cliente_snapshot?.ragione_sociale).toBe("Impresa Alfa S.r.l.");
    expect(f.cliente_snapshot?.partita_iva).toBe("01234567890");
    expect(f.cliente_snapshot?.tipo_cliente).toBe("B2B");
  });

  it("un committente senza ragione sociale prende nome e cognome", () => {
    const f = prefillFatturaDaRendiconto({
      ...base,
      committente: { business_name: null, first_name: "Luigi", last_name: "Bianchi" },
    });
    expect(f.cliente_snapshot?.ragione_sociale).toBe("Luigi Bianchi");
  });
});
