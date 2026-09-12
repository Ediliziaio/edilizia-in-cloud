// Un lead «arretrato» è un modulo compilato giorni fa e recuperato solo ora
// dallo storico di Facebook, non una richiesta appena arrivata.
//
// Il 12/09/2026 un recupero dello storico ha portato dentro in un colpo solo
// 90 lead compilati fra il 23 agosto e quel giorno. Il sistema li ha trattati
// come se fossero arrivati in quel momento: 91 notifiche «Nuovo lead» a un
// cliente in un'ora e mezza, per richieste vecchie di settimane, e i
// commerciali con l'elenco pieno di nomi «nuovi» che nuovi non erano.
//
// Il lead va comunque salvato — è una richiesta vera che era andata persa —
// ma non deve svegliare le automazioni come se fosse fresco.

/** Oltre queste ore il lead non è più «appena arrivato». */
export const ORE_LEAD_FRESCO = 24;

export function isLeadArretrato(createdTime: unknown, adesso: Date = new Date(), oreFresco = ORE_LEAD_FRESCO): boolean {
  if (!createdTime) return false; // senza data non si indovina: si tratta come fresco
  const t = new Date(String(createdTime)).getTime();
  if (!Number.isFinite(t)) return false;
  const ore = (adesso.getTime() - t) / 3_600_000;
  return ore > oreFresco;
}

/** Giorni interi di ritardo, per scriverlo in chiaro a chi legge la scheda. */
export function giorniDiRitardo(createdTime: unknown, adesso: Date = new Date()): number {
  if (!createdTime) return 0;
  const t = new Date(String(createdTime)).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((adesso.getTime() - t) / 86_400_000));
}

/** Nota da appendere all'opportunità recuperata. */
export function notaArretrato(createdTime: unknown, adesso: Date = new Date()): string {
  const giorni = giorniDiRitardo(createdTime, adesso);
  const quando = createdTime ? new Date(String(createdTime)).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "data ignota";
  return `Richiesta compilata il ${quando}${giorni > 0 ? ` (${giorni} giorni fa)` : ""}, recuperata dallo storico di Facebook: non è un contatto di oggi.`;
}
