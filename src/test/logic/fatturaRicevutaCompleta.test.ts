import { describe, expect, it } from 'vitest';
import { fatturaRicevutaHtml } from '@/lib/fatturazione/fatturaRicevutaHtml';

function completa() {
  return `<p:FatturaElettronica xmlns:p="urn:fattura" xmlns:f="urn:futuro" xmlns:ds="urn:firma" versione="FPR12" SistemaEmittente="GEST-TEST">
  <FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>TRASM-TEST</IdCodice></IdTrasmittente><ProgressivoInvio>INVIO-TEST</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>ABC1234</CodiceDestinatario></DatiTrasmissione>
  <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567897</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Fornitore di prova</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>VIA FORNITORE</Indirizzo><NumeroCivico>12B</NumeroCivico><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede><Contatti><Telefono>TEL-TEST</Telefono><Email>fornitore@example.test</Email></Contatti></CedentePrestatore>
  <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Cliente di prova</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>VIA CLIENTE</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader>
  <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD24</TipoDocumento><Divisa>EUR</Divisa><Data>2026-11-19</Data><Numero>TEST-COMPLETA</Numero><DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>12.34</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta><DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo><DatiCassaPrevidenziale><TipoCassa>TC04</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>7.89</ImportoContributoCassa><AliquotaIVA>22.00</AliquotaIVA></DatiCassaPrevidenziale><ImportoTotaleDocumento>214.10</ImportoTotaleDocumento><Causale>CAUSALE COMPLETA</Causale></DatiGeneraliDocumento>
  <DatiOrdineAcquisto><RiferimentoNumeroLinea>8</RiferimentoNumeroLinea><IdDocumento>ODA-TEST</IdDocumento><CodiceCommessaConvenzione>COMMESSA-TEST</CodiceCommessaConvenzione><CodiceCUP>CUP-TEST</CodiceCUP><CodiceCIG>CIG-TEST</CodiceCIG></DatiOrdineAcquisto>
  <DatiContratto><IdDocumento>CONTRATTO-TEST</IdDocumento></DatiContratto><DatiDDT><NumeroDDT>DDT-TEST</NumeroDDT><DataDDT>2026-11-18</DataDDT><RiferimentoNumeroLinea>8</RiferimentoNumeroLinea></DatiDDT><DatiTrasporto><CausaleTrasporto>CONSEGNA-TEST</CausaleTrasporto><NumeroColli>3</NumeroColli><IndirizzoResa><Indirizzo>VIA CONSEGNA</Indirizzo></IndirizzoResa></DatiTrasporto></DatiGenerali>
  <DatiBeniServizi><DettaglioLinee variante="ATTR-RIGA"><NumeroLinea>8</NumeroLinea><CodiceArticolo><CodiceTipo>SKU</CodiceTipo><CodiceValore>ART-TEST</CodiceValore></CodiceArticolo><Descrizione>Fornitura di prova</Descrizione><Quantita>2.12345678</Quantita><UnitaMisura>pz</UnitaMisura><DataInizioPeriodo>2026-11-01</DataInizioPeriodo><DataFinePeriodo>2026-11-18</DataFinePeriodo><PrezzoUnitario>0.12345678</PrezzoUnitario><ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>5.00</Percentuale><Importo>0.01</Importo></ScontoMaggiorazione><PrezzoTotale>175.49</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta><RiferimentoAmministrazione>AMMINISTRAZIONE-TEST</RiferimentoAmministrazione><AltriDatiGestionali><TipoDato>Seriale</TipoDato><RiferimentoTesto>SERIALE-TEST</RiferimentoTesto><RiferimentoData>2026-11-17</RiferimentoData><f:Extra>GESTIONALE-FUTURO</f:Extra></AltriDatiGestionali><f:CampoFuturo codice="ATTR-FUTURO">VALORE-FUTURO</f:CampoFuturo></DettaglioLinee>
  <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>175.49</ImponibileImporto><Imposta>38.61</Imposta><EsigibilitaIVA>D</EsigibilitaIVA><RiferimentoNormativo>NORMA-TEST</RiferimentoNormativo></DatiRiepilogo></DatiBeniServizi>
  <DatiPagamento><CondizioniPagamento>TP01</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP12</ModalitaPagamento><DataScadenzaPagamento>2026-12-19</DataScadenzaPagamento><ImportoPagamento>100.00</ImportoPagamento><IstitutoFinanziario>BANCA-UNO</IstitutoFinanziario><IBAN>IBAN-UNO</IBAN></DettaglioPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2027-01-19</DataScadenzaPagamento><ImportoPagamento>114.10</ImportoPagamento><IstitutoFinanziario>BANCA-DUE</IstitutoFinanziario><IBAN>IBAN-DUE</IBAN><BIC>BIC-TEST</BIC><CodicePagamento>COD-PAGAMENTO</CodicePagamento></DettaglioPagamento></DatiPagamento>
  <Allegati><NomeAttachment>dati.csv</NomeAttachment><FormatoAttachment>CSV</FormatoAttachment><DescrizioneAttachment>DISTINTA-TEST</DescrizioneAttachment><Attachment>${btoa('codice;valore\nA;12')}</Attachment></Allegati><Allegati><NomeAttachment>misure.xlsx.zip</NomeAttachment><AlgoritmoCompressione>ZIP</AlgoritmoCompressione><FormatoAttachment>XLSX</FormatoAttachment><Attachment>${btoa('PK\x00\xff')}</Attachment></Allegati>
  </FatturaElettronicaBody><ds:Signature><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="ALGORITMO-TEST" /><ds:Reference URI="#RIF-FIRMA"><ds:DigestValue>IMPRONTA-TEST</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>FIRMA_BINARIA_NON_STAMPARE</ds:SignatureValue></ds:Signature></p:FatturaElettronica>`;
}

