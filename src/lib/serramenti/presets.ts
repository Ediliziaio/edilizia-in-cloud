/**
 * src/lib/serramenti/presets.ts — Template persuasivi settore serramenti.
 *
 * Copy scritto in ottica vendita pro:
 *  - Pain-Agitation-Solution (PAS) per le esigenze
 *  - You-language: parla al cliente, non di sé
 *  - Specificity: numeri concreti, % reali, anni, dB, €
 *  - Loss aversion: cosa stai perdendo se non agisci
 *  - Authority: norme tecniche (UNI 11673), garanzie scritte
 *  - Anti-vague: mai "qualità/esperienza", sempre prove concrete
 *
 * Ogni preset è una variante credibile da personalizzare con i dati
 * reali dell'azienda.
 */
import type { SrEsigenza, SrSoluzioneItem } from "@/types/serramenti";

// ─── Esigenze (PAS — Pain → Agitation → Solution) ───────────────────────────

export const PRESET_ESIGENZE: SrEsigenza[] = [
  {
    titolo: "Spifferi e correnti d'aria",
    descrizione:
      "Se vicino alle finestre senti aria fredda, il problema spesso non è solo il vetro: entrano in gioco telaio, guarnizioni e posa. La proposta prevede serramenti e sigillature scelti per migliorare comfort e tenuta dell'ambiente.",
  },
  {
    titolo: "Condensa e muffa al mattino",
    descrizione:
      "Condensa sui vetri e aloni vicino al foro finestra indicano dispersione, ponti termici o aerazione non corretta. Con vetri più performanti, profili adeguati e una posa curata si riduce il rischio di umidità superficiale.",
  },
  {
    titolo: "Estetica datata della casa",
    descrizione:
      "Il serramento incide molto sulla percezione della casa, sia all'interno sia in facciata. Profili, colori, maniglie e accessori vengono scelti in modo coerente con lo stile dell'abitazione.",
  },
];

export const PRESET_ESIGENZE_ALT: SrEsigenza[] = [
  {
    titolo: "Bolletta del gas che cresce ogni anno",
    descrizione:
      "Serramenti datati possono aumentare la dispersione termica, soprattutto nelle stanze più esposte. La sostituzione va valutata insieme a vetro, telaio, posa e abitudini d'uso per stimare un beneficio realistico.",
  },
  {
    titolo: "Rumore dalla strada che ti sveglia",
    descrizione:
      "Se l'abitazione affaccia su strada, cortile o zona trafficata, il vetro giusto può fare la differenza. Valutiamo composizione del vetro, guarnizioni e corretta posa per migliorare l'isolamento acustico.",
  },
  {
    titolo: "Sicurezza di chi dorme sotto al tuo tetto",
    descrizione:
      "Per piani bassi, balconi e punti accessibili è utile valutare ferramenta rinforzata, vetri stratificati e maniglie dedicate. La sicurezza si progetta in base alla reale esposizione dell'immobile.",
  },
];

export const PRESET_ESIGENZE_FAMIGLIA: SrEsigenza[] = [
  {
    titolo: "Bambini al sicuro intorno alle finestre",
    descrizione:
      "In presenza di bambini, possiamo prevedere maniglie con chiave, aperture controllate e vetri stratificati dove serve. Sono dettagli piccoli, ma importanti nella vita quotidiana.",
  },
  {
    titolo: "Caldo d'estate quando i bimbi dormono",
    descrizione:
      "Nelle stanze esposte al sole non basta cambiare finestra: bisogna valutare vetro, oscuranti e ventilazione. La proposta considera anche il comfort estivo, non solo quello invernale.",
  },
  {
    titolo: "Manutenzione zero per anni",
    descrizione:
      "PVC e alluminio riducono la manutenzione rispetto a soluzioni più delicate, ma ogni materiale va scelto in base a esposizione, colore e contesto. Ti indichiamo anche come mantenerlo nel tempo.",
  },
];

// ─── Soluzione (Specificity + Authority) ────────────────────────────────────

export const PRESET_SOLUZIONE: SrSoluzioneItem[] = [
  {
    titolo: "Serramenti misurati al millimetro sulla tua casa",
    descrizione:
      "Prima dell'ordine verifichiamo misure, fuori squadra, soglie, spallette e condizioni del foro finestra. Il preventivo nasce da un rilievo tecnico, non da una misura stimata a occhio.",
  },
  {
    titolo: "Posa qualificata, scritta in contratto",
    descrizione:
      "La posa viene pianificata in base al tipo di parete e alla situazione esistente. Nel preventivo vengono chiariti materiali, lavorazioni incluse e condizioni operative, così sai cosa è compreso.",
  },
];

