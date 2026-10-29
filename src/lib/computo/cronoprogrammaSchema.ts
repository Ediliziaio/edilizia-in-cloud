/** La forma del cronoprogramma nella bozza: file a sé perché la importa `editorNativo`, che `cronoprogramma.ts` usa. */
import { z } from "zod";

export const faseCronoSchema = z.object({
  id: z.string().max(80),
  nome: z.string().max(200),
  /** Primo giorno lavorativo della fase, da 1. */
  inizio: z.number().int().min(1).max(2000),
  /** Durata in giorni lavorativi. */
  durata: z.number().int().min(1).max(2000),
  nota: z.string().max(500).default(""),
});
export const cronoprogrammaSchema = z.object({
  /** Data d'inizio dei lavori, gg/mm/aaaa. Vuota = il PDF conta «giorno 1, 2…». */
  dataInizio: z.string().max(20).default(""),
  fasi: z.array(faseCronoSchema).max(60).default([]),
  nota: z.string().max(1000).default(""),
});
export type FaseCrono = z.infer<typeof faseCronoSchema>;
export type Cronoprogramma = z.infer<typeof cronoprogrammaSchema>;
