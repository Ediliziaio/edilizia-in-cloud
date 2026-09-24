// Il lettore delle fatture RICEVUTE: lo stesso modulo che usano ricevi-sdi
// (caricamento a mano) e openapi-fatture-ricevute (importazione automatica),
// provato col DOM di jsdom come fatturapaReader.
import { describe, it, expect } from "vitest";
import { leggiFatturaRicevuta } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import type { LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

const parser = new DOMParser() as unknown as LettoreXml;

const corpo = (numero: string, data: string, righe: string, riepilogo: string, totale = "") => `
<FatturaElettronicaBody>
  <DatiGenerali><DatiGeneraliDocumento>
    <TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>${data}</Data><Numero>${numero}</Numero>
    ${totale ? `<ImportoTotaleDocumento>${totale}</ImportoTotaleDocumento>` : ""}
  </DatiGeneraliDocumento></DatiGenerali>
  <DatiBeniServizi>${righe}${riepilogo}</DatiBeniServizi>
</FatturaElettronicaBody>`;

const riga = (n: number, descr: string, q: string, pu: string, pt: string, al = "22.00", natura = "") =>
  `<DettaglioLinee><NumeroLinea>${n}</NumeroLinea><Descrizione>${descr}</Descrizione><Quantita>${q}</Quantita>` +
  `<PrezzoUnitario>${pu}</PrezzoUnitario><PrezzoTotale>${pt}</PrezzoTotale><AliquotaIVA>${al}</AliquotaIVA>` +
  `${natura ? `<Natura>${natura}</Natura>` : ""}</DettaglioLinee>`;

const riepilogo = (al: string, imp: string, iva: string, natura = "") =>
  `<DatiRiepilogo><AliquotaIVA>${al}</AliquotaIVA>${natura ? `<Natura>${natura}</Natura>` : ""}` +
  `<ImponibileImporto>${imp}</ImponibileImporto><Imposta>${iva}</Imposta></DatiRiepilogo>`;

const cedenteSocieta = `<CedentePrestatore><DatiAnagrafici>
  <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
  <CodiceFiscale>01234567890</CodiceFiscale>
  <Anagrafica><Denominazione>Ferramenta Rossi Srl</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale>
</DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><NumeroCivico>3</NumeroCivico><CAP>33170</CAP>
<Comune>Pordenone</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede>
<IscrizioneREA><Ufficio>PN</Ufficio><NumeroREA>123456</NumeroREA><StatoLiquidazione>LN</StatoLiquidazione></IscrizioneREA>
</CedentePrestatore>`;

const cessionario = `<CessionarioCommittente><DatiAnagrafici>
  <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01941970939</IdCodice></IdFiscaleIVA>
  <Anagrafica><Denominazione>RENOVA SOLUTION S.R.L.</Denominazione></Anagrafica>
</DatiAnagrafici><Sede><Indirizzo>Via Revedole 78/B</Indirizzo><CAP>33170</CAP><Comune>Pordenone</Comune>
<Nazione>IT</Nazione></Sede></CessionarioCommittente>`;

// L'intermediario che trasmette (qui Aruba) ha la sua partita IVA in testa al
// file: non deve mai diventare il fornitore.
const fattura = (cedente: string, ...corpi: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader>
  <DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01879020517</IdCodice></IdTrasmittente>
  <ProgressivoInvio>Z9x81</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>
  <CodiceDestinatario>PIC7CPS</CodiceDestinatario></DatiTrasmissione>
  ${cedente}${cessionario}
</FatturaElettronicaHeader>${corpi.join("")}
</p:FatturaElettronica>`;

describe("leggiFatturaRicevuta", () => {
  it("fornitore, cliente e documento dal percorso giusto, non dal primo tag che capita", () => {
    const f = leggiFatturaRicevuta(fattura(cedenteSocieta, corpo("77/A", "2026-09-20",
      riga(1, "Viti inox", "10.00", "10.00", "100.00"), riepilogo("22.00", "100.00", "22.00"), "122.00")), parser)!;
    expect(f.cedente_piva).toBe("01234567890"); // non 01879020517 del trasmittente
    expect(f.cedente_ragione_sociale).toBe("Ferramenta Rossi Srl");
    expect(f.cedente_comune).toBe("Pordenone");
    expect(f.cessionario_piva).toBe("01941970939");
    expect(f.numero_fattura).toBe("77/A"); // non NumeroREA né NumeroCivico
    expect(f.data_fattura).toBe("2026-09-20");
    expect(f.sdi_progressivo).toBe("Z9x81");
    expect(f.totale_documento).toBe(122);
    expect(f.fatture_nel_file).toBe(1);
  });

  it("imponibile e imposta dal riepilogo IVA, anche quando le righe arrotondano diverso", () => {
    // Tre righe da 33,33 = 99,99; il riepilogo (quello del registro IVA) dice 100,00.
    const righe = riga(1, "A", "1", "33.33", "33.33") + riga(2, "B", "1", "33.33", "33.33") + riga(3, "C", "1", "33.33", "33.33");
    const f = leggiFatturaRicevuta(fattura(cedenteSocieta, corpo("1", "2026-01-10", righe,
      riepilogo("22.00", "100.00", "22.00"))), parser)!;
    expect(f.imponibile_totale).toBe(100);
    expect(f.iva_totale).toBe(22);
    // Senza ImportoTotaleDocumento il totale è imponibile + imposta.
    expect(f.totale_documento).toBe(122);
    expect(f.righe).toHaveLength(3);
    expect(f.righe[0]).toMatchObject({ numero_linea: 1, descrizione: "A", imponibile: 33.33, aliquota_iva: "22" });
  });

  it("più aliquote e una natura: riepiloghi sommati, natura conservata", () => {
    const righe = riga(1, "Posa", "1", "1000.00", "1000.00", "10.00") + riga(2, "Bollo", "1", "2.00", "2.00", "0.00", "N1");
    const riep = riepilogo("10.00", "1000.00", "100.00") + riepilogo("0.00", "2.00", "0.00", "N1");
    const f = leggiFatturaRicevuta(fattura(cedenteSocieta, corpo("5", "2026-02-01", righe, riep, "1102.00")), parser)!;
    expect(f.imponibile_totale).toBe(1002);
    expect(f.iva_totale).toBe(100);
    expect(f.riepilogo_iva).toEqual([
      { aliquota: "10", natura: null, imponibile: 1000, imposta: 100 },
      { aliquota: "0", natura: "N1", imponibile: 2, imposta: 0 },
    ]);
    expect(f.righe[1]).toMatchObject({ natura_iva: "N1" });
  });

  it("un lotto si legge per la prima fattura: niente righe e totali delle altre", () => {
    const primo = corpo("10", "2026-03-01", riga(1, "Prima", "1", "50.00", "50.00"), riepilogo("22.00", "50.00", "11.00"), "61.00");
    const secondo = corpo("11", "2026-03-02", riga(1, "Seconda", "1", "900.00", "900.00"), riepilogo("22.00", "900.00", "198.00"), "1098.00");
    const f = leggiFatturaRicevuta(fattura(cedenteSocieta, primo, secondo), parser)!;
    expect(f.numero_fattura).toBe("10");
    expect(f.imponibile_totale).toBe(50);
    expect(f.iva_totale).toBe(11);
    expect(f.righe).toHaveLength(1);
    expect(f.fatture_nel_file).toBe(2);
  });

  it("fornitore persona fisica: nome e cognome", () => {
    const persona = `<CedentePrestatore><DatiAnagrafici>
      <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>
      <CodiceFiscale>RSSMRA80A01G888X</CodiceFiscale>
      <Anagrafica><Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica><RegimeFiscale>RF19</RegimeFiscale>
    </DatiAnagrafici><Sede><Indirizzo>Via Po 2</Indirizzo><CAP>10100</CAP><Comune>Torino</Comune><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>`;
    const f = leggiFatturaRicevuta(fattura(persona, corpo("3", "2026-04-04",
      riga(1, "Consulenza", "1", "500.00", "500.00", "0.00", "N2.2"), riepilogo("0.00", "500.00", "0.00", "N2.2"), "500.00")), parser)!;
    expect(f.cedente_ragione_sociale).toBe("Mario Rossi");
    expect(f.cedente_cf).toBe("RSSMRA80A01G888X");
    expect(f.iva_totale).toBe(0);
  });

  it("un file che non è una fattura, o senza numero o data: null, mai una riga a metà", () => {
    expect(leggiFatturaRicevuta("<Ordine><Riga/></Ordine>", parser)).toBeNull();
    expect(leggiFatturaRicevuta("non è xml", parser)).toBeNull();
    const senzaNumero = fattura(cedenteSocieta, corpo("", "2026-05-05", "", riepilogo("22.00", "1.00", "0.22")));
    expect(leggiFatturaRicevuta(senzaNumero, parser)).toBeNull();
    const dataStorta = fattura(cedenteSocieta, corpo("9", "05/05/2026", "", riepilogo("22.00", "1.00", "0.22")));
    expect(leggiFatturaRicevuta(dataStorta, parser)).toBeNull();
  });
});
