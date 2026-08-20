import { describe, it, expect } from "vitest";
import {
  classificaFileFattura,
  motivoScarto,
  sembraFatturaElettronica,
  espandiXmlDaFiles,
  eliminaDoppioniInterni,
  riepilogoEsiti,
  descriviRiepilogo,
} from "@/lib/fatturazione/bulkXmlImport";

/** Tracciato minimo ma realistico: prefisso di namespace incluso, come lo emettono i portali. */
const XML_VALIDO = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdCodice>12345678901</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader>
  <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><Numero>123</Numero></DatiGeneraliDocumento></DatiGenerali></FatturaElettronicaBody>
</p:FatturaElettronica>`;

const XML_SENZA_PREFISSO = `<?xml version="1.0"?><FatturaElettronica versione="FPA12"><FatturaElettronicaBody/></FatturaElettronica>`;

function file(nome: string, contenuto = XML_VALIDO): File {
  return new File([contenuto], nome, { type: "text/xml" });
}

describe("classificaFileFattura", () => {
  it("riconosce i formati utili", () => {
    expect(classificaFileFattura("IT12345678901_00001.xml")).toBe("xml");
    expect(classificaFileFattura("export.zip")).toBe("zip");
  });

  it("riconosce i firmati per poterli rifiutare con un messaggio utile", () => {
    expect(classificaFileFattura("IT12345678901_00001.xml.p7m")).toBe("p7m");
  });

  it("non si fa ingannare dalle maiuscole dei portali", () => {
    expect(classificaFileFattura("FATTURA.XML")).toBe("xml");
    expect(classificaFileFattura("ARCHIVIO.ZIP")).toBe("zip");
    expect(classificaFileFattura("FIRMATA.P7M")).toBe("p7m");
  });

  it("scarta il resto", () => {
    expect(classificaFileFattura("fattura.pdf")).toBe("ignoto");
    expect(classificaFileFattura("senzaestensione")).toBe("ignoto");
  });
});

describe("motivoScarto", () => {
  it("sul p7m dice cosa scaricare invece di limitarsi a dire di no", () => {
    const m = motivoScarto("p7m", "x.xml.p7m");
    expect(m).toMatch(/non firmata/i);
  });

  it("sul formato ignoto nomina l'estensione trovata", () => {
    expect(motivoScarto("ignoto", "fattura.pdf")).toContain("pdf");
  });
});

describe("sembraFatturaElettronica", () => {
  it("accetta il tracciato con e senza prefisso di namespace", () => {
    expect(sembraFatturaElettronica(XML_VALIDO)).toBe(true);
    expect(sembraFatturaElettronica(XML_SENZA_PREFISSO)).toBe(true);
  });

  it("rifiuta un XML che fattura non e'", () => {
    expect(sembraFatturaElettronica("<?xml version='1.0'?><Preventivo><Riga/></Preventivo>")).toBe(false);
  });

  it("non si lascia ingannare da un nome citato nel testo", () => {
    expect(sembraFatturaElettronica("<doc>parliamo di FatturaElettronica ma non lo siamo</doc>")).toBe(false);
  });
});

describe("espandiXmlDaFiles", () => {
  it("accetta piu' XML in un colpo solo", async () => {
    const r = await espandiXmlDaFiles([file("a.xml"), file("b.xml")]);
    expect(r.xml.map((x) => x.nome)).toEqual(["a.xml", "b.xml"]);
    expect(r.scartati).toHaveLength(0);
  });

  it("scarta il p7m senza far fallire gli altri file del lotto", async () => {
    const r = await espandiXmlDaFiles([file("buona.xml"), file("firmata.xml.p7m", "\x00\x01binario")]);
    expect(r.xml).toHaveLength(1);
    expect(r.xml[0].nome).toBe("buona.xml");
    expect(r.scartati).toHaveLength(1);
    expect(r.scartati[0].motivo).toMatch(/non firmata/i);
  });

  it("scarta un XML che non e' una fattura, dicendo perche'", async () => {
    const r = await espandiXmlDaFiles([file("ordine.xml", "<Ordine/>")]);
    expect(r.xml).toHaveLength(0);
    expect(r.scartati[0].motivo).toMatch(/FatturaElettronica/);
  });

  it("scarta i formati estranei", async () => {
    const r = await espandiXmlDaFiles([new File(["x"], "nota.pdf")]);
    expect(r.xml).toHaveLength(0);
    expect(r.scartati).toHaveLength(1);
  });
});

describe("eliminaDoppioniInterni", () => {
  it("toglie lo stesso XML caricato due volte con nomi diversi", () => {
    const out = eliminaDoppioniInterni([
      { nome: "a.xml", contenuto: XML_VALIDO },
      { nome: "copia-di-a.xml", contenuto: XML_VALIDO },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nome).toBe("a.xml");
  });

  it("ignora le differenze di sola spaziatura", () => {
    const out = eliminaDoppioniInterni([
      { nome: "a.xml", contenuto: "<FatturaElettronica> <Body/> </FatturaElettronica>" },
      { nome: "b.xml", contenuto: "<FatturaElettronica><Body/></FatturaElettronica>" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("tiene fatture diverse", () => {
    const out = eliminaDoppioniInterni([
      { nome: "a.xml", contenuto: "<FatturaElettronica><Numero>1</Numero></FatturaElettronica>" },
      { nome: "b.xml", contenuto: "<FatturaElettronica><Numero>2</Numero></FatturaElettronica>" },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("riepilogoEsiti / descriviRiepilogo", () => {
  it("conta ogni esito nella sua colonna", () => {
    const r = riepilogoEsiti([
      { nome: "a.xml", stato: "importata" },
      { nome: "b.xml", stato: "importata" },
      { nome: "c.xml", stato: "duplicata" },
      { nome: "d.xml", stato: "errore", motivo: "partita IVA non corrisponde" },
    ]);
    expect(r).toEqual({ importate: 2, duplicate: 1, errori: 1, totale: 4 });
  });

  it("non nasconde i fallimenti nel messaggio", () => {
    const testo = descriviRiepilogo({ importate: 10, duplicate: 3, errori: 2, totale: 15 });
    expect(testo).toContain("10 importate");
    expect(testo).toContain("3 gia' presenti");
    expect(testo).toContain("2 non riuscite");
  });

  it("tace sulle voci a zero invece di scrivere '0 non riuscite'", () => {
    expect(descriviRiepilogo({ importate: 5, duplicate: 0, errori: 0, totale: 5 })).toBe("5 importate");
  });

  it("e' esplicito quando non ha fatto nulla", () => {
    expect(descriviRiepilogo({ importate: 0, duplicate: 0, errori: 0, totale: 0 })).toMatch(/nessuna/i);
  });
});

// ─── Direzione: emessa o ricevuta? ───────────────────────────────────────

import { normalizzaPartitaIva, leggiPartiteIva, classificaDirezione } from "@/lib/fatturazione/bulkXmlImport";

const MIA_PIVA = "12345678901";
const ALTRUI = "98765432109";

function fattura(cedente: string, cessionario: string, prefisso = "p:"): string {
  const ns = prefisso ? ` xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<${prefisso}FatturaElettronica versione="FPR12"${ns}>
  <FatturaElettronicaHeader>
    <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cedente}</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cessionario}</IdCodice></IdFiscaleIVA></DatiAnagrafici></CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody/>
