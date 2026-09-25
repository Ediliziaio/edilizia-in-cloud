import type { EleTemplatePdf } from "@/types/elettrico";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { ELT_EDITORIAL, ELT_MODULE_TITLES, type FullEltModuleId } from "./fullEltModules";

export function eltCopyChoices(id: FullEltModuleId, template: EleTemplatePdf): InterventionCopyChoice[] {
  const content = ELT_EDITORIAL[id];
  const lists = ["esigenze", "soluzione", "usp", "percorso", "garanzie"] as const;
  const labels = { esigenze: "Esigenze", soluzione: "Soluzione", usp: "Perché sceglierci", percorso: "Percorso", garanzie: "Garanzie" };
  return [
    { id: "cover-editoriale", section: "Copertina", label: "Funzioni e utilizzo", preview: `${content.hero}\n${content.subtitle}`, patch: { cover_title: content.hero, pdf_cover_hero: content.hero, cover_subtitle: content.subtitle, pdf_cover_subhero: content.subtitle } },
    { id: "cover-diretta", section: "Copertina", label: "Proposta essenziale", preview: `${ELT_MODULE_TITLES[id]}\nLa configurazione, le opere e le condizioni della tua proposta.`, patch: { cover_title: ELT_MODULE_TITLES[id], pdf_cover_hero: ELT_MODULE_TITLES[id], cover_subtitle: "La configurazione, le opere e le condizioni della tua proposta.", pdf_cover_subhero: "La configurazione, le opere e le condizioni della tua proposta." } },
    ...lists.map(key => ({ id: key, section: labels[key], label: "Completo", preview: template[key].map(item => `${item.titolo}\n${item.descrizione || ""}`).join("\n\n"), patch: { [key]: template[key] } })),
    { id: "faq", section: "Domande frequenti", label: "Otto risposte", preview: template.faq.map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq } },
    { id: "faq-breve", section: "Domande frequenti", label: "Quattro risposte essenziali", preview: template.faq.slice(0, 4).map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq.slice(0, 4) } },
    { id: "programma", section: "Programma", label: "Quattro fasi", preview: template.cronoprogramma.map(item => `${item.fase}\n${item.descrizione}`).join("\n\n"), patch: { cronoprogramma: template.cronoprogramma } },
  ];
}
