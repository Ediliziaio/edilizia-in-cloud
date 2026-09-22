/**
 * Le pagine del preventivo nel menu degli editor dei modelli («Pagine del PDF»).
 *
 * L'editor è fatto a sezioni, una per pagina del documento: «Chi siamo», «Come
 * lavoriamo»… Le pagine nate il 21-22/09/2026 (i blocchi della libreria, «Dicono di
 * noi», «I nostri lavori», le garanzie e le domande con la loro testata) si
 * modificavano solo dall'«Ordine pagine», dove un'azienda non le va a cercare. Qui
 * c'è l'elenco completo, nell'ordine in cui le pagine escono di serie: per ognuna
 * la sezione dell'editor, la pagina del documento e che cosa vi si modifica.
 *
 * `esistente`: la sezione c'era già, coi suoi campi; il menu la tiene al suo posto e
 * le aggiunge solo quello che mancava (la foto della pagina).
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, Camera, ClipboardCheck, Flag, FolderCheck, HelpCircle, Home, Images, PackageCheck, Quote, ShieldCheck, Wrench,
} from "lucide-react";
import type { ChiaveBlocco, ChiaveFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { MotoreTestate, PaginaConTestata } from "../../../supabase/functions/_shared/testatePagine";

export interface FotoDellaPagina {
  chiave: ChiaveFotoPagina;
  /** Quando esce: sempre, o solo se la pagina finisce a metà foglio. */
  nota: string;
}

export interface PaginaEditor {
  /** L'id della sezione nell'editor (anche nell'indirizzo, `?section=`). */
  id: string;
  /** Il nome nel menu: quello che la pagina ha nel documento. */
  voce: string;
  emoji: string;
  /** Una riga sotto il titolo della sezione. */
  descrizione: string;
  icona?: LucideIcon;
  /** La pagina nel documento: il capitolo (edili) o l'id della pagina (Serramenti, Fotovoltaico). */
  pagina: string | null;
  blocco?: ChiaveBlocco;
  testata?: PaginaConTestata;
  foto?: FotoDellaPagina;
  esistente?: boolean;
}

const RIEMPIE = "Esce quando la pagina finisce a metà foglio, e riempie lo spazio che resterebbe bianco. Una foto già usata altrove nel documento non si ripete.";
const FASCIA = "Riempie il fondo della pagina, sotto il contenuto.";

// ─── Piano dei lavori (gli otto moduli edili) ────────────────────────────────

export const PAGINE_EDITOR_EDILI: PaginaEditor[] = [
  { id: "page_ordine", voce: "Ordine e pagine", emoji: "🔀", descrizione: "In che ordine escono le pagine, quali nascondere, e le pagine scritte da voi", pagina: null, esistente: true },
  { id: "page_cover", voce: "Copertina", emoji: "🖼️", descrizione: "Prima pagina del preventivo", pagina: null, esistente: true },
  { id: "page_chi_siamo", voce: "Chi siamo", emoji: "👋", descrizione: "Presentazione impresa", pagina: "chiSiamo", foto: { chiave: "chiSiamo", nota: RIEMPIE }, esistente: true },
  { id: "page_percorso", voce: "Come lavoriamo", emoji: "🗺️", descrizione: "Le fasi del cantiere", pagina: "percorso", foto: { chiave: "percorso", nota: RIEMPIE }, esistente: true },
  { id: "page_come_funziona", voce: "Come funziona", emoji: "🔧", icona: Wrench, descrizione: "Le lavorazioni che non si vedono, spiegate con foto tecniche", pagina: "comeFunziona", blocco: "comeFunziona" },
  { id: "page_protezione", voce: "Protezione della casa", emoji: "🏠", icona: Home, descrizione: "Come proteggete la casa durante i lavori", pagina: "protezione", blocco: "protezione" },
  { id: "page_controlli", voce: "Controlli di qualità", emoji: "✅", icona: ClipboardCheck, descrizione: "Cosa verificate prima della consegna", pagina: "controlli", blocco: "controlli" },
  { id: "page_lavori", voce: "I nostri lavori", emoji: "📸", icona: Images, descrizione: "Le foto dei lavori consegnati: la pagina esce se ce n'è almeno una", pagina: "lavori", testata: "lavori" },
  { id: "page_testimonianze", voce: "Dicono di noi", emoji: "⭐", icona: Quote, descrizione: "Il voto su Google o Trustpilot e le parole dei clienti", pagina: "recensioni", testata: "recensioni", foto: { chiave: "recensioni", nota: RIEMPIE } },
  { id: "page_compreso", voce: "Cosa è compreso", emoji: "📦", icona: PackageCheck, descrizione: "Cosa comprende il prezzo, e cosa resta fuori", pagina: "compreso", blocco: "compreso", foto: { chiave: "compreso", nota: RIEMPIE } },
  { id: "garanzie", voce: "Le garanzie", emoji: "🛡️", icona: ShieldCheck, descrizione: "Le garanzie, col sigillo degli anni: la pagina esce se ce n'è almeno una", pagina: "garanzie", testata: "garanzie", foto: { chiave: "garanzie", nota: RIEMPIE } },
  { id: "page_documenti", voce: "Documenti consegnati", emoji: "📁", icona: FolderCheck, descrizione: "Il fascicolo che il cliente riceve a fine lavori", pagina: "documenti", blocco: "documenti" },
  { id: "page_diario", voce: "Diario fotografico", emoji: "📷", icona: Camera, descrizione: "Le foto delle fasi, anche di quelle che poi restano nascoste", pagina: "diario", blocco: "diario" },
  { id: "page_crono", voce: "Cronoprogramma", emoji: "📅", descrizione: "Fasi del cantiere", pagina: "tempi", foto: { chiave: "tempi", nota: RIEMPIE }, esistente: true },
  { id: "page_domande", voce: "Domande e risposte", emoji: "❓", icona: HelpCircle, descrizione: "Le domande frequenti, in fondo prima dei prossimi passi: la pagina esce se ce n'è almeno una", pagina: "domande", testata: "domande", foto: { chiave: "domande", nota: RIEMPIE } },
  { id: "page_chiusura", voce: "I prossimi passi", emoji: "➡️", icona: Flag, descrizione: "Sempre in fondo: la foto del lavoro finito, i passi, i contatti", pagina: null, foto: { chiave: "chiusura", nota: "Esce sempre, in cima all'ultima pagina." } },
  { id: "page_condizioni", voce: "Condizioni", emoji: "📄", descrizione: "Pagamenti, validità, condizioni e firma", pagina: null, esistente: true },
];

