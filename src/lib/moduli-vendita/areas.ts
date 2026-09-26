import type { ModuloVendutaSlug } from "./config";

/** Tassonomia editoriale. Non concede accessi e non crea nuovi preventivatori. */
export interface SalesIntervention {
  id: string;
  title: string;
  summary: string;
  fields: readonly string[];
  status: "planned";
}
export interface SalesArea {
  id: string;
  title: string;
  sourceModule: ModuloVendutaSlug;
  summary: string;
  interventions: readonly SalesIntervention[];
}
const intervention = (id: string, title: string, summary: string, ...fields: string[]): SalesIntervention => ({ id, title, summary, fields, status: "planned" });

export const SALES_AREAS: readonly SalesArea[] = [
  { id: "serramenti", title: "Serramenti", sourceModule: "serramenti", summary: "Finestre, oscuranti, porte e protezione dagli insetti.", interventions: [
    intervention("finestre", "Finestre e portefinestre", "Sostituzione o nuova installazione di infissi su misura.", "Misure e quantità", "Materiale, apertura e vetro", "Prestazioni richieste", "Rimozione e posa"),
    intervention("persiane", "Persiane e scuri", "Oscuranti esterni, ferramenta e sistemi di fissaggio.", "Misure e aperture", "Materiale e lamelle", "Ferramenta e colore", "Fissaggi e posa"),
    intervention("avvolgibili", "Avvolgibili e cassonetti", "Sostituzione o installazione di teli, guide e cassonetti.", "Dimensioni e materiale del telo", "Cassonetto e guide", "Motorizzazione", "Smontaggio e installazione"),
    intervention("zanzariere", "Zanzariere", "Soluzioni su misura per finestre e portefinestre.", "Misure e quantità", "Tipologia di apertura", "Rete e colore", "Installazione"),
    intervention("porte-ingresso", "Porte d'ingresso e blindate", "Ingresso, chiusure e rivestimenti personalizzati.", "Dimensioni e apertura", "Prestazioni e serratura", "Rivestimenti e accessori", "Rimozione e posa"),
    intervention("porte-interne", "Porte interne", "Porte a battente, scorrevoli e relativi accessori.", "Vano e misure", "Apertura e telaio", "Finiture e maniglie", "Posa e ripristini"),
    intervention("combinato", "Intervento combinato", "Struttura prevista per riunire più lavorazioni della stessa area in una sola offerta.", "Interventi da includere", "Abbinamenti per vano", "Lavorazioni comuni", "Riepilogo unico"),
  ] },
  { id: "tetti", title: "Tetti", sourceModule: "tetti", summary: "Rifacimenti, ripasso, isolamento e manutenzione delle coperture.", interventions: [
    intervention("rifacimento", "Rifacimento completo del tetto", "Dalla rimozione della copertura alla nuova stratigrafia.", "Superficie e geometria", "Stratigrafia e manto", "Demolizioni e smaltimenti", "Accessi e opere provvisionali"),
    intervention("ripasso", "Ripasso del tetto", "Recupero del manto riutilizzabile e sostituzioni necessarie.", "Superficie da ripassare", "Stato del manto", "Elementi da recuperare e sostituire", "Colmi, raccordi e accessi"),
    intervention("riparazioni", "Riparazioni e infiltrazioni", "Interventi localizzati, con perimetro ed esclusioni espliciti.", "Zone e difetti rilevati", "Diagnosi e sopralluogo", "Lavorazioni localizzate", "Accessi e verifiche finali"),
    intervention("isolamento", "Isolamento tetto e sottotetto", "Coibentazione della copertura o del solaio sottotetto.", "Superficie e supporto", "Materiale e spessore", "Raccordi e continuità", "Finiture e accessibilità"),
    intervention("impermeabilizzazione", "Coperture piane e terrazzi", "Preparazione e impermeabilizzazione delle superfici.", "Superficie e pendenze", "Stato del supporto", "Sistema impermeabilizzante", "Scarichi e risvolti"),
    intervention("lattoneria", "Grondaie e lattoneria", "Canali, pluviali, scossaline e raccordi.", "Sviluppi in metri lineari", "Materiale e sezioni", "Raccordi e pezzi speciali", "Accessi e montaggio"),
  ] },
  { id: "ristrutturazioni", title: "Ristrutturazioni", sourceModule: "ristrutturazione", summary: "Lavori completi o parziali, organizzati per ambienti e capitoli.", interventions: [
    intervention("completa", "Ristrutturazione completa", "Un progetto coordinato per l'intera abitazione.", "Ambienti e superfici", "Demolizioni e opere edili", "Impianti e finiture", "Fasi, inclusioni ed esclusioni"),
    intervention("parziale", "Ristrutturazione parziale", "Solo gli ambienti e le lavorazioni scelti dal cliente.", "Ambienti interessati", "Lavorazioni da includere", "Elementi da conservare", "Protezione e ripristini"),
    intervention("commerciale", "Negozi e uffici", "Rinnovo degli spazi destinati all'attività.", "Uso e superfici", "Distribuzione degli spazi", "Impianti e allestimenti", "Vincoli operativi e fasi"),
    intervention("spazi", "Redistribuzione degli spazi", "Demolizioni, nuove pareti e opere connesse.", "Stato attuale e progetto", "Pareti e aperture", "Spostamenti impianti", "Ripristini e finiture"),
    intervention("computo", "Intervento a computo", "Composizione libera per capitoli e quantità.", "Capitoli", "Voci e unità di misura", "Quantità e lavorazioni", "Inclusioni ed esclusioni"),
  ] },
  { id: "pareti-soffitti", title: "Pareti e soffitti", sourceModule: "ristrutturazione", summary: "Pittura, carta da parati, cartongesso e risanamento delle pareti.", interventions: [
    intervention("tinteggiatura-interna", "Tinteggiatura interna", "Preparazione del fondo e mani di finitura sulle pareti indicate.", "Superfici da tinteggiare", "Stato del fondo", "Tinta e finitura", "Protezioni e pulizia"),
    intervention("carta-da-parati", "Carta da parati", "Preparazione del muro e posa allineata del disegno.", "Pareti da rivestire", "Stato del fondo", "Tipo di carta e motivo", "Raccordi e giunzioni"),
    intervention("cartongesso", "Pareti in cartongesso", "Pareti e contropareti a secco, con isolante e predisposizioni.", "Posizione e funzione", "Tipo di lastra", "Impianti da predisporre", "Isolamento e finitura"),
    intervention("controsoffitti", "Controsoffitti e velette", "Abbassamenti in cartongesso per luce, impianti e isolamento.", "Quota e funzione", "Struttura e lastre", "Luci e ispezioni", "Finitura di consegna"),
    intervention("decorativi", "Finiture decorative", "Stucco veneziano, microcemento e resine a parete.", "Superfici e effetto", "Preparazione del fondo", "Campione e ciclo", "Protezione finale"),
    intervention("umidita", "Umidità e muffa", "Diagnosi della causa, risanamento del muro e finitura traspirante.", "Origine dell'umidità", "Superfici interessate", "Ciclo di risanamento", "Limiti e indicazioni d'uso"),
    intervention("acustica", "Isolamento acustico", "Contropareti e soffitti fonoisolanti sul rumore reale.", "Tipo di rumore", "Via del suono", "Stratigrafia", "Risultato atteso"),
  ] },
  { id: "pergole", title: "Pergole e tende", sourceModule: "ristrutturazione", summary: "Pergole, tende da sole, vetrate e tettoie per gli spazi esterni.", interventions: [
    intervention("pergola-bioclimatica", "Pergola bioclimatica", "Lamelle orientabili, motori e scarico dell'acqua.", "Spazio e appoggi", "Copertura e comandi", "Acqua e vento", "Accessori"),
    intervention("pergola-telo", "Pergola con telo", "Struttura leggera con telo avvolgibile o a pacchetto.", "Zona da coprire", "Telo e sistema", "Tensione e vento", "Comandi"),
    intervention("tende-sole", "Tende da sole", "Tende a bracci, a cassonetto o verticali su misura.", "Misure delle aperture", "Tipo e tessuto", "Fissaggi e supporto", "Comandi"),
    intervention("vetrate", "Vetrate e chiusure balcone", "Vetrate panoramiche e chiusure di balconi e logge.", "Lati da chiudere", "Sistema e requisiti", "Pratiche e vincoli", "Ferramenta"),
    intervention("carport", "Carport e tettoie", "Coperture per auto, legna o ingressi.", "Spazio e uso", "Copertura", "Fondazioni e ancoraggi", "Scarico dell'acqua"),
  ] },
  { id: "bagni", title: "Bagni", sourceModule: "bagni", summary: "Dal bagno completo alla sostituzione di vasca, doccia o sanitari.", interventions: [
    intervention("completo", "Ristrutturazione completa del bagno", "Demolizioni, impianti, rivestimenti e arredi coordinati.", "Rilievo e disposizione", "Impianti", "Sanitari e rivestimenti", "Demolizioni e posa"),
    intervention("vasca-doccia", "Da vasca a doccia", "Trasformazione della zona vasca in una nuova doccia.", "Vano disponibile", "Piatto e box doccia", "Scarichi e rubinetteria", "Rivestimenti e ripristini"),
    intervention("doccia", "Rifacimento zona doccia", "Rinnovo della doccia e delle superfici interessate.", "Misure", "Impermeabilizzazione", "Piatto, box e rubinetteria", "Smontaggi e ripristini"),
    intervention("sanitari", "Sanitari e rubinetteria", "Sostituzione di elementi senza rifacimento completo.", "Elementi e quantità", "Attacchi esistenti", "Modelli e accessori", "Installazione e smaltimento"),
    intervention("accessibilita", "Bagno accessibile", "Adeguamento secondo le esigenze d'uso rilevate.", "Esigenze e spazi di manovra", "Sanitari e ausili", "Accesso alla doccia", "Opere e adattamenti"),
    intervention("rinnovo", "Rinnovo estetico", "Aggiornamento di finiture e arredi conservando quanto possibile.", "Elementi da conservare", "Superfici da rinnovare", "Arredi e accessori", "Preparazione e posa"),
  ] },
  { id: "fotovoltaico", title: "Fotovoltaico", sourceModule: "fotovoltaico", summary: "Nuovi impianti, accumulo e interventi su impianti esistenti.", interventions: [
    intervention("nuovo", "Nuovo impianto fotovoltaico", "Proposta di impianto con accumulo opzionale.", "Consumi e obiettivi", "Sito e superficie disponibile", "Moduli e inverter", "Accumulo e installazione"),
    intervention("accumulo", "Aggiunta accumulo", "Integrazione di batterie nell'impianto esistente.", "Impianto e inverter esistenti", "Compatibilità", "Capacità richiesta", "Installazione e configurazione"),
    intervention("ampliamento", "Ampliamento impianto", "Incremento della potenza e componenti necessari.", "Configurazione esistente", "Potenza aggiuntiva", "Spazi e compatibilità", "Adeguamenti e installazione"),
    intervention("componenti", "Sostituzione componenti", "Inverter e altri componenti da sostituire.", "Componenti esistenti", "Motivo della sostituzione", "Ricambi compatibili", "Installazione e verifiche"),
    intervention("manutenzione", "Manutenzione e verifica", "Controlli e lavorazioni su impianti esistenti.", "Dati impianto", "Controlli previsti", "Pulizia e interventi", "Rapporto finale"),
  ] },
  { id: "climatizzazione", title: "Climatizzazione", sourceModule: "climatizzazione", summary: "Climatizzatori, canalizzati, ventilazione e manutenzione.", interventions: [
    intervention("monosplit", "Impianto monosplit", "Una unità interna con relativa unità esterna.", "Ambiente e fabbisogno", "Unità selezionate", "Linee e scarichi", "Installazione"),
    intervention("multisplit", "Impianto multisplit", "Più ambienti serviti da un sistema coordinato.", "Ambienti e unità interne", "Unità esterna", "Percorsi e lunghezze", "Installazione e configurazione"),
    intervention("canalizzato", "Impianto canalizzato", "Distribuzione dell'aria attraverso canalizzazioni.", "Ambienti e zone", "Unità e canali", "Bocchette e regolazione", "Opere connesse"),
    intervention("sostituzione", "Sostituzione climatizzatori", "Rinnovo degli apparecchi esistenti.", "Apparecchi da sostituire", "Compatibilità delle linee", "Nuove unità", "Rimozione e montaggio"),
    intervention("manutenzione", "Manutenzione e pulizia", "Interventi programmati sulle unità.", "Unità e quantità", "Stato rilevato", "Pulizie e controlli", "Periodicità"),
    intervention("vmc", "Ventilazione meccanica controllata", "Ricambio d'aria centralizzato o puntuale.", "Ambienti e ricambi richiesti", "Sistema e unità", "Passaggi e canalizzazioni", "Posa e regolazione"),
  ] },
  { id: "termoidraulica", title: "Termoidraulica e riscaldamento", sourceModule: "termoidraulico", summary: "Caldaie, pompe di calore, distribuzione e impianti idrici.", interventions: [
    intervention("caldaia", "Sostituzione caldaia", "Generatore e adattamenti all'impianto esistente.", "Impianto attuale", "Generatore proposto", "Scarichi e collegamenti", "Rimozione e installazione"),
    intervention("pompa-calore", "Pompa di calore", "Sistema per riscaldamento e acqua calda secondo progetto.", "Fabbisogno e terminali", "Generatore e accumuli", "Spazi e alimentazione", "Adeguamenti e installazione"),
    intervention("ibrido", "Sistema ibrido", "Integrazione di generatori e relativa regolazione.", "Impianto esistente", "Generatori", "Accumuli e regolazione", "Collegamenti e posa"),
    intervention("radiante", "Riscaldamento a pavimento", "Sistema radiante e opere necessarie.", "Superfici e quote", "Pannelli e circuiti", "Collettori e regolazione", "Massetti e opere connesse"),
    intervention("terminali", "Radiatori e terminali", "Sostituzione o aggiunta di corpi scaldanti.", "Ambienti e quantità", "Tipologie e dimensioni", "Valvole e collegamenti", "Installazione"),
    intervention("idrico", "Impianto idrico-sanitario", "Distribuzione dell'acqua e scarichi.", "Punti di utilizzo", "Reti e percorsi", "Materiali e accessori", "Opere murarie e verifiche"),
    intervention("acqua-calda", "Acqua calda sanitaria", "Produzione e accumulo di acqua calda.", "Utenze e fabbisogno", "Generatore o scaldacqua", "Accumulo", "Collegamenti e posa"),
    intervention("manutenzione", "Riparazione e manutenzione", "Diagnosi, ricambi e interventi sull'impianto.", "Guasto o servizio richiesto", "Ore e uscita", "Ricambi", "Verifiche finali"),
    intervention("conto-termico", "Conto Termico 3.0", "Pompa di calore o generatore rinnovabile con il contributo del GSE.", "Impianto da sostituire", "Generatore proposto", "Contributo GSE", "Risparmio negli anni"),
    intervention("full-electric", "Casa Full Electric", "Pompa di calore, induzione, fotovoltaico e batteria: la casa senza gas.", "Consumi e bollette di oggi", "Sistema proposto", "Energia e bollette di domani", "Incentivi e beneficio negli anni"),
  ] },
  { id: "elettrico", title: "Elettrico e domotica", sourceModule: "elettrico", summary: "Impianti, punti luce, automazioni e ricarica elettrica.", interventions: [
    intervention("completo", "Impianto elettrico completo", "Rete elettrica organizzata per ambienti e circuiti.", "Ambienti e dotazioni", "Punti e circuiti", "Quadri e protezioni", "Posa e verifiche"),
    intervention("adeguamento", "Adeguamento impianto", "Intervento sull'impianto esistente secondo le necessità rilevate.", "Stato esistente", "Interventi previsti", "Componenti da conservare", "Verifiche"),
    intervention("punti", "Punti luce, prese e linee", "Aggiunte e spostamenti localizzati.", "Punti e quantità", "Percorsi e lunghezze", "Serie civile", "Opere e ripristini"),
    intervention("quadro", "Quadro elettrico", "Installazione o sostituzione del quadro.", "Circuiti e potenze", "Protezioni", "Carpenteria", "Collegamenti e verifiche"),
    intervention("domotica", "Domotica e automazioni", "Controllo coordinato degli elementi dell'edificio.", "Funzioni richieste", "Dispositivi", "Integrazioni", "Configurazione e consegna"),
    intervention("videocitofonia", "Videocitofonia", "Postazioni esterne e interne.", "Ingressi e utenze", "Postazioni", "Cablaggi", "Installazione e configurazione"),
    intervention("ricarica", "Ricarica veicoli elettrici", "Punto di ricarica e infrastruttura necessaria.", "Potenza disponibile", "Dispositivo", "Linea e protezioni", "Installazione e configurazione"),
  ] },
  { id: "pavimenti", title: "Pavimenti e rivestimenti", sourceModule: "pavimenti", summary: "Posa, rifacimenti, resine e recupero delle superfici.", interventions: [
    intervention("sovrapposizione", "Posa su fondo esistente", "Nuova pavimentazione conservando il fondo compatibile.", "Superficie e supporto", "Materiale e formato", "Preparazione", "Posa e finiture"),
    intervention("rifacimento", "Rimozione e rifacimento", "Demolizione, preparazione e nuova posa.", "Superfici", "Rimozioni e smaltimenti", "Sottofondi", "Materiali e posa"),
    intervention("resina", "Pavimentazione in resina", "Ciclo di preparazione e finitura in resina.", "Superficie e destinazione", "Supporto", "Ciclo e finitura", "Preparazione e applicazione"),
    intervention("parquet", "Recupero parquet", "Levigatura, riparazioni e nuova finitura.", "Superficie e stato", "Riparazioni", "Levigatura", "Finitura"),
    intervention("pareti", "Rivestimenti a parete", "Posa su superfici verticali.", "Superfici", "Materiale e formato", "Supporto e preparazione", "Tagli e posa"),
    intervention("esterni", "Pavimentazioni esterne", "Superfici esterne e relative preparazioni.", "Superficie e utilizzo", "Pendenze e sottofondo", "Materiali", "Posa e drenaggio"),
  ] },
  { id: "piscine", title: "Piscine", sourceModule: "piscine", summary: "Nuove realizzazioni, rinnovi, impianti e cura stagionale.", interventions: [
    intervention("nuova", "Nuova piscina", "Struttura, impianti e finiture della nuova piscina.", "Dimensioni e terreno", "Struttura", "Impianti", "Finiture e accessori"),
    intervention("ristrutturazione", "Ristrutturazione piscina", "Rinnovo della struttura esistente.", "Stato e dimensioni", "Opere strutturali previste", "Impianti da adeguare", "Finiture"),
    intervention("rivestimento", "Rivestimento e impermeabilizzazione", "Ripristino delle superfici interne.", "Superficie e supporto", "Rimozioni", "Sistema impermeabilizzante", "Rivestimento"),
    intervention("impianti", "Adeguamento impianti", "Filtrazione, circolazione e trattamento dell'acqua.", "Impianto esistente", "Componenti", "Collegamenti", "Installazione e verifiche"),
    intervention("accessori", "Coperture e accessori", "Aggiunta di dotazioni alla piscina.", "Dimensioni", "Dotazioni scelte", "Predisposizioni", "Montaggio"),
    intervention("manutenzione", "Manutenzione stagionale", "Apertura, chiusura e interventi periodici.", "Dati piscina", "Servizi richiesti", "Materiali e ricambi", "Periodicità"),
  ] },
  { id: "facciate", title: "Facciate e isolamento", sourceModule: "cappotto", summary: "Cappotto, rinnovo delle facciate e ripristini esterni.", interventions: [
    intervention("cappotto", "Cappotto termico esterno", "Sistema di isolamento e finitura delle facciate.", "Superfici e supporto", "Isolante e spessore", "Raccordi e finitura", "Ponteggi e accessi"),
    intervention("rifacimento", "Rifacimento facciata", "Ripristino di intonaci e finiture senza cappotto.", "Superficie e stato", "Rimozioni e ripristini", "Ciclo di finitura", "Accessi"),
    intervention("balconi", "Balconi e frontalini", "Ripristini delle parti esterne interessate.", "Elementi e quantità", "Degrado rilevato", "Lavorazioni previste", "Accessi e protezioni"),
    intervention("tinteggiatura", "Tinteggiatura esterna", "Preparazione e rinnovo del colore.", "Superfici", "Stato del supporto", "Ciclo e colore", "Accessi e protezioni"),
    intervention("interno", "Isolamento interno", "Coibentazione dall'interno degli ambienti.", "Superfici", "Sistema e spessore", "Raccordi", "Finiture e ripristini"),
    intervention("riparazioni", "Riparazioni localizzate", "Interventi puntuali sulle facciate.", "Zone interessate", "Difetti rilevati", "Lavorazioni", "Accessi e finiture"),
  ] },
];

export function findSalesArea(id: string | null) {
  // Compatibilità editoriale con gli slug del catalogo precedente.
  const alias = id === "pompe_calore" || id === "termoidraulico" ? "termoidraulica" : id === "cappotto" ? "facciate" : id === "ristrutturazione" ? "ristrutturazioni" : id;
  return SALES_AREAS.find(area => area.id === alias);
}
export function matchesSalesArea(area: SalesArea, query: string) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it-IT");
  const haystack = normalize([area.title, area.summary, ...area.interventions.flatMap(item => [item.title, item.summary, ...item.fields])].join(" "));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}
