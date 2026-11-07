import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { materialiDelProgetto, statoConMateriali } from "../../../shared/planimetrie/materialiProgetto.ts";
import type { RigaPlanimetria } from "./archivio";
import { vistaDaPlanimetria } from "./esporta/adattatore";
import { esportaSvg } from "./esporta/svg";

export const PIANTE_PER_PAGINA = 12;
export interface AnteprimaPianta { src: string; piano: string; stanze: number; superficie: number; piani: number }

/** L'immagine viene dal documento salvato, con le sue vere aperture e gli arredi. */
export function creaAnteprimaPianta(documento: Planimetria, livelloId?: string, ambito = "fatto"): AnteprimaPianta {
  const materiali = materialiDelProgetto(documento, ambito);
  const daMostrare = materiali.pavimento ? { ...documento, livelli: documento.livelli.map((l) => ({ ...l, fatto: statoConMateriali(l.fatto, materiali), proposte: l.proposte.map((p) => ({ ...p, ...statoConMateriali(p, materiali) })) })) } : documento;
  const vista = vistaDaPlanimetria(daMostrare, { livelloId, modo: ambito === "fatto" ? "fatto" : "progetto", propostaId: ambito.startsWith("progetto:") ? ambito.slice(9) : undefined });
  const { svg } = esportaSvg(vista, { stile: "presentazione", scala: 50, quoteAutomatiche: false, etichetteLocali: false, margineMm: 5 });
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, piano: vista.livello, stanze: vista.locali.length, superficie: vista.locali.reduce((s, l) => s + (l.superficieMq ?? 0), 0), piani: documento.livelli.length };
}

export type RiferimentoAnteprima = Pick<RigaPlanimetria, "id" | "versione_corrente">;
export function filtroVersioniAnteprime(piante: RiferimentoAnteprima[]): string {
  return piante.slice(0, PIANTE_PER_PAGINA).filter((p) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id) && Number.isInteger(p.versione_corrente) && p.versione_corrente > 0)
    .map((p) => `and(planimetria_id.eq.${p.id},numero.eq.${p.versione_corrente})`).join(",");
}

export async function caricaAnteprimePlanimetrie(companyId: string, piante: RiferimentoAnteprima[]): Promise<Record<string, AnteprimaPianta>> {
  const filtro = filtroVersioniAnteprime(piante);
  if (!filtro) return {};
  const { data, error } = await supabase.from("planimetrie_versioni" as never).select("planimetria_id, numero, documento").eq("company_id", companyId).or(filtro).limit(PIANTE_PER_PAGINA);
  if (error) throw new Error("Anteprime delle piante non disponibili.");
  const out: Record<string, AnteprimaPianta> = {};
  const attese = new Set(piante.slice(0, PIANTE_PER_PAGINA).map((p) => `${p.id}:${p.versione_corrente}`));
  for (const row of (data ?? []) as Array<{ planimetria_id: string; numero: number; documento: unknown }>) {
    if (!attese.has(`${row.planimetria_id}:${row.numero}`)) continue;
    const letto = validaPlanimetria(row.documento);
    if (letto.ok) { try { out[row.planimetria_id] = creaAnteprimaPianta(letto.planimetria); } catch { /* Un disegno non leggibile non blocca le altre schede. */ } }
  }
  return out;
}

export function useAnteprimePlanimetrie(companyId: string | undefined, piante: RiferimentoAnteprima[]) {
  const riferimenti = piante.slice(0, PIANTE_PER_PAGINA);
  return useQuery({ queryKey: ["planimetrie", "anteprime", companyId, riferimenti.map((p) => `${p.id}:${p.versione_corrente}`)], queryFn: () => caricaAnteprimePlanimetrie(companyId!, riferimenti), enabled: !!companyId && riferimenti.length > 0, staleTime: 60_000, retry: 1 });
}
