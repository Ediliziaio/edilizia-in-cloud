/**
 * Il foglio A4 dei documenti contabili (09/11/2026).
 *
 * I clienti chiedono di stampare e portare al commercialista la prima nota, i
 * registri IVA, il bilancio, i cespiti. Finora da quelle pagine usciva solo un
 * CSV senza intestazione: un file di numeri che non dice di chi è, di che
 * periodo, né quando è stato fatto.
 *
 * Qui si costruisce l'HTML da stampare: testata con i dati dell'azienda e il
 * periodo, colonne tipizzate, intestazione ripetuta a ogni pagina, totali in
 * fondo, e il piè di pagina che dice che cos'è.
 *
 * Qui NON si produce XBRL. C'era un pulsante «XBRL» nella prima nota che
 * diceva soltanto «non disponibile»: un'istanza senza contesto, unità e
 * tassonomia validata non è un file utile, è un file rifiutato (BUG-94). Il
 * giorno che serve, si fa con la tassonomia giusta, non con un segnaposto.
 *
 * **Quello che esce non è un registro bollato.** L'app non tiene la partita
 * doppia, non numera le registrazioni e non chiude i periodi: questi fogli
 * servono a leggere, controllare e consegnare, non a sostituire i libri che
 * tiene il commercialista. La frase sta stampata in fondo a ogni pagina,
 * perché nessuno la scopra dopo.
 */

export interface AziendaIntestazione {
  ragione_sociale?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  indirizzo_via?: string | null;
  indirizzo_numero_civico?: string | null;
  indirizzo_cap?: string | null;
  indirizzo_comune?: string | null;
  indirizzo_provincia?: string | null;
  logo_url?: string | null;
}

export type AllineamentoColonna = "sinistra" | "destra";

export interface ColonnaDocumento<R> {
  intestazione: string;
  /** Il testo già pronto: la formattazione dei numeri la decide chi chiama. */
  valore: (riga: R) => string;
  allinea?: AllineamentoColonna;
  /** Larghezza suggerita, in percentuale della tabella. */
  larghezza?: string;
  /** Non va a capo: date, importi, codici. */
  compatta?: boolean;
}

export interface TotaleDocumento {
  etichetta: string;
  valore: string;
  /** In grassetto e con la riga sopra: il totale che conta. */
  forte?: boolean;
}

