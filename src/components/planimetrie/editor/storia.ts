/**
 * Annulla / ripeti: la pianta prima, adesso e dopo. Ogni modifica completa
 * (un trascinamento finito, una misura scritta) è un passo.
 */
import type { Pianta } from "./adattatore";

export interface Storia {
  passato: Pianta[];
  presente: Pianta;
  futuro: Pianta[];
}

export const PASSI_MASSIMI = 200;

export function nuovaStoria(pianta: Pianta): Storia {
  return { passato: [], presente: pianta, futuro: [] };
}

export function esegui(storia: Storia, pianta: Pianta): Storia {
  if (pianta === storia.presente) return storia;
  const passato = [...storia.passato, storia.presente];
  if (passato.length > PASSI_MASSIMI) passato.shift();
  return { passato, presente: pianta, futuro: [] };
}

export function annulla(storia: Storia): Storia {
  if (!storia.passato.length) return storia;
  const passato = storia.passato.slice(0, -1);
  return { passato, presente: storia.passato[storia.passato.length - 1], futuro: [storia.presente, ...storia.futuro] };
}

export function ripeti(storia: Storia): Storia {
  if (!storia.futuro.length) return storia;
  const [presente, ...futuro] = storia.futuro;
  return { passato: [...storia.passato, storia.presente], presente, futuro };
}
