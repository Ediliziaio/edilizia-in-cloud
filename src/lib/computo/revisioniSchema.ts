/** Le revisioni salvate del preventivo con computo, nella bozza: file a sé perché lo importa `editorNativo`. */
import { z } from "zod";

export const voceRevisioneSchema = z.object({
  id: z.string().max(80), descrizione: z.string().max(300), unita: z.string().max(40),
  quantita: z.number().nullable(), prezzo: z.number().nullable(), importo: z.number().nullable(), opzionale: z.boolean().default(false),
});
export const revisioneSchema = z.object({
  id: z.string().max(80), nome: z.string().max(80), data: z.string().max(40), totale: z.number(),
  voci: z.array(voceRevisioneSchema).max(5000),
});
export type VoceRevisione = z.infer<typeof voceRevisioneSchema>;
export type RevisioneComputo = z.infer<typeof revisioneSchema>;
