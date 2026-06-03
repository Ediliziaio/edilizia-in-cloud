/**
 * stringhe — dimensionamento base delle stringhe FV e verifica della finestra
 * di tensione dell'inverter (progettazione elettrica). Gap vs Reonic/Autarc:
 * loro fanno string planning con verifica live di tensione/temperatura; noi
 * non avevamo nulla. Qui un calcolo minimo ma corretto:
 *
 *  - n° MAX moduli/stringa = limite di sovratensione a FREDDO (Voc sale col gelo)
 *  - n° MIN moduli/stringa = mantenere il Vmp a CALDO sopra la soglia MPPT
 *  - scelta della lunghezza stringa che distribuisce meglio i moduli
 *  - capacità inverter (n° stringhe ≤ MPPT × stringhe/MPPT)
 *
 * Puro, con specifiche di default (in attesa di un catalogo prodotti reale).
 */

export interface SpecModulo {
  /** Tensione a circuito aperto Voc @STC (V). */
  voc: number;
  /** Tensione al punto di massima potenza Vmp @STC (V). */
  vmp: number;
  /** Coeff. temperatura Voc (%/°C, negativo, es. -0.25). */
  tempCoeffVocPctC: number;
  /** Coeff. temperatura Vmp (%/°C, negativo). Default = tempCoeffVocPctC. */
  tempCoeffVmpPctC?: number;
}

export interface SpecInverter {
  /** Tensione DC massima ammessa in ingresso (V). */
  vMaxDc: number;
  /** Soglia minima della finestra MPPT (V). */
  vMpptMin: number;
  /** Soglia massima utile MPPT (V). Default = vMaxDc × 0.9. */
  vMpptMax?: number;
  /** Numero di inseguitori MPPT. */
  nMppt: number;
  /** Stringhe collegabili per MPPT (default 2). */
  maxStringhePerMppt?: number;
}

export interface OpzioniTemperatura {
  /** Temperatura cella minima (°C, default -10). */
  tCellaFreddo?: number;
  /** Temperatura cella massima (°C, default 70). */
  tCellaCaldo?: number;
}

export interface RisultatoStringhe {
  moduli_min_stringa: number;
  moduli_max_stringa: number;
  moduli_per_stringa: number;
  numero_stringhe: number;
  moduli_collegati: number;
  moduli_non_assegnati: number;
  /** Voc della stringa a freddo (V) — deve restare ≤ vMaxDc. */
  voc_stringa_freddo_v: number;
  /** Vmp della stringa a caldo (V) — deve restare ≥ vMpptMin. */
  vmp_stringa_caldo_v: number;
  valido: boolean;
  warnings: string[];
}

/** Modulo standard ~540 Wp (valori tipici, in attesa del catalogo reale). */
export const MODULO_DEFAULT_540: SpecModulo = {
  voc: 49.5,
  vmp: 41.7,
  tempCoeffVocPctC: -0.25,
  tempCoeffVmpPctC: -0.29,
};

/** Inverter residenziale generico (stringa, 2 MPPT). */
export const INVERTER_DEFAULT: SpecInverter = {
  vMaxDc: 1000,
  vMpptMin: 160,
  vMpptMax: 850,
  nMppt: 2,
  maxStringhePerMppt: 2,
};

/** Tensione a una temperatura cella data, dato il coeff. %/°C (rispetto a 25°C STC). */
function tensioneATemp(vStc: number, coeffPctC: number, tCella: number): number {
  return vStc * (1 + (coeffPctC / 100) * (tCella - 25));
}

/** Sceglie la stringa più LUNGA in [min,max] che divide esattamente num; altrimenti il max fattibile. */
function scegliModuliPerStringa(num: number, min: number, max: number): number {
  if (max < min || num < min) return 0;
  const top = Math.min(max, num);
  for (let k = top; k >= min; k--) {
    if (num % k === 0) return k;
  }
  return top; // nessun divisore esatto: stringa più lunga possibile (resto gestito a parte)
}

