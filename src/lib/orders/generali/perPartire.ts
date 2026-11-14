// src/lib/orders/generali/perPartire.ts
// La lista «Per partire» della generale (piano §3.3): pochi passi, diversi per modello, che
// spariscono da soli man mano che si fanno. Un passo di cui non si conosce lo stato (lettura
// fallita, permesso mancante) arriva qui come null e non compare: meglio tacere che sbagliare.
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

export type IdPasso = "dati" | "contratto" | "figlie" | "piano" | "fonti";

export interface PassoPerPartire { id: IdPasso; fatto: boolean }

export interface StatoPerPartire {
  /** Quanti dati essenziali mancano (scheda «Dati», datiMancanti). */
  datiMancanti?: number;
  figlie: number;
  /** null = non si sa. */
  contrattoCompilato: boolean | null;
  /** Le voci del piano con un importo: un piano con le sole voci tipiche a zero non è ancora scritto. */
  vociPianoConImporto: number | null;
  fonti: number | null;
}

export function passiPerPartire(modello: ModelloGenerale, s: StatoPerPartire): PassoPerPartire[] {
  const figlie: PassoPerPartire = { id: "figlie", fatto: s.figlie > 0 };
  const piano: PassoPerPartire | null = s.vociPianoConImporto === null ? null : { id: "piano", fatto: s.vociPianoConImporto > 0 };
  // I dati della commessa per primi (14/11/2026): committente, indirizzo, date, tipologia.
  const dati: PassoPerPartire | null = s.datiMancanti === undefined ? null : { id: "dati", fatto: s.datiMancanti === 0 };
  const passi = modello === "appalto"
    ? [dati, s.contrattoCompilato === null ? null : { id: "contratto" as const, fatto: s.contrattoCompilato }, figlie, piano]
    : [dati, figlie, piano, s.fonti === null ? null : { id: "fonti" as const, fatto: s.fonti > 0 }];
  return passi.filter((p): p is PassoPerPartire => p !== null);
}

/** La lista serve finché resta qualcosa da fare. */
export const perPartireServe = (passi: readonly PassoPerPartire[]): boolean => passi.some((p) => !p.fatto);
