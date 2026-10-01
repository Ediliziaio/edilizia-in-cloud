// La fattura RICEVUTA come la legge una persona (01/10/2026).
//
// Prima per una fattura di un fornitore c'erano solo l'XML (testo grezzo) e il
// file da scaricare: chi non è un tecnico non vedeva né righe né totali, e non
// c'era niente da stampare o salvare in PDF. Qui l'XML FatturaPA diventa una
// pagina A4 leggibile; il PDF si ottiene con la stampa nativa del browser (testo
// vero, selezionabile), come per le fatture emesse e i preventivi.
//
// Si usano gli stessi lettori dell'importazione (leggiFatturaRicevuta,
// leggiFatturaPA): quello che si vede è quello che è stato registrato.

import { leggiFatturaPA, type LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";
import { leggiFatturaRicevuta } from "../../../supabase/functions/_shared/fatturaRicevutaXml";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const eur = (n: unknown): string =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const num = (n: unknown): string =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(Number(n) || 0);

const dataIt = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

const TIPI_DOCUMENTO: Record<string, string> = {
  TD01: "Fattura", TD02: "Acconto/anticipo su fattura", TD03: "Acconto/anticipo su parcella",
  TD04: "Nota di credito", TD05: "Nota di debito", TD06: "Parcella",
  TD16: "Integrazione fattura reverse charge interno", TD17: "Integrazione/autofattura per acquisto servizi dall'estero",
  TD18: "Integrazione per acquisto di beni intracomunitari", TD19: "Integrazione/autofattura per acquisto di beni ex art. 17 c.2",
  TD20: "Autofattura per regolarizzazione", TD24: "Fattura differita", TD25: "Fattura differita (triangolari)",
  TD26: "Cessione di beni ammortizzabili", TD27: "Autoconsumo o cessioni gratuite",
};

const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: "Contanti", MP02: "Assegno", MP05: "Bonifico", MP08: "Carta di pagamento", MP12: "RIBA", MP19: "SEPA Direct Debit",
};

/** Un allegato PDF dentro l'XML (spesso il PDF di cortesia del fornitore). */
export interface AllegatoPdf {
  nome: string;
  base64: string;
}

export interface FatturaRicevutaVista {
  html: string;
  /** I PDF che il fornitore ha incorporato nell'XML, se ci sono. */
  allegatiPdf: AllegatoPdf[];
  /** Nome suggerito per il file PDF. */
  titolo: string;
}

/**
 * Pagina HTML (A4, self-contained) della fattura ricevuta. Ritorna null se l'XML
 * non è una fattura leggibile. `parser` è il DOMParser del browser (o di jsdom nei test).
 */