</${prefisso}FatturaElettronica>`;
}

describe("normalizzaPartitaIva", () => {
  it("ignora spazi, maiuscole e prefisso paese", () => {
    expect(normalizzaPartitaIva(" it12345678901 ")).toBe("12345678901");
    expect(normalizzaPartitaIva("IT12345678901")).toBe("12345678901");
    expect(normalizzaPartitaIva("12345678901")).toBe("12345678901");
  });

  it("regge il vuoto", () => {
    expect(normalizzaPartitaIva(null)).toBe("");
    expect(normalizzaPartitaIva(undefined)).toBe("");
  });
});

describe("leggiPartiteIva", () => {
  it("legge entrambe le parti", () => {
    expect(leggiPartiteIva(fattura(MIA_PIVA, ALTRUI))).toEqual({ cedente: MIA_PIVA, cessionario: ALTRUI });
  });

  it("funziona anche senza prefisso di namespace", () => {
    expect(leggiPartiteIva(fattura(MIA_PIVA, ALTRUI, ""))).toEqual({ cedente: MIA_PIVA, cessionario: ALTRUI });
  });

  it("non esplode su XML malformato", () => {
    expect(leggiPartiteIva("<FatturaElettronica><rotto")).toEqual({ cedente: null, cessionario: null });
  });
});

describe("classificaDirezione", () => {
  it("se emetto io e' attiva", () => {
    expect(classificaDirezione(fattura(MIA_PIVA, ALTRUI), MIA_PIVA)).toBe("attiva");
  });

  it("se ricevo io e' passiva", () => {
    expect(classificaDirezione(fattura(ALTRUI, MIA_PIVA), MIA_PIVA)).toBe("passiva");
  });

  it("non si fa ingannare dal prefisso IT nella configurazione", () => {
    expect(classificaDirezione(fattura(MIA_PIVA, ALTRUI), `IT${MIA_PIVA}`)).toBe("attiva");
  });

  it("se l'azienda non c'entra resta incerta invece di indovinare", () => {
    expect(classificaDirezione(fattura(ALTRUI, "11111111111"), MIA_PIVA)).toBe("incerta");
  });

  it("l'autofattura non diventa un ricavo per sbaglio", () => {
    expect(classificaDirezione(fattura(MIA_PIVA, MIA_PIVA), MIA_PIVA)).toBe("incerta");
  });

  it("senza la partita IVA dell'azienda non indovina nulla", () => {
    expect(classificaDirezione(fattura(MIA_PIVA, ALTRUI), null)).toBe("incerta");
    expect(classificaDirezione(fattura(MIA_PIVA, ALTRUI), "")).toBe("incerta");
  });
});

// ─── Fattura reale (TeamSystem/Agyo, regime forfettario) ─────────────────
//
// Struttura presa da un XML vero. Le insidie che deve reggere:
//   - prefisso di namespace ns3: sulla radice
//   - QUATTRO partite IVA nell'intestazione, e la PRIMA e' dell'intermediario
//     che trasmette (TeamSystem), non di chi emette. Un parser che prendesse
//     il primo IdCodice classificherebbe male ogni fattura passata da Aruba.
//   - firma XAdES annegata nel documento (file .xml, non .p7m)

const PIVA_TRASMITTENTE = "01641790702"; // TeamSystem: trasmette, non fattura
const PIVA_EMITTENTE = "02010390439";
const PIVA_DESTINATARIO = "01941970939";

const FATTURA_REALE = `<?xml version="1.0" encoding="UTF-8"?><ns3:FatturaElettronica xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ns2="http://www.w3.org/2000/09/xmldsig#" versione="FPR12">
    <FatturaElettronicaHeader>
        <DatiTrasmissione>
            <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${PIVA_TRASMITTENTE}</IdCodice></IdTrasmittente>
            <ProgressivoInvio>00005i5oai</ProgressivoInvio>
            <FormatoTrasmissione>FPR12</FormatoTrasmissione>
            <CodiceDestinatario>KRRH6B9</CodiceDestinatario>
            <ContattiTrasmittente><Telefono>0874-60561</Telefono></ContattiTrasmittente>
        </DatiTrasmissione>
        <CedentePrestatore>
            <DatiAnagrafici>
                <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_EMITTENTE}</IdCodice></IdFiscaleIVA>
                <CodiceFiscale>NDRFRN97D10Z129M</CodiceFiscale>
                <Anagrafica><Denominazione>ANDRICIUC FLORIN OVIDIU</Denominazione></Anagrafica>
                <RegimeFiscale>RF19</RegimeFiscale>
            </DatiAnagrafici>
            <Sede><Indirizzo>Via Nicola Franceschini 12</Indirizzo><CAP>62025</CAP><Comune>Pioraco</Comune><Provincia>MC</Provincia><Nazione>IT</Nazione></Sede>
        </CedentePrestatore>
        <CessionarioCommittente>
            <DatiAnagrafici>
                <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_DESTINATARIO}</IdCodice></IdFiscaleIVA>
                <CodiceFiscale>01941970939</CodiceFiscale>
                <Anagrafica><Denominazione>Renova Solution S.r.l.</Denominazione></Anagrafica>
            </DatiAnagrafici>
            <Sede><Indirizzo>Via Revedole 78/B</Indirizzo><CAP>33170</CAP><Comune>Pordenone</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede>
        </CessionarioCommittente>
        <TerzoIntermediarioOSoggettoEmittente>
            <DatiAnagrafici>
                <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_TRASMITTENTE}</IdCodice></IdFiscaleIVA>
                <CodiceFiscale>01641790702</CodiceFiscale>
                <Anagrafica><Denominazione>TEAMSYSTEM SERVICE SRL</Denominazione></Anagrafica>
            </DatiAnagrafici>
        </TerzoIntermediarioOSoggettoEmittente>
        <SoggettoEmittente>TZ</SoggettoEmittente>
    </FatturaElettronicaHeader>
    <FatturaElettronicaBody>
        <DatiGenerali><DatiGeneraliDocumento>
            <TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa>
            <Data>2026-08-14</Data><Numero>41</Numero>
            <DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>
            <DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>0.00</ImportoContributoCassa><ImponibileCassa>0.00</ImponibileCassa><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DatiCassaPrevidenziale>
            <ImportoTotaleDocumento>920.37</ImportoTotaleDocumento>
        </DatiGeneraliDocumento></DatiGenerali>
        <DatiBeniServizi>
            <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Consulenza Marketing mese di Luglio</Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>920.37</PrezzoUnitario><PrezzoTotale>920.37</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DettaglioLinee>
            <DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura><ImponibileImporto>920.37</ImponibileImporto><Imposta>0.00</Imposta><RiferimentoNormativo>Non soggetta art. 1/54-89 L. 190/2014</RiferimentoNormativo></DatiRiepilogo>
        </DatiBeniServizi>
        <DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><Beneficiario>FLORIN OVIDIU ANDRICIUC</Beneficiario><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2026-08-14</DataScadenzaPagamento><ImportoPagamento>920.37</ImportoPagamento><IBAN>IT00X0000000000000000000000</IBAN></DettaglioPagamento></DatiPagamento>
    </FatturaElettronicaBody>
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="id-abc"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>tdFz7AyxL/mxbDM7OY20FbvWVJWPQqEbZaLaASuGmxM=</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>aTk4pK67RKdTOButE+35T2eA</ds:SignatureValue></ds:Signature></ns3:FatturaElettronica>`;

describe("fattura reale TeamSystem", () => {
  it("passa il controllo di forma nonostante il prefisso ns3 e la firma annegata", () => {
    expect(sembraFatturaElettronica(FATTURA_REALE)).toBe(true);
  });

  it("NON scambia l'intermediario che trasmette per chi emette", () => {
    const p = leggiPartiteIva(FATTURA_REALE);
    expect(p.cedente).toBe(PIVA_EMITTENTE);
    expect(p.cedente).not.toBe(PIVA_TRASMITTENTE);
    expect(p.cessionario).toBe(PIVA_DESTINATARIO);
  });

  it("per chi l'ha emessa e' attiva", () => {
    expect(classificaDirezione(FATTURA_REALE, PIVA_EMITTENTE)).toBe("attiva");
  });

  it("per Renova, che la riceve, e' passiva", () => {
    expect(classificaDirezione(FATTURA_REALE, PIVA_DESTINATARIO)).toBe("passiva");
  });

  it("per TeamSystem, che l'ha solo trasmessa, non e' ne' l'una ne' l'altra", () => {
    expect(classificaDirezione(FATTURA_REALE, PIVA_TRASMITTENTE)).toBe("incerta");
  });

  it("sopravvive al giro completo di caricamento come file", async () => {
    const r = await espandiXmlDaFiles([new File([FATTURA_REALE], "IT02010390439_00041.xml")]);
    expect(r.scartati).toHaveLength(0);
    expect(r.xml).toHaveLength(1);
    expect(classificaDirezione(r.xml[0].contenuto, PIVA_DESTINATARIO)).toBe("passiva");
  });
});

// ─── Verifica contabile campo per campo ──────────────────────────────────
//
// Gira il LETTORE VERO — lo stesso modulo che usa la edge function in
// produzione — sulla fattura reale, e controlla ogni valore contro quello
// che c'e' scritto sul documento. Se qui passa, i numeri che finiscono in
// contabilita' sono quelli giusti.

import { leggiFatturaPA, arrotonda, type LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

const parser = new DOMParser() as unknown as LettoreXml;

describe("lettura contabile della fattura reale", () => {
  const f = leggiFatturaPA(FATTURA_REALE, parser);

  it("la legge senza arrendersi", () => {
    expect(f).not.toBeNull();
  });

  it("identifica chi emette e chi riceve, ignorando l'intermediario", () => {
    expect(f!.cedentePiva).toBe(PIVA_EMITTENTE);
    expect(f!.cedenteNome).toBe("ANDRICIUC FLORIN OVIDIU");
    expect(f!.cessionarioPiva).toBe(PIVA_DESTINATARIO);
  });

  it("prende numero, data e tipo del documento", () => {
    expect(f!.numero).toBe("41");
    expect(f!.data).toBe("2026-08-14");
    expect(f!.documentType).toBe("invoice");
  });

  it("IMPORTI: imponibile 920,37 · IVA 0,00 · totale 920,37", () => {
    expect(f!.imponibile).toBe(920.37);
    expect(f!.imposta).toBe(0);
    expect(f!.totale).toBe(920.37);
  });

  it("i conti tornano: imponibile + imposta = totale", () => {
    expect(arrotonda(f!.imponibile + f!.imposta)).toBe(f!.totale);
  });

  it("la somma delle righe corrisponde all'imponibile del riepilogo", () => {
    const somma = arrotonda(f!.righe.reduce((s, r) => s + r.line_net, 0));
    expect(somma).toBe(f!.imponibile);
  });

  it("IVA: regime forfettario, aliquota 0 con natura N2.2 conservata", () => {
    expect(f!.righe[0].tax_rate).toBe(0);
    expect(f!.righe[0].tax_nature).toBe("N2.2");
    expect(f!.righe[0].line_tax).toBe(0);
  });

  it("il bollo virtuale da 2 euro viene visto ma NON sommato al totale", () => {
    expect(f!.bollo).toBe(2);
    expect(f!.totale).toBe(920.37); // il documento dichiara 920,37, non 922,37
  });

  it("la cassa previdenziale a zero non inquina l'aliquota della riga", () => {
    // DatiCassaPrevidenziale contiene un altro AliquotaIVA: se il lettore lo
    // pescasse per sbaglio, l'IVA della riga sarebbe sbagliata.
    expect(f!.righe).toHaveLength(1);
    expect(f!.righe[0].tax_rate).toBe(0);
  });

  it("RIGA: descrizione, quantita' e prezzi esatti", () => {
    const r = f!.righe[0];
    expect(r.description).toBe("Consulenza Marketing mese di Luglio");
    expect(r.quantity).toBe(1);
    expect(r.unit_price).toBe(920.37);
    expect(r.line_net).toBe(920.37);
    expect(r.line_gross).toBe(920.37);
    expect(r.sort_order).toBe(0);
  });

  it("CLIENTE: ragione sociale, partita IVA e indirizzo completi", () => {
    expect(f!.cliente.nome).toBe("Renova Solution S.r.l.");
    expect(f!.cliente.piva).toBe(PIVA_DESTINATARIO);
    expect(f!.cliente.cf).toBe("01941970939");
    expect(f!.cliente.indirizzo).toBe("Via Revedole 78/B");
    expect(f!.cliente.citta).toBe("Pordenone");
    expect(f!.cliente.cap).toBe("33170");
    expect(f!.cliente.provincia).toBe("PN");
    expect(f!.cliente.paese).toBe("IT");
  });

  it("il codice destinatario arriva dall'intestazione (era il bug)", () => {
    expect(f!.cliente.sdi).toBe("KRRH6B9");
  });

  it("PAGAMENTO: scadenza, modalita' e IBAN", () => {
    expect(f!.scadenza).toBe("2026-08-14");
    expect(f!.modalitaPagamento).toBe("MP05");
    expect(f!.iban).toBe("IT00X0000000000000000000000");
  });
});

describe("il lettore non inventa mai numeri", () => {
  it("su un file che fattura non e' ritorna null, non un oggetto a meta'", () => {
    expect(leggiFatturaPA("<Ordine><Riga/></Ordine>", parser)).toBeNull();
  });

  it("senza numero o data si ferma", () => {
    const senzaNumero = FATTURA_REALE.replace("<Numero>41</Numero>", "");
    expect(leggiFatturaPA(senzaNumero, parser)).toBeNull();
  });

  it("con IVA al 22% calcola l'imposta di riga corretta", () => {
    const conIva = FATTURA_REALE
      .replace("<ImponibileImporto>920.37</ImponibileImporto><Imposta>0.00</Imposta>",
               "<ImponibileImporto>1000.00</ImponibileImporto><Imposta>220.00</Imposta>")
      .replace("<PrezzoTotale>920.37</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA>",
               "<PrezzoTotale>1000.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA>")
      .replace("<ImportoTotaleDocumento>920.37</ImportoTotaleDocumento>",
               "<ImportoTotaleDocumento>1220.00</ImportoTotaleDocumento>");
    const r = leggiFatturaPA(conIva, parser)!;
    expect(r.imponibile).toBe(1000);
    expect(r.imposta).toBe(220);
    expect(r.totale).toBe(1220);
    expect(r.righe[0].line_tax).toBe(220);
    expect(r.righe[0].line_gross).toBe(1220);
  });

  it("una nota di credito TD04 non viene scambiata per una fattura", () => {
    const nota = FATTURA_REALE.replace("<TipoDocumento>TD01</TipoDocumento>", "<TipoDocumento>TD04</TipoDocumento>");
    expect(leggiFatturaPA(nota, parser)!.documentType).toBe("credit_note");
  });

  it("somma piu' riepiloghi IVA con aliquote diverse", () => {
    const due = FATTURA_REALE.replace(
      "</DatiRiepilogo>",
      "</DatiRiepilogo><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>",
    );
    const r = leggiFatturaPA(due, parser)!;
    expect(r.imponibile).toBe(1020.37);
    expect(r.imposta).toBe(22);
  });
});
