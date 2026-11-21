import { supabase } from "@/integrations/supabase/client";

const MOTIVI = [
  "already", "no_email", "optout", "sintassi", "email_storta", "cliente",
  "cooldown", "pec", "role", "suppressed", "no_mx", "lock", "senza_azienda", "stessa_azienda", "modificati",
] as const;
type Esclusione = `skipped_${(typeof MOTIVI)[number]}`;
type Report = Partial<Record<Esclusione, number>> & {
  enrolled: number;
  valutati: number;
  altri: boolean;
  lock_negato_per_motivo: Record<string, number>;
};

export function chiaveArruolamento(companyId: string, criteri: Record<string, unknown>): string {
  return `outreach-enroll:${companyId}:${JSON.stringify(criteri)}`;
}

export function cursoreArruolamento(chiave: string): string | null {
  try { return localStorage.getItem(chiave); } catch { return null; }
}

export async function arruolaPagine(
  criteri: Record<string, unknown>,
  options: { chiave?: string; quanti: number; maxGiri?: number; onProgress?: (report: Report) => void },
): Promise<Report> {
  const { chiave, quanti, maxGiri = 60, onProgress } = options;
  let after = chiave ? cursoreArruolamento(chiave) : null;
  const report: Report = { enrolled: 0, valutati: 0, altri: false, lock_negato_per_motivo: {} };
  for (let giro = 0; giro < maxGiri && report.enrolled < quanti; giro++) {
    const { data, error } = await supabase.functions.invoke("outreach-enroll", {
      body: { ...criteri, after, quanti: quanti - report.enrolled },
    });
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Iscrizione non riuscita");
    report.enrolled += Number(data?.enrolled ?? 0);
    report.valutati += Number(data?.valutati ?? 0);
    report.altri = data?.altri === true;
    for (const motivo of MOTIVI) {
      const key = `skipped_${motivo}` as const;
      const n = Number(data?.[key] ?? 0);
      if (n) report[key] = (report[key] ?? 0) + n;
    }
    for (const [motivo, count] of Object.entries(data?.lock_negato_per_motivo ?? {})) {
      report.lock_negato_per_motivo[motivo] = (report.lock_negato_per_motivo[motivo] ?? 0) + Number(count);
    }
    const next = typeof data?.next_cursor === "string" ? data.next_cursor : null;
    if (chiave) {
      try {
        if (next) localStorage.setItem(chiave, next);
        else if (!report.altri) localStorage.removeItem(chiave);
      } catch { /* Il cursore in memoria copre il lavoro in corso. */ }
    }
    onProgress?.({ ...report });
    if (!report.altri || !next || next === after) break;
    after = next;
  }
  return report;
}
