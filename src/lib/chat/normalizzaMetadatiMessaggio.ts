import { z } from "zod";

const fonte = z.object({
  id: z.string(), title: z.string(), similarity: z.number().finite(),
  scope: z.enum(["universal", "company"]).optional(),
  area: z.string().optional(), source_type: z.string().optional(), snippet: z.string().optional(),
});
const fonti = z.array(fonte).nullable().catch(null);
const council = z.object({
  is_multi_area: z.boolean(),
  involved_personas: z.array(z.string()).optional(), involved_areas: z.array(z.string()).optional(),
  estimated_complexity: z.enum(["simple", "medium", "complex"]).optional(),
  synthesis_used: z.boolean().optional(),
  sub_outputs: z.array(z.object({
    area: z.string(), persona_key: z.string(), sub_query: z.string(), response: z.string().nullable(),
    why: z.string().optional(), rag_sources: z.array(fonte).optional(), confidence: z.string().nullable().optional(),
    error: z.string().optional(), duration_ms: z.number().finite().optional(),
  })).optional(),
}).nullable().catch(null);

/** I metadati JSON opzionali non devono impedire la lettura del messaggio storico. */
export function normalizzaMetadatiMessaggio<T extends {
  rag_sources?: unknown; ai_confidence?: unknown; followup_suggestions?: unknown;
  council_data?: unknown; reactions?: unknown;
}>(row: T) {
  const parsedCouncil = council.parse(row.council_data);
  return {
    ...row,
    rag_sources: fonti.parse(row.rag_sources),
    ai_confidence: z.enum(["high", "medium", "low"]).nullable().catch(null).parse(row.ai_confidence),
    followup_suggestions: z.array(z.string()).nullable().catch(null).parse(row.followup_suggestions),
    council_data: parsedCouncil ? { ...parsedCouncil, sub_outputs: parsedCouncil.sub_outputs?.map((output) => ({ ...output, response: output.response ?? null })) } : null,
    reactions: z.record(z.string(), z.array(z.string())).nullable().catch(null).parse(row.reactions),
  };
}
