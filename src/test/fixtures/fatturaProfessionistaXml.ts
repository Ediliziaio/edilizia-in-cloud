/** Fattura di prova: importi espliciti, nessun dato di un cliente reale. */
export const fatturaProfessionistaXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01941970939</IdCodice></IdTrasmittente><ProgressivoInvio>PROVA241</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
    <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01941970939</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Studio professionale di prova</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>Via Esempio 1</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>
    <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567897</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Cliente di prova</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Cliente 2</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2026-11-23</Data><Numero>PROVA-241</Numero>
      <DatiRitenuta><TipoRitenuta>RT02</TipoRitenuta><ImportoRitenuta>345.00</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>
      <DatiCassaPrevidenziale><TipoCassa>TC01</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>69.00</ImportoContributoCassa><ImponibileCassa>1725.00</ImponibileCassa><AliquotaIVA>22.00</AliquotaIVA></DatiCassaPrevidenziale>
      <ImportoTotaleDocumento>2474.68</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>10</NumeroLinea><Descrizione>COMPENSO PROFESSIONALE</Descrizione><Quantita>1.00</Quantita><UnitaMisura>N</UnitaMisura><PrezzoUnitario>1500.00</PrezzoUnitario><PrezzoTotale>1500.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DettaglioLinee>
      <DettaglioLinee><NumeroLinea>20</NumeroLinea><Descrizione>ANTICIPAZIONI</Descrizione><Quantita>1.00</Quantita><UnitaMisura>N</UnitaMisura><PrezzoUnitario>286.00</PrezzoUnitario><PrezzoTotale>286.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura></DettaglioLinee>
      <DettaglioLinee><NumeroLinea>30</NumeroLinea><Descrizione>Rimborso spese generali (15%)</Descrizione><Quantita>1.00</Quantita><UnitaMisura>N</UnitaMisura><PrezzoUnitario>225.00</PrezzoUnitario><PrezzoTotale>225.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1794.00</ImponibileImporto><Imposta>394.68</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>
      <DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura><ImponibileImporto>286.00</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><DataRiferimentoTerminiPagamento>2026-11-23</DataRiferimentoTerminiPagamento><ModalitaPagamento>MP01</ModalitaPagamento><DataScadenzaPagamento>2026-11-23</DataScadenzaPagamento><ImportoPagamento>2129.68</ImportoPagamento></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
