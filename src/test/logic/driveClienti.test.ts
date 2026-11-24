import { describe, expect, it } from "vitest";
import { CARTELLE_CLIENTE, cartelleDelCliente, clientiDrive, righeDelCliente, type RigaDriveCliente } from "@/lib/driveClienti";

const riga = (r: Partial<RigaDriveCliente>): RigaDriveCliente => ({
  cliente_chiave: "c1", cliente: "Rossi", order_id: "o1", order_code: "C-1", cartella: "ddt",
  id: Math.random().toString(), nome: "DDT 1", bucket: "ddt-documenti", path: "x", link: null, data: null, ...r,
});

describe("cartelle standard dei clienti in EiC Drive", () => {
  const righe = [
    riga({}), riga({ cartella: "fatture_fornitori" }), riga({ order_id: "o2", cartella: "ddt" }),
    riga({ cliente_chiave: "c2", cliente: "Bianchi", cartella: "ordini_acquisto", link: "/azienda/ordini-acquisto/1" }),
  ];

  it("un cliente per chiave, con documenti e commesse, in ordine alfabetico", () => {
    expect(clientiDrive(righe)).toEqual([
      { chiave: "c2", nome: "Bianchi", documenti: 1, commesse: 1 },
      { chiave: "c1", nome: "Rossi", documenti: 3, commesse: 2 },
    ]);
  });

  it("ogni cliente ha sempre tutte le cartelle standard, anche vuote", () => {
    const cartelle = cartelleDelCliente(righe, "c1");
    expect(cartelle.map(c => c.chiave)).toEqual(CARTELLE_CLIENTE.map(c => c.chiave));
    expect(cartelle.find(c => c.chiave === "ddt")?.documenti).toBe(2);
    expect(cartelle.find(c => c.chiave === "fatture_fornitori")?.documenti).toBe(1);
    expect(cartelle.find(c => c.chiave === "subappalti")?.documenti).toBe(0);
  });

  it("filtra per cliente e per cartella", () => {
    expect(righeDelCliente(righe, "c1", "ddt")).toHaveLength(2);
    expect(righeDelCliente(righe, "c1", null)).toHaveLength(3);
    expect(righeDelCliente(righe, null, null)).toHaveLength(4);
  });
});
