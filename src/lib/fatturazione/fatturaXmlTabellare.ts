import { METODI_PAGAMENTO_SDI, TIPI_DOCUMENTO_FATTURAPA } from '@/types/fatturazione';
import { ETICHETTE_XML } from './xmlLeggibile';
import { stileFatturaXml } from './fatturaXmlDocumentoStile';

/** Un solo modello XML per le copie leggibili, emesse e ricevute. Nessun ricalcolo. */
export interface CampoXml { campo: string; valore: string }
export interface RigaXmlStampabile {
  numero: string; descrizione: string; quantita: string; prezzoUnitario: string;
  unitaMisura: string; importo: string; iva: string; dettagli: CampoXml[]; targhe?: string[];
}
export interface TabellaXml {
  titolo: string; intestazioni: string[]; righe: string[][]; larghezze?: Array<number | '*'>;
  numeriche?: number[]; ariaLabel?: string; tipo?: 'righe' | 'riferimenti' | 'totale' | 'pagamenti' | 'altri';
  dettagliRighe?: CampoXml[][];
}
export interface FatturaXmlStampabile {
  titolo: string; tipoDocumento: string; numero: string; data: string; valuta: string; cedente: string[]; cliente: string[];
  tabelle: TabellaXml[]; causali: string[]; righeXml: RigaXmlStampabile[];
  riferimenti: TabellaXml[]; datiAggiuntivi: CampoXml[];
}
export interface OpzioniFatturaXml { indiceCorpo?: number; parser?: DOMParser; direzione?: 'ricevuta' | 'emessa'; dentroIframe?: boolean }
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
const TIPI: Record<string, string> = { ...TIPI_DOCUMENTO_FATTURAPA, TD24: 'Fattura differita', TD25: 'Fattura differita (triangolari)' };
const MODALITA: Record<string, string> = { ...METODI_PAGAMENTO_SDI, MP12: 'Ri.Ba.' };
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
    const tabelle: TabellaXml[] = [{ titolo: '', intestazioni: ['Tipologia documento', 'Art. 73', 'Numero documento', 'Data documento', 'Codice destinatario'], righe: [[tipo + (TIPI[tipo] ? ' (' + TIPI[tipo].toLocaleLowerCase('it-IT') + ')' : ''), val(doc, 'Art73') || '—', n, giorno, val(child(header, 'DatiTrasmissione'), 'CodiceDestinatario') || '—']] }];
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
      if (righe.length) riferimenti.push({ titolo, tipo: 'riferimenti', intestazioni: ['Documento', 'Data', 'Righe', 'Voce', 'Commessa / convenzione', 'CUP', 'CIG'], righe, larghezze: [72, 52, 38, 30, '*', 96, 65] });
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
    const dettagliRighe: CampoXml[][] = [];
    const righe = children(beni, 'DettaglioLinee').map(r => {
      const linea = val(r, 'NumeroLinea');
      const codici = children(r, 'CodiceArticolo').flatMap(c => {
        const tipo = val(c, 'CodiceTipo');
        const valore = val(c, 'CodiceValore');
        if (!tipo && !valore) return [];
        return [{ campo: tipo && valore ? 'Codice ' + tipo : 'Codice articolo', valore: valore || tipo }];
      });
      const sconti = children(r, 'ScontoMaggiorazione').map(c => { const tipo = val(c, 'Tipo'), p = val(c, 'Percentuale'), i = val(c, 'Importo'); return [tipo, p ? numeroXml(p) + '%' : '', i ? numeroXml(i, true) : ''].filter(Boolean).join(' '); }).join('\n');
      const aliquota = val(r, 'AliquotaIVA'), natura = val(r, 'Natura');
      const iva = aliquota ? numeroXml(aliquota) + '%' + (natura ? ' · ' + natura : '') : natura;
      const descrizione = val(r, 'Descrizione'), quantita = numeroXml(val(r, 'Quantita')), prezzoUnitario = numeroXml(val(r, 'PrezzoUnitario'), true), unitaMisura = val(r, 'UnitaMisura') || '—', importo = numeroXml(val(r, 'PrezzoTotale'), true);
      const collegati = docPerRiga.filter(d => d.linee.some(l => lineaUguale(l, linea))).map(d => d.campo);
      dettagliRighe.push([...codici, ...campiXml(r, usati), ...collegati]);
      const soloColonne = new Set(Array.from(r.children).filter(e => CORE_RIGA.has(e.localName)));
      const targhe = children(r, 'AltriDatiGestionali').flatMap(dato => {
        const tipo = testo(child(dato, 'TipoDato')).toUpperCase().replace(/[^A-Z]/g, '');
        const targa = testo(child(dato, 'RiferimentoTesto')).toUpperCase().replace(/[\s-]+/g, '');
        return ['TARGA', 'TARGAVEICOLO', 'TARGAMEZZO'].includes(tipo) && /^[A-Z0-9]{6,10}$/.test(targa) ? [targa] : [];
      });
      righeXml.push({ targhe, numero: linea, descrizione, quantita, prezzoUnitario, unitaMisura, importo, iva, dettagli: [...campiXml(r, soloColonne), ...collegati] });
      const quantitaConUnita = unitaMisura === '—' ? quantita : quantita + ' ' + unitaMisura;
      return [linea, descrizione, quantitaConUnita, prezzoUnitario, iva, importo, sconti];
    });
    const conSconti = righe.some(riga => riga[6]);
    tabelle.push({
      titolo: 'Dettaglio righe', tipo: 'righe', ariaLabel: 'Righe della fattura',
      intestazioni: ['Riga', 'Descrizione', 'Quantità', 'Prezzo unitario (' + divisa + ')', 'IVA', 'Importo (' + divisa + ')', ...(conSconti ? ['Sconto / magg.'] : [])],
      righe: conSconti ? righe : righe.map(riga => riga.slice(0, 6)),
      dettagliRighe, larghezze: [33, '*', 61, 67, 42, 65, ...(conSconti ? [61] : [])], numeriche: [2, 3, 5],
    });
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
        return [[modalita, MODALITA[modalita]].filter(Boolean).join(' '), data(val(r, 'DataScadenzaPagamento')), numeroXml(val(r, 'ImportoPagamento'), true), condizioni, val(r, 'Beneficiario'), val(r, 'IBAN'), val(r, 'IstitutoFinanziario')];
      });
    });
    if (rate.length) tabelle.push({ titolo: 'Dati di pagamento', tipo: 'pagamenti', intestazioni: ['Modalità', 'Scadenza', 'Importo', 'Condizioni', 'Beneficiario', 'IBAN', 'Istituto'], righe: rate, larghezze: [68, 56, 53, 45, '*', 116, '*'], numeriche: [2] });
    const causali = children(doc, 'Causale').map(e => { usati.add(e); return testo(e); }).filter(Boolean);
    if (causali.length) tabelle.push({ titolo: 'Causale / annotazioni del documento', intestazioni: ['Causale'], righe: causali.map(c => [c]) });
    const datiAggiuntivi = Array.from(d.documentElement.attributes).map(a => ({ campo: d.documentElement.tagName + ' / @' + a.name, valore: a.value }));
    datiAggiuntivi.push(...campiXml(header, usati), ...campiXml(body, usati, [], true));
    for (const altro of Array.from(d.documentElement.children).filter(e => e !== header && !tutti.includes(e))) datiAggiuntivi.push(...campiXml(altro, usati));
    if (datiAggiuntivi.length) tabelle.push({ titolo: 'Altri dati presenti nel file XML', tipo: 'altri', intestazioni: ['Campo', 'Valore'], righe: datiAggiuntivi.map(c => [c.campo, c.valore]), larghezze: ['*', '*'] });
    return { titolo: 'Fattura elettronica ' + (n || tipo), tipoDocumento: TIPI[tipo] ?? 'Fattura elettronica', numero: n, data: giorno, valuta: divisa, cedente, cliente, tabelle, causali, righeXml, riferimenti, datiAggiuntivi };
  });
}

