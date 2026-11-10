import { supabase } from "@/integrations/supabase/client";
import type { RigaPlanimetria } from "./archivio";
import { DEFINIZIONI_COLLEGAMENTI } from "./collegamenti";

export type DestinazionePianta = "cliente" | "contatto" | "preventivo" | "commessa" | "computo";
export type PiantaAssociata = Pick<RigaPlanimetria, "id" | "titolo" | "stato" | "versione_corrente" | "updated_at">;
export interface PaginePianteAssociate { piante: PiantaAssociata[]; totale: number }
export const ASSOCIATE_PER_PAGINA = 6;

/** Legge il riferimento diretto: nessuna associazione dedotta e nessuna scrittura. */
export async function caricaPianteAssociate(companyId: string, tipo: DestinazionePianta, schedaId: string, pagina = 0): Promise<PaginePianteAssociate> {
  if (!companyId || !schedaId) throw new Error("Scheda o azienda non disponibili.");
  const indice = Number.isInteger(pagina) && pagina >= 0 ? pagina : 0;
  const inizio = indice * ASSOCIATE_PER_PAGINA;
  const { data, count, error } = await supabase.from("planimetrie" as never)
    .select("id, titolo, stato, versione_corrente, updated_at", { count: "exact" })
    .eq("company_id", companyId)
    .eq(DEFINIZIONI_COLLEGAMENTI[tipo].colonna, schedaId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(inizio, inizio + ASSOCIATE_PER_PAGINA - 1);
  if (error) throw new Error("Le planimetrie associate non sono disponibili. Riprova tra qualche secondo.");
  const piante = (data ?? []) as unknown as PiantaAssociata[];
  return { piante, totale: count ?? piante.length };
}
