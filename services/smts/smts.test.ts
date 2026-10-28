import { test } from "node:test";
import assert from "node:assert/strict";
import { unsignedRequest, soapRequest, parseSoap, parseResult, readiness } from "./smts.ts";
import { validateMassiveInput } from "../../supabase/functions/_shared/billingMassive.ts";
import { parseNotification } from "./callbacks.ts";
const input = () => validateMassiveInput({ partita_iva: "02010390439", data_da: "2026-01-01", data_a: "2026-03-31", tipo_richiesta: "RICEVUTE" }, new Date("2026-10-27"));
test("AdE richiede una busta esterna da firmare con InputMassivo in base64", () => {
  const xml = unsignedRequest(input(), "SMTS_123456.xml");
  assert.match(xml, /m:FileRichiesta/); assert.match(xml, /versione="1.0"/);
  const file = xml.match(/<File>([^<]+)<\/File>/)![1];
  assert.match(Buffer.from(file, "base64").toString(), /<Piva>02010390439<\/Piva>/);
  assert.match(xml, /<TipoRichiesta>FATT<\/TipoRichiesta>/);
});
test("SOAP document/literal con figli non qualificati, come nel WSDL", () => {
  const xml = soapRequest("inoltroRichiesta", { filename: "SMTS_123456.xml.p7m", base64: "YQ==" });
  assert.match(xml, /<t:InoltroRichiestaRequest><FileRichiesta>/);
  assert.doesNotMatch(xml, /xmlns="http:\/\/ivaservizi/);
  assert.throws(() => soapRequest("esitoRichiesta", { id: "</IdRichiesta>" }));
});
test("legge l'identificativo senza dipendere dai prefissi SOAP", () => {
  const xml = `<s:Envelope xmlns:s="urn:soap"><s:Body><t:InoltroRichiestaResponse xmlns:t="urn:types"><IdRichiesta>ID_123</IdRichiesta></t:InoltroRichiestaResponse></s:Body></s:Envelope>`;
  assert.equal(parseSoap(xml).id, "ID_123");
  assert.throws(() => parseSoap("<Envelope><Errore><Codice>ER02</Codice></Errore></Envelope>"), /ER02/);
  assert.throws(() => parseSoap("<Envelope><Fault><faultstring>secret</faultstring></Fault></Envelope>"), /SOAP Fault/);
});
test("gli archivi sono verificati rispetto a partita IVA e richiesta", () => {
  const xml = `<EsitoRichiesta><IdRichiesta>ID_123</IdRichiesta><Piva>02010390439</Piva><Esito><ElencoArchivi><Archivio><IdFile>FILE_1</IdFile><NomeFile>fatture.zip</NomeFile><NumeroElementi>2</NumeroElementi></Archivio></ElencoArchivi></Esito></EsitoRichiesta>`;
  const encoded = Buffer.from(xml).toString("base64");
  assert.deepEqual(parseResult(encoded, "02010390439", "ID_123").archives, [{ id: "FILE_1", filename: "fatture.zip", count: 2 }]);
  assert.throws(() => parseResult(encoded, "11111111111", "ID_123"), /non corrisponde/);
  assert.throws(() => parseResult(encoded, "02010390439", "ID_999"), /non corrisponde/);
});
test("nessun canale viene dichiarato pronto senza accreditamento e certificati", () => {
  assert.equal(readiness({}).length, 4);
});
test("callback SdICoop: SOAPAction e struttura devono corrispondere", () => {
  const soap = '<s:Envelope xmlns:s="urn:soap"><s:Body><t:ricevutaConsegna xmlns:t="urn:types"><IdentificativoSdI>123</IdentificativoSdI><NomeFile>IT02010390439_RC_1.xml</NomeFile><File>YQ==</File></t:ricevutaConsegna></s:Body></s:Envelope>';
  assert.equal(parseNotification(soap, '"http://www.fatturapa.it/TrasmissioneFatture/RicevutaConsegna"').id, "123");
  assert.throws(() => parseNotification(soap, "http://www.fatturapa.it/TrasmissioneFatture/NotificaScarto"));
  assert.throws(() => parseNotification(soap, "RicevutaConsegna"));
});
