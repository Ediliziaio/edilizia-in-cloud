const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function computoNumber(value: unknown, format: "decimal" | "italian" = "decimal"): number | null {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) < 1e10 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim().replace(/^(?:€|EUR)\s*/i, "").replace(/\s*(?:€|EUR)$/i, "").replace(/[ '\u00a0]/g, "");
  if (text.includes(",")) {
    if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d*),\d+$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  }
  else if (format === "italian" && /^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const parsed = Number(text); return Number.isFinite(parsed) && Math.abs(parsed) < 1e10 ? parsed : null;
}
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Summary labels are not billable rows; real quantity/price takes precedence. */
export function computoSummaryRow(description: string, quantity: number | null, price: number | null): "document_total" | "summary" | null {
  if (quantity || price) return null;
  const label = description.trim();
  if (/^totale(?:\s+(?:generale|complessivo|computo(?:\s+metrico)?|lavori|documento))?\s*[:.]?$/i.test(label)) return "document_total";
  return /^(?:totale|tot\.|somma(?:no)?|subtotale|(?:a|da) riportare|riporto)(?:\s|:|$)/i.test(label) ? "summary" : null;
}

/** Normalize number representations; never overwrite an original amount with its recalculation. */
export function checkComputoExtraction(result: unknown) {
  const warnings: string[] = []; const errors: string[] = [];
  if (!record(result) || !Array.isArray(result.capitoli) || !result.capitoli.length) {
    return { warnings, errors: ["Documento senza capitoli o voci validi."], checks: null };
  }
  let sum = 0, count = 0, missing = 0, doubtfulRows = 0;
  for (const [index, cap] of result.capitoli.entries()) {
    if (!record(cap) || !Array.isArray(cap.voci)) { errors.push(`Capitolo ${index + 1} non valido.`); continue; }
    let subtotal = 0; let chapterMissing = false;
    for (const [i, voice] of cap.voci.entries()) {
      if (!record(voice) || typeof voice.descrizione_breve !== "string" || !voice.descrizione_breve.trim()) {
        errors.push(`Capitolo ${index + 1}, voce ${i + 1}: descrizione mancante o struttura non valida.`); continue;
      }
      count++;
      const q = computoNumber(voice.quantita), p = computoNumber(voice.prezzo_unitario), amount = computoNumber(voice.importo);
      const rowWarnings = Array.isArray(voice.warnings) ? voice.warnings.filter((w: unknown) => typeof w === "string") : [];
      for (const [field, value] of [["Quantità", q], ["Prezzo unitario", p], ["Importo", amount]] as const) {
        if (value === null) { missing++; rowWarnings.push(`${field} mancante o non leggibile nel documento: non equivale a zero.`); }
      }
      if (q !== null && p !== null && amount !== null && Math.abs(cents(q * p) - cents(amount)) > 0.011) {
        rowWarnings.push(`Importo originale ${amount}: quantità × prezzo dà ${cents(q * p)}. Verifica, non correggere automaticamente.`);
      }
      // Normalize valid numeric strings, but preserve missing values as null in the source JSON.
      voice.quantita = q; voice.prezzo_unitario = p; voice.importo = amount;
      const confidence = typeof voice.confidence === "number" && Number.isFinite(voice.confidence)
        ? Math.max(0, Math.min(1, voice.confidence)) : 0;
      voice.confidence = rowWarnings.length ? Math.min(confidence, 0.69) : confidence;
      if (rowWarnings.length) doubtfulRows++;
      voice.warnings = [...new Set(rowWarnings)];
      if (amount === null) chapterMissing = true; else subtotal += cents(amount);
    }
    sum += subtotal;
    const declared = computoNumber(cap.totale);
    if (chapterMissing) warnings.push(`Capitolo ${cap.numero ?? index + 1}: totale non verificabile, mancano importi.`);
    else if (declared !== null && Math.abs(cents(subtotal) - cents(declared)) > 0.011) {
      warnings.push(`Capitolo ${cap.numero ?? index + 1}: totale dichiarato ${declared}, somma voci ${cents(subtotal)}.`);
    }
  }
  if (!count) errors.push("Nessuna voce di lavorazione valida trovata nel documento.");
  if (doubtfulRows) warnings.push(`${doubtfulRows} voci con dati o importi da confrontare con l'originale.`);
  const declaredTotal = record(result.metadata) ? computoNumber(result.metadata.totale_computo) : null;
  if (record(result.metadata) && result.metadata.totale_computo != null && result.metadata.totale_computo !== "" && declaredTotal === null) {
    warnings.push("Totale dichiarato non leggibile: confrontalo con il documento originale.");
  }
  const computed = missing ? null : cents(sum);
  if (missing) warnings.push(`${missing} campi numerici da verificare: il totale completo non è confermabile.`);
  if (declaredTotal !== null && computed !== null && Math.abs(declaredTotal - computed) > 0.011) {
    warnings.push(`Totale documento ${declaredTotal}, somma delle voci ${computed}: verifica sconti, IVA, riepiloghi o voci mancanti.`);
  }
  const coverage = record(result.document_coverage) ? result.document_coverage : null;
  if (coverage && coverage.complete !== true) errors.push("Lettura PDF incompleta: non importare un computo con pagine mancanti o testo tagliato. Suddividi il file e riprova.");
  const checks = { row_count: count, missing_numeric_fields: missing, source_declared_total: declaredTotal,
    computed_total: computed, total_comparable: declaredTotal !== null && computed !== null,
    requires_review: warnings.length > 0, warnings: [...new Set(warnings)] };
  return { warnings: checks.warnings, errors, checks };
}

export async function commitComputoExtraction(db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }, args: {
  uploadId: string; companyId: string; rows: Record<string, unknown>[]; result: unknown; method: string; confidence: number;
}) {
  const { data, error } = await db.rpc("computo_salva_estrazione_atomica", {
    p_upload_id: args.uploadId, p_company_id: args.companyId, p_rows: args.rows,
    p_result: args.result, p_method: args.method, p_confidence: args.confidence,
  });
  if (error || !record(data) || data.saved_count !== args.rows.length || data.upload_id !== args.uploadId) {
    throw new Error("Salvataggio completo del computo non confermato. Le voci precedenti non devono essere sostituite da un risultato parziale.");
  }
  return data;
}
