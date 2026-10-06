/**
 * Aritmetica decimale ESATTA, come la fa PostgreSQL con `numeric`: serve ai test
 * per rifare, in modo indipendente dal codice dell'app, i conti che il database
 * fa sulle righe di un preventivo (colonne a scala fissa, `line_total` generato,
 * `do_recalculate_quote_totals`).
 *
 * Niente numeri in virgola mobile: ogni valore è un intero BigInt diviso per
 * 10^scala. `ROUND` e il cast a `numeric(p,s)` arrotondano il mezzo lontano da
 * zero, come PostgreSQL.
 */

export type Dec = { n: bigint; s: number };

const DIECI = 10n;
const pot = (k: number): bigint => DIECI ** BigInt(k);

/** Da testo («122.26500000000001», «1e-7», «-3») a decimale esatto: quello che il database legge dal JSON. */
export function dec(valore: number | string): Dec {
  const testo = typeof valore === "number" ? JSON.stringify(valore) : String(valore).trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(testo);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`Numero non valido: ${testo}`);
  const intera = m[2] || "0";
  const frazione = m[3] ?? "";
  const esponente = Number(m[4] ?? 0);
  let n = BigInt(intera + frazione);
  let s = frazione.length - esponente;
  if (s < 0) { n *= pot(-s); s = 0; }
  return { n: m[1] === "-" ? -n : n, s };
}

const allinea = (a: Dec, b: Dec): [bigint, bigint, number] => {
  const s = Math.max(a.s, b.s);
  return [a.n * pot(s - a.s), b.n * pot(s - b.s), s];
};

export const somma = (a: Dec, b: Dec): Dec => { const [x, y, s] = allinea(a, b); return { n: x + y, s }; };
export const diff = (a: Dec, b: Dec): Dec => { const [x, y, s] = allinea(a, b); return { n: x - y, s }; };
export const per = (a: Dec, b: Dec): Dec => ({ n: a.n * b.n, s: a.s + b.s });
/** Divisione per una potenza di dieci (100, 1000…): esatta. */
export const diviso100 = (a: Dec): Dec => ({ n: a.n, s: a.s + 2 });
export const uno: Dec = { n: 1n, s: 0 };
export const zero: Dec = { n: 0n, s: 0 };

/** ROUND(x, scala) e cast a numeric(p,scala): il mezzo si allontana da zero. */
export function arrotonda(a: Dec, scala: number): Dec {
  if (a.s <= scala) return { n: a.n * pot(scala - a.s), s: scala };
  const d = pot(a.s - scala);
  const negativo = a.n < 0n;
  const assoluto = negativo ? -a.n : a.n;
  let q = assoluto / d;
  if ((assoluto % d) * 2n >= d) q += 1n;
  return { n: negativo ? -q : q, s: scala };
}

export const inNumero = (a: Dec): number => Number(a.n) / Number(pot(a.s));
export const eZero = (a: Dec): boolean => a.n === 0n;
export const maggiore = (a: Dec, b: Dec): boolean => { const [x, y] = allinea(a, b); return x > y; };

// ─── Il database: righe di preventivo e totali ──────────────────────────────

/** Una riga come la manda il client alla RPC save_quote_items_atomic. */
export type RigaClient = {
  quantity: number;
  unit_price: number;
  discount_percent?: number | null;
  vat_rate?: number | null;
  is_optional?: boolean | null;
};

/** quote_items: quantity numeric(10,2), unit_price numeric(12,2), discount_percent numeric(5,2), vat_rate numeric(5,2). */
export function rigaSalvata(r: RigaClient) {
  return {
    quantity: arrotonda(dec(r.quantity ?? 0), 2),
    unit_price: arrotonda(dec(r.unit_price ?? 0), 2),
    discount_percent: arrotonda(dec(r.discount_percent ?? 0), 2),
    vat_rate: arrotonda(dec(r.vat_rate ?? 22), 2),
    is_optional: r.is_optional === true,
  };
}

/** line_total GENERATED: ROUND(quantity * unit_price * (1 - discount_percent / 100), 2). */
export function lineTotalDb(r: RigaClient): Dec {
  const s = rigaSalvata(r);
  const fattore = diff(uno, diviso100(s.discount_percent));
  return arrotonda(per(per(s.quantity, s.unit_price), fattore), 2);
}

export type TotaliDb = { subtotal: Dec; discount_amount: Dec; vat_amount: Dec; total: Dec };

/**
 * do_recalculate_quote_totals (migrazione 20280923100000_quote_totals_rounding_parity):
 * somma dei line_total delle righe non opzionali, netto arrotondato dopo lo
 * sconto, IVA arrotondata per aliquota.
 */
export function totaliDb(
  righe: RigaClient[],
  scontoPct: number,
  prezzoManuale?: number | null,
  ivaPrezzoManuale?: number | null,
): TotaliDb {
  const sconto = dec(scontoPct ?? 0);
  const fattore = diff(uno, diviso100(sconto));
  // quotes.prezzo_manuale numeric(12,2), prezzo_manuale_iva_pct numeric(5,2).
  const manuale = prezzoManuale != null && Number(prezzoManuale) > 0 ? arrotonda(dec(prezzoManuale), 2) : null;
  let base: Dec;
  let netto: Dec;
  let iva: Dec = zero;
  if (manuale) {
    base = manuale;
    netto = arrotonda(per(base, fattore), 2);
    iva = arrotonda(diviso100(per(netto, arrotonda(dec(ivaPrezzoManuale ?? 0), 2))), 2);
  } else {
    base = zero;
    const perAliquota = new Map<string, { aliquota: Dec; somma: Dec }>();
    for (const r of righe) {
      const s = rigaSalvata(r);
      if (s.is_optional) continue;
      const lt = lineTotalDb(r);
      base = somma(base, lt);
      const chiave = String(inNumero(s.vat_rate));
      const prec = perAliquota.get(chiave);
      perAliquota.set(chiave, { aliquota: s.vat_rate, somma: prec ? somma(prec.somma, lt) : lt });
    }
    netto = arrotonda(per(base, fattore), 2);
    for (const { aliquota, somma: sommaRighe } of perAliquota.values()) {
      iva = somma(iva, arrotonda(per(diviso100(per(sommaRighe, aliquota)), fattore), 2));
    }
  }
  return {
    subtotal: base,
    discount_amount: arrotonda(diff(base, netto), 2),
    vat_amount: iva,
    total: arrotonda(somma(netto, iva), 2),
  };
}
