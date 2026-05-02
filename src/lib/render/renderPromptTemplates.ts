export type RenderPromptTemplate = {
  id: string;
  category: string;
  title: string;
  description: string;
  basePrompt: string;
  requiredImages: string;
  expectedOutput: string;
  qualityNotes: string[];
};

export const renderPromptTemplates: RenderPromptTemplate[] = [
  {
    id: "serramenti",
    category: "Aperture",
    title: "Serramenti e infissi",
    description: "Sostituzione finestre e porte mantenendo facciata, vani, soglie e proporzioni reali.",
    basePrompt: "Sostituisci solo i serramenti selezionati con profili coerenti, mantenendo facciata, prospettiva, vetri, soglie e contesto.",
    requiredImages: "Foto frontale o tre quarti con aperture leggibili.",
    expectedOutput: "Render realistico prima/dopo pronto per proposta commerciale.",
    qualityNotes: ["Non cambiare murature", "Non inventare nuove aperture", "Mantieni scala e riflessi credibili"],
  },
  {
    id: "bagni",
    category: "Interni",
    title: "Bagno completo",
    description: "Restyling bagno con vincoli su sanitari, rivestimenti, scarichi e punti funzionali.",
    basePrompt: "Rinnova il bagno mantenendo geometria e punti funzionali; applica rivestimenti e sanitari scelti senza duplicazioni.",
    requiredImages: "Foto ampia del bagno con pavimento, pareti e sanitari visibili.",
    expectedOutput: "Render coerente per preventivo bagno chiavi in mano.",
    qualityNotes: ["Scarichi e sanitari fermi", "Fughe coerenti", "Niente arredi casuali"],
  },
  {
    id: "ristrutturazioni",
    category: "Multi-sistema",
    title: "Ristrutturazione completa",
    description: "Intervento su più superfici con priorità ai vincoli architettonici reali.",
    basePrompt: "Esegui una ristrutturazione realistica della scena preservando struttura, aperture, profondità e zone non interessate.",
    requiredImages: "Foto luminosa della stanza o facciata completa.",
    expectedOutput: "Immagine commerciale completa con prima/dopo leggibile.",
    qualityNotes: ["Preserva architettura", "Coordina materiali", "Evita cambi non richiesti"],
  },
  {
    id: "facciate",
    category: "Involucro",
    title: "Facciata e cappotto",
    description: "Rinnovo esterno con intonaco, cappotto, zoccolature e dettagli costruttivi.",
    basePrompt: "Rinnova solo la facciata target con finitura scelta, preservando aperture, balconi, tetto e contesto.",
    requiredImages: "Foto edificio intero o porzione con prospetto leggibile.",
    expectedOutput: "Render facciata realistico per scelta colore/materiale.",
    qualityNotes: ["Aperture preservate", "Spessori plausibili", "Contesto invariato"],
  },
  {
    id: "tetti",
    category: "Involucro",
    title: "Tetto e fotovoltaico",
    description: "Nuova copertura, lattonerie, lucernari o pannelli mantenendo falde reali.",
    basePrompt: "Sostituisci il sistema tetto rispettando falde, colmi, gronde, ombre e integrazione con fotovoltaico se richiesto.",
    requiredImages: "Foto con falde e bordo tetto visibili.",
    expectedOutput: "Render tecnico-commerciale del nuovo tetto.",
    qualityNotes: ["Falde ferme", "Pannelli installabili", "Lattonerie coerenti"],
  },
  {
    id: "outdoor",
    category: "Outdoor",
    title: "Pergole, piscine e giardini",
    description: "Trasformazione esterna con strutture, verde, pavimentazioni e ombre credibili.",
    basePrompt: "Inserisci l'intervento outdoor richiesto mantenendo facciata, pavimento, prospettiva, accessi e scala reale.",
    requiredImages: "Foto esterna ampia con area di posa ben visibile.",
    expectedOutput: "Render emozionale ma installabile per proposta cliente.",
    qualityNotes: ["Strutture ancorate", "Ombre coerenti", "Nessun cambio di edificio"],
  },
];
