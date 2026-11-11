import { expect, it } from "vitest";
import { controllaOrdini, progressoOrdine } from "@/lib/ddt/controlloOrdini";
import type { RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";

it("la quantità di una bolla ripartita fra ordini non viene attribuita due volte", () => {
  const ordini = [
    { ...righe[0], quantity: 6, quantity_received: 6 },
    { ...righe[0], id: "clima2", quantity: 4, quantity_received: 4 },
  ];
  const c = controllaOrdini(
    ordini,
    [{ id: "b1", purchase_order_item_id: "clima", quantita: 10 }],
    [
      {
        riga_id: "b1",
        purchase_order_item_id: "clima",
        quantita: 6,
        tipo: "ingresso",
      },
      {
        riga_id: "b1",
        purchase_order_item_id: "clima2",
        quantita: 4,
        tipo: "ingresso",
      },
    ],
  );
  expect(c.map((r) => r.inBolla)).toEqual([6, 4]);
});
const righe: RigaOrdine[] = [
  {
    id: "clima",
    description: "Condizionatore inverter",
    sku: "CLIMA",
    unit_of_measure: "pz",
    quantity: 10,
    quantity_received: 10,
    purchase_order_id: "oda",
  },
  {
    id: "tapp",
    description: "Tapparella alluminio",
    sku: "TAPP",
    unit_of_measure: "pz",
    quantity: 2,
    quantity_received: 0,
    purchase_order_id: "oda",
  },
];
it("10 condizionatori consegnati lasciano visibili le 2 tapparelle assenti dalla bolla", () => {
  const c = controllaOrdini(
    righe,
    [{ purchase_order_item_id: "clima", quantita: 10 }],
    [{ purchase_order_item_id: "clima", quantita: 10, tipo: "ingresso" }],
  );
  expect(c.map((r) => [r.id, r.daRicevere, r.stato])).toEqual([
    ["clima", 0, "completa"],
    ["tapp", 2, "da_ricevere"],
  ]);
  expect(progressoOrdine(c)).toMatchObject({
    complete: 1,
    daCompletare: 1,
    percentuale: 50,
  });
});
it("il secondo DDT completa soltanto il residuo e non duplica il primo", () => {
  const c = controllaOrdini(
    righe.map((r) => ({ ...r, quantity_received: r.quantity })),
    [{ purchase_order_item_id: "tapp", quantita: 2 }],
    [{ purchase_order_item_id: "tapp", quantita: 2, tipo: "ingresso" }],
  );
  expect(c.map((r) => r.accettataQui)).toEqual([0, 2]);
  expect(progressoOrdine(c).percentuale).toBe(100);
});
it("un reso riapre il residuo e un'eccedenza non cancella la merce mancante su un'altra riga", () => {
  const c = controllaOrdini(
    [
      { ...righe[0], quantity_received: 11 },
      { ...righe[1], quantity_received: 1 },
    ],
    [],
    [{ purchase_order_item_id: "tapp", quantita: 1, tipo: "reso" }],
  );
  expect(c.map((r) => [r.stato, r.daRicevere, r.eccedenza])).toEqual([
    ["eccedenza", 0, 1],
    ["parziale", 1, 0],
  ]);
  expect(c[1].accettataQui).toBe(-1);
  expect(progressoOrdine(c).percentuale).toBe(75);
});
it("la percentuale non somma metri a pezzi e resta sotto il 100% finché manca una quantità", () => {
  expect(
    progressoOrdine([
      { quantity: 1000, quantity_received: 1000 },
      { quantity: 1, quantity_received: 0.999 },
    ]),
  ).toMatchObject({ percentuale: 99, daCompletare: 1 });
});
