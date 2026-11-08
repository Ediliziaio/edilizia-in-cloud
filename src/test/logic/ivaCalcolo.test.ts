// Simulazioni del calcolo IVA (migrazione 20281230104000): integrazioni e
// autofatture, segni delle righe, riepiloghi ricostruiti dalle righe, reverse
// charge. Ogni caso nasce da un difetto visto sui dati veri il 07/11/2026.
// In fondo, 400 documenti casuali confrontati con un oracolo scritto da zero.
import type { PGlite } from "@electric-sql/pglite";
import { describe, it, expect, vi } from "vitest";
import { c, setup } from "./ivaPglite";

vi.setConfig({ testTimeout: 120000 });

type Riga = { aliquota?: string; aliquota_iva?: string; natura?: string; imponibile: number; imposta: number };

async function ricevuta(
  db: PGlite,
  o: {
    tipo?: string;
    data?: string;
    imponibile: number;
    iva: number;
    totale?: number;
    riepilogo?: Riga[] | null;
    righe?: Riga[] | null;
    piva?: string;
    numero?: string;
    rc?: number | null;
  },
) {
  const r = await db.query<{ id: string }>(
    `insert into fatture_ricevute(company_id,numero_fattura,tipo_documento,cedente_ragione_sociale,cedente_piva,data_fattura,data_ricezione_sdi,
       imponibile_totale,iva_totale,totale_documento,riepilogo_iva,righe,aliquota_reverse_charge,stato)
     values($1,$2,$3,'Fornitore',$4,$5,$6,$7,$8,$9,$10,$11,$12,'letta') returning id`,
    [
      c,
      o.numero ?? `R-${Math.random()}`,
      o.tipo ?? "TD01",
      o.piva ?? "01234567890",
      o.data ?? "2026-08-10",
      `${o.data ?? "2026-08-10"}T10:00:00Z`,
      o.imponibile,
      o.iva,
      o.totale ?? o.imponibile + o.iva,
      o.riepilogo === undefined ? JSON.stringify([{ aliquota: "22", imponibile: o.imponibile, imposta: o.iva }]) : o.riepilogo && JSON.stringify(o.riepilogo),
      o.righe ? JSON.stringify(o.righe) : null,
      o.rc ?? null,
    ],
  );
  return r.rows[0].id;
}

async function emessa(
  db: PGlite,
  o: { tipo?: string; numero?: string; data?: string; imponibile: number; iva: number; riepilogo?: Riga[] | null; esig?: string },
) {
  await db.query(
    `insert into documenti_fiscali(company_id,tipo,numero,data_emissione,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,esigibilita_iva,stato)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,'emessa')`,
    [
      c,
      o.tipo ?? "fattura",
      o.numero ?? `V-${Math.random()}`,
      o.data ?? "2026-08-10",
      o.imponibile,
      o.iva,
      o.imponibile + o.iva,
      o.riepilogo === undefined ? JSON.stringify([{ aliquota: "22", imponibile: o.imponibile, imposta: o.iva }]) : o.riepilogo && JSON.stringify(o.riepilogo),
      o.esig ?? "I",
    ],
  );
}

