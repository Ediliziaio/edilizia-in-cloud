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

import { leggiFatturaPA, type ElementoXml, type LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";
import { leggiFatturaRicevuta, senzaPrefissi } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import { documentoFatturaXml } from './xmlLeggibile';
import { altriDatiRicevuta, campoRicevutaHtml, dettagliRigaRicevuta } from './dettagliRicevutaHtml';

const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const eur = (n: unknown, valuta = 'EUR'): string => {
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(Number(n) || 0); }
  catch { return `${num(n)} ${esc(valuta)}`; }
};

const num = (n: unknown): string =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(Number(n) || 0);

/** Le quantità e i prezzi dell'XML possono avere otto decimali: qui non si
 * arrotondano né si convertono in float prima di mostrarli. */
function decimaleOriginale(v: string, valuta?: string): string {
  if (!v) return '—';
  const m = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(v.trim());
  if (!m) return esc(v);
  const intero = m[2].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frazione = (m[3] ?? '').replace(/0+$/, '');
  const decimali = valuta ? frazione.padEnd(2, '0') : frazione;
  return esc(`${m[1]}${intero}${decimali ? `,${decimali}` : ''}${valuta ? `\u00a0${valuta === 'EUR' ? '€' : valuta}` : ''}`);
}

const dataIt = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

