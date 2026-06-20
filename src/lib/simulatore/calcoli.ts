import type { VoceSim, FaseSim, ScenariConfig, RiepilogoIvaRiga, ProvvigioneSim } from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = round2(v.quantita * v.costo_unitario);
  const imponibile_ricavo = round2(v.quantita * v.prezzo_unitario);
  return { imponibile_costo, imponibile_ricavo, margine: round2(imponibile_ricavo - imponibile_costo) };
}

export function calcolaTotali(voci: VoceSim[]) {
  let costo_totale = 0, ricavo_imponibile = 0;
  for (const v of voci) {
    const r = calcolaVoce(v);
    costo_totale += r.imponibile_costo;
    ricavo_imponibile += r.imponibile_ricavo;
  }
  costo_totale = round2(costo_totale);
  ricavo_imponibile = round2(ricavo_imponibile);
  const margine_valore = round2(ricavo_imponibile - costo_totale);
  const margine_pct = ricavo_imponibile > 0 ? round2((margine_valore / ricavo_imponibile) * 100) : 0;
  return { costo_totale, ricavo_imponibile, margine_valore, margine_pct };
}

/**
 * calcolaIva — riepilogo IVA dell'imponibile ricavo, per aliquota.
 *
 * - `iva_mode === "singola"`: tutto l'imponibile ricavo a `iva_rate_singola`,
 *   un'unica riga di riepilogo.
 * - `iva_mode === "mista"`: accumula per `vat_rate` di riga. Per le voci con
 *   `bene_significativo`, applica la regola dei beni significativi: con
 *   `B = imponibile_ricavo` e `posa = valore_posa_associata ?? 0`, si aggiunge
 *   `posa + min(B, posa)` all'aliquota agevolata 10% e `max(0, B − posa)` al 22%
 *   (invece di tutto B alla sua `vat_rate`).
 *
 * `fattoreSconto` (default 1): scala proporzionalmente ogni imponibile prima del
 * calcolo dell'imposta, così l'IVA e il prezzo cliente si applicano al ricavo
 * NETTO (scontato) anziché al lordo, mantenendo coerente il riparto fra aliquote
 * anche in IVA mista. Con fattore 1 il comportamento è invariato.
 *
 * Per ogni riga di riepilogo `imposta = round2(imponibile × aliquota / 100)`,
 * ordinata per aliquota crescente; `iva_totale = round2(somma imposte)`.
 */
export function calcolaIva(
  voci: VoceSim[],
  scenari: ScenariConfig,
  fattoreSconto = 1,
): { riepilogo_iva: RiepilogoIvaRiga[]; iva_totale: number } {
  // Imponibile ricavo accumulato per aliquota.
  const perAliquota = new Map<number, number>();
  const add = (aliquota: number, imponibile: number) => {
    if (imponibile === 0) return;
    perAliquota.set(aliquota, round2((perAliquota.get(aliquota) ?? 0) + imponibile));
  };

  if (scenari.iva_mode === "singola") {
    const { ricavo_imponibile } = calcolaTotali(voci);
    perAliquota.set(scenari.iva_rate_singola, ricavo_imponibile);
  } else {
    for (const v of voci) {
      const { imponibile_ricavo: B } = calcolaVoce(v);
      if (v.bene_significativo) {
        const posa = v.valore_posa_associata ?? 0;
        add(10, round2(posa + Math.min(B, posa)));
        add(22, round2(Math.max(0, B - posa)));
      } else {
        add(v.vat_rate, B);
      }
    }
  }

  const riepilogo_iva: RiepilogoIvaRiga[] = [...perAliquota.entries()]
    .map(([aliquota, imponibile]) => {
      const scontato = round2(imponibile * fattoreSconto);
      return {
        aliquota,
        imponibile: scontato,
        imposta: round2((scontato * aliquota) / 100),
      };
    })
    .sort((a, b) => a.aliquota - b.aliquota);

  const iva_totale = round2(riepilogo_iva.reduce((acc, r) => acc + r.imposta, 0));
  return { riepilogo_iva, iva_totale };
}

