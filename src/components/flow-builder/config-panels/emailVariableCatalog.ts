/**
 * emailVariableCatalog — costruisce le variabili email RAGGRUPPATE PER CATEGORIA
 * mostrando solo i campi supportati del trigger selezionato, i campi base
 * e gli eventuali campi personalizzati. Non propone dati di eventi estranei.
 */
import { TRIGGER_MAP } from "@/lib/flow-node-catalog";
import { EMAIL_BASE_VARIABLES, emailVariableSupported } from "../../../../supabase/functions/_shared/automationEmail";

/**
 * Genera la chiave snake_case del campo personalizzato per il merge-tag.
 * DEVE restare allineata a `toSnakeCase` di supabase/functions/_shared/
 * contactCustomFields.ts (resolver lato motore), altrimenti la variabile
 * inserita dal picker non viene risolta nell'invio.
 * Coperto da src/test/logic/customFieldKey.test.ts.
 */
export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export interface PickerVariable {
  key: string;
  label: string;
}
export interface PickerCategory {
  id: string;
  label: string;
  variables: PickerVariable[];
}

/** prefisso variabile → etichetta categoria leggibile. */
const CATEGORY_LABELS: Record<string, string> = {
  _generale: "Generale",
  contatto: "Contatto",
  contact: "Campi personalizzati del contatto",
  azienda: "Azienda",
  opportunita: "Opportunità",
  appuntamento: "Appuntamento",
  preventivo: "Preventivo",
  ordine: "Ordine",
  fattura: "Fattura",
  pagamento: "Pagamento",
  ticket: "Ticket",
  task: "Task",
  dipendente: "Dipendente",
  prodotto: "Prodotto",
  cantiere: "Cantiere",
  costo: "Costo",
  richiesta: "Richiesta",
  campagna: "Campagna",
  messaggio: "Messaggio",
  carico: "Carico",
  trial: "Prova",
  piano: "Piano",
  abbonamento: "Abbonamento",
  cron: "Sistema",
  system: "Sistema",
};

/** ordine di visualizzazione delle categorie (le più usate in alto). */
const CATEGORY_ORDER = [
  "_generale", "contatto", "azienda", "opportunita", "appuntamento", "preventivo",
  "ordine", "fattura", "pagamento", "ticket", "task", "dipendente", "prodotto",
  "cantiere", "trial", "piano", "abbonamento", "campagna", "messaggio", "richiesta",
  "costo", "carico", "cron", "system",
];

function prefixOf(key: string): string {
  return key.includes(".") ? key.split(".")[0] : "_generale";
}

/**
 * Restituisce le categorie ordinate con le loro variabili (dedupe per chiave).
 * @param customFields variabili extra (es. campi personalizzati) da fondere nelle
 *        categorie giuste in base al prefisso della chiave.
 */
export function buildVariableCategories(customFields: PickerVariable[] = [], triggerItemId?: string): PickerCategory[] {
  const byCat = new Map<string, Map<string, PickerVariable>>();
  const add = (key: string, label: string) => {
    const cat = prefixOf(key);
    let m = byCat.get(cat);
    if (!m) { m = new Map(); byCat.set(cat, m); }
    if (!m.has(key)) m.set(key, { key, label });
  };

  // Never offer all fields from unrelated triggers, technical IDs or internal notes.
  const triggerVariables = (triggerItemId ? TRIGGER_MAP[triggerItemId]?.outputVariables : []) ?? [];
  const suCommessa = triggerVariables.some(v => v.id.startsWith("ordine.") || v.id.startsWith("cantiere."));
  for (const v of EMAIL_BASE_VARIABLES) if (!suCommessa || v.key !== "unsubscribe_url") add(v.key, v.label);
  for (const v of triggerVariables) {
    if (emailVariableSupported(v.id)) add(v.id, v.label);
  }
  for (const cf of customFields) add(cf.key, cf.label);

  const cats: PickerCategory[] = [];
  const seen = new Set<string>();
  const pushCat = (c: string) => {
    const m = byCat.get(c);
    if (!m || seen.has(c)) return;
    seen.add(c);
    cats.push({ id: c, label: CATEGORY_LABELS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1)), variables: [...m.values()] });
  };
  for (const c of CATEGORY_ORDER) pushCat(c);
  for (const c of byCat.keys()) pushCat(c); // categorie non previste in coda
  return cats;
}
