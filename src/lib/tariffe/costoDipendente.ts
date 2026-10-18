import {
  reviewHourlyCost,
  type LaborEmployee,
} from "@/lib/campo/laborCostReview";
import type { ParametriCostoAzienda } from "@/lib/costoPersonale";

/** Stessa tariffa dell'anagrafica, senza esporre i dati retributivi nel form del listino. */
export function dipendentePerCostoLavorazione(
  d: Omit<LaborEmployee, "user_id">,
  parametri?: ParametriCostoAzienda | null,
) {
  const costo = reviewHourlyCost({ ...d, user_id: null }, parametri);
  return {
    id: d.id,
    first_name: d.first_name ?? "",
    last_name: d.last_name ?? "",
    costo_orario: costo.amount,
    costo_calcolato: costo.source === "calcolato",
    costo_nota: costo.note,
  };
}
