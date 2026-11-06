import { describe, expect, it } from "vitest";
import { ricezioneNonAllineata } from "@/lib/magazzino/ricezioneNonAllineata";
describe("ricezioni già presenti e residuo OdA", () => {
  const articolo = { order_item_id: "riga-a", quantity_received: 0 };
  const ricevuta = { order_item_id: "riga-a", quantity_received: 1 };
  it("blocca una nuova ricezione se il contatore OdA è fermo a zero", () => expect(ricezioneNonAllineata(articolo, [ricevuta])).toBe(true));
  it("non blocca un riepilogo già allineato", () => expect(ricezioneNonAllineata({ ...articolo, quantity_received: 1 }, [ricevuta])).toBe(false));
  it("considera tutte le ricezioni della riga", () => expect(ricezioneNonAllineata({ ...articolo, quantity_received: 1 }, [ricevuta, ricevuta])).toBe(true));
  it("non usa le ricezioni di un altro materiale", () => expect(ricezioneNonAllineata(articolo, [{ ...ricevuta, order_item_id: "riga-b" }])).toBe(false));
  it("non attribuisce le righe non collegate", () => expect(ricezioneNonAllineata({ order_item_id: null }, [ricevuta])).toBe(false));
  it("non confonde l’arrotondamento con una ricezione aggiuntiva", () => expect(ricezioneNonAllineata({ ...articolo, quantity_received: 0.3 }, [{ ...ricevuta, quantity_received: 0.1 + 0.2 }])).toBe(false));
});
