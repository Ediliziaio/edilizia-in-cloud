/**
 * La copia di cortesia di un documento fiscale come pagina HTML A4, pronta per
 * la stampa nativa del browser (generatePDF.ts → «Salva PDF», «Stampa», «Apri PDF»).
 *
 * L'aspetto (colori, misure, voci dei totali) sta in _shared/documentoFiscaleVista.ts
 * e lo condivide l'anteprima nell'app (PreviewFattura). Qui c'è il contenuto:
 * chi emette, chi riceve, le righe, l'IVA, i totali, il pagamento e le diciture
 * fiscali. La pagina ha margine di stampa zero, così il browser non aggiunge
 * data, titolo, indirizzo e numero di pagina (vedi CSS_PAGINA_STAMPA).
 */

import { RIFERIMENTO_NORMATIVO, naturaToXml } from "../_shared/generateXML.ts";
import { iscrizioneRea } from "../_shared/datiSocietari.ts";
import { nativePdfSnapshot } from "../_shared/nativePdfSnapshot.ts";
import {
  CSS_PAGINA_STAMPA,
  cssFoglio,
  dataBreve,
  etichettaTipoDocumento,
  euro,
  euroConSegno,
  formaGiuridicaDaMostrare,
  ibanLeggibile,
  importoInEvidenza,
  importoRiga,
  indirizzoInRiga,
  nomeDestinatario,
  nomeModalitaPagamento,
  quantitaLeggibile,
  temaFattura,
  vociTotali,
} from "../_shared/documentoFiscaleVista.ts";

/** Documenti che vanno allo SDI: il PDF ne è solo la copia di cortesia. */
export const TIPI_FISCALI = ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa"];

/**
 * Le clausole scritte in Causale (bonifico parlante, IVA agevolata, garanzia,
 * tracciabilità…): fino al 31/10/2026 andavano solo nell'XML e la copia di
 * cortesia, l'unica che il cliente legge, non le mostrava. Restano fuori le
 * diciture che «Note fiscali» scrive già (scissione, IVA per cassa).
 */
export function clausoleDocumento(doc: Record<string, any>): string[] {
  const causali: unknown[] = Array.isArray(doc.causale) ? doc.causale : [];
  const viste = new Set<string>();
  const out: string[] = [];
  for (const c of causali) {
    const testo = String(c ?? "").trim();
    if (!testo || viste.has(testo)) continue;
    if (/17-ter|scissione dei pagamenti|32-bis/i.test(testo)) continue;
    viste.add(testo);
    out.push(testo);
  }
  return out;
}

/**
 * Le diciture fiscali della fattura, le stesse che l'XML porta in Causale e in
 * RiferimentoNormativo (24/09/2026). Il PDF è l'unico documento che un privato
 * legge: prima mostrava «0% (N6_3)» e nessuna norma.
 */
export function noteFiscali(doc: Record<string, any>): string[] {
  const note: string[] = [];
  const riepilogo: Array<Record<string, any>> = doc.riepilogo_iva || [];
  const viste = new Set<string>();
  for (const r of riepilogo) {
    if (!r.natura) continue;
    const natura = naturaToXml(String(r.natura));
    const norma = String(r.riferimento_normativo || RIFERIMENTO_NORMATIVO[natura] || "").trim();
    const testo = `${natura}${norma ? ` — ${norma}` : ""}`;
    if (!viste.has(testo)) {
      viste.add(testo);
      note.push(testo);
    }
  }
  if (riepilogo.some((r) => r.esigibilita === "D") || doc.esigibilita_iva === "D") {
    note.push("Operazione con IVA per cassa ai sensi dell'art. 32-bis del D.L. 22 giugno 2012, n. 83");
  }
  if (riepilogo.some((r) => r.esigibilita === "S") || doc.esigibilita_iva === "S") {
    note.push("Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72: l'IVA è versata dal cliente all'Erario");
  }
  return note;
}

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Le righe non vuote, separate da un a capo. */
const righeDi = (...righe: Array<string | false | null | undefined>) => righe.filter(Boolean).join("<br>");

