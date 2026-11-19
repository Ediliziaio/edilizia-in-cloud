interface ClassificazioneFornitore { product_category?: string | null; product_categories?: readonly string[] | null }
export const chiaveCategoria = (nome: string) => nome.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it");

export function normalizzaCategorie(nomi: readonly string[]): string[] {
  const viste = new Set<string>();
  return nomi.map((n) => n.trim().replace(/\s+/g, " ")).filter((n) => {
    const k = chiaveCategoria(n);
    if (!k || viste.has(k)) return false;
    viste.add(k); return true;
  });
}

/** Legge anche le anagrafiche precedenti alla selezione multipla, senza perdere il testo originale. */
export function categorieFornitore(s: ClassificazioneFornitore): string[] {
  return normalizzaCategorie(s.product_categories?.length ? s.product_categories : s.product_category ? [s.product_category] : []);
}

export function fornitoreInCategoria(s: ClassificazioneFornitore, categoria: string): boolean {
  return categorieFornitore(s).some((c) => chiaveCategoria(c) === chiaveCategoria(categoria));
}