export function riferimentiRigaXml(fattura: FatturaXmlStampabile | null, chiave: string): RigaXmlStampabile | undefined {
  const righe = fattura?.righeXml.filter(r => lineaUguale(r.numero, chiave)) ?? [];
  return righe.length === 1 ? righe[0] : undefined;
}

const NOTA_XML = 'Rappresentazione leggibile del file XML. I dati riportati provengono esclusivamente dall’XML.';
const titoloSezione = 'Altri dati presenti nel file XML';
const TIPI_DETTAGLIO: Array<{ titolo: string; tag: string[] }> = [
  { titolo: 'Dati di trasmissione', tag: ['DatiTrasmissione'] },
  { titolo: 'Ritenute, bollo, cassa e altre condizioni fiscali', tag: ['DatiRitenuta', 'DatiBollo', 'DatiCassaPrevidenziale', 'ScontoMaggiorazione'] },
  { titolo: 'Trasporto e dati di consegna', tag: ['DatiTrasporto', 'DatiVeicoli'] },
  { titolo: 'Allegati', tag: ['Allegati'] },
  { titolo: 'Altri riferimenti di pagamento', tag: ['DatiPagamento'] },
];

function etichettaCampo(percorso: string) {
  return percorso.split(' / ').map(parte => {
    const corrispondenza = /^(?:[\w.-]+:)?([\w.-]+)(.*)$/.exec(parte);
    const nome = corrispondenza && ETICHETTE_XML[corrispondenza[1]];
    return nome ? nome + corrispondenza[2] : parte;
  }).join(' / ');
}

