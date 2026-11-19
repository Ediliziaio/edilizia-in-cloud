/** Un solo modello XML per le copie leggibili, emesse e ricevute. Nessun ricalcolo. */
export interface CampoXml { campo: string; valore: string }
export interface RigaXmlStampabile {
  numero: string; descrizione: string; quantita: string; prezzoUnitario: string;
  unitaMisura: string; importo: string; iva: string; dettagli: CampoXml[];
}
export interface TabellaXml {
  titolo: string; intestazioni: string[]; righe: string[][]; larghezze?: Array<number | '*'>;
  numeriche?: number[]; ariaLabel?: string; tipo?: 'righe' | 'riferimenti' | 'totale' | 'altri';
  dettagliRighe?: CampoXml[][];
}
export interface FatturaXmlStampabile {
  titolo: string; numero: string; data: string; valuta: string; cedente: string[]; cliente: string[];
  tabelle: TabellaXml[]; causali: string[]; righeXml: RigaXmlStampabile[];
  riferimenti: TabellaXml[]; datiAggiuntivi: CampoXml[];
}
export interface OpzioniFatturaXml { indiceCorpo?: number; parser?: DOMParser }
const children = (e: Element | null, nome: string): Element[] => e ? Array.from(e.children).filter(x => x.localName === nome) : [];
const child = (e: Element | null, nome: string) => children(e, nome)[0] ?? null;
const testo = (e: Element | null) => e?.textContent?.trim() ?? '';
const data = (s: string) => s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssStringa = (s: string) => '"' + s.replace(/[\\<>"\p{Cc}]/gu, c => '\\' + c.codePointAt(0)!.toString(16) + ' ') + '"';

/** Anche otto decimali restano esatti, senza passare da Number. */
export function numeroXml(s: string, prezzo = false): string {
  if (!s) return '—';
  const m = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(s.trim());
  if (!m) return s;
  const intero = m[2].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let frazione = (m[3] ?? '').replace(/0+$/, '');
  if (prezzo) frazione = frazione.padEnd(2, '0');
  return m[1] + intero + (frazione ? ',' + frazione : '');
}
const TIPI: Record<string, string> = { TD01: 'fattura', TD02: 'acconto/anticipo su fattura', TD04: 'nota di credito', TD05: 'nota di debito', TD06: 'parcella', TD24: 'fattura differita' };
const MODALITA: Record<string, string> = { MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP12: 'Ri.Ba.', MP19: 'SEPA Direct Debit' };
const CORE_RIGA = new Set(['NumeroLinea', 'Descrizione', 'Quantita', 'PrezzoUnitario', 'PrezzoTotale', 'AliquotaIVA', 'Natura', 'UnitaMisura']);
const BINARI = new Set(['Attachment', 'SignatureValue', 'X509Certificate', 'X509CRL', 'Modulus']);
const lineaUguale = (a: string, b: string) => a.replace(/^0+(?=\d)/, '') === b.replace(/^0+(?=\d)/, '');

/** Valori non ancora rappresentati, compresi attributi e campi nuovi.
 * I contenuti binari restano nell'originale e nei download dedicati. */
function campiXml(e: Element, usati: Set<Element>, percorso: string[] = [], saltaRighe = false): CampoXml[] {
  if (saltaRighe && e.localName === 'DettaglioLinee') return [];
  const fratelli = e.parentElement ? Array.from(e.parentElement.children).filter(f => f.tagName === e.tagName) : [e];
  const nome = e.tagName + (fratelli.length > 1 ? ' [' + (fratelli.indexOf(e) + 1) + ']' : '');
  const path = [...percorso, nome];
  const campi = Array.from(e.attributes).map(a => ({ campo: path.join(' / ') + ' / @' + a.name, valore: a.value }));
  if (BINARI.has(e.localName)) {
    campi.push({ campo: path.join(' / '), valore: e.localName === 'Attachment' ? 'Contenuto disponibile nell’allegato e nel file originale.' : 'Contenuto della firma digitale conservato nel file originale.' });
    return campi;
  }
  const misto = Array.from(e.childNodes).filter(n => n.nodeType === 3 || n.nodeType === 4).map(n => n.textContent?.trim() ?? '').filter(Boolean).join('\n');
  if (e.localName === 'AltriDatiGestionali' && !e.attributes.length && !misto) {
    const tipo = child(e, 'TipoDato');
    const refs = Array.from(e.children).filter(f => ['RiferimentoTesto', 'RiferimentoNumero', 'RiferimentoData'].includes(f.localName));
    if (tipo && !tipo.attributes.length && !tipo.children.length && refs.length && refs.every(r => !r.attributes.length && !r.children.length)) {
      campi.push({ campo: testo(tipo) || 'Altri dati', valore: refs.map(r => r.localName === 'RiferimentoData' ? data(testo(r)) : testo(r)).join(' · ') || '—' });
      for (const f of Array.from(e.children).filter(f => f !== tipo && !refs.includes(f))) campi.push(...campiXml(f, usati, path));
      return campi;
    }
  }
  if (!e.children.length) {
    if (!usati.has(e)) campi.push({ campo: path.join(' / '), valore: data(testo(e)) || '—' });
  } else {
    if (misto) campi.push({ campo: path.join(' / ') + ' / Testo', valore: misto });
    for (const f of Array.from(e.children)) campi.push(...campiXml(f, usati, path, saltaRighe));
  }
  return campi;
}

export function leggiFattureXmlStampabili(xml: string, opzioni: OpzioniFatturaXml = {}): FatturaXmlStampabile[] {
  const d = (opzioni.parser ?? new DOMParser()).parseFromString(xml, 'application/xml');
  if (d.getElementsByTagNameNS('*', 'parsererror').length || d.documentElement?.localName !== 'FatturaElettronica') throw new Error('Il file non è un XML FatturaPA valido.');
  const header = child(d.documentElement, 'FatturaElettronicaHeader');
  const tutti = children(d.documentElement, 'FatturaElettronicaBody');
  if (!header || !tutti.length) throw new Error('Intestazione o corpo della fattura assenti nel file XML.');
  const indice = opzioni.indiceCorpo;
  if (indice !== undefined && (!Number.isInteger(indice) || indice < 0 || !tutti[indice])) throw new Error('Il corpo richiesto non è presente nel file XML.');
  const corpi = indice === undefined ? tutti : [tutti[indice]];
  return corpi.map(body => {
    const usati = new Set<Element>();
    const val = (e: Element | null, nome: string) => { const x = child(e, nome); if (x) usati.add(x); return testo(x); };
    const parte = (nome: string): string[] => {
      const p = child(header, nome), an = child(p, 'DatiAnagrafici'), anag = child(an, 'Anagrafica'), sede = child(p, 'Sede'), iva = child(an, 'IdFiscaleIVA');
      const denominazione = val(anag, 'Denominazione') || [val(anag, 'Nome'), val(anag, 'Cognome')].filter(Boolean).join(' ');
      const partita = [val(iva, 'IdPaese'), val(iva, 'IdCodice')].join('');
      const cf = val(an, 'CodiceFiscale'), regime = val(an, 'RegimeFiscale');
      const via = [val(sede, 'Indirizzo'), val(sede, 'NumeroCivico')].filter(Boolean).join(' ');
      const luogo = [val(sede, 'CAP'), val(sede, 'Comune'), val(sede, 'Provincia'), val(sede, 'Nazione')].filter(Boolean).join(' ');
      return [denominazione, partita ? 'Identificativo fiscale IVA: ' + partita : '', cf ? 'Codice fiscale: ' + cf : '', regime ? 'Regime fiscale: ' + regime : '', via, luogo].filter(Boolean);
    };
    const cedente = parte('CedentePrestatore'), cliente = parte('CessionarioCommittente');
    const generali = child(body, 'DatiGenerali'), doc = child(generali, 'DatiGeneraliDocumento');
    const tipo = val(doc, 'TipoDocumento'), n = val(doc, 'Numero'), divisa = val(doc, 'Divisa'), giorno = data(val(doc, 'Data'));
    const tabelle: TabellaXml[] = [{ titolo: '', intestazioni: ['Tipologia documento', 'Art. 73', 'Numero documento', 'Data documento', 'Codice destinatario'], righe: [[tipo + (TIPI[tipo] ? ' (' + TIPI[tipo] + ')' : ''), val(doc, 'Art73') || '—', n, giorno, val(child(header, 'DatiTrasmissione'), 'CodiceDestinatario') || '—']] }];
    const riferimenti: TabellaXml[] = [];
    const docPerRiga: Array<{ linee: string[]; campo: CampoXml }> = [];
    const tipiRiferimento = [['DatiOrdineAcquisto', 'Ordini di acquisto'], ['DatiContratto', 'Contratti'], ['DatiConvenzione', 'Convenzioni'], ['DatiRicezione', 'Ricezioni'], ['DatiFattureCollegate', 'Fatture collegate']] as const;
    for (const [tag, titolo] of tipiRiferimento) {
      const righe = children(generali, tag).map(e => {
        const numero = val(e, 'IdDocumento'), giorno = data(val(e, 'Data'));
        const linee = children(e, 'RiferimentoNumeroLinea').map(l => { usati.add(l); return testo(l); });
        if (linee.length) docPerRiga.push({ linee, campo: { campo: titolo, valore: [numero, giorno].filter(Boolean).join(' · ') } });
        return [numero, giorno, linee.join(', ') || '—', val(e, 'NumItem'), val(e, 'CodiceCommessaConvenzione'), val(e, 'CodiceCUP'), val(e, 'CodiceCIG')];
      });
      if (righe.length) riferimenti.push({ titolo, tipo: 'riferimenti', intestazioni: ['Documento', 'Data', 'Righe', 'Voce', 'Commessa / convenzione', 'CUP', 'CIG'], righe });
    }
    const ddt = children(generali, 'DatiDDT').map(e => {
      const numero = val(e, 'NumeroDDT'), giorno = data(val(e, 'DataDDT'));
      const linee = children(e, 'RiferimentoNumeroLinea').map(l => { usati.add(l); return testo(l); });
      if (linee.length) docPerRiga.push({ linee, campo: { campo: 'DDT', valore: [numero, giorno].filter(Boolean).join(' · ') } });
      return [numero || '—', giorno || '—', linee.join(', ') || '—'];
    });
    if (ddt.length) riferimenti.push({ titolo: 'Documenti di trasporto', tipo: 'riferimenti', ariaLabel: 'DDT dichiarati nella fattura', intestazioni: ['Numero DDT', 'Data', 'Righe della fattura'], righe: ddt });
    tabelle.push(...riferimenti);
    const beni = child(body, 'DatiBeniServizi');
    const righeXml: RigaXmlStampabile[] = [];
    const dettagliPdf: CampoXml[][] = [];
    const righe = children(beni, 'DettaglioLinee').map(r => {
      const linea = val(r, 'NumeroLinea');
      const codici = children(r, 'CodiceArticolo').map(c => [val(c, 'CodiceTipo'), val(c, 'CodiceValore')].filter(Boolean).join(': ')).join('\n');
      const sconti = children(r, 'ScontoMaggiorazione').map(c => { const tipo = val(c, 'Tipo'), p = val(c, 'Percentuale'), i = val(c, 'Importo'); return [tipo, p ? numeroXml(p) + '%' : '', i ? numeroXml(i, true) : ''].filter(Boolean).join(' '); }).join('\n');
      const aliquota = val(r, 'AliquotaIVA'), natura = val(r, 'Natura');
      const iva = aliquota ? numeroXml(aliquota) + '%' + (natura ? ' · ' + natura : '') : natura;
      const descrizione = val(r, 'Descrizione'), quantita = numeroXml(val(r, 'Quantita')), prezzoUnitario = numeroXml(val(r, 'PrezzoUnitario'), true), unitaMisura = val(r, 'UnitaMisura') || '—', importo = numeroXml(val(r, 'PrezzoTotale'), true);
      const collegati = docPerRiga.filter(d => d.linee.some(l => lineaUguale(l, linea))).map(d => d.campo);
      dettagliPdf.push([...campiXml(r, usati), ...collegati]);
      const soloColonne = new Set(Array.from(r.children).filter(e => CORE_RIGA.has(e.localName)));
      righeXml.push({ numero: linea, descrizione, quantita, prezzoUnitario, unitaMisura, importo, iva, dettagli: [...campiXml(r, soloColonne), ...collegati] });
      return [[linea, codici].filter(Boolean).join('\n'), descrizione, quantita, prezzoUnitario, unitaMisura, sconti, iva, importo];
    });
    tabelle.push({ titolo: 'Dettaglio righe', tipo: 'righe', ariaLabel: 'Righe della fattura', intestazioni: ['N./Cod. articolo', 'Descrizione', 'Quantità', 'Prezzo unitario (' + divisa + ')', 'UM', 'Sconto/magg.', '% IVA', 'Prezzo totale (' + divisa + ')'], righe, dettagliRighe: dettagliPdf, larghezze: [38, '*', 34, 48, 20, 42, 34, 51], numeriche: [2, 3, 7] });
    const iva = children(beni, 'DatiRiepilogo').map(r => {
      const es = val(r, 'EsigibilitaIVA'), aliquota = val(r, 'AliquotaIVA'), natura = val(r, 'Natura');
      return [[es ? ({ I: 'I (esigibilità immediata)', D: 'D (esigibilità differita)', S: 'S (scissione pagamenti)' }[es] ?? es) : '', val(r, 'RiferimentoNormativo'), natura].filter(Boolean).join(' · '), aliquota ? numeroXml(aliquota) + '%' : '', numeroXml(val(r, 'SpeseAccessorie'), true), numeroXml(val(r, 'Arrotondamento'), true), numeroXml(val(r, 'ImponibileImporto'), true), numeroXml(val(r, 'Imposta'), true)];
    });
    tabelle.push({ titolo: 'Riepilogo IVA e totali', intestazioni: ['Esigibilità IVA / riferimenti normativi', '% IVA', 'Spese accessorie', 'Arrotondamento', 'Totale imponibile', 'Totale imposta'], righe: iva, numeriche: [2, 3, 4, 5] });
    const totale = val(doc, 'ImportoTotaleDocumento'), arrotondamento = val(doc, 'Arrotondamento');
    tabelle.push({ titolo: '', tipo: 'totale', intestazioni: ['Valuta', 'Arrotondamento documento', 'Totale documento'], righe: [[divisa, numeroXml(arrotondamento, true), totale ? numeroXml(totale, true) : 'Non indicato nell’XML']], numeriche: [1, 2] });
    const rate = children(body, 'DatiPagamento').flatMap(p => {
      const condizioni = val(p, 'CondizioniPagamento');
      return children(p, 'DettaglioPagamento').map(r => {
        const modalita = val(r, 'ModalitaPagamento');
        return [condizioni, [modalita, MODALITA[modalita]].filter(Boolean).join(' '), val(r, 'Beneficiario'), val(r, 'IBAN'), val(r, 'IstitutoFinanziario'), data(val(r, 'DataScadenzaPagamento')), numeroXml(val(r, 'ImportoPagamento'), true)];
      });
    });
    if (rate.length) tabelle.push({ titolo: 'Dati di pagamento', intestazioni: ['Condizioni', 'Modalità', 'Beneficiario', 'IBAN', 'Istituto', 'Data scadenza', 'Importo'], righe: rate, larghezze: [38, 60, '*', 130, '*', 55, 48], numeriche: [6] });
    const causali = children(doc, 'Causale').map(e => { usati.add(e); return testo(e); }).filter(Boolean);
    if (causali.length) tabelle.push({ titolo: 'Causale / annotazioni del documento', intestazioni: ['Causale'], righe: causali.map(c => [c]) });
    const datiAggiuntivi = Array.from(d.documentElement.attributes).map(a => ({ campo: d.documentElement.tagName + ' / @' + a.name, valore: a.value }));
    datiAggiuntivi.push(...campiXml(header, usati), ...campiXml(body, usati, [], true));
    for (const altro of Array.from(d.documentElement.children).filter(e => e !== header && !tutti.includes(e))) datiAggiuntivi.push(...campiXml(altro, usati));
    if (datiAggiuntivi.length) tabelle.push({ titolo: 'Altri dati presenti nel file XML', tipo: 'altri', intestazioni: ['Campo', 'Valore'], righe: datiAggiuntivi.map(c => [c.campo, c.valore]), larghezze: ['*', '*'] });
    return { titolo: 'Fattura elettronica ' + (n || tipo), numero: n, data: giorno, valuta: divisa, cedente, cliente, tabelle, causali, righeXml, riferimenti, datiAggiuntivi };
  });
}

export function riferimentiRigaXml(fattura: FatturaXmlStampabile | null, chiave: string): RigaXmlStampabile | undefined {
  const righe = fattura?.righeXml.filter(r => lineaUguale(r.numero, chiave)) ?? [];
  return righe.length === 1 ? righe[0] : undefined;
}

export function fatturaXmlTabellareHtml(xml: string, opzioni: OpzioniFatturaXml = {}): { html: string; titolo: string } {
  const fatture = leggiFattureXmlStampabili(xml, opzioni);
  const parti = (label: string, righe: string[]) => '<td><b>' + esc(label) + '</b><div>' + righe.map(esc).join('<br>') + '</div></td>';
  const corpo = fatture.map(f => '<section><table class="parti"><tbody><tr>' + parti('Cedente/prestatore (fornitore)', f.cedente) + parti('Cessionario/committente (cliente)', f.cliente) + '</tr></tbody></table>' + f.tabelle.map(t =>
    (t.titolo ? '<h2>' + esc(t.titolo) + '</h2>' : '') + '<table' + (t.ariaLabel ? ' aria-label="' + esc(t.ariaLabel) + '"' : '') + (t.tipo ? ' class="' + t.tipo + '"' : '') + '>' +
    (t.larghezze ? '<colgroup>' + t.larghezze.map(w => '<col' + (typeof w === 'number' ? ' style="width:' + w + 'pt"' : '') + '>').join('') + '</colgroup>' : '') +
    '<thead><tr>' + t.intestazioni.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    t.righe.map((r, ri) => '<tr>' + r.map((v, i) => '<td' + (t.numeriche?.includes(i) ? ' class="n"' : '') + '>' + esc(v) +
      (i === 1 && t.dettagliRighe?.[ri]?.length ? '<div class="dettagli-riga">' + t.dettagliRighe[ri].map(c => '<div><span>' + esc(c.campo) + ':</span> ' + esc(c.valore) + '</div>').join('') + '</div>' : '') + '</td>').join('') + '</tr>').join('') + '</tbody></table>').join('') + '<p class="footer">Rappresentazione leggibile del file XML. I dati riportati provengono esclusivamente dall’XML.</p></section>').join('');
  const ref = fatture.length === 1 ? 'Documento n. ' + fatture[0].numero + ' · ' + fatture[0].data : 'File XML';
  const stile = '@page{size:A4;margin:24pt 24pt 32pt;@bottom-left{content:' + cssStringa(ref) + ';font:6.5pt Arial;color:#555}@bottom-right{content:"Pagina " counter(page) " di " counter(pages);font:6.5pt Arial;color:#555}}' +
    '*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:8pt;color:#111;margin:0;padding:24pt}section+section{break-before:page}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 8px}th,td{border:1px solid #777;padding:4px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}tr{break-inside:avoid}th{background:#e9e9e9;font-size:7pt;font-weight:normal}thead{display:table-header-group}h2{font-size:8pt;text-transform:uppercase;margin:10px 0 3px;break-after:avoid}.parti td{width:50%}.parti b{display:block;margin-bottom:4px}.n{text-align:right}.dettagli-riga{margin-top:4px;font-size:7pt;color:#475569}.dettagli-riga span{font-weight:500}.footer{font-size:6.5pt;color:#555}@media print{body{padding:0}}';
  return { titolo: fatture[0].titolo, html: '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc(fatture[0].titolo) + '</title><style>' + stile + '</style></head><body>' + corpo + '</body></html>' };
}

export function definizionePdfFatturaXml(fatture: FatturaXmlStampabile[]): Record<string, unknown> {
  const layout = { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#777777', vLineColor: () => '#777777', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4 };
  // Le colonne "*" di pdfmake adottano la larghezza della parola più lunga:
  // un CUP o una commessa senza spazi poteva spingere le ultime colonne fuori A4.
  // Assegnando larghezze effettive il testo va a capo anche dentro quei codici.
  const larghezze = (colonne: Array<number | '*'>): number[] => {
    const spazio = 595.28 - 48 - colonne.length * 8 - (colonne.length + 1) * 0.4;
    const fisse = colonne.reduce<number>((tot, w) => tot + (typeof w === 'number' ? w : 0), 0);
    const flessibili = colonne.filter(w => w === '*').length;
    return colonne.map(w => typeof w === 'number' ? w : (spazio - fisse) / flessibili);
  };
  const content: Record<string, unknown>[] = [];
  for (const [indice, f] of fatture.entries()) {
    content.push({ pageBreak: indice ? 'before' : undefined, table: { widths: larghezze(['*', '*']), body: [[{ stack: [{ text: 'Cedente/prestatore (fornitore)', bold: true }, ...f.cedente] }, { stack: [{ text: 'Cessionario/committente (cliente)', bold: true }, ...f.cliente] }]] }, layout, margin: [0, 0, 0, 8] });
    for (const t of f.tabelle) {
      if (t.titolo) content.push({ text: t.titolo.toUpperCase(), bold: true, fontSize: 8, margin: [0, 6, 0, 3], headlineLevel: 1 });
      const colonne = larghezze(t.larghezze ?? t.intestazioni.map(() => '*'));
      // Una singola voce può superare A4. In quel caso deve proseguire nella
      // pagina successiva: non va tenuta in un blocco indivisibile con l’header.
      const brevi = t.righe.every((r, ri) => r.every((v, i) => {
        const extra = i === 1 ? t.dettagliRighe?.[ri]?.map(c => c.campo + ': ' + c.valore).join('\n') : '';
        const righeStimate = (v + (extra ? '\n' + extra : '')).split('\n').reduce((n, s) => n + Math.max(1, Math.ceil(s.length * 7.5 / colonne[i])), 0);
        return righeStimate < 55;
      }));
      content.push({ table: { headerRows: 1, keepWithHeaderRows: brevi ? 1 : 0, dontBreakRows: brevi, widths: colonne, body: [t.intestazioni.map(text => ({ text, fillColor: '#e9e9e9', fontSize: 7 })), ...t.righe.map((r, ri) => r.map((text, i) => {
        const dettagli = i === 1 ? t.dettagliRighe?.[ri] : undefined;
        return dettagli?.length ? { stack: [{ text }, { text: dettagli.map(c => c.campo + ': ' + c.valore).join('\n'), fontSize: 7, color: '#475569', margin: [0, 3, 0, 0] }] } : { text, alignment: t.numeriche?.includes(i) ? 'right' : 'left' };
      }))] }, layout, margin: [0, 0, 0, 7] });
    }
  }
  const ref = fatture.length === 1 ? 'Documento n. ' + fatture[0].numero + ' · ' + fatture[0].data + ' · ' : '';
  return {
    pageSize: 'A4', pageMargins: [24, 24, 24, 32], defaultStyle: { font: 'Roboto', fontSize: 7.5 }, content,
    info: { title: fatture[0]?.titolo ?? 'Fattura elettronica', subject: 'Rappresentazione del file XML' },
    footer: (pagina: number, totale: number) => ({ text: ref + 'Rappresentazione leggibile del file XML · Pagina ' + pagina + ' di ' + totale, fontSize: 6.5, color: '#555555', alignment: 'right', margin: [24, 8, 24, 0] }),
    pageBreakBefore: (nodo: { headlineLevel?: number }, contesto: { getFollowingNodesOnPage: () => unknown[] }) => nodo.headlineLevel === 1 && contesto.getFollowingNodesOnPage().length === 0,
  };
}

export async function generaPdfFatturaXml(xml: string, opzioni: OpzioniFatturaXml = {}): Promise<Uint8Array> {
  const fatture = leggiFattureXmlStampabili(xml, opzioni);
  const [m, f] = await Promise.all([import('pdfmake/build/pdfmake.min.js'), import('pdfmake/build/vfs_fonts.js')]);
  m.default.addVirtualFileSystem(f.default);
  return m.default.createPdf(definizionePdfFatturaXml(fatture) as never).getBuffer();
}
