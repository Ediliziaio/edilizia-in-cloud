import { describe, expect, it } from "vitest";
import { allegatoOda, dettaglioAccontoSaldo } from "@/lib/distinta/elencoArticoli";

describe("riga dei materiali per fase: ODA allegato e acconto/saldo", () => {
  it("trova l'allegato dell'ordine come il vecchio elenco", () => {
    const allegati = [
      { file_name: "foto-posa.jpg", file_url: "a" },
      { file_name: "ODA-1700000000-ordine.pdf", file_url: "b" },
    ];
    expect(allegatoOda(allegati)?.file_url).toBe("b");
    expect(allegatoOda([{ file_name: "conferma_oda_fornitore.pdf", file_url: "c" }])?.file_url).toBe("c");
    expect(allegatoOda([{ file_name: "scheda.pdf", file_url: "d" }])).toBeNull();
    expect(allegatoOda(undefined)).toBeNull();
  });

  it("acconto e saldo solo per i pagamenti in due rate con importi", () => {
    expect(dettaglioAccontoSaldo({ payment_method: "bonifico", deposit_amount: 100 })).toBeNull();
    expect(dettaglioAccontoSaldo({ payment_method: "50_50" })).toBeNull();
    expect(dettaglioAccontoSaldo({
      payment_method: "30_70", deposit_amount: 300, deposit_paid: true, balance_amount: 700, balance_paid: false,
      balance_expected_date: "2026-11-15",
    })).toEqual({ acconto: 300, accontoPagato: true, saldo: 700, saldoPagato: false, saldoPrevisto: "2026-11-15" });
    // Saldo pagato: la data prevista non serve più.
    expect(dettaglioAccontoSaldo({
      payment_method: "50_50", deposit_amount: 500, deposit_paid: true, balance_amount: 500, balance_paid: true, balance_expected_date: "2026-11-15",
    })?.saldoPrevisto).toBeNull();
  });
});
