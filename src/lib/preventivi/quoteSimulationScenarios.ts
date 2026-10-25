import { SALES_AREAS, type SalesArea, type SalesIntervention } from '@/lib/moduli-vendita/areas';

/** Local-only, synthetic projects. IDs of the original cases are kept for saved drafts. */
export const QUOTE_LEGACY_SIMULATIONS = [
  { id: 'bilocale-pianta', label: 'Bilocale da planimetria', title: 'SIMULAZIONE · Ristrutturazione completa bilocale da planimetria', prompt: 'SIMULAZIONE locale, nessun cliente reale: ristrutturazione completa del bilocale della planimetria allegata. Leggi prima l’immagine: zona giorno 17,70 m², camera 14 m², bagno 4,60 m² sono etichette del disegno, non misure rilevate. La somma è 36,30 m² e NON comprende il disimpegno; 8,40 × 5,70 m è l’ingombro esterno, non superficie netta. Non assumere località, altezza, stato dei supporti, struttura o aliquota IVA. Proponi subito un budget preliminare motivato, poi lavorazioni modificabili e un cronoprogramma da confermare, distinguendo ipotesi e quantità verificate. Intervento interno completo senza variazioni distributive né opere strutturali autorizzate. Chiedi le decisioni mancanti una per volta. Nessuna pubblicazione o invio ai clienti.' },
  { id: 'costruzione', label: 'Nuova costruzione', title: 'SIMULAZIONE · Progetto di nuova costruzione', prompt: 'SIMULAZIONE, nessun cliente reale: genera un computo preliminare completo per la nuova costruzione di una casa. Posso allegare planimetria e progetto multipagina: chiedimi quale elaborato e revisione stiamo usando, cosa desidero realizzare e quali quantità sono già rilevate. Prepara fasi modificabili, senza dedurre fondazioni, armature, volumi o superfici di involucro dai soli mq. Strutture e impianti richiedono elaborati e verifiche dei progettisti. Una sola domanda prioritaria per turno. Nessun prezzo o codice inventato, budget preliminare separato dal computo verificato; niente pubblicazione o invio.' },
  { id: 'tennis', label: 'Campo da tennis', title: 'SIMULAZIONE · Nuovo campo da tennis', prompt: 'SIMULAZIONE, nessun cliente reale: voglio costruire un campo da tennis all’aperto in Lombardia, su terreno pianeggiante. Fammi scegliere superficie, dimensioni dell’area completa delle fasce di rispetto, drenaggio, recinzione e illuminazione. Non assumere che le sole dimensioni di gioco siano l’intera superficie di costruzione. Prepara lavorazioni modificabili con quantità mancanti null e prezzi da prezzario da verificare. Per ora niente invio a clienti, progetti strutturali o preventivi contrattuali.' },
  { id: 'appartamento', label: 'Appartamento completo', title: 'SIMULAZIONE · Ristrutturazione appartamento 80 m²', prompt: 'SIMULAZIONE, nessun cliente reale: voglio ristrutturare completamente un trilocale di 80 m² in Lombardia, con un bagno. Allego una planimetria come riferimento: non assumere che la sua superficie o tutti i bagni disegnati coincidano con questo scenario di prova. Chiedimi quali locali e lavori considerare. Finiture medie, impianti da rifare, nessuna modifica strutturale autorizzata. Componi lavorazioni modificabili, senza inventare quantità delle pareti o prezzi verificati. Budget preliminare e computo verificato devono restare separati.' },
  { id: "bagno", label: "Bagno completo", title: "SIMULAZIONE · Ristrutturazione bagno 6 m²", prompt: "SIMULAZIONE, nessun cliente reale: voglio ristrutturare completamente un bagno di 6 m² in Lombardia. Voglio sostituire sanitari, doccia, pavimenti e rivestimenti e rifare gli impianti. Fammi le domande essenziali e componi già le lavorazioni pertinenti con dati mancanti da definire. Non inventare prezzi né quantità di pareti." },
  { id: "bagno12", label: "Bagno completo 12 m²", title: "SIMULAZIONE · Ristrutturazione bagno completo 12 m²", prompt: "SIMULAZIONE, nessun cliente reale: voglio ristrutturare completamente un bagno di 12 m² in Lombardia, con sostituzione di pavimento, rivestimenti, doccia, WC, bidet e lavabo e rifacimento degli impianti. Fammi le domande essenziali e componi le voci modificabili. Quando servono alternative, proponi al massimo due pulsanti relativi a una sola scelta tecnica per turno, non coppie di alternative su più domande insieme. Non dedurre forma, pareti, altezze, stato dei supporti o prezzi dai soli 12 m². Useremo il prezzario regionale presente nel gestionale dopo aver definito le lavorazioni; nessuna inclusione automatica nel totale." },
  { id: "serramenti", label: "Solo serramenti", title: "SIMULAZIONE · Sostituzione serramenti", prompt: "SIMULAZIONE, nessun cliente reale: devo sostituire soltanto i serramenti di un appartamento in Lombardia. Sono quattro finestre e una portafinestra. Non voglio rifare pavimenti, bagno o impianti. Fammi le domande tecniche necessarie e prepara voci modificabili, senza inventare misure, prestazioni o prezzi." },
  { id: "parziale", label: "Ristrutturazione parziale", title: "SIMULAZIONE · Rinnovo parziale soggiorno e cucina", prompt: "SIMULAZIONE, nessun cliente reale: voglio rinnovare parzialmente soggiorno e cucina in Lombardia. Nel soggiorno di 22 m² vorrei un pavimento nuovo in sovrapposizione; in cucina di 10 m² solo tinteggiatura delle pareti. Bagno, serramenti e impianti sono esclusi. Non ho ancora deciso i soffitti. Fammi le domande essenziali e componi le voci modificabili, senza trasferire le scelte tra stanze né inventare prezzi." },
] as const;
export type QuoteSimulationId = typeof QUOTE_LEGACY_SIMULATIONS[number]['id'] | `${string}--${string}`;
export type QuoteSimulationScenario = { id: QuoteSimulationId; label: string; title: string; prompt: string; areaId?: string; interventionId?: string };
const areaNotes: Record<string, string> = {
  fotovoltaico: 'Distingui kWp dei moduli, kW dell’inverter e kWh dell’accumulo. Non ricavare producibilità, numero di moduli, risparmio, incentivi o portata del tetto senza dati e verifica tecnica.',
  tetti: 'Distingui superficie in proiezione e superficie inclinata delle falde. Chiedi geometria, pendenza, stratigrafia, accessi e sicurezza; non approvare strutture, ponteggi o bonifica amianto senza tecnici e imprese abilitate.',
  serramenti: 'Distingui misure del vano e del serramento, quantità in pezzi e superfici. Chiedi materiale, apertura, vetro, posa e cosa conservare, senza inventare prestazioni.',
  climatizzazione: 'Non dimensionare la potenza dai soli metri quadri. Chiedi ambienti, involucro, percorsi e scarichi; posa, refrigeranti e verifiche richiedono personale abilitato.',
  termoidraulica: 'Non dimensionare generatori dai soli metri quadri né promettere incentivi. Distingui impianto esistente, fabbisogno e compatibilità da verificare da un tecnico.',
  elettrico: 'Distingui punti, circuiti, lunghezze e potenze. Non dichiarare conformità o dimensionare protezioni senza progetto e verifica di un tecnico abilitato.',
  piscine: 'Distingui volume d’acqua, scavo, superficie dei rivestimenti e bordo; non dedurli dalla sola area. Strutture, terreno e impianti richiedono verifica tecnica.',
  facciate: 'Distingui superfici lorde e nette, aperture, imbotti e accessi. Sistema, spessori, stato del supporto e sicurezza richiedono verifica.',
  pergole: 'Chiedi misure, supporti, ancoraggi, scarichi e accessori. Non dichiarare esenzioni dai permessi o verifiche al vento e alla neve senza dati tecnici.',
  giardini: 'Distingui superfici, sviluppi lineari, quantità di piante, terreno e fabbisogni idrici. Non ricavare portate o confini da dati incompleti.',
};
const exampleBriefs: Record<string, string> = {
  'fotovoltaico--nuovo': 'Caso sintetico: abitazione in Lombardia, impianto richiesto da 6 kWp; valutiamo un accumulo da 10 kWh come alternativa, non ancora scelto. Consumi, falde, ombre e distanze da definire.',
  'tetti--rifacimento': 'Caso sintetico: tetto a due falde in Lombardia, proiezione orizzontale dichiarata di 120 m². Pendenza e superficie reale delle falde non note. Valutiamo manto e isolamento, senza interventi strutturali autorizzati.',
};
function interventionScenario(area: SalesArea, intervention: SalesIntervention): QuoteSimulationScenario {
  const id = `${area.id}--${intervention.id}` as const;
  return {
    id, areaId: area.id, interventionId: intervention.id,
    label: `${area.title} · ${intervention.title}`,
    title: `SIMULAZIONE · ${intervention.title}`,
    prompt: `SIMULAZIONE, nessun cliente reale: voglio un preventivo per ${intervention.title.toLocaleLowerCase('it-IT')}, nell’area ${area.title}, in Lombardia. ${exampleBriefs[id] ?? intervention.summary}\n\nGuidami in chat, una sola domanda prioritaria per turno con alternative cliccabili quando utili. Dati da chiarire: ${intervention.fields.join('; ')}. ${areaNotes[area.id] ?? 'Conferma ambienti, misure nette, aperture, supporti ed elementi da conservare; non trasferire le scelte fra ambienti o lavorazioni.'}\n\nComponi voci modificabili pertinenti. Quantità mancanti da definire; proponi formule esplicite da confermare. Cerca riferimenti nel prezzario selezionato senza inventare codici o prezzi. Budget preliminare e computo verificato devono restare separati. Nessuna inclusione automatica nel totale, pubblicazione o invio ai clienti. Il modello grafico scelto non determina materiali, prezzi o lavorazioni.`,
  };
}
// Shared editorial taxonomy: no module activation, company mutation or second catalogue.
export const QUOTE_SIMULATION_AREAS = SALES_AREAS;
export const QUOTE_SIMULATION_SCENARIOS: readonly QuoteSimulationScenario[] = [
  ...QUOTE_LEGACY_SIMULATIONS,
  ...SALES_AREAS.flatMap(area => area.interventions.map(item => interventionScenario(area, item))),
];
export function quoteSimulationScenario(id: unknown) { return QUOTE_SIMULATION_SCENARIOS.find(s => s.id === id); }
export function quoteSimulationTarget(text: string): QuoteSimulationId | "principale" | null {
  const n = text.trim().toLocaleLowerCase("it");
  if (n === "torna al progetto principale") return "principale";
  return QUOTE_SIMULATION_SCENARIOS.find(s => n === `simulazione ${s.label.toLocaleLowerCase("it")}`)?.id ?? null;
}
