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
