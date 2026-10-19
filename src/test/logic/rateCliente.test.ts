import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { daRigheRpc, prossimaRata, rataChiusa, riepilogoCommesse } from "@/lib/cliente/rateCliente";

// Contratto 10.000 € + IVA 22% = 12.200 €, acconto 3.660 € pagato, variante approvata 1.000 € + IVA:
// il saldo vale 9.760 € (la regola), non gli 8.540 € salvati sulla rata.
const righe = daRigheRpc([
  { order_id: "o", company_id: "c", order_code: "C-1", description: "Bagno", installment_id: "acc", posizione: 1,
    label: "Acconto", tipo: "deposit", importo: 3660, residuo: 0, is_paid: true, paid_date: "2026-09-01",
    expected_date: "2026-09-01", finanziamento: false, totale_commessa: 13420, incassato_commessa: 3660 },
  { order_id: "o", company_id: "c", order_code: "C-1", description: "Bagno", installment_id: "saldo", posizione: 2,
    label: "Saldo", tipo: "balance", importo: "9760.00", residuo: "9760.00", is_paid: false, paid_date: null,
    expected_date: "2026-12-01", finanziamento: false, totale_commessa: 13420, incassato_commessa: 3660 },
]);

describe("rate del portale cliente", () => {
  it("legge totale, pagato e residuo dalla regola, una volta per commessa", () => {
    expect(riepilogoCommesse(righe)).toEqual({ totale: 13420, pagato: 3660, residuo: 9760 });
    expect(prossimaRata(righe)).toMatchObject({ label: "Saldo", residuo: 9760 });
  });
  it("tratta come pagata la rata saldata sulla fattura, anche se non è segnata pagata", () => {
    expect(rataChiusa({ is_paid: false, residuo: 0 })).toBe(true);
    expect(rataChiusa({ is_paid: false, residuo: 120 })).toBe(false);
  });
  it("dà un id alla parte non pianificata e la mette dopo le rate con data", () => {
    const [riga] = daRigheRpc([
      { order_id: "o", company_id: "c", order_code: null, description: null, installment_id: null, posizione: 3,
        label: "Da pianificare", tipo: "non_pianificato", importo: 500, residuo: 500, is_paid: false,
        paid_date: null, expected_date: null, finanziamento: false, totale_commessa: 13920, incassato_commessa: 3660 },
    ]);
    expect(riga.id).toBe("non-pianificato-o");
    expect(prossimaRata([riga, ...righe])?.label).toBe("Saldo");
  });
});
