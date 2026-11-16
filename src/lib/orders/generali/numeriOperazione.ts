/**
 * «La commessa in numeri»: previsionale sopra, reale sotto (16/11/2026).
 *
 * Com'è fatta la pagina di una commessa singola (OrderFinancialOverview): due righe allineate
 * per colonna, così si legge in verticale quanto si scosta la realtà dal piano.
 *
 *              Vendita            Costi              Margine        €/m² vendita   €/m² costo
 *   Previsto   ricavi previsti    budget del piano   differenza     vendita/m²     budget/m²
 *   Reale      venduto            speso              differenza     venduto/m²     speso/m²
 *
 * Qui non si inventa nessun numero: arrivano tutti da dove la pagina li prende già (il valore
 * della generale, il piano economico, le commesse figlie). Questo modulo li mette in fila e
 * calcola solo le due divisioni per i metri quadri.
 *
 * I METRI QUADRI, in ordine: la somma delle unità immobiliari (si aggiorna da sola quando si
 * aggiunge un'unità), poi la superficie dell'immobile comprato (compravendita), poi quella
 * scritta a mano nella scheda Dati. Senza superficie i €/m² restano vuoti: meglio niente che
 * un numero diviso per una superficie inventata.
 */

/** Da dove viene la superficie, per poterlo scrivere sotto al numero. */
export type FonteSuperficie = "unita" | "immobile" | "manuale";

export interface SuperficieOperazione {
  mq: number;
  fonte: FonteSuperficie;
  /** Quante unità hanno dato i metri quadri (solo con fonte «unita»). */
  unitaContate?: number;
  /** Unità senza metri quadri: la somma è parziale e va detto. */
  unitaSenzaMq?: number;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
};

const arrotonda = (n: number, cifre = 2) => Math.round(n * 10 ** cifre) / 10 ** cifre;

/**
 * La superficie dell'operazione. `unitaMq` sono i metri quadri delle unità (anche vuoti: servono
 * a dire che la somma è parziale), `immobileMq` la superficie dell'immobile comprato,
 * `mqVendibili` quella scritta a mano nella scheda Dati.
 */
export function superficieOperazione(o: {
  unitaMq?: ReadonlyArray<number | null | undefined>;
  immobileMq?: unknown;
  mqVendibili?: unknown;
}): SuperficieOperazione | null {
  const unita = o.unitaMq ?? [];
  const conMq = unita.map(numero).filter((x): x is number => x !== null);
  const manuale = numero(o.mqVendibili);
  const immobile = numero(o.immobileMq);
  const dalleUnita = (): SuperficieOperazione => ({
    mq: arrotonda(conMq.reduce((s, x) => s + x, 0)),
    fonte: "unita",
    unitaContate: conMq.length,
    unitaSenzaMq: unita.length - conMq.length,
  });

  // Tutte le unità hanno i metri quadri: è la somma giusta, vince su tutto.
  if (conMq.length > 0 && conMq.length === unita.length) return dalleUnita();
  // Con qualche unità ancora senza metri quadri la somma è parziale, e un €/m² calcolato su
  // una parte delle unità è semplicemente sbagliato: se c'è un totale scritto a mano, quello
  // è completo e viene prima (16/11/2026).
  if (manuale !== null) return { mq: manuale, fonte: "manuale" };
  if (conMq.length > 0) {
    // Nessun totale a mano: la somma parziale serve solo se copre la maggioranza delle unità.
    // Sotto la metà si preferisce nessun €/m² a un €/m² gonfiato.
    if (conMq.length * 2 >= unita.length) return dalleUnita();
    return immobile !== null ? { mq: immobile, fonte: "immobile" } : null;
  }
  if (immobile !== null) return { mq: immobile, fonte: "immobile" };
  return null;
}

export interface RigaOperazione {
  vendita: number | null;
  costi: number | null;
  margine: number | null;
  /** Margine in percentuale sulla vendita. */
  marginePct: number | null;
  venditaMq: number | null;
  costiMq: number | null;
}

export interface NumeriOperazione {
  previsionale: RigaOperazione;
  reale: RigaOperazione;
  superficie: SuperficieOperazione | null;
  /**
   * Costi reali meno previsti: positivo = si sta spendendo più del piano. Null finché non ci
   * sono tutti e due.
   */
  scartoCosti: number | null;
  /** Quota di budget già spesa, 0-100 (oltre il 100 se si è sforato). */
  spesoPct: number | null;
  /** Differenza fra il €/m² di costo reale e quello previsto. */
  scartoCostoMq: number | null;
}

function riga(vendita: number | null, costi: number | null, mq: number | null): RigaOperazione {
  const margine = vendita !== null && costi !== null ? arrotonda(vendita - costi) : null;
  return {
    vendita,
    costi,
    margine,
    marginePct: margine !== null && vendita !== null && vendita > 0 ? arrotonda((margine / vendita) * 100, 1) : null,
    venditaMq: vendita !== null && mq !== null && mq > 0 ? arrotonda(vendita / mq) : null,
    costiMq: costi !== null && mq !== null && mq > 0 ? arrotonda(costi / mq) : null,
  };
}

/**
 * Previsionale e reale affiancati.
 *
 * `venduto` è quello che è stato davvero venduto o fatturato: finché è zero (si sta costruendo)
 * il margine reale non si calcola — sarebbe tutto il costo in negativo, un rosso che non vuol
 * dire niente. Si continua a mostrare i costi, che quelli sono veri.
 */
export function numeriOperazione(o: {
  venditaPrevista: number | null;
  costiPrevisti: number | null;
  venduto: number | null;
  speso: number | null;
  superficie: SuperficieOperazione | null;
}): NumeriOperazione {
  const mq = o.superficie?.mq ?? null;
  const previsionale = riga(o.venditaPrevista, o.costiPrevisti, mq);
  // Niente venduto = si sta costruendo: il margine reale non esiste ancora.
  const vendutoVero = o.venduto !== null && o.venduto > 0 ? o.venduto : null;
  const reale = riga(vendutoVero, o.speso, mq);
  return {
    previsionale,
    reale,
    superficie: o.superficie,
    scartoCosti: o.speso !== null && o.costiPrevisti !== null ? arrotonda(o.speso - o.costiPrevisti) : null,
    spesoPct: o.speso !== null && o.costiPrevisti !== null && o.costiPrevisti > 0
      ? arrotonda((o.speso / o.costiPrevisti) * 100, 1)
      : null,
    scartoCostoMq: reale.costiMq !== null && previsionale.costiMq !== null
      ? arrotonda(reale.costiMq - previsionale.costiMq)
      : null,
  };
}

/** Come si scrive la provenienza della superficie sotto al numero. */
export function noteSuperficie(s: SuperficieOperazione | null): string | null {
  if (!s) return null;
  if (s.fonte === "unita") {
    const n = s.unitaContate ?? 0;
    const mancano = s.unitaSenzaMq ?? 0;
    return `${n} ${n === 1 ? "unità" : "unità"}${mancano > 0 ? `, ${mancano} senza metri quadri` : ""}`;
  }
  if (s.fonte === "immobile") return "superficie dell'immobile";
  return "scritta a mano nei dati";
}
