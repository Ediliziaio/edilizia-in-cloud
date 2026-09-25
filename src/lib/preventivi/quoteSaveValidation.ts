export interface QuoteAmounts {
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
}

/** Non generare il PDF con totali diversi da quelli confermati dall'utente. */
export function assertSavedQuoteAmounts(saved: QuoteAmounts, expected: QuoteAmounts): void {
  for (const key of ["subtotal", "discount_amount", "vat_amount", "total"] as const) {
    const value = Number(saved[key]);
    if (saved[key] == null || !Number.isFinite(value) ||
        !Number.isFinite(expected[key]) || Math.abs(value - expected[key]) > 0.005) {
      throw new Error("I totali restituiti dal server differiscono dall'anteprima. Il PDF non è stato generato: verifica l'allineamento dei calcoli sul database prima di proseguire.");
    }
  }
}
