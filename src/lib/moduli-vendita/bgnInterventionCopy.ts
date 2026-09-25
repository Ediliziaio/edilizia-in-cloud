import type { BgnTemplatePdf, BgnListItem } from "@/types/bagni";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import { BGN_MODULE_TITLES, type FullBgnModuleId } from "./fullBgnModules";
export function bgnCopyChoices(id: FullBgnModuleId, defaults: BgnTemplatePdf): InterventionCopyChoice[] {
  const choice = (id: string, section: string, label: string, field: string, value: string | BgnListItem[]): InterventionCopyChoice => ({
    id, section, label, patch: { [field]: value }, preview: typeof value === "string" ? value : value.map(v => [v.titolo, v.descrizione].filter(Boolean).join("\n")).join("\n\n"),
  });
  return [
    choice("titolo-editoriale", "Titolo copertina", "Editoriale", "cover_title", defaults.cover_title || ""),
    choice("titolo-diretto", "Titolo copertina", "Diretto", "cover_title", BGN_MODULE_TITLES[id]),
    choice("sottotitolo-completo", "Sottotitolo", "Completo", "cover_subtitle", defaults.cover_subtitle || ""),
    choice("sottotitolo-essenziale", "Sottotitolo", "Essenziale", "cover_subtitle", id === "rinnovo" ? "Colori e dettagli per un nuovo aspetto. Finiture, preparazioni e parti conservate in chiaro." : id === "accessibilita" ? "Adattare il bagno alle esigenze d'uso. Spazi, dotazioni e verifiche in chiaro." : id === "sanitari" ? "Nuovi sanitari e rubinetti. Prodotti, compatibilità e montaggio in chiaro." : id === "doccia" ? "Rinnovare la doccia esistente. Supporti, finiture e dotazioni in chiaro." : id === "vasca-doccia" ? "La tua nuova zona doccia. Configurazione, raccordi e parti conservate in chiaro." : "Il tuo bagno, dalle predisposizioni alle finiture. Scelte e opere in chiaro."),
    choice("esigenze-complete", "Esigenze", "Consulenziale", "esigenze", defaults.esigenze),
    choice("esigenze-brevi", "Esigenze", "Essenziale", "esigenze", id === "rinnovo" ? [
      { titolo: "Atmosfera", descrizione: "Colori, finiture e dettagli da coordinare." },
      { titolo: "Parti conservate", descrizione: "Impianti e dotazioni che restano invariati." },
      { titolo: "Supporti", descrizione: "Condizioni e compatibilità da verificare prima delle finiture." },
    ] : id === "accessibilita" ? [
      { titolo: "Utilizzo", descrizione: "Gesti quotidiani e priorità personali da condividere." },
      { titolo: "Spazi", descrizione: "Accessi, ingombri e supporti da verificare sul posto." },
      { titolo: "Scelte", descrizione: "Dotazioni e opere da definire per il bagno reale." },
    ] : id === "sanitari" ? [
      { titolo: "Prodotti", descrizione: "Apparecchi e finiture da sostituire o conservare." },
      { titolo: "Compatibilità", descrizione: "Misure, scarichi e collegamenti da verificare." },
      { titolo: "Montaggio", descrizione: "Forniture e lavorazioni comprese nella proposta." },
    ] : id === "doccia" ? [
      { titolo: "Doccia esistente", descrizione: "Parti da sostituire e dotazioni da conservare." },
      { titolo: "Supporti e superfici", descrizione: "Condizioni da verificare prima delle nuove finiture." },
      { titolo: "Ambito", descrizione: "Raccordi e confini con il resto del bagno." },
    ] : id === "vasca-doccia" ? [
      { titolo: "Nuovo utilizzo", descrizione: "Una doccia scelta sulle misure della zona vasca." },
      { titolo: "Parti conservate", descrizione: "Sanitari e superfici esterni al perimetro dell'intervento." },
      { titolo: "Configurazione", descrizione: "Piatto, chiusura, attacchi e raccordi da confermare." },
    ] : [
      { titolo: "Spazio", descrizione: "Configurazione e dotazioni adatte al bagno reale." },
      { titolo: "Opere", descrizione: "Parti da rimuovere, modificare e conservare." },
      { titolo: "Organizzazione", descrizione: "Scelte, accessi e interruzioni da concordare." },
    ]),
    choice("soluzione-completa", "Soluzione", "Consulenziale", "soluzione", defaults.soluzione),
    choice("soluzione-breve", "Soluzione", "Essenziale", "soluzione", id === "rinnovo" ? [
      { titolo: "Palette definita", descrizione: "Campioni e riferimenti confermati prima dei lavori." },
      { titolo: "Opere mirate", descrizione: "Preparazioni e applicazioni delle superfici indicate." },
      { titolo: "Dettagli chiari", descrizione: "Prodotti, montaggi e indicazioni di cura riconoscibili." },
    ] : id === "accessibilita" ? [
      { titolo: "Configurazione condivisa", descrizione: "Posizioni e modalità di utilizzo da confermare." },
      { titolo: "Adattamenti definiti", descrizione: "Prodotti, supporti e montaggi esplicitamente previsti." },
      { titolo: "Riscontri pertinenti", descrizione: "Istruzioni e verifiche dell'intervento concordato." },
    ] : id === "sanitari" ? [
      { titolo: "Scelte confermate", descrizione: "Modelli e accessori individuati prima dell'ordine." },
      { titolo: "Opere mirate", descrizione: "Smontaggi, montaggi e raccordi delle sole dotazioni previste." },
      { titolo: "Consegna chiara", descrizione: "Riscontri e istruzioni dei prodotti installati." },
    ] : id === "doccia" ? [
      { titolo: "Rilievo mirato", descrizione: "Misure e condizioni della doccia da rinnovare." },
      { titolo: "Opere collegate", descrizione: "Smontaggi, supporti, finiture e montaggi descritti." },
      { titolo: "Consegna chiara", descrizione: "Riscontri e istruzioni delle parti rinnovate." },
    ] : id === "vasca-doccia" ? [
      { titolo: "Rilievo mirato", descrizione: "Misure e condizioni della zona da trasformare." },
      { titolo: "Opere delimitate", descrizione: "Rimozione vasca, predisposizioni e finiture descritte." },
      { titolo: "Dotazioni definite", descrizione: "Prodotti e riscontri della nuova zona doccia." },
    ] : [
      { titolo: "Scelte definite", descrizione: "Posizioni, materiali e prodotti riconoscibili." },
      { titolo: "Fasi coordinate", descrizione: "Impianti, supporti e finiture collegati alle opere previste." },
      { titolo: "Consegna chiara", descrizione: "Riscontri e documenti dell'intervento realizzato." },
    ]),
    choice("percorso", "Percorso", "Quattro fasi", "percorso", defaults.percorso),
    choice("usp", "Perché sceglierci", "Trasparenza", "usp", defaults.usp),
  ];
}
