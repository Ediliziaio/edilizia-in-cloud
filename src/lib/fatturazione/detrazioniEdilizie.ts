/**
 * Clausole detrazioni fiscali edilizie — TEMPLATE editabili da inserire in
 * fattura (campo Causale FatturaPA + note). Sono testi indicativi da verificare
 * con il proprio commercialista: l'agevolazione applicabile, le aliquote e i
 * requisiti cambiano nel tempo e per tipo di intervento/beneficiario.
 *
 * Riferimenti normativi citati a scopo descrittivo, non come consulenza fiscale.
 */

export interface DetrazionePreset {
  id: string;
  label: string;
  /** Aliquota indicativa, solo descrittiva. */
  aliquota: string;
  /** Clausola di default (editabile dall'utente). */
  clausola: string;
  /** Per questi è prassi evidenziare il costo della manodopera. */
  manodoperaConsigliata?: boolean;
  /**
   * Aliquota di detrazione NUMERICA (non l'IVA), usata dalla ripartizione bonus
   * della commessa per stimare quanto recupera il cliente. Dove la forbice è
   * ampia (es. Ecobonus 50–65%) si usa il valore più prudente.
   */
  aliquotaNum?: number;
  /** Tetto di spesa detraibile per unità immobiliare, in € (indicativo). */
  tettoSpesa?: number;
  /** L'agevolazione richiede il bonifico "parlante" (→ ritenuta 11% in banca). */
  richiedeBonificoParlante?: boolean;
  /** Riferimento normativo compatto, da mettere nella causale del bonifico. */
  norma?: string;
}

/** Nota standard sul "bonifico parlante", riusata da più preset. */
const BONIFICO =
  "Pagamento da effettuarsi con bonifico bancario/postale “parlante” (causale, codice fiscale del beneficiario e P.IVA dell'impresa) ai fini della detrazione.";

export const DETRAZIONI_EDILIZIE: DetrazionePreset[] = [
  {
    id: "ristrutturazione_50",
    aliquotaNum: 50,
    tettoSpesa: 96_000,
    richiedeBonificoParlante: true,
    norma: "art. 16-bis DPR 917/1986",
    label: "Ristrutturazione edilizia (Bonus Casa)",
    aliquota: "50%",
    clausola:
      "Interventi di recupero del patrimonio edilizio agevolabili ai sensi dell'art. 16-bis del DPR 917/1986 (TUIR) — detrazione IRPEF. " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "ecobonus",
    aliquotaNum: 50,
    tettoSpesa: 60_000,
    richiedeBonificoParlante: true,
    norma: "art. 14 D.L. 63/2013",
    label: "Ecobonus — riqualificazione energetica",
    aliquota: "50–65%",
    clausola:
      "Interventi di riqualificazione energetica agevolabili ai sensi dell'art. 14 del D.L. 63/2013 (Ecobonus). " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "sismabonus",
    aliquotaNum: 50,
    tettoSpesa: 96_000,
    richiedeBonificoParlante: true,
    norma: "art. 16 D.L. 63/2013",
    label: "Sismabonus — interventi antisismici",
    aliquota: "fino a 85%",
    clausola:
      "Interventi antisismici agevolabili ai sensi dell'art. 16 del D.L. 63/2013 (Sismabonus). " + BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "barriere_75",
    aliquotaNum: 75,
    tettoSpesa: 50_000,
    richiedeBonificoParlante: true,
    norma: "art. 119-ter D.L. 34/2020",
    label: "Eliminazione barriere architettoniche",
    aliquota: "75%",
    clausola:
      "Interventi per il superamento e l'eliminazione delle barriere architettoniche agevolabili ai sensi dell'art. 119-ter del D.L. 34/2020 (detrazione 75%). " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "sicurezza_50",
    label: "Misure antintrusione / sicurezza",
    aliquota: "50%",
    aliquotaNum: 50,
    tettoSpesa: 96_000,
    richiedeBonificoParlante: true,
    norma: "art. 16-bis c.1 lett. f) DPR 917/1986",
    clausola:
      "Interventi finalizzati alla prevenzione del compimento di atti illeciti da parte di terzi (porte blindate, inferriate, serrature e infissi di sicurezza) agevolabili ai sensi dell'art. 16-bis, comma 1, lett. f) del DPR 917/1986 (TUIR). " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "bonus_mobili",
    aliquotaNum: 50,
    tettoSpesa: 5_000,
    richiedeBonificoParlante: false,
    norma: "art. 16 c.2 D.L. 63/2013",
    label: "Bonus mobili ed elettrodomestici",
    aliquota: "50%",
    clausola:
      "Acquisto agevolabile ai sensi dell'art. 16, comma 2, del D.L. 63/2013 (Bonus mobili ed elettrodomestici), connesso a intervento di recupero del patrimonio edilizio.",
  },
  {
    id: "bonus_verde",
    aliquotaNum: 36,
    tettoSpesa: 5_000,
    richiedeBonificoParlante: false,
    norma: "L. 205/2017 commi 12-15",
    label: "Bonus verde — sistemazione a verde",
    aliquota: "36%",
    clausola:
      "Interventi di sistemazione a verde agevolabili ai sensi dell'art. 1, commi 12-15, della L. 205/2017 (Bonus verde).",
  },
];

export interface DetrazioneValue {
  active: boolean;
  presetId: string | null;
  clausola: string;
  manodoperaEvidenzia: boolean;
  /** Importo manodopera come stringa (input controllato). */
  manodoperaImporto: string;
}

export const EMPTY_DETRAZIONE: DetrazioneValue = {
  active: false,
  presetId: null,
  clausola: "",
  manodoperaEvidenzia: false,
  manodoperaImporto: "",
};
