// src/test/logic/creaCommessaPagamenti.test.ts
/**
 * Il modulo di nuova commessa (CreateOrder) e il modello di pagamento: guardie sul testo, perché la pagina è troppo grande
 * per un test di comportamento. Il comportamento vero è provato in `modelliPagamento`, `ModelloPagamentoSelect` e
 * `FinancialSummary` (importi che seguono le rate da modello).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SORGENTE = readFileSync(join(__dirname, "../../pages/azienda/CreateOrder.tsx"), "utf8");

describe("il modello di pagamento nel modulo di nuova commessa", () => {
  it("si apre dopo aver letto il modello di partenza, e lo decide una volta sola (stato iniziale, non un effetto)", () => {
    expect(SORGENTE).toContain("function CreateOrderConPartenza()");
    expect(SORGENTE).toContain("<CreateOrderInner modelloIniziale={modello} />");
    expect(SORGENTE).toContain("useState<Installment[]>(() => rateDiPartenza(modelloIniziale))");
    expect(SORGENTE).not.toMatch(/useEffect\([^)]*modelloIniziale/);
  });

  it("le rate da modello seguono il totale e l'IVA, e la percentuale non parte per il server", () => {
    expect(SORGENTE.match(/ricalcolaRatePercentuali\(/g)).toHaveLength(2);
    const payload = SORGENTE.slice(SORGENTE.indexOf("const installmentsPayload"), SORGENTE.indexOf("const createOrderAtomic"));
    expect(payload).not.toContain("percent");
  });

  it("il selettore sta DENTRO il riepilogo finanziario (dove ci sono le rate), non come scheda a parte", () => {
    expect(SORGENTE).toContain("<FinancialSummary\n            modelloRate={<ModelloPagamentoSelect");
    // una scheda a parte, nella griglia del modulo, lascerebbe un buco nella colonna accanto
    expect(SORGENTE.match(/<ModelloPagamentoSelect/g)).toHaveLength(1);
    expect(SORGENTE).toContain('installments.some((i) => i.percent != null) ? comeSiPagaId : ""');
  });
});