const vista = (xml = completa()) => fatturaRicevutaHtml(xml, new DOMParser())!;
const doc = (xml = completa()) => new DOMParser().parseFromString(vista(xml).html, 'text/html');

describe('Copia leggibile completa dell’XML del fornitore', () => {
  it('conserva tutti i riferimenti e i dati dell’intestazione, del documento, del trasporto e delle rate', () => {
    const testo = doc().body.textContent;
    for (const atteso of ['TRASM-TEST', 'INVIO-TEST', 'ABC1234', 'VIA FORNITORE', '12B', 'TEL-TEST', 'fornitore@example.test', 'VIA CLIENTE', 'RT01', '12.34', 'TC04', '7.89', 'ODA-TEST', 'COMMESSA-TEST', 'CUP-TEST', 'CIG-TEST', 'CONTRATTO-TEST', 'CONSEGNA-TEST', 'VIA CONSEGNA', 'NORMA-TEST', 'TP01', 'BANCA-UNO', 'BANCA-DUE', 'IBAN-UNO', 'IBAN-DUE', 'BIC-TEST', 'COD-PAGAMENTO', '19/12/2026', '19/01/2027']) expect(testo).toContain(atteso);
  });

  it('tiene codici, sconti, periodi, seriali e campi futuri sulla loro riga senza ripetere l’articolo', () => {
    const documento = doc();
    const righe = documento.querySelectorAll('table[aria-label="Righe della fattura"] tbody tr');
    expect(righe).toHaveLength(1);
    for (const atteso of ['ART-TEST', 'SC', '5.00', '0.01', '01/11/2026', '18/11/2026', 'AMMINISTRAZIONE-TEST', 'SERIALE-TEST', 'GESTIONALE-FUTURO', 'VALORE-FUTURO', 'ATTR-FUTURO', 'ATTR-RIGA', 'f:CampoFuturo']) expect(righe[0].textContent).toContain(atteso);
    expect(documento.querySelector('[aria-label="Dati completi del documento originale"]')?.textContent).not.toContain('ART-TEST');
  });

  it('mantiene attributi, formato e dati della firma senza stampare il suo contenuto binario', () => {
    const h = vista().html;
    for (const atteso of ['GEST-TEST', 'FPR12', 'urn:futuro', 'ALGORITMO-TEST', '#RIF-FIRMA', 'IMPRONTA-TEST']) expect(h).toContain(atteso);
    expect(h).not.toContain('FIRMA_BINARIA_NON_STAMPARE');
    expect(h).toContain('firma digitale conservato nel file originale');
  });

  it('non arrotonda quantità e prezzi unitari dell’XML né inventa una quantità quando manca', () => {
    const documento = doc();
    const riga = documento.querySelector('table[aria-label="Righe della fattura"] tbody tr')!;
    expect(riga.textContent).toContain('2,12345678');
    expect(riga.textContent).toContain('0,12345678');
    expect(doc(completa().replace('<Quantita>2.12345678</Quantita>', '<Quantita>0</Quantita>')).querySelectorAll('table[aria-label="Righe della fattura"] tbody td')[3].textContent).toBe('0');
    expect(doc(completa().replace('<Quantita>2.12345678</Quantita>', '')).querySelectorAll('table[aria-label="Righe della fattura"] tbody td')[3].textContent).toBe('—');
  });

  it('usa la valuta dichiarata anche nella rappresentazione delle righe', () => {
    const documento = doc(completa().replace('<Divisa>EUR</Divisa>', '<Divisa>USD</Divisa>'));
    expect(documento.querySelector('table[aria-label="Righe della fattura"]')?.textContent).toContain('USD');
    expect(documento.querySelector('table[aria-label="Righe della fattura"]')?.textContent).not.toContain('€');
  });

  it('restituisce tutti gli allegati con gli stessi byte e descrive i file anche nella stampa', () => {
    const v = vista();
    expect(v.allegatiFile?.map(a => [a.nome, atob(a.base64), a.compressione])).toEqual([['dati.csv', 'codice;valore\nA;12', ''], ['misure.xlsx.zip', 'PK\x00\xff', 'ZIP']]);
    expect(v.html).toContain('dati.csv');
    expect(v.html).toContain('misure.xlsx.zip');
    expect(v.html).toContain('DISTINTA-TEST');
    expect(v.allegatiPdf).toEqual([]);
    const tanto = btoa('x'.repeat(200_000));
    const grande = vista(completa().replace(btoa('codice;valore\nA;12'), tanto));
    expect(grande.allegatiFile?.[0].base64).toBe(tanto);
    expect(grande.html).not.toContain(tanto);
    expect(grande.html.length).toBeLessThan(60_000);
  });

  it('tratta anche campi nuovi e attributi come testo, senza creare collegamenti o HTML eseguibile', () => {
    const documento = doc(completa().replace('VALORE-FUTURO', '&lt;img src=x onerror=alert(1)&gt;').replace('ATTR-FUTURO', '&quot; onclick=&quot;alert(2)'));
    expect(documento.querySelectorAll('img,script,a[onclick],[onclick]')).toHaveLength(0);
    expect(documento.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(documento.body.textContent).toContain('" onclick="alert(2)');
  });

  it('riporta ogni valore e attributo originale, anche fuori dall’elenco dei campi conosciuti', () => {
    const originale = new DOMParser().parseFromString(completa(), 'application/xml');
    const rappresentazione = doc();
    const colonne = new Set(['NumeroLinea', 'Descrizione', 'Quantita', 'UnitaMisura', 'PrezzoUnitario', 'PrezzoTotale', 'AliquotaIVA', 'Natura']);
    const opachi = new Set(['Attachment', 'SignatureValue']);
    for (const el of Array.from(originale.getElementsByTagName('*'))) {
      const nellaRiga = !!el.closest('DettaglioLinee');
      const testo = nellaRiga ? rappresentazione.querySelector('table[aria-label="Righe della fattura"] tbody tr')!.textContent! : rappresentazione.body.textContent!;
      for (const attr of Array.from(el.attributes)) expect(testo, `${el.tagName}/@${attr.name}`).toContain(attr.value);
      if (el.children.length || opachi.has(el.localName) || (nellaRiga && colonne.has(el.localName))) continue;
      const valore = el.textContent?.trim() ?? '';
      const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore);
      expect(testo, el.tagName).toContain(data ? `${data[3]}/${data[2]}/${data[1]}` : valore);
    }
  });
});
