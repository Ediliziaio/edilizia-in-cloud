import { describe, expect, it } from "vitest";
import { aliquotaAbituale, cercaClienti, emailDaMostrare, nomeCliente } from "@/lib/orders/nuovaCommessaProposte";

describe("Aliquota proposta", () => {
  it("è la più usata dall'azienda", () => {
    expect(aliquotaAbituale([10, "10.0", 22, 10])).toEqual({ aliquota: 10, commesse: 3, totale: 4 });
  });
  it("con meno di 3 commesse non c'è un'abitudine", () => {
    expect(aliquotaAbituale([10, 10])).toBeNull();
    expect(aliquotaAbituale([])).toBeNull();
  });
  it("lo 0% e le aliquote strane non si propongono e non contano", () => {
    expect(aliquotaAbituale([0, 0, 0, 0, 14, null, "", undefined])).toBeNull();
    expect(aliquotaAbituale([0, 0, 0, 0, 22, 22, 22])?.aliquota).toBe(22);
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
