/**
 * Il popup «Importa XML o PDF» (12/11/2026): quello che mostra per far
 * decidere — tipo e peso del file, numero, data, controparte, importi — e come
 * tratta i tre casi che contano: la fattura leggibile, quella già a sistema,
 * il file che non si legge.
 *
 * Dati inventati: il repository è pubblico.
 */
import { describe, it, expect } from "vitest";
import {
  contaVoci,
  filtraVoci,
  ordinaVoci,
  costruisciVoci,
  chiaveFattura,
  etichettaTipoFile,
  leggiDatiXml,
  pesoLeggibile,
  puoSpuntare,
  riconosciTipoFile,
} from "@/lib/fatturazione/importaFatture";
import { chiaveRicevuta } from "@/lib/fatturazione/importMassivo";
import type { XmlDaImportare } from "@/lib/fatturazione/bulkXmlImport";

const MIA_PIVA = "11111111111";
const FORNITORE_PIVA = "22222222222";

/** Tracciato ridotto ma vero: prefisso di namespace compreso, come lo mandano i portali. */
function fattura({
  cedente = FORNITORE_PIVA,
  cessionario = MIA_PIVA,
  nomeCedente = "Edilfornitura Prova Srl",
  nomeCessionario = "Impresa Esempio Srl",
  numero = "2026/114",
  data = "2026-03-18",
  imponibile = "1000.00",
  imposta = "220.00",
  totale = "1220.00",
} = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cedente}</IdCodice></IdFiscaleIVA>
      <Anagrafica><Denominazione>${nomeCedente}</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cessionario}</IdCodice></IdFiscaleIVA>
      <Anagrafica><Denominazione>${nomeCessionario}</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa>
      <Data>${data}</Data><Numero>${numero}</Numero><ImportoTotaleDocumento>${totale}</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Ponteggio</Descrizione><PrezzoTotale>${imponibile}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>${imponibile}</ImponibileImporto><Imposta>${imposta}</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}

const voceXml = (nome: string, contenuto: string): XmlDaImportare => ({ nome, contenuto });
const parser = new DOMParser();
const VUOTI = { conFile: new Set<string>(), senzaFile: new Set<string>() };

