/**
 * L'email unica del mattino (25/09/2026, richiesta del founder).
 *
 * Prima arrivavano tre email fra le 06:00 e le 06:04: rapporto marketing,
 * stato piattaforma, outreach di ieri. Adesso una sola, che si legge dal
 * telefono: in cima COSA FARE OGGI (chi chiamare col numero, gli appuntamenti
 * del giorno, le priorità marketing, cosa è rotto), sotto i numeri delle tre
 * aree. L'oggetto dice già la giornata: «Oggi: 13 chiamate · 2 appuntamenti ·
 * 3 priorità · 4 da sistemare».
 *
 * Niente icone (founder, 25/09/2026): lo stato lo dicono le parole.
 *
 * Qui solo composizione: nessuna query, nessun invio. I dati li raccolgono gli
 * stessi moduli delle tre email di prima (ops-canarino/stato.ts,
 * outreachRiepilogoDati.ts, rapportoMarketingMattino.ts), quindi i numeri sono
 * gli stessi. Se un'area non si riesce a leggere, l'email parte lo stesso con
 * il motivo scritto al posto di quella sezione.
 */

import { rigaDaChiamare, type DaChiamare, type RigaAvviso } from "./outreachRiepilogo.ts";

export interface AppuntamentoOggi {
  /** «10:00» */
  ora: string;
  /** Chiamata conoscitiva, Videochiamata, Appuntamento… */
  tipo: string;
  /** La persona, o l'azienda se il nome manca. */
  chi: string;
  azienda?: string | null;
  telefono?: string | null;
  calendario?: string | null;
}

export interface PrioritaMattino {
  cliente_nome: string;
  titolo: string;
  azione: string;
  responsabile?: string | null;
  scadenza?: string | null;
}

/** Una delle tre aree: il suo HTML, o il motivo per cui manca. */
export interface SezioneMattino {
  html: string | null;
  errore?: string | null;
}