export function dimensionaStringhe(
  numeroModuli: number,
  modulo: SpecModulo = MODULO_DEFAULT_540,
  inverter: SpecInverter = INVERTER_DEFAULT,
  opts: OpzioniTemperatura = {},
): RisultatoStringhe {
  const tFreddo = opts.tCellaFreddo ?? -10;
  const tCaldo = opts.tCellaCaldo ?? 70;
  const coeffVmp = modulo.tempCoeffVmpPctC ?? modulo.tempCoeffVocPctC;
  const vMpptMax = inverter.vMpptMax ?? inverter.vMaxDc * 0.9;
  const maxStringhePerMppt = inverter.maxStringhePerMppt ?? 2;

  const warnings: string[] = [];

  // Voc per modulo a freddo (sale) e Vmp per modulo a caldo (scende).
  const vocFreddoMod = tensioneATemp(modulo.voc, modulo.tempCoeffVocPctC, tFreddo);
  const vmpCaldoMod = tensioneATemp(modulo.vmp, coeffVmp, tCaldo);

  // Limiti di lunghezza stringa.
  const maxStringa = Math.floor(inverter.vMaxDc / vocFreddoMod);
  const minStringa = Math.max(1, Math.ceil(inverter.vMpptMin / vmpCaldoMod));

  if (minStringa > maxStringa) {
    warnings.push(
      `Finestra inverter incompatibile: servono ≥${minStringa} moduli/stringa per il MPPT ma max ${maxStringa} per la sovratensione a freddo.`,
    );
  }
  if (numeroModuli < minStringa) {
    warnings.push(`Troppo pochi moduli (${numeroModuli}) per una stringa valida (min ${minStringa}).`);
  }

  const moduliPerStringa = scegliModuliPerStringa(numeroModuli, minStringa, maxStringa);
  const numeroStringhe = moduliPerStringa > 0 ? Math.floor(numeroModuli / moduliPerStringa) : 0;
  const moduliCollegati = moduliPerStringa * numeroStringhe;
  const moduliNonAssegnati = numeroModuli - moduliCollegati;

  const vocStringaFreddo = vocFreddoMod * moduliPerStringa;
  const vmpStringaCaldo = vmpCaldoMod * moduliPerStringa;

  const maxStringheTotali = inverter.nMppt * maxStringhePerMppt;
  if (numeroStringhe > maxStringheTotali) {
    warnings.push(
      `Servono ${numeroStringhe} stringhe ma l'inverter ne supporta ${maxStringheTotali} (${inverter.nMppt} MPPT × ${maxStringhePerMppt}). Valuta un inverter più grande.`,
    );
  }
  if (moduliNonAssegnati > 0) {
    warnings.push(`${moduliNonAssegnati} moduli non assegnati: lunghezza stringa non divide il totale.`);
  }
  if (vocStringaFreddo > inverter.vMaxDc) {
    warnings.push(
      `Tensione stringa a freddo ${Math.round(vocStringaFreddo)} V oltre il limite inverter ${inverter.vMaxDc} V.`,
    );
  }
  if (moduliPerStringa > 0 && vmpStringaCaldo < inverter.vMpptMin) {
    warnings.push(
      `Tensione stringa a caldo ${Math.round(vmpStringaCaldo)} V sotto la soglia MPPT ${inverter.vMpptMin} V.`,
    );
  }

  const valido =
    moduliPerStringa > 0 &&
    minStringa <= maxStringa &&
    vocStringaFreddo <= inverter.vMaxDc &&
    vmpStringaCaldo >= inverter.vMpptMin &&
    numeroStringhe > 0 &&
    numeroStringhe <= maxStringheTotali &&
    numeroModuli >= minStringa;

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return {
    moduli_min_stringa: minStringa,
    moduli_max_stringa: maxStringa,
    moduli_per_stringa: moduliPerStringa,
    numero_stringhe: numeroStringhe,
    moduli_collegati: moduliCollegati,
    moduli_non_assegnati: moduliNonAssegnati,
    voc_stringa_freddo_v: r1(vocStringaFreddo),
    vmp_stringa_caldo_v: r1(vmpStringaCaldo),
    valido,
    warnings,
  };
}
