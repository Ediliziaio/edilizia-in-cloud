/**
 * QuoteBuilder — constants
 * Estratto da QuoteBuilder.tsx (MP-MKT-001).
 */
import { User, Package, FileStack, FileCheck } from "lucide-react";

export const STEPS = [
  { key: "cliente", label: "Cliente", icon: User },
  { key: "prodotti", label: "Prodotti", icon: Package },
  { key: "documenti", label: "Documenti", icon: FileStack },
  { key: "riepilogo", label: "Riepilogo", icon: FileCheck },
] as const;

export type QuoteStepKey = (typeof STEPS)[number]["key"];
