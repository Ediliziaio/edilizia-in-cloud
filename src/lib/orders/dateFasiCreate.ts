/**
 * Le date alle fasi che il server ha appena creato (07/11/2026): quelle di una
 * commessa nata da un preventivo, che crea_commessa_preventivo_atomic fa nascere
 * dai capitoli del computo senza date. Stesse regole della nuova commessa
 * (pianificaFasi): una dopo l'altra sui giorni di lavoro, dall'inizio lavori.
 * Le fasi che hanno già una data non si toccano.
 */
import type { GiornoLavorativo } from "./sottofasi";
import { pianificaFasi } from "./pianoFasiNuovaCommessa";

interface Risposta<T> { data: T | null; error: { message: string } | null }
type Fase = { id: string; position: number; start_date: string | null; end_date: string | null };
type Sottofase = { phase_id: string; position: number; giorni: number | null; in_parallelo: boolean | null };

/** Quel poco di client Supabase che serve: si può sostituire nei test. */
export interface DbDateFasi {
  leggiFasi(orderId: string): PromiseLike<Risposta<Fase[]>>;
  leggiSottofasi(faseIds: string[]): PromiseLike<Risposta<Sottofase[]>>;
  scriviDate(id: string, date: { start_date: string; end_date: string }): PromiseLike<{ error: { message: string } | null }>;
}

/** null se è andato tutto bene (o non c'era niente da fare), altrimenti il motivo. */
export async function dateAlleFasiCreate(
  orderId: string,
  { inizio, fine, lavorativo }: { inizio: string | null; fine: string | null; lavorativo: GiornoLavorativo },
  db: DbDateFasi,
): Promise<string | null> {
  if (!inizio) return null;
  try {
    const fasi = await db.leggiFasi(orderId);
    if (fasi.error) return fasi.error.message;
    const tutte = [...(fasi.data ?? [])].sort((a, b) => a.position - b.position);
    // Se una fase ha già le date le ha decise qualcuno: si pianificano solo le commesse appena nate, intere.
    if (!tutte.length || tutte.some((f) => f.start_date || f.end_date)) return null;
    const sotto = await db.leggiSottofasi(tutte.map((f) => f.id));
    if (sotto.error) return sotto.error.message;
    const perFase = new Map<string, Sottofase[]>();
    for (const s of sotto.data ?? []) perFase.set(s.phase_id, [...(perFase.get(s.phase_id) ?? []), s]);
    const piano = pianificaFasi(
      tutte.map((f) => ({
        sottofasi: (perFase.get(f.id) ?? []).sort((a, b) => a.position - b.position)
          .map((s) => ({ nome: "", peso: 1, giorni: s.giorni, in_parallelo: !!s.in_parallelo })),
      })),
      { inizio, fine, lavorativo },
    );
    const errori: string[] = [];
    for (let i = 0; i < tutte.length; i++) {
      const r = piano.righe[i];
      if (!r?.dal || !r.al) continue;
      const { error } = await db.scriviDate(tutte[i].id, { start_date: r.dal, end_date: r.al });
      if (error) errori.push(error.message);
    }
    return errori.length ? errori[0] : null;
  } catch (e) {
    return e instanceof Error ? e.message : "Collegamento interrotto mentre si mettevano le date alle fasi.";
  }
}
