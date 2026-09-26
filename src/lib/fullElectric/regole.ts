/**
 * Casa Full Electric: la casa che lascia il gas e usa solo elettricità — pompa
 * di calore per riscaldamento e acqua calda, piano a induzione — prodotta in
 * parte dal fotovoltaico, con la batteria per la sera.
 *
 * Nessun dimensionamento automatico: produzione, consumi e prezzo li scrive chi
 * vende (dal suo software o da una simulazione). Qui solo i fattori dei conti e
 * l'andamento tipico dei mesi, dichiarati come stime nel documento. Se cambiano,
 * si cambiano qui: il PDF e il preventivatore li leggono da questo file.
 */

export const FULL_ELECTRIC = {
  /** kg di CO2 per Smc di gas naturale bruciato: fattore medio. */
  co2PerSmcGas: 1.96,
  /** kg di CO2 per kWh preso dalla rete: fattore medio dei consumi elettrici in Italia. */
  co2PerKwhRete: 0.26,
  /** kg di CO2 che un albero adulto assorbe in un anno, in media. */
  co2PerAlbero: 25,
  /** Il massimale di spesa per la detrazione sulla casa. */
  massimaleDetrazione: 96000,
  /** La detrazione si recupera in quote annuali uguali. */
  anniDetrazione: 10,
} as const;

/** I pezzi che una casa tutta elettrica può avere, nell'ordine in cui si raccontano. */
export const COMPONENTI_FULL_ELECTRIC = {
  fotovoltaico: "Impianto fotovoltaico",
  accumulo: "Batteria di accumulo",
  pompa_calore: "Pompa di calore",
  induzione: "Piano a induzione",
  scaldacqua: "Scaldacqua a pompa di calore",
  climatizzazione: "Climatizzazione",
  wallbox: "Ricarica per l'auto",
} as const;

export type ComponenteFullElectric = keyof typeof COMPONENTI_FULL_ELECTRIC;

/** Quanto produce il fotovoltaico, mese per mese, in percento dell'anno: andamento tipico in Italia. */
export const PRODUZIONE_MENSILE = [4, 5.5, 8.5, 10, 11.5, 12, 12.5, 11, 9, 7, 4.8, 4.2] as const;

/** Quanto consuma una casa tutta elettrica, mese per mese: d'inverno pesa il riscaldamento. */
export const CONSUMO_MENSILE = [13, 11.5, 9.5, 7, 5.8, 5.5, 6.2, 5.8, 5.5, 7.2, 10, 13] as const;

export const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"] as const;
