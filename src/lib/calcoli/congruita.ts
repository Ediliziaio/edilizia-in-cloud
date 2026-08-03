/**
 * Congruità della manodopera — DM 143/2021.
 *
 * Le percentuali sono gli "Indici di congruità definiti con l'Accordo
 * collettivo del 10 settembre 2020", allegati al Decreto del Ministro del
 * lavoro e delle politiche sociali n. 143 del 25 giugno 2021.
 *
 * FONTE (verificata riga per riga sul PDF ufficiale, non a memoria):
 *   https://www.lavoro.gov.it/priorita/Documents/Tabella-Indici-Congruita-2021.pdf
 *
 * ATTENZIONE — questa tabella è quella ORIGINARIA del decreto e copre le
 * categorie di opere generali. Accordi successivi delle parti sociali
 * (giugno 2022, 2024) e il DM 60/2024 hanno integrato l'elenco con le
 * categorie specialistiche OS e ulteriori voci. Per un cantiere che ricade
 * in una categoria OS la fonte da consultare è la "Tabella A" consolidata
 * pubblicata dalla propria Cassa Edile: è quella su cui CNCE_EdilConnect
 * fa materialmente il conteggio.
 *
 * Per questo il calcolatore NON afferma mai "il tuo cantiere è congruo":
 * dice cosa risulta applicando l'indice scelto, e rimanda alla verifica
 * ufficiale. È una stima, e va presentata come tale.
 */

export interface CategoriaCongruita {
  /** Chiave stabile usata nel <select> e nella query string. */
  id: string;
  /** Descrizione esattamente come stampata nella tabella ministeriale. */
  label: string;
  /** Percentuale di incidenza minima, come numero (14.28 = 14,28%). */
  incidenza: number;
}

export const CATEGORIE_CONGRUITA: readonly CategoriaCongruita[] = [
  { id: "og1-nuova-civile", label: "OG1 — Nuova edilizia civile, compresi impianti e forniture", incidenza: 14.28 },
  { id: "og1-nuova-industriale", label: "OG1 — Nuova edilizia industriale, esclusi impianti", incidenza: 5.36 },
  { id: "ristrutturazione-civile", label: "Ristrutturazione di edifici civili", incidenza: 22.0 },
  { id: "ristrutturazione-industriale", label: "Ristrutturazione di edifici industriali, esclusi impianti", incidenza: 6.69 },
  { id: "og2-restauro", label: "OG2 — Restauro e manutenzione di beni tutelati", incidenza: 30.0 },
  { id: "og3-stradali", label: "OG3 — Opere stradali, ponti, ecc.", incidenza: 13.77 },
  { id: "og4-sottosuolo", label: "OG4 — Opere d'arte nel sottosuolo", incidenza: 10.82 },
  { id: "og5-dighe", label: "OG5 — Dighe", incidenza: 16.07 },
  { id: "og6-acquedotti", label: "OG6 — Acquedotti e fognature", incidenza: 14.63 },
  { id: "og6-gasdotti", label: "OG6 — Gasdotti", incidenza: 13.66 },
  { id: "og6-oleodotti", label: "OG6 — Oleodotti", incidenza: 13.66 },
  { id: "og6-irrigazione", label: "OG6 — Opere di irrigazione ed evacuazione", incidenza: 12.48 },
  { id: "og7-marittime", label: "OG7 — Opere marittime", incidenza: 12.16 },
  { id: "og8-fluviali", label: "OG8 — Opere fluviali", incidenza: 13.31 },
  { id: "og9-energia", label: "OG9 — Impianti per la produzione di energia elettrica", incidenza: 14.23 },
  { id: "og10-trasformazione", label: "OG10 — Impianti per la trasformazione e distribuzione", incidenza: 5.36 },
  { id: "og12-og13-bonifica", label: "OG12 — OG13 — Bonifica e protezione ambientale", incidenza: 16.47 },
] as const;

/** Soglia di valore dell'opera oltre la quale i lavori PRIVATI rientrano nella verifica. */
export const SOGLIA_PRIVATI_EUR = 70_000;

export interface CongruitaInput {
  /** Valore complessivo dell'opera, aggiornato alle varianti. */
  valoreOpera: number;
  /** Manodopera denunciata in Cassa Edile: affidataria + subappaltatori edili. */
  manodoperaDenunciata: number;
  /** id di una CATEGORIE_CONGRUITA. */
  categoriaId: string;
  /** true = lavori pubblici (rientrano sempre); false = privati (soglia 70.000 €). */
  pubblico: boolean;
}

export interface CongruitaResult {
  /** Percentuale di incidenza calcolata (0 se il valore dell'opera è 0). */
  incidenzaCalcolata: number;
  /** Percentuale minima richiesta dalla categoria. */
  incidenzaRichiesta: number;
  /** Importo di manodopera atteso per raggiungere la soglia. */
  manodoperaAttesa: number;
  /** Differenza fra attesa e denunciata: >0 = manca manodopera. */
  scostamento: number;
  /** true se l'incidenza calcolata raggiunge o supera la soglia. */
  congruo: boolean;
  /**
   * true se la verifica si applica al cantiere: sempre nei pubblici,
   * nei privati solo da 70.000 € in su.
   */
  soggettoAVerifica: boolean;
  categoria: CategoriaCongruita | undefined;
}

export function getCategoria(id: string): CategoriaCongruita | undefined {
  return CATEGORIE_CONGRUITA.find((c) => c.id === id);
}

/**
 * Arrotonda a `decimali` cifre evitando la deriva binaria di toFixed su
 * valori come 1.005. Restituisce un number, non una stringa.
 */
function round(value: number, decimali = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimali;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function calcolaCongruita(input: CongruitaInput): CongruitaResult {
  const categoria = getCategoria(input.categoriaId);
  const incidenzaRichiesta = categoria?.incidenza ?? 0;

  // Negativi e NaN vengono normalizzati a 0: un input sporco non deve
  // produrre un esito "congruo" per accidente aritmetico.
  const valoreOpera = Number.isFinite(input.valoreOpera) ? Math.max(0, input.valoreOpera) : 0;
  const manodopera = Number.isFinite(input.manodoperaDenunciata)
    ? Math.max(0, input.manodoperaDenunciata)
    : 0;

  const manodoperaAttesa = round((valoreOpera * incidenzaRichiesta) / 100);
  const incidenzaCalcolata = valoreOpera > 0 ? round((manodopera / valoreOpera) * 100) : 0;
  const scostamento = round(manodoperaAttesa - manodopera);

  // Confronto sugli IMPORTI, non sulle percentuali arrotondate: un cantiere
  // al 21,996% non deve risultare congruo solo perché la percentuale
  // mostrata a video è 22,00.
  const congruo = valoreOpera > 0 && manodopera >= manodoperaAttesa;

  const soggettoAVerifica = input.pubblico || valoreOpera >= SOGLIA_PRIVATI_EUR;

  return {
    incidenzaCalcolata,
    incidenzaRichiesta,
    manodoperaAttesa,
    scostamento,
    congruo,
    soggettoAVerifica,
    categoria,
  };
}
