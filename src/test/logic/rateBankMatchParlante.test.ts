import { describe, expect, it } from "vitest";
import { bonificoParlanteDellaRata, matchRateToBankTransactions } from "@/lib/rateBankMatch";

const rata = { id: "r1", label: "Acconto", amount: 20405, expected_date: "2026-06-01" };

describe("rate e bonifico parlante", () => {
  it("riconosce l'accredito netto della ritenuta dell'11% e delle commissioni", () => {
    expect(bonificoParlanteDellaRata(20405, 18563.7, "2026-06-10")).toEqual({ ritenuta: 1839.8, commissioni: 1.5, aliquota: 11 });
  });

  it("prima del 01/03/2024 la ritenuta è dell'8%", () => {
    // 20405 / 1,22 × 8% = 1338,03 → netto 19066,97
    expect(bonificoParlanteDellaRata(20405, 19066.97, "2024-02-20")?.aliquota).toBe(8);
    expect(bonificoParlanteDellaRata(20405, 18565.2, "2024-02-20")).toBeNull();
  });

  it("un accredito che non è il netto della rata non è un bonifico parlante", () => {
    expect(bonificoParlanteDellaRata(20405, 18000, "2026-06-10")).toBeNull();
    expect(bonificoParlanteDellaRata(20405, 18570, "2026-06-10")).toBeNull();
  });

  it("il match chiude la rata col bonifico parlante e dice la ritenuta", () => {
    const [m] = matchRateToBankTransactions([rata], [{ id: "t1", booking_date: "2026-06-10", amount: 18563.7 }]);
    expect(m.tx.id).toBe("t1");
    expect(m.parlante).toEqual({ ritenuta: 1839.8, commissioni: 1.5, aliquota: 11 });
  });

  it("l'importo esatto resta un incasso normale", () => {
    const [m] = matchRateToBankTransactions([rata], [{ id: "t1", booking_date: "2026-06-10", amount: 20405 }]);
    expect(m.parlante).toBeNull();
  });
});
