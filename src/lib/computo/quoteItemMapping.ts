import type { ComputoVoceLocal } from "@/types/computo";
import type { CatalogItem } from "@/types/catalogItem";
import { applyScontiFornitore } from "@/lib/priceMarkup";

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
  /**
   * IVA del prodotto abbinato; null = quella di default del preventivo. La
   * legge silvio_tool_apply_computo_review dalla migrazione 20281005235100
   * (prima tutte le righe al 10%).
   */
  vat_rate: number | null;
  sort_order: number;
}

/** Costo d'acquisto unitario e IVA di una voce del listino abbinata a una voce di computo. */
export interface CostoEIvaAbbinati {
  /** Costo unitario netto; null = il listino non lo dice. */
  costo: number | null;
  /** Aliquota IVA; null = quella di default del preventivo. */
  vat_rate: number | null;
}

function positivoOppureNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function aliquotaOppureNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Costo e IVA di un prodotto del listino, per la voce di computo che gli è
 * abbinata (05/10/2026). Prima la voce entrava nel preventivo senza costo e
 * col 10% fisso: margine del 100% su ogni riga abbinata.
 *
 * Il prezzo della voce resta il prezzo base del listino (col ricarico scelto):
 * il costo è quello base, nella stessa unità. Per una famiglia «acquisto +
 * ricarico» è al netto degli sconti fornitore, come nel calcolo del listino
 * (calcolaPrezzoFamiglia). Una famiglia a griglia non ha un costo senza le
 * misure: resta null, e il margine del preventivo lo segnala.
 */
export function costoEIvaDaListino(item: CatalogItem): CostoEIvaAbbinati {
  if (item.source === "article") {
    return {
      costo: positivoOppureNull(item.article.prezzo_acquisto_netto),
      vat_rate: aliquotaOppureNull(item.article.vat_rate),
    };
  }
  const famiglia = item.family;
  let costo: number | null = null;
  if (famiglia.modalita_prezzo_base !== "griglia") {
    const lordo = Number(famiglia.prezzo_base_acquisto ?? 0);
    costo = positivoOppureNull(
      famiglia.prezzo_base_mode === "acquisto_markup"
        ? applyScontiFornitore(lordo, Number(famiglia.sconto_fornitore_1 ?? 0), Number(famiglia.sconto_fornitore_2 ?? 0))
        : lordo,
    );
  }
  return { costo, vat_rate: aliquotaOppureNull(famiglia.vat_rate) };
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

/**
 * Le categorie che quote_items accetta (CHECK quote_items_item_category_check).
 * Quelle che il computo deduce dal testo («manodopera», «ponteggio», il
 * ripiego «servizio»…) il database le rifiuta, e con una sola riga così salta
 * tutto il preventivo (05/10/2026). La categoria dedotta resta per la
 * revisione; nella riga va una ammessa: una voce abbinata a una tariffa come
 * posa (la regola del listino tariffe nel preventivatore), le altre come
 * prodotto. Il testo è un indizio debole («lavorato» contiene «ora» e
 * diventava manodopera): meglio una riga normale che una posa per sbaglio.
 */
const CATEGORIE_AMMESSE = new Set(["prodotto", "posa", "trasporto", "tiro_piano", "smaltimento", "nolo", "pratica"]);

export function categoriaRigaPreventivo(categoria: string, abbinataATariffa: boolean): string {
  if (CATEGORIE_AMMESSE.has(categoria)) return categoria;
  return abbinataATariffa ? "posa" : "prodotto";
}

export function buildComputoQuoteItemPayload(
  voce: ComputoVoceLocal,
  index: number,
  /**
   * Costo e IVA della voce del listino abbinata, cercati per id (prodotto o
   * tariffa). Senza, la riga parte senza costo come prima.
   */
  listino?: (id: string) => CostoEIvaAbbinati | null | undefined,
): ComputoQuoteItemPayload {
  // L'abbinamento fatto in revisione vince per intero su quello del server
  // (05/10/2026): un articolo scelto a mano su una voce che il server aveva
  // legato a una famiglia o a una tariffa ripescava l'altro id, e il database
  // rifiuta articolo e famiglia insieme (quote_items_family_or_article_exclusive).
  const prodottoInRevisione = Boolean(voce._matched_template_id || voce._matched_family_id);
  // «Rimuovi abbinamento» in revisione mette _match_type a «none»: la riga resta
  // senza abbinamento. Prima svuotava solo i campi locali e qui tornava quello
  // del server (05/10/2026). Il server stesso scrive «none» quando non trova
  // niente, e allora i suoi id sono già vuoti.
  const tolto = voce._match_type === "none";
  const tariffaId = tolto
    ? null
    : voce._matched_tariffa_id ?? (prodottoInRevisione ? null : (voce.matched_tariffa_id ?? null));
  const articleId = tariffaId || tolto
    ? null
    : prodottoInRevisione
      ? (voce._matched_template_id ?? null)
      : (voce.matched_template_id ?? null);
  const familyId = tariffaId || tolto
    ? null
    : prodottoInRevisione
      ? (voce._matched_family_id ?? null)
      : (voce.matched_family_id ?? null);
  const itemCategory = categoriaRigaPreventivo(inferComputoItemCategory(voce), Boolean(tariffaId));
  const itemType = itemCategory === "prodotto" && !tariffaId ? "product" : "service";
  const discountPercent = safeNumber(voce.sconto_percentuale);
  const lineTotal = safeNumber(voce._importoImpresa) * (1 - discountPercent / 100);
  // Costo e IVA della voce abbinata (05/10/2026): prima solo il costo della
  // tariffa scelta a mano; un prodotto entrava senza costo e al 10%.
  const prodotto = !tariffaId && (familyId || articleId) ? listino?.((familyId ?? articleId)!) ?? null : null;
  const costo = tariffaId
    ? (voce._matched_tariffa_cost ?? listino?.(tariffaId)?.costo ?? null)
    : (prodotto?.costo ?? null);

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
    // Una sola delle due: se il server le avesse date entrambe vince la
    // famiglia, come nell'inserimento delle righe dell'AI.
    article_template_id: familyId ? null : articleId,
    family_id: familyId,
    tariffa_id: tariffaId,
    item_type: itemType,
    item_category: itemCategory,
    prezzo_acquisto: costo,
    vat_rate: prodotto?.vat_rate ?? null,
    sort_order: index + 1,
  };
}
