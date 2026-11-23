/**
 * Pareti bloccate (23/11/2026): quelle che l'utente ha dichiarato intoccabili — strutturali,
 * cavedi, pareti con le colonne degli impianti. Una modifica che ne sposta, accorcia,
 * assottiglia, demolisce o cancella una viene fermata, da qualunque parte arrivi
 * (trascinamento, chat del disegno, Silvio). Il blocco lo mette e lo toglie solo l'utente.
 */
interface PareteVincolata {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  spessore: number;
  stato: string;
  bloccato?: boolean;
}

const uguale = (a: number, b: number) => Math.abs(a - b) < 0.05;

/** Le pareti bloccate che la modifica tocca: vuoto se si può applicare. */
export interface PareteToccata { id: string; motivo: "spostata" | "demolita" | "tolta" }

export function paretiBloccateToccate(prima: readonly PareteVincolata[], dopo: readonly PareteVincolata[]): PareteToccata[] {
  const nuove = new Map(dopo.map((m) => [m.id, m]));
  return prima.flatMap((m): PareteToccata[] => {
    if (!m.bloccato) return [];
    const d = nuove.get(m.id);
    if (!d) return [{ id: m.id, motivo: "tolta" }];
    if (d.stato === "da_demolire" && m.stato !== "da_demolire") return [{ id: m.id, motivo: "demolita" }];
    const ferma = uguale(m.p1.x, d.p1.x) && uguale(m.p1.y, d.p1.y) && uguale(m.p2.x, d.p2.x) && uguale(m.p2.y, d.p2.y) && uguale(m.spessore, d.spessore);
    return ferma ? [] : [{ id: m.id, motivo: "spostata" }];
  });
}

export function messaggioParetiBloccate(toccate: readonly { motivo: string }[]): string {
  if (!toccate.length) return "";
  const cosa = toccate.some((t) => t.motivo !== "spostata") ? "demolirebbe" : "sposterebbe";
  return toccate.length === 1
    ? `Questa modifica ${cosa} una parete bloccata. Toglile il blocco dai dettagli della parete, se vuoi davvero cambiarla.`
    : `Questa modifica ${cosa} ${toccate.length} pareti bloccate. Togli il blocco dai dettagli delle pareti, se vuoi davvero cambiarle.`;
}
