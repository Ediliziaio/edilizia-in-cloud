/**
 * appuntamentiPubblici — pezzi condivisi fra prenotazione, promemoria e
 * gestione (disdetta/spostamento) degli appuntamenti presi dalla pagina
 * pubblica: file .ics, testi delle email, regole di orario.
 */

// deno-lint-ignore-file no-explicit-any

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function minutiDa(hhmm: string): number {
  const [h, m] = String(hhmm ?? "").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
export function orarioDa(min: number): string {
  const h = Math.floor(min / 60) % 24, m = ((min % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** "lunedì 8 settembre 2026" da "2026-09-08". */
export function dataEstesa(iso: string): string {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return `${GIORNI[dt.getUTCDay()]} ${d} ${MESI[(m || 1) - 1]} ${y}`;
}
export function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

/**
 * Ora italiana → UTC. L'Italia e' UTC+1, UTC+2 con l'ora legale (ultima
 * domenica di marzo → ultima domenica di ottobre): serve per scrivere nel .ics
 * un orario che ogni calendario interpreta allo stesso modo.
 */
function ultimaDomenica(anno: number, mese0: number): number {
  const ultimo = new Date(Date.UTC(anno, mese0 + 1, 0));
  return ultimo.getUTCDate() - ultimo.getUTCDay();
}
export function romaVersoUtc(dataIso: string, hhmm: string): Date {
  const [y, m, d] = dataIso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const inizioLegale = Date.UTC(y, 2, ultimaDomenica(y, 2), 1, 0, 0);   // 01:00 UTC
  const fineLegale = Date.UTC(y, 9, ultimaDomenica(y, 9), 1, 0, 0);
  const provvisorio = Date.UTC(y, m - 1, d, hh, mm, 0);
  const legale = provvisorio >= inizioLegale && provvisorio < fineLegale;
  return new Date(provvisorio - (legale ? 2 : 1) * 3_600_000);
}

function icsData(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function icsRiga(riga: string): string {
  // RFC 5545: righe max 75 ottetti, le successive iniziano con uno spazio.
  const out: string[] = [];
  let resto = riga;
  while (resto.length > 73) { out.push(resto.slice(0, 73)); resto = " " + resto.slice(73); }
  out.push(resto);
  return out.join("\r\n");
}

export interface DatiIcs {
  uid: string;
  titolo: string;
  descrizione?: string | null;
  dataIso: string;      // yyyy-MM-dd
  ora: string;          // HH:mm (ora italiana)
  durataMin: number;
  organizzatore?: string | null;
  partecipante?: string | null;
  annullato?: boolean;
  sequenza?: number;
}

/** File .ics: il cliente lo apre e l'appuntamento entra nel suo calendario. */
export function creaIcs(d: DatiIcs): string {
  const inizio = romaVersoUtc(d.dataIso, d.ora);
  const fine = new Date(inizio.getTime() + Math.max(1, d.durataMin) * 60_000);
  const righe = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edilizia in Cloud//Appuntamenti//IT",
    "CALSCALE:GREGORIAN",
    `METHOD:${d.annullato ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${d.uid}`,
    `SEQUENCE:${d.sequenza ?? 0}`,
    `DTSTAMP:${icsData(new Date())}`,
    `DTSTART:${icsData(inizio)}`,
    `DTEND:${icsData(fine)}`,
    icsRiga(`SUMMARY:${String(d.titolo).replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n")}`),
    d.descrizione ? icsRiga(`DESCRIPTION:${String(d.descrizione).replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n")}`) : "",
    d.organizzatore ? `ORGANIZER;CN=${d.organizzatore}:mailto:${d.organizzatore}` : "",
    d.partecipante ? `ATTENDEE;CN=${d.partecipante};RSVP=FALSE:mailto:${d.partecipante}` : "",
    `STATUS:${d.annullato ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return righe.join("\r\n");
}

/** Allegato pronto per sendEmailUnified (contenuto in base64). */
export function allegatoIcs(ics: string, nome = "appuntamento.ics"): { filename: string; content: string; type: string } {
  const bytes = new TextEncoder().encode(ics);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { filename: nome, content: btoa(bin), type: "text/calendar" };
}

/** Token del link "gestisci appuntamento": casuale, non indovinabile. */
export function nuovoToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function urlGestione(origine: string, token: string): string {
  return `${String(origine).replace(/\/+$/, "")}/appuntamento/${token}`;
}

/** Blocco HTML comune: quando, quanto, cosa. */
export function blocchettoDettagli(quando: string, durataMin: number, servizio: string): string {
  return `<table style="border-collapse:collapse;margin:16px 0;font-size:15px">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Quando</td><td style="padding:4px 0"><strong>${esc(quando)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Durata</td><td style="padding:4px 0">${durataMin} minuti</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Argomento</td><td style="padding:4px 0">${esc(servizio)}</td></tr>
    </table>`;
}

export function bottoneGestione(url: string, etichetta = "Sposta o disdici"): string {
  return `<p style="margin:20px 0">
      <a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none;font-weight:600">${esc(etichetta)}</a>
    </p>`;
}