/** «0% (N6.3)», «22%». */
function aliquota(valore: unknown, natura: unknown): string {
  return `${esc(valore)}%${natura ? ` (${esc(naturaToXml(String(natura)))})` : ""}`;
}

interface OpzioniDocumento {
  /** «Documento generato da …» in fondo al foglio (il nome della piattaforma, anche white label). */
  brandFooter?: string;
}

export function documentoHtml(documento: Record<string, any>, azienda: Record<string, any>, opzioni: OpzioniDocumento = {}): string {
  // Le chiavi dei documenti più vecchi (totale, iva, aliquota_iva) si leggono senza riscrivere nulla.
  const doc = nativePdfSnapshot(documento);
  const righe: Array<Record<string, any>> = doc.righe || [];
  const riepilogo: Array<Record<string, any>> = doc.riepilogo_iva || [];
  const snap: Record<string, any> = doc.cliente_snapshot || {};
  const scadenze: Array<Record<string, any>> = Array.isArray(doc.scadenze_pagamento) ? doc.scadenze_pagamento : [];
  const tema = temaFattura(azienda.colore_primario);
  const etichetta = etichettaTipoDocumento(doc.tipo);
  const conSconto = righe.some((r) => (Number(r.sconto_percentuale) || 0) > 0);
  const fiscale = TIPI_FISCALI.includes(doc.tipo);
  const note = fiscale ? noteFiscali(doc) : [];
  const clausole = clausoleDocumento(doc);
  const privato = !String(snap.partita_iva ?? "").trim();
  const numero = String(doc.numero ?? "").trim();

  // ── Chi emette ──
  // Registro imprese (art. 2250 c.c.): vale per atti e corrispondenza, quindi
  // anche per la copia che riceve il cliente.
  const rea = iscrizioneRea(azienda);
  const reaRiga = rea
    ? [
      `REA ${esc(rea.ufficio)}-${esc(rea.numero)}`,
      rea.capitale !== null ? `Capitale sociale versato ${euro(rea.capitale)}` : "",
      rea.socioUnico === "SU" ? "Socio unico" : "",
      rea.stato === "LS" ? "In liquidazione" : "",
    ].filter(Boolean).join(" · ")
    : "";
  const piva = String(azienda.partita_iva ?? "").trim();
  const cf = String(azienda.codice_fiscale ?? "").trim();
  const forma = formaGiuridicaDaMostrare(azienda.ragione_sociale, azienda.forma_giuridica);
  const datiEmittente = righeDi(
    esc(indirizzoInRiga(azienda)),
    [piva ? `P.IVA ${esc(piva)}` : "", cf && cf !== piva ? `C.F. ${esc(cf)}` : ""].filter(Boolean).join(" · "),
    reaRiga,
    [azienda.pec ? `PEC ${esc(azienda.pec)}` : "", azienda.telefono ? `Tel. ${esc(azienda.telefono)}` : ""].filter(Boolean).join(" · "),
    [esc(azienda.email), esc(azienda.sito_web)].filter(Boolean).join(" · "),
  );

  // ── Estremi (con la cifra in evidenza: quanto e entro quando) ──
  const evidenza = importoInEvidenza(doc);
  const estremo = (voce: string, valore: string, classe = "") =>
    `<div class="fd-voce${classe}">${voce}</div><div class="fd-valore${classe}">${valore}</div>`;
  const estremi = [
    estremo("Numero", esc(numero) || "BOZZA", " fd-numero"),
    estremo("Data", esc(dataBreve(doc.data_emissione))),
    doc.data_scadenza ? estremo("Scadenza", esc(dataBreve(doc.data_scadenza))) : "",
    estremo(esc(evidenza.etichetta), euro(evidenza.importo), " fd-evidenza"),
  ].join("");

  // ── Chi riceve ──
  const destinatario = nomeDestinatario(snap);
  const pivaCliente = String(snap.partita_iva ?? "").trim();
  const cfCliente = String(snap.codice_fiscale ?? "").trim();
  const datiCliente = righeDi(
    esc(indirizzoInRiga(snap)),
    [pivaCliente ? `P.IVA ${esc(pivaCliente)}` : "", cfCliente && cfCliente !== pivaCliente ? `C.F. ${esc(cfCliente)}` : ""].filter(Boolean).join(" · "),
    [snap.codice_sdi ? `Codice destinatario ${esc(snap.codice_sdi)}` : "", snap.pec ? `PEC ${esc(snap.pec)}` : ""].filter(Boolean).join(" · "),
  );
  const destinatarioHtml = destinatario
    ? `<div class="fd-riquadro fd-destinatario">
      <div class="fd-etichetta">Destinatario</div>
      <div class="fd-cliente">${esc(destinatario)}</div>
      ${datiCliente ? `<div class="fd-cliente-dati">${datiCliente}</div>` : ""}
    </div>`
    : "";

  const riferimenti = [doc.cig ? `CIG ${esc(doc.cig)}` : "", doc.cup ? `CUP ${esc(doc.cup)}` : ""].filter(Boolean).join(" · ");

  // ── Righe ──
  const righeHtml = righe.map((r, i) => `
      <tr>
        <td class="fd-n">${i + 1}</td>
        <td class="fd-descrizione">${esc(r.descrizione) || "—"}${r.codice_articolo ? `<div class="fd-sotto">Cod. ${esc(r.codice_articolo)}</div>` : ""}${r.note_riga ? `<div class="fd-sotto fd-sotto-nota">${esc(r.note_riga)}</div>` : ""}</td>
        <td class="fd-d">${esc(quantitaLeggibile(r.quantita))}</td>
        <td class="fd-c">${esc(r.unita_misura)}</td>
        <td class="fd-d">${euro(r.prezzo_unitario)}</td>
        ${conSconto ? `<td class="fd-d">${Number(r.sconto_percentuale) > 0 ? `${esc(quantitaLeggibile(r.sconto_percentuale))}%` : ""}</td>` : ""}
        <td class="fd-c">${aliquota(r.aliquota_iva, r.natura_iva)}</td>
        <td class="fd-d fd-importo">${euro(importoRiga(r))}</td>
      </tr>`).join("");

  const tabellaRighe = righe.length > 0
    ? `<table class="fd-voci">
    <thead><tr>
      <th class="fd-n">#</th><th>Descrizione</th><th class="fd-d">Q.tà</th><th class="fd-c">U.M.</th><th class="fd-d">Prezzo</th>
      ${conSconto ? '<th class="fd-d">Sc.%</th>' : ""}<th class="fd-c">IVA</th><th class="fd-d">Importo</th>
    </tr></thead>
    <tbody>${righeHtml}</tbody>
  </table>`
    : "";

  // ── Riepilogo IVA e totali ──
  const riepilogoHtml = riepilogo.length > 0
    ? `<div class="fd-riepilogo">
      <table>
        <thead><tr><th>Aliquota IVA</th><th class="fd-d">Imponibile</th><th class="fd-d">Imposta</th></tr></thead>
        <tbody>${riepilogo.map((r) => `<tr><td>${aliquota(r.aliquota, r.natura)}</td><td class="fd-d">${euro(r.imponibile)}</td><td class="fd-d">${euro(r.imposta)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`
    : "";

  const totaliHtml = vociTotali(doc).map((v) => {
    const importo = euroConSegno(v.importo);
    const riga = `<tr${v.tipo ? ` class="fd-${v.tipo}"` : ""}><td>${esc(v.voce)}</td><td class="fd-d">${importo}</td></tr>`;
    return v.tipo === "finale" ? `<tr class="fd-stacco"><td colspan="2"></td></tr>${riga}` : riga;
  }).join("");

  // ── Pagamento e note ──
  const rateHtml = scadenze.length > 0
    ? `<table class="fd-rate">
        <thead><tr><th>Rata</th><th>Scadenza</th><th class="fd-d">Importo</th></tr></thead>
        <tbody>${scadenze.map((sc) => `<tr><td>${esc(sc.numero_rata)}${sc.pagato ? " · pagata" : ""}</td><td>${esc(dataBreve(sc.data_scadenza))}</td><td class="fd-d">${euro(sc.importo)}</td></tr>`).join("")}</tbody>
      </table>`
    : "";
  const pagamentoHtml = doc.metodo_pagamento_codice
    ? `<div class="fd-riquadro">
      <div class="fd-etichetta">Pagamento</div>
      <div class="fd-metodo">${esc(nomeModalitaPagamento(doc.metodo_pagamento_codice, doc.metodo_pagamento_nome))}</div>
      ${doc.iban_pagamento ? `<div>IBAN <span class="fd-iban">${esc(ibanLeggibile(doc.iban_pagamento))}</span></div>` : ""}
      ${doc.intestatario_conto ? `<div>Intestatario: ${esc(doc.intestatario_conto)}</div>` : ""}
      ${doc.nome_banca ? `<div>Banca: ${esc(doc.nome_banca)}</div>` : ""}
      ${doc.bic_pagamento ? `<div>BIC: ${esc(doc.bic_pagamento)}</div>` : ""}
      ${rateHtml}
    </div>`
    : "";
  const noteHtml = doc.note_documento
    ? `<div class="fd-riquadro">
      <div class="fd-etichetta">Note</div>
      <div class="fd-testo">${esc(doc.note_documento)}</div>
    </div>`
    : "";

  const titolo = `${etichetta.charAt(0)}${etichetta.slice(1).toLowerCase()} ${numero}`.trim();

  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<title>${esc(titolo)}</title>
<style>${CSS_PAGINA_STAMPA}${cssFoglio(tema)}</style>
</head><body>
<div class="fd-foglio">
  <div class="fd-testata">
    <div class="fd-emittente">
      ${azienda.logo_url ? `<img class="fd-logo" src="${esc(azienda.logo_url)}" alt="">` : ""}
      <div class="fd-ragione">${esc(azienda.ragione_sociale)}</div>
      ${forma ? `<div class="fd-forma">${esc(forma)}</div>` : ""}
      ${datiEmittente ? `<div class="fd-dati">${datiEmittente}</div>` : ""}
    </div>
    <div class="fd-documento">
      <div class="fd-tipo">${esc(etichetta)}</div>
      <div class="fd-estremi">${estremi}</div>
      ${destinatarioHtml}
    </div>
  </div>
  <div class="fd-filetto"></div>

  ${riferimenti ? `<div class="fd-riferimenti">${riferimenti}</div>` : ""}

  ${tabellaRighe}

  <div class="fd-conti">
    ${riepilogoHtml}
    <div class="fd-totali"><table><tbody>${totaliHtml}</tbody></table></div>
  </div>

  ${pagamentoHtml || noteHtml ? `<div class="fd-info">${pagamentoHtml}${noteHtml}</div>` : ""}

  ${azienda.regime_fiscale === "RF19" ? `<div class="fd-forfettario">Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, L. n. 190/2014. Non soggetta a ritenuta d'acconto ai sensi del comma 67, L. n. 190/2014.</div>` : ""}

  ${clausole.length > 0 ? `<div class="fd-avvertenze fd-clausole"><div class="fd-etichetta">Clausole</div>${clausole.map((t) => `<div>${esc(t)}</div>`).join("")}</div>` : ""}

  ${note.length > 0 ? `<div class="fd-avvertenze"><div class="fd-etichetta">Note fiscali</div>${note.map((t) => `<div>${esc(t)}</div>`).join("")}</div>` : ""}

  ${fiscale ? `<div class="fd-cortesia">Copia di cortesia. La fattura con valore fiscale è il file XML trasmesso al Sistema di Interscambio (SdI).${privato ? " L'originale è disponibile nella tua area riservata del sito dell'Agenzia delle Entrate (Fatture e Corrispettivi)." : ""}</div>` : ""}

  <div class="fd-piede">
    <div>${esc(azienda.ragione_sociale)}${piva ? ` — P.IVA ${esc(piva)}` : ""}</div>
    <div>${esc(opzioni.brandFooter || "Documento generato da Edilizia in Cloud")}</div>
  </div>
</div>
</body></html>`;
}
