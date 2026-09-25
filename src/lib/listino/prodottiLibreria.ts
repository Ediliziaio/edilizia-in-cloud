/**
 * Libreria listino → «Prodotti singoli»: i modelli di un prodotto alla volta
 * (article_family_templates) che le aziende prendono dal loro listino con
 * «Importa → Modelli pronti» (FamilyTemplatePicker). Qui le regole della
 * pagina del super admin: filtri, gruppi, etichette.
 */

/**
 * Le modalità di prezzo. Sono gli stessi valori del CHECK su
 * article_family_templates e su article_families: un valore scritto a mano
 * diverso da questi non si salva, e l'import nell'azienda si fermerebbe.
 */
export const MODALITA_PREZZO = [
  { value: "pz", label: "A pezzo" },
  { value: "mq", label: "Al mq" },
  { value: "griglia", label: "Griglia L×H" },
  { value: "misura_libera", label: "Misura libera" },
] as const;

export function etichettaModalita(m: string | null | undefined): string {
  if (!m) return "";
  return MODALITA_PREZZO.find((x) => x.value === m)?.label ?? m;
}

/** "porta_finestra" → "Porta Finestra"; vuoto, o il gruppo di chi non ce l'ha → "Senza categoria". */
export const etichettaSlug = (s: string | null | undefined) =>
  !s || s === "senza-categoria"
    ? "Senza categoria"
    : s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface ProdottoLibreria {
  id: string;
  nome: string;
  vertical_slug: string;
  categoria_slug: string | null;
  tipologia: string | null;
  tags: string[] | null;
  modalita_prezzo_base: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface FiltroProdotti {
  cerca: string;
  categoria: string | null;
  tag: string | null;
  soloSpenti: boolean;
}

export const FILTRO_VUOTO: FiltroProdotti = { cerca: "", categoria: null, tag: null, soloSpenti: false };

export function filtraProdotti<T extends ProdottoLibreria>(prodotti: T[], f: FiltroProdotti): T[] {
  const q = f.cerca.trim().toLowerCase();
  return prodotti.filter((t) => {
    if (f.soloSpenti && t.is_active) return false;
    if (f.tag && !(t.tags ?? []).includes(f.tag)) return false;
    if (f.categoria && (t.categoria_slug ?? "") !== f.categoria) return false;
    if (!q) return true;
    return (
      t.nome.toLowerCase().includes(q) ||
      (t.tipologia ?? "").toLowerCase().includes(q) ||
      (t.categoria_slug ?? "").toLowerCase().includes(q) ||
      (t.tags ?? []).some((x) => x.toLowerCase().includes(q))
    );
  });
}

export interface GruppoProdotti<T> {
  chiave: string;
  verticale: string;
  categoria: string;
  prodotti: T[];
}

/** Per verticale e categoria, in ordine alfabetico: scala a centinaia di prodotti. */
export function gruppiProdotti<T extends ProdottoLibreria>(prodotti: T[]): GruppoProdotti<T>[] {
  const mappa = new Map<string, T[]>();
  for (const t of prodotti) {
    const chiave = `${t.vertical_slug || "—"}/${t.categoria_slug || "senza-categoria"}`;
    const elenco = mappa.get(chiave);
    if (elenco) elenco.push(t);
    else mappa.set(chiave, [t]);
  }
  return [...mappa.entries()]
    .map(([chiave, elenco]) => ({ chiave, verticale: chiave.split("/")[0], categoria: chiave.split("/")[1], prodotti: elenco }))
    .sort((a, b) => a.chiave.localeCompare(b.chiave, "it"));
}

/** Le categorie e quanti prodotti hanno: le pastiglie del filtro. */
export function categorieProdotti(prodotti: ProdottoLibreria[]): Array<{ slug: string; conta: number }> {
  const conta = new Map<string, number>();
  for (const t of prodotti) {
    if (t.categoria_slug) conta.set(t.categoria_slug, (conta.get(t.categoria_slug) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([slug, n]) => ({ slug, conta: n }))
    .sort((a, b) => a.slug.localeCompare(b.slug, "it"));
}

/** Il riassunto sopra l'elenco: «48 prodotti in 6 categorie», «1 prodotto». */
export function testoConteggio(prodotti: number, categorie: number): string {
  const p = prodotti === 1 ? "1 prodotto" : `${prodotti} prodotti`;
  if (categorie <= 1) return p;
  return `${p} in ${categorie} categorie`;
}
