// src/lib/orders/salRate.ts
/**
 * SAL = rata (07/10/2026): il piano rate dice quali SAL aspetta, il verbale certifica la sua rata, e
 * quando matura (emesso, o approvato dal cliente: lo sceglie l'azienda) la rata è da incassare.
 * Modulo puro: nessun React, nessun Supabase.
 */
import type { Installment } from "@/lib/orderUtils";

export interface SalPerRata { numero_sal: number; installment_id: string | null }

const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/**
 * I SAL che il piano rate aspetta: le rate «al SAL n°» non incassate che non hanno ancora il loro verbale
 * (né legato alla rata, né col numero che la rata aspetta).
 */
export function rateSalDaEmettere(rate: ReadonlyArray<Installment>, salList: ReadonlyArray<SalPerRata>): Installment[] {
  return rate
    .filter((r) => r.trigger_evento === "sal_numero" && !r.is_paid && !!r.id)
    .filter((r) => !salList.some((s) => s.installment_id === r.id || (r.trigger_numero != null && s.numero_sal === r.trigger_numero)))
    .sort((a, b) => (a.trigger_numero ?? a.position) - (b.trigger_numero ?? b.position));
}

/** Il numero con cui nasce il verbale: quello che la rata aspetta, se è libero; altrimenti il primo dopo l'ultimo. */
export function numeroNuovoSal(rata: Pick<Installment, "trigger_numero"> | null, salList: ReadonlyArray<Pick<SalPerRata, "numero_sal">>): number {
  const numero = rata?.trigger_numero;
  if (numero && !salList.some((s) => s.numero_sal === numero)) return numero;
  return salList.reduce((m, s) => Math.max(m, s.numero_sal), 0) + 1;
}

/** Quanto vale la rata, IVA inclusa, per un SAL da fatturare per quel netto. */
export function rataDaSal(nettoDaFatturare: number, aliquotaIva: number): number {
  return arrotonda(Math.max(0, nettoDaFatturare) * (1 + aliquotaIva / 100));
}

/**
 * L'importo a cui proporre di portare la rata certificata da un SAL, o `null` se non c'è niente da proporre:
 * senza rata, rata incassata, saldo finale (lo calcola il modulo: totale meno le altre), SAL senza importo
 * da fatturare, o importi che già coincidono (per meno di un euro).
 */
export function rataDaAllineareAlSal(p: {
  rata: Pick<Installment, "is_paid"> | null | undefined;
  saldoFinale: boolean;
  /** L'importo che la rata mostra adesso. */
  importoMostrato: number;
  nettoDaFatturare: number;
  aliquotaIva: number;
}): number | null {
  if (!p.rata || p.rata.is_paid || p.saldoFinale || !(p.nettoDaFatturare > 0)) return null;
  const proposto = rataDaSal(p.nettoDaFatturare, p.aliquotaIva);
  return Math.abs(proposto - p.importoMostrato) > 1 ? proposto : null;
}

/** Il passo dopo nella vita di un verbale: emesso, poi approvato (firmato lo dice il cliente con il link). */
export function prossimoStatoSal(stato: string): { stato: "emesso" | "approvato"; etichetta: string } | null {
  if (stato === "bozza") return { stato: "emesso", etichetta: "Emetti" };
  if (stato === "emesso") return { stato: "approvato", etichetta: "Segna approvato" };
  return null;
}