export interface EconomiaInput {
  /** Somma costi voci. */
  costo_diretto: number;
  /** Somma prezzi voci (imponibile prima dello sconto). */
  ricavo_lordo: number;
  spese_generali_pct: number;
  utile_pct: number;
  sconto_pct: number;
}

export interface EconomiaRisultato {
  spese_generali: number;
  costo_pieno: number;
  sconto_valore: number;
  ricavo_netto: number;
  margine_netto_valore: number;
  margine_netto_pct: number;
  utile_target: number;
}

/**
 * calcolaEconomia — modello economico "spese generali / utile / sconto".
 *
 * - `spese_generali` = costo_diretto × spese_generali_pct/100.
 * - `costo_pieno` = costo_diretto + spese_generali.
 * - `sconto_valore` = ricavo_lordo × sconto_pct/100.
 * - `ricavo_netto` = ricavo_lordo − sconto_valore (imponibile effettivo).
 * - `margine_netto_valore` = ricavo_netto − costo_pieno; `margine_netto_pct` su
 *   ricavo_netto (0 se ricavo_netto ≤ 0, niente NaN).
 * - `utile_target` = costo_pieno × utile_pct/100 (utile d'impresa atteso).
 *
 * Funzione pura: nessuna dipendenza da IVA o voci, solo aritmetica arrotondata.
 */
export function calcolaEconomia(input: EconomiaInput): EconomiaRisultato {
  const spese_generali = round2((input.costo_diretto * input.spese_generali_pct) / 100);
  const costo_pieno = round2(input.costo_diretto + spese_generali);
  const sconto_valore = round2((input.ricavo_lordo * input.sconto_pct) / 100);
  const ricavo_netto = round2(input.ricavo_lordo - sconto_valore);
  const margine_netto_valore = round2(ricavo_netto - costo_pieno);
  const margine_netto_pct =
    ricavo_netto > 0 ? round2((margine_netto_valore / ricavo_netto) * 100) : 0;
  const utile_target = round2((costo_pieno * input.utile_pct) / 100);
  return {
    spese_generali,
    costo_pieno,
    sconto_valore,
    ricavo_netto,
    margine_netto_valore,
    margine_netto_pct,
    utile_target,
  };
}

/**
 * calcolaPrezzoObiettivo — helper INVERSO: dato un prezzo netto desiderato,
 * calcola lo sconto% necessario sul lordo e il margine risultante.
 *
 * - `sconto_pct_necessario` = ricavo_lordo>0 ? (ricavo_lordo − P)/ricavo_lordo×100 : 0.
 * - `margine_valore` = P − costo_pieno.
 * - `margine_pct` = P>0 ? margine_valore/P×100 : 0.
 */
export function calcolaPrezzoObiettivo(
  costo_pieno: number,
  ricavo_lordo: number,
  prezzoObiettivoNetto: number,
): { margine_valore: number; margine_pct: number; sconto_pct_necessario: number } {
  const sconto_pct_necessario =
    ricavo_lordo > 0
      ? round2(((ricavo_lordo - prezzoObiettivoNetto) / ricavo_lordo) * 100)
      : 0;
  const margine_valore = round2(prezzoObiettivoNetto - costo_pieno);
  const margine_pct =
    prezzoObiettivoNetto > 0 ? round2((margine_valore / prezzoObiettivoNetto) * 100) : 0;
  return { margine_valore, margine_pct, sconto_pct_necessario };
}

/**
 * calcolaProvvigione — valore € di UNA provvigione, applicata DOPO sconto e
 * spese generali (è un costo interno che erode il margine, non il prezzo cliente).
 *
 * - `base === 'ricavo'`  → valore/100 × ricavo_netto.
 * - `base === 'margine'` → valore/100 × max(0, marginePre) (mai su perdita).
 * - `base === 'fisso'`   → valore (€).
 *
 * `marginePre` è il margine PRE-provvigioni (ricavo_netto − costo_pieno): usare
 * il pre evita la circolarità (la provvigione dipenderebbe da sé stessa).
 * Risultato arrotondato a 2 decimali.
 */
