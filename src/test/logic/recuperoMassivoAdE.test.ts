import { describe, expect, it, vi } from "vitest";
import { inputMassivo, validateMassiveInput, vatNumber } from "../../../supabase/functions/_shared/billingMassive";
import { ItalaClient, readItalaCredentials } from "../../../supabase/functions/_shared/italaClient";
import { italaDocument, italaIssued } from "../../../supabase/functions/_shared/italaFatture";
import { LettoreXmlMinimo } from "../../../supabase/functions/_shared/xmlMinimo";

const now = new Date("2026-10-27T10:00:00Z");
const input = { partita_iva: "02010390439", data_da: "2026-01-01", data_a: "2026-03-31", tipo_richiesta: "RICEVUTE", tipo_data: "EMISSIONE" };
describe("Richieste massive: periodi e formato ufficiale", () => {
  it("tre mesi di calendario includono il 31 marzo", () => {
    expect(validateMassiveInput(input, now).data_a).toBe("2026-03-31");
    expect(() => validateMassiveInput({ ...input, data_a: "2026-04-01" }, now)).toThrow("tre mesi");
  });
  it.each(["2026-02-30", "2026-2-01", "test", ""])("rifiuta date inesistenti: %s", bad => {
    expect(() => validateMassiveInput({ ...input, data_da: bad }, now)).toThrow("Data non valida");
  });
  it("rifiuta il futuro, periodi invertiti e storia oltre i tre anni solari", () => {
    expect(() => validateMassiveInput({ ...input, data_da: "2026-10-01", data_a: "2026-10-28" }, now)).toThrow("future");
    expect(() => validateMassiveInput({ ...input, data_a: "2025-12-31" }, now)).toThrow("precede");
    expect(() => validateMassiveInput({ ...input, data_da: "2023-12-01", data_a: "2024-01-01" }, now)).toThrow("tre anni");
  });
  it("non permette la data di ricezione per emesse", () => {
    expect(() => validateMassiveInput({ ...input, tipo_richiesta: "EMESSE", tipo_data: "RICEZIONE" }, now)).toThrow("solo");
  });
  it("partita IVA normalizzata, senza XML injection", () => {
    expect(vatNumber("IT02010390439")).toBe("02010390439");
    expect(() => vatNumber("02010390439</Piva>")).toThrow();
  });
  it("InputMassivo 1.5 contiene le scelte e i ruoli corrispondenti", () => {
    const xml = inputMassivo(validateMassiveInput({ ...input, tipo_data: "ACCOGLIENZA_SDI" }, now));
    const doc = new LettoreXmlMinimo().parseFromString(xml, "text/xml")!;
    expect(doc.getElementsByTagName("FattureDataAcc")).toHaveLength(1);
    expect(doc.getElementsByTagName("Cessionario")[0].textContent).toBe("CESSIONARIO");
    expect(xml).toContain("FILE_FATTURA");
  });
});
describe("ITALA REST 2.0", () => {
  it("usa le credenziali API e un endpoint di test esplicito", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const client = new ItalaClient(JSON.stringify({ client_id: "client", client_secret: "secret", environment: "test" }), fetcher);
    await client.request("/credito");
    expect(fetcher.mock.calls[0][0]).toBe("https://fattura-elettronica-api.it/ws2.0/test/credito");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Basic ${btoa("client:secret")}` });
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
  });
  it("filtra le fatture per partita IVA e non consuma lo stato unread", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]"));
    await new ItalaClient("legacy-bearer", fetcher).invoicePage("02010390439", 2);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("partita_iva")).toBe("02010390439");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("unread")).toBe("false");
  });
  it("non concede accesso a richieste di altre aziende su un account multisoggetto", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 123, partita_iva: "11111111111" })));
    await expect(new ItalaClient("token", fetcher).ownedRequest(123, "02010390439")).rejects.toThrow("non appartenente");
  });
  it("nessuna richiesta può deviare le credenziali verso URL arbitrari", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ItalaClient("token", fetcher);
    await expect(client.request("https://example.com")).rejects.toThrow("Percorso");
    await expect(client.ownedRequest("../credito", "02010390439")).rejects.toThrow("Identificativo");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("non restituisce segreti inclusi accidentalmente in un errore del provider", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"password=segreto"}', { status: 400 }));
    await expect(new ItalaClient("token", fetcher).request("/credito")).rejects.toThrow("HTTP 400");
    await expect(new ItalaClient("token", fetcher).request("/credito")).rejects.not.toThrow("segreto");
  });
  it("rifiuta configurazioni prive dell'ambiente", () => {
    expect(() => readItalaCredentials('{"client_id":"a","client_secret":"b"}')).toThrow("incomplete");
  });
});
const xml = `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="urn:fattura"><FatturaElettronicaHeader><DatiTrasmissione><ProgressivoInvio>123</ProgressivoInvio></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>02010390439</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Impresa</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>11111111111</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
</FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Numero>1</Numero><Data>2026-01-10</Data><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Materiale</Descrizione><Quantita>1</Quantita><PrezzoUnitario>100</PrezzoUnitario><PrezzoTotale>100</PrezzoTotale><AliquotaIVA>22</AliquotaIVA></DettaglioLinee><DatiRiepilogo><AliquotaIVA>22</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`;
describe("Importazione ITALA: i ricavi vengono dalle emesse", () => {
  const row = { id: 123, partita_iva: "02010390439", ricezione: 0, sdi_fattura_xml: xml, sdi_stato: "CONS" };
  it("estrae importi e cliente dall'XML reale, senza fallback inventati", () => {
    expect(italaIssued(row, "02010390439")).toMatchObject({ number: "1", total: 122, subtotal: 100, taxAmount: 22, clientName: "Cliente", clientVat: "11111111111" });
  });
  it("blocca fatture di altre aziende e direzioni incoerenti", () => {
    expect(() => italaDocument(row, "22222222222")).toThrow("altra partita IVA");
    expect(() => italaDocument({ ...row, ricezione: 1 }, "02010390439")).toThrow("direzione");
  });
  it("una ricevuta valida non entra mai fra le emesse", () => {
    const incoming = { ...row, ricezione: 1, partita_iva: "11111111111" };
    expect(italaDocument(incoming, "11111111111").incoming).toBe(true);
    expect(() => italaIssued(incoming, "11111111111")).toThrow("ricavo");
  });
  it("rifiuta fatture senza XML e lotti invece di perdere corpi in silenzio", () => {
    expect(() => italaDocument({ ...row, sdi_fattura_xml: undefined }, "02010390439")).toThrow("XML");
    const body = xml.match(/<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/)![0];
    expect(() => italaDocument({ ...row, sdi_fattura_xml: xml.replace("</p:FatturaElettronica>", body + "</p:FatturaElettronica>") }, "02010390439")).toThrow("più corpi");
  });
});