export function fatturaRicevutaHtml(
  xml: string,
  parser: LettoreXml,
  opzioni: { emessa?: boolean } = {},
): FatturaRicevutaVista | null {
  const f = leggiFatturaRicevuta(xml, parser);
  if (!f) return null;
  const extra = leggiFatturaPA(xml, parser);

  const tipo = TIPI_DOCUMENTO[f.tipo_documento] ?? `Documento ${f.tipo_documento}`;
  // Alcuni fornitori scrivono già «(PN)» nel comune: non si ripete.
  const provincia = f.cedente_provincia && !f.cedente_comune.toUpperCase().includes(`(${f.cedente_provincia.toUpperCase()})`)
    ? `(${f.cedente_provincia})` : "";
  const luogo = [f.cedente_cap, f.cedente_comune, provincia].filter(Boolean).join(" ");
  const nota = f.tipo_documento === "TD04" ? " — gli importi sono a credito" : "";

  const righe = f.righe.map((r) => {
    const natura = r.natura_iva ? ` (${esc(r.natura_iva)})` : "";
    return `<tr>
      <td class="n">${esc(r.numero_linea)}</td>
      <td>${esc(r.descrizione)}</td>
      <td class="d">${num(r.quantita)}</td>
      <td class="d">${eur(r.prezzo_unitario)}</td>
      <td class="d">${esc(r.aliquota_iva)}%${natura}</td>
      <td class="d">${eur(r.imponibile)}</td>
    </tr>`;
  }).join("");

  const riepilogo = f.riepilogo_iva.map((r) => `<tr>
      <td>${esc(r.aliquota)}%${r.natura ? ` (${esc(r.natura)})` : ""}</td>
      <td class="d">${eur(r.imponibile)}</td>
      <td class="d">${eur(r.imposta)}</td>
    </tr>`).join("");

  const pagamento = extra && (extra.scadenza || extra.iban || extra.modalitaPagamento)
    ? `<div class="blocco"><h3>Pagamento</h3>
        ${extra.modalitaPagamento ? `<div>Modalità: ${esc(MODALITA_PAGAMENTO[extra.modalitaPagamento] ?? extra.modalitaPagamento)}</div>` : ""}
        ${extra.scadenza ? `<div>Scadenza: ${esc(dataIt(extra.scadenza))}</div>` : ""}
        ${extra.iban ? `<div>IBAN: <span class="mono">${esc(extra.iban)}</span></div>` : ""}
      </div>`
    : "";

  const bollo = extra && extra.bollo > 0 ? `<tr><td>Imposta di bollo</td><td class="d">${eur(extra.bollo)}</td></tr>` : "";
  const lotto = f.fatture_nel_file > 1
    ? `<p class="avviso">Il file contiene ${f.fatture_nel_file} fatture: qui è mostrata la prima.</p>` : "";

  const emessa = !!opzioni.emessa;
  const titolo = emessa
    ? `Fattura elettronica ${f.numero_fattura} - ${extra?.cliente.nome ?? ""}`.replace(/ - $/, "")
    : `Fattura ${f.numero_fattura} - ${f.cedente_ragione_sociale}`;

  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10pt; color: #0f172a; margin: 0; padding: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 0 0 4px; }
  .testa { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  .doc { text-align: right; }
  .mono { font-family: ui-monospace, Menlo, monospace; }
  .parti { display: flex; gap: 24px; margin-bottom: 14px; }
  .parti > div { flex: 1; }
  .nome { font-weight: 600; font-size: 11pt; }
  .muted { color: #475569; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .d { text-align: right; white-space: nowrap; }
  .n { width: 24px; color: #94a3b8; }
  .totali { width: 55%; margin-left: auto; break-inside: avoid; page-break-inside: avoid; }
  .totali td { border-bottom: 0; padding: 3px 6px; }
  .totale td { border-top: 2px solid #0f172a; font-weight: 700; font-size: 12pt; padding-top: 6px; }
  .blocco { margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
  .avviso { background: #fef3c7; border: 1px solid #fde68a; padding: 6px 8px; font-size: 9pt; }
  .pie { margin-top: 18px; font-size: 8pt; color: #94a3b8; }
</style></head><body>
  <div class="testa">
    <div>
      <h1>${esc(tipo)}</h1>
      <div class="muted">${emessa ? "Fattura elettronica emessa" : "Ricevuta tramite SDI"}${!emessa && f.sdi_id_trasmissione ? ` · id ${esc(f.sdi_id_trasmissione)}` : ""}${nota}</div>
    </div>
    <div class="doc">
      <div class="mono" style="font-size:13pt;font-weight:600;">N° ${esc(f.numero_fattura)}</div>
      <div>del ${esc(dataIt(f.data_fattura))}</div>
    </div>
  </div>
  ${lotto}
  <div class="parti">
    <div>
      <h3>${emessa ? "Cedente / prestatore" : "Fornitore"}</h3>
      <div class="nome">${esc(f.cedente_ragione_sociale)}</div>
      ${f.cedente_indirizzo ? `<div class="muted">${esc(f.cedente_indirizzo)}</div>` : ""}
      ${luogo ? `<div class="muted">${esc(luogo)}</div>` : ""}
      <div class="muted mono">P.IVA ${esc(f.cedente_paese)}${esc(f.cedente_piva)}${f.cedente_cf ? ` · C.F. ${esc(f.cedente_cf)}` : ""}</div>
    </div>
    <div>
      <h3>${emessa ? "Cessionario / committente" : "Intestata a"}</h3>
      <div class="nome">${esc(extra?.cliente.nome ?? "")}</div>
      <div class="muted mono">P.IVA ${esc(f.cessionario_piva)}${f.cessionario_cf ? ` · C.F. ${esc(f.cessionario_cf)}` : ""}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Descrizione</th><th class="d">Q.tà</th><th class="d">Prezzo</th><th class="d">IVA</th><th class="d">Importo</th></tr></thead>
    <tbody>${righe}</tbody>
  </table>
  <div class="totali">
    <table>
      <thead><tr><th>IVA</th><th class="d">Imponibile</th><th class="d">Imposta</th></tr></thead>
      <tbody>${riepilogo}</tbody>
    </table>
    <table>
      <tbody>
        <tr><td>Imponibile</td><td class="d">${eur(f.imponibile_totale)}</td></tr>
        <tr><td>IVA</td><td class="d">${eur(f.iva_totale)}</td></tr>
        ${bollo}
        <tr class="totale"><td>Totale</td><td class="d">${eur(f.totale_documento)}</td></tr>
      </tbody>
    </table>
  </div>
  ${pagamento}
  <div class="pie">Rappresentazione leggibile della fattura elettronica${emessa ? "" : " ricevuta"}. Il documento con valore fiscale è il file XML${emessa ? " trasmesso allo SDI" : " originale, conservato in Edilizia in Cloud"}.</div>
</body></html>`;

  return { html, titolo, allegatiPdf: allegatiPdfDaXml(xml, parser) };
}

/**
 * I PDF incorporati nell'XML (elemento Allegati): molti fornitori ci mettono la
 * loro fattura «da guardare». Si riconosce dal formato dichiarato o dal nome, e
 * dall'intestazione %PDF del contenuto, così un allegato di altro tipo non si
 * apre come PDF.
 */
export function allegatiPdfDaXml(xml: string, parser: LettoreXml): AllegatoPdf[] {
  let doc;
  try {
    doc = parser.parseFromString(xml, "text/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];
  const trovati: AllegatoPdf[] = [];
  const corpi = doc.getElementsByTagName("FatturaElettronicaBody");
  const primoCorpo = corpi.length > 0 ? corpi[0] : null;
  if (!primoCorpo) return [];
  for (const a of Array.from(primoCorpo.getElementsByTagName("Allegati"))) {
    const nome = a.getElementsByTagName("NomeAttachment")[0]?.textContent?.trim() || "allegato.pdf";
    const formato = a.getElementsByTagName("FormatoAttachment")[0]?.textContent?.trim() || "";
    const base64 = (a.getElementsByTagName("Attachment")[0]?.textContent ?? "").replace(/\s+/g, "");
    if (!base64) continue;
    const dichiaratoPdf = /pdf/i.test(formato) || /\.pdf$/i.test(nome);
    // %PDF in base64 comincia con «JVBER».
    if (dichiaratoPdf && base64.startsWith("JVBER")) trovati.push({ nome, base64 });
  }
  return trovati;
}
