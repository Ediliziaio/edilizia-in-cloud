/**
 * Calcoli puri per il PDF Fotovoltaico v2 (Reonic-killer).
 * Pure functions Deno-compatibili, riutilizzabili in tutte le edge function.
 *
 * Tutti i calcoli sono best-effort, basati su dati reali quando disponibili
 * (fv_calcolo_finanziario.cassa_anno_per_anno, scenario_*) e su euristiche
 * trasparenti quando i dati mancano (annotato con // ESTIMATE).
 */

// ─── ENERGY FLOWS ──────────────────────────────────────────────────────────

export interface FvFlowsInput {
  potenza_kwp: number;
  has_accumulo: boolean;
  capacita_accumulo_kwh: number;
  consumo_annuo_kwh: number;
  ore_sole_annue?: number | null;
  /** Performance Ratio: PR=0.85 default per impianti residenziali */
  performance_ratio?: number;
  /** Efficienza di sistema = 1 − perdite (temperatura+mismatch+sporcamento+inverter ≈ 0.11
   *  → 0.89). ore_sole_annue è LORDO (ore di picco): la produzione netta è kWp×ore×PR×eff,
   *  coerente con fv-calcolo-finanziario. */
  efficienza_sistema?: number;
  /** Profilo consumo: incide su autoconsumo */
  profilo_consumo?: "diurno" | "serale" | "misto" | "lavorativo" | string;
  /** Ombreggiamento da ostacoli VICINI (alberi/edifici adiacenti), frazione 0..1.
   *  Default 0 = nessuno. L'orizzonte lontano è già in ore_sole_annue (PVGIS H(i)_y). */
  perdita_ombreggiamento_pct?: number;
  /** La produzione del primo anno già calcolata da fv-calcolo-finanziario (fv_progetti.produzione_annua_kwh). */
  produzione_kwh?: number | null;
  /** La quota della produzione consumata in casa, dal profilo di consumo (quotaAutoconsumo):
   *  la stessa del calcolo finanziario. Senza, si stima dal profilo come prima. */
  autoconsumo_pct?: number | null;
}

/** Le quote di autoconsumo di un profilo (fv_profili_autoconsumo). */
export interface FvProfiloAutoconsumo {
  codice: string;
  autoconsumo_no_accumulo: number;
  autoconsumo_accumulo_5kwh: number;
  autoconsumo_accumulo_10kwh: number;
  autoconsumo_accumulo_15kwh: number;
}

/**
 * Quanta parte della produzione si consuma in casa, per profilo di consumo e
 * batteria: le fasce di fv-calcolo-finanziario (0, fino a 5, fino a 10, oltre).
 * La usano il calcolo e il PDF, così risparmio e flussi dicono gli stessi kWh:
 * prima il PDF stimava per conto suo e con una batteria i numeri non tornavano
 * (85% nel calcolo, 63% nella pagina dell'energia, col profilo «misto» e 10 kWh).
 */
export function quotaAutoconsumo(profilo: FvProfiloAutoconsumo | null | undefined, capacita_kwh: number | null | undefined): number | null {
  if (!profilo) return null;
  const cap = Number(capacita_kwh) || 0;
  const quota = cap <= 0 ? profilo.autoconsumo_no_accumulo
    : cap <= 5 ? profilo.autoconsumo_accumulo_5kwh
    : cap <= 10 ? profilo.autoconsumo_accumulo_10kwh
    : profilo.autoconsumo_accumulo_15kwh;
  const n = Number(quota);
  return Number.isFinite(n) && n >= 0 ? Math.min(1, n) : null;
}

export interface FvFlows {
  produzione_kwh: number;
  autoconsumo_kwh: number;
  ceduto_rete_kwh: number;
  prelievo_rete_kwh: number;
  autoconsumo_pct: number;
  autosufficienza_pct: number;
  consumo_da_rete_pct: number;
  consumo_da_fv_pct: number;
}

/**
 * Calcola i flussi energetici annuali.
 * Modello W1 semplificato:
 *   produzione = kWp × ore_sole(LORDO) × PR × efficienza_sistema
 *   autoconsumo% = base_profilo + bonus_accumulo
 *   ceduto_rete = produzione - autoconsumo_kwh
 *   prelievo_rete = consumo_annuo - autoconsumo_kwh (se autoconsumo < consumo)
 */
