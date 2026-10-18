/**
 * Il saldo finale del piano rate: UNA regola per il modulo (nuova commessa,
 * modifica) e per la vista in sola lettura.
 *
 * Il tipo rata conosce solo deposit / balance / financing, quindi nei piani a
 * tre o più rate i SAL intermedi e il saldo arrivano entrambi come «balance».
 * Vale così:
 *   · il saldo finale è l'ULTIMA rata «balance» (posizione più alta);
 *   · le altre rate «balance» (i SAL intermedi) valgono il loro importo;
 *   · il saldo finale è il residuo: totale IVA inclusa meno tutte le altre
 *     rate (SAL intermedi compresi) e meno il costo della finanziaria.
 * Modulo puro.
 */

interface RataMinima {
  type: string;
  position?: number | null;
  amount: number | string | null | undefined;
}

/** Indice (nell'array) della rata che fa da saldo finale, -1 se il piano non ha saldo. */
export function indiceSaldoFinale(rate: ReadonlyArray<RataMinima>): number {
  return rate.reduce<number>((ultimo, r, i) => {
    if (r.type !== "balance") return ultimo;
    if (ultimo < 0) return i;
    const posQui = r.position ?? i;
    const posUltimo = rate[ultimo].position ?? ultimo;
    return posQui >= posUltimo ? i : ultimo;
  }, -1);
}

/** Somma di tutte le rate tranne il saldo finale (SAL intermedi compresi). */
export function sommaRateNonSaldo(rate: ReadonlyArray<RataMinima>): number {
  const finale = indiceSaldoFinale(rate);
  return rate.reduce((somma, r, i) => (i === finale ? somma : somma + (Number(r.amount) || 0)), 0);
}

/** Il residuo che spetta al saldo finale, mai sotto zero. */
export function importoSaldoFinale(
  rate: ReadonlyArray<RataMinima>,
  totaleLordo: number,
  costoFinanziaria = 0,
): number {
  // Al centesimo, come le rate e le fatture (211.764,71 × 1,10 dà 232.941,181): prima il totale,
  // poi la sottrazione.
  const lordo = Math.round((Number(totaleLordo) || 0) * 100) / 100;
  const residuo = lordo - sommaRateNonSaldo(rate) - (Number(costoFinanziaria) || 0);
  return Math.max(0, Math.round(residuo * 100) / 100);
}

/**
 * Il piano pronto da salvare: il saldo finale prende il residuo, tutte le altre
 * rate (SAL intermedi compresi) restano come sono. Con `rispetta` si lascia il
 * suo importo a un saldo finale che lo dichiara già (per esempio quello letto
 * dal contratto).
 */
export function conSaldoFinale<T extends RataMinima>(
  rate: ReadonlyArray<T>,
  saldo: number,
  rispetta?: (rata: T) => boolean,
): T[] {
  const finale = indiceSaldoFinale(rate);
  return rate.map((r, i) => (i === finale && !rispetta?.(r) ? { ...r, amount: saldo } : r));
}

/** I dati della commessa che servono a calcolare il saldo finale. */
export interface CommessaPerRate {
  total_amount: number | string | null;
  vat_rate: number | string | null;
  payment_type: string | null;
  financing_cost: number | string | null;
  /** Somma delle varianti approvate, IVA esclusa. */
  variazioni_approvate?: number | string | null;
  /**
   * Le varianti approvate una per una, con il giorno dell'approvazione. Quando ci sono, il saldo
   * già pagato conta solo quelle approvate fino al giorno del pagamento: una variante successiva
   * resta da incassare a parte.
   */
  varianti?: ReadonlyArray<{ importo: number | string | null; il: string | null }>;
}

export interface RataDaLeggere extends RataMinima {
  id: string;
  order_id: string;
  is_paid: boolean | null;
  expected_date: string | null;
  paid_date?: string | null;
  documento_fiscale_id?: string | null;
}

export interface RataDaIncassare {
  id: string;
  order_id: string;
  expected_date: string | null;
  /** Quanto resta da incassare sulla rata, IVA inclusa. */
  amount: number;
  /** Rata pagata dalla finanziaria: è un incasso, ma non un credito scaduto verso il cliente. */
  finanziamento: boolean;
}

