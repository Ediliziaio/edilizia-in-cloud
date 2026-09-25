/**
 * Mappa comune delle aree che rendono vendibile e consegnabile un PDF.
 *
 * I moduli hanno nomi di colonna diversi (es. `chi_siamo` negli edili,
 * `presentazione_impresa_html` nel FV, `chi_siamo_testo` nei serramenti),
 * quindi la checklist legge alias compatibili senza forzare una migrazione.
 */

export interface StandardTemplateAreaStatus {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
}

type Snapshot = Record<string, unknown>;

const valueFor = (snapshot: Snapshot, keys: string[]): unknown => keys.map((key) => snapshot[key]).find((value) => value != null && value !== "");

function hasText(value: unknown, min = 3): boolean {
  if (typeof value !== "string") return false;
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length >= min;
}

function hasArray(value: unknown, min = 1): boolean {
  return Array.isArray(value) && value.filter((item) => item != null && (typeof item !== "string" || item.trim().length > 0)).length >= min;
}

function hasObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0;
}

export function standardTemplateAreaStatus(snapshot: Snapshot = {}): StandardTemplateAreaStatus[] {
  const area = (id: string, label: string, ready: boolean, detail: string): StandardTemplateAreaStatus => ({ id, label, ready, detail });

  return [
    area("cover", "Copertina", hasText(valueFor(snapshot, ["cover_title", "pdf_cover_hero", "pdf_cover_eyebrow"])) || hasText(valueFor(snapshot, ["cover_subtitle", "pdf_cover_subhero"])), "Titolo, sottotitolo e identità del progetto."),
    area("company", "Chi siamo", hasText(valueFor(snapshot, ["chi_siamo", "chi_siamo_testo", "presentazione_impresa_html"]), 20), "Presentazione dell'impresa e del metodo."),
    area("needs", "Esigenze", hasArray(valueFor(snapshot, ["esigenze", "esigenze_default"]), 1), "Problemi e obiettivi del cliente."),
    area("solution", "Soluzione", hasArray(valueFor(snapshot, ["soluzione", "soluzione_default"])) || hasText(valueFor(snapshot, ["valore_proposta_html"]), 20), "Cosa viene proposto e perché."),
    area("usp", "Perché sceglierci", hasArray(valueFor(snapshot, ["usp"])) || hasArray(valueFor(snapshot, ["perche_noi_default"]), 2), "Differenziatori verificabili, senza promesse generiche."),
    area("guarantees", "Garanzie", hasArray(valueFor(snapshot, ["garanzie", "garanzie_conversione"]), 1), "Garanzie, controlli e assistenza post-consegna."),
    area("journey", "Percorso cliente", hasArray(valueFor(snapshot, ["percorso"])) || hasText(valueFor(snapshot, ["percorso_cliente_intro"]), 20) || hasObject(valueFor(snapshot, ["percorso_cliente"])), "Fasi e responsabilità dall'analisi alla consegna."),
    area("reviews", "Testimonianze", hasArray(valueFor(snapshot, ["testimonianze", "testimonianze_default", "recensioni"]), 1), "Prova sociale reale o pagina da nascondere."),
    area("timeline", "Cronoprogramma", hasArray(valueFor(snapshot, ["cronoprogramma"]), 1) || hasText(valueFor(snapshot, ["crono_giorni_produzione_default"])), "Tempi, fasi e condizioni di pianificazione."),
    area("faq", "FAQ", hasArray(valueFor(snapshot, ["faq", "faq_items"]), 1), "Obiezioni e domande prima della firma."),
    area("economics", "Pagamenti e validità", hasText(valueFor(snapshot, ["payment_terms_text", "condizioni_legali_testo"]), 20) || typeof valueFor(snapshot, ["valido_giorni_default", "scadenza_validita_preventivo_giorni"]) === "number", "Milestone, validità, esclusioni e varianti."),
    area("legal", "Condizioni legali", snapshot.condizioni_legali_attivo === false || hasText(valueFor(snapshot, ["condizioni_legali_testo"]), 20), "Condizioni contrattuali e recesso, se applicabili."),
    area("company_data", "Dati azienda", hasText(valueFor(snapshot, ["ragione_sociale", "contatto_telefono", "telefono", "email", "contatto_email"])), "Ragione sociale e contatti per il prossimo passo."),
    area("pages", "Pagine e blocchi tecnici", hasObject(valueFor(snapshot, ["pdf_blocchi"])) || hasArray(valueFor(snapshot, ["pdf_ordine_capitoli", "pdf_pages_order", "pdf_pages_order"])), "Ordine pagine, blocchi, foto e contenuti tecnici."),
  ];
}