export function calcolaEnergyFlows(input: FvFlowsInput): FvFlows {
  const oreSole = input.ore_sole_annue ?? 1700; // ESTIMATE: ore di picco LORDE, media Italia
  const pr = input.performance_ratio ?? 0.85;
  const effSistema = input.efficienza_sistema ?? 0.89;
  // ore_sole_annue è LORDO: applico PR × efficienza di sistema (≈0.7565) come il motore
  // finanziario, altrimenti il PDF sovrastimerebbe la produzione di ~15%.
  // Ombreggiamento vicino (frazione 0..1, clamp [0,0.6]): default 0 = nessun impatto.
  const perdita_ombra = Math.min(0.6, Math.max(0, input.perdita_ombreggiamento_pct ?? 0));
  const produzione_kwh = input.produzione_kwh != null && Number(input.produzione_kwh) > 0
    ? Math.round(Number(input.produzione_kwh))
    : Math.round(input.potenza_kwp * oreSole * pr * effSistema * (1 - perdita_ombra));

  // Base autoconsumo per profilo (sengza accumulo)
  const baseProfilo: Record<string, number> = {
    diurno: 0.45,
    serale: 0.25,
    misto: 0.35,
    lavorativo: 0.20,
  };
  const baseAuto = baseProfilo[input.profilo_consumo ?? "misto"] ?? 0.35;

  // Bonus accumulo: +15% per 5kWh, +25% per 10kWh, +30% per 15kWh
  let bonusAccumulo = 0;
  if (input.has_accumulo && input.capacita_accumulo_kwh > 0) {
    if (input.capacita_accumulo_kwh >= 12) bonusAccumulo = 0.32;
    else if (input.capacita_accumulo_kwh >= 8) bonusAccumulo = 0.28;
    else if (input.capacita_accumulo_kwh >= 5) bonusAccumulo = 0.25;
    else if (input.capacita_accumulo_kwh >= 3) bonusAccumulo = 0.18;
    else bonusAccumulo = 0.10;
  }

  const autoconsumo_pct = input.autoconsumo_pct != null && input.autoconsumo_pct >= 0
    ? Math.min(1, input.autoconsumo_pct)
    : Math.min(0.92, baseAuto + bonusAccumulo);
  // autoconsumo_pct = frazione della PRODUZIONE consumata in loco.
  // Min con consumo_annuo: non si può auto-consumare più di quanto si consuma.
  const autoconsumo_kwh = Math.round(
    Math.min(produzione_kwh * autoconsumo_pct, input.consumo_annuo_kwh),
  );
  const ceduto_rete_kwh = Math.max(0, produzione_kwh - autoconsumo_kwh);
  const prelievo_rete_kwh = Math.max(0, input.consumo_annuo_kwh - autoconsumo_kwh);

  const autosufficienza_pct =
    input.consumo_annuo_kwh > 0
      ? Math.min(1, autoconsumo_kwh / input.consumo_annuo_kwh)
      : 0;
  const consumo_da_rete_pct =
    input.consumo_annuo_kwh > 0
      ? prelievo_rete_kwh / input.consumo_annuo_kwh
      : 0;
  const consumo_da_fv_pct = 1 - consumo_da_rete_pct;

  return {
    produzione_kwh,
    autoconsumo_kwh,
    ceduto_rete_kwh,
    prelievo_rete_kwh,
    autoconsumo_pct,
    autosufficienza_pct,
    consumo_da_rete_pct,
    consumo_da_fv_pct,
  };
}

// ─── PRODUCIBILITÀ MENSILE ─────────────────────────────────────────────────

/**
 * Distribuzione produzione mensile (kWh) basata su pattern PVGIS Italia.
 * Pesi per mese (gennaio=1, …, dicembre=12) — somma = 1.
 */
const PVGIS_DISTRIB_MENSILE = [
  0.045, 0.063, 0.085, 0.105, 0.115, 0.125, 0.130, 0.115, 0.090, 0.065, 0.040, 0.022,
];

export function calcolaProducibilitaMensile(produzione_annua_kwh: number): number[] {
  return PVGIS_DISTRIB_MENSILE.map((w) => Math.round(produzione_annua_kwh * w));
}

// ─── COSTI 20 ANNI (con/senza FV) ──────────────────────────────────────────

export interface FvCosti20Input {
  consumo_annuo_kwh: number;
  prelievo_rete_kwh: number; // dopo FV
  prezzo_kwh_attuale: number;
  inflazione_perc: number; // es. 3.0 = 3%/anno
  orizzonte_anni?: number; // default 20
  /** Ricavi RID/scambio sul posto (€/anno, primo anno) */
  ricavi_rid_anno_eur?: number;
  /** Degrado pannelli %/anno (default 0.5%) */
  degrado_pannelli_perc_anno?: number;
}

