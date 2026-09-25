import type { TetListItem, TetTemplatePdf } from "@/types/tetti";
import type { InterventionCopyChoice } from "@/components/preventivi/modules/InterventionTextPicker";
import type { TettiTemplateModuleId } from "./tettiTemplateModules";

export function tettiCopyChoices(id: TettiTemplateModuleId, defaults: TetTemplatePdf): InterventionCopyChoice[] {
  if (id === "ripasso") return ripassoCopyChoices(defaults);
  if (id === "riparazioni" || id === "isolamento" || id === "impermeabilizzazione" || id === "lattoneria") return focusedTettiCopyChoices(id, defaults);
  if (id !== "rifacimento") return [];
  const text = (id: string, section: string, label: string, field: string, value: string): InterventionCopyChoice => ({ id, section, label, patch: { [field]: value }, preview: value });
  const list = (id: string, section: string, label: string, field: string, values: TetListItem[]): InterventionCopyChoice => ({ id, section, label, patch: { [field]: values }, preview: values.map(v => [v.titolo, v.descrizione].filter(Boolean).join("\n")).join("\n\n") });
  return [
    text("cover-editoriale", "Titolo copertina", "Editoriale", "cover_title", defaults.cover_title),
    text("cover-tecnica", "Titolo copertina", "Tecnico", "cover_title", "Rifacimento della *copertura*"),
    text("subtitle-completo", "Sottotitolo", "Completo", "cover_subtitle", defaults.cover_subtitle || ""),
    text("subtitle-diretto", "Sottotitolo", "Diretto", "cover_subtitle", "Falde, strati, materiali e raccordi: il tuo intervento, voce per voce."),
    list("esigenze-complete", "Esigenze", "Consulenziale", "esigenze", defaults.esigenze),
    list("esigenze-brevi", "Esigenze", "Essenziale", "esigenze", [
      { titolo: "Stato del tetto", descrizione: "Conoscere supporto, manto e punti critici prima delle scelte." },
      { titolo: "Soluzione definita", descrizione: "Sapere quali strati e materiali sono previsti dal progetto." },
      { titolo: "Casa e cantiere", descrizione: "Concordare accessi, fasi e protezioni degli spazi." },
    ]),
    list("soluzione-completa", "Soluzione", "Consulenziale", "soluzione", defaults.soluzione),
    list("soluzione-breve", "Soluzione", "Tecnica", "soluzione", [
      { titolo: "Falde e rimozioni", descrizione: "Identificare superfici e componenti conservati o rimossi." },
      { titolo: "Stratigrafia e dettagli", descrizione: "Specificare prodotti, manto e raccordi secondo il progetto." },
      { titolo: "Computo e fasi", descrizione: "Collegare quantità, inclusioni e sequenza delle opere." },
    ]),
    list("percorso-completo", "Percorso", "Quattro fasi", "percorso", defaults.percorso),
    list("usp-complete", "Perché sceglierci", "Trasparenza", "usp", defaults.usp),
  ];
}