describe("Importa XML o PDF — quello che si vede prima di importare", () => {
  it("riconosce il tipo di ogni file e ne scrive il peso in modo leggibile", () => {
    expect(riconosciTipoFile("IT01234_abc.XML")).toBe("xml");
    expect(riconosciTipoFile("IT01234_abc.xml.p7m")).toBe("p7m");
    expect(riconosciTipoFile("export.zip")).toBe("zip");
    expect(riconosciTipoFile("fattura.pdf")).toBe("pdf");
    expect(riconosciTipoFile("note.txt")).toBe("ignoto");
    expect(etichettaTipoFile("p7m")).toBe("XML firmato (p7m)");
    expect(pesoLeggibile(500)).toBe("500 B");
    expect(pesoLeggibile(2048)).toBe("2,0 kB");
    expect(pesoLeggibile(3 * 1024 * 1024)).toBe("3,0 MB");
  });

  it("legge numero, data, fornitore e importi dal tracciato, e dice se è emessa o ricevuta", () => {
    const d = leggiDatiXml(fattura(), MIA_PIVA, parser)!;
    expect(d).toMatchObject({ numero: "2026/114", data: "2026-03-18", soggetto: "Edilfornitura Prova Srl", direzione: "passiva" });
    expect(d.imponibile).toBe(1000);
    expect(d.iva).toBe(220);
    expect(d.totale).toBe(1220);

    // Emessa: il nome che dice qualcosa è quello del cliente, non il mio.
    const emessa = leggiDatiXml(fattura({ cedente: MIA_PIVA, cessionario: FORNITORE_PIVA, nomeCessionario: "Cliente Prova Spa" }), MIA_PIVA, parser)!;
    expect(emessa.direzione).toBe("attiva");
    expect(emessa.soggetto).toBe("Cliente Prova Spa");
  });

  it("un file rotto in mezzo agli altri diventa una riga in errore e non ferma nessuno", () => {
    const voci = costruisciVoci(
      [voceXml("buona.xml", fattura()), voceXml("rotta.xml", "<Ordine><Riga/></Ordine>")],
      [{ nome: "listino.txt", motivo: "Formato non riconosciuto" }],
      MIA_PIVA,
      { conFile: new Set<string>(), senzaFile: new Set<string>() },
      parser,
    );
    expect(voci).toHaveLength(3);
    expect(voci[0]).toMatchObject({ stato: "pronta", inclusa: true });
    expect(voci[1]).toMatchObject({ stato: "errore", inclusa: false });
    expect(voci[1].motivo).toMatch(/non è una fattura elettronica leggibile/i);
    expect(voci[2]).toMatchObject({ nome: "listino.txt", stato: "errore", inclusa: false, motivo: "Formato non riconosciuto" });
    expect(puoSpuntare(voci[1])).toBe(false);
    expect(contaVoci(voci)).toEqual({ incluse: 1, duplicate: 0, daCompletare: 0, errori: 2, importabili: 1 });
  });

  it("una fattura già a sistema si vede ma parte spenta", () => {
    const xml = fattura();
    const chiave = chiaveFattura(xml, "passiva")!;
    expect(chiave).toBe(chiaveRicevuta(FORNITORE_PIVA, "2026/114", "2026-03-18"));

    const voci = costruisciVoci([voceXml("doppia.xml", xml)], [], MIA_PIVA, { conFile: new Set([chiave]), senzaFile: new Set<string>() }, parser);
    expect(voci[0]).toMatchObject({ stato: "duplicata", inclusa: false });
    // Spuntabile resta: se uno la vuole rimandare può farlo di proposito.
    expect(puoSpuntare(voci[0])).toBe(true);
    expect(contaVoci(voci)).toEqual({ incluse: 0, duplicate: 1, daCompletare: 0, errori: 0, importabili: 1 });
  });

  it("l'elenco mette davanti quello che si importa e in fondo quello che non si legge", () => {
    const voci = costruisciVoci(
      [voceXml("gia.xml", fattura({ numero: "2026/90" })), voceXml("rotta.xml", "<Ordine/>"), voceXml("nuova.xml", fattura({ numero: "2026/200" }))],
      [],
      MIA_PIVA,
      { conFile: new Set([chiaveFattura(fattura({ numero: "2026/90" }), "passiva")!]), senzaFile: new Set<string>() },
      parser,
    );
    expect(ordinaVoci(voci).map((v) => v.nome)).toEqual(["nuova.xml", "gia.xml", "rotta.xml"]);
    // La ricerca guarda numero, soggetto e nome del file.
    expect(filtraVoci(voci, "2026/200").map((v) => v.nome)).toEqual(["nuova.xml"]);
    expect(filtraVoci(voci, "edilfornitura")).toHaveLength(2);
    expect(filtraVoci(voci, "rotta").map((v) => v.nome)).toEqual(["rotta.xml"]);
    expect(filtraVoci(voci, "   ")).toHaveLength(3);
  });

  it("la fattura registrata senza il suo file si importa lo stesso: è così che le si attacca l'originale", () => {
    const xml = fattura();
    const chiave = chiaveFattura(xml, "passiva")!;
    const voci = costruisciVoci([voceXml("da-completare.xml", xml)], [], MIA_PIVA,
      { conFile: new Set<string>(), senzaFile: new Set([chiave]) }, parser);
    expect(voci[0]).toMatchObject({ stato: "completa", inclusa: true });
    expect(voci[0].nota).toMatch(/le si attacca l'originale/);
    expect(contaVoci(voci)).toEqual({ incluse: 1, duplicate: 0, daCompletare: 1, errori: 0, importabili: 1 });
  });

  it("senza la partita IVA dell'azienda non si indovina dove va la fattura", () => {
    const voci = costruisciVoci([voceXml("x.xml", fattura())], [], null, VUOTI, parser);
    expect(voci[0].stato).toBe("errore");
    expect(voci[0].motivo).toMatch(/Partita IVA dell'azienda non impostata/);
  });

  it("una fattura di un'altra azienda non si importa alla cieca", () => {
    const altrui = fattura({ cedente: "33333333333", cessionario: "44444444444" });
    const voci = costruisciVoci([voceXml("altrui.xml", altrui)], [], MIA_PIVA, VUOTI, parser);
    expect(voci[0].stato).toBe("errore");
    expect(voci[0].motivo).toMatch(/né emessa né ricevuta/);
  });
});
