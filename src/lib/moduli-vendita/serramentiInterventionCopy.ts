import type { SrTemplatePdfRow } from "@/types/serramenti";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { findSerramentiTemplateModule, type SerramentiTemplateModuleId } from "./serramentiTemplateModules";

export function serramentiCopyChoices(id: SerramentiTemplateModuleId, defaults: Partial<SrTemplatePdfRow>): InterventionCopyChoice[] {
  const module = findSerramentiTemplateModule(id)!;
  const text = (key: string, section: string, label: string, field: string, value: string): InterventionCopyChoice => ({ id: key, section, label, preview: value, patch: { [field]: value } });
  const items = (key: string, section: string, label: string, field: string, values: Array<{ titolo: string; descrizione: string }>): InterventionCopyChoice => ({ id: key, section, label, preview: values.map(v => `${v.titolo}\n${v.descrizione}`).join("\n\n"), patch: { [field]: values } });
  return [
    text("cover-editoriale", "Titolo copertina", "Editoriale", "pdf_cover_hero", defaults.pdf_cover_hero || module.title),
    text("cover-essenziale", "Titolo copertina", "Essenziale", "pdf_cover_hero", `${module.title}\nsu misura per casa tua.`),
    text("cover-tecnica", "Titolo copertina", "Tecnica", "pdf_cover_hero", `${module.title}\nLa proposta, vano per vano.`),
    items("esigenze-complete", "Esigenze", "Consulenziale", "esigenze_default", defaults.esigenze_default || []),
    items("esigenze-sintetiche", "Esigenze", "Domande guida", "esigenze_default", module.needs.map(titolo => ({ titolo, descrizione: "Confermiamo questo punto nel rilievo e nel riepilogo delle scelte, per ciascuna apertura interessata." }))),
    items("soluzione-completa", "Soluzione", "Consulenziale", "soluzione_default", defaults.soluzione_default || []),
    items("soluzione-tecnica", "Soluzione", "Per lavorazioni", "soluzione_default", module.works.map(titolo => ({ titolo, descrizione: "Quantità, configurazione e ambito sono quelli indicati nelle voci dell'offerta. Le opere aggiuntive richiedono conferma separata." }))),
    text("cta-consulenziale", "Titolo finale", "Consulenziale", "pdf_cta_finale_titolo", defaults.pdf_cta_finale_titolo || "Definiamo il prossimo passo"),
    text("cta-diretta", "Titolo finale", "Diretta", "pdf_cta_finale_titolo", "Rivediamo le scelte.\nConcordiamo il prossimo passo."),
    text("sottotitolo", "Sottotitolo copertina", "Descrittiva", "pdf_cover_subhero", module.summary),
  ];
}
