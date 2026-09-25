import type { PavTemplatePdf } from "@/types/pavimenti";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { PAV_EDITORIAL, PAV_MODULE_TITLES, type FullPavModuleId } from "./fullPavModules";

export function pavCopyChoices(id: FullPavModuleId, template: PavTemplatePdf): InterventionCopyChoice[] {
  const content = PAV_EDITORIAL[id];
  const lists = ["esigenze", "soluzione", "usp", "percorso", "garanzie"] as const;
  const labels = { esigenze: "Esigenze", soluzione: "Soluzione", usp: "Perché sceglierci", percorso: "Percorso", garanzie: "Garanzie" };
  return [
    { id: "cover-editoriale", section: "Copertina", label: "Racconto della superficie", preview: `${content.hero}\n${content.subtitle}`, patch: { pdf_cover_subhero_template: null, cover_title: content.hero, pdf_cover_hero: content.hero, cover_subtitle: content.subtitle, pdf_cover_subhero: content.subtitle } },
    { id: "cover-diretta", section: "Copertina", label: "Proposta essenziale", preview: `${PAV_MODULE_TITLES[id]}\nMateriali, preparazioni, posa e condizioni della tua proposta.`, patch: { pdf_cover_subhero_template: null, cover_title: PAV_MODULE_TITLES[id], pdf_cover_hero: PAV_MODULE_TITLES[id], cover_subtitle: "Materiali, preparazioni, posa e condizioni della tua proposta.", pdf_cover_subhero: "Materiali, preparazioni, posa e condizioni della tua proposta." } },
    ...lists.map(key => ({ id: key, section: labels[key], label: "Completo", preview: template[key].map(item => `${item.titolo}\n${item.descrizione || ""}`).join("\n\n"), patch: { [key]: template[key] } })),
    { id: "faq", section: "Domande frequenti", label: "Otto risposte", preview: template.faq.map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq } },
    { id: "faq-breve", section: "Domande frequenti", label: "Quattro risposte essenziali", preview: template.faq.slice(0, 4).map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq.slice(0, 4) } },
    { id: "programma", section: "Programma", label: "Quattro fasi", preview: template.cronoprogramma.map(item => `${item.fase}\n${item.descrizione}`).join("\n\n"), patch: { cronoprogramma: template.cronoprogramma } },
  ];
}
