/**
 * task.ts — MP-SILVIO-04 · macchina a stati della memoria task (logica pura)
 * Ripresa pulita: salta i passi già fatti, si ferma al primo bloccante
 * (attende_conferma/fallito), esegue il primo 'da_fare'. Nessun I/O.
 */

export type StatoPasso = "da_fare" | "fatto" | "saltato" | "fallito" | "attende_conferma";
export type StatoTask =
  | "aperto" | "in_corso" | "in_attesa_conferma" | "bloccato" | "completato" | "fallito" | "annullato";

export interface Passo {
  ordine: number;
  azione_chiave: string;
  stato: StatoPasso;
}

const TERMINATO_OK = new Set<StatoPasso>(["fatto", "saltato"]);

/** Passi ordinati per `ordine` crescente (copia). */
function ordinati(passi: Passo[]): Passo[] {
  return [...(passi ?? [])].sort((a, b) => a.ordine - b.ordine);
}

/**
 * Prossimo passo ESEGUIBILE: scorrendo in ordine, salta fatto/saltato; se incontra
 * un 'da_fare' lo ritorna; se incontra prima un bloccante (attende_conferma/fallito)
 * ritorna null (il task non può proseguire finché non si sblocca).
 */
export function prossimoPassoEseguibile(passi: Passo[]): number | null {
  for (const p of ordinati(passi)) {
    if (TERMINATO_OK.has(p.stato)) continue;
    if (p.stato === "da_fare") return p.ordine;
    return null; // attende_conferma | fallito → bloccante
  }
  return null; // tutti terminati
}

/** Stato del task derivato dai passi (precedenza: conferma > fallito > completato > in_corso). */
export function statoTaskDaPassi(passi: Passo[]): StatoTask {
  const ps = ordinati(passi);
  if (ps.length === 0) return "aperto";
  if (ps.some((p) => p.stato === "attende_conferma")) return "in_attesa_conferma";
  if (ps.some((p) => p.stato === "fallito")) return "fallito";
  if (ps.every((p) => TERMINATO_OK.has(p.stato))) return "completato";
  return "in_corso";
}

/** Vero se il task è chiuso (archiviabile). */
export function taskChiuso(stato: StatoTask): boolean {
  return stato === "completato" || stato === "fallito" || stato === "annullato";
}

/** Avanzamento leggibile "X di N" (conta i passi terminati). */
export function avanzamento(passi: Passo[]): { fatti: number; totale: number } {
  const ps = passi ?? [];
  return { fatti: ps.filter((p) => TERMINATO_OK.has(p.stato)).length, totale: ps.length };
}