export const TIPI_DOCUMENTO: Record<string, string> = {
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

export interface AllegatoXml extends AllegatoPdf {
  formato: string;
  compressione: string;
  descrizione: string;
}

export interface FatturaRicevutaVista {
  html: string;
  /** I PDF che il fornitore ha incorporato nell'XML, se ci sono. */
  allegatiPdf: AllegatoPdf[];
  /** Tutti gli allegati, anche CSV, fogli di calcolo e file compressi. */
  allegatiFile?: AllegatoXml[];
  /** Nome suggerito per il file PDF. */
  titolo: string;
}

/**
 * Pagina HTML (A4, self-contained) della fattura ricevuta. Ritorna null se l'XML
 * non è una fattura leggibile. `parser` è il DOMParser del browser (o di jsdom nei test).
 */
export function fatturaRicevutaHtml(
  xml: string,
  parser: DOMParser,
  opzioni: { emessa?: boolean; indiceCorpo?: number } = {},
): FatturaRicevutaVista | null {
  const indiceCorpo = opzioni.indiceCorpo ?? 0;
  if (!Number.isInteger(indiceCorpo) || indiceCorpo < 0) return null;
  const pulito = senzaPrefissi(xml);
  const f = leggiFatturaRicevuta(pulito, parser, indiceCorpo);
  if (!f) return null;
  const extra = leggiFatturaPA(pulito, parser, indiceCorpo);
  const corpoXml = parser.parseFromString(pulito, "text/xml")?.getElementsByTagName("FatturaElettronicaBody")[indiceCorpo];
  const lineeXml = Array.from(corpoXml?.getElementsByTagName("DettaglioLinee") ?? []);
  const campo = (el: ElementoXml | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
  const divisa = campo(corpoXml?.getElementsByTagName('DatiGeneraliDocumento')[0], 'Divisa') || 'EUR';
  const moneta = (n: unknown) => eur(n, divisa);
  const completo = documentoFatturaXml(xml, parser, indiceCorpo) ?? documentoFatturaXml(pulito, parser, indiceCorpo);
  if (!completo) return null;
  // Le righe mantengono i propri dati aggiuntivi; tutto il resto, compresi i
  // campi non noti al gestionale, viene riportato nelle sezioni di dettaglio.
  const corpoCompleto = completo?.figli.find(f => f.tag === 'FatturaElettronicaBody');
  const righeComplete = corpoCompleto?.figli.find(f => f.tag === 'DatiBeniServizi')?.figli.filter(f => f.tag === 'DettaglioLinee') ?? [];
  const altri = completo ? altriDatiRicevuta(completo) : null;

  const tipo = TIPI_DOCUMENTO[f.tipo_documento] ?? `Documento ${f.tipo_documento}`;
  // Alcuni fornitori scrivono già «(PN)» nel comune: non si ripete.
  const provincia = f.cedente_provincia && !f.cedente_comune.toUpperCase().includes(`(${f.cedente_provincia.toUpperCase()})`)
    ? `(${f.cedente_provincia})` : "";
  const luogo = [f.cedente_cap, f.cedente_comune, provincia].filter(Boolean).join(" ");
  const nota = f.tipo_documento === "TD04" ? " — gli importi sono a credito" : "";

  const righe = f.righe.map((r, i) => {
    const natura = r.natura_iva ? ` (${esc(r.natura_iva)})` : "";
    const linea = lineeXml[i];
    // Questi dati restano associati alla loro riga: una fattura può riguardare
    // più mezzi e più DDT. Non si deducono targhe o unità dalle descrizioni.
    const dettagli = dettagliRigaRicevuta(righeComplete[i]);
    return `<tr>
      <td class="n">${esc(campo(linea, "NumeroLinea") || r.numero_linea)}</td>
      <td><div class="descrizione">${esc(r.descrizione)}</div>${dettagli ? `<div class="dettagli-riga">${dettagli}</div>` : ""}</td>
      <td class="um">${esc(campo(linea, "UnitaMisura")) || "—"}</td>
      <td class="d">${decimaleOriginale(campo(linea, 'Quantita'))}</td>
      <td class="d">${decimaleOriginale(campo(linea, 'PrezzoUnitario'), divisa)}</td>
      <td class="d">${esc(r.aliquota_iva)}%${natura}</td>
      <td class="d">${decimaleOriginale(campo(linea, 'PrezzoTotale'), divisa)}</td>
    </tr>`;
  }).join("");

  const riferimentiDdt = Array.from(corpoXml?.getElementsByTagName("DatiDDT") ?? []).map(d => {
    const linee = Array.from(d.getElementsByTagName("RiferimentoNumeroLinea")).map(l => l.textContent?.trim() ?? "").filter(Boolean);
    return `<tr><td>${esc(campo(d, "NumeroDDT")) || "—"}</td><td>${esc(dataIt(campo(d, "DataDDT")) || campo(d, "DataDDT")) || "—"}</td><td>${esc(linee.join(", ")) || "—"}</td></tr>`;
  }).join("");
  const ddt = riferimentiDdt ? `<div class="blocco"><h3>Documenti di trasporto</h3><table aria-label="DDT dichiarati nella fattura"><thead><tr><th>Numero DDT</th><th>Data</th><th>Righe della fattura</th></tr></thead><tbody>${riferimentiDdt}</tbody></table></div>` : "";

  const riepilogo = f.riepilogo_iva.map((r) => `<tr>
      <td>${esc(r.aliquota)}%${r.natura ? ` (${esc(r.natura)})` : ""}</td>
      <td class="d">${moneta(r.imponibile)}</td>
      <td class="d">${moneta(r.imposta)}</td>
    </tr>`).join("");

  const pagamento = extra && (extra.scadenza || extra.iban || extra.modalitaPagamento)
    ? `<div class="blocco"><h3>Pagamento</h3>
        ${extra.modalitaPagamento ? `<div>Modalità: ${esc(MODALITA_PAGAMENTO[extra.modalitaPagamento] ?? extra.modalitaPagamento)}</div>` : ""}
        ${extra.scadenza ? `<div>Scadenza: ${esc(dataIt(extra.scadenza))}</div>` : ""}
        ${extra.iban ? `<div>IBAN: <span class="mono">${esc(extra.iban)}</span></div>` : ""}
      </div>`
    : "";

  const bollo = extra && extra.bollo > 0 ? `<tr><td>Imposta di bollo</td><td class="d">${moneta(extra.bollo)}</td></tr>` : "";
  const lotto = f.fatture_nel_file > 1
    ? `<p class="avviso">Il file contiene ${f.fatture_nel_file} fatture: qui è mostrata la ${indiceCorpo + 1}ª.</p>` : "";

  const causali = corpoXml ? Array.from(corpoXml.getElementsByTagName("Causale")).map(c => c.textContent?.trim() ?? "").filter(Boolean) : [];

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
  .um { white-space: nowrap; }
  .dettagli-riga { margin-top: 5px; font-size: 8.5pt; line-height: 1.45; color: #475569; overflow-wrap: anywhere; }
  .etichetta { font-weight: 500; }
  .descrizione { overflow-wrap: anywhere; white-space: pre-wrap; }
  .xml-completo { margin-top: 22px; font-size: 9pt; }
  .xml-completo h2 { font-size: 13pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
  .xml-gruppo { margin: 8px 0 8px 8px; padding-left: 8px; border-left: 1px solid #e2e8f0; }
  .xml-gruppo h4 { font-size: inherit; margin: 7px 0 4px; break-after: avoid; }
  .xml-campo { display: grid; grid-template-columns: minmax(100px, 32%) minmax(0, 1fr); gap: 8px; padding: 2px 0; break-inside: avoid; }
  .xml-campo dt { color: #64748b; }
  .xml-campo dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .xml-foglia, .dettagli-riga dl { margin: 0; }
  .xml-valore { white-space: pre-wrap; overflow-wrap: anywhere; }
  thead { display: table-header-group; }
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
  ${ddt}
  <table aria-label="Righe della fattura">
    <thead><tr><th>#</th><th>Descrizione</th><th>U.M.</th><th class="d">Q.tà</th><th class="d">Prezzo</th><th class="d">IVA</th><th class="d">Importo</th></tr></thead>
    <tbody>${righe}</tbody>
  </table>
  <div class="totali">
    <table>
      <thead><tr><th>IVA</th><th class="d">Imponibile</th><th class="d">Imposta</th></tr></thead>
      <tbody>${riepilogo}</tbody>
    </table>
    <table>
      <tbody>
        <tr><td>Imponibile</td><td class="d">${moneta(f.imponibile_totale)}</td></tr>
        <tr><td>IVA</td><td class="d">${moneta(f.iva_totale)}</td></tr>
        ${bollo}
        <tr class="totale"><td>Totale</td><td class="d">${moneta(f.totale_documento)}</td></tr>
      </tbody>
    </table>
  </div>
  ${pagamento}
  ${causali.length ? `<div class="blocco"><h3>Causale / annotazioni</h3>${causali.map(c => `<p>${esc(c)}</p>`).join("")}</div>` : ""}
  ${altri ? `<section class="xml-completo" aria-label="Dati completi del documento originale"><h2>Dati completi del documento originale</h2><p>Intestazione, riferimenti, pagamenti e altri dati presenti nell’XML. I dettagli delle singole voci sono riportati nelle rispettive righe.</p>${campoRicevutaHtml(altri)}</section>` : ''}
  <div class="pie">Rappresentazione leggibile della fattura elettronica${emessa ? "" : " ricevuta"}. Il documento con valore fiscale è il file XML${emessa ? " trasmesso allo SDI" : " originale, conservato in Edilizia in Cloud"}.</div>
</body></html>`;

  const allegatiFile = allegatiDalCorpo(corpoXml);
  return { html, titolo, allegatiPdf: pdfTraAllegati(allegatiFile), allegatiFile };
}

/**
 * I PDF incorporati nell'XML (elemento Allegati): molti fornitori ci mettono la
 * loro fattura «da guardare». Si riconosce dal formato dichiarato o dal nome, e
 * dall'intestazione %PDF del contenuto, così un allegato di altro tipo non si
 * apre come PDF.
 */
export function allegatiPdfDaXml(xml: string, parser: LettoreXml, indiceCorpo = 0): AllegatoPdf[] {
  return pdfTraAllegati(allegatiFatturaXml(xml, parser, indiceCorpo));
}

const pdfTraAllegati = (allegati: AllegatoXml[]): AllegatoPdf[] => allegati.filter(a => !a.compressione && (/pdf/i.test(a.formato) || /\.pdf$/i.test(a.nome)) && a.base64.startsWith('JVBER')).map(({ nome, base64 }) => ({ nome, base64 }));

export function allegatiFatturaXml(xml: string, parser: LettoreXml, indiceCorpo = 0): AllegatoXml[] {
  let doc;
  try {
    doc = parser.parseFromString(senzaPrefissi(xml), "text/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];
  const corpi = doc.getElementsByTagName("FatturaElettronicaBody");
  return allegatiDalCorpo(corpi[indiceCorpo]);
}

function allegatiDalCorpo(corpo: ElementoXml | undefined): AllegatoXml[] {
  if (!corpo) return [];
  const trovati: AllegatoXml[] = [];
  for (const a of Array.from(corpo.getElementsByTagName("Allegati"))) {
    const formato = a.getElementsByTagName("FormatoAttachment")[0]?.textContent?.trim() || "";
    const nome = a.getElementsByTagName("NomeAttachment")[0]?.textContent?.trim() || `allegato.${/^[a-z0-9]{1,8}$/i.test(formato) ? formato.toLowerCase() : 'bin'}`;
    const base64 = (a.getElementsByTagName("Attachment")[0]?.textContent ?? "").replace(/\s+/g, "");
    if (!base64) continue;
    trovati.push({ nome, base64, formato, compressione: a.getElementsByTagName('AlgoritmoCompressione')[0]?.textContent?.trim() ?? '', descrizione: a.getElementsByTagName('DescrizioneAttachment')[0]?.textContent?.trim() ?? '' });
  }
  return trovati;
}
