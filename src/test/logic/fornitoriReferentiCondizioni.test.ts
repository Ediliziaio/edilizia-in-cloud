import { describe, expect, it } from "vitest";
import {
  contattiPerUnione,
  emailPerOrdini,
  emptyForm,
  payloadFornitore,
  referentiDi,
  terminiPagamentoTesto,
  validaDettagliFornitore,
  type Supplier,
} from "@/lib/suppliers/anagraficaFornitore";
import { buildOdaEmailBody } from "@/lib/odaEmail";

const base = { id: "a", name: "Edil Forniture", company_id: "c", is_foreign: false, is_active: true, created_at: "" } as unknown as Supplier;

describe("fornitori: referenti e condizioni d'acquisto", () => {
  it("l'ordine va all'email per gli ordini, poi al referente degli ordini, poi all'email generale", () => {
    expect(emailPerOrdini({ ...base, email: "info@f.it" })).toBe("info@f.it");
    expect(emailPerOrdini({ ...base, email: "info@f.it", altri_referenti: [{ ruolo: "ordini", nome: "Luca", email: "luca@f.it", telefono: "" }] })).toBe("luca@f.it");
    expect(emailPerOrdini({ ...base, email: "info@f.it", email_ordini: "ordini@f.it", altri_referenti: [{ ruolo: "ordini", nome: "Luca", email: "luca@f.it", telefono: "" }] })).toBe("ordini@f.it");
    expect(emailPerOrdini(null)).toBeNull();
  });

  it("termini di pagamento in chiaro", () => {
    expect(terminiPagamentoTesto({ termini_giorni: 60, termini_fine_mese: true })).toBe("60 gg fine mese");
    expect(terminiPagamentoTesto({ termini_giorni: 30, termini_fine_mese: false })).toBe("30 gg data fattura");
    expect(terminiPagamentoTesto({ termini_giorni: 0, termini_fine_mese: false })).toBe("Vista fattura");
    expect(terminiPagamentoTesto({ termini_giorni: null })).toBeNull();
  });

  it("dal database prende solo referenti sensati", () => {
    expect(referentiDi(null)).toEqual([]);
    expect(referentiDi([{ ruolo: "boh", nome: "Anna" }, "x"])).toEqual([{ ruolo: "altro", nome: "Anna", email: "", telefono: "" }]);
  });

  it("controlla i campi nuovi", () => {
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", pec: "non-email" })).toMatch(/PEC/);
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", codice_sdi: "AB" })).toMatch(/SDI/);
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", termini_giorni: "400" })).toMatch(/365/);
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", sconto_percentuale: "120" })).toMatch(/100/);
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", altri_referenti: [{ ruolo: "ordini", nome: "", email: "", telefono: "" }] })).toMatch(/vuoto/);
    expect(validaDettagliFornitore({ ...emptyForm, name: "X", termini_giorni: "60", sconto_percentuale: "12,5", codice_sdi: "M5UXCR1" })).toBeNull();
  });

  it("salva i campi nuovi puliti", () => {
    const p = payloadFornitore({ ...emptyForm, name: "X", email_ordini: " Ordini@F.it ", codice_sdi: "m5uxcr1", termini_giorni: "60", termini_fine_mese: true, sconto_percentuale: "12,5", codice_cliente: " C-123 " });
    expect(p).toMatchObject({ email_ordini: "ordini@f.it", codice_sdi: "M5UXCR1", termini_giorni: 60, termini_fine_mese: true, sconto_percentuale: 12.5, codice_cliente: "C-123" });
  });

  it("unendo due doppioni i dati d'acquisto passano dove mancano, i referenti si sommano", () => {
    const src = { ...base, id: "s", codice_cliente: "C1", termini_giorni: 30, altri_referenti: [{ ruolo: "amministrazione", nome: "Ada", email: "ada@f.it", telefono: "" }] };
    const dst = { ...base, id: "t", codice_cliente: "C9", altri_referenti: [{ ruolo: "ordini", nome: "Luca", email: "luca@f.it", telefono: "" }] };
    const u = contattiPerUnione(src as Supplier, dst as Supplier);
    expect(u.codice_cliente).toBeUndefined();
    expect(u.termini_giorni).toBe(30);
    expect(referentiDi(u.altri_referenti)).toHaveLength(2);
  });

  it("il codice cliente va nell'email dell'ordine", () => {
    const html = buildOdaEmailBody({ odaNumber: "ODA-1", codiceCliente: "C-123", subtotal: 0, vatTotal: 0, total: 0, righe: [] });
    expect(html).toContain("Nostro codice cliente: <strong>C-123</strong>");
  });
});

describe("email di richiesta d'offerta e d'ordine: la tabella dice il vero (31/10/2026)", () => {
  it("ordine: una riga senza prezzo dice «prezzo da confermare», non 0,00 €", async () => {
    const { buildOdaEmailBody } = await import("@/lib/odaEmail");
    const html = buildOdaEmailBody({
      odaNumber: "ODA-1", fornitoreNome: "Edil Forniture", aziendaNome: "Dimora", righe: [
        { description: "Cemento", quantity: 10, unit_of_measure: "sacchi", unit_price: 5, line_total: 50 },
        { description: "Sabbia", quantity: 2, unit_of_measure: "mc", unit_price: 0, line_total: 0 },
      ], subtotal: 50, vatTotal: 11, total: 61,
    } as never);
    expect(html).toContain("prezzo da confermare");
    expect(html).toContain("indicarci il prezzo unitario");
    expect(html).toContain("5,00");
  });
  it("richiesta d'offerta: prezzo da compilare dal fornitore, e senza righe niente «allegato» inesistente", async () => {
    const { buildRdoEmailBody } = await import("@/lib/rdoEmail");
    const conRighe = buildRdoEmailBody({ rfqNumber: "RDO-1", titolo: "Cemento", righe: [{ descrizione: "Cemento", quantita: 10, unita_misura: "sacchi" }] } as never);
    expect(conRighe).toContain("da compilare");
    const senza = buildRdoEmailBody({ rfqNumber: "RDO-1", titolo: "Cemento", righe: [] } as never);
    expect(senza).not.toContain("allegato");
  });
});