/**
 * Le rate ancora da incassare con la regola della scheda commessa, la stessa
 * di `public.rate_da_incassare` nel database:
 *   · la rata del finanziamento è un incasso (la paga la finanziaria): c'è, segnata
 *     come `finanziamento`, così i crediti scaduti verso il cliente la lasciano fuori;
 *   · la parte del totale che nessuna rata copre (piano senza saldo, o variante
 *     approvata dopo il saldo pagato) è una riga in più, senza data («non pianificato»);
 *   · il saldo finale vale il residuo: contratto più varianti approvate, IVA
 *     inclusa, meno le altre rate, meno il costo della finanziaria quando il
 *     pagamento è a finanziamento;
 *   · da ogni rata si toglie quanto è già pagato sulla fattura collegata.
 * `rate` contiene tutte le rate delle commesse (anche quelle pagate, che
 * servono al calcolo del saldo); `pagatoFattura` è l'importo pagato per id
 * del documento fiscale.
 */
export function rateDaIncassare(
  rate: ReadonlyArray<RataDaLeggere>,
  commesse: ReadonlyMap<string, CommessaPerRate>,
  pagatoFattura: ReadonlyMap<string, number> = new Map(),
): RataDaIncassare[] {
  const perCommessa = new Map<string, RataDaLeggere[]>();
  for (const r of rate) {
    const elenco = perCommessa.get(r.order_id);
    if (elenco) elenco.push(r);
    else perCommessa.set(r.order_id, [r]);
  }
  const risultato: RataDaIncassare[] = [];
  for (const [orderId, rateCommessa] of perCommessa) {
    const commessa = commesse.get(orderId);
    if (!commessa) continue;
    const finale = indiceSaldoFinale(rateCommessa);
    const iva = commessa.vat_rate == null || !Number.isFinite(Number(commessa.vat_rate)) ? 22 : Number(commessa.vat_rate);
    const centesimi = (n: number) => Math.round(n * 100) / 100;
    const contratto = Number(commessa.total_amount) || 0;
    const varianti = commessa.varianti;
    const sommaVarianti = (fino?: string | null) => varianti
      ? varianti.reduce((s, v) => (fino && (v.il ?? "") > fino ? s : s + (Number(v.importo) || 0)), 0)
      : Number(commessa.variazioni_approvate) || 0;
    const costoFinanziaria = commessa.payment_type === "financing" ? Number(commessa.financing_cost) || 0 : 0;
    const totale = centesimi((contratto + sommaVarianti()) * (1 + iva / 100)) - costoFinanziaria;
    // Il saldo già pagato conta con le varianti approvate fino al giorno del pagamento.
    const saldo = finale < 0 ? null : rateCommessa[finale];
    const finoA = saldo?.is_paid && saldo.paid_date && varianti ? saldo.paid_date : null;
    const saldoGrezzo = finale < 0 ? 0
      : centesimi(centesimi((contratto + sommaVarianti(finoA)) * (1 + iva / 100)) - sommaRateNonSaldo(rateCommessa) - costoFinanziaria);
    // Il costo della finanziaria che il saldo non riesce ad assorbire si toglie dalla rata della
    // finanziaria, mai più del costo stesso (come rate_importi nel database).
    const avanzo = Math.min(Math.max(0, -saldoGrezzo), costoFinanziaria);
    const importi = rateCommessa.map((r, i) => i === finale
      ? Math.max(0, saldoGrezzo)
      : r.type === "financing"
        ? Math.max(0, centesimi((Number(r.amount) || 0) - avanzo))
        : centesimi(Number(r.amount) || 0));
    const scoperto = centesimi(totale - importi.reduce((s, n) => s + n, 0));
    if (scoperto > 0) risultato.push({ id: `${orderId}:non-pianificato`, order_id: orderId, expected_date: null, amount: scoperto, finanziamento: false });
    rateCommessa.forEach((r, i) => {
      if (r.is_paid) return;
      const pagato = r.documento_fiscale_id ? pagatoFattura.get(r.documento_fiscale_id) ?? 0 : 0;
      risultato.push({
        id: r.id,
        order_id: orderId,
        expected_date: r.expected_date,
        amount: Math.max(0, centesimi(importi[i] - (Number(pagato) || 0))),
        finanziamento: r.type === "financing",
      });
    });
  }
  return risultato;
}