function tabelleDocumento(fattura: FatturaXmlStampabile): TabellaXml[] {
  const [, ...tabelle] = fattura.tabelle;
  const sezioni = TIPI_DETTAGLIO.map(({ titolo, tag }) => ({ titolo, tag: new Set(tag), righe: [] as string[][] }));
  const residui: string[][] = [];
  for (const { campo, valore } of fattura.datiAggiuntivi) {
    const nodi = campo.split(' / ').map(nodo => nodo.replace(/^.*:/, '').replace(/ \[\d+\]$/, ''));
    const sezione = sezioni.find(s => nodi.some(nodo => s.tag.has(nodo)));
    (sezione?.righe ?? residui).push([campo, valore]);
  }
  const dati = [...sezioni, { titolo: titoloSezione, righe: residui }]
    .filter(sezione => sezione.righe.length)
    .map(({ titolo, righe }): TabellaXml => ({
      titolo, righe, intestazioni: ['Campo', 'Valore'], tipo: 'altri', larghezze: ['*', '*'],
    }));
  return [
    ...tabelle.filter(t => t.tipo === 'righe'),
    ...tabelle.filter(t => t.titolo === 'Riepilogo IVA e totali' || t.tipo === 'totale'),
    ...tabelle.filter(t => t.tipo === 'riferimenti' || t.tipo === 'pagamenti'),
    ...tabelle.filter(t => !t.tipo && t.titolo !== 'Riepilogo IVA e totali'),
    ...dati,
  ];
}

function datiTestata(f: FatturaXmlStampabile) {
  const metadati = f.tabelle[0];
  return metadati.intestazioni.flatMap((campo, i) => {
    const valore = metadati.righe[0][i];
    return i !== 2 && i !== 3 && valore && valore !== '—' ? [{ campo, valore }] : [];
  });
}

function sottotitolo(opzioni: OpzioniFatturaXml) {
  return opzioni.direzione === 'ricevuta' ? 'Fattura ricevuta · Dati del file XML'
    : opzioni.direzione === 'emessa' ? 'Fattura di vendita · Dati del file XML' : 'Dati del file XML';
}