function focusedTettiCopyChoices(id: "riparazioni" | "isolamento" | "impermeabilizzazione" | "lattoneria", defaults: TetTemplatePdf): InterventionCopyChoice[] {
  const alternatives = id === "riparazioni" ? {
    title: "Riparazioni e infiltrazioni", subtitle: "La zona da verificare, le opere previste e i limiti dell'intervento.",
    needs: [
      ["Segni e informazioni", "Raccogliere ciò che si osserva, senza anticipare una causa non verificata."],
      ["Zona da indagare", "Definire accessibilità e approfondimenti prima della riparazione."],
      ["Limiti chiari", "Distinguere le parti trattate dal resto della copertura."],
    ],
    solution: [
      ["Verifichiamo", "Sopralluogo e indagini concordate, con esiti e limitazioni."],
      ["Definiamo", "Opere, componenti e quantità della zona individuata."],
      ["Riscontriamo", "Verifiche finali e ulteriori attività quando previste."],
    ],
  } : id === "isolamento" ? {
    title: "Isolamento tetto e sottotetto", subtitle: "Superfici, materiali e raccordi: la soluzione, senza promesse generiche.",
    needs: [
      ["Dove intervenire", "Falde e solaio del sottotetto sono ambiti da distinguere."],
      ["Quale sistema", "Materiali e spessori si definiscono insieme ai dettagli del progetto."],
      ["Quali opere", "Riconoscere preparazioni, posa, finiture e parti escluse."],
    ],
    solution: [
      ["Perimetro", "Superfici interessate e condizioni del supporto da verificare."],
      ["Configurazione", "Prodotti, spessori e raccordi della soluzione approvata."],
      ["Consegna", "Riscontro delle opere e documenti dei materiali utilizzati."],
    ],
  } : id === "impermeabilizzazione" ? {
    title: "Coperture piane e terrazzi", subtitle: "Supporto, superficie e raccordi: il sistema, le opere e le finiture previste.",
    needs: [
      ["Stato del supporto", "Conoscere le parti accessibili e gli approfondimenti necessari."],
      ["Destinazione", "Distinguere copertura tecnica e terrazzo con finiture praticabili."],
      ["Dettagli", "Identificare bordi, soglie, attraversamenti e scarichi interessati."],
    ],
    solution: [
      ["Preparazione", "Rimozioni e supporti definiti nella proposta confermata."],
      ["Sistema", "Strati, materiali e raccordi identificati per la superficie prevista."],
      ["Consegna", "Controlli, documenti e indicazioni d'uso pertinenti alla soluzione."],
    ],
  } : {
    title: "Grondaie e lattoneria", subtitle: "Tratti, materiali, raccordi e accessori: la fornitura, senza sottintesi.",
    needs: [
      ["Tratti interessati", "Sapere quali elementi vengono conservati o sostituiti."],
      ["Materiali e aspetto", "Definire finiture e raccordi con le parti esistenti."],
      ["Quantità", "Distinguere sviluppi, pezzi speciali e accessori compresi."],
    ],
    solution: [
      ["Rilievo", "Identificazione di canali, discese, raccordi e accessi necessari."],
      ["Configurazione", "Materiali e componenti confermati prima della fornitura."],
      ["Riscontro", "Verifiche concordate e riepilogo degli elementi realizzati."],
    ],
  };
  const list = (values: string[][]) => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const choice = (id: string, section: string, label: string, field: string, value: string | TetListItem[]): InterventionCopyChoice => ({
    id, section, label, patch: { [field]: value },
    preview: typeof value === "string" ? value : value.map(v => [v.titolo, v.descrizione].filter(Boolean).join("\n")).join("\n\n"),
  });
  return [
    choice("titolo-editoriale", "Titolo copertina", "Editoriale", "cover_title", defaults.cover_title),
    choice("titolo-diretto", "Titolo copertina", "Diretto", "cover_title", alternatives.title),
    choice("sottotitolo-completo", "Sottotitolo", "Completo", "cover_subtitle", defaults.cover_subtitle || ""),
    choice("sottotitolo-essenziale", "Sottotitolo", "Essenziale", "cover_subtitle", alternatives.subtitle),
    choice("esigenze-complete", "Esigenze", "Consulenziale", "esigenze", defaults.esigenze),
    choice("esigenze-brevi", "Esigenze", "Essenziale", "esigenze", list(alternatives.needs)),
    choice("soluzione-completa", "Soluzione", "Consulenziale", "soluzione", defaults.soluzione),
    choice("soluzione-breve", "Soluzione", "Essenziale", "soluzione", list(alternatives.solution)),
    choice("percorso", "Percorso", "Quattro fasi", "percorso", defaults.percorso),
    choice("usp", "Perché sceglierci", "Trasparenza", "usp", defaults.usp),
  ];
}

