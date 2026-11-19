import { describe, expect, it } from 'vitest';
import { generateXML } from '../../../supabase/functions/_shared/generateXML';
import { calcolaRiga, calcolaTotaliDocumento } from '@/lib/fatturazione/calcoli';
import { fatturaRicevutaHtml } from '@/lib/fatturazione/fatturaRicevutaHtml';

// Stesse voci e importi della segnalazione, con anagrafiche, riferimenti e targhe di prova.
function xmlDettagliato(numero = 'TEST-0001', targa = 'AA000AA') {
  const voci = [
    ['Riparazione', 1, 'Nr.', 20.49],
    ['Uscita furgone attrezzato', 1, 'Nr.', 50],
    ["Mano d'opera oraria", 2, 'h.', 45],
    ['Rappezzo 115', 1, 'Nr.', 15],
  ] as const;
  const righe = voci.map(([descrizione, quantita, unita_misura, prezzo_unitario], i) => calcolaRiga({
    id: String(i), numero_linea: i + 1, descrizione, quantita, unita_misura, prezzo_unitario,
    aliquota_iva: '22', imponibile: 0, imposta: 0, totale_riga: 0,
  }));
  const totale = calcolaTotaliDocumento(righe);
  let xml = generateXML({
    tipo: 'fattura_riepilogativa', numero, data_emissione: '2026-10-31',
    cliente_snapshot: { tipo_cliente: 'B2B', ragione_sociale: 'Impresa prova', partita_iva: '01234567897' },
    righe, riepilogo_iva: totale.riepilogo_iva, imponibile_totale: totale.imponibile_totale,
    totale_documento: totale.totale_documento, totale_da_pagare: totale.totale_da_pagare,
    metodo_pagamento_codice: 'MP12', scadenze_pagamento: [{ data_scadenza: '2026-11-30', importo: 214.10, metodo_pagamento: 'MP12' }],
  }, { ragione_sociale: 'Officina di prova', partita_iva: '01234567897', regime_fiscale: 'RF01' }, '1');
  xml = xml.replace('</DatiGenerali>', `<DatiDDT><NumeroDDT>0000042</NumeroDDT><DataDDT>2026-10-14</DataDDT><RiferimentoNumeroLinea>2</RiferimentoNumeroLinea><RiferimentoNumeroLinea>3</RiferimentoNumeroLinea><RiferimentoNumeroLinea>4</RiferimentoNumeroLinea></DatiDDT><DatiDDT><NumeroDDT>0000043</NumeroDDT><DataDDT>2026-10-15</DataDDT><RiferimentoNumeroLinea>1</RiferimentoNumeroLinea></DatiDDT></DatiGenerali>`);
  let i = 0;
  return xml.replace(/<\/DettaglioLinee>/g, () => `<AltriDatiGestionali><TipoDato>Targa</TipoDato><RiferimentoTesto>${i++ === 0 ? targa : 'BB111BB'}</RiferimentoTesto></AltriDatiGestionali><AltriDatiGestionali><TipoDato>Kilometri</TipoDato><RiferimentoNumero>00.00</RiferimentoNumero></AltriDatiGestionali></DettaglioLinee>`);
}

const pagina = (xml: string, indiceCorpo = 0) => {
  const vista = fatturaRicevutaHtml(xml, new DOMParser(), { indiceCorpo });
  expect(vista).not.toBeNull();
  return new DOMParser().parseFromString(vista!.html, 'text/html');
};
const celle = (doc: Document, tabella: string) => Array.from(doc.querySelectorAll(`table[aria-label="${tabella}"] tbody tr`))
  .map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent?.trim()));