function partiHtml(label: string, [nome, ...dati]: string[]) {
  return '<div class="parte"><p class="etichetta">' + esc(label) + '</p>' +
    '<h2>' + esc(nome || '—') + '</h2>' + dati.map(riga => '<p>' + esc(riga) + '</p>').join('') + '</div>';
}

function totaleConValuta(totale: string, valuta: string) {
  return valuta && /\d/.test(totale) ? totale + ' ' + (valuta === 'EUR' ? '€' : valuta) : totale;
}

function pagamentiHtml(t: TabellaXml, valuta: string) {
  return '<ul class="elenco-rate">' + t.righe.map(([modalita, scadenza, importo, ...extra]) => {
    const dataLeggibile = scadenza.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$1/$2/$3');
    const dettagli = extra.map((valore, i) => valore
      ? '<div><dt>' + esc(t.intestazioni[i + 3]) + '</dt><dd>' + esc(valore) + '</dd></div>' : '').join('');
    return '<li class="rata"><div class="rata-sintesi"><div><strong>' + esc(modalita || 'Modalità non indicata') +
      '</strong><p>' + esc(dataLeggibile ? 'Scadenza ' + dataLeggibile : 'Scadenza non indicata') +
      '</p></div><b>' + esc(totaleConValuta(importo, valuta)) + '</b></div>' +
      (dettagli ? '<dl class="rata-dettagli">' + dettagli + '</dl>' : '') + '</li>';
  }).join('') + '</ul>';
}

function tabellaHtml(t: TabellaXml, valuta: string, id?: string) {
  const titolo = '<h2>' + esc(t.titolo) + '</h2>';
  const ancora = id ? ' id="' + esc(id) + '"' : '';
  if (t.tipo === 'totale') {
    const [[valuta, arrotondamento, totale]] = t.righe;
    return '<div class="totale"><div><strong>Totale documento</strong><small>Valuta ' + esc(valuta || '—') +
      (arrotondamento !== '—' ? ' · Arrotondamento ' + esc(arrotondamento) : '') +
      '</small></div><b>' + esc(totaleConValuta(totale, valuta)) + '</b></div>';
  }
  if (t.titolo === 'Causale / annotazioni del documento') {
    return '<section class="blocco causali">' + titolo + t.righe.map(([nota]) => '<p>' + esc(nota) + '</p>').join('') + '</section>';
  }
  if (!t.righe.length) return '';
  if (t.tipo === 'pagamenti') {
    return '<section class="blocco pagamenti"' + ancora + '>' + titolo + pagamentiHtml(t, valuta) + '</section>';
  }
  const voci = t.tipo === 'righe';
  const ruoloRiga = voci ? ' role="row"' : '';
  const ruoloGruppo = voci ? ' role="rowgroup"' : '';
  const intestazioni = t.intestazioni.map((h, i) =>
    '<th scope="col"' + (voci ? ' role="columnheader"' : '') + (t.numeriche?.includes(i) ? ' class="n"' : '') + '>' + esc(h) + '</th>').join('');
  const righe = t.righe.map((riga, ri) => '<tr' + ruoloRiga + '>' + riga.map((v, i) => {
    const numerico = t.numeriche?.includes(i);
    const dettagli = i === 1 ? t.dettagliRighe?.[ri] : undefined;
    const campoTecnico = t.tipo === 'altri' && i === 0;
    const contenuto = campoTecnico ? etichettaCampo(v) : v;
    const label = voci && i >= 2 ? ' data-etichetta="' + esc(t.intestazioni[i]) + '"' : '';
    return '<td' + (voci ? ' role="cell"' : '') + (numerico ? ' class="n"' : '') + label + (voci && !v ? ' data-vuoto' : '') +
      (campoTecnico ? ' title="' + esc(v) + '"' : '') + '>' +
      esc(contenuto || '—') +
      (dettagli?.length ? '<dl class="dettagli-riga">' + dettagli.map(c => '<div><dt title="' + esc(c.campo) +
        '">' + esc(etichettaCampo(c.campo)) + ':</dt> <dd>' + esc(c.valore) + '</dd></div>').join('') + '</dl>' : '') + '</td>';
  }).join('') + '</tr>').join('');
  const colonne = t.larghezze ? '<colgroup>' + t.larghezze.map(larghezza =>
    '<col' + (typeof larghezza === 'number' ? ' style="width:' + larghezza + 'pt"' : '') + '>').join('') + '</colgroup>' : '';
  const ampia = t.intestazioni.length > 5 ? ' tabella-ampia' : '';
  return '<section class="blocco ' + (t.tipo ?? '') + ampia + '"' + ancora + '>' + titolo + '<div class="scorri"><table' +
    (voci ? ' role="table"' : '') + ' aria-label="' + esc(t.ariaLabel || t.titolo) + '">' +
    colonne + '<thead' + ruoloGruppo + '><tr' + ruoloRiga + '>' + intestazioni + '</tr></thead><tbody' + ruoloGruppo + '>' + righe + '</tbody></table></div></section>';
}

