/**
 * avvisoEmail — l'email degli avvisi al titolare (16/09/2026).
 *
 * «Vorrei ricevere su flo.andriciuc@gmail.com una notifica ogni volta che una
 * persona risponde alle email, cosa ha risposto… idem per WhatsApp… e degli
 * alert in caso di blocchi.» La campanella e il push c'erano già
 * (avvisaSuperAdmin), ma arrivano solo a chi ha l'app aperta o il push attivo:
 * una risposta calda letta il giorno dopo è un'occasione persa.
 *
 * Modulo puro: i destinatari li legge il chiamante da platform_settings
 * (`avvisi_email_destinatari`); qui si decide cosa va per email e come appare.
 */

export interface RigaAvviso { etichetta: string; valore: string | null | undefined }

export interface ContenutoAvviso {
  titolo: string;
  /** Il messaggio ricevuto, o la spiegazione del blocco. */
  testo?: string | null;
  /** I dettagli: chi, da quale casella o numero, brand, flusso… Le righe vuote non compaiono. */
  righe?: RigaAvviso[];
  /** Percorso nel pannello, es. «/admin/marketing?tab=posta». */
  url?: string | null;
}

/**
 * Le risposte, una per una, NON vanno più per email (24/09/2026): erano 8-9 al
 * giorno fra outreach e WhatsApp, e il titolare le ha chieste tutte insieme
 * nel riepilogo del mattino, con scritto chi richiamare. Restano la campanella
 * e il push, che sono immediati e non intasano la posta.
 */
const SOLO_NEL_RIEPILOGO = new Set([
  "outreach_risposta_email",
  "whatsapp_risposta",
  "whatsapp_optout",
]);

/**
 * Vanno per email i blocchi dell'outreach e di WhatsApp, e i blocchi dei lead
 * delle aziende (coda Facebook ferma, collegamento scaduto: 17/09/2026):
 * fermano la macchina e sono meno di uno al giorno. Gli altri avvisi della
 * piattaforma (prenotazioni, ecc.) restano su campanella e push.
 */
export function vaPerEmail(tipo: string): boolean {
  if (SOLO_NEL_RIEPILOGO.has(tipo)) return false;
  return /^(outreach_|whatsapp_|lead_)/.test(tipo);
}

/** Destinatari da platform_settings: lista JSON, oppure testo separato da virgole, spazi o punti e virgola. */
export function destinatariDa(valore: unknown): string[] {
  let grezzi: unknown[] = [];
  if (Array.isArray(valore)) grezzi = valore;
  else if (typeof valore === "string") {
    const t = valore.trim();
    if (t.startsWith("[")) {
      try { const j = JSON.parse(t); if (Array.isArray(j)) grezzi = j; } catch { grezzi = t.split(/[,;\s]+/); }
    } else grezzi = t.split(/[,;\s]+/);
  }
  const email = grezzi.map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  return [...new Set(email)];
}

/**
 * Il testo della risposta senza la conversazione citata sotto: chi risponde da
 * Gmail o Outlook si porta dietro tutta la nostra email. Tiene gli a capo.
 */
export function testoSenzaCitazione(testo: string | null | undefined, max = 3000): string {
  const tenute: string[] = [];
  for (const riga of String(testo ?? "").split(/\r?\n/)) {
    const t = riga.trim();
    if (t.startsWith(">")) continue;
    if (/^On .+wrote:$/i.test(t) || /^Il .+ha scritto:$/i.test(t)) break;
    if (/^-{2,}\s*(messaggio originale|original message)\s*-{2,}$/i.test(t)) break;
    if (/^(da|from):\s.+@/i.test(t)) break;
    tenute.push(riga.replace(/\s+$/, ""));
  }
  const pulito = tenute.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return pulito.length > max ? `${pulito.slice(0, max - 1)}…` : pulito;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** L'HTML dell'email: titolo, dettagli in tabella, il messaggio in evidenza, un bottone per il pannello. */
export function htmlAvviso(c: ContenutoAvviso, appUrl: string): string {
  const righe = (c.righe ?? [])
    .filter((r) => String(r.valore ?? "").trim())
    .map((r) =>
      `<tr><td style="padding:4px 14px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(r.etichetta)}</td>` +
      `<td style="padding:4px 0;color:#111827">${esc(String(r.valore).trim())}</td></tr>`)
    .join("");
  const testo = String(c.testo ?? "").trim();
  const blocco = testo
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f3f4f6;border-left:3px solid #f97316;border-radius:4px;white-space:pre-wrap;color:#111827">${esc(testo)}</div>`
    : "";
  const link = c.url
    ? `<p style="margin:20px 0 0"><a href="${esc(`${appUrl.replace(/\/+$/, "")}${c.url.startsWith("/") ? "" : "/"}${c.url}`)}" style="display:inline-block;padding:9px 16px;background:#1e3a5f;color:#ffffff;text-decoration:none;border-radius:6px">Apri nel pannello</a></p>`
    : "";
  return `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:600px">` +
    `<h2 style="font-size:17px;margin:0 0 12px">${esc(c.titolo)}</h2>` +
    (righe ? `<table style="border-collapse:collapse;font-size:14px">${righe}</table>` : "") +
    blocco + link +
    `</div>`;
}
