/**
 * Fattura a un privato (01/10/2026, Renova): si identifica con nome, cognome,
 * codice fiscale e indirizzo — non esiste una ragione sociale. Prima la
 * validazione, l'emissione e l'invio pretendevano la ragione sociale e Fabio non
 * riusciva a fatturare a un privato «con tutti i dati».
 */
import { describe, expect, it } from "vitest";
import { datiClienteMancanti, ePrivato, nomeCliente, normalizzaCliente } from "@/lib/fatturazione/clienteSnapshot";
import { validateDocumento } from "@/lib/fatturazione/calcoli";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

const privato = {
  tipo_cliente: "B2C", nome: "Mario", cognome: "Rossi", ragione_sociale: "", codice_fiscale: "RSSMRA80A01L736U",
  indirizzo_via: "Via della Chiesa 1", indirizzo_cap: "33090", indirizzo_comune: "Arba", indirizzo_provincia: "PN", indirizzo_nazione: "IT",
} as never;

const doc = (cliente: unknown) => ({
  tipo: "fattura", stato: "bozza", numero: "FPR 73/26", data_emissione: new Date().toISOString().slice(0, 10), cliente_snapshot: cliente,
  righe: [{ id: "r", numero_linea: 1, descrizione: "Lavori", quantita: 1, unita_misura: "nr", prezzo_unitario: 100, aliquota_iva: "10", imponibile: 100, imposta: 10, totale_riga: 110 }],
  scadenze_pagamento: [],
}) as never;

describe("cliente privato", () => {
  it("si riconosce e si chiama «Nome Cognome»", () => {
    expect(ePrivato(privato)).toBe(true);
    expect(nomeCliente(privato)).toBe("Mario Rossi");
    expect(normalizzaCliente(privato).ragione_sociale).toBe("Mario Rossi");
  });

  it("con nome, cognome, codice fiscale e indirizzo la fattura non ha errori sul cliente", () => {
    expect(datiClienteMancanti(privato)).toEqual([]);
    expect(validateDocumento(doc(normalizzaCliente(privato))).filter((e) => e.field === "cliente")).toEqual([]);
    // Anche senza la ragione sociale derivata (dati di un'altra strada): nome e cognome bastano.
    expect(validateDocumento(doc(privato)).filter((e) => e.field === "cliente")).toEqual([]);
  });

  it("un privato di anagrafica senza nome è segnalato, con cosa manca", () => {
    const senzaNome = { tipo_cliente: "B2C", ragione_sociale: "", codice_fiscale: "RSSMRA80A01L736U", indirizzo_via: "Via X", indirizzo_cap: "33090", indirizzo_comune: "Arba" } as never;
    expect(nomeCliente(senzaNome)).toBe("");
    expect(datiClienteMancanti(senzaNome)).toEqual(["il nome", "il cognome"]);
    const e = validateDocumento(doc(senzaNome)).filter((x) => x.field === "cliente");
    expect(e.length).toBeGreaterThan(0);
    expect(e[0].message).toMatch(/nome e cognome/);
  });

  it("dice cosa manca: codice fiscale, indirizzo, CAP", () => {
    expect(datiClienteMancanti({ ...(privato as object), codice_fiscale: "", indirizzo_via: "", indirizzo_cap: "9" } as never))
      .toEqual(["il codice fiscale", "l'indirizzo", "il CAP (5 cifre)"]);
  });

  it("un'azienda continua a chiedere la ragione sociale, non nome e cognome", () => {
    expect(datiClienteMancanti({ tipo_cliente: "B2B", ragione_sociale: "" } as never)).toEqual(["la ragione sociale"]);
    expect(datiClienteMancanti({ tipo_cliente: "B2B", ragione_sociale: "Edil S.r.l." } as never)).toEqual([]);
  });

  it("nell'XML un privato è Nome e Cognome, non Denominazione", () => {
    const azienda = { ragione_sociale: "RENOVA SOLUTION S.R.L.", partita_iva: "01941970939", regime_fiscale: "RF18", indirizzo_via: "Via Revedole", indirizzo_cap: "33170", indirizzo_comune: "Pordenone" };
    const xml = generateXML({ ...(doc(normalizzaCliente(privato)) as object), totale_documento: 110, riepilogo_iva: [{ aliquota: "10", imponibile: 100, imposta: 10, esigibilita: "I" }] }, azienda, "00001");
    const cessionario = xml.slice(xml.indexOf("<CessionarioCommittente>"), xml.indexOf("</CessionarioCommittente>"));
    expect(cessionario).toContain("<Nome>Mario</Nome>");
    expect(cessionario).toContain("<Cognome>Rossi</Cognome>");
    expect(cessionario).not.toContain("<Denominazione>");
    expect(cessionario).toContain("<CodiceFiscale>RSSMRA80A01L736U</CodiceFiscale>");
  });
});
