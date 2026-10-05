import type {
  VoceSim, FaseSim, ScenariConfig, RiepilogoIvaRiga, ProvvigioneSim, SimulazioneRisultato,
} from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const SCALA = 1_000_000n;
/** Un fattore come intero con sei decimali (non finito → 0). */
const scalato = (n: number): bigint => BigInt(Math.round((Number.isFinite(n) ? n : 0) * 1_000_000));

/**
 * prodottoArrotondato — prodotto dei fattori arrotondato al centesimo a metà
 * lontano da zero, in aritmetica intera: come ROUND(…, 2) di Postgres.
 *
 * 05/10/2026: col round2 in virgola mobile i mezzi centesimi dei prodotti
 * (297.359,55 × 0,9 = 267.623,595; 2,5 × 1,01 = 2,525) potevano andare dalla
 * parte sbagliata, e il preventivo ricalcolato dal database usciva con un
 * centesimo di differenza dalla simulazione. Fattori fino a sei decimali.
 */
export function prodottoArrotondato(...fattori: number[]): number {
  let num = 100n;
  let den = 1n;
  for (const f of fattori) {
    num *= scalato(f);
    den *= SCALA;
  }
  const negativo = num < 0n;
  const assoluto = negativo ? -num : num;
  const centesimi = (assoluto * 2n + den) / (2n * den);
  return Number(negativo ? -centesimi : centesimi) / 100;
}

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = prodottoArrotondato(v.quantita, v.costo_unitario);
  const imponibile_ricavo = prodottoArrotondato(v.quantita, v.prezzo_unitario);
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

/** Esito di {@link calcolaIncidenze}: incidenze % di costo e composizione. */
export interface IncidenzeRisultato {
  /** € manodopera (somma `imponibile_costo` delle voci `is_manodopera`). */
  manodopera_costo: number;
  /** € materiali = costo_diretto − manodopera_costo (mai negativo via round2). */
  materiali_costo: number;
  /** Manodopera in % sul costo diretto (guard /0 → 0). */
  manodopera_pct_costo: number;
  /** Materiali in % sul costo diretto (guard /0 → 0). */
  materiali_pct_costo: number;
  /** Incidenza manodopera sul prezzo = manodopera_costo / ricavo_netto × 100. */
  incidenza_manodopera_ricavo: number;
  /** Costo diretto in % sul ricavo netto (quota "dove va il ricavo"). */
  costo_diretto_pct: number;
  /** Spese generali in % sul ricavo netto. */
  spese_generali_pct: number;
  /** Provvigioni in % sul ricavo netto. */
  provvigioni_pct: number;
  /** Margine (finale) in % sul ricavo netto. */
  margine_pct: number;
}

/**
 * calcolaIncidenze — incidenze percentuali di costo e composizione del costo,
 * derivate da un {@link SimulazioneRisultato} già calcolato.
 *
 * - `manodopera_costo` = somma `calcolaVoce(v).imponibile_costo` per le voci
 *   `is_manodopera`; `materiali_costo` = `costo_diretto − manodopera_costo`
 *   (usa il `costo_diretto` del risultato, non la somma voci, così resta
 *   coerente anche se i costi sono aggregati altrove).
 * - `manodopera_pct_costo` / `materiali_pct_costo` = quota in % sul
 *   `costo_diretto` (guard /0 → 0).
 * - `incidenza_manodopera_ricavo` = `manodopera_costo / ricavo_netto × 100`.
 * - breakdown "dove va il ricavo": `costo_diretto`, `spese_generali`,
 *   `provvigioni_totale` e `margine_valore` (finale), ciascuno in % sul
 *   `ricavo_netto` (guard /0 → 0); le 4 quote sommano ~100.
 *
 * Funzione pura, tutti i valori `round2`.
 */
