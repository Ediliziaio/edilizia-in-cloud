/**
 * Il riepilogo IVA del PDF del preventivo: subtotale, sconto, righe IVA per
 * aliquota e totale, che tornano al centesimo.
 *
 * Funzione pura (prima stava dentro generate-quote-pdf, dove non si poteva
 * provare). Parte dai valori SALVATI sul preventivo (subtotal, discount_amount,
 * total: li ricalcola il database), deriva l'IVA dal totale e la ripartisce per
 * aliquota COME FA il database:
 *   ROUND(SUM(line_total) * aliquota / 100 * (1 - sconto / 100), 2)
 * Prima ogni riga IVA si calcolava sommando le IVA delle singole righe e
 * arrotondando senza il rumore della virgola mobile: sul mezzo centesimo (circa
 * 1 preventivo a più aliquote su 1.600) la riga usciva di un centesimo diversa
 * dall'IVA vera di quell'aliquota, e il residuo finiva sulla riga più grande: due
 * righe sbagliate di un centesimo, con il totale giusto.
 *
 * `righe` sono TUTTE le righe del preventivo, anche quelle nascoste nel PDF:
 * il totale e l'IVA le comprendono, quindi anche la ripartizione per aliquota.
 */

export type RigaPerIva = {
  line_total?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  discount_percent?: unknown;
  vat_rate?: unknown;
  is_optional?: boolean | null;
};

export type RigaIva = { aliquota: number | null; valore: number };

/** Come ROUND di PostgreSQL: il mezzo centesimo si allontana da zero, senza lasciare che il rumore della virgola mobile lo faccia scendere. */
export function arrotondaComePostgres(v: number): number {
  const assoluto = Math.abs(v);
  return Math.sign(v) * Math.round((assoluto + Number.EPSILON * Math.max(1, assoluto)) * 100) / 100;
}

const numero = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** L'IVA per aliquota dalle somme degli importi di riga, nello stesso ordine di calcolo del database. */
export function ivaPerAliquota(basePerAliquota: Record<string, number>, scontoPct: number): Record<string, number> {
  const fattore = 1 - numero(scontoPct) / 100;
  const iva: Record<string, number> = {};
  for (const [aliquota, base] of Object.entries(basePerAliquota)) {
    iva[aliquota] = arrotondaComePostgres(arrotondaComePostgres(base) * Number(aliquota) / 100 * fattore);
  }
  return iva;
}

export function righeRiepilogoIva(input: {
  righe: RigaPerIva[];
  subtotal: unknown;
  discount_amount: unknown;
  total: unknown;
  discount_percent: unknown;
}): { subTotShown: number; scontoShown: number; totShown: number; ivaToShow: number; righeIva: RigaIva[] } {
  const subTotShown = arrotondaComePostgres(numero(input.subtotal));
  const totShown = arrotondaComePostgres(numero(input.total));
  let scontoShown = arrotondaComePostgres(numero(input.discount_amount));
  let ivaToShow = arrotondaComePostgres(totShown - (subTotShown - scontoShown));
  if (ivaToShow < 0) {
    // Preventivo (quasi) esente con sconto: uno scarto di arrotondamento ≤1 cent
    // renderebbe l'IVA negativa. Lo si assorbe nello SCONTO (già esposto): l'IVA
    // resta ≥ 0 e il documento torna comunque.
    scontoShown = arrotondaComePostgres(scontoShown - ivaToShow);
    ivaToShow = 0;
  }

  const basePerAliquota: Record<string, number> = {};
  for (const r of input.righe.filter((x) => !x.is_optional)) {
    const aliquota = String(r.vat_rate == null || !Number.isFinite(Number(r.vat_rate)) ? 22 : Number(r.vat_rate));
    const importo = r.line_total != null && r.line_total !== ""
      ? numero(r.line_total)
      : numero(r.quantity) * numero(r.unit_price) * (1 - numero(r.discount_percent) / 100);
    basePerAliquota[aliquota] = (basePerAliquota[aliquota] || 0) + importo;
  }
  const ivaRate = ivaPerAliquota(basePerAliquota, numero(input.discount_percent));
  const aliquote = Object.keys(basePerAliquota).map(Number).sort((a, b) => a - b);
  // Le aliquote che contribuiscono davvero (almeno 0,01 € dopo lo sconto globale).
  const positive = aliquote.filter((a) => ivaRate[String(a)] >= 0.005);

  if (positive.length > 1) {
    // Più aliquote: ciascuna arrotondata; un eventuale residuo di arrotondamento
    // (con valori del database non ne resta) va alla riga più grande, così le righe
    // sommano ESATTAMENTE all'IVA mostrata.
    const righe = positive.map((aliquota) => ({ aliquota: aliquota as number | null, valore: ivaRate[String(aliquota)] }));
    const residuo = arrotondaComePostgres(ivaToShow - arrotondaComePostgres(righe.reduce((s, r) => s + r.valore, 0)));
    if (residuo !== 0) {
      let max = 0;
      for (let i = 1; i < righe.length; i++) if (righe[i].valore > righe[max].valore) max = i;
      righe[max].valore = arrotondaComePostgres(righe[max].valore + residuo);
    }
    return { subTotShown, scontoShown, totShown, ivaToShow, righeIva: righe };
  }
  // Aliquota unica (o tutte a 0): una sola riga IVA = l'IVA mostrata.
  const sola = positive.length === 1 ? positive[0] : (aliquote.length === 1 ? aliquote[0] : null);
  return { subTotShown, scontoShown, totShown, ivaToShow, righeIva: [{ aliquota: sola, valore: ivaToShow }] };
}
