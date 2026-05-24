import type { ComputoVoceLocal } from "@/types/computo";

export interface ComputoQuoteItemPayload {
  id: string;
  name: string;
  description: string | null;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_percent: number;
  codice_prezzario: string | null;
  article_template_id: string | null;
  family_id: string | null;
  tariffa_id: string | null;
  item_type: "product" | "service";
  item_category: string;
  prezzo_acquisto: number | null;
  sort_order: number;
}

const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: "posa", words: ["posa", "posatura", "installazione", "installare", "montaggio", "messa in opera", "collaudo"] },
  { category: "manodopera", words: ["manodopera", "operaio", "operai", "squadra", "ore", "ora", "giornata", "specializzato"] },
  { category: "trasporto", words: ["trasporto", "consegna", "scarico", "carico", "movimentazione"] },
  { category: "tiro_piano", words: ["tiro al piano", "tiro piano", "piano superiore", "elevatore"] },
  { category: "smaltimento", words: ["smaltimento", "discarica", "macerie", "rimozione", "conferimento"] },
  { category: "sopralluogo", words: ["sopralluogo", "rilievo", "misurazione", "misure"] },
  { category: "progettazione", words: ["progettazione", "disegno", "relazione tecnica", "calcolo", "dimensionamento"] },
  { category: "pratica", words: ["pratica", "permesso", "cilas", "cila", "scia", "enea", "catasto"] },
  { category: "nolo", words: ["nolo", "noleggio", "trabattello", "attrezzatura"] },
  { category: "ponteggio", words: ["ponteggio", "ponteggi"] },
  { category: "sigillatura", words: ["sigillatura", "silicone", "schiuma"] },
  { category: "lattoneria", words: ["lattoneria", "scossalina", "gocciolatoio", "canale"] },
  { category: "contorno", words: ["contorno", "finitura perimetrale", "imbotte"] },
  { category: "falso_telaio", words: ["falso telaio", "controtelaio"] },
];

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCategory(value: string | null | undefined) {
  const normalized = normalize(value);
  return normalized ? normalized.replace(/\s+/g, "_") : "";
}

function safeNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function isComputoTariffaMatch(voce: ComputoVoceLocal) {
  return Boolean(voce._matched_tariffa_id || voce.matched_tariffa_id);
}

export function isComputoProductMatch(voce: ComputoVoceLocal) {
  return Boolean(
    voce._matched_template_id ||
      voce._matched_family_id ||
      voce.matched_template_id ||
      voce.matched_family_id,
  );
}

export function inferComputoItemCategory(voce: ComputoVoceLocal): string {
  const tariffaTipo = cleanCategory(voce._matched_tariffa_tipo);
  if (tariffaTipo) return tariffaTipo;

  const text = normalize(
    [
      voce.descrizione_breve,
      voce.descrizione_estesa,
      voce.capitolo_nome,
      voce.unita_misura,
    ].filter(Boolean).join(" "),
  );

  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.words.some((word) => text.includes(normalize(word)))) {
      return rule.category;
    }
  }

  return isComputoTariffaMatch(voce) ? "servizio" : "prodotto";
}

export function buildComputoQuoteItemPayload(
  voce: ComputoVoceLocal,
  index: number,
): ComputoQuoteItemPayload {
  const tariffaId = voce._matched_tariffa_id ?? voce.matched_tariffa_id ?? null;
  const itemCategory = inferComputoItemCategory(voce);
  const itemType = itemCategory === "prodotto" && !tariffaId ? "product" : "service";
  const discountPercent = safeNumber(voce.sconto_percentuale);
  const lineTotal = safeNumber(voce._importoImpresa) * (1 - discountPercent / 100);

  return {
    id: voce.id,
    name: voce._matched_name ?? voce.matched_name ?? voce.descrizione_breve,
    description: voce.descrizione_estesa || null,
    unit_of_measure: voce._matched_tariffa_unita || voce.unita_misura || "cad",
    quantity: safeNumber(voce.quantita, 1),
    unit_price: safeNumber(voce._prezzoImpresa),
    line_total: lineTotal,
    discount_percent: discountPercent,
    codice_prezzario: voce.codice_prezzario || null,
    article_template_id: tariffaId ? null : (voce._matched_template_id ?? voce.matched_template_id ?? null),
    family_id: tariffaId ? null : (voce._matched_family_id ?? voce.matched_family_id ?? null),
    tariffa_id: tariffaId,
    item_type: itemType,
    item_category: itemCategory,
    prezzo_acquisto: voce._matched_tariffa_cost ?? null,
    sort_order: index + 1,
  };
}
