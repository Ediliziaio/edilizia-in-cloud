/**
 * estrazioneBolletta — prompt + parser/validatore per l'estrazione AI dei dati
 * di consumo da una bolletta (foto/PDF). Gap vs Reonic/Autarc: loro precompilano
 * i consumi via AI; qui il core puro (prompt + parsing robusto con clamp), mentre
 * l'edge `fv-estrai-bolletta` fa la chiamata vision (OpenRouter, deploy-bound).
 *
 * Riempie lo Step 3 "Consumi": consumo_annuo_kwh, costo_kwh, tipo_tariffa.
 * Puro e testabile.
 */

export type TipoTariffaBolletta = "monoraria" | "bioraria" | "trioraria";

export interface EstrazioneBolletta {
  consumo_annuo_kwh: number | null;
  costo_kwh_medio: number | null;
  potenza_impegnata_kw: number | null;
  tipo_tariffa: TipoTariffaBolletta | null;
  fornitore: string | null;
  /** Affidabilità stimata dall'AI, 0..1. */
  confidence: number;
}

/** Istruzione per il modello: estrai i campi in JSON puro, consumo ANNUALIZZATO. */
export function buildPromptBolletta(): string {
  return [
    "Sei un assistente che estrae i dati da una bolletta elettrica italiana.",
    "Restituisci SOLO un oggetto JSON valido, senza testo attorno, con i campi:",
    '{"consumo_annuo_kwh": number|null, "costo_kwh_medio": number|null,',
    ' "potenza_impegnata_kw": number|null, "tipo_tariffa": "monoraria"|"bioraria"|"trioraria"|null,',
    ' "fornitore": string|null, "confidence": number}',
    "Regole:",
    "- consumo_annuo_kwh: ANNUALIZZA se la bolletta copre un periodo (es. bimestrale ×6).",
    "- costo_kwh_medio: prezzo medio €/kWh (totale bolletta / kWh), 2-3 decimali.",
    "- tipo_tariffa: F1/F2/F3 o multioraria ⇒ trioraria; F1/F23 ⇒ bioraria; unica ⇒ monoraria.",
    "- confidence: 0..1 in base alla leggibilità.",
    "- Se un dato non è leggibile, mettilo a null. Non inventare.",
  ].join("\n");
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(n: number | null, min: number, max: number): number | null {
  if (n == null) return null;
  if (n < min || n > max) return null;
  return n;
}

function normTariffa(v: unknown): TipoTariffaBolletta | null {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("trior") || s.includes("f3") || s.includes("multi")) return "trioraria";
  if (s.includes("bior") || s.includes("f23") || s.includes("f2")) return "bioraria";
  if (s.includes("mono") || s.includes("unica") || s.includes("f1")) return "monoraria";
  return null;
}

/**
 * Parsa e valida l'output AI (oggetto o stringa JSON, anche con fence ```json).
 * Clampa i valori in range plausibili; fuori range ⇒ null (no dati inventati).
 */
export function parseEstrazioneBolletta(raw: unknown): EstrazioneBolletta {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      obj = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }

  const confidenceRaw = toNum(obj.confidence);
  const confidence =
    confidenceRaw == null ? 0 : Math.min(1, Math.max(0, confidenceRaw));

  return {
    consumo_annuo_kwh: clamp(toNum(obj.consumo_annuo_kwh), 100, 200000),
    costo_kwh_medio: clamp(toNum(obj.costo_kwh_medio), 0.05, 2),
    potenza_impegnata_kw: clamp(toNum(obj.potenza_impegnata_kw), 0.5, 1000),
    tipo_tariffa: normTariffa(obj.tipo_tariffa),
    fornitore:
      typeof obj.fornitore === "string" && obj.fornitore.trim()
        ? obj.fornitore.trim().slice(0, 80)
        : null,
    confidence: Math.round(confidence * 100) / 100,
  };
}
