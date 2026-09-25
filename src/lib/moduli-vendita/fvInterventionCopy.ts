import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import type { FullFvTemplate } from "./fullFvModules";

export function accumuloCopyChoices(defaults: FullFvTemplate): InterventionCopyChoice[] {
  const text = (id: string, section: string, label: string, field: string, value: string): InterventionCopyChoice => ({ id, section, label, preview: value.replace(/<[^>]*>/g, " ").trim(), patch: { [field]: value } });
  if (defaults.pdf_blocchi?.modulo_intervento !== "accumulo") return [
    text("cover-editoriale", "Titolo copertina", "Editoriale", "pdf_cover_hero", defaults.pdf_cover_hero || "La tua proposta"),
    text("cover-essenziale", "Titolo copertina", "Essenziale", "pdf_cover_hero", defaults.pdf_cover_eyebrow || "Fotovoltaico"),
    text("cover-consulenziale", "Titolo copertina", "Consulenziale", "pdf_cover_hero", "Le tue esigenze.\nUna proposta dedicata."),
    text("sottotitolo", "Sottotitolo", "Specifico", "pdf_cover_subhero", defaults.pdf_cover_subhero || ""),
    text("percorso", "Percorso", "Specifico", "percorso_cliente_intro", defaults.percorso_cliente_intro || ""),
    text("valore", "Perimetro", "Dettagliato", "valore_proposta_html", defaults.valore_proposta_html || ""),
    text("referente", "Referente", "Pratico", "consulente_descrizione_default", defaults.consulente_descrizione_default || ""),
    text("cta", "Prossimo passo", "Specifico", "pdf_cta_finale_testo", defaults.pdf_cta_finale_testo || ""),
    text("cta-breve", "Prossimo passo", "Essenziale", "pdf_cta_finale_testo", "<p>Controlliamo insieme attività, componenti e condizioni. Segnala le modifiche desiderate prima della conferma.</p>"),
    text("cta-titolo", "Titolo finale", "Diretto", "pdf_cta_finale_titolo", "Definiamo insieme\nil prossimo passo."),
  ];
  return [
    text("cover-consulenziale", "Titolo copertina", "Consulenziale", "pdf_cover_hero", "Più spazio alla tua\nenergia solare."),
    text("cover-essenziale", "Titolo copertina", "Essenziale", "pdf_cover_hero", "Il tuo sistema\ndi accumulo."),
    text("cover-tecnica", "Titolo copertina", "Tecnica", "pdf_cover_hero", "Integrazione accumulo\nsu impianto esistente."),
    text("percorso-consulenziale", "Percorso", "Consulenziale", "percorso_cliente_intro", defaults.percorso_cliente_intro || ""),
    text("percorso-essenziale", "Percorso", "Essenziale", "percorso_cliente_intro", "<p>Verifichiamo ciò che hai già, concordiamo la configurazione e definiamo le lavorazioni. Prima dell'installazione confermiamo compatibilità, posizione, dotazioni e condizioni.</p>"),
    text("valore-tecnica", "Proposta di valore", "Dettagliata", "valore_proposta_html", defaults.valore_proposta_html || ""),
    text("valore-essenziale", "Proposta di valore", "Essenziale", "valore_proposta_html", "<p>L'offerta riguarda l'aggiunta della batteria e delle voci elencate. Nuovi pannelli, sostituzione dell'inverter e funzione di emergenza non sono inclusi automaticamente. Il beneficio aggiuntivo va valutato rispetto al tuo impianto attuale.</p>"),
    text("referente", "Referente", "Pratica", "consulente_descrizione_default", "Hai un dubbio su compatibilità, capacità o dotazioni? Confrontalo con il referente prima di confermare: ogni funzione prevista deve essere riconoscibile nell'offerta."),
    text("cta-consulenziale", "Prossimo passo", "Consulenziale", "pdf_cta_finale_testo", defaults.pdf_cta_finale_testo || ""),
    text("cta-essenziale", "Prossimo passo", "Essenziale", "pdf_cta_finale_testo", "<p>Rivediamo insieme componenti, lavorazioni, prezzo e condizioni. La conferma riguarda soltanto l'integrazione descritta e le funzioni esplicitamente incluse.</p>"),
  ];
}