export function calcolaIncidenze(
  voci: VoceSim[],
  r: SimulazioneRisultato,
): IncidenzeRisultato {
  const manodopera_costo = round2(
    voci.reduce(
      (acc, v) => acc + (v.is_manodopera ? calcolaVoce(v).imponibile_costo : 0),
      0,
    ),
  );
  const materiali_costo = round2(r.costo_diretto - manodopera_costo);

  const pctCosto = (n: number) =>
    r.costo_diretto > 0 ? round2((n / r.costo_diretto) * 100) : 0;
  const pctRicavo = (n: number) =>
    r.ricavo_netto > 0 ? round2((n / r.ricavo_netto) * 100) : 0;

  return {
    manodopera_costo,
    materiali_costo,
    manodopera_pct_costo: pctCosto(manodopera_costo),
    materiali_pct_costo: pctCosto(materiali_costo),
    incidenza_manodopera_ricavo: pctRicavo(manodopera_costo),
    costo_diretto_pct: pctRicavo(r.costo_diretto),
    spese_generali_pct: pctRicavo(r.spese_generali),
    provvigioni_pct: pctRicavo(r.provvigioni_totale),
    margine_pct: pctRicavo(r.margine_valore),
  };
}

/** Una parte dell'imponibile di una voce, con la sua aliquota IVA. */
export interface QuotaIvaVoce {
  aliquota: number;
  imponibile: number;
}

/** Euro → centesimi interi (le quote si dividono senza perdere centesimi). */
const centesimi = (n: number): number => Math.round(n * 100);

/**
 * ripartoIvaVoci — l'imponibile di ogni voce diviso per aliquota IVA, nello
 * stesso ordine di `voci`. È l'unico conto dell'IVA della simulazione: lo usano
 * il riepilogo ({@link calcolaIva}) e le righe del preventivo e della commessa
 * (`trasforma.ts`), così il documento creato ha la stessa IVA della simulazione.
 * Le quote di una voce sommano sempre al suo totale (`calcolaVoce`).
 *
 * - `singola`: tutta la voce all'aliquota unica dello scenario.
 * - `mista`: ogni voce alla sua aliquota, tranne i beni significativi (art. 7
 *   c. 1 lett. b L. 488/1999, DM 29/12/1999). La posa scritta sulla riga
 *   (`valore_posa_associata`, già compresa nel totale della riga) è servizio al
 *   10%; il resto della riga è il bene. Il conto si fa sull'intero intervento,
 *   come `calcolaIvaMista` dei serramenti: con B = valore dei beni e S − B =
 *   il resto dell'intervento al 10% (la posa delle righe dei beni e le altre
 *   voci al 10%), i beni stanno al 10% fino a S − B e la parte che supera va
 *   al 22%. Le voci al 22% o al 4% restano fuori dal limite, come le prestazioni
 *   professionali dei serramenti.
 *
 * 05/10/2026: prima la posa finiva al 10% oltre al bene intero (10% su
 * posa + min(B, posa) e 22% su B − posa): su una riga da 1.000 € con 300 € di
 * posa si tassavano 1.300 € di imponibile.
 *
 * L'eccedenza al 22% si divide fra i beni in proporzione al loro valore, in
 * centesimi (metodo dei resti più grandi): la somma per aliquota torna esatta.
 */
