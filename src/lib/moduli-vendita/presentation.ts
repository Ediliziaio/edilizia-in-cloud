import type { ModuloVendutaSlug } from "./config";
import type { ModuloVenditaView } from "./useModuliVendita";

export const MODULES_SETTINGS_HREF = "/azienda/impostazioni/template-preventivi?tab=moduli-vendita";

/** Contenuti editoriali del catalogo: immagini illustrative, non anteprime PDF. */
export const MODULE_PRESENTATION: Record<ModuloVendutaSlug, {
  title: string; image?: string; summary: string; topics: readonly string[];
}> = {
  serramenti: { title: "Serramenti", image: "/cover-stock/serramenti/1-thumb.jpg",
    summary: "Finestre, porte e oscuranti. Organizza misure, accessori e posa nella stessa offerta.",
    topics: ["Finestre e porte", "Misure", "Posa"] },
  fotovoltaico: { title: "Fotovoltaico", image: "/cover-stock/fotovoltaico/1-thumb.jpg",
    summary: "Dall'impianto alla proposta: componenti, produzione stimata e piano economico.",
    topics: ["Pannelli", "Accumulo", "Risparmio"] },
  ristrutturazione: { title: "Ristrutturazione", image: "/cover-stock/ristrutturazione/2-thumb.jpg",
    summary: "Presenta un progetto completo, con lavorazioni e materiali organizzati per capitoli.",
    topics: ["Computo metrico", "Materiali", "Manodopera"] },
  bagni: { title: "Bagni", image: "/cover-stock/bagni/2-thumb.jpg",
    summary: "Una proposta coordinata per il nuovo bagno: finiture, sanitari e lavori.",
    topics: ["Sanitari", "Rivestimenti", "Impianti"] },
  tetti: { title: "Tetti", image: "/cover-stock/tetti/1-thumb.jpg",
    summary: "Raccogli le voci del rifacimento, dalla copertura all'isolamento e alla lattoneria.",
    topics: ["Coperture", "Isolamento", "Lattoneria"] },
  climatizzazione: { title: "Climatizzazione", image: "/cover-stock/climatizzazione/1-thumb.jpg",
    summary: "Prepara l'offerta per climatizzatori, unità interne ed esterne e installazione.",
    topics: ["Split e multisplit", "Linee frigo", "Installazione"] },
  elettrico: { title: "Elettrico e domotica", image: "/cover-stock/elettrico/1-thumb.jpg",
    summary: "Rendi leggibile l'intervento: punti luce, quadri, linee e soluzioni domotiche.",
    topics: ["Punti luce", "Quadri", "Domotica"] },
  termoidraulico: { title: "Termoidraulico", image: "/cover-stock/termoidraulico/1-thumb.jpg",
    summary: "Componi la proposta per riscaldamento e idrosanitario, con materiali e lavorazioni.",
    topics: ["Caldaie", "Pompe di calore", "Idrosanitario"] },
  pavimenti: { title: "Pavimenti e resine", image: "/cover-stock/pavimenti/1-thumb.jpg",
    summary: "Dalla preparazione del fondo alla finitura: quantità, materiali e posa.",
    topics: ["Gres e parquet", "Resine", "Posa"] },
  piscine: { title: "Piscine", image: "/cover-stock/piscine/1-thumb.jpg",
    summary: "Organizza scavo, struttura, impianti e accessori in un'offerta completa.",
    topics: ["Struttura", "Filtrazione", "Accessori"] },
  cappotto: { title: "Cappotto termico", summary: "Un modulo dedicato all'isolamento esterno dell'edificio.",
    topics: ["Facciate", "Isolamento"] },
  pompe_calore: { title: "Pompe di calore", summary: "Un percorso dedicato agli impianti di riscaldamento ad alta efficienza.",
    topics: ["Riscaldamento", "Efficienza"] },
};

export type ModuleFilter = "tutti" | "attivo" | "bloccato" | "coming_soon";
export function parseModuleFilter(value: string | null): ModuleFilter {
  return value === "attivo" || value === "bloccato" || value === "coming_soon" ? value : "tutti";
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it-IT");

export function filterSalesModules(views: ModuloVenditaView[], query: string, filter: ModuleFilter) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return views.filter((view) => {
    // Errori di verifica non sono moduli da acquistare né accessi confermati.
    if (filter !== "tutti" && (view.isError || view.stato !== filter)) return false;
    const content = MODULE_PRESENTATION[view.modulo.slug];
    const searchable = normalize([content.title, content.summary, ...content.topics, view.modulo.tagline].join(" "));
    return words.every((word) => searchable.includes(word));
  });
}
