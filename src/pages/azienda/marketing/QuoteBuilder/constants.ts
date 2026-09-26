/**
 * QuoteBuilder — constants
 * Estratto da QuoteBuilder.tsx (MP-MKT-001).
 */
import { User, Package, FileCheck } from "lucide-react";

export const STEPS = [
  { key: "cliente", label: "Cliente e progetto", labelBreve: "Cliente", icon: User },
  { key: "prodotti", label: "Prodotti e lavori", labelBreve: "Prodotti", icon: Package },
  { key: "riepilogo", label: "Anteprima e conferma", labelBreve: "Conferma", icon: FileCheck },
] as const;

export type QuoteStepKey = (typeof STEPS)[number]["key"];