export function calcolaProvvigione(
  p: ProvvigioneSim,
  ricavo_netto: number,
  marginePre: number,
): number {
  switch (p.base) {
    case "ricavo":
      return round2((p.valore / 100) * ricavo_netto);
    case "margine":
      return round2((p.valore / 100) * Math.max(0, marginePre));
    case "fisso":
      return round2(p.valore);
    default:
      return 0;
  }
}

/**
 * calcolaProvvigioni — somma € di tutte le provvigioni (ognuna arrotondata via
 * `calcolaProvvigione`); totale a sua volta arrotondato. Lista vuota → 0.
 */
export function calcolaProvvigioni(
  provvigioni: ProvvigioneSim[],
  ricavo_netto: number,
  marginePre: number,
): number {
  return round2(
    provvigioni.reduce((acc, p) => acc + calcolaProvvigione(p, ricavo_netto, marginePre), 0),
  );
}

export interface FaseCalcolata {
  fase_id: string;
  costo: number;
  manodopera_costo: number;
  inizio: number;
  durata: number;
}

/**
 * calcolaFasi — aggrega costi e tempistiche per fase del cronoprogramma.
 *
 * Per ogni fase: `costo` = somma `imponibile_costo` delle voci con
 * `fase_id === fase.id`; `manodopera_costo` = idem ma solo voci `is_manodopera`;
 * `inizio`/`durata` dai campi offset/durata della fase.
 *
 * `durata_settimane` totale = max(`inizio_offset_settimane + durata_settimane`)
 * su tutte le fasi (0 se nessuna fase).
 */
export function calcolaFasi(
  fasi: FaseSim[],
  voci: VoceSim[],
): { perFase: FaseCalcolata[]; durata_settimane: number } {
  const perFase: FaseCalcolata[] = fasi.map((fase) => {
    let costo = 0;
    let manodopera_costo = 0;
    for (const v of voci) {
      if (v.fase_id !== fase.id) continue;
      const { imponibile_costo } = calcolaVoce(v);
      costo += imponibile_costo;
      if (v.is_manodopera) manodopera_costo += imponibile_costo;
    }
    return {
      fase_id: fase.id,
      costo: round2(costo),
      manodopera_costo: round2(manodopera_costo),
      inizio: fase.inizio_offset_settimane,
      durata: fase.durata_settimane,
    };
  });

  const durata_settimane = fasi.reduce(
    (max, f) => Math.max(max, f.inizio_offset_settimane + f.durata_settimane),
    0,
  );

  return { perFase, durata_settimane };
}

export interface PuntoCassa {
  settimana: number;
  costo_cum: number;
  incasso_cum: number;
  netto: number;
}

export interface CassaRisultato {
  serie: PuntoCassa[];
  /** Esposizione massima = minimo del netto (più negativo); ≤ 0 quando c'è. */
  max_esposizione: number;
  /** Settimana in cui si verifica l'esposizione massima. */
  settimana_max_esposizione: number;
}

/**
 * calcolaCassa — flusso di cassa nel tempo (SAL) settimana per settimana.
 *
 * Durata totale `W` = max(`inizio_offset_settimane + durata_settimane`) sulle
 * fasi (0 se nessuna fase). La serie copre le settimane `0..W` incluse: la
 * settimana `w` (per `w ≥ 1`) rappresenta l'intervallo `(w−1, w]`.
 *
 * COSTI — il costo di ogni fase è distribuito linearmente sulle sue settimane
 * `[inizio, inizio+durata)` (cioè contribuisce alle settimane
 * `inizio+1 … inizio+durata`). Il costo della fase è la quota di `costoPieno`
 * proporzionale al costo della fase da `calcolaFasi`; se nessuna fase ha costo,
 * `costoPieno` è distribuito uniformemente su `W`. `costo_cum[w]` è la somma
 * cumulata fino alla settimana `w`.
 *
 * INCASSI — `acconto = prezzoCliente × acconto_pct/100` alla settimana 0;
 * `saldo = prezzoCliente × saldo_pct/100` alla settimana `W`; il "corpo"
 * (`prezzoCliente − acconto − saldo`) è incassato durante i lavori in
 * proporzione all'avanzamento dei costi: `(costo_cum[w]/costo_tot) × corpo`
 * (lineare su `w/W` se `costo_tot` è 0). `incasso_cum[w] = acconto +
 * incasso_durante[w] (+ saldo all'ultima settimana)`.
 *
 * `netto[w] = incasso_cum[w] − costo_cum[w]`; `max_esposizione` è il minimo dei
 * netti (più negativo) e `settimana_max_esposizione` la settimana relativa.
 * Tutti i valori sono arrotondati a 2 decimali.
 */
