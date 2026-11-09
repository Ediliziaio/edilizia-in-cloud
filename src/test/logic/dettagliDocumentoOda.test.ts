import { describe,expect,it } from "vitest";
import { applicaDettagliOda,aggiornamentoDettagliOda } from "@/lib/orders/dettagliDocumentoOda";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
const base:DocumentoOperativo={tipo:"materiali",numero:"ODA-5",data:"2026-11-06",destinatario:{nome:"Fornitore",email:"ordini@esempio.it"},pagamento:"Bonifico · 60 giorni fine mese",righe:[{descrizione:"Tegole",unita:"pz",quantita:2880,prezzo:1.81}],totali:{imponibile:5212.8,iva:1146.82,totale:6359.62}};
describe("Dettagli persistenti dell’ordine",()=>{
 it("eredita recapiti e condizioni fino a quando non vengono personalizzati",()=>{expect(applicaDettagliOda(base,{})).toMatchObject(base);expect(applicaDettagliOda(base,null)).toEqual(base);});
 it("salva consegna, pagamento e note nelle colonne canoniche e conserva i recapiti della copia",()=>{
  const documento={...base,consegna:"2026-11-12",pagamento:"30 giorni con saldo a consegna",luogo:"Via Roma 1",destinazioneTipo:"altro" as const,referente:"Mario",referenteEmail:"mario@esempio.it",referenteConsegna:"Luca · 3330000000",noteConsegna:"Telefonare prima",condizioni:"Scarico incluso",note:"Imballo rinforzato",codiceCliente:"VULCANO-1",destinatario:{nome:"Fornitore",email:"commerciale@esempio.it"}};
  const patch=aggiornamentoDettagliOda(documento,"Solo per l’ufficio");
  expect(patch).toMatchObject({delivery_address:"Via Roma 1",expected_delivery_date:"2026-11-12",payment_terms:"30 giorni con saldo a consegna",notes:"Imballo rinforzato",internal_notes:"Solo per l’ufficio",delivery_warehouse_id:null});
  const riletta=applicaDettagliOda({...base,pagamento:patch.payment_terms,consegna:patch.expected_delivery_date,luogo:patch.delivery_address,note:patch.notes},patch.document_details);
  expect(riletta).toMatchObject(documento);expect(riletta).not.toHaveProperty("internal_notes");
 });
 it("non permette ai dati della copia di sostituire righe, totali, pagamento o numero dell’ordine",()=>{
  const d=applicaDettagliOda(base,{numero:"ALTRO",righe:[],totali:{totale:0},pagamento:"Gratis"});
  expect(d.numero).toBe(base.numero);expect(d.righe).toEqual(base.righe);expect(d.totali).toEqual(base.totali);expect(d.pagamento).toBe(base.pagamento);
 });
 it("conserva la scelta di svuotare un recapito senza riesumare quello dell’anagrafica",()=>{expect(applicaDettagliOda(base,{destinatarioEmail:""}).destinatario.email).toBe("");});
});

describe("reverse charge sull'ordine", () => {
  const baseRc = { tipo: "materiali", numero: "1", destinatario: { nome: "F" }, righe: [] } as unknown as Parameters<typeof applicaDettagliOda>[0];
  it("resta salvato con la sua clausola quando si riapre l'ordine", () => {
    const patch = aggiornamentoDettagliOda({ ...baseRc, data: "2026-11-09", inversioneContabile: true, clausolaInversione: "a-ter" }, "");
    const riletto = applicaDettagliOda(baseRc, patch.document_details);
    expect(riletto.inversioneContabile).toBe(true);
    expect(riletto.clausolaInversione).toBe("a-ter");
  });
  it("spento non si porta dietro la clausola", () => {
    const patch = aggiornamentoDettagliOda({ ...baseRc, data: "2026-11-09", inversioneContabile: false, clausolaInversione: "a" }, "");
    expect(applicaDettagliOda(baseRc, patch.document_details).clausolaInversione ?? null).toBeNull();
  });
  it("il fornitore predefinito basta da solo: un dettaglio con la sola scelta si legge", () => {
    expect(applicaDettagliOda(baseRc, { inversioneContabile: true }).inversioneContabile).toBe(true);
  });
});
