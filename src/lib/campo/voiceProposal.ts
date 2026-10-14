import type { DatiEstratti } from "@/hooks/campo/useRapportinoVocale";
/** L'AI propone testo e quantità, mai identità, ruoli, avanzamenti o approvazioni. */
export function normalizeVoiceProposal(raw: unknown): { trascrizione: string; dati_estratti: DatiEstratti } {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const d = r.dati_estratti && typeof r.dati_estratti === "object" ? r.dati_estratti as Record<string, unknown> : {};
  const text = (v: unknown, max = 10000) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const materiali = Array.isArray(d.materiali) ? d.materiali.flatMap(m => {
    if (!m || typeof m !== "object") return [];
    const nome = text(m.nome, 300), q = m.quantita;
    return nome && typeof q === "number" && Number.isFinite(q) && q > 0 && q <= 1000000
      ? [{ nome, quantita: q, unita: text(m.unita, 30) }] : [];
  }).slice(0, 100) : [];
  const ore = d.ore_lavorate;
  return { trascrizione: text(r.trascrizione), dati_estratti: {
    lavorazione: text(d.lavorazione), note: text(d.note), materiali,
    ...(typeof ore === "number" && Number.isFinite(ore) && ore >= 0 && ore <= 24 ? { ore_lavorate: ore } : {}),
  } };
}
