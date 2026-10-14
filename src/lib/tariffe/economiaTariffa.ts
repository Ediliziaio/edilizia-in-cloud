import { costoTariffa, type CostiTariffa } from "@/lib/listino/costoTariffa";
import { oggettoCampi } from "./costoLavorazione";

const unitario = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
export function formatPrezzoUnitario(valore: number): string {
  return unitario.format(valore);
}

/** Uno zero esplicito nel calcolo è un costo noto; lo zero delle vecchie colonne può essere solo il default. */
export function costoTariffaConosciuto(
  t: (CostiTariffa & { custom_field_values?: unknown }) | null | undefined,
): number | null {
  if (!t) return null;
  const costo = costoTariffa(t);
  if (costo != null && costo > 0) return costo;
  const config = oggettoCampi(
    oggettoCampi(t.custom_field_values)._costo_lavorazione,
  );
  return costo === 0 &&
    config.versione === 1 &&
    config.costo_applicato === 0 &&
    (config.modalita !== "manuale" || config.costo_diretto_impostato !== false)
    ? 0
    : null;
}

export function semaforoMargineTariffa(margine: number | null, soglia: number) {
  if (margine == null || !Number.isFinite(margine))
    return {
      dot: "bg-muted-foreground/40",
      text: "text-muted-foreground",
      label: "Margine non calcolabile",
    };
  if (margine < 0)
    return {
      dot: "bg-rose-500",
      text: "text-rose-600",
      label: "In perdita (sottocosto)",
    };
  if (margine < soglia)
    return {
      dot: "bg-amber-500",
      text: "text-amber-600",
      label: `Sotto la soglia minima (${soglia}%)`,
    };
  return {
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    label: "Margine sano",
  };
}

/** Arrotonda in su ai quattro decimali della tariffa, per raggiungere davvero il margine richiesto. */
export function prezzoMinimoPerMargine(
  costo: number,
  soglia: number,
): number | null {
  if (
    !Number.isFinite(costo) ||
    costo <= 0 ||
    !Number.isFinite(soglia) ||
    soglia < 0 ||
    soglia >= 100
  )
    return null;
  const prezzo = Math.ceil((costo / (1 - soglia / 100)) * 1e4 - 1e-8) / 1e4;
  return prezzo > 0 && prezzo < 1e8 ? prezzo : null;
}
