// src/lib/orders/generali/moduli.ts
// I moduli della commessa generale (piano, §2.2). Il modello sceglie quali sono accesi;
// ogni modulo vive nei suoi file (lib, hook, scheda) e si aggancia alla pagina della
// generale da src/components/orders/generali/schede.tsx.
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

export const MODULI = ["contratto", "piano", "unita", "investitori", "documenti"] as const;
export type ModuloGenerale = typeof MODULI[number];

/**
 * Quali moduli usa ogni modello. «contratto» comprende SAL di contratto ed elenco prezzi;
 * «piano» comprende costi comuni e flusso di cassa (vedi il piano, §2.2 e §4).
 */
export const MODULI_PER_MODELLO: Record<ModelloGenerale, readonly ModuloGenerale[]> = {
  appalto: ["contratto", "piano", "documenti"],
  sviluppo: ["unita", "piano", "investitori", "documenti"],
  compravendita: ["unita", "piano", "investitori", "documenti"],
};

export const moduliDelModello = (modello: ModelloGenerale): readonly ModuloGenerale[] => MODULI_PER_MODELLO[modello];
