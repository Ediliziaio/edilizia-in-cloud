/**
 * Le fasi della commessa per il verbale SAL, con le sottofasi e le voci della commessa (11/11/2026).
 *
 * Prima stava dentro SalTab, con letture «a mano» perché i tipi generati non conoscevano
 * order_work_subphases e order_work_phase_voci. Con i tipi rigenerati dal database si legge col
 * client tipato. Vale per ogni azienda:
 * - senza il permesso sugli importi (o con una lettura che fallisce) il verbale resta per fase, con
 *   le sole percentuali: non si blocca;
 * - una fase senza venduto prende come importo la somma delle sue voci della commessa (computo o
 *   preventivo); se non ha nemmeno quelle, l'importo resta da scrivere e il modulo lo dice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FasePerSal } from "./salDaFasi";
import type { SottofasePerSal, VoceCommessaPerSal } from "./salSottofasi";

const PAGINA = 1000;

/** Legge tutte le righe a pagine: PostgREST ne restituisce al più mille per chiamata. */
async function tutte<T>(pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await pagina(da, da + PAGINA - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGINA) return out;
  }
}

export async function leggiFasiPerSal(client: SupabaseClient<Database>, orderId: string, companyId: string): Promise<FasePerSal[]> {
  const { data, error } = await client
    .from("order_work_phases")
    .select("id, name, status, percentuale, importo_venduto")
    .eq("order_id", orderId)
    .eq("company_id", companyId)
    .order("position");
  if (error) throw error;
  const fasi: FasePerSal[] = (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    status: f.status,
    percentuale: f.percentuale,
    importo_venduto: f.importo_venduto,
  }));
  const ids = fasi.map((f) => f.id).filter((x): x is string => !!x);
  if (!ids.length) return fasi;

  let sottofasi: Array<SottofasePerSal & { phase_id: string }> = [];
  try {
    sottofasi = await tutte((da, a) =>
      client.from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, percentuale, quantita_fatta")
        .in("phase_id", ids).order("position").range(da, a));
  } catch {
    return fasi; // senza sottofasi il verbale resta per fase
  }

  // Le voci della commessa: importo e quantità delle sottofasi, e il venduto delle fasi che non lo hanno.
  let voci: Array<{ phase_id: string; subphase_id: string | null } & VoceCommessaPerSal> = [];
  try {
    voci = await tutte((da, a) =>
      client.from("order_work_phase_voci")
        .select("phase_id, subphase_id, quantita, unita, importo")
        .eq("order_id", orderId).eq("company_id", companyId).range(da, a));
  } catch {
    voci = []; // senza il permesso sugli importi restano le percentuali
  }
  const perSottofase = new Map<string, VoceCommessaPerSal[]>();
  const importoPerFase = new Map<string, number>();
  for (const v of voci) {
    if (v.subphase_id) perSottofase.set(v.subphase_id, [...(perSottofase.get(v.subphase_id) ?? []), { quantita: v.quantita, unita: v.unita, importo: v.importo }]);
    importoPerFase.set(v.phase_id, (importoPerFase.get(v.phase_id) ?? 0) + (Number(v.importo) || 0));
  }

  return fasi.map((f) => {
    const dalleVoci = f.id ? Math.round((importoPerFase.get(f.id) ?? 0) * 100) / 100 : 0;
    const venduto = f.importo_venduto != null && Number(f.importo_venduto) > 0 ? f.importo_venduto : dalleVoci > 0 ? dalleVoci : null;
    return {
      ...f,
      importo_venduto: venduto,
      sottofasi: sottofasi.filter((s) => s.phase_id === f.id).map((s) => ({ ...s, voci: perSottofase.get(s.id) ?? [] })),
    };
  });
}