async function importata(
  db: PGlite,
  o: { tipo?: string; data?: string; imponibile: number; iva: number; righe: { rate: number; nature?: string; net: number; tax: number }[]; sommario?: Riga[] },
) {
  const r = await db.query<{ id: string }>(
    `insert into invoices(company_id,invoice_number,document_type,issue_date,subtotal,tax_amount,total,external_tax_summary)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [c, `I-${Math.random()}`, o.tipo ?? "invoice", o.data ?? "2026-08-10", o.imponibile, o.iva, o.imponibile + o.iva, o.sommario ? JSON.stringify(o.sommario) : null],
  );
  for (const l of o.righe)
    await db.query("insert into invoice_lines(invoice_id,tax_rate,tax_nature,line_net,line_tax) values($1,$2,$3,$4,$5)", [
      r.rows[0].id,
      l.rate,
      l.nature ?? null,
      l.net,
      l.tax,
    ]);
  return r.rows[0].id;
}

type Esito = {
  iva_vendite: number;
  iva_acquisti: number;
  saldo: number;
  imponibile_vendite: number;
  imponibile_acquisti: number;
  documenti: Record<string, number>;
  dettaglio_aliquote: { lato: string; aliquota: string; imponibile: number; imposta: number }[];
  ipotesi: string[];
};
async function liquida(db: PGlite, mese = 8) {
  await db.exec("set role authenticated");
  const r = await db.query<{ l: Esito }>("select liquidazione_iva_periodo($1,'mensile',2026,$2,null) as l", [c, mese]);
  await db.exec("reset role");
  const l = r.rows[0].l;
  return {
    ...l,
    iva_vendite: Number(l.iva_vendite),
    iva_acquisti: Number(l.iva_acquisti),
    saldo: Number(l.saldo),
    imponibile_vendite: Number(l.imponibile_vendite),
    imponibile_acquisti: Number(l.imponibile_acquisti),
  };
}

const conDb = (fn: (db: PGlite) => Promise<void>) => async () => {
  const db = await setup();
  try {
    await fn(db);
  } finally {
    await db.close();
  }
};

describe("integrazioni e autofatture ricevute: IVA a debito e a credito", () => {
  it("TD18 (acquisto UE, Renova): prima solo credito, ora saldo zero", conDb(async (db) => {
    await ricevuta(db, { tipo: "TD18", imponibile: 1000, iva: 220 });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti, l.saldo]).toEqual([220, 220, 0]);
    expect(l.documenti.integrazioni_ricevute).toBe(1);
    // L'integrazione non è una vendita: niente imponibile tra le operazioni attive.
    expect(l.imponibile_vendite).toBe(0);
  }));

  it("self_invoice di Fatture in Cloud (Best Infissi), anche senza riepilogo e con le righe", conDb(async (db) => {
    await ricevuta(db, {
      tipo: "self_invoice", imponibile: 500, iva: 110, riepilogo: null,
      righe: [{ aliquota_iva: "22", imponibile: 500, imposta: 110 }],
    });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti, l.saldo]).toEqual([110, 110, 0]);
  }));

  it("la copia ricevuta di un'integrazione emessa da EiC non si conta due volte", conDb(async (db) => {
    await emessa(db, { tipo: "integrazione_beni_ue", numero: "INT-1", data: "2026-08-10", imponibile: 1000, iva: 220 });
    await ricevuta(db, { tipo: "TD18", numero: "INT-1", data: "2026-08-10", imponibile: 1000, iva: 220 });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti, l.saldo]).toEqual([220, 220, 0]);
  }));

  it("insieme a una vendita vera, il saldo resta quello della vendita", conDb(async (db) => {
    await emessa(db, { imponibile: 10000, iva: 2200 });
    await ricevuta(db, { tipo: "TD17", imponibile: 300, iva: 66 });
    await ricevuta(db, { imponibile: 2000, iva: 440 });
    const l = await liquida(db);
    expect(l.saldo).toBe(2200 - 440);
  }));
});

describe("segni delle righe", () => {
  it("una riga negativa (sconto, acconto scalato) resta negativa", conDb(async (db) => {
    await ricevuta(db, {
      imponibile: 900, iva: 198,
      riepilogo: [{ aliquota: "22", imponibile: 1000, imposta: 220 }, { aliquota: "22", imponibile: -100, imposta: -22 }],
    });
    const l = await liquida(db);
    expect(l.iva_acquisti).toBe(198);
    expect(l.imponibile_acquisti).toBe(900);
  }));

  it("nota di credito salvata in positivo: si sottrae; salvata in negativo: non diventa positiva", conDb(async (db) => {
    await ricevuta(db, { imponibile: 1000, iva: 220 });
    await ricevuta(db, { tipo: "TD04", imponibile: 100, iva: 22 });
    await ricevuta(db, {
      tipo: "TD04", imponibile: -50, iva: -11, totale: -61,
      riepilogo: [{ aliquota: "22", imponibile: -50, imposta: -11 }],
    });
    await ricevuta(db, { tipo: "passive_credit_note", imponibile: 10, iva: 2.2 });
    const l = await liquida(db);
    expect(l.iva_acquisti).toBeCloseTo(220 - 22 - 11 - 2.2, 2);
  }));

  it("nota di credito con una riga di rettifica: conta il netto", conDb(async (db) => {
    await emessa(db, {
      tipo: "nota_credito", imponibile: 90, iva: 19.8,
      riepilogo: [{ aliquota: "22", imponibile: 100, imposta: 22 }, { aliquota: "22", imponibile: -10, imposta: -2.2 }],
    });
    const l = await liquida(db);
    expect(l.iva_vendite).toBeCloseTo(-19.8, 2);
  }));
});

describe("riepilogo ricostruito dalle righe", () => {
  it("ricevuta di Fatture in Cloud: dettaglio per aliquota dalle righe", conDb(async (db) => {
    await ricevuta(db, {
      imponibile: 150, iva: 27, riepilogo: null,
      righe: [{ aliquota_iva: "22", imponibile: 100, imposta: 22 }, { aliquota_iva: "10", imponibile: 50, imposta: 5 }],
    });
    const l = await liquida(db);
    const acq = l.dettaglio_aliquote.filter((d) => d.lato === "acquisti").map((d) => [d.aliquota, Number(d.imposta)]);
    expect(acq).toEqual([["10", 5], ["22", 22]]);
    expect(l.documenti.acquisti_senza_riepilogo).toBe(0);
  }));

  it("arrotondamenti delle righe: il riepilogo somma esattamente al totale del documento", conDb(async (db) => {
    // Tre righe al 22% arrotondate una per una: 3 × 7,33 = 21,99, il documento dice 22,00.
    await ricevuta(db, {
      imponibile: 100, iva: 22, riepilogo: null,
      righe: [
        { aliquota_iva: "22", imponibile: 33.33, imposta: 7.33 },
        { aliquota_iva: "22", imponibile: 33.33, imposta: 7.33 },
        { aliquota_iva: "22", imponibile: 33.34, imposta: 7.33 },
        { aliquota_iva: "10", imponibile: 0, imposta: 0 },
      ],
    });
    const v = await db.query<{ riepilogo_iva: Riga[] }>("select riepilogo_iva from fatture_ricevute_periodo_iva");
    const r = v.rows[0].riepilogo_iva;
    expect(r.reduce((t, x) => t + Number(x.imposta), 0)).toBeCloseTo(22, 2);
    expect(r.find((x) => x.aliquota === "22")?.imposta).toBe(22);
    const l = await liquida(db);
    expect(l.iva_acquisti).toBe(22);
  }));

  it("righe che non tornano col totale, o senza aliquota: si usa il totale, mai uno 0% inventato", conDb(async (db) => {
    await ricevuta(db, { imponibile: 150, iva: 27, riepilogo: null, righe: [{ aliquota_iva: "22", imponibile: 100, imposta: 22 }] });
    await ricevuta(db, { imponibile: 100, iva: 22, riepilogo: null, righe: [{ imponibile: 100, imposta: 22 }] });
    const l = await liquida(db);
    expect(l.iva_acquisti).toBe(49);
    expect(l.dettaglio_aliquote.filter((d) => d.lato === "acquisti").map((d) => d.aliquota)).toEqual(["—"]);
    expect(l.documenti.acquisti_senza_riepilogo).toBe(2);
    expect(l.ipotesi.join(" ")).toContain("2 documenti senza dettaglio per aliquota");
  }));

  it("emessa importata: riepilogo dalle righe, con natura e aliquota «10» e non «10.00»", conDb(async (db) => {
    await importata(db, {
      imponibile: 1500, iva: 100,
      righe: [{ rate: 10, net: 1000, tax: 100 }, { rate: 0, nature: "N6.3", net: 500, tax: 0 }],
    });
    const v = await db.query<{ riepilogo_iva: Riga[] }>("select riepilogo_iva from fatture_vendite_iva");
    expect(v.rows[0].riepilogo_iva.map((r) => [r.aliquota, r.natura ?? null, Number(r.imponibile)])).toEqual([
      ["0", "N6.3", 500],
      ["10", null, 1000],
    ]);
    const l = await liquida(db);
    expect(l.iva_vendite).toBe(100);
    expect(l.documenti.vendite_senza_riepilogo).toBe(0);
  }));

  it("emessa importata: il riepilogo del provider vince sulle righe; righe che non tornano: totale", conDb(async (db) => {
    await importata(db, {
      imponibile: 100, iva: 22, sommario: [{ aliquota: "22", imponibile: 100, imposta: 22 }],
      righe: [{ rate: 10, net: 100, tax: 10 }],
    });
    await importata(db, { imponibile: 100, iva: 22, righe: [{ rate: 22, net: 90, tax: 19.8 }] });
    const l = await liquida(db);
    expect(l.iva_vendite).toBe(44);
    expect(l.documenti.vendite_senza_riepilogo).toBe(1);
  }));

  it("nota di credito importata: le righe positive si sottraggono", conDb(async (db) => {
    await importata(db, { tipo: "credit_note", imponibile: 100, iva: 10, righe: [{ rate: 10, net: 100, tax: 10 }] });
    const l = await liquida(db);
    expect(l.iva_vendite).toBe(-10);
  }));
});

describe("reverse charge delle ricevute", () => {
  it("N6.3 senza aliquota: integrata al 22% su entrambi i lati, e il prospetto lo dice", conDb(async (db) => {
    await ricevuta(db, { imponibile: 1000, iva: 0, riepilogo: [{ aliquota: "0", natura: "N6.3", imponibile: 1000, imposta: 0 }] });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti, l.saldo]).toEqual([220, 220, 0]);
    expect(l.imponibile_vendite).toBe(0);
    expect(l.documenti.reverse_charge_aliquota_presunta).toBe(1);
    expect(l.ipotesi.join(" ")).toContain("reverse charge senza aliquota");
  }));

  it("N6.3 con aliquota 10% indicata: al 10%", conDb(async (db) => {
    await ricevuta(db, { imponibile: 1000, iva: 0, rc: 10, riepilogo: [{ aliquota: "0", natura: "N6.3", imponibile: 1000, imposta: 0 }] });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti]).toEqual([100, 100]);
    expect(l.documenti.reverse_charge_aliquota_presunta).toBe(0);
  }));

  it("N6.3 già integrata da una TD16 ricevuta: si conta la TD16, non due volte", conDb(async (db) => {
    await ricevuta(db, { piva: "IT09876543210", imponibile: 1000, iva: 0, riepilogo: [{ aliquota: "0", natura: "N6.3", imponibile: 1000, imposta: 0 }] });
    await ricevuta(db, { tipo: "TD16", piva: "09876543210", data: "2026-08-20", imponibile: 1000, iva: 100 });
    const l = await liquida(db);
    expect([l.iva_vendite, l.iva_acquisti, l.saldo]).toEqual([100, 100, 0]);
    expect(l.documenti.reverse_charge).toBe(0);
  }));
});

describe("simulazione: 400 documenti casuali contro un oracolo", () => {
  it("saldo, IVA vendite e IVA acquisti uguali all'oracolo, mese per mese", conDb(async (db) => {
    let s = 7112026;
    const caso = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const cent = (x: number) => Math.round(x * 100) / 100;
    const atteso = new Map<number, { v: number; a: number }>();
    const somma = (mese: number, v: number, a: number) => {
      const x = atteso.get(mese) ?? { v: 0, a: 0 };
      x.v = cent(x.v + v);
      x.a = cent(x.a + a);
      atteso.set(mese, x);
    };
    for (let i = 0; i < 400; i++) {
      const mese = 1 + Math.floor(caso() * 6);
      const data = `2026-${String(mese).padStart(2, "0")}-${String(1 + Math.floor(caso() * 27)).padStart(2, "0")}`;
      const base = cent(10 + caso() * 5000);
      const aliq = [4, 10, 22][Math.floor(caso() * 3)];
      const iva = cent((base * aliq) / 100);
      const sconto = caso() < 0.2 ? cent(base * 0.1) : 0;
      const ivaSconto = cent((sconto * aliq) / 100);
      const righe: Riga[] = [{ aliquota: String(aliq), imponibile: base, imposta: iva }];
      if (sconto) righe.push({ aliquota: String(aliq), imponibile: -sconto, imposta: -ivaSconto });
      const netto = cent(base - sconto), ivaNetta = cent(iva - ivaSconto);
      const t = caso();
      if (t < 0.25) {
        const nota = caso() < 0.15;
        await emessa(db, { tipo: nota ? "nota_credito" : "fattura", data, imponibile: netto, iva: ivaNetta, riepilogo: righe });
        somma(mese, nota ? -ivaNetta : ivaNetta, 0);
      } else if (t < 0.35) {
        await emessa(db, { data, imponibile: netto, iva: ivaNetta, riepilogo: righe, esig: "S" });
        // Split payment: la versa il committente.
      } else if (t < 0.5) {
        await ricevuta(db, { tipo: caso() < 0.5 ? "TD18" : "self_invoice", data, imponibile: netto, iva: ivaNetta, riepilogo: righe });
        somma(mese, ivaNetta, ivaNetta);
      } else if (t < 0.6) {
        const rc = caso() < 0.5 ? null : 10;
        await ricevuta(db, {
          data, imponibile: base, iva: 0, rc, piva: `P${i}`,
          riepilogo: [{ aliquota: "0", natura: "N6.3", imponibile: base, imposta: 0 }],
        });
        const integr = cent((base * (rc ?? 22)) / 100);
        somma(mese, integr, integr);
      } else if (t < 0.7) {
        // Da Fatture in Cloud: niente riepilogo, solo righe.
        await ricevuta(db, { tipo: "expense", data, imponibile: netto, iva: ivaNetta, riepilogo: null, righe: righe.map((r) => ({ aliquota_iva: r.aliquota, imponibile: r.imponibile, imposta: r.imposta })) });
        somma(mese, 0, ivaNetta);
      } else if (t < 0.76) {
        // Né riepilogo né righe (il caso che una prima versione della correzione faceva sparire).
        const vendita = caso() < 0.5;
        if (vendita) await emessa(db, { data, imponibile: netto, iva: ivaNetta, riepilogo: null });
        else await ricevuta(db, { data, imponibile: netto, iva: ivaNetta, riepilogo: null });
        somma(mese, vendita ? ivaNetta : 0, vendita ? 0 : ivaNetta);
      } else {
        const nota = caso() < 0.15;
        const negativa = nota && caso() < 0.5;
        await ricevuta(db, {
          tipo: nota ? "TD04" : "TD01", data,
          imponibile: negativa ? -netto : netto, iva: negativa ? -ivaNetta : ivaNetta,
          totale: negativa ? -(netto + ivaNetta) : netto + ivaNetta,
          riepilogo: negativa ? righe.map((r) => ({ ...r, imponibile: -r.imponibile, imposta: -r.imposta })) : righe,
        });
        somma(mese, 0, nota ? -ivaNetta : ivaNetta);
      }
    }
    for (let mese = 1; mese <= 6; mese++) {
      const l = await liquida(db, mese);
      const x = atteso.get(mese) ?? { v: 0, a: 0 };
      expect({ mese, v: l.iva_vendite, a: l.iva_acquisti, saldo: l.saldo }).toEqual({ mese, v: x.v, a: x.a, saldo: cent(x.v - x.a) });
    }
  }));
});