export function ripartoIvaVoci(
  voci: VoceSim[],
  scenari: Pick<ScenariConfig, "iva_mode" | "iva_rate_singola">,
): QuotaIvaVoce[][] {
  const valori = voci.map((v) => calcolaVoce(v).imponibile_ricavo);
  if (scenari.iva_mode !== "mista") {
    return voci.map((_, i) => [{ aliquota: scenari.iva_rate_singola, imponibile: valori[i] }]);
  }

  // Posa compresa nella riga (mai oltre il totale della riga) e valore del bene.
  const posa = voci.map((v, i) =>
    v.bene_significativo
      ? round2(Math.min(Math.max(0, valori[i]), Math.max(0, Number(v.valore_posa_associata) || 0)))
      : 0,
  );
  const beniCent = voci.map((v, i) =>
    v.bene_significativo ? Math.max(0, centesimi(valori[i] - posa[i])) : 0,
  );
  const totBeniCent = beniCent.reduce((a, b) => a + b, 0);
  // Il limite: il resto dell'intervento al 10%.
  const limiteCent = voci.reduce(
    (acc, v, i) =>
      acc + (v.bene_significativo ? centesimi(posa[i]) : v.vat_rate === 10 ? centesimi(valori[i]) : 0),
    0,
  );
  const eccedenzaCent = Math.max(0, totBeniCent - Math.max(0, limiteCent));

  // Eccedenza al 22% divisa fra i beni: parte intera, poi i centesimi rimasti a
  // chi ha il resto più grande (a parità, la voce che viene prima).
  const quota22Cent = beniCent.map(() => 0);
  if (eccedenzaCent > 0 && totBeniCent > 0) {
    const resti: { i: number; resto: number }[] = [];
    let assegnati = 0;
    beniCent.forEach((b, i) => {
      if (b <= 0) return;
      const esatto = (b * eccedenzaCent) / totBeniCent;
      quota22Cent[i] = Math.floor(esatto);
      assegnati += quota22Cent[i];
      resti.push({ i, resto: esatto - quota22Cent[i] });
    });
    resti.sort((a, b) => b.resto - a.resto || a.i - b.i);
    for (let k = 0; k < eccedenzaCent - assegnati && k < resti.length; k++) {
      quota22Cent[resti[k].i] += 1;
    }
  }

  return voci.map((v, i) => {
    if (!v.bene_significativo) return [{ aliquota: v.vat_rate, imponibile: valori[i] }];
    const al22 = quota22Cent[i] / 100;
    return [
      { aliquota: 10, imponibile: round2(valori[i] - al22) },
      { aliquota: 22, imponibile: al22 },
    ];
  });
}

/**
 * calcolaIva — riepilogo IVA dell'imponibile ricavo, per aliquota.
 *
 * - `iva_mode === "singola"`: tutto l'imponibile ricavo a `iva_rate_singola`,
 *   un'unica riga di riepilogo.
 * - `iva_mode === "mista"`: somma per aliquota le quote di {@link ripartoIvaVoci}
 *   (aliquota di riga, beni significativi divisi fra 10% e 22%).
 *
 * `scontoPct` (default 0): lo sconto cliente in %, che porta ogni imponibile al
 * netto, così l'IVA e il prezzo cliente si applicano al ricavo NETTO. Per ogni
 * aliquota, con G = imponibile lordo e f = 1 − sconto/100:
 *   imponibile = G × f, imposta = G × aliquota/100 × f (al centesimo, esatti)
 * — lo stesso conto del database sui preventivi (do_recalculate_quote_totals),
 * così il preventivo creato dalla simulazione ha la stessa IVA al centesimo.
 * Righe ordinate per aliquota crescente; `iva_totale = round2(somma imposte)`.
 */
