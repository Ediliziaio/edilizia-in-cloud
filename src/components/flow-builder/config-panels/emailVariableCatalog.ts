/**
 * emailVariableCatalog — costruisce le variabili email RAGGRUPPATE PER CATEGORIA
 * (stile GHL), aggregando le outputVariables REALI di tutti i trigger del
 * catalogo (nomi veri di DB) + eventuali campi personalizzati.
 */
import { TRIGGER_CATALOG } from "@/lib/flow-node-catalog";

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
export function buildVariableCategories(customFields: PickerVariable[] = []): PickerCategory[] {
  const byCat = new Map<string, Map<string, PickerVariable>>();
  const add = (key: string, label: string) => {
    const cat = prefixOf(key);
    let m = byCat.get(cat);
    if (!m) { m = new Map(); byCat.set(cat, m); }
    if (!m.has(key)) m.set(key, { key, label });
  };

  for (const trig of TRIGGER_CATALOG) {
    for (const v of trig.outputVariables ?? []) add(v.id, v.label);
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