describe('Dettagli originali della fattura ricevuta', () => {
  it('mantiene DDT, date e associazioni alle righe', () => {
    expect(celle(pagina(xmlDettagliato()), 'DDT dichiarati nella fattura')).toEqual([
      ['0000042', '14/10/2026', '2, 3, 4'], ['0000043', '15/10/2026', '1'],
    ]);
  });

  it('mostra unità originali e targhe sulle rispettive righe, senza perdere lo zero dei chilometri', () => {
    const righe = celle(pagina(xmlDettagliato()), 'Righe della fattura');
    expect(righe.map(r => r[2])).toEqual(['Nr.', 'Nr.', 'h.', 'Nr.']);
    expect(righe[0][1]).toContain('AA000AA');
    expect(righe[0][1]).not.toContain('BB111BB');
    expect(righe.slice(1).every(r => r[1]?.includes('BB111BB') && !r[1]?.includes('AA000AA'))).toBe(true);
    expect(righe.every(r => r[1]?.includes('Kilometri: 00.00'))).toBe(true);
  });

  it('preserva prezzi, importi, IVA e pagamento dell’originale', () => {
    const doc = pagina(xmlDettagliato());
    const righe = celle(doc, 'Righe della fattura');
    expect(righe.map(r => r[3])).toEqual(['1', '1', '2', '1']);
    expect(righe.map(r => r[4]?.replace(/\s/g, ''))).toEqual(['20,49€', '50,00€', '45,00€', '15,00€']);
    expect(doc.querySelector('.totali')?.textContent).toContain('175,49');
    expect(doc.querySelector('.totali')?.textContent).toContain('38,61');
    expect(doc.querySelector('.totale')?.textContent).toContain('214,10');
    expect(doc.body.textContent).toContain('RIBA');
    expect(doc.body.textContent).toContain('30/11/2026');
  });

  it('non inventa l’unità o un’associazione alle righe se mancano nell’XML', () => {
    const xml = xmlDettagliato().replace('<UnitaMisura>Nr.</UnitaMisura>', '')
      .replace(/<RiferimentoNumeroLinea>[^<]*<\/RiferimentoNumeroLinea>/g, '');
    const doc = pagina(xml);
    expect(celle(doc, 'Righe della fattura')[0][2]).toBe('—');
    expect(celle(doc, 'DDT dichiarati nella fattura').every(r => r[2] === '—')).toBe(true);
  });

  it('usa il NumeroLinea originale anche quando le righe non sono consecutive', () => {
    const xml = xmlDettagliato().replace('<NumeroLinea>1</NumeroLinea>', '<NumeroLinea>10</NumeroLinea>')
      .replace('<RiferimentoNumeroLinea>1</RiferimentoNumeroLinea>', '<RiferimentoNumeroLinea>10</RiferimentoNumeroLinea>');
    const doc = pagina(xml);
    expect(celle(doc, 'Righe della fattura')[0][0]).toBe('10');
    expect(celle(doc, 'DDT dichiarati nella fattura')[1][2]).toBe('10');
  });

  it('tratta i dettagli e i riferimenti del fornitore come testo, anche nella stampa', () => {
    const xml = xmlDettagliato('TEST', '&lt;img src=x onerror=alert(1)&gt;')
      .replace('<NumeroDDT>0000042</NumeroDDT>', '<NumeroDDT>&lt;script&gt;alert(1)&lt;/script&gt;</NumeroDDT>');
    const doc = pagina(xml);
    expect(doc.querySelectorAll('img, script')).toHaveLength(0);
    expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(doc.body.textContent).toContain('<script>alert(1)</script>');
  });

  it('legge anche i dettagli con prefissi XML', () => {
    const xml = xmlDettagliato().replace(/<(\/?)([A-Za-z][\w]*)(?=[\s>])/g, '<$1n:$2')
      .replace(/<p:FatturaElettronica /, '<p:FatturaElettronica xmlns:n="urn:prova" ');
    const doc = pagina(xml);
    expect(celle(doc, 'DDT dichiarati nella fattura')).toHaveLength(2);
    expect(celle(doc, 'Righe della fattura')[0][1]).toContain('AA000AA');
    expect(doc.body.textContent).toContain('Impresa prova');
  });

  it('mantiene distinti i corpi del lotto, inclusi DDT, annotazioni, pagamento e allegati', () => {
    const allegato = (nome: string) => `<Allegati><NomeAttachment>${nome}.pdf</NomeAttachment><Attachment>${btoa('%PDF-1.4 prova')}</Attachment></Allegati>`;
    const prima = xmlDettagliato('PRIMA', 'AA000AA').replace('</DatiGeneraliDocumento>', '<Causale>Solo prima</Causale></DatiGeneraliDocumento>').replace('</FatturaElettronicaBody>', `${allegato('prima')}</FatturaElettronicaBody>`);
    const seconda = xmlDettagliato('SECONDA', 'CC222CC').replace(/0000042/g, 'DDT-SECONDA').replace(/2026-11-30/g, '2026-12-30')
      .replace('</DatiGeneraliDocumento>', '<Causale>Solo seconda</Causale></DatiGeneraliDocumento>').replace('</FatturaElettronicaBody>', `${allegato('seconda')}</FatturaElettronicaBody>`);
    const body = seconda.match(/<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/)![0];
    const lotto = prima.replace('</p:FatturaElettronica>', `${body}</p:FatturaElettronica>`);
    const vista = fatturaRicevutaHtml(lotto, new DOMParser(), { indiceCorpo: 1 })!;
    expect(vista.titolo).toContain('SECONDA');
    expect(vista.html).toContain('CC222CC');
    expect(vista.html).not.toContain('AA000AA');
    expect(vista.html).toContain('DDT-SECONDA');
    expect(vista.html).toContain('Solo seconda');
    expect(vista.html).not.toContain('Solo prima');
    expect(vista.html).toContain('30/12/2026');
    expect(vista.html).not.toContain('30/11/2026');
    expect(vista.allegatiPdf.map(a => a.nome)).toEqual(['seconda.pdf']);
    expect(fatturaRicevutaHtml(lotto, new DOMParser(), { indiceCorpo: 2 })).toBeNull();
  });
});
