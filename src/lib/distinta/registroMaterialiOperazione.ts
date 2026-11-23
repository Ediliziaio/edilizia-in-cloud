import type { RegistroMateriale } from "@/hooks/useMaterialiOperazione";
import type { VoceMagazzino } from "./collegaArticoli";
import { abbinaGiacenzaArticoli } from "./navigazioneArticoli";
import { acquistabile } from "./statiFase";

export const CODE_MATERIALI = {
  tutti: "Tutti",
  verificare: "Da verificare",
  acquistare: "Pronti da ordinare",
  ordini: "Con OdA",
  consegnati: "Consegnati",
} as const;
export type CodaMateriali = keyof typeof CODE_MATERIALI;

export function prontoDaOrdinare(riga: RegistroMateriale) {
  return !!riga.supplier_id && riga.piano.canOrder && acquistabile(riga.validazione) && riga.verifica?.stato !== "da_verificare";
}

export function riservaMaterialeOperazione(riga: RegistroMateriale) {
  return riga.piano.daScorta > 0 && riga.fulfillment_status === "received"
    ? Math.min(riga.piano.daScorta, Math.max(0, Number(riga.warehouse_reserved_quantity) || 0))
    : 0;
}

export function nellaCodaMateriali(riga: RegistroMateriale, coda: CodaMateriali) {
  switch (coda) {
    case "tutti": return true;
    case "acquistare": return prontoDaOrdinare(riga);
    case "ordini": return riga.oda.length > 0;
    case "consegnati": return riga.acquisto.stato === "consegnato" || riga.acquisto.stato === "installato";
    case "verificare": return !!riga.piano.review || riga.verifica?.stato === "da_verificare"
      || (!acquistabile(riga.validazione) && riga.piano.remaining > 0)
      || (riga.piano.canOrder && !riga.supplier_id);
  }
}

/** Usa il libero di ogni lotto una volta per l'intera operazione, in ordine di fabbisogno. */
export function quoteGiacenzaMateriali(righe: RegistroMateriale[], stock: VoceMagazzino[], codici: Record<string, string | null>) {
  const libero = new Map(stock.map(riga => [riga.id, Number(riga.quantity_available)]));
  const abbina = abbinaGiacenzaArticoli(stock, codici);
  return new Map(righe.map(riga => {
    const riservata = riga.piano.daScorta > 0 ? riservaMaterialeOperazione(riga)
      : riga.stock_item_id && !riga.auto_deducted ? Math.max(0, Number(riga.quantity_reserved) || 0) : 0;
    const prelevata = riga.piano.daScorta > 0 ? Math.max(0, riga.piano.daScorta - riservata)
      : riga.stock_item_id && riga.auto_deducted ? Math.max(0, Number(riga.quantity) || 0) : 0;
    const residuo = riga.piano.daScorta > 0 ? riga.piano.remaining : Math.max(0, riga.piano.remaining - riservata - prelevata);
    const candidato = abbina(riga);
    const verifica = !!riga.piano.review || candidato === "verificare";
    const q = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
    let suggerita = 0;
    if (!verifica && candidato && residuo > 0) {
      suggerita = q(Math.min(residuo, libero.get(candidato.id) ?? 0));
      libero.set(candidato.id, q((libero.get(candidato.id) ?? 0) - suggerita));
    }
    return [riga.id, { riservata, prelevata, suggerita, candidato: candidato === "verificare" ? null : candidato,
      daComprare: verifica ? null : q(residuo - suggerita), verifica }] as const;
  }));
}