const SEZIONI_DOCUMENTO = [
  { tipo: 'righe', etichetta: 'Righe' },
  { tipo: 'riferimenti', etichetta: 'DDT e ordini' },
  { tipo: 'pagamenti', etichetta: 'Pagamenti' },
  { tipo: 'altri', etichetta: 'Dati XML' },
] as const;

function contenutoHtml(f: FatturaXmlStampabile, indice: number, opzioni: OpzioniFatturaXml) {
  const tabelle = tabelleDocumento(f);
  const pagamenti = tabelle.find(t => t.tipo === 'pagamenti')?.righe.length ?? 0;
  const mostraScorciatoie = f.righeXml.length > 8 || f.riferimenti.length > 0 || pagamenti > 1 || f.datiAggiuntivi.length > 14;
  const ancore = new Map<number, string>();
  const link = mostraScorciatoie ? SEZIONI_DOCUMENTO.flatMap(({ tipo, etichetta }) => {
    const posizione = tabelle.findIndex(t => t.tipo === tipo && t.righe.length > 0);
    if (posizione === -1) return [];
    const id = `fattura-${indice + 1}-${tipo}`;
    ancore.set(posizione, id);
    // In srcdoc la base relativa si eredita dalla pagina esterna.
    const percorso = opzioni.dentroIframe ? 'about:srcdoc' : '';
    return ['<a href="' + percorso + '#' + id + '">' + etichetta + '</a>'];
  }).join('') : '';
  return (link ? '<nav class="sezioni-documento" aria-label="Sezioni della fattura">' + link + '</nav>' : '') +
    tabelle.map((t, i) => tabellaHtml(t, f.valuta, ancore.get(i))).join('');
}

export function fatturaXmlTabellareHtml(xml: string, opzioni: OpzioniFatturaXml = {}): { html: string; titolo: string } {
  const fatture = leggiFattureXmlStampabili(xml, opzioni);
  const corpo = fatture.map((f, i) => `
    <article class="foglio">
      <header class="testata">
        <div><h1>${esc(f.tipoDocumento)}</h1><p>${esc(sottotitolo(opzioni))}</p></div>
        <div class="numero"><strong>${f.numero ? 'N. ' + esc(f.numero) : 'Numero assente'}</strong><p>${esc(f.data)}</p></div>
      </header>
      <div class="parti">${partiHtml('Fornitore', f.cedente)}${partiHtml('Intestata a', f.cliente)}</div>
      <dl class="dati-testata">${datiTestata(f).map(c => '<div><dt>' + esc(c.campo) + '</dt><dd>' + esc(c.valore) + '</dd></div>').join('')}</dl>
      ${contenutoHtml(f, i, opzioni)}
      <footer>${NOTA_XML}</footer>
    </article>`).join('');
  const ref = fatture.length === 1 ? 'Documento n. ' + fatture[0].numero + ' · ' + fatture[0].data : 'File XML';
  const pagina = '@page{size:A4;margin:24pt 24pt 32pt;@bottom-left{content:' + cssStringa(ref) + ';font:7pt Arial;color:#52637a}@bottom-right{content:"Pagina " counter(page) " di " counter(pages);font:7pt Arial;color:#52637a}}';
  return {
    titolo: fatture[0].titolo,
    html: '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      esc(fatture[0].titolo) + '</title><style>' + pagina + stileFatturaXml + '</style></head><body>' + corpo + '</body></html>',
  };
}

