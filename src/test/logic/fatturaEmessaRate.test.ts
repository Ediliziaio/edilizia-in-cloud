import { describe, expect, it } from "vitest";
import { avvisoRate, leggiFatturaPA } from "../../../supabase/functions/_shared/fatturapaReader";
import { LettoreXmlMinimo } from "../../../supabase/functions/_shared/xmlMinimo";

const fattura = (pagamento: string, totale = "569.00", tipo = "TD01") => `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="urn:fattura" versione="FPR12"><FatturaElettronicaHeader>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdCodice>12345678901</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Impresa</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
</FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${tipo}</TipoDocumento><Data>2026-01-31</Data><Numero>FT/18</Numero><ImportoTotaleDocumento>${totale}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22</AliquotaIVA><ImponibileImporto>466.39</ImponibileImporto><Imposta>102.61</Imposta></DatiRiepilogo></DatiBeniServizi>
${pagamento}</FatturaElettronicaBody></p:FatturaElettronica>`;

const rata = (mp: string, data: string, importo: string, altro = "") =>
  `<DettaglioPagamento><ModalitaPagamento>${mp}</ModalitaPagamento>${data ? `<DataScadenzaPagamento>${data}</DataScadenzaPagamento>` : ""}${importo ? `<ImportoPagamento>${importo}</ImportoPagamento>` : ""}${altro}</DettaglioPagamento>`;
const leggi = (xml: string) => leggiFatturaPA(xml, new LettoreXmlMinimo())!;

// Tre RiBa, l'ultima con i centesimi dell'arrotondamento.
const TRE_RIBA = `<DatiPagamento><CondizioniPagamento>TP01</CondizioniPagamento>${rata("MP12", "2026-03-31", "189.50")}${rata("MP12", "2026-04-30", "189.50")}${rata("MP12", "2026-05-31", "190.00")}</DatiPagamento>`;

describe("Le rate di una fattura emessa", () => {
  it("le legge tutte, con data, importo e metodo", () => {
    const f = leggi(fattura(TRE_RIBA));
    expect(f.rate).toEqual([
      { scadenza: "2026-03-31", importo: 189.5, modalita: "MP12", iban: null },
      { scadenza: "2026-04-30", importo: 189.5, modalita: "MP12", iban: null },
      { scadenza: "2026-05-31", importo: 190, modalita: "MP12", iban: null },
    ]);
    expect(f.condizioniPagamento).toBe("TP01");
    expect(avvisoRate(f)).toBeNull();
  });

  it("i campi della prima rata restano quelli di prima: le fatture archiviate si confrontano lì", () => {
    const f = leggi(fattura(TRE_RIBA));
    expect([f.scadenza, f.modalitaPagamento]).toEqual(["2026-03-31", "MP12"]);
  });

  it("legge le rate di più blocchi DatiPagamento (anticipo più saldo)", () => {
    const f = leggi(fattura(`<DatiPagamento><CondizioniPagamento>TP03</CondizioniPagamento>${rata("MP05", "2026-02-01", "100.00")}</DatiPagamento><DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento>${rata("MP12", "2026-04-30", "469.00")}</DatiPagamento>`));
    expect(f.rate.map((r) => r.modalita)).toEqual(["MP05", "MP12"]);
    expect(avvisoRate(f)).toBeNull();
  });

  it("senza data scritta la ricava da riferimento più giorni, senza inventarla negli altri casi", () => {
    const f = leggi(fattura(`<DatiPagamento>${rata("MP05", "", "300.00", "<DataRiferimentoTerminiPagamento>2026-01-31</DataRiferimentoTerminiPagamento><GiorniTerminiPagamento>30</GiorniTerminiPagamento>")}${rata("MP05", "", "269.00", "<GiorniTerminiPagamento>60</GiorniTerminiPagamento>")}</DatiPagamento>`));
    expect(f.rate.map((r) => r.scadenza)).toEqual(["2026-03-02", null]);
    expect(f.scadenza).toBe("2026-03-02");
    expect(avvisoRate(f)).toMatch(/non ha la data/);
  });

  it("la data di riferimento senza giorni è la scadenza: i termini sono zero", () => {
    const f = leggi(fattura(`<DatiPagamento>${rata("MP08", "", "569.00", "<DataRiferimentoTerminiPagamento>2026-01-31</DataRiferimentoTerminiPagamento>")}</DatiPagamento>`));
    expect(f.rate[0].scadenza).toBe("2026-01-31");
  });

  it("una data impossibile non diventa una scadenza", () => {
    const f = leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-02-30", "569.00")}</DatiPagamento>`));
    expect(f.rate[0].scadenza).toBeNull();
    expect(f.scadenza).toBeNull();
  });

  it("una fattura senza DatiPagamento non ha rate e nessun avviso", () => {
    const f = leggi(fattura(""));
    expect(f.rate).toEqual([]);
    expect(f.condizioniPagamento).toBeNull();
    expect(avvisoRate(f)).toBeNull();
  });
});

describe("Quando le rate non tornano col totale, l'import lo dice", () => {
  it("split payment: la rata non comprende l'IVA", () => {
    const f = leggi(fattura(`<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento>${rata("MP05", "2026-06-30", "1000.00")}</DatiPagamento>`, "1220.00"));
    expect(avvisoRate(f)).toContain("1000,00 €");
    expect(avvisoRate(f)).toContain("1220,00 €");
  });

  it("due centesimi di arrotondamento non sono un problema", () => {
    expect(avvisoRate(leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-03-31", "284.49")}${rata("MP05", "2026-04-30", "284.49")}</DatiPagamento>`)))).toBeNull();
  });

  it("una rata senza importo va segnalata solo se le rate sono più di una", () => {
    expect(avvisoRate(leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-03-31", "")}${rata("MP05", "2026-04-30", "269.00")}</DatiPagamento>`)))).toMatch(/non ha l'importo/);
    expect(avvisoRate(leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-03-31", "")}</DatiPagamento>`)))).toBeNull();
  });

  it("senza nessuna data lo dice, invece di promettere una scadenza che non nasce", () => {
    const f = leggi(fattura(`<DatiPagamento>${rata("MP05", "", "569.00")}</DatiPagamento>`));
    expect(f.scadenza).toBeNull();
    expect(avvisoRate(f)).toMatch(/resta senza scadenza/);
  });

  it("prima rata senza data: la scadenza unica cade sulla prima data vera", () => {
    const f = leggi(fattura(`<DatiPagamento>${rata("MP05", "", "300.00")}${rata("MP05", "2026-04-30", "269.00")}</DatiPagamento>`));
    expect(f.scadenza).toBe("2026-04-30");
    expect(avvisoRate(f)).toMatch(/non ha la data/);
  });

  it("una rata di pochi centesimi porta alla scadenza unica, e lo dice", () => {
    expect(avvisoRate(leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-03-31", "568.98")}${rata("MP05", "2026-04-30", "0.02")}</DatiPagamento>`)))).toMatch(/pochi centesimi/);
  });

  it("una nota di credito non ha scadenze per rata e non chiede verifiche", () => {
    expect(avvisoRate(leggi(fattura(`<DatiPagamento>${rata("MP05", "2026-03-31", "100.00")}</DatiPagamento>`, "569.00", "TD04")))).toBeNull();
  });
});