export interface FvCosti20Anno {
  anno: number;
  costo_senza_fv_eur: number;
  costo_con_fv_eur: number;
  risparmio_anno_eur: number;
}

export interface FvCosti20Output {
  per_anno: FvCosti20Anno[];
  totale_senza_fv_eur: number;
  totale_con_fv_eur: number;
  totale_risparmio_eur: number;
}

export function calcolaCosti20Anni(input: FvCosti20Input): FvCosti20Output {
  const N = input.orizzonte_anni ?? 20;
  const inflazione = input.inflazione_perc / 100;
  const degrado = (input.degrado_pannelli_perc_anno ?? 0.5) / 100;
  const per_anno: FvCosti20Anno[] = [];

  let totale_senza_fv = 0;
  let totale_con_fv = 0;
  for (let i = 1; i <= N; i++) {
    const fattoreInflazione = Math.pow(1 + inflazione, i - 1);
    const fattoreDegrado = Math.pow(1 - degrado, i - 1);
    const prezzoKwhAnno = input.prezzo_kwh_attuale * fattoreInflazione;

    // Senza FV: paga tutto il consumo a prezzo crescente
    const costoSenza = input.consumo_annuo_kwh * prezzoKwhAnno;
    // Con FV: paga solo il prelievo da rete (cresce nel tempo per degrado pannelli)
    const prelievoConDegrado =
      input.prelievo_rete_kwh +
      (input.consumo_annuo_kwh - input.prelievo_rete_kwh) * (1 - fattoreDegrado);
    const costoCon = Math.max(0, prelievoConDegrado * prezzoKwhAnno - (input.ricavi_rid_anno_eur ?? 0) * fattoreInflazione);

    totale_senza_fv += costoSenza;
    totale_con_fv += costoCon;
    per_anno.push({
      anno: i,
      costo_senza_fv_eur: Math.round(costoSenza),
      costo_con_fv_eur: Math.round(costoCon),
      risparmio_anno_eur: Math.round(costoSenza - costoCon),
    });
  }

  return {
    per_anno,
    totale_senza_fv_eur: Math.round(totale_senza_fv),
    totale_con_fv_eur: Math.round(totale_con_fv),
    totale_risparmio_eur: Math.round(totale_senza_fv - totale_con_fv),
  };
}

// ─── EQUIVALENZE CO2 ───────────────────────────────────────────────────────

export interface FvCO2Input {
  produzione_kwh_anno: number;
  /** Fattore emissione CO2 mix energetico Italia (default 0.4 kg/kWh) */
  fattore_emissione_kg_kwh?: number;
  /** Default ENEA: 25 kg CO2/anno per albero adulto */
  kg_per_albero_anno?: number;
  /** Volo medio europeo breve (1500 km): ~200 kg CO2 */
  kg_per_volo_breve?: number;
  /** Auto benzina: ~150 g CO2/km */
  g_per_km_auto?: number;
  /** Anni di vita impianto (default 25) */
  anni_vita?: number;
}

export interface FvCO2Output {
  kg_co2_anno: number;
  ton_co2_anno: number;
  kg_co2_totale: number;
  ton_co2_totale: number;
  alberi_anno: number;
  voli_anno: number;
  km_auto_anno: number;
}

export function calcolaCO2Equivalenze(input: FvCO2Input): FvCO2Output {
  const fattore = input.fattore_emissione_kg_kwh ?? 0.4;
  const kgAlbero = input.kg_per_albero_anno ?? 25;
  const kgVolo = input.kg_per_volo_breve ?? 200;
  const gKm = input.g_per_km_auto ?? 150;
  const anni = input.anni_vita ?? 25;

  const kg_co2_anno = Math.round(input.produzione_kwh_anno * fattore);
  const ton_co2_anno = +(kg_co2_anno / 1000).toFixed(2);
  const kg_co2_totale = kg_co2_anno * anni;
  const ton_co2_totale = +(kg_co2_totale / 1000).toFixed(1);

  return {
    kg_co2_anno,
    ton_co2_anno,
    kg_co2_totale,
    ton_co2_totale,
    alberi_anno: Math.round(kg_co2_anno / kgAlbero),
    voli_anno: Math.round(kg_co2_anno / kgVolo),
    km_auto_anno: Math.round((kg_co2_anno * 1000) / gKm),
  };
}

// ─── BOLLETTA "PRIMA E DOPO" ───────────────────────────────────────────────

