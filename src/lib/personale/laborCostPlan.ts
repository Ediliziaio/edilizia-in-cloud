import { normalizeDecimalSeparators } from "@/lib/parseDecimalIT";
import { laborHourlyCost, laborLineCost } from "@/lib/campo/laborCostReview";

/** Strict form parsing: unlike parseDecimalIT, junk is not accepted as zero. */
export function parseHrCostAmount(value: string): number | null {
  const raw = value.trim().replace(/[\s€]|EUR/gi, "");
  if (!raw || !/^\+?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(raw)) return null;
  const normalized = normalizeDecimalSeparators(raw);
  if (!/^\+?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 && n * 100 <= Number.MAX_SAFE_INTEGER ? n : null;
}
export const HR_COST_FIELDS = [
  ["gross", "Lordo annuo, incluse mensilità aggiuntive"],
  ["employer", "Contributi datore annui, esclusi TFR e Cassa Edile"],
  ["tfr", "Quota TFR annua"],
  ["buildingFund", "Cassa Edile annua, quota azienda"],
  ["other", "Altri costi aziendali annui"],
  ["recoveries", "Recuperi e rimborsi annui"],
  ["contractHours", "Ore contrattuali annue"],
  ["nonProductiveHours", "Ore annue non produttive"],
] as const;
export type HrCostField = typeof HR_COST_FIELDS[number][0];
export type HrCostDraft = Record<HrCostField, string>;
export const emptyHrCostDraft = (): HrCostDraft => Object.fromEntries(HR_COST_FIELDS.map(([key]) => [key, ""])) as HrCostDraft;
/** Management estimate only. Withholdings/net salary are deliberately not inputs. */
export function calculateFullLaborCost(draft: HrCostDraft) {
  const parsed = Object.fromEntries(HR_COST_FIELDS.map(([key]) => [key, parseHrCostAmount(draft[key])])) as Record<HrCostField, number | null>;
  const errors = HR_COST_FIELDS.filter(([key]) => parsed[key] == null).map(([, label]) => `${label}: inserisci un valore valido (zero se non previsto).`);
  if (errors.length) return { errors, annualCost: null, productiveHours: null, hourlyCost: null };
  const v = parsed as Record<HrCostField, number>;
  if (v.gross <= 0) errors.push("Il lordo annuo deve essere maggiore di zero.");
  if (v.contractHours <= 0 || v.contractHours > 8784) errors.push("Verifica le ore contrattuali annue.");
  for (const key of ["contractHours", "nonProductiveHours"] as const) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(v[key]))) errors.push("Per le ore usa al massimo due decimali.");
  }
  if (v.nonProductiveHours >= v.contractHours) errors.push("Le ore non produttive devono essere inferiori a quelle contrattuali.");
  const costs = [v.gross, v.employer, v.tfr, v.buildingFund, v.other].map(n => Math.round(laborLineCost(1, n) * 100));
  const cents = costs.reduce((s, c) => s + BigInt(c), 0n) - BigInt(Math.round(laborLineCost(1, v.recoveries) * 100));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents <= 0n) errors.push("I recuperi non possono annullare il costo: verifica gli importi.");
  const productiveHours = Math.round((v.contractHours - v.nonProductiveHours) * 100) / 100;
  if (errors.length) return { errors, annualCost: null, productiveHours: null, hourlyCost: null };
  const annualCost = Number(cents) / 100;
  if (!Number.isFinite(annualCost / productiveHours) || annualCost / productiveHours * 100 > Number.MAX_SAFE_INTEGER) {
    return { errors: ["Costo orario fuori intervallo: verifica ore e importi."], annualCost: null, productiveHours: null, hourlyCost: null };
  }
  const hourlyCost = laborHourlyCost(annualCost, productiveHours);
  if (hourlyCost <= 0) return { errors: ["La tariffa arrotondata è zero: verifica il prospetto."], annualCost: null, productiveHours: null, hourlyCost: null };
  return { errors, annualCost, productiveHours, hourlyCost };
}

export interface HrCostSaveDraft { costo_orario?: string; stipendio_lordo?: string; ore_mese?: string; contributi_percento?: string }
/** Partial update: applying a full cost rate must not overwrite salary or hours. */
export function normalizeHrCostSave(draft: HrCostSaveDraft): HrCostSaveDraft {
  const normalized: HrCostSaveDraft = {};
  for (const key of Object.keys(draft) as (keyof HrCostSaveDraft)[]) {
    if (!["costo_orario", "stipendio_lordo", "ore_mese", "contributi_percento"].includes(key)) throw new Error("Campo costo non supportato.");
    const value = draft[key];
    if (value == null) continue;
    if (!value.trim()) {
      // Costo orario vuoto = si calcola; INPS vuoto = vale quello del tipo di dipendente.
      if (key === "costo_orario" || key === "contributi_percento") normalized[key] = "";
      else throw new Error("Lordo e ore non possono essere vuoti. Modifica solo i dati compilati.");
      continue;
    }
    const n = parseHrCostAmount(value);
    if (n == null) throw new Error("Inserisci valori numerici validi e non negativi.");
    if (key === "ore_mese" && (n <= 0 || n > 744 || !Number.isInteger(n))) throw new Error("Le ore mensili devono essere intere, tra 1 e 744 (come il campo del database).");
    if (key === "contributi_percento" && n > 100) throw new Error("Verifica l'aliquota contributiva (0–100%).");
    // Canonical comma avoids numero_italiano interpreting 25.555 as 25,555 euros.
    normalized[key] = String(n).replace(".", ",");
  }
  if (!Object.keys(normalized).length) throw new Error("Nessun costo da aggiornare.");
  return normalized;
}
