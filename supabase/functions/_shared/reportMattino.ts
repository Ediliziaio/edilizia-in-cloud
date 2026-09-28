/**
 * Il testo del report del mattino, dai numeri raccolti da bot_report_mattino_dati
 * (28/09/2026). Forma breve, per WhatsApp (grassetto con un asterisco). Le
 * sezioni vuote non si scrivono; se non c'è niente da segnalare, lo dice.
 */

export interface DatiReport {
  commesse_attive?: number;
  scaduto?: { n?: number; tot?: number };
  in_scadenza_7gg?: { n?: number; tot?: number };
  sotto_scorta?: number;
  appuntamenti_oggi?: number;
  preventivi_in_attesa?: { n?: number; tot?: number };
  // Dettagli extra (usati soprattutto dal testo scritto dall'AqI):
  appuntamenti_lista?: Array<{ ora?: string | null; titolo?: string | null; luogo?: string | null }>;
  scadute_top?: Array<{ cliente?: string | null; importo?: number; giorni?: number }>;
}

function euro(n: number): string {
  return `€ ${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

function dataOggi(adesso: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(adesso);
}

export function componiReportMattino(nomeAzienda: string | null, dati: DatiReport, adesso: Date): string {
  const righe: string[] = [];
  const attive = Number(dati.commesse_attive ?? 0);
  if (attive > 0) righe.push(`🏗️ *${attive}* commesse in corso`);

  const scadN = Number(dati.scaduto?.n ?? 0);
  if (scadN > 0) righe.push(`🔴 *${scadN}* rate scadute — ${euro(Number(dati.scaduto?.tot ?? 0))} da recuperare`);

  const prossN = Number(dati.in_scadenza_7gg?.n ?? 0);
  if (prossN > 0) righe.push(`🗓️ *${prossN}* incassi in scadenza questa settimana — ${euro(Number(dati.in_scadenza_7gg?.tot ?? 0))}`);

  const scorta = Number(dati.sotto_scorta ?? 0);
  if (scorta > 0) righe.push(`📦 *${scorta}* articoli sotto scorta`);

  const appt = Number(dati.appuntamenti_oggi ?? 0);
  if (appt > 0) righe.push(`📅 *${appt}* appuntamenti oggi`);

  const prevN = Number(dati.preventivi_in_attesa?.n ?? 0);
  if (prevN > 0) righe.push(`📄 *${prevN}* preventivi in attesa di risposta — ${euro(Number(dati.preventivi_in_attesa?.tot ?? 0))}`);

  const testa = `Buongiorno! La situazione di ${dataOggi(adesso)}${nomeAzienda ? ` — ${nomeAzienda}` : ""}:`;
  if (righe.length === 0) return `${testa}\n\nTutto tranquillo: nessuna scadenza o allarme.`;
  return `${testa}\n\n${righe.join("\n")}`;
}
