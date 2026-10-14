import { supabase } from "@/integrations/supabase/client";

type PhaseLink = { phase_id: string; sottofasi_fatte?: string[]; percentuale?: number | string };
const INVALID_LINK = "Una lavorazione del rapportino non appartiene a questa commessa o non è più disponibile. Correggi il collegamento prima di approvare.";
const invalid = (): never => { throw new Error(INVALID_LINK); };
function rows(value: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) return invalid();
  return value as Record<string, unknown>[];
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return invalid();
  return value;
}

/** Preflight dell'ufficio: nessuna scrittura e nessuna associazione per nome.
 * Il controllo server atomico rimane necessario contro client/API esterni e concorrenza.
 */
export async function validateReportPhaseLinks(companyId: string, orderId: string, report: {
  fasi_lavorate?: unknown; materiali_usati?: unknown;
}): Promise<void> {
  if (!companyId || !orderId) throw new Error("Contesto azienda/commessa non disponibile");
  const declared = new Map<string, PhaseLink>();
  const phaseIds = new Set<string>();
  const subphaseParents = new Map<string, string>();
  for (const row of rows(report.fasi_lavorate)) {
    const phaseId = id(row.phase_id);
    if (declared.has(phaseId)) return invalid();
    // I rapportini storici possono dichiarare solo ore, senza percentuale.
    if (row.percentuale != null && (typeof row.percentuale !== "number" && typeof row.percentuale !== "string" ||
      String(row.percentuale).trim() === "" || !Number.isFinite(Number(row.percentuale)) || Number(row.percentuale) < 0 || Number(row.percentuale) > 100)) return invalid();
    declared.set(phaseId, row as PhaseLink);
    phaseIds.add(phaseId);
    if (row.sottofasi_fatte != null) {
      if (!Array.isArray(row.sottofasi_fatte)) return invalid();
      for (const sub of row.sottofasi_fatte) {
        const subId = id(sub);
        if (subphaseParents.has(subId)) return invalid();
        subphaseParents.set(subId, phaseId);
      }
    }
  }
  for (const material of rows(report.materiali_usati)) {
    if (material.fase_id != null && material.fase_id !== "") phaseIds.add(id(material.fase_id));
  }
  // Nessuna chiamata extra per i vecchi rapporti senza riferimenti a lavorazioni.
  if (!phaseIds.size) return;
  // Le tabelle non sono ancora nei tipi generati del progetto.
  const db = supabase as unknown as { from: typeof supabase.from };
  const ids = [...phaseIds];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const requested = ids.slice(offset, offset + 200);
    const { data, error } = await db.from("order_work_phases" as never)
      .select("id, order_id, company_id")
      .eq("company_id", companyId).eq("order_id", orderId).in("id", requested);
    if (error) throw error;
    const found = (data ?? []) as unknown as { id: string; company_id: string; order_id: string }[];
    if (found.length !== requested.length || found.some(phase => !requested.includes(phase.id) || phase.company_id !== companyId || phase.order_id !== orderId) || new Set(found.map(phase => phase.id)).size !== requested.length) return invalid();
  }
  const subIds = [...subphaseParents.keys()];
  for (let offset = 0; offset < subIds.length; offset += 200) {
    const requested = subIds.slice(offset, offset + 200);
    const { data, error } = await db.from("order_work_subphases" as never)
      .select("id, phase_id").in("id", requested).in("phase_id", ids);
    if (error) throw error;
    const found = (data ?? []) as unknown as { id: string; phase_id: string }[];
    if (found.length !== requested.length || new Set(found.map(sub => sub.id)).size !== requested.length ||
      found.some(sub => !requested.includes(sub.id) || subphaseParents.get(sub.id) !== sub.phase_id)) return invalid();
  }
}
