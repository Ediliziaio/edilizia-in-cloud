import { describe, it, expect } from "vitest";
import { valutaEliminazione } from "@/lib/magazzino/eliminazioneArticolo";

/**
 * Questa funzione decide se un articolo di magazzino si può cancellare. Se
 * sbaglia in un senso l'utente resta senza il pulsante che gli serve; se
 * sbaglia nell'altro cancella lo storico di magazzino o i seriali per cascata.
 */

const vuoto = { quantity: 0, quantity_reserved: 0, movimenti: 0, seriali: 0, lotti: 0 };

describe("valutaEliminazione", () => {
  it("un articolo vuoto e mai movimentato si elimina", () => {
    const e = valutaEliminazione(vuoto);
    expect(e.eliminabile).toBe(true);
    expect(e.motivo).toBe("");
  });

  it("con giacenza non si elimina, e si dice quanta", () => {
    const e = valutaEliminazione({ ...vuoto, quantity: 12 });
    expect(e.eliminabile).toBe(false);
    expect(e.motivo).toContain("12 pezzi a magazzino");
  });

  it("con quantità impegnata su commessa non si elimina", () => {
    const e = valutaEliminazione({ ...vuoto, quantity_reserved: 3 });
    expect(e.eliminabile).toBe(false);
    expect(e.motivo).toContain("impegnati");
  });

  it("con movimenti non si elimina: sparirebbe lo storico", () => {
    const e = valutaEliminazione({ ...vuoto, movimenti: 30 });
    expect(e.eliminabile).toBe(false);
    expect(e.motivo).toContain("storico");
  });

  it("con seriali collegati non si elimina: la cascata li cancellerebbe", () => {
    const e = valutaEliminazione({ ...vuoto, seriali: 5 });
    expect(e.eliminabile).toBe(false);
    expect(e.motivo).toContain("seriali");
  });

  it("con lotti collegati non si elimina", () => {
    expect(valutaEliminazione({ ...vuoto, lotti: 2 }).eliminabile).toBe(false);
  });

  it("con righe di trasferimento tra magazzini non si elimina (RESTRICT senza cascata)", () => {
    const e = valutaEliminazione({ ...vuoto, trasferimenti: 3 });
    expect(e.eliminabile).toBe(false);
    expect(e.motivo).toContain("trasferimento");
  });

  it("il campo trasferimenti è facoltativo: chi non lo conta non cambia esito", () => {
    expect(valutaEliminazione({ ...vuoto }).eliminabile).toBe(true);
  });

  it("la giacenza viene prima di tutto nel messaggio: è il motivo più concreto", () => {
    const e = valutaEliminazione({ quantity: 4, quantity_reserved: 2, movimenti: 9, seriali: 1, lotti: 1 });
    expect(e.motivo).toContain("4 pezzi a magazzino");
  });
});
