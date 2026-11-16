/**
 * Punti aperti del 16/11/2026 (docs/piano-punti-aperti-20261116.md §3, §4, §5, §10): le regole
 * lato codice. Le regole del database sono provate in transazioni annullate su Demo Azienda 2
 * (vedi docs/automazioni-tesoreria-cdg.md, «Lotto 9»).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { codiceDaRicordare, codiceValido, codiciDaTesto, codiciNelTesto, normalizzaCodice } from "@/lib/orders/codiciCommittente";
import { etichettaApri, indirizzoDocumento } from "@/lib/contabilita/daVerificare";
import { annullabile, costoAnnullato, importoOriginale, motivoBolletta, stornoRisolve } from "@/lib/costi/annulloCosto";
import { leggiSoglia } from "@/components/settings/automazioni/SoglieCollegamenti";
import { codiceDaProporre, type CandidatoEsito } from "@/components/tesoreria/EsitoMovimento";
import { abbinaRigaFattura, type RigaDocumento } from "../../../shared/acquisti/righe.ts";
import type { RigaFatturaLetta } from "../../../shared/acquisti/riferimentiFattura.ts";

describe("§4 — codici del committente", () => {
  it("lo stesso codice scritto in modi diversi", () => {
    expect(normalizzaCodice("mm-311")).toBe("MM311");
    expect(normalizzaCodice(" MM 311 ")).toBe("MM311");
  });
  it("valido: almeno 3 caratteri, 4 se solo cifre", () => {
    expect(codiceValido("AB")).toBe(false);
    expect(codiceValido("A12")).toBe(true);
    expect(codiceValido("123")).toBe(false);
    expect(codiceValido("4500")).toBe(true);
  });
  it("nella descrizione del lavoro: sigla maiuscola e almeno tre cifre, non le sigle che precedono sempre un numero", () => {
    expect(codiciNelTesto("Rifacimento bagno cantiere MM 311, via Roma 120, CAP 20100, IVA 2026")).toEqual(["MM311"]);
    expect(codiciNelTesto("pannelli da 120 mm e ODL-45001")).toEqual(["ODL45001"]);
    expect(codiciNelTesto("mm 311")).toEqual([]);
  });
  it("nella causale anche in minuscolo; si propone il primo che la commessa non ha", () => {
    expect(codiceDaRicordare("bonifico rif mm311 saldo")).toBe("MM311");
    expect(codiceDaRicordare("bonifico rif MM311 e ODL 4500", ["MM-311"])).toBe("ODL4500");
    expect(codiceDaRicordare("saldo fattura 12/2026")).toBeNull();
  });
  it("il testo libero diventa un elenco senza doppioni", () => {
    expect(codiciDaTesto("mm 311, MM-311; odl 4500\n")).toEqual(["MM 311", "ODL 4500"]);
  });
  it("«Ricorda questo codice» solo per un incasso su una commessa, se il codice non è già servito", () => {
    const c: CandidatoEsito = { chiave: "k", forza: "media", motivi: ["Controparte corrispondente"], righe: [
      { tipo: "documento", id: "d1", titolo: "FT 1", residuo: 100, quota: 100, commesse: [{ order_id: "o1", quota: 100 }] }] };
    const m = { amount: 100, description: "Bonifico rif MM 311" as string | null, reference: null as string | null };
    expect(codiceDaProporre(m, c)).toEqual({ orderId: "o1", codice: "MM311" });
    expect(codiceDaProporre({ ...m, amount: -100 }, c)).toBeNull();
    expect(codiceDaProporre(m, { ...c, motivi: ["Codice del committente «MM 311» nella causale (commessa C1)"] })).toBeNull();
    expect(codiceDaProporre(m, { ...c, righe: [...c.righe, { tipo: "documento", id: "d2", titolo: "FT 2", residuo: 1, quota: 1, commesse: [{ order_id: "o2", quota: 1 }] }] })).toBeNull();
  });
});

describe("§3 — annulla costo", () => {
  it("l'importo vero di un costo annullato sta in annullato_dati", () => {
    const c = { amount: 0, annullato_il: "2026-11-16T08:00:00Z", annullato_dati: { amount: 335.4 } };
    expect(costoAnnullato(c)).toBe(true);
    expect(importoOriginale(c)).toBe(335.4);
    expect(importoOriginale({ amount: "12.5" })).toBe(12.5);
  });
  it("si annulla solo senza ostacoli; «Storna il pagamento» solo se l'ostacolo è un pagamento in prima nota", () => {
    expect(annullabile({ annullato: false, ostacoli: [] })).toBe(true);
    expect(annullabile({ annullato: true, ostacoli: [] })).toBe(false);
    const pag = { codice: "pagamento", testo: "", rimedio: "storna_pagamento" };
    expect(stornoRisolve({ ostacoli: [pag] })).toBe(true);
    expect(stornoRisolve({ ostacoli: [pag, { codice: "banca", testo: "", rimedio: "tesoreria" }] })).toBe(false);
  });
  it("motivo proposto per la bolletta", () => {
    expect(motivoBolletta("doppione_sospetto")).toBe("Bolletta doppia");
    expect(motivoBolletta("scartata")).toMatch(/scartata/);
  });
});

describe("§5 — soglie", () => {
  it("si leggono con la virgola e dentro i limiti del database", () => {
    expect(leggiSoglia("banca_differenza_max", "2,50")).toBe(2.5);
    expect(leggiSoglia("banca_differenza_max", "80")).toBeNull();
    expect(leggiSoglia("acquisti_prezzo_toll_perc", "0,5")).toBe(0.5);
    expect(leggiSoglia("acquisti_prezzo_toll_cent", "2.5")).toBeNull();
    expect(leggiSoglia("acquisti_quantita_toll_perc", "")).toBeNull();
  });
  it("la tolleranza di quantità dell'azienda chiude la riga; senza, resta proposta", () => {
    const riga: RigaFatturaLetta = { numeroLinea: 1, codici: [{ tipo: "", valore: "CEM325" }], descrizione: "Cemento", quantita: 10.2, unitaLetta: "SACCO", unita: "SACCO",
      prezzoUnitario: 8, totale: 81.6, tipoCessione: null, dataInizio: null, dataFine: null, altriDati: [] };
    const doc: RigaDocumento = { id: "r1", documentoId: "d", codice: "CEM325", descrizione: "Cemento", quantita: 10, unita: "SACCO", prezzoUnitario: 8 };
    expect(abbinaRigaFattura(riga, [doc]).esito).toBe("proposta");
    const con = abbinaRigaFattura(riga, [doc], { tolleranze: { quantitaPerc: 2 } });
    expect(con.esito).toBe("automatico");
    expect(JSON.stringify(con)).toContain("entro la tolleranza del 2%");
    expect(abbinaRigaFattura({ ...riga, quantita: 10.5 }, [doc], { tolleranze: { quantitaPerc: 2 } }).esito).toBe("proposta");
  });
});

describe("§10 — da verificare: ogni documento si apre", () => {
  it("indirizzi e pulsanti", () => {
    expect(indirizzoDocumento({ tipo: "movimento", id: "t1", titolo: "" })).toBe("/azienda/tesoreria?tab=transazioni&movimento=t1");
    expect(indirizzoDocumento({ tipo: "fattura_emessa", id: "f1", titolo: "", origine: "nativa" })).toBe("/azienda/documenti/f1/dettaglio");
    expect(indirizzoDocumento({ tipo: "fattura_emessa", id: "f1", titolo: "", origine: "importata" })).toBe("/azienda/documenti/importata/f1");
    expect(indirizzoDocumento({ tipo: "costo", id: "c1", titolo: "" })).toBe("/azienda/costi?costo=c1");
    expect(indirizzoDocumento({ tipo: "scadenza", id: "s1", titolo: "", costo_id: "c1" })).toBe("/azienda/costi?costo=c1");
    expect(indirizzoDocumento({ tipo: "fattura_ricevuta", id: "r1", titolo: "", numero: "A/12" })).toBe("/azienda/documenti/fatture-ricevute?cerca=A%2F12");
    expect(indirizzoDocumento({ tipo: "prima_nota", id: "p1", titolo: "", movimento_id: "t9" })).toBe("/azienda/tesoreria?tab=transazioni&movimento=t9");
    expect(indirizzoDocumento({ tipo: "sconosciuto", id: "x", titolo: "" })).toBeNull();
    expect(etichettaApri({ tipo: "costo", id: "c1", titolo: "" })).toBe("Apri il costo");
  });
});