// ─── Serramenti ───────────────────────────────────────────────────────────────

export const PAGINE_EDITOR_SERRAMENTI: PaginaEditor[] = [
  { id: "page_ordine", voce: "Ordine pagine", emoji: "📋", descrizione: "In che ordine escono le pagine e quali nascondere", pagina: null, esistente: true },
  { id: "page_cover", voce: "Cover", emoji: "🖼️", descrizione: "Prima pagina del preventivo", pagina: null, esistente: true },
  { id: "page_chi_siamo", voce: "Chi siamo", emoji: "👋", descrizione: "Presentazione azienda", pagina: "chi_siamo", esistente: true },
  { id: "page_come_funziona", voce: "Come è fatto un serramento", emoji: "🔧", icona: Wrench, descrizione: "Vetro, telaio, posa: cosa rende isolante un serramento", pagina: "come_funziona", blocco: "comeFunziona" },
  { id: "page_render", voce: "Prima & dopo (render AI)", emoji: "🪄", descrizione: "Prima/dopo + disclaimer", pagina: "render", esistente: true },
  { id: "page_percorso", voce: "Il tuo percorso", emoji: "🗺️", descrizione: "Fasi e step cliente", pagina: "percorso", foto: { chiave: "percorso", nota: "Esce sotto le fasi, se la pagina ha posto." }, esistente: true },
  { id: "page_protezione", voce: "Protezione della casa", emoji: "🏠", icona: Home, descrizione: "Come proteggete la casa durante la posa", pagina: "protezione", blocco: "protezione" },
  { id: "page_controlli", voce: "Controlli di qualità", emoji: "✅", icona: ClipboardCheck, descrizione: "Cosa verificate prima della consegna", pagina: "controlli", blocco: "controlli" },
  { id: "page_documenti", voce: "Documenti consegnati", emoji: "📁", icona: FolderCheck, descrizione: "Il fascicolo che il cliente riceve a fine lavori", pagina: "documenti", blocco: "documenti" },
  { id: "page_diario", voce: "Diario fotografico", emoji: "📷", icona: Camera, descrizione: "Le foto della posa, anche di quello che poi resta nascosto", pagina: "diario", blocco: "diario" },
  { id: "page_garanzie", voce: "Le nostre garanzie", emoji: "🛡️", icona: ShieldCheck, descrizione: "Le garanzie con il loro sigillo", pagina: "garanzie", testata: "garanzie" },
  { id: "page_confronto", voce: "Confronto prima e dopo", emoji: "📊", icona: BarChart3, descrizione: "I numeri della casa oggi e dopo i serramenti nuovi", pagina: "confronto", foto: { chiave: "confronto", nota: "Esce sopra la tabella." } },
  { id: "page_lavori", voce: "I nostri lavori", emoji: "📸", icona: Images, descrizione: "Le foto dei lavori consegnati: la pagina esce se ce n'è almeno una", pagina: "gallery_lavori", testata: "lavori" },
  { id: "page_recensioni", voce: "Dicono di noi", emoji: "⭐", icona: Quote, descrizione: "Il voto su Google o Trustpilot e le parole dei clienti", pagina: "recensioni", testata: "recensioni" },
  { id: "page_faq", voce: "Domande frequenti", emoji: "❓", icona: HelpCircle, descrizione: "Le risposte prima della firma", pagina: "faq", testata: "domande" },
  { id: "page_cta", voce: "Pronti per partire", emoji: "✅", descrizione: "La pagina finale: i prossimi passi", pagina: "cta", foto: { chiave: "cta", nota: FASCIA }, esistente: true },
  { id: "page_consulente", voce: "Consulente", emoji: "👤", descrizione: "Dati commerciale", pagina: null, esistente: true },
  { id: "page_conversione", voce: "Urgenza e bonus", emoji: "⚡", descrizione: "Scadenza del prezzo, certificazioni, bonus e firma dell'azienda", pagina: null, esistente: true },
];