export interface DocumentoContabile<R> {
  titolo: string;
  /** «1 gennaio – 31 marzo 2026», oppure «al 31/12/2026». */
  periodo: string;
  /** Una riga sotto il titolo, quando serve dire com'è fatto il documento. */
  sottotitolo?: string;
  azienda: AziendaIntestazione;
  colonne: readonly ColonnaDocumento<R>[];
  righe: readonly R[];
  totali?: readonly TotaleDocumento[];
  /** Riquadri di riepilogo sopra la tabella (per aliquota, per categoria…). */
  riepilogo?: readonly { etichetta: string; valore: string }[];
  /** Quando la tabella è vuota: perché, in italiano. */
  vuoto?: string;
  /** Righe da evidenziare: i subtotali dentro l'elenco. */
  evidenzia?: (riga: R) => boolean;
}

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** «Via Roma 12 · 20100 Milano (MI)», saltando i pezzi che mancano. */
export function indirizzoDiUnaRiga(a: AziendaIntestazione): string {
  const via = [a.indirizzo_via, a.indirizzo_numero_civico].filter(Boolean).join(" ").trim();
  const citta = [a.indirizzo_cap, a.indirizzo_comune].filter(Boolean).join(" ").trim();
  const provincia = a.indirizzo_provincia ? `(${a.indirizzo_provincia})` : "";
  return [via, [citta, provincia].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

/** «P.IVA 01234567890 · C.F. ABCDEF…», saltando quello che manca. */
export function identificativiAzienda(a: AziendaIntestazione): string {
  return [
    a.partita_iva ? `P.IVA ${a.partita_iva}` : "",
    a.codice_fiscale && a.codice_fiscale !== a.partita_iva ? `C.F. ${a.codice_fiscale}` : "",
  ].filter(Boolean).join(" · ");
}

function oggiInLettere(): string {
  return new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

/** La frase che spiega che cos'è il foglio: sempre in fondo, mai nascosta. */
export const AVVERTENZA_DOCUMENTO =
  "Prospetto estratto dal gestionale, utile per il controllo e per la consegna al commercialista. Non è un registro bollato: la tenuta dei libri contabili resta allo studio.";

/**
 * L'HTML da dare a PrintPreviewModal, o da aprire e stampare.
 * Niente dipendenze: è una stringa, si prova con un confronto di testo.
 */
export function htmlDocumentoContabile<R>(d: DocumentoContabile<R>): string {
  const a = d.azienda;
  const indirizzo = indirizzoDiUnaRiga(a);
  const identificativi = identificativiAzienda(a);
  const generato = oggiInLettere();

  const intestazioneTabella = d.colonne
    .map((c) => {
      const stile = [
        "padding:5px 6px",
        "font-size:7pt",
        "text-transform:uppercase",
        "letter-spacing:.4px",
        "color:#475569",
        "border-bottom:1px solid #cbd5e1",
        `text-align:${c.allinea === "destra" ? "right" : "left"}`,
        c.larghezza ? `width:${c.larghezza}` : "",
      ].filter(Boolean).join(";");
      return `<th style="${stile}">${esc(c.intestazione)}</th>`;
    })
    .join("");

  const corpo = d.righe.length
    ? d.righe
        .map((r, i) => {
          const forte = d.evidenzia?.(r) ?? false;
          const sfondo = forte ? "#f1f5f9" : i % 2 ? "#fafafa" : "#ffffff";
          const celle = d.colonne
            .map((c) => {
              const stile = [
                "padding:4px 6px",
                "font-size:8pt",
                "border-bottom:1px solid #eef2f7",
                "vertical-align:top",
                `text-align:${c.allinea === "destra" ? "right" : "left"}`,
                c.allinea === "destra" ? "font-variant-numeric:tabular-nums" : "",
                c.compatta ? "white-space:nowrap" : "",
                forte ? "font-weight:700" : "",
              ].filter(Boolean).join(";");
              return `<td style="${stile}">${esc(c.valore(r))}</td>`;
            })
            .join("");
          return `<tr style="background:${sfondo};">${celle}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${d.colonne.length}" style="padding:18px 6px;font-size:8pt;color:#64748b;text-align:center;">${esc(d.vuoto ?? "Nessun movimento nel periodo scelto.")}</td></tr>`;

  const riepilogo = d.riepilogo?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 10px;">${d.riepilogo
        .map(
          (k) =>
            `<div class="k"><div class="l">${esc(k.etichetta)}</div><div class="v">${esc(k.valore)}</div></div>`,
        )
        .join("")}</div>`
    : "";

  const totali = d.totali?.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:10px;" class="totali">${d.totali
        .map(
          (t) =>
            `<tr><td style="padding:4px 6px;font-size:${t.forte ? "9.5pt" : "8.5pt"};${t.forte ? "font-weight:700;border-top:1.5px solid #334155;" : "border-top:1px solid #e2e8f0;"}">${esc(t.etichetta)}</td><td style="padding:4px 6px;text-align:right;font-variant-numeric:tabular-nums;font-size:${t.forte ? "9.5pt" : "8.5pt"};${t.forte ? "font-weight:700;border-top:1.5px solid #334155;" : "border-top:1px solid #e2e8f0;"}">${esc(t.valore)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${esc(d.titolo)} — ${esc(d.periodo)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:9pt;color:#1e293b;background:#ffffff;}
@media print{@page{size:A4;margin:1.2cm;}}
.page{max-width:794px;margin:0 auto;padding:20px 26px 26px;}
table{table-layout:auto;width:100%;border-collapse:collapse;}
thead{display:table-header-group;}
tr{break-inside:avoid;}
.totali tr{break-inside:avoid;}
.k{border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;min-width:120px;}
.k .l{font-size:6.6pt;color:#64748b;text-transform:uppercase;letter-spacing:.6px;}
.k .v{font-size:11pt;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums;}
.piede{margin-top:18px;padding-top:7px;border-top:1px solid #e2e8f0;font-size:6.8pt;color:#94a3b8;line-height:1.5;}
</style></head><body><div class="page">

<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #1e293b;padding-bottom:10px;">
  <div>
    <div style="font-size:11pt;font-weight:800;">${esc(a.ragione_sociale ?? "Azienda")}</div>
    ${identificativi ? `<div style="font-size:7.5pt;color:#475569;margin-top:1px;">${esc(identificativi)}</div>` : ""}
    ${indirizzo ? `<div style="font-size:7.5pt;color:#475569;">${esc(indirizzo)}</div>` : ""}
  </div>
  <div style="text-align:right;">
    ${a.logo_url ? `<img src="${esc(a.logo_url)}" alt="" style="max-height:38px;max-width:130px;object-fit:contain;display:block;margin-left:auto;margin-bottom:5px;">` : ""}
    <div style="font-size:7pt;color:#64748b;">Generato il ${esc(generato)}</div>
  </div>
</div>

<div style="margin-top:14px;">
  <h1 style="font-size:15pt;font-weight:800;color:#0f172a;">${esc(d.titolo)}</h1>
  <div style="font-size:9pt;color:#334155;margin-top:2px;">${esc(d.periodo)}</div>
  ${d.sottotitolo ? `<div style="font-size:7.5pt;color:#64748b;margin-top:3px;">${esc(d.sottotitolo)}</div>` : ""}
</div>

${riepilogo}

<table style="margin-top:12px;border:1px solid #e2e8f0;">
  <thead><tr style="background:#f8fafc;">${intestazioneTabella}</tr></thead>
  <tbody>${corpo}</tbody>
</table>

${totali}

<div class="piede">${esc(AVVERTENZA_DOCUMENTO)}</div>
</div></body></html>`;
}