export function calcolaIva(
  voci: VoceSim[],
  scenari: ScenariConfig,
  scontoPct = 0,
): { riepilogo_iva: RiepilogoIvaRiga[]; iva_totale: number } {
  const fattore = 1 - (Number(scontoPct) || 0) / 100;
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
    for (const quote of ripartoIvaVoci(voci, scenari)) {
      for (const q of quote) add(q.aliquota, q.imponibile);
    }
  }

  const riepilogo_iva: RiepilogoIvaRiga[] = [...perAliquota.entries()]
    .map(([aliquota, imponibile]) => ({
      aliquota,
      imponibile: prodottoArrotondato(imponibile, fattore),
      imposta: prodottoArrotondato(imponibile, aliquota / 100, fattore),
    }))
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
 * - `ricavo_netto` = round2(ricavo_lordo × (1 − sconto_pct/100)) (imponibile
 *   effettivo); `sconto_valore` = ricavo_lordo − ricavo_netto.
 * - `margine_netto_valore` = ricavo_netto − costo_pieno; `margine_netto_pct` su
 *   ricavo_netto (0 se ricavo_netto ≤ 0, niente NaN).
 * - `utile_target` = costo_pieno × utile_pct/100 (utile d'impresa atteso).
 *
 * Netto prima e sconto per differenza (05/10/2026): è l'ordine del database sui
 * preventivi, e sui mezzi centesimi il preventivo creato dalla simulazione
 * usciva con un centesimo di differenza.
 *
 * Funzione pura: nessuna dipendenza da IVA o voci, solo aritmetica arrotondata.
 */
export function calcolaEconomia(input: EconomiaInput): EconomiaRisultato {
  const spese_generali = round2((input.costo_diretto * input.spese_generali_pct) / 100);
  const costo_pieno = round2(input.costo_diretto + spese_generali);
  const ricavo_netto = prodottoArrotondato(input.ricavo_lordo, 1 - input.sconto_pct / 100);
  const sconto_valore = round2(input.ricavo_lordo - ricavo_netto);
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

/** Parametri di {@link calcolaMargineObiettivo}. */
export interface MargineObiettivoParams {
  /** Costo pieno (costo diretto + spese generali). */
  costoPieno: number;
  /** Provvigioni configurate (erodono il margine). */
  provvigioni: ProvvigioneSim[];
  /** Aliquota IVA effettiva % (per derivare il prezzo cliente dal ricavo netto). */
  ivaEffettivaPct: number;
  /** Valore target del margine desiderato. */
  target: number;
  /** Tipo di target: `"pct"` = % sul ricavo, `"euro"` = € assoluti. */
  targetType: "pct" | "euro";
}

/** Esito di {@link calcolaMargineObiettivo}. */
export interface MargineObiettivoRisultato {
  /** Ricavo netto (imponibile) necessario per il margine target; null se impossibile. */
  ricavo_netto_necessario: number | null;
  /** Prezzo cliente (IVA inclusa) corrispondente; null se impossibile. */
  prezzo_cliente_necessario: number | null;
  /** true se il margine target è raggiungibile (R calcolabile e > 0). */
  fattibile: boolean;
}

/**
 * calcolaMargineObiettivo — helper INVERSO opposto a {@link calcolaPrezzoObiettivo}:
 * dato un margine desiderato (€ o % sul ricavo) calcola il ricavo netto a cui
 * vendere per ottenerlo, gestendo le provvigioni in forma chiusa.
 *
 * Con `C = costoPieno`, dalle provvigioni si derivano:
 * - `a` = somma `valore/100` delle provvigioni `base === 'ricavo'`;
 * - `b` = somma `valore/100` delle provvigioni `base === 'margine'`;
 * - `prov_fisso` = somma `valore` delle provvigioni `base === 'fisso'`.
 *
 * Il margine finale è `R − C − a·R − b·marginePre − prov_fisso`, dove
 * `marginePre = R − C`. Risolvendo per R:
 * - target `"euro"` (T): `denom = 1 − a − b`;
 *   `R = denom > 0 ? (T + C·(1−b) + prov_fisso)/denom : null`.
 * - target `"pct"` (m, % del ricavo): il margine finale = `m/100·R`, quindi
 *   `denom = 1 − a − b − m/100`; `R = denom > 0 ? (C·(1−b) + prov_fisso)/denom : null`.
 *
 * `ricavo_netto_necessario = round2(R)` (o null); il prezzo cliente applica
 * l'IVA effettiva: `round2(R·(1 + ivaEffettivaPct/100))`. `fattibile` è vero
 * solo se R è calcolabile e positivo. Funzione pura.
 */
export function calcolaMargineObiettivo(
  params: MargineObiettivoParams,
): MargineObiettivoRisultato {
  const { costoPieno: C, provvigioni, ivaEffettivaPct, target, targetType } = params;

  let a = 0;
  let b = 0;
  let prov_fisso = 0;
  for (const p of provvigioni) {
    if (p.base === "ricavo") a += p.valore / 100;
    else if (p.base === "margine") b += p.valore / 100;
    else if (p.base === "fisso") prov_fisso += p.valore;
  }

  let R: number | null;
  if (targetType === "euro") {
    const denom = 1 - a - b;
    R = denom > 0 ? (target + C * (1 - b) + prov_fisso) / denom : null;
  } else {
    const denom = 1 - a - b - target / 100;
    R = denom > 0 ? (C * (1 - b) + prov_fisso) / denom : null;
  }

  const ricavo_netto_necessario = R != null ? round2(R) : null;
  const prezzo_cliente_necessario =
    R != null ? round2(R * (1 + ivaEffettivaPct / 100)) : null;
  const fattibile = R != null && R > 0;

  return { ricavo_netto_necessario, prezzo_cliente_necessario, fattibile };
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