export interface FvBollettaInput {
  consumo_annuo_kwh: number;
  prelievo_rete_kwh: number;
  /** Quanto paga oggi il cliente per ogni kWh, tutto compreso (fv_progetti.costo_kwh_attuale). */
  prezzo_kwh: number;
  /** Quello che il GSE paga per l'energia immessa in rete, primo anno (fv_calcolo_finanziario.ricavi_rid_eur). */
  ricavi_rid_eur?: number | null;
}

export interface FvBollettaRow {
  voce: string;
  oggi_eur: number;
  con_fv_eur: number;
  risparmio_eur: number;
  is_total?: boolean;
  is_kwh_row?: boolean;
}

/**
 * La bolletta dell'elettricità di un anno, oggi e col fotovoltaico, per voci.
 *
 * Il prezzo per kWh del cliente è «tutto compreso», e ogni voce si divide con la
 * composizione tipica di una bolletta domestica (materia energia 71%, oneri 18%,
 * trasporto 7%, imposte 4%). Col fotovoltaico ogni voce scende con i kWh presi
 * dalla rete: è lo stesso conto del calcolo finanziario (risparmio = kWh consumati
 * in casa × prezzo), così la tabella torna col risparmio scritto nel titolo della
 * pagina. Prima oneri e trasporto restavano fissi, una parte si contava due volte
 * e le righe non davano il totale (178 + 259 + 101 + 10 = 548, totale 564).
 *
 * L'energia immessa in rete non è in bolletta, ma è nel risparmio: con i ricavi
 * del GSE ci sono due righe in più, i ricavi e la spesa netta.
 */
export function calcolaBollettaPrimaDopo(input: FvBollettaInput): FvBollettaRow[] {
  const consumo = Math.max(0, input.consumo_annuo_kwh);
  const prelievo = Math.min(consumo, Math.max(0, input.prelievo_rete_kwh));
  const quota = consumo > 0 ? prelievo / consumo : 0;
  const totaleOggi = consumo * input.prezzo_kwh;
  const voci: Array<[string, number]> = [
    ["Spesa per la materia energia", 0.71],
    ["Oneri di sistema", 0.18],
    ["Trasporto e gestione del contatore", 0.07],
    ["Imposte (IVA e accise)", 0.04],
  ];
  // Totali arrotondati una volta sola, come il risparmio del calcolo (1.089,88 → 1.090);
  // le voci arrotondate una per una, e la differenza va sulla più grande: la tabella
  // somma giusto e torna col titolo della pagina (prima 1.386 contro 1.387).
  const oggi = Math.round(totaleOggi);
  const con = Math.round(totaleOggi * quota);
  const voceArrotondata = (totale: number, fattore: number) => {
    const valori = voci.map(([, peso]) => Math.round(totaleOggi * peso * fattore));
    valori[0] += totale - valori.reduce((acc, v) => acc + v, 0);
    return valori;
  };
  const oggiVoci = voceArrotondata(oggi, 1);
  const conVoci = voceArrotondata(con, quota);
  const righe: FvBollettaRow[] = voci.map(([voce], i) => ({
    voce, oggi_eur: oggiVoci[i], con_fv_eur: conVoci[i], risparmio_eur: conVoci[i] - oggiVoci[i],
  }));
  const rid = Math.max(0, Math.round(Number(input.ricavi_rid_eur) || 0));
  return [
    {
      voce: "Energia presa dalla rete",
      oggi_eur: Math.round(consumo),
      con_fv_eur: Math.round(prelievo),
      risparmio_eur: -Math.round((1 - quota) * 100),
      is_kwh_row: true,
    },
    ...righe,
    { voce: "Totale bolletta", oggi_eur: oggi, con_fv_eur: con, risparmio_eur: con - oggi, is_total: true },
    ...(rid > 0
      ? [
        { voce: "Energia venduta alla rete (GSE)", oggi_eur: 0, con_fv_eur: -rid, risparmio_eur: -rid },
        { voce: "Spesa netta per l'elettricità", oggi_eur: oggi, con_fv_eur: con - rid, risparmio_eur: con - rid - oggi, is_total: true },
      ]
      : []),
  ];
}

// ─── HELPERS FORMATTAZIONE ─────────────────────────────────────────────────

export function fmtEur(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  // «always»: il CLDR italiano toglie il punto sotto le cinque cifre, e nel
  // preventivo uscivano «9000 €» accanto a «18.000 €».
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: "always",
  } as unknown as Intl.NumberFormatOptions).format(n);
}

export function fmtNum(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: "always",
  } as unknown as Intl.NumberFormatOptions).format(n);
}

export function fmtPct(p: number, decimals = 0): string {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(decimals)}%`;
}

export function fmtData(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Escape HTML per evitare XSS in template literali */
export function escHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