export function definizionePdfFatturaXml(fatture: FatturaXmlStampabile[], opzioni: OpzioniFatturaXml = {}): Record<string, unknown> {
  const blu = '#183558', testo = '#182941', tenue = '#52637a', fondo = '#edf3fa', divisore = '#d9e3ee';
  const layout = {
    hLineWidth: (i: number) => i > 0 ? 0.5 : 0,
    vLineWidth: () => 0,
    hLineColor: () => divisore,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };
  // Le colonne flessibili hanno una larghezza fisica. Anche un CUP senza
  // spazi può andare a capo restando dentro il foglio.
  const larghezze = (colonne: Array<number | '*'>): number[] => {
    const spazio = 595.28 - 48 - colonne.length * 8;
    const fisse = colonne.reduce<number>((tot, w) => tot + (typeof w === 'number' ? w : 0), 0);
    const flessibili = colonne.filter(w => w === '*').length;
    return colonne.map(w => typeof w === 'number' ? w : (spazio - fisse) / flessibili);
  };
  const partePdf = (label: string, [nome, ...dati]: string[]) => ({ stack: [
    { text: label.toUpperCase(), color: tenue, bold: true, fontSize: 7.5, margin: [0, 0, 0, 4] },
    { text: nome || '—', color: blu, bold: true, fontSize: 12, margin: [0, 0, 0, 3] },
    ...dati,
  ] });
  const content: Record<string, unknown>[] = [];
  for (const [indice, f] of fatture.entries()) {
    content.push({
      pageBreak: indice ? 'before' : undefined,
      columnGap: 16,
      columns: [
        { width: '*', stack: [{ text: f.tipoDocumento, bold: true, color: blu, fontSize: 22 }, { text: sottotitolo(opzioni), color: tenue, margin: [0, 4, 0, 0] }] },
        { width: 185, alignment: 'right', stack: [{ text: f.numero ? 'N. ' + f.numero : 'Numero assente', bold: true, color: blu, fontSize: 12 }, { text: f.data, color: tenue, margin: [0, 4, 0, 0] }] },
      ],
      margin: [0, 0, 0, 9],
    }, {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 547, y2: 0, lineColor: blu, lineWidth: 1.4 }],
      margin: [0, 0, 0, 11],
    }, {
      columnGap: 18, columns: [partePdf('Fornitore', f.cedente), partePdf('Intestata a', f.cliente)],
      margin: [0, 0, 0, 10],
    }, {
      text: datiTestata(f).map(c => c.campo + ' · ' + c.valore).join('     '),
      color: tenue, fontSize: 8, margin: [0, 0, 0, 6],
    });

    for (const t of tabelleDocumento(f)) {
      if (!t.righe.length) continue;
      if (t.tipo === 'totale') {
        const [[valuta, arrotondamento, totale]] = t.righe;
        content.push({
          table: { widths: larghezze(['*', 172]), body: [[
            { stack: [{ text: 'Totale documento', bold: true, color: blu }, { text: 'Valuta ' + (valuta || '—') +
              (arrotondamento !== '—' ? ' · Arrotondamento ' + arrotondamento : ''), color: tenue, fontSize: 7.5 }], fillColor: fondo },
            { text: totaleConValuta(totale, valuta), bold: true, fontSize: 15, alignment: 'right', fillColor: fondo, color: blu },
          ]] }, layout, margin: [0, 0, 0, 7],
        });
        continue;
      }
      content.push({ text: t.titolo, bold: true, color: blu, fontSize: 10, margin: [0, 7, 0, 4], headlineLevel: 1 });
      if (t.titolo === 'Causale / annotazioni del documento') {
        for (const [nota] of t.righe) content.push({ text: nota, margin: [0, 0, 0, 4] });
        continue;
      }
      const colonne = larghezze(t.larghezze ?? t.intestazioni.map(() => '*'));
      const corpo = t.righe.map((riga, ri) => riga.map((v, i) => {
        const dettagli = i === 1 ? t.dettagliRighe?.[ri] : undefined;
        const text = (t.tipo === 'altri' && i === 0 ? etichettaCampo(v) : v) || '—';
        if (dettagli?.length) return {
          stack: [{ text }, { text: dettagli.map(c => etichettaCampo(c.campo) + ': ' + c.valore).join('\n'),
            fontSize: 7.5, color: tenue, margin: [0, 3, 0, 0] }],
        };
        return { text, alignment: t.numeriche?.includes(i) ? 'right' : 'left' };
      }));
      // Una descrizione molto lunga deve poter continuare sulla pagina seguente.
      const brevi = t.righe.every((r, ri) => r.every((v, i) => {
        const extra = i === 1 ? t.dettagliRighe?.[ri]?.map(c => c.campo + ': ' + c.valore).join('\n') : '';
        const righeStimate = (v + (extra ? '\n' + extra : '')).split('\n').reduce((n, s) => n + Math.max(1, Math.ceil(s.length * 8 / colonne[i])), 0);
        return righeStimate < 50;
      }));
      content.push({
        table: { headerRows: 1, keepWithHeaderRows: brevi ? 1 : 0, dontBreakRows: brevi, widths: colonne,
          body: [t.intestazioni.map((text, i) => ({ text, fillColor: fondo, color: blu, bold: true, fontSize: 7.5,
            alignment: t.numeriche?.includes(i) ? 'right' : 'left' })), ...corpo] },
        layout, margin: [0, 0, 0, 6],
      });
    }
  }
  const ref = fatture.length === 1 ? 'Documento n. ' + fatture[0].numero + ' · ' + fatture[0].data + ' · ' : '';
  return {
    pageSize: 'A4', pageMargins: [24, 24, 24, 32], defaultStyle: { font: 'Roboto', fontSize: 8, color: testo }, content,
    info: { title: fatture[0]?.titolo ?? 'Fattura elettronica', subject: 'Rappresentazione del file XML' },
    footer: (pagina: number, totale: number) => ({ text: ref + 'Rappresentazione leggibile del file XML · Pagina ' + pagina + ' di ' + totale, fontSize: 6.5, color: tenue, alignment: 'right', margin: [24, 8, 24, 0] }),
    pageBreakBefore: (nodo: { headlineLevel?: number }, contesto: { getFollowingNodesOnPage: () => unknown[] }) => nodo.headlineLevel === 1 && contesto.getFollowingNodesOnPage().length === 0,
  };
}

export async function generaPdfFatturaXml(xml: string, opzioni: OpzioniFatturaXml = {}): Promise<Uint8Array> {
  const fatture = leggiFattureXmlStampabili(xml, opzioni);
  const [m, f] = await Promise.all([import('pdfmake/build/pdfmake.min.js'), import('pdfmake/build/vfs_fonts.js')]);
  m.default.addVirtualFileSystem(f.default);
  return m.default.createPdf(definizionePdfFatturaXml(fatture, opzioni) as never).getBuffer();
}
