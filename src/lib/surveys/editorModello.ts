/**
 * Pezzi dell'editor dei modelli di sopralluogo che prima mancavano (piano sopralluoghi, lotto 6):
 * la condizione «mostra solo se», i limiti dei numeri e la riga del preventivo per tipo di elemento.
 */
import type { ConditionalRule, ElementTypeDefinition, EstimateLineMapping, FieldDefinition } from "@/types/surveys";

export type OperatoreSemplice = "eq" | "contains" | "truthy";

export interface MostraSe {
  campo: string;
  operatore: OperatoreSemplice;
  valore: string;
}

/** I campi che possono comandare la visibilità di un altro: scelte e sì/no. */
export const campoComanda = (f: FieldDefinition) =>
  f.type === "select" || f.type === "multiselect" || f.type === "boolean" || f.type === "compound_boolean";

/**
 * La condizione come la scrive l'editor. `"complessa"` se il modello di serie ne ha una che
 * l'editor non sa mostrare (più regole, `in`, `neq`…): si lascia com'è e lo si dice.
 */
export function leggiMostraSe(f: FieldDefinition): MostraSe | null | "complessa" {
  const r = f.show_if;
  if (!r) return null;
  if (Array.isArray(r)) return "complessa";
  if (r.operator === "eq" || r.operator === "contains") {
    if (typeof r.value !== "string") return "complessa";
    return { campo: r.field, operatore: r.operator, valore: r.value };
  }
  if (r.operator === "truthy") return { campo: r.field, operatore: "truthy", valore: "" };
  return "complessa";
}

export function scriviMostraSe(m: MostraSe | null): ConditionalRule | undefined {
  if (!m || !m.campo) return undefined;
  if (m.operatore === "truthy") return { field: m.campo, operator: "truthy" };
  if (!m.valore) return undefined;
  return { field: m.campo, operator: m.operatore, value: m.valore };
}

/** L'operatore giusto per il campo che comanda: un sì/no è «attivo», una scelta multipla «contiene». */
export const operatorePer = (f: FieldDefinition | undefined): OperatoreSemplice =>
  !f ? "eq" : f.type === "boolean" || f.type === "compound_boolean" ? "truthy" : f.type === "multiselect" ? "contains" : "eq";

/** Minimo e massimo: vuoto = nessun limite; il massimo sotto il minimo non si salva. */
export function limitiNumero(min: string, max: string): { min?: number; max?: number; errore?: string } {
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
  const a = n(min);
  const b = n(max);
  if ((a !== undefined && !Number.isFinite(a)) || (b !== undefined && !Number.isFinite(b))) return { errore: "Scrivi un numero" };
  if (a !== undefined && b !== undefined && b < a) return { errore: "Il massimo è sotto il minimo" };
  return { min: a, max: b };
}

export const campiDelTipo = (t: ElementTypeDefinition): FieldDefinition[] =>
  (t.sections ?? []).flatMap((s) => s.fields ?? []);

/** I {segnaposto} della descrizione che non sono campi del tipo: si segnalano, non si bloccano. */
export function segnapostoSconosciuti(descrizione: string, t: ElementTypeDefinition): string[] {
  const chiavi = new Set(campiDelTipo(t).map((f) => f.key));
  const trovati = [...descrizione.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]);
  return [...new Set(trovati.filter((k) => !chiavi.has(k)))];
}

/** Una riga di partenza sensata: il nome del tipo e i primi campi a scelta e misure. */
export function rigaDiPartenza(t: ElementTypeDefinition): EstimateLineMapping {
  const campi = campiDelTipo(t);
  const scelte = campi.filter((f) => f.type === "select").slice(0, 2).map((f) => `{${f.key}}`);
  const misure = campi.filter((f) => f.type === "dimension" && (f.unit ?? "cm") === "cm").slice(0, 2).map((f) => `{${f.key}}`);
  const parti = [t.label, ...scelte, misure.length === 2 ? `${misure[0]}x${misure[1]} cm` : misure[0] ?? ""].filter(Boolean);
  return { description_template: parti.join(" "), unit: "pz", quantity_field: "quantity" };
}
