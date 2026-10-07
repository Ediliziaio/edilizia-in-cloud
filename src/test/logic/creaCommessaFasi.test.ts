// src/test/logic/creaCommessaFasi.test.ts
/**
 * Il modulo di nuova commessa (CreateOrder) e le fasi di partenza: guardie sul testo, perché la pagina è troppo
 * grande per un test di comportamento. Il comportamento vero è provato nei moduli puri (`nuovaCommessa`) e nel
 * componente (`FasiDiPartenzaSelect`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SORGENTE = readFileSync(join(__dirname, "../../pages/azienda/CreateOrder.tsx"), "utf8");

describe("fasi di partenza nel modulo di nuova commessa", () => {
  it("le fasi scelte si aggiungono dopo la RPC, dal server, e un errore non fa sparire la commessa", () => {
    const rpc = SORGENTE.indexOf('.rpc("aggiungi_fasi_commessa"');
    expect(rpc).toBeGreaterThan(SORGENTE.indexOf('createOrderAtomic("create_order_atomic"'));
    expect(SORGENTE).toContain("p_fasi: fasiPerCommessa(fasiDiPartenza.modello)");
    expect(SORGENTE).toContain('toast.error("Fasi non aggiunte"');
    expect(SORGENTE.slice(rpc, SORGENTE.indexOf("return result;", rpc))).not.toContain("throw");
  });

  it("il modulo non chiama commessa_avvia: le fasi sono quelle scelte (o nessuna), non due volte", () => {
    expect(SORGENTE).not.toContain("commessa_avvia");
  });

  it("il selettore è nella prima scheda, dopo lo stato iniziale", () => {
    expect(SORGENTE.indexOf("<FasiDiPartenzaSelect")).toBeGreaterThan(SORGENTE.indexOf('<Label>Stato Iniziale</Label>'));
    expect(SORGENTE.indexOf("<FasiDiPartenzaSelect")).toBeLessThan(SORGENTE.indexOf("{/* Internal Notes */}"));
  });
});