// ─── Fotovoltaico ─────────────────────────────────────────────────────────────

export const PAGINE_EDITOR_FOTOVOLTAICO: PaginaEditor[] = [
  { id: "page_cover", voce: "Cover", emoji: "🖼️", descrizione: "Prima pagina del preventivo.", pagina: null, esistente: true },
  { id: "page_chi_siamo", voce: "Chi siamo e garanzie", emoji: "👋", icona: ShieldCheck, descrizione: "Presentazione, garanzie, perché sceglierci e certificazioni.", pagina: "garanzie", testata: "garanzie", foto: { chiave: "garanzie", nota: FASCIA }, esistente: true },
  { id: "page_percorso", voce: "Il tuo percorso", emoji: "🗺️", descrizione: "Iter cliente e pratiche.", pagina: "iter", esistente: true },
  { id: "page_come_funziona", voce: "Come funziona un impianto", emoji: "🔧", icona: Wrench, descrizione: "Produce, converte, conserva, scambia.", pagina: "come_funziona", blocco: "comeFunziona" },
  { id: "page_protezione", voce: "Sicurezza sul tetto", emoji: "🏠", icona: Home, descrizione: "Come lavorate sul tetto e proteggete la casa.", pagina: "protezione", blocco: "protezione" },
  { id: "page_controlli", voce: "Controlli di qualità", emoji: "✅", icona: ClipboardCheck, descrizione: "Cosa verificate prima di mettere in servizio l'impianto.", pagina: "controlli", blocco: "controlli" },
  { id: "page_documenti", voce: "Documenti consegnati", emoji: "📁", icona: FolderCheck, descrizione: "Conformità, pratiche, garanzie e monitoraggio.", pagina: "documenti", blocco: "documenti" },
  { id: "page_diario", voce: "Diario fotografico", emoji: "📷", icona: Camera, descrizione: "Le foto dell'installazione.", pagina: "diario", blocco: "diario" },
  { id: "page_recensioni", voce: "Dicono di noi", emoji: "⭐", icona: Quote, descrizione: "Il voto su Google o Trustpilot, le parole dei clienti e le foto dei vostri impianti.", pagina: "recensioni", testata: "recensioni", foto: { chiave: "recensioni", nota: "Riempie il fondo della pagina quando non ci sono foto dei vostri impianti." } },
  { id: "page_faq", voce: "Domande frequenti", emoji: "❓", icona: HelpCircle, descrizione: "Le risposte prima della firma.", pagina: "faq", testata: "domande", foto: { chiave: "faq", nota: FASCIA } },
  { id: "page_render", voce: "Render AI", emoji: "🪄", descrizione: "Nota anteprima impianto.", pagina: null, esistente: true },
  { id: "page_cta", voce: "CTA e firma", emoji: "✅", descrizione: "Titolo, testo e firma.", pagina: "decisione", foto: { chiave: "decisione", nota: FASCIA }, esistente: true },
  { id: "page_consulente", voce: "Consulente", emoji: "👤", descrizione: "Copy venditore e contatto.", pagina: null, esistente: true },
];

export const PAGINE_EDITOR: Record<MotoreTestate, PaginaEditor[]> = {
  edili: PAGINE_EDITOR_EDILI,
  serramenti: PAGINE_EDITOR_SERRAMENTI,
  fotovoltaico: PAGINE_EDITOR_FOTOVOLTAICO,
};

/** La sezione dell'editor con quell'id, se è una pagina del documento. */
export const paginaEditor = (motore: MotoreTestate, sezione: string): PaginaEditor | null =>
  PAGINE_EDITOR[motore].find((p) => p.id === sezione) ?? null;

/** La sezione dell'editor che modifica una pagina del documento (capitolo o id pagina). */
export const sezioneDellaPagina = (motore: MotoreTestate, pagina: string): PaginaEditor | null =>
  PAGINE_EDITOR[motore].find((p) => p.pagina === pagina) ?? null;

/** Una pagina dell'«Ordine pagine» (Serramenti, Fotovoltaico) accesa o spenta: le altre com'erano. */
export function conPaginaVisibile<T extends { id: string; visible: boolean }>(pagine: T[], id: string, visible: boolean): T[] {
  return pagine.map((p) => (p.id === id ? { ...p, visible } : p));
}