export const PRESET_SOLUZIONE_PREMIUM: SrSoluzioneItem[] = [
  {
    titolo: "Vetri ad altissime prestazioni",
    descrizione:
      "Possiamo valutare vetri basso-emissivi, selettivi, acustici o stratificati in base alle stanze e all'esposizione. Le prestazioni definitive vengono confermate dalle schede tecniche dei prodotti scelti.",
  },
  {
    titolo: "Profili a taglio termico vero",
    descrizione:
      "Per alluminio, PVC o legno-alluminio valutiamo profilo, profondità telaio, nodo di posa e colore. La scelta corretta dipende da estetica, prestazione e budget disponibile.",
  },
  {
    titolo: "Posa certificata UNI 11673 con foto del cantiere",
    descrizione:
      "Quando previsto, documentiamo le fasi principali della posa con foto e riferimenti tecnici. Questo rende più semplice verificare cosa è stato fatto e conservare traccia dell'intervento.",
  },
];

// ─── Perché noi (Authority + Social Proof + Loss Aversion) ──────────────────

export const PRESET_PERCHE_NOI: string[] = [
  "Un referente unico segue preventivo, rilievo, posa e collaudo",
  "Ogni voce del preventivo è spiegata in modo chiaro prima della firma",
  "Rilievo tecnico eseguito prima dell'ordine definitivo",
  "Materiali, finiture e accessori vengono riepilogati per iscritto",
  "La documentazione finale viene consegnata in modo ordinato",
];

export const PRESET_PERCHE_NOI_ALT: string[] = [
  "Possibilità di vedere profili, colori, vetri e maniglie prima della scelta definitiva",
  "Sopralluogo tecnico con verifica delle condizioni reali del cantiere",
  "Tempi di produzione e posa condivisi prima dell'avvio ordine",
  "Protezione degli ambienti interni durante le fasi di smontaggio e montaggio",
  "Regolazioni finali e verifica di apertura/chiusura prima della consegna",
  "Supporto post posa per chiarimenti, regolazioni e manutenzione ordinaria",
];

export const PRESET_PERCHE_NOI_TRUST: string[] = [
  "Dati aziendali, partita IVA e riferimenti di contatto sempre visibili nel preventivo",
  "Certificazioni, polizze e abilitazioni indicate solo se realmente disponibili",
  "Recensioni e casi studio inseriti solo quando verificati e riferibili a lavori reali",
  "Schede prodotto e documentazione tecnica disponibili su richiesta",
  "Condizioni commerciali e validità dell'offerta esplicitate prima della firma",
];

// ─── Cosa è incluso (Reciprocity — tutto già dentro) ────────────────────────

export const PRESET_INCLUSO: string[] = [
  "Sopralluogo tecnico con rilievo misure e verifica delle condizioni di posa",
  "Smontaggio dei vecchi serramenti, se previsto dal preventivo",
  "Fornitura dei nuovi serramenti con finiture e accessori concordati",
  "Posa e regolazione iniziale di ante, maniglie e ferramenta",
  "Collaudo finale con indicazioni base di utilizzo e manutenzione",
];

export const PRESET_INCLUSO_PLUS: string[] = [
  "Rilievo tecnico con controllo di misure, soglie, spallette e punti critici",
  "Smontaggio, movimentazione e smaltimento vecchi serramenti se inclusi nell'offerta",
  "Fornitura serramenti su misura con schede tecniche disponibili",
  "Posa con materiali di fissaggio e sigillatura coerenti con il tipo di intervento",
  "Documentazione fotografica delle fasi principali, se richiesta",
  "Supporto alla raccolta documenti per eventuali pratiche fiscali, quando applicabile",
  "Pulizia ordinata dell'area di posa e ritiro imballaggi a fine lavoro",
  "Garanzie prodotto e condizioni di assistenza riepilogate nel preventivo",
];

// ─── Prossimi passi (Commitment ladder — micro-yes consecutivi) ─────────────

export const PRESET_PROSSIMI_PASSI: string[] = [
  "Confermiamo insieme eventuali dubbi tecnici o commerciali sul preventivo",
  "Fissiamo il sopralluogo o il rilievo definitivo, se non è già stato eseguito",
  "Aggiorniamo l'offerta con misure, finiture e condizioni definitive",
  "Dopo la firma avviamo ordine, produzione e pianificazione della posa",
];

export const PRESET_PROSSIMI_PASSI_PREMIUM: string[] = [
  "Sopralluogo tecnico con rilievo dimensionale e verifica delle condizioni di posa",
  "Confronto su materiali, finiture, maniglie, vetri e accessori disponibili",
  "Preventivo definitivo con tempi, pagamenti, condizioni e lavorazioni incluse",
  "Firma del contratto e versamento dell'acconto secondo lo schema concordato",
  "Produzione, consegna, posa e collaudo finale nei tempi condivisi",
];
