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
}

/** Nota standard sul "bonifico parlante", riusata da più preset. */
const BONIFICO =
  "Pagamento da effettuarsi con bonifico bancario/postale “parlante” (causale, codice fiscale del beneficiario e P.IVA dell'impresa) ai fini della detrazione.";

export const DETRAZIONI_EDILIZIE: DetrazionePreset[] = [
  {
    id: "ristrutturazione_50",
    label: "Ristrutturazione edilizia (Bonus Casa)",
    aliquota: "50%",
    clausola:
      "Interventi di recupero del patrimonio edilizio agevolabili ai sensi dell'art. 16-bis del DPR 917/1986 (TUIR) — detrazione IRPEF. " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "ecobonus",
    label: "Ecobonus — riqualificazione energetica",
    aliquota: "50–65%",
    clausola:
      "Interventi di riqualificazione energetica agevolabili ai sensi dell'art. 14 del D.L. 63/2013 (Ecobonus). " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "sismabonus",
    label: "Sismabonus — interventi antisismici",
    aliquota: "fino a 85%",
    clausola:
      "Interventi antisismici agevolabili ai sensi dell'art. 16 del D.L. 63/2013 (Sismabonus). " + BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "barriere_75",
    label: "Eliminazione barriere architettoniche",
    aliquota: "75%",
    clausola:
      "Interventi per il superamento e l'eliminazione delle barriere architettoniche agevolabili ai sensi dell'art. 119-ter del D.L. 34/2020 (detrazione 75%). " +
      BONIFICO,
    manodoperaConsigliata: true,
  },
  {
    id: "bonus_mobili",
    label: "Bonus mobili ed elettrodomestici",
    aliquota: "50%",
    clausola:
      "Acquisto agevolabile ai sensi dell'art. 16, comma 2, del D.L. 63/2013 (Bonus mobili ed elettrodomestici), connesso a intervento di recupero del patrimonio edilizio.",
  },
  {
    id: "bonus_verde",
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
