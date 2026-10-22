import { describe, it, expect } from "vitest";
import {
  escXml,
  unescXml,
  bustaSoap,
  parseFatelwReturn,
  parseSoapFault,
  esitoOk,
  FATELW_NS,
  FATELW_ARRAY_NS,
} from "../../../supabase/functions/_shared/zucchettiSoap";

describe("zucchettiSoap — parti pure", () => {
  it("escapa i caratteri speciali XML (password con &, <, apici)", () => {
    expect(escXml(`a&b<c>"d'e`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;e");
  });

  it("unescXml è l'inverso e non raddoppia le &", () => {
    const s = `conto & soci < 10 "x" 'y'`;
    expect(unescXml(escXml(s))).toBe(s);
    expect(unescXml("a&amp;amp;b")).toBe("a&amp;b");
  });

  it("bustaSoap(connect) mette le tre parti non qualificate nel wrapper namespaced", () => {
    const x = bustaSoap("connect", [
      { name: "userName", value: "palmas.r.l.a@minnet" },
      { name: "password", value: "p&w<d" },
      { name: "company", value: "001" },
    ]);
    expect(x).toContain(`xmlns:urn="${FATELW_NS}"`);
    expect(x).toContain("<urn:connect>");
    expect(x).toContain("<userName>palmas.r.l.a@minnet</userName>");
    expect(x).toContain("<password>p&amp;w&lt;d</password>"); // escaped
    expect(x).toContain("<company>001</company>");
    expect(x).toContain("</urn:connect>");
    expect(x.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
  });

  it("bustaSoap con array stringArray produce <item> nel namespace JAXB", () => {
    const x = bustaSoap("getState", [
      { name: "token", value: "T" },
      { name: "id", array: ["ID1", "ID2"] },
    ]);
    expect(x).toContain(`<id xmlns:arr="${FATELW_ARRAY_NS}">`);
    expect(x).toContain("<arr:item>ID1</arr:item><arr:item>ID2</arr:item>");
  });

  it("bustaSoap serializza i booleani (allDocuments)", () => {
    const x = bustaSoap("getDocumentsListFP", [
      { name: "token", value: "T" },
      { name: "allDocuments", value: false },
      { name: "dateFrom", value: "20261001" },
      { name: "dateTo", value: "20261031" },
      { name: "idCessionario", value: "" },
    ]);
    expect(x).toContain("<allDocuments>false</allDocuments>");
    expect(x).toContain("<idCessionario></idCessionario>");
  });

  it("parseFatelwReturn legge code/message/response/token dal wrapper *Return", () => {
    const xml =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soapenv:Body><ns:connectResponse xmlns:ns="${FATELW_NS}">` +
      `<connectReturn><code>0</code><message>OK</message>` +
      `<response></response><token>ABC-123</token></connectReturn>` +
      `</ns:connectResponse></soapenv:Body></soapenv:Envelope>`;
    const r = parseFatelwReturn(xml, "connect");
    expect(r.code).toBe(0);
    expect(r.message).toBe("OK");
    expect(r.response).toBe(""); // elemento vuoto = stringa vuota, non null
    expect(r.token).toBe("ABC-123");
    expect(esitoOk(r)).toBe(true);
  });

  it("parseFatelwReturn decodifica le entità nel response (lista XML-escaped)", () => {
    const xml =
      `<x><getDocumentsListReturn><code>0</code>` +
      `<response>riga1&lt;sep&gt;riga2 &amp; coda</response>` +
      `</getDocumentsListReturn></x>`;
    const r = parseFatelwReturn(xml);
    expect(r.response).toBe("riga1<sep>riga2 & coda");
    expect(r.token).toBeNull(); // assente = null
  });

  it("parseFatelwReturn: code assente → NaN e esitoOk falso", () => {
    const r = parseFatelwReturn(`<y><fooReturn><message>vuoto</message></fooReturn></y>`);
    expect(Number.isNaN(r.code)).toBe(true);
    expect(esitoOk(r)).toBe(false);
  });

  it("legge la risposta REALE di connect con credenziali errate (code 101, token di soli spazi)", () => {
    // Catturata dall'endpoint reale digitalhub2 con credenziali finte (19/10/2026):
    // il <token> NON è assente ma contiene spazi → il chiamante deve usare trim()
    // per non scambiare un login fallito per riuscito.
    const reale =
      `<?xml version='1.0' encoding='UTF-8'?>` +
      `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>` +
      `<ns2:connectResponse xmlns:ns2="${FATELW_NS}"><connectReturn>` +
      `<code>101</code><message>Wrong username or password</message>` +
      `<response>\n</response><token>\n</token>` +
      `</connectReturn></ns2:connectResponse></S:Body></S:Envelope>`;
    const r = parseFatelwReturn(reale, "connect");
    expect(r.code).toBe(101);
    expect(r.message).toBe("Wrong username or password");
    expect((r.token ?? "").trim()).toBe(""); // token "vuoto" = solo spazi
    expect(esitoOk(r)).toBe(false); // 101 ≠ 0
  });

  it("parseSoapFault riconosce un Fault e torna il faultstring; null se non c'è", () => {
    const fault =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode>` +
      `<faultstring>Sessione non valida</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
    expect(parseSoapFault(fault)).toBe("Sessione non valida");
    expect(parseSoapFault(`<ok><code>0</code></ok>`)).toBeNull();
  });
});
