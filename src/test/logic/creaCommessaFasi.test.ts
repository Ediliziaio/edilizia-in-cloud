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
    const rpc = SORGENTE.indexOf('await salvaFasiDiPartenza(');
    expect(rpc).toBeGreaterThan(SORGENTE.indexOf('createOrderAtomic("create_order_atomic"'));
    expect(SORGENTE).toContain("salvaFasiDiPartenza(result.id, fasiDaCreare");
    expect(SORGENTE).toContain("createdOrderIdRef.current = result.id");
    expect(SORGENTE).toContain("createOrderMutation.isPending || createdOrderIdRef.current");
    expect(SORGENTE).toContain("saveDraft({ ...datiBozza, commessaCreataId: result.id })");
    expect(SORGENTE).toContain('toast.error("Fasi non aggiunte"');
    expect(SORGENTE.slice(rpc, SORGENTE.indexOf("return result;", rpc))).not.toContain("throw");
  });

  it("il modulo non chiama commessa_avvia: le fasi sono quelle scelte (o nessuna), non due volte", () => {
    expect(SORGENTE).not.toContain("commessa_avvia");
  });

  it("pianificazione, modello e anteprima sono nella stessa scheda, una volta sola", () => {
    const scheda = SORGENTE.indexOf('title="Pianificazione lavori"');
    const fine = SORGENTE.indexOf("</QuoteCard>", scheda);
    expect(SORGENTE.match(/<FasiDiPartenzaSelect/g)).toHaveLength(1);
    expect(SORGENTE.indexOf("<FasiDiPartenzaSelect")).toBeGreaterThan(SORGENTE.indexOf('<PianificazioneCommessa', scheda));
    expect(SORGENTE.indexOf("<FasiDiPartenzaSelect")).toBeLessThan(fine);
    expect(SORGENTE.indexOf("<AnteprimaFasiCommessa", scheda)).toBeLessThan(fine);
  });
});