export interface DatiMattino {
  /** «venerdì 26 settembre» */
  giorno: string;
  chiamate: DaChiamare[];
  appuntamenti: AppuntamentoOggi[];
  /** null = non si sono potuti leggere (il motivo va in erroreAppuntamenti). */
  erroreAppuntamenti?: string | null;
  priorita: PrioritaMattino[];
  /** Cosa è rotto: urgenze dell'outreach e segnali della piattaforma, già in chiaro. */
  daSistemare: string[];
  marketing: SezioneMattino;
  /** Le righe del riepilogo outreach (senza «Urgenze» e «Da chiamare oggi», che stanno in cima). */
  outreachRighe: RigaAvviso[] | null;
  outreachChiHaRisposto: string[];
  outreachErrore?: string | null;
  piattaforma: SezioneMattino;
  /** Link alle console. */
  urlMarketing: string;
  urlOutreach: string;
  /** Un invio di prova: l'oggetto lo dice. */
  prova?: boolean;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const conta = (n: number, uno: string, molti: string) => `${n.toLocaleString("it-IT")} ${n === 1 ? uno : molti}`;

/** «Oggi: 13 chiamate · 2 appuntamenti · 3 priorità · 4 da sistemare», senza le voci a zero. */
export function oggettoMattino(d: Pick<DatiMattino, "chiamate" | "appuntamenti" | "priorita" | "daSistemare" | "prova">): string {
  const pezzi = [
    d.chiamate.length ? conta(d.chiamate.length, "chiamata", "chiamate") : "",
    d.appuntamenti.length ? conta(d.appuntamenti.length, "appuntamento", "appuntamenti") : "",
    d.priorita.length ? conta(d.priorita.length, "priorità", "priorità") : "",
    d.daSistemare.length ? `${d.daSistemare.length.toLocaleString("it-IT")} da sistemare` : "",
  ].filter(Boolean);
  const oggetto = pezzi.length ? `Oggi: ${pezzi.join(" · ")}` : "Oggi: niente di urgente";
  return d.prova ? `[Prova] ${oggetto}` : oggetto;
}

/** Il numero come link che si tocca dal telefono. */
function telefonoLink(tel: string | null | undefined): string {
  const t = String(tel ?? "").trim();
  if (!t) return `<span style="color:#9ca3af;">numero non in rubrica</span>`;
  const cifre = t.replace(/[^\d+]/g, "");
  return `<a href="tel:${esc(cifre)}" style="color:#2563eb;text-decoration:none;font-weight:600;">${esc(t)}</a>`;
}

const titoletto = (t: string) =>
  `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:600;">${esc(t)}</p>`;
const vuoto = (t: string) => `<p style="margin:0 0 12px;color:#6b7280;">${esc(t)}</p>`;
const lista = (voci: string[]) => `<ul style="margin:0 0 14px;padding-left:18px;">${voci.join("")}</ul>`;
const separatore = `<div style="border-top:1px solid #e5e7eb;margin:22px 0;"></div>`;
const avvisoSezione = (motivo: string) =>
  `<p style="margin:0;color:#b91c1c;">Questa parte stamattina non si è potuta leggere: ${esc(motivo)}.</p>`;

function bloccoChiamate(chiamate: DaChiamare[], errore?: string | null): string {
  if (errore) return titoletto("Chiamate da fare") + avvisoSezione(errore) + `<div style="height:12px;"></div>`;
  if (!chiamate.length) return titoletto("Chiamate da fare") + vuoto("Nessuna: nessuna risposta positiva da richiamare.");
  return titoletto(`Chiamate da fare (${chiamate.length})`) + lista(chiamate.map((c) => {
    const cosa = String(c.cosa ?? "").replace(/\s+/g, " ").trim();
    return `<li style="margin:0 0 8px;"><strong>${esc(c.chi)}</strong> — ${esc(c.motivo)} (${c.canale === "whatsapp" ? "WhatsApp" : "email"}, ${esc(c.quando)})<br>` +
      `${telefonoLink(c.telefono)}` +
      (cosa ? `<br><span style="color:#4b5563;">«${esc(cosa.length > 140 ? `${cosa.slice(0, 139)}…` : cosa)}»</span>` : "") +
      `</li>`;
  }));
}

function bloccoAppuntamenti(app: AppuntamentoOggi[], errore?: string | null): string {
  if (errore) return titoletto("Appuntamenti di oggi") + avvisoSezione(errore) + `<div style="height:12px;"></div>`;
  if (!app.length) return titoletto("Appuntamenti di oggi") + vuoto("Nessun appuntamento in agenda.");
  return titoletto(`Appuntamenti di oggi (${app.length})`) + lista(app.map((a) =>
    `<li style="margin:0 0 8px;"><strong>${esc(a.ora)}</strong> · ${esc(a.tipo)} — <strong>${esc(a.chi)}</strong>` +
    `${a.azienda && a.azienda !== a.chi ? ` (${esc(a.azienda)})` : ""}<br>` +
    `${telefonoLink(a.telefono)}${a.calendario ? ` <span style="color:#6b7280;">· ${esc(a.calendario)}</span>` : ""}</li>`));
}

function bloccoPriorita(priorita: PrioritaMattino[], errore?: string | null): string {
  if (errore) return titoletto("Priorità marketing") + avvisoSezione(errore) + `<div style="height:12px;"></div>`;
  if (!priorita.length) return titoletto("Priorità marketing") + vuoto("Nessuna: non ci sono allarmi aperti sui brand attivi.");
  return titoletto(`Priorità marketing (${priorita.length})`) + lista(priorita.map((p) =>
    `<li style="margin:0 0 8px;"><strong>${esc(p.cliente_nome.toUpperCase())}</strong> — ${esc(p.titolo)}<br>` +
    `<span style="color:#374151;">${esc(p.azione)}</span>` +
    `${p.responsabile || p.scadenza ? `<br><span style="color:#6b7280;">${[p.responsabile ? `Responsabile: ${esc(p.responsabile)}` : "", p.scadenza ? `Scadenza: ${esc(p.scadenza)}` : ""].filter(Boolean).join(" · ")}</span>` : ""}</li>`));
}

function bloccoDaSistemare(voci: string[]): string {
  if (!voci.length) return titoletto("Da sistemare") + vuoto("Niente: piattaforma e outreach regolari.");
  return titoletto(`Da sistemare (${voci.length})`) + lista(voci.map((v) => `<li style="margin:0 0 6px;color:#b91c1c;">${esc(v)}</li>`));
}

function sezioneOutreach(d: DatiMattino): string {
  if (d.outreachErrore || !d.outreachRighe) return avvisoSezione(d.outreachErrore ?? "dati non disponibili");
  const righe = d.outreachRighe.filter((r) => r.etichetta !== "Urgenze" && r.etichetta !== "Da chiamare oggi");
  const tabella = `<table style="border-collapse:collapse;width:100%;margin:0 0 12px;">${righe.map((r) =>
    `<tr><td style="padding:4px 10px 4px 0;vertical-align:top;color:#6b7280;white-space:nowrap;">${esc(r.etichetta)}</td>` +
    `<td style="padding:4px 0;vertical-align:top;">${esc(r.valore)}</td></tr>`).join("")}</table>`;
  const risposte = d.outreachChiHaRisposto.length
    ? `<p style="margin:0 0 4px;color:#6b7280;">Hanno risposto ieri:</p>` +
      lista(d.outreachChiHaRisposto.map((x) => `<li style="margin:0 0 2px;">${esc(x)}</li>`))
    : `<p style="margin:0 0 12px;color:#6b7280;">Nessuna risposta ieri.</p>`;
  return tabella + risposte +
    `<p style="margin:0;"><a href="${esc(d.urlOutreach)}" style="color:#2563eb;font-weight:600;">Apri la posta dell'outreach</a></p>`;
}

export function componiMattino(d: DatiMattino): { subject: string; html: string } {
  const subject = oggettoMattino(d);
  const giorno = d.giorno.charAt(0).toUpperCase() + d.giorno.slice(1);
  const cosaFare = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 16px 4px;">
    <p style="margin:0 0 12px;font-size:16px;"><strong>Cosa fare oggi</strong></p>
    ${bloccoChiamate(d.chiamate, d.outreachErrore)}
    ${bloccoAppuntamenti(d.appuntamenti, d.erroreAppuntamenti)}
    ${bloccoPriorita(d.priorita, d.marketing.html ? null : d.marketing.errore ?? "dati non disponibili")}
    ${bloccoDaSistemare(d.daSistemare)}
  </div>`;

  const html = `<div style="max-width:640px;margin:0 auto;padding:20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.5;">
    <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">${d.prova ? "Prova · " : ""}Il tuo mattino</p>
    <h1 style="margin:2px 0 16px;font-size:20px;color:#111827;">${esc(giorno)}</h1>

    ${cosaFare}

    ${separatore}
    <p style="margin:0 0 12px;font-size:16px;"><strong>Marketing clienti</strong></p>
    ${d.marketing.html ?? avvisoSezione(d.marketing.errore ?? "dati non disponibili")}

    ${separatore}
    <p style="margin:0 0 12px;font-size:16px;"><strong>Outreach di ieri</strong></p>
    ${sezioneOutreach(d)}

    ${separatore}
    <p style="margin:0 0 12px;font-size:16px;"><strong>Piattaforma</strong></p>
    ${d.piattaforma.html ?? avvisoSezione(d.piattaforma.errore ?? "dati non disponibili")}

    <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Ogni mattina alle 06:00, ora di Roma, sui dati fino a ieri. Arriva anche quando è tutto regolare: se un giorno non arriva, il problema è il controllo stesso. Il riepilogo della settimana arriva a parte il lunedì, quello del mese il primo del mese.</p>
  </div>`;
  return { subject, html };
}

/** La riga «da sistemare» di un segnale della piattaforma: «Numeri WhatsApp BANNATI (campagne in pausa): 2». */
export function rigaSegnale(titolo: string, quanti: number): string {
  return `${titolo}: ${quanti.toLocaleString("it-IT")}`;
}

/** La riga di una chiamata in testo semplice (per i log). */
export const rigaChiamataTesto = rigaDaChiamare;
