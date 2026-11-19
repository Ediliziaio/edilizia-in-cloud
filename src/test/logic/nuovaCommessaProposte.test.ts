import { describe, expect, it } from "vitest";
import { aliquotaAbituale, cercaClienti, clientiSimili, emailDaMostrare, indirizzoCliente, nomeCliente, tipoCliente, type ClienteDaCercare } from "@/lib/orders/nuovaCommessaProposte";

describe("Aliquota proposta", () => {
  it("è la più usata dall'azienda", () => {
    expect(aliquotaAbituale([10, "10.0", 22, 10])).toEqual({ aliquota: 10, commesse: 3, totale: 4 });
  });
  it("con meno di 3 commesse non c'è un'abitudine", () => {
    expect(aliquotaAbituale([10, 10])).toBeNull();
    expect(aliquotaAbituale([])).toBeNull();
  });
  it("esclude lo 0%, il 5% e le aliquote non previste dal suggerimento", () => {
    expect(aliquotaAbituale([0, 0, 0, 5, "5.0", 5, 14, null, "", undefined])).toBeNull();
    expect(aliquotaAbituale([5, 5, 5, 5, 22, 22, 22])).toEqual({ aliquota: 22, commesse: 3, totale: 3 });
  });
});

describe("Ricerca del cliente", () => {
  const clienti = [
    { id: "1", first_name: "Mario", last_name: "Rossi", email: "mario@esempio.it" },
    { id: "2", first_name: "Niccolò", last_name: "Bianchi", email: "cliente-abc@no-email.ediliziaincloud.local" },
    { id: "3", first_name: null, last_name: null, email: null },
  ];
  it("le email generate non si mostrano", () => {
    expect(emailDaMostrare("cliente-abc@no-email.ediliziaincloud.local")).toBeNull();
    expect(emailDaMostrare("x@demo.invalid")).toBeNull();
    expect(emailDaMostrare(" mario@esempio.it ")).toBe("mario@esempio.it");
  });
  it("trova per nome in qualsiasi ordine, senza badare ad accenti e maiuscole", () => {
    expect(cercaClienti(clienti, "rossi mario").risultati.map((c) => c.id)).toEqual(["1"]);
    expect(cercaClienti(clienti, "NICCOLO").risultati.map((c) => c.id)).toEqual(["2"]);
  });
  it("cerca nell'email vera, non in quella generata", () => {
    expect(cercaClienti(clienti, "esempio").risultati.map((c) => c.id)).toEqual(["1"]);
    expect(cercaClienti(clienti, "no-email").risultati).toEqual([]);
  });
  it("senza testo mostra i primi e dice quanti altri ci sono", () => {
    const molti = Array.from({ length: 60 }, (_, i) => ({ id: String(i), first_name: "A", last_name: String(i) }));
    const { risultati, altri } = cercaClienti(molti, "");
    expect(risultati).toHaveLength(50);
    expect(altri).toBe(10);
  });
  it("un cliente senza nome si legge comunque", () => {
    expect(nomeCliente(clienti[2])).toBe("Cliente senza nome");
  });
});

it("trova un'impresa per ragione sociale e per referente senza confonderli", () => {
  const impresa={id:"azienda",business_name:"Edil Aurora S.r.l.",first_name:"Marco",last_name:"Rossi"};
  expect(nomeCliente(impresa)).toBe("Edil Aurora S.r.l.");
  expect(cercaClienti([impresa],"Aurora").risultati).toEqual([impresa]);
  expect(cercaClienti([impresa],"Marco Rossi").risultati).toEqual([impresa]);
});

describe("ricerca del cliente per recapiti (15/11/2026)", () => {
  const condomini: ClienteDaCercare[] = [
    { id: "10", business_name: "Condominio DEMO 2023 10", first_name: null, last_name: null, address: "Via Roma 10", city: "Monza" },
    { id: "2", business_name: "Condominio DEMO 2023 2", first_name: null, last_name: null, address: "Via dei Tigli 2", city: "Milano" },
    { id: "rossi", business_name: null, first_name: "Mario", last_name: "Rossi", phone: "+39 333 1234567", vat_number: null, city: "Monza" },
    { id: "edil", business_name: "Edil Monza S.r.l.", first_name: "Luca", last_name: "Verdi", vat_number: "01234567890" },
  ];
  it("trova per telefono anche scritto in un altro modo", () => {
    expect(cercaClienti(condomini, "333 1234567").risultati.map((c) => c.id)).toEqual(["rossi"]);
    expect(cercaClienti(condomini, "3331234").risultati.map((c) => c.id)).toEqual(["rossi"]);
  });
  it("trova per indirizzo, città e partita IVA", () => {
    expect(cercaClienti(condomini, "tigli").risultati.map((c) => c.id)).toEqual(["2"]);
    expect(cercaClienti(condomini, "01234567890").risultati.map((c) => c.id)).toEqual(["edil"]);
  });
  it("prima chi ha il nome che comincia così, poi gli altri; i numeri in ordine naturale", () => {
    expect(cercaClienti(condomini, "monza").risultati.map((c) => c.id)).toEqual(["edil", "10", "rossi"]);
    expect(cercaClienti(condomini, "condominio").risultati.map((c) => c.id)).toEqual(["2", "10"]);
  });
  it("mostra indirizzo e tipo leggibili", () => {
    expect(indirizzoCliente({ id: "x", first_name: null, last_name: null, address: "Via dei Tigli 13, Monza", city: "Monza" })).toBe("Via dei Tigli 13, Monza");
    expect(indirizzoCliente({ id: "x", first_name: null, last_name: null, address: "Via Po 1", city: "Bologna", province: "bo" })).toBe("Via Po 1, Bologna (BO)");
    expect(tipoCliente({ id: "x", first_name: null, last_name: null, tipo_cliente: "PA" })).toBe("PA");
    expect(tipoCliente({ id: "x", first_name: null, last_name: null, is_business: true })).toBe("Azienda");
  });
  it("riconosce un doppione per telefono, P.IVA o nome", () => {
    expect(clientiSimili(condomini, { telefono: "3331234567" }).map((s) => [s.cliente.id, s.motivo])).toEqual([["rossi", "stesso telefono"]]);
    expect(clientiSimili(condomini, { partitaIva: "IT01234567890" }).map((s) => s.cliente.id)).toEqual(["edil"]);
    expect(clientiSimili(condomini, { nome: "Edil Monza SRL" }).map((s) => s.motivo)).toEqual(["stesso nome"]);
    expect(clientiSimili(condomini, { nome: "Rossi Mario" }).map((s) => s.cliente.id)).toEqual(["rossi"]);
    expect(clientiSimili(condomini, { nome: "Ed" })).toEqual([]);
  });
});
