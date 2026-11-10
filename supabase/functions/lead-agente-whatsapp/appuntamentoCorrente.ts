/**
 * L'appuntamento che il contatto ha davvero davanti a sé (10/11/2026).
 *
 * Perché esiste: senza questo dato l'assistente deduce dalla chat se un
 * appuntamento c'è, e la chat non sa cosa è successo dopo. In prova, il
 * 10/11/2026: un contatto scrive «ciao, vorrei fissare un appuntamento» e si
 * sente rispondere «vedo che hai già un appuntamento fissato per lunedì 28
 * settembre alle 13:00». Era di un mese e mezzo prima, ed era pure annullato:
 * nella chat la conferma c'era, l'annullamento no, perché non passa da
 * WhatsApp.
 *
 * La query prende gli appuntamenti da oggi in avanti e non annullati; qui si
 * scartano quelli di oggi la cui ora è già passata, che per il cliente sono
 * finiti e non vanno nominati come se dovessero ancora succedere.
 */

export interface RigaAppuntamento {
  appointment_date: string;
  appointment_time: string | null;
  marketing_calendars?: { name?: string | null } | { name?: string | null }[] | null;
}

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "2026-11-10" nell'ora di Roma. */
export function dataRomaOggi(adesso: Date = new Date()): string {
  return adesso.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** "14:05" nell'ora di Roma. */
export function adessoRoma(adesso: Date = new Date()): { data: string; ora: string } {
  const ora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(adesso);
  return { data: dataRomaOggi(adesso), ora };
}

/** "mercoledì 11 novembre 2026 alle 14:30". */
function quando(dataIso: string, ora: string): string {
  const [a, m, g] = dataIso.split("-").map(Number);
  const settimana = new Date(Date.UTC(a, m - 1, g, 12)).getUTCDay();
  return `${GIORNI[settimana]} ${g} ${MESI[m - 1]} ${a} alle ${ora}`;
}

/** Il primo appuntamento ancora da fare, o null se non ce n'è nessuno. */
export function appuntamentoDaFare(
  righe: RigaAppuntamento[],
  ora: { data: string; ora: string },
): { quando: string; dove: string | null } | null {
  const futuri = (righe ?? [])
    .filter((r) => {
      const giorno = String(r?.appointment_date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return false;
      if (giorno > ora.data) return true;
      if (giorno < ora.data) return false;
      return String(r.appointment_time ?? "").slice(0, 5) >= ora.ora;
    })
    .sort((x, y) =>
      x.appointment_date.localeCompare(y.appointment_date) ||
      String(x.appointment_time ?? "").localeCompare(String(y.appointment_time ?? ""))
    );
  const primo = futuri[0];
  if (!primo) return null;
  const cal = Array.isArray(primo.marketing_calendars) ? primo.marketing_calendars[0] : primo.marketing_calendars;
  return {
    quando: quando(primo.appointment_date, String(primo.appointment_time ?? "").slice(0, 5)),
    dove: cal?.name ?? null,
  };
}