export function calcolaCassa(
  fasi: FaseSim[],
  voci: VoceSim[],
  costoPieno: number,
  prezzoCliente: number,
  sal: { acconto_pct: number; saldo_pct: number },
): CassaRisultato {
  const { perFase, durata_settimane: W } = calcolaFasi(fasi, voci);

  if (W <= 0) {
    return { serie: [], max_esposizione: 0, settimana_max_esposizione: 0 };
  }

  // ── Distribuzione costi per settimana ──────────────────────────────────────
  // Quota di `costoPieno` per fase ∝ costo voci della fase; se nessuna fase ha
  // costo, ripartizione uniforme di `costoPieno` su tutte le fasi (per durata).
  const costoFasiTot = round2(perFase.reduce((acc, f) => acc + f.costo, 0));
  const durataFasiTot = perFase.reduce((acc, f) => acc + f.durata, 0);

  // Incremento di costo per settimana (indice 1..W).
  const costoPerSettimana = new Array<number>(W + 1).fill(0);
  for (const f of perFase) {
    if (f.durata <= 0) continue;
    const quota =
      costoFasiTot > 0
        ? (f.costo / costoFasiTot) * costoPieno
        : durataFasiTot > 0
          ? (f.durata / durataFasiTot) * costoPieno
          : 0;
    const perWeek = quota / f.durata;
    const da = Math.max(0, Math.floor(f.inizio));
    for (let k = 0; k < f.durata; k++) {
      const w = da + k + 1; // la settimana [inizio, inizio+durata) alimenta inizio+1..inizio+durata
      if (w >= 1 && w <= W) costoPerSettimana[w] += perWeek;
    }
  }

  // Cumulata costi.
  const costoCum = new Array<number>(W + 1).fill(0);
  for (let w = 1; w <= W; w++) {
    costoCum[w] = costoCum[w - 1] + costoPerSettimana[w];
  }
  const costoTot = costoCum[W];

  // ── Incassi (acconto / corpo proporzionale ai costi / saldo) ───────────────
  const acconto = round2((prezzoCliente * sal.acconto_pct) / 100);
  const saldo = round2((prezzoCliente * sal.saldo_pct) / 100);
  const corpo = prezzoCliente - acconto - saldo;

  const serie: PuntoCassa[] = [];
  for (let w = 0; w <= W; w++) {
    const avanzamento = costoTot > 0 ? costoCum[w] / costoTot : w / W;
    let incasso = acconto + avanzamento * corpo;
    if (w === W) incasso += saldo;
    const costo_cum = round2(costoCum[w]);
    const incasso_cum = round2(incasso);
    serie.push({
      settimana: w,
      costo_cum,
      incasso_cum,
      netto: round2(incasso_cum - costo_cum),
    });
  }

  // ── Esposizione massima = minimo del netto ─────────────────────────────────
  let max_esposizione = serie[0].netto;
  let settimana_max_esposizione = serie[0].settimana;
  for (const p of serie) {
    if (p.netto < max_esposizione) {
      max_esposizione = p.netto;
      settimana_max_esposizione = p.settimana;
    }
  }

  return { serie, max_esposizione, settimana_max_esposizione };
}
