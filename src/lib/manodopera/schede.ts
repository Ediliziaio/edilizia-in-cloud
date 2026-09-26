/**
 * Manodopera e Mezzi (26/09/2026): una voce di menu con tre schede, ognuna col
 * suo permesso e la sua parte di piano. La voce si vede se almeno una scheda è
 * disponibile; menu e pagina usano questa stessa regola, così non capita di
 * vedere la voce e trovare la pagina vuota.
 */
export type SchedaManodopera = "operai" | "subappaltatori" | "mezzi";

export const SCHEDE_MANODOPERA: readonly { chiave: SchedaManodopera; etichetta: string }[] = [
  { chiave: "operai", etichetta: "Operai" },
  { chiave: "subappaltatori", etichetta: "Subappaltatori" },
  { chiave: "mezzi", etichetta: "Mezzi e attrezzature" },
];

export interface IngressiSchedeManodopera {
  permessi: { operai: boolean; subappaltatori: boolean; mezzi: boolean };
  /** Il modulo è nel piano (o il piano non è ancora noto, o è demo/limitato). */
  modulo: (chiave: "employees" | "mezzi") => boolean;
  /** I subappaltatori non sono spenti per questa azienda. */
  subappaltatoriNelPiano: boolean;
}

export function schedeManodopera(i: IngressiSchedeManodopera): SchedaManodopera[] {
  const out: SchedaManodopera[] = [];
  if (i.permessi.operai && i.modulo("employees")) out.push("operai");
  if (i.permessi.subappaltatori && i.subappaltatoriNelPiano) out.push("subappaltatori");
  if (i.permessi.mezzi && i.modulo("mezzi")) out.push("mezzi");
  return out;
}

/** La scheda da aprire: quella chiesta nell'indirizzo se c'è, altrimenti la prima. */
export function schedaDaAprire(
  disponibili: readonly SchedaManodopera[],
  richiesta: string | null | undefined,
): SchedaManodopera | null {
  const chiesta = disponibili.find((s) => s === richiesta);
  return chiesta ?? disponibili[0] ?? null;
}
