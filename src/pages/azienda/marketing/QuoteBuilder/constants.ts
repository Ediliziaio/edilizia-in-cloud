/**
 * QuoteBuilder — constants
 * Estratto da QuoteBuilder.tsx (MP-MKT-001).
 */
import { User, Package, FileCheck } from "lucide-react";

export const STEPS = [
  { key: "cliente", label: "Cliente e progetto", icon: User },
  { key: "prodotti", label: "Prodotti e lavori", icon: Package },
  { key: "riepilogo", label: "Anteprima e conferma", icon: FileCheck },
] as const;

export type QuoteStepKey = (typeof STEPS)[number]["key"];