/** Each variant is specific to conservative roof maintenance, not full re-roofing. */
export function ripassoCopyChoices(defaults: TetTemplatePdf): InterventionCopyChoice[] {
  const list = (id: string, section: string, label: string, field: string, values: TetListItem[]): InterventionCopyChoice => ({
    id, section, label, patch: { [field]: values }, preview: values.map(v => [v.titolo, v.descrizione].filter(Boolean).join("\n")).join("\n\n"),
  });
  return [
    { id: "cover-consulenziale", section: "Copertina", label: "Consulenziale", preview: "Il ripasso del tuo tetto.\nRecuperare il manto riutilizzabile. Intervenire sui punti che ne hanno bisogno.", patch: { cover_title: defaults.cover_title, cover_subtitle: defaults.cover_subtitle } },
    { id: "cover-essenziale", section: "Copertina", label: "Essenziale", preview: "Ripasso del tetto\nRiordino del manto e sostituzioni mirate: l'intervento, voce per voce.", patch: { cover_title: "Ripasso del *tetto*", cover_subtitle: "Riordino del manto e sostituzioni mirate: l'intervento, voce per voce." } },
    { id: "cover-tecnica", section: "Copertina", label: "Tecnica", preview: "Manutenzione del manto di copertura\nZone interessate, elementi recuperati, ricambi e raccordi previsti.", patch: { cover_title: "Manutenzione del *manto di copertura*", cover_subtitle: "Zone interessate, elementi recuperati, ricambi e raccordi previsti." } },
    list("needs-completa", "Esigenze", "Consulenziale", "esigenze", defaults.esigenze),
    list("needs-essenziale", "Esigenze", "Essenziale", "esigenze", [
      { titolo: "Conoscere lo stato del manto", descrizione: "Quali zone richiedono riordino e quali elementi non sono recuperabili?" },
      { titolo: "Sapere cosa resta", descrizione: "Il ripasso mantiene le parti riutilizzabili senza trasformarsi in un rifacimento completo." },
      { titolo: "Leggere un prezzo chiaro", descrizione: "Quantità, ricambi, raccordi e accessi devono avere un perimetro definito." },
    ]),
    list("solution-completa", "Soluzione", "Consulenziale", "soluzione", defaults.soluzione),
    list("solution-tecnica", "Soluzione", "Tecnica", "soluzione", [
      { titolo: "Rilievo delle zone", descrizione: "Identificazione delle falde e dei tratti accessibili; segnalazione delle parti non verificabili." },
      { titolo: "Computo distinto", descrizione: "Separazione tra riordino a superficie, ricambi a elemento e raccordi a sviluppo o a corpo." },
      { titolo: "Riscontro delle opere", descrizione: "Confronto delle quantità eseguite con il computo e registrazione delle varianti concordate." },
    ]),
    list("percorso-completo", "Percorso", "Quattro fasi spiegate", "percorso", defaults.percorso),
    list("percorso-breve", "Percorso", "Essenziale", "percorso", [
      { titolo: "Verifichiamo", descrizione: "Zone interessate, materiali recuperabili e accessi." },
      { titolo: "Concordiamo", descrizione: "Quantità, ricambi, limiti e condizioni dell'offerta." },
      { titolo: "Interveniamo", descrizione: "Riordino e sostituzioni previste, secondo il calendario concordato." },
      { titolo: "Consegniamo", descrizione: "Riscontro delle lavorazioni e indicazioni sulle criticità residue." },
    ]),
    list("usp-complete", "Perché sceglierci", "Trasparenza", "usp", defaults.usp),
    list("usp-brevi", "Perché sceglierci", "Essenziale", "usp", [
      { titolo: "Recupero ragionato", descrizione: "Conservare gli elementi idonei, sostituire quelli previsti." },
      { titolo: "Limiti dichiarati", descrizione: "Ciò che non rientra nel ripasso è indicato separatamente." },
      { titolo: "Nessuna variante implicita", descrizione: "Gli interventi aggiuntivi si definiscono prima di eseguirli." },
    ]),
  ];
}
