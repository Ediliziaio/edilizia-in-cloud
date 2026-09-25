/**
 * Le regole del Conto Termico 3.0 che il preventivo racconta al cliente.
 *
 * Verificate il 25/09/2026 sulle regole applicative del GSE (webinar del
 * 3 febbraio 2026, «Conto Termico 3.0: le regole applicative») e sul D.M.
 * 7 agosto 2025. Se il GSE le cambia, si cambiano qui: il PDF e il
 * preventivatore le leggono da questo file, non le riscrivono.
 *
 * L'importo del contributo non si calcola qui: il GSE lo ricava da potenza,
 * efficienza stagionale (SCOP) e zona climatica. Nel preventivo lo scrive chi
 * vende, preso dal simulatore o dal portale del GSE.
 */

export const CONTO_TERMICO = {
  /** Il decreto e la data da cui vale. */
  decreto: "D.M. 7 agosto 2025",
  inVigoreDal: "25 dicembre 2025",
  /** Tetto dell'incentivo sulle spese ammissibili (Titolo III). */
  percentualeMassima: 65,
  /** Fino a questa cifra il GSE paga in un'unica soluzione. */
  sogliaUnicaRata: 15000,
  /** Oltre la soglia: 2 annualità fino a 35 kW, 5 annualità oltre. */
  potenzaPerDueAnnualita: 35,
  /** La domanda (accesso diretto) va presentata entro questi giorni dalla fine lavori. */
  giorniPerLaDomanda: 90,
  /** L'impianto va mantenuto per la durata dell'incentivo e per questi anni dopo l'ultima rata. */
  anniDiMantenimento: 5,
} as const;

/** Gli interventi che un privato può fare in casa col Conto Termico (Titolo III). */
export const INTERVENTI_CONTO_TERMICO = {
  pompa_calore: "Pompa di calore",
  ibrido: "Sistema ibrido a pompa di calore",
  scaldacqua_pdc: "Scaldacqua a pompa di calore",
  solare_termico: "Solare termico",
  biomassa: "Generatore a biomassa",
} as const;

export type InterventoContoTermico = keyof typeof INTERVENTI_CONTO_TERMICO;

export type ModalitaContributo = "sconto_in_fattura" | "rimborso";

/**
 * In quante rate arriva il contributo: una sola fino a 15.000 €, altrimenti 2
 * annualità per i generatori fino a 35 kW e 5 oltre. Senza potenza nota,
 * sopra soglia, si considerano 2 annualità (il caso della casa).
 */
export function numeroRate(contributo: number, potenzaKw: number | null | undefined): number {
  if (!(contributo > 0)) return 0;
  if (contributo <= CONTO_TERMICO.sogliaUnicaRata) return 1;
  if (potenzaKw != null && potenzaKw > CONTO_TERMICO.potenzaPerDueAnnualita) return 5;
  return 2;
}
