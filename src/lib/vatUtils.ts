// VAT utility functions and constants

export const VAT_RATES = [
  { value: 22, label: "22% - Ordinaria" },
  { value: 10, label: "10% - Ridotta" },
  { value: 4, label: "4% - Minima" },
  { value: 0, label: "0% - Esente/Estero" },
] as const;

export type VatRate = (typeof VAT_RATES)[number]["value"];

/**
 * Calculate net amount and VAT from gross (VAT-inclusive) amount
 * @param grossAmount - The total amount including VAT
 * @param vatRate - The VAT rate percentage (e.g., 22 for 22%)
 * @returns Object with netAmount and vatAmount
 */
export function calculateNetFromGross(grossAmount: number, vatRate: number): { netAmount: number; vatAmount: number } {
  if (vatRate === 0) {
    return { netAmount: grossAmount, vatAmount: 0 };
  }
  const netAmount = grossAmount / (1 + vatRate / 100);
  const vatAmount = grossAmount - netAmount;
  return { 
    netAmount: Math.round(netAmount * 100) / 100, 
    vatAmount: Math.round(vatAmount * 100) / 100 
  };
}

/**
 * Calculate gross amount from net amount
 * @param netAmount - The amount without VAT
 * @param vatRate - The VAT rate percentage (e.g., 22 for 22%)
 * @returns Object with grossAmount and vatAmount
 */
export function calculateGrossFromNet(netAmount: number, vatRate: number): { grossAmount: number; vatAmount: number } {
  const vatAmount = netAmount * (vatRate / 100);
  const grossAmount = netAmount + vatAmount;
  return { 
    grossAmount: Math.round(grossAmount * 100) / 100, 
    vatAmount: Math.round(vatAmount * 100) / 100 
  };
}

/**
 * Get VAT rate label from value
 */
export function getVatRateLabel(vatRate: number): string {
  const rate = VAT_RATES.find(r => r.value === vatRate);
  return rate?.label || `${vatRate}%`;
}
