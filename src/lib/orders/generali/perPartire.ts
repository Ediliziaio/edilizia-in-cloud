// src/lib/orders/generali/perPartire.ts
// La lista «Per partire» della generale (piano §3.3): pochi passi, diversi per modello, che
// spariscono da soli man mano che si fanno. Un passo di cui non si conosce lo stato (lettura
// fallita, permesso mancante) arriva qui come null e non compare: meglio tacere che sbagliare.
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

export type IdPasso = "contratto" | "figlie" | "piano" | "fonti";

export interface PassoPerPartire { id: IdPasso; fatto: boolean }

export interface StatoPerPartire {
  figlie: number;
  /** null = non si sa. */
  contrattoCompilato: boolean | null;
  versioniPiano: number | null;
  fonti: number | null;
}

export function passiPerPartire(modello: ModelloGenerale, s: StatoPerPartire): PassoPerPartire[] {
  const figlie: PassoPerPartire = { id: "figlie", fatto: s.figlie > 0 };
  const piano: PassoPerPartire | null = s.versioniPiano === null ? null : { id: "piano", fatto: s.versioniPiano > 0 };
  const passi = modello === "appalto"
    ? [s.contrattoCompilato === null ? null : { id: "contratto" as const, fatto: s.contrattoCompilato }, figlie, piano]
    : [figlie, piano, s.fonti === null ? null : { id: "fonti" as const, fatto: s.fonti > 0 }];
  return passi.filter((p): p is PassoPerPartire => p !== null);
}

/** La lista serve finché resta qualcosa da fare. */
export const perPartireServe = (passi: readonly PassoPerPartire[]): boolean => passi.some((p) => !p.fatto);
