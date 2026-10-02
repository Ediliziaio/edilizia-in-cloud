// Il lettore XML delle edge function dà gli stessi risultati di un DOM vero
// (jsdom) sulle fatture, e rifiuta i file malformati. Con deno_dom le funzioni
// non leggevano nessun XML («"text/xml" unimplemented», 02/10/2026).
import { describe, expect, it } from "vitest";
import { LettoreXmlMinimo, leggiXml } from "../../../supabase/functions/_shared/xmlMinimo";
import { leggiFatturaRicevuta } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import { leggiFatturaPA, type LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

const minimo = new LettoreXmlMinimo();
const jsdom = new DOMParser() as unknown as LettoreXml;

const corpo = `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-09-30</Data><Numero>55/A &amp; B</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione><![CDATA[Porta <EZ1> "interna"]]></Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>`;
const fattura = (prefisso = "") => `﻿<?xml version="1.0" encoding="UTF-8"?>
<!-- generato -->
<${prefisso}FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" a="x>y">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01879020517</IdCodice></IdTrasmittente><ProgressivoInvio>Z9x81</ProgressivoInvio></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Ferramenta &#38; Figli Srl</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>33170</CAP><Comune>Pordenone</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01941970939</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>RENOVA</Denominazione></Anagrafica></DatiAnagrafici><Sede/></CessionarioCommittente></FatturaElettronicaHeader>${corpo}
</${prefisso}FatturaElettronica>`;

describe("lettore XML minimo", () => {
  it("legge la fattura come jsdom", () => {
    const a = leggiFatturaRicevuta(fattura("p:"), minimo)!;
    const b = leggiFatturaRicevuta(fattura("p:"), jsdom)!;
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a.numero_fattura).toBe("55/A & B");
    expect(a.cedente_ragione_sociale).toBe("Ferramenta & Figli Srl");
    expect(a.righe[0]).toMatchObject({ descrizione: 'Porta <EZ1> "interna"' });
  });
  it("anche leggiFatturaPA (fatture emesse)", () => {
    const a = leggiFatturaPA(fattura(), minimo);
    const b = leggiFatturaPA(fattura(), jsdom);
    expect(a).toEqual(b);
  });
  it("rifiuta i file malformati", () => {
    for (const xml of ["", "non xml", "<a><b></a>", "<a>", "<a></a><b></b>", "<a b='1></a>", "<a><![CDATA[x</a>", "</a>"]) {
      expect(leggiXml(xml), xml).toBeNull();
    }
  });
  it("getElementsByTagName(\"*\") e localName per le notifiche dello SDI", () => {
    const d = leggiXml("<ns:Notifica xmlns:ns='x'><ns:TipoNotifica>NS</ns:TipoNotifica><IdentificativoSdI>123</IdentificativoSdI><Vuoto/></ns:Notifica>")!;
    expect(d.getElementsByTagName("*").map((e) => e.localName)).toEqual(["Notifica", "TipoNotifica", "IdentificativoSdI", "Vuoto"]);
    expect(d.getElementsByTagName("TipoNotifica")[0].textContent).toBe("NS");
    expect(d.getElementsByTagName("Vuoto")[0].textContent).toBe("");
  });
});
