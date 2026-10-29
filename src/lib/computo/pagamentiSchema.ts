/** Le rate del piano dei pagamenti nella bozza: file a sé perché lo importa `editorNativo`, che `economiaComputo.ts` usa. */
import { z } from "zod";

export const MOMENTI_RATA = {
  firma: "Alla firma del contratto",
  inizio: "All'inizio dei lavori",
  sal: "A SAL (giorno di cantiere)",
  fine: "A fine lavori",
  collaudo: "Al collaudo / consegna",
} as const;
export type MomentoRata = keyof typeof MOMENTI_RATA;

export const rataSchema = z.object({
  id: z.string().max(80),
  descrizione: z.string().max(200).default(""),
  /** Percentuale del totale, come la scrive l'utente («30», «12,5»). */
  percentuale: z.string().max(20).default(""),
  quando: z.enum(["firma", "inizio", "sal", "fine", "collaudo"]).default("sal"),
  /** Per un SAL: il giorno lavorativo del cronoprogramma in cui scatta. */
  giorno: z.number().int().min(1).max(2000).nullable().default(null),
  /** Giorni per pagare dopo la fattura (rimessa diretta = 0). */
  giorniPagamento: z.number().int().min(0).max(365).default(0),
});
export type Rata = z.infer<typeof rataSchema>;

