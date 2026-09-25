import type { RstTemplatePdf, RstListItem } from "@/types/ristrutturazione";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { RST_MODULE_TITLES, type FullRstModuleId } from "./fullRstModules";
export function rstCopyChoices(id: FullRstModuleId, defaults: RstTemplatePdf): InterventionCopyChoice[] {
  const choice = (id: string, section: string, label: string, field: string, value: string | RstListItem[]): InterventionCopyChoice => ({
    id, section, label, patch: { [field]: value },
    preview: typeof value === "string" ? value : value.map(v => [v.titolo, v.descrizione].filter(Boolean).join("\n")).join("\n\n"),
  });
  return [
    choice("titolo-editoriale", "Titolo copertina", "Editoriale", "cover_title", defaults.cover_title || ""),
    choice("titolo-diretto", "Titolo copertina", "Diretto", "cover_title", RST_MODULE_TITLES[id]),
    choice("sottotitolo-completo", "Sottotitolo", "Completo", "cover_subtitle", defaults.cover_subtitle || ""),
    choice("sottotitolo-essenziale", "Sottotitolo", "Essenziale", "cover_subtitle", id === "computo" ? "Lavorazioni, quantità e prezzi. Il tuo intervento, voce per voce." : id === "spazi" ? "Nuova disposizione, opere connesse e ripristini: ogni scelta ha il suo perimetro." : id === "commerciale" ? "Il tuo locale, zona per zona. Opere, accessi e fasi concordate." : id === "parziale" ? "Le zone da rinnovare. Le parti da conservare. Un perimetro chiaro." : "Opere, impianti e finiture: la tua proposta, ambiente per ambiente."),
    choice("esigenze-complete", "Esigenze", "Consulenziale", "esigenze", defaults.esigenze),
    choice("esigenze-brevi", "Esigenze", "Essenziale", "esigenze", id === "computo" ? [
      { titolo: "Lavorazioni", descrizione: "Descrizioni e ambiti riconoscibili per ogni voce." },
      { titolo: "Quantità e prezzi", descrizione: "Unità di misura, importi e riepilogo distinti." },
      { titolo: "Revisioni", descrizione: "Parti escluse e modifiche da confermare." },
    ] : id === "spazi" ? [
      { titolo: "Distribuzione", descrizione: "Ambienti e passaggi collegati alle esigenze reali." },
      { titolo: "Interferenze", descrizione: "Parti interessate e verifiche da definire sul caso concreto." },
      { titolo: "Ripristini", descrizione: "Raccordi e finiture esplicitati, non presunti." },
    ] : id === "commerciale" ? [
      { titolo: "Attività", descrizione: "Funzioni, postazioni e zone da rinnovare." },
      { titolo: "Operatività", descrizione: "Accessi e possibili interruzioni da concordare." },
      { titolo: "Perimetro", descrizione: "Opere, allestimento e incarichi separati." },
    ] : id === "parziale" ? [
      { titolo: "Dove intervenire", descrizione: "Ambienti e superfici da rinnovare, con quantità riconoscibili." },
      { titolo: "Cosa mantenere", descrizione: "Parti conservate e percorsi da proteggere." },
      { titolo: "Come raccordare", descrizione: "Nuove finiture e ripristini limitati all'ambito concordato." },
    ] : [
      { titolo: "Ambienti", descrizione: "Definire cosa cambiare e cosa conservare." },
      { titolo: "Scelte", descrizione: "Confermare materiali, impianti e finiture." },
      { titolo: "Investimento", descrizione: "Leggere quantità, esclusioni e condizioni." },
    ]),
    choice("soluzione-completa", "Soluzione", "Consulenziale", "soluzione", defaults.soluzione),
    choice("soluzione-breve", "Soluzione", "Essenziale", "soluzione", id === "computo" ? [
      { titolo: "Capitoli chiari", descrizione: "Voci raggruppate per lavorazione e ambito." },
      { titolo: "Importi leggibili", descrizione: "Dettaglio delle opere e riepilogo economico coerenti." },
      { titolo: "Conferme scritte", descrizione: "Perimetro e varianti riconoscibili nelle revisioni." },
    ] : id === "spazi" ? [
      { titolo: "Layout condiviso", descrizione: "Pareti, aperture e parti conservate riconoscibili." },
      { titolo: "Opere collegate", descrizione: "Impianti e ripristini riferiti alle sole zone interessate." },
      { titolo: "Consegna mirata", descrizione: "Riscontri e documenti del perimetro effettivamente eseguito." },
    ] : id === "commerciale" ? [
      { titolo: "Layout definito", descrizione: "Lavorazioni collegate alle zone e alle funzioni previste." },
      { titolo: "Fasi concordate", descrizione: "Calendario legato alla disponibilità delle aree e delle forniture." },
      { titolo: "Consegna distinta", descrizione: "Riscontri delle opere separati dagli adempimenti dell'attività." },
    ] : id === "parziale" ? [
      { titolo: "Zone definite", descrizione: "Voci e quantità riferite alle sole zone interessate." },
      { titolo: "Scelte confermate", descrizione: "Materiali e raccordi valutati rispetto all'esistente." },
      { titolo: "Consegna mirata", descrizione: "Riscontri sulle opere comprese, non sull'intero immobile." },
    ] : [
      { titolo: "Perimetro", descrizione: "Lavorazioni e ambienti identificati nel computo." },
      { titolo: "Coordinamento", descrizione: "Decisioni e fasi collegate alla disponibilità delle forniture." },
      { titolo: "Consegna", descrizione: "Riscontri, documentazione e attività residue concordate." },
    ]),
    choice("percorso", "Percorso", "Quattro fasi", "percorso", defaults.percorso),
    choice("usp", "Perché sceglierci", "Trasparenza", "usp", defaults.usp),
  ];
}
