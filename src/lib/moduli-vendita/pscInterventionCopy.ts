import type { PisTemplatePdf } from "@/types/piscine";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { PSC_EDITORIAL, PSC_MODULE_TITLES, type FullPscModuleId } from "./fullPscModules";

export function pscCopyChoices(id: FullPscModuleId, template: PisTemplatePdf): InterventionCopyChoice[] {
  const content = PSC_EDITORIAL[id];
  const lists = ["esigenze", "soluzione", "usp", "percorso", "garanzie"] as const;
  const labels = { esigenze: "Esigenze", soluzione: "Soluzione", usp: "Perché sceglierci", percorso: "Percorso", garanzie: "Garanzie" };
  return [
    { id: "cover-editoriale", section: "Copertina", label: "Racconto della piscina", preview: `${content.hero}\n${content.subtitle}`, patch: { cover_title: content.hero, cover_subtitle: content.subtitle } },
    { id: "cover-diretta", section: "Copertina", label: "Proposta essenziale", preview: `${PSC_MODULE_TITLES[id]}\nLa configurazione, le opere e le condizioni della tua proposta.`, patch: { cover_title: PSC_MODULE_TITLES[id], cover_subtitle: "La configurazione, le opere e le condizioni della tua proposta." } },
    ...lists.map(key => ({ id: key, section: labels[key], label: "Completo", preview: template[key].map(item => `${item.titolo}\n${item.descrizione || ""}`).join("\n\n"), patch: { [key]: template[key] } })),
    { id: "faq", section: "Domande frequenti", label: "Otto risposte", preview: template.faq.map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq } },
    { id: "faq-breve", section: "Domande frequenti", label: "Quattro risposte essenziali", preview: template.faq.slice(0, 4).map(item => `${item.domanda}\n${item.risposta}`).join("\n\n"), patch: { faq: template.faq.slice(0, 4) } },
    { id: "programma", section: "Programma", label: "Quattro fasi", preview: template.cronoprogramma.map(item => `${item.fase}\n${item.descrizione}`).join("\n\n"), patch: { cronoprogramma: template.cronoprogramma } },
  ];
}
