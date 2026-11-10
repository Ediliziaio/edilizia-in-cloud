import { describe, expect, it } from "vitest";
import {
  bollaDaFile,
  conflittoFornitore,
  doppioni,
  chiaveBolla,
  modificaBolleSelezionate,
  richiedeCaricoManuale,
  type BollaLetta,
} from "@/lib/ddt/importBolle";
import { fornitoreDaBolla } from "@/lib/ddt/fornitoreDaBolla";
import { abbinaFornitore } from "@/lib/ddt/abbinaFornitore";
const bolla = (id: string, patch: Partial<BollaLetta> = {}): BollaLetta => ({
  ...bollaDaFile(new File(["x"], `${id}.pdf`), id, {
    destinazione: "magazzino",
  }),
  stato: "letta",
  numero: "123",
  supplierId: "fornitore-originale",
  abbinatoPer: "partita IVA",
  ...patch,
});
describe("Azioni multiple DDT", () => {
  it("modifica solo le selezionate senza perdere lettura, numero e fornitore", () => {
    const righe = [
      { descrizione: "Malta", quantita: 56 },
    ] as BollaLetta["righe"];
    const originali = [bolla("a", { righe }), bolla("b")];
    const risultato = modificaBolleSelezionate(originali, new Set(["a"]), {
      orderId: "commessa",
      warehouseId: "deposito",
      destinazione: "cantiere",
    });
    expect(risultato[0]).toMatchObject({
      numero: "123",
      supplierId: "fornitore-originale",
      orderId: "commessa",
      warehouseId: "deposito",
      destinazione: "cantiere",
      righe,
    });
    expect(risultato[1]).toBe(originali[1]);
    expect(originali[0].orderId).toBeNull();
  });
  it("non modifica una bolla già creata, registrata o ancora in lettura", () => {
    const originali = [
      bolla("a", { ddtCreatoId: "ddt" }),
      bolla("b", { esito: "salvata" }),
      bolla("c", { stato: "in_lettura" }),
    ];
    expect(
      modificaBolleSelezionate(originali, new Set(["a", "b", "c"]), {
        supplierId: "altro",
      }),
    ).toEqual(originali);
  });
  it("rimuove associazioni solo se richiesto e cancella la motivazione automatica quando si forza il fornitore", () => {
    const [r] = modificaBolleSelezionate(
      [bolla("a", { orderId: "commessa" })],
      new Set(["a"]),
      { supplierId: null, orderId: null },
    );
    expect(r).toMatchObject({
      supplierId: null,
      orderId: null,
      abbinatoPer: null,
    });
  });
  it("non interpreta le condizioni di reso bancali come un reso della bolla di vendita", () => {
    expect(
      richiedeCaricoManuale({
        intestazione: { causale: "Vendita" },
        riferimenti: { note_libere: "Reso bancale euro 18.00cad" },
      }),
    ).toBe(false);
  });
});
describe("Proposta e associazione del fornitore", () => {
  it("propone i dati del mittente e non l’indirizzo di consegna", () => {
    expect(
      fornitoreDaBolla(
        {
          mittente: {
            ragione_sociale: "Buffoni",
            partita_iva: "IT03744510128",
            indirizzo: "Sede",
            comune: "Gallarate",
          },
          luogo_destinazione: { indirizzo: "Cantiere" },
        },
        null,
      ),
    ).toMatchObject({
      name: "Buffoni",
      vat_number: "03744510128",
      address: "Sede",
      city: "Gallarate",
    });
  });
  it("non inventa recapiti o condizioni mancanti", () => {
    const proposta = fornitoreDaBolla(null, "Nome letto");
    expect(proposta.name).toBe("Nome letto");
    expect(proposta.email).toBeUndefined();
    expect(proposta.payment_method).toBeUndefined();
    expect(proposta.vat_number).toBe("");
  });
  it("lo stesso nome con una partita IVA diversa non basta per collegare un fornitore", () => {
    expect(
      abbinaFornitore(
        { fornitoreNome: "Rossi Srl", fornitorePiva: "03744510128" },
        [{ id: "altro", name: "Rossi Srl", vat_number: "08236870963" }],
      ),
    ).toBeNull();
  });
});

it("il ritentativo dell’allegato non viene bloccato dal DDT appena creato dalla stessa bozza", () => {
  const b = bolla("a", {
    ddtCreatoId: "creata",
    esito: "errore",
    data: "2026-11-10",
  });
  expect(
    doppioni([b], new Set([chiaveBolla(b.supplierId, b.numero, b.data)!])).get(
      "a",
    ),
  ).toBeNull();
});

it("segnala una forzatura del fornitore in contrasto con la P.IVA della bolla", () => {
  const b = bolla("a", {
    supplierId: "s",
    grezzo: { mittente: { partita_iva: "IT03744510128" } },
  });
  expect(
    conflittoFornitore(b, [
      { id: "s", name: "Altro", vat_number: "08236870963" },
    ]),
  ).toBe(true);
  expect(
    conflittoFornitore(b, [
      { id: "s", name: "Giusto", vat_number: "03744510128" },
    ]),
  ).toBe(false);
});
