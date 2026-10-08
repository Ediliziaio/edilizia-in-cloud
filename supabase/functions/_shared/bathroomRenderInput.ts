// Validate the stored module project, not an AI-generated substitute.
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  (typeof v === "number" || typeof v === "string" && v.trim() !== "") && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
const TYPES: Record<string, string> = { completo: "rifacimento_completo", "vasca-doccia": "vasca_in_doccia",
  doccia: "rifacimento_parziale", sanitari: "sostituzione_sanitari", accessibilita: "abbattimento_barriere", rinnovo: "rifacimento_parziale" };
export function validateBathroomRenderInput(input: unknown): { modelId: string; companyId: string; projectId: string } {
  if (!obj(input) || !obj(input.progetto) || !Array.isArray(input.computo)) throw new Error("Progetto e computo obbligatori.");
  const p = input.progetto; const s = p.modello_snapshot;
  if (!obj(s) || s.version !== 1 || typeof s.modelId !== "string" || !TYPES[s.modelId] ||
      s.companyId !== p.company_id || !obj(s.template) || s.template.company_id !== p.company_id ||
      !obj(s.template.pdf_blocchi) || s.template.pdf_blocchi.modulo_intervento !== s.modelId ||
      typeof s.capturedAt !== "string" || !Number.isFinite(Date.parse(s.capturedAt)) ||
      typeof p.id !== "string" || typeof p.company_id !== "string" || p.deleted_at != null ||
      p.tipo_intervento !== TYPES[s.modelId]) throw new Error("Modello congelato assente, diverso o non valido. Nessun PDF generico.");
  if (!finite(p.iva_pct, 0, 100) || !finite(p.sconto_pct, 0, 100) || !finite(p.detrazione_pct, 0, 100) ||
      !finite(p.totale_imponibile, 0) || !finite(p.totale, 0)) throw new Error("Totali e aliquote del progetto non verificabili.");
  if (input.computo.length < 1 || input.computo.length > 200 || input.computo.some(r =>
    !obj(r) || r.company_id !== p.company_id || r.progetto_id !== p.id ||
    !finite(r.quantita, Number.MIN_VALUE) || !finite(r.prezzo_unitario, 0) || !finite(r.sconto_pct, 0, 100) ||
    typeof r.descrizione !== "string" || !r.descrizione.trim())) throw new Error("Voci del computo incomplete o di un altro progetto.");
  if (!Array.isArray(input.media) || input.media.some(m => !obj(m) || m.company_id !== p.company_id || m.progetto_id !== p.id)) {
    throw new Error("Allegati di un altro progetto o non verificabili.");
  }
  return { modelId: s.modelId, companyId: p.company_id, projectId: p.id };
}
