/**
 * I prodotti del listino (article_families) come voci da scegliere: costo netto
 * degli sconti fornitore, vendita salvata o da costo + ricarico, IVA e unità del
 * prodotto. Fino al 05/10/2026 IVA 22 e «pz» erano fissi e il costo era il lordo
 * di listino del fornitore: margini sottostimati sulle commesse.
 */
import { supabase } from "@/integrations/supabase/client";
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import { prodottoSuMisura } from "@/lib/orders/gruppiSuMisura";
import type { ArticleTemplateData } from "@/components/orders/ArticleCombobox";
import type { MarkupTipo } from "@/types/articleFamily";

export async function caricaVociListino(
  companyId: string,
  opzioni: { suMisuraIntero?: boolean } = {},
): Promise<ArticleTemplateData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [famRes, catRes, axesRes] = await Promise.all([
    sb.from("article_families")
      .select("id, nome, codice, descrizione, immagine_url, prezzo_base_acquisto, prezzo_base_vendita, categoria_id, manodopera_costo_acquisto, supplier_id, vat_rate, unit_of_measure, prezzo_base_mode, sconto_fornitore_1, sconto_fornitore_2, markup_tipo, markup_valore, vertical, modalita_prezzo_base")
      .eq("company_id", companyId)
      .eq("attivo", true)
      .eq("mostra_preventivo", true)
      .is("deleted_at", null)
      .order("nome")
      .limit(2000),
    sb.from("listino_categorie").select("id, nome").eq("company_id", companyId),
    // Varianti: assi + valori. Espandiamo SOLO le famiglie con un singolo
    // asse (es. "Potenza"/"Modello") nelle loro varianti, ognuna col suo
    // codice + prezzo. Famiglie multi-asse → restano una voce (configuratore).
    sb.from("article_family_axes")
      .select("id, family_id, values:article_family_axis_values(id, label, codice, prezzo_vendita, prezzo_acquisto, immagine_url, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, attivo, sort_order)")
      .eq("company_id", companyId),
  ]);
  if (famRes.error) throw famRes.error;
  const catName = new Map<string, string>();
  (catRes.data ?? []).forEach((c: { id: string; nome: string | null }) => {
    if (c.nome) catName.set(c.id, c.nome);
  });

  type VariantRow = {
    id: string; label: string; codice: string | null; prezzo_vendita: number | null; immagine_url: string | null;
    prezzo_acquisto: number | null; maggiorazione_acquisto: number | null;
    maggiorazione_tipo: string | null; maggiorazione_valore: number | null; attivo: boolean; sort_order: number;
  };
  const axisCount = new Map<string, number>();
  const variantsByFamily = new Map<string, VariantRow[]>();
  (axesRes.data ?? []).forEach((ax: { id: string; family_id: string; values: VariantRow[] | null }) => {
    axisCount.set(ax.family_id, (axisCount.get(ax.family_id) ?? 0) + 1);
    const vals = (ax.values ?? []).filter((v) => v.attivo).sort((a, b) => a.sort_order - b.sort_order);
    if (vals.length > 0) variantsByFamily.set(ax.family_id, vals);
  });
  // Le maggiorazioni possono essere riduzioni (−8%, −20 €): mai sotto zero.
  const variantPrice = (base: number | null, v: VariantRow): number => {
    if (v.prezzo_vendita != null && Number(v.prezzo_vendita) > 0) return Number(v.prezzo_vendita);
    const b = Number(base ?? 0);
    if (v.maggiorazione_tipo === "percentuale") return Math.max(0, b * (1 + Number(v.maggiorazione_valore ?? 0) / 100));
    if (typeof v.maggiorazione_tipo === "string" && v.maggiorazione_tipo.startsWith("fisso")) {
      return Math.max(0, b + Number(v.maggiorazione_valore ?? 0));
    }
    return b;
  };
  // Il costo della variante con le stesse regole del prezzo, dal lato acquisto.
  const variantCost = (base: number, v: VariantRow): number => {
    if (v.prezzo_acquisto != null && Number(v.prezzo_acquisto) > 0) return Number(v.prezzo_acquisto);
    if (v.maggiorazione_tipo === "percentuale") return Math.max(0, base * (1 + Number(v.maggiorazione_acquisto ?? 0) / 100));
    if (typeof v.maggiorazione_tipo === "string" && v.maggiorazione_tipo.startsWith("fisso")) {
      return Math.max(0, base + Number(v.maggiorazione_acquisto ?? 0));
    }
    return base;
  };

  type FamigliaRow = {
    id: string; nome: string; codice: string | null; descrizione: string | null; immagine_url: string | null;
    prezzo_base_acquisto: number | null; prezzo_base_vendita: number | null; categoria_id: string | null;
    manodopera_costo_acquisto: number | null; supplier_id?: string | null;
    vat_rate: number | null; unit_of_measure: string | null; prezzo_base_mode: string | null;
    sconto_fornitore_1: number | null; sconto_fornitore_2: number | null;
    markup_tipo: string | null; markup_valore: number | null;
    vertical: string | null; modalita_prezzo_base: string | null;
  };
  // Costo netto: nei prodotti «acquisto + ricarico» il costo salvato è il
  // lordo di listino del fornitore, da cui si tolgono gli sconti.
  const costoNetto = (f: FamigliaRow): number => {
    const lordo = Number(f.prezzo_base_acquisto ?? 0);
    return f.prezzo_base_mode === "acquisto_markup"
      ? applyScontiFornitore(lordo, Number(f.sconto_fornitore_1 ?? 0), Number(f.sconto_fornitore_2 ?? 0))
      : lordo;
  };
  // Vendita salvata; per un prodotto a ricarico che non l'ha, da costo + ricarico.
  const venditaBase = (f: FamigliaRow): number => {
    const salvata = Number(f.prezzo_base_vendita ?? 0);
    if (salvata > 0 || f.prezzo_base_mode !== "acquisto_markup") return salvata;
    return applyMarkup({
      prezzoAcquisto: costoNetto(f),
      markupTipo: (f.markup_tipo ?? "none") as MarkupTipo,
      markupValore: Number(f.markup_valore ?? 0),
    }).prezzoVendita;
  };

  return ((famRes.data ?? []) as FamigliaRow[]).flatMap((f): ArticleTemplateData[] => {
    const category = f.categoria_id ? (catName.get(f.categoria_id) ?? null) : null;
    const suMisura = prodottoSuMisura(f);
    // Il su misura resta una voce sola: colore e vetro si scelgono nel popup, una volta per tutte le posizioni.
    const variants = axisCount.get(f.id) === 1 && !(opzioni.suMisuraIntero && suMisura) ? variantsByFamily.get(f.id) : undefined;
    const costo = costoNetto(f);
    const vendita = venditaBase(f);
    const iva = f.vat_rate != null && Number.isFinite(Number(f.vat_rate)) ? Number(f.vat_rate) : 22;
    const unita = f.unit_of_measure || "pz";
    // Famiglia a variante singola → una voce per variante (codice + prezzo propri).
    if (variants && variants.length > 0) {
      return variants.map((v): ArticleTemplateData => ({
        id: v.id,
        name: `${f.nome} — ${v.label}`,
        sku: v.codice ?? f.codice,
        category,
        unit_price: variantPrice(vendita, v),
        standard_cost: variantCost(costo, v),
        unit_of_measure: unita,
        vat_rate: iva,
        // Il fornitore della famiglia viaggia con la scelta: cosi'
        // l'articolo atterra nel pannello gia' raggruppato, senza il
        // passaggio a mano "assegna il fornitore". Prima era cablato
        // a null anche quando il listino lo conosceva.
        supplier_id: f.supplier_id ?? null,
        description: f.descrizione,
        // Immagine propria della variante, fallback a quella della famiglia.
        immagine_url: v.immagine_url ?? f.immagine_url,
        pdf_scheda_url: null,
        source: "listino",
        manodopera_costo: Number(f.manodopera_costo_acquisto ?? 0) || null,
      }));
    }
    // Nessuna variante → la famiglia come singola voce (comportamento attuale).
    return [{
      id: f.id,
      family_id: f.id,
      su_misura: suMisura,
      name: f.nome,
      sku: f.codice,
      category,
      unit_price: vendita,
      standard_cost: costo,
      unit_of_measure: unita,
      vat_rate: iva,
      supplier_id: f.supplier_id ?? null,
      description: f.descrizione,
      immagine_url: f.immagine_url,
      pdf_scheda_url: null,
      source: "listino",
      manodopera_costo: Number(f.manodopera_costo_acquisto ?? 0) || null,
    }];
  });
}
