/**
 * Andamento dei lavori: quanto è fatto (avanzamento delle fasi) contro quanto
 * tempo è passato (oggi fra la prima data d'inizio e l'ultima di fine delle fasi).
 * Regole pure, per la barra sopra le fasi della commessa.
 */

/** Sotto questo scarto (in punti percentuali) non si parla di ritardo o anticipo: è rumore. */
export const SOGLIA_SCARTO = 10;

export interface Andamento {
  /** Avanzamento lavori, 0–100. */
  fatto: number;
  /** Tempo trascorso, 0–100; null senza date utili. */
  tempo: number | null;
  /** «in_ritardo» / «in_anticipo» solo oltre la soglia; «in_linea» altrimenti; null senza date. */
  stato: "in_ritardo" | "in_anticipo" | "in_linea" | null;
  /** Punti di scarto, sempre positivo (quanto sei indietro o avanti). */
  punti: number;
  inizio: string | null;
  fine: string | null;
}

const GIORNO = 86_400_000;
const giorno = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

export function andamentoLavori(
  avanzamento: number,
  fasi: ReadonlyArray<{ start_date?: string | null; end_date?: string | null }>,
  oggi: string,
): Andamento {
  const fatto = Math.max(0, Math.min(100, Math.round(avanzamento)));
  const inizi = fasi.map((f) => f.start_date).filter((d): d is string => !!d && !Number.isNaN(giorno(d))).sort();
  const fini = fasi.map((f) => f.end_date).filter((d): d is string => !!d && !Number.isNaN(giorno(d))).sort();
  const inizio = inizi[0]?.slice(0, 10) ?? null;
  const fine = fini[fini.length - 1]?.slice(0, 10) ?? null;
  const vuoto: Andamento = { fatto, tempo: null, stato: null, punti: 0, inizio, fine };
  if (!inizio || !fine) return vuoto;
  // Giorni inclusi: oggi conta come passato, quindi l'ultimo giorno di lavori è il 100% del tempo.
  const durata = (giorno(fine) - giorno(inizio)) / GIORNO + 1;
  if (durata <= 0) return vuoto;
  const passati = (giorno(oggi) - giorno(inizio)) / GIORNO + 1;
  const tempo = Math.max(0, Math.min(100, Math.round((passati / durata) * 100)));
  const scarto = fatto - tempo;
  // Lavori finiti non sono mai «in ritardo», anche se finiti dopo la data.
  const stato = fatto >= 100 || Math.abs(scarto) < SOGLIA_SCARTO ? "in_linea" : scarto < 0 ? "in_ritardo" : "in_anticipo";
  return { fatto, tempo, stato, punti: Math.abs(scarto), inizio, fine };
}
