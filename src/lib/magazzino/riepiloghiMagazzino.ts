import { unitaConsumoConfrontabile } from "@/lib/distinta/consumiMateriali";
import type { ArticoloValorizzato } from "@/hooks/warehouse/useWarehouseValorizzazione";

/** Le quantità si confrontano solo all'interno della stessa unità. */
export function riepilogoValore(articoli: ArticoloValorizzato[]) {
  const positivi = articoli.filter(a => Number(a.quantity) > 0);
  const quantita = new Map<string, number>();
  let unitaDaVerificare = 0;
  for (const a of positivi) {
    if (!a.unita_misura?.trim()) { unitaDaVerificare++; continue; }
    const unit = unitaConsumoConfrontabile(a.unita_misura);
    quantita.set(unit, (quantita.get(unit) ?? 0) + Number(a.quantity));
  }
  return { articoli: positivi.length, conLotti: positivi.filter(a => a.ha_lotti).length,
    quantita: [...quantita].sort(([a], [b]) => a.localeCompare(b)), unitaDaVerificare,
    valoreSenzaLotti: positivi.filter(a => !a.ha_lotti).reduce((sum, a) => sum + Number(a.valore), 0) };
}

export function fabbisognoMateriale(quantity: number, reserved: number, issued: number, returned: number) {
  const fuori = Math.max(0, issued - returned);
  const impegnato = Math.max(0, reserved);
  return { previsti: quantity, fuori, impegnato, daCoprire: Math.max(0, quantity - fuori - impegnato) };
}
