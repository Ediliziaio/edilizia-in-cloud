import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";
import { leggiFatturaPA } from "../../../supabase/functions/_shared/fatturapaReader";
import { LettoreXmlMinimo } from "../../../supabase/functions/_shared/xmlMinimo";
import { originaleCorrispondeAllaFattura } from "../../../supabase/functions/_shared/originaleFatturaEmessa";
import { bytesToBase64 } from "../../../supabase/functions/_shared/base64";

const runtime = vi.hoisted(() => ({ db: null as unknown as DbMinimo, accesso: true, autenticato: true }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => runtime.db }));
vi.mock("../../../supabase/functions/_shared/effectiveCompany.ts", () => ({ canAccessCompany: async () => runtime.accesso }));

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="urn:fattura" versione="FPR12">
<FatturaElettronicaHeader>
<DatiTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdCodice>12345678901</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Impresa demo</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale><Anagrafica><Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Prova 10</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Nazione>IT</Nazione></Sede></CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-10-01</Data><Numero>FPR 10/26</Numero><ImportoTotaleDocumento>122.02</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Posa serramenti</Descrizione><Quantita>2</Quantita><UnitaMisura>pz</UnitaMisura><PrezzoUnitario>50</PrezzoUnitario><PrezzoTotale>100</PrezzoTotale><AliquotaIVA>22</AliquotaIVA></DettaglioLinee><DatiRiepilogo><AliquotaIVA>22</AliquotaIVA><ImponibileImporto>100</ImponibileImporto><Imposta>22</Imposta></DatiRiepilogo></DatiBeniServizi>
<DatiPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2026-11-01</DataScadenzaPagamento><IBAN>IT00DEMO</IBAN></DettaglioPagamento></DatiPagamento>
</FatturaElettronicaBody></p:FatturaElettronica>`;

const letta = leggiFatturaPA(XML, new LettoreXmlMinimo())!;
const archiviata = (extra: Riga = {}): Riga => ({
  id: "inv-1", company_id: "az-1", external_provider: "xml_import", external_id: "FPR 10/26|2026-10-01",
  external_xml_url: null, invoice_number: letta.numero, issue_date: letta.data, document_type: letta.documentType,
  client_company_name: letta.cliente.nome, client_fiscal_code: letta.cliente.cf, client_address: letta.cliente.indirizzo,
  client_city: letta.cliente.citta, client_zip: letta.cliente.cap, client_country: letta.cliente.paese,
  subtotal: letta.imponibile, tax_amount: letta.imposta, total: letta.totale, paid_amount: 80,
  due_date: letta.scadenza, bank_iban: letta.iban, payment_method: letta.modalitaPagamento, ...extra,
});

let carica: ReturnType<typeof vi.fn>;
let rimuovi: ReturnType<typeof vi.fn>;
let handler: ((req: Request) => Promise<Response>) | null;

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  runtime.db = new DbMinimo(); runtime.accesso = true; runtime.autenticato = true; handler = null;
  runtime.db.tabelle.companies = [{ id: "az-1", vat_number: "12345678901", name: "Impresa demo" }];
  runtime.db.tabelle.marketing_contacts = [{ id: "cliente-1", company_id: "az-1", fiscal_code: letta.cliente.cf, deleted_at: null }];
  carica = vi.fn(async () => ({ error: null })); rimuovi = vi.fn(async () => ({ error: null }));
  Object.assign(runtime.db, { auth: { getUser: async () => ({ data: { user: runtime.autenticato ? { id: "utente-1" } : null } }) },
    storage: { from: vi.fn(() => ({ upload: carica, remove: rimuovi })) } });
});
afterEach(() => vi.unstubAllGlobals());

async function importa(corpo: Riga = {}, token = "Bearer demo") {
  const deno = denoFinto({ SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" });
  if (!handler) {
    vi.resetModules(); vi.stubGlobal("Deno", deno.finto);
    const file = "../../../supabase/functions/importa-fattura-attiva-xml/index.ts";
    await import(/* @vite-ignore */ file);
    handler = deno.gestore() as (req: Request) => Promise<Response>;
  }
  vi.stubGlobal("Deno", deno.finto);
  const response = await handler(new Request("https://example.invalid/import", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: "az-1", xml_content: XML, ...corpo }) }));
  return { status: response.status, data: await response.json() };
}

function esistente(extra: Riga = {}) {
  runtime.db.tabelle.invoices = [archiviata(extra)];
  runtime.db.tabelle.invoice_lines = letta.righe.map(r => ({ ...r, invoice_id: "inv-1" }));
}

describe("Originale emessa: confronto prima di collegarlo allo storico", () => {
  it("riconosce il documento, usando i totali dichiarati anche quando diversi dalla somma righe", () => {
    expect(letta.totale).toBe(122.02);
    expect(originaleCorrispondeAllaFattura(archiviata(), letta, letta.righe.map(r => ({ ...r })))).toBe(true);
  });
  it.each([
    ["client_fiscal_code", "ALTROCF"], ["client_address", "Via diversa"], ["subtotal", 101], ["total", 122],
    ["document_type", "credit_note"], ["invoice_number", "FPR 11/26"], ["issue_date", "2026-09-01"],
    ["bank_iban", "IT99ALTRO"], ["due_date", "2026-12-01"], ["tax_amount", null],
  ])("non collega un originale differente per %s", (campo, valore) => {
    expect(originaleCorrispondeAllaFattura(archiviata({ [campo]: valore }), letta, letta.righe.map(r => ({ ...r })))).toBe(false);
  });
  it.each(["description", "quantity", "unit_price", "line_net", "tax_nature"])("controlla anche %s delle righe", campo => {
    const righe = letta.righe.map(r => ({ ...r, [campo]: typeof r[campo as keyof typeof r] === "number" ? 999 : "altra voce" }));
    expect(originaleCorrispondeAllaFattura(archiviata(), letta, righe)).toBe(false);
  });
  it("senza righe rifiuta il collegamento automatico", () => {
    expect(originaleCorrispondeAllaFattura(archiviata(), letta, [])).toBe(false);
  });
});

describe("Gestore vero importa-fattura-attiva-xml (database e storage finti)", () => {
  it("archivia l'XML in privato senza sovrascriverlo e conserva i dettagli fiscali", async () => {
    const originale = new TextEncoder().encode(XML.replace(/\n/g, "\r\n"));
    const result = await importa({ originale_base64: bytesToBase64(originale) });
    expect(result.status).toBe(200);
    const invoice = runtime.db.tabelle.invoices[0];
    expect(invoice).toMatchObject({ client_fiscal_code: letta.cliente.cf, client_address: "Via Prova 10", total: 122.02, status: "issued" });
    expect(invoice.external_xml_url).toMatch(/^fatture-xml\/az-1\/emesse-importate\/.*\.xml$/);
    expect(carica).toHaveBeenCalledWith(expect.stringMatching(/^az-1\//), expect.any(Blob), { upsert: false });
    const blob = carica.mock.calls[0][1] as Blob;
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(originale));
    expect(runtime.db.tabelle.invoice_lines[0].description).toBe("Posa serramenti");
  });
  it("completa solo il riferimento XML: nessuna variazione di incassi, importi, righe o numero", async () => {
    esistente(); const prima = structuredClone(runtime.db.tabelle.invoices[0]);
    const result = await importa();
    expect(result.data).toMatchObject({ success: true, duplicate: true, completed: true, id: "inv-1" });
    expect(runtime.db.scritture).toEqual([{ tabella: "invoices", tipo: "update", dati: { external_xml_url: expect.stringContaining("fatture-xml/az-1/") } }]);
    expect({ ...runtime.db.tabelle.invoices[0], external_xml_url: null }).toEqual(prima);
  });
  it("un originale già presente non viene rimpiazzato", async () => {
    esistente({ external_xml_url: "fatture-xml/az-1/originale.xml" });
    expect((await importa()).data).toMatchObject({ duplicate: true });
    expect(carica).not.toHaveBeenCalled(); expect(runtime.db.scritture).toHaveLength(0);
  });
  it("stesso numero ma dati diversi: rifiuta, senza duplicare o cambiare lo storico", async () => {
    esistente({ total: 999 });
    expect((await importa()).status).toBe(409);
    expect(carica).not.toHaveBeenCalled(); expect(runtime.db.scritture).toHaveLength(0);
  });
  it("non sostituisce una fattura emessa nativamente", async () => {
    esistente({ external_provider: null });
    expect((await importa()).status).toBe(409);
    expect(carica).not.toHaveBeenCalled(); expect(runtime.db.scritture).toHaveLength(0);
  });
  it("rifiuta una fattura ricevuta prima di qualsiasi scrittura", async () => {
    runtime.db.tabelle.companies[0].vat_number = "99999999999";
    expect((await importa()).status).toBe(422);
    expect(carica).not.toHaveBeenCalled(); expect(runtime.db.scritture).toHaveLength(0);
  });
  it("l'azienda non autorizzata non può leggere o archiviare il documento", async () => {
    runtime.accesso = false;
    expect((await importa()).status).toBe(403);
    expect(carica).not.toHaveBeenCalled(); expect(runtime.db.scritture).toHaveLength(0);
  });
  it("senza autenticazione rifiuta", async () => {
    expect((await importa({}, "")).status).toBe(401);
    runtime.autenticato = false;
    expect((await importa()).status).toBe(401);
    expect(carica).not.toHaveBeenCalled();
  });
  it("il testo dichiarato non può cambiare i dati del file originale", async () => {
    expect((await importa({ originale_base64: bytesToBase64(new TextEncoder().encode(XML)), xml_content: XML.replace("122.02", "999") })).status).toBe(200);
    expect(runtime.db.tabelle.invoices[0].total).toBe(122.02);
  });
  it("file originale invalido: non si ripiega sul testo XML dichiarato", async () => {
    expect((await importa({ originale_base64: bytesToBase64(new TextEncoder().encode("non XML")) })).status).toBe(422);
    expect(runtime.db.scritture).toHaveLength(0); expect(carica).not.toHaveBeenCalled();
  });
  it("il vecchio invio di solo testo con encoding non UTF-8 chiede il file, senza archiviarlo corrotto", async () => {
    expect((await importa({ xml_content: XML.replace("UTF-8", "ISO-8859-1") })).status).toBe(422);
    expect(carica).not.toHaveBeenCalled();
  });
  it("la fattura nel cestino non viene modificata o duplicata", async () => {
    esistente({ deleted_at: "2026-10-08T10:00:00Z" });
    expect((await importa()).status).toBe(409);
    expect(runtime.db.scritture).toHaveLength(0); expect(carica).not.toHaveBeenCalled();
  });
  it("errore nella lettura dei doppioni: nessuna creazione basata su un'assenza non verificata", async () => {
    const from = runtime.db.from.bind(runtime.db);
    runtime.db.from = ((tabella: string) => {
      const q = from(tabella);
      if (tabella === "invoices") Object.assign(q, { maybeSingle: async (): Promise<{ data: null; error: { message: string } }> => ({ data: null, error: { message: "offline" } }) });
      return q;
    }) as typeof runtime.db.from;
    expect((await importa()).status).toBe(500);
    expect(runtime.db.scritture).toHaveLength(0); expect(carica).not.toHaveBeenCalled();
  });
  it("inserimento fallito: rimuove soltanto l'originale appena caricato", async () => {
    const from = runtime.db.from.bind(runtime.db);
    runtime.db.from = ((tabella: string) => {
      const q = from(tabella);
      if (tabella === "invoices") Object.assign(q, { single: async (): Promise<{ data: null; error: { message: string } }> => ({ data: null, error: { message: "insert failed" } }) });
      return q;
    }) as typeof runtime.db.from;
    expect((await importa()).status).toBe(500);
    expect(rimuovi).toHaveBeenCalledExactlyOnceWith([carica.mock.calls[0][0]]);
    expect(runtime.db.tabelle.invoices).toHaveLength(0);
  });
  it("storage fallito: non registra una nuova fattura", async () => {
    carica.mockResolvedValue({ error: { message: "offline" } });
    expect((await importa()).status).toBe(500);
    expect(runtime.db.tabelle.invoices ?? []).toHaveLength(0);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("se il collegamento perde una corsa non dichiara successo e scarta soltanto il nuovo file", async () => {
    esistente();
    carica.mockImplementationOnce(async () => {
      runtime.db.tabelle.invoices[0].external_xml_url = "fatture-xml/az-1/altro.xml";
      return { error: null };
    });
    expect((await importa()).status).toBe(409);
    const path = carica.mock.calls[0][0];
    expect(rimuovi).toHaveBeenCalledExactlyOnceWith([path]);
    expect(runtime.db.tabelle.invoices[0].external_xml_url).toBe("fatture-xml/az-1/altro.xml");
    expect(runtime.db.tabelle.invoices[0].paid_amount).toBe(80);
  });
});
