/**
 * Il DUVRI generato è un JSON (committente, appaltatore, interferenze, misure,
 * costi): prima si stampava così com'era, graffe comprese. Qui diventa un
 * documento leggibile; se il contenuto non è JSON (versioni vecchie) resta testo.
 */
import { escapeHtml } from "@/pages/azienda/SicurezzaCantiere/helpers";

interface Interferenza {
  lavorazione_committente?: string;
  lavorazione_appaltatore?: string;
  rischio?: string;
  livello_rischio?: string;
  misura_prevenzione?: string;
  responsabile?: string;
}

interface DuvriContenuto {
  committente?: string;
  appaltatore?: string;
  interferenze?: Interferenza[];
  misure_generali?: string;
  costi_sicurezza_stimati?: number;
  costi_dettaglio?: Array<{ voce?: string; importo?: number }>;
  note?: string;
}

const euro = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
const t = (s: unknown) => escapeHtml(s == null || s === "" ? "—" : String(s));

export function leggiDuvri(raw: string | null | undefined): DuvriContenuto | null {
  if (!raw) return null;
  try {
    const pulito = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const v = JSON.parse(pulito);
    return v && typeof v === "object" ? (v as DuvriContenuto) : null;
  } catch {
    return null;
  }
}

/** Il corpo del documento (dentro <body>): tabelle se è JSON, testo altrimenti. */
export function corpoDuvriHtml(raw: string | null | undefined): string {
  const d = leggiDuvri(raw);
  if (!d) return `<div class="content">${escapeHtml(raw || "Nessun contenuto disponibile.")}</div>`;
  const interferenze = d.interferenze ?? [];
  const costi = d.costi_dettaglio ?? [];
  return `
  <h2>1. Soggetti</h2>
  <table><tbody>
    <tr><th>Committente</th><td>${t(d.committente)}</td></tr>
    <tr><th>Appaltatore</th><td>${t(d.appaltatore)}</td></tr>
  </tbody></table>
  <h2>2. Interferenze e misure</h2>
  ${interferenze.length ? `<table>
    <thead><tr><th>Lavorazione committente</th><th>Lavorazione appaltatore</th><th>Rischio</th><th>Livello</th><th>Misura di prevenzione</th><th>Responsabile</th></tr></thead>
    <tbody>${interferenze.map((i) => `<tr><td>${t(i.lavorazione_committente)}</td><td>${t(i.lavorazione_appaltatore)}</td><td>${t(i.rischio)}</td><td>${t(i.livello_rischio)}</td><td>${t(i.misura_prevenzione)}</td><td>${t(i.responsabile)}</td></tr>`).join("")}</tbody>
  </table>` : `<p>Nessuna interferenza indicata.</p>`}
  <h2>3. Misure generali</h2>
  <div class="content">${t(d.misure_generali)}</div>
  <h2>4. Costi della sicurezza</h2>
  ${costi.length ? `<table><thead><tr><th>Voce</th><th style="text-align:right">Importo</th></tr></thead>
    <tbody>${costi.map((c) => `<tr><td>${t(c.voce)}</td><td style="text-align:right">${euro(c.importo)}</td></tr>`).join("")}</tbody></table>` : ""}
  <p><strong>Totale stimato:</strong> ${euro(d.costi_sicurezza_stimati)}</p>
  ${d.note ? `<h2>5. Note</h2><div class="content">${t(d.note)}</div>` : ""}
  <h2>Firme</h2>
  <table class="firme"><tbody>
    <tr><th>Committente</th><td></td></tr>
    <tr><th>Datore di lavoro appaltatore</th><td></td></tr>
    <tr><th>Responsabile sicurezza</th><td></td></tr>
  </tbody></table>`;
}
