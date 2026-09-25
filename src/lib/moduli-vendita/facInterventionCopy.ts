import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { FAC_EDITORIAL } from "./facEditorialContent";
import { FAC_MODULE_TITLES, type FullFacModuleId, type FullFacTemplate } from "./fullFacModules";

export function facCopyChoices(id: FullFacModuleId, defaults: FullFacTemplate): InterventionCopyChoice[] {
  const choice = (key: string, section: string, label: string, field: string, value: unknown, preview: string): InterventionCopyChoice => ({ id: key, section, label, patch: { [field]: value }, preview });
  const list = (field: "esigenze" | "soluzione" | "percorso") => choice(field, field === "esigenze" ? "Esigenze" : field === "soluzione" ? "Soluzione" : "Come lavoriamo", "Completo", field, defaults[field], defaults[field].map(v => `${v.titolo}\n${v.descrizione}`).join("\n\n"));
  return [
    choice("titolo-editoriale", "Titolo copertina", "Editoriale", "cover_title", defaults.cover_title, defaults.cover_title || ""),
    choice("titolo-diretto", "Titolo copertina", "Diretto", "cover_title", FAC_MODULE_TITLES[id], FAC_MODULE_TITLES[id]),
    choice("sottotitolo-completo", "Sottotitolo", "Completo", "cover_subtitle", defaults.cover_subtitle, defaults.cover_subtitle || ""),
    choice("sottotitolo-breve", "Sottotitolo", "Essenziale", "cover_subtitle", FAC_EDITORIAL[id].short, FAC_EDITORIAL[id].short),
    list("esigenze"), list("soluzione"), list("percorso"),
    choice("faq", "Domande e risposte", "Otto risposte", "faq", defaults.faq, defaults.faq.map(v => `${v.domanda}\n${v.risposta}`).join("\n\n")),
  ];
}
