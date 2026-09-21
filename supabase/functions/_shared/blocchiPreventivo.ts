/**
 * I blocchi del preventivo: le pagine che raccontano come lavora l'azienda.
 *
 * Una libreria sola per tutti i moduli (otto edili, Serramenti, Fotovoltaico):
 * per ogni blocco i testi e le foto di serie di ciascun settore, che l'azienda
 * cambia dall'editor del modello. Le scelte dell'azienda stanno nella colonna
 * `pdf_blocchi` del modello, un oggetto { [chiave]: campi cambiati }: quello che
 * non ha toccato resta di serie, anche quando i testi di serie migliorano.
 *
 * Alcuni blocchi promettono qualcosa al cliente (proteggiamo la casa, controlliamo
 * ogni dettaglio, ti consegniamo un fascicolo). Fino al 21/09/2026 nascevano
 * spenti; dal 22/09 nascono accesi (decisione di Florin) e l'editor chiede di
 * rileggerli: uno che promette una cosa che l'azienda non fa è peggio di nessuna
 * pagina, e l'azienda lo spegne con un clic.
 *
 * I testi usano solo caratteri che i PDF con i caratteri di serie sanno stampare
 * (niente frecce né pedici: «CO2», non «CO₂»).
 */
import { eIcona, type NomeIcona } from "./iconePreventivo.ts";

export type ChiaveBlocco = "comeFunziona" | "compreso" | "protezione" | "controlli" | "documenti" | "diario";

export type SettoreBlocchi =
  | "serramenti" | "fotovoltaico" | "ristrutturazione" | "bagni" | "tetti"
  | "climatizzazione" | "elettrico" | "termoidraulico" | "pavimenti" | "piscine";

export interface VoceBlocco {
  titolo: string;
  testo: string | null;
  icona: NomeIcona | null;
}

export interface ContenutoBlocco {
  occhiello: string;
  /** Una parola fra asterischi esce in corsivo, nel colore dell'azienda. */
  titolo: string;
  intro: string | null;
  voci: VoceBlocco[];
  /** Solo «Cosa è compreso»: quello che il preventivo non comprende. */
  escluse: VoceBlocco[];
  /** Indirizzi: foto di serie (/pdf-stock/…) o caricate dall'azienda. */
  foto: string[];
  nota: string | null;
}

export interface DescrizioneBlocco {
  chiave: ChiaveBlocco;
  /** Il nome nell'editor e nell'indice del documento. */
  etichetta: string;
  descrizione: string;
  /** Promette qualcosa al cliente: l'editor chiede di rileggerlo. */
  promessa: boolean;
}

export const BLOCCHI: DescrizioneBlocco[] = [
  { chiave: "comeFunziona", etichetta: "Come funziona", descrizione: "Le lavorazioni che non si vedono, spiegate con foto tecniche", promessa: false },
  { chiave: "compreso", etichetta: "Cosa è compreso", descrizione: "Cosa comprende il prezzo, e cosa resta fuori", promessa: true },
  { chiave: "protezione", etichetta: "Protezione della casa", descrizione: "Come proteggete la casa durante i lavori", promessa: true },
  { chiave: "controlli", etichetta: "Controlli di qualità", descrizione: "Cosa verificate prima della consegna", promessa: true },
  { chiave: "documenti", etichetta: "Documenti consegnati", descrizione: "Il fascicolo che il cliente riceve a fine lavori", promessa: true },
  { chiave: "diario", etichetta: "Diario fotografico", descrizione: "Le foto delle fasi, anche di quelle che poi restano nascoste", promessa: true },
];

export const descrizioneBlocco = (chiave: ChiaveBlocco): DescrizioneBlocco =>
  BLOCCHI.find((b) => b.chiave === chiave) as DescrizioneBlocco;

/**
 * Le pagine dei blocchi nei documenti con un ordine di pagine (Serramenti,
 * Fotovoltaico): l'identificativo della pagina e il blocco che mostra. «Cosa è
 * compreso» lì non c'è: Serramenti lo sceglie preventivo per preventivo, nella
 * proposta economica.
 */
export const PAGINE_BLOCCO = {
  come_funziona: "comeFunziona",
  protezione: "protezione",
  controlli: "controlli",
  documenti: "documenti",
  diario: "diario",
} as const satisfies Record<string, ChiaveBlocco>;

export type PaginaBlocco = keyof typeof PAGINE_BLOCCO;

export const bloccoDellaPagina = (id: string): ChiaveBlocco | null =>
  (PAGINE_BLOCCO as Record<string, ChiaveBlocco>)[id] ?? null;

/** Le foto di serie stanno nel sito, in public/pdf-stock. */
export const eFotoDiSerie = (url: string | null | undefined): boolean =>
  typeof url === "string" && /(^|\/)(pdf|cover)-stock\//.test(url);

// ─── I testi di serie ────────────────────────────────────────────────────────

const v = (titolo: string, testo: string | null, icona: NomeIcona | null = null): VoceBlocco => ({ titolo, testo, icona });
const foto = (settore: string, ...file: string[]) => file.map((f) => `/pdf-stock/${settore}/${f}.jpg`);

const NOTA_FOTO = "Immagini indicative: le lavorazioni e i prodotti veri sono quelli di questo preventivo.";

type Parziale = Partial<ContenutoBlocco>;

const COME_FUNZIONA: Record<SettoreBlocchi, Parziale> = {
  serramenti: {
    occhiello: "Come è fatto",
    titolo: "Cosa rende *isolante* un serramento.",
    intro: "Il comfort di una finestra dipende da quattro cose: il vetro, il suo bordo, il telaio e la posa. Ecco cosa guardare, e cosa guardiamo noi.",
    voci: [
      v("Il vetro", "Due o tre lastre con un gas isolante in mezzo: il calore resta in casa, il freddo e il rumore restano fuori.", "strati"),
      v("Il bordo del vetro", "Il distanziatore fra le lastre, meglio se isolante («warm edge»): meno freddo e meno condensa sugli angoli.", "temperatura"),
      v("Il telaio", "Più camere e rinforzi dentro il profilo, guarnizioni continue: tenuta all'aria e all'acqua che dura negli anni.", "casa"),
      v("La posa", "Una finestra rende quanto la sua posa: il giunto con il muro va sigillato dentro, al centro e fuori.", "installazione"),
    ],
    foto: foto("serramenti", "tecnica-posa", "tecnica-canalina"),
  },
  fotovoltaico: {
    occhiello: "Come funziona",
    titolo: "Dal tuo tetto *alla tua presa*.",
    intro: "Un impianto fotovoltaico fa quattro cose, tutti i giorni, senza che tu debba pensarci.",
    voci: [
      v("Produce", "I pannelli trasformano la luce in energia elettrica: con il sole pieno al massimo, con il cielo coperto meno.", "sole"),
      v("Converte", "L'inverter la trasforma nella stessa corrente che usi in casa e la manda dove serve.", "energia"),
      v("Conserva", "Con la batteria, se è prevista, l'energia del giorno resta a disposizione la sera e la notte.", "batteria"),
      v("Scambia", "Quello che non usi va in rete; quando ti serve più energia di quella che produci, la prendi dalla rete.", "rete"),
    ],
    // Una foto sola, larga: la casa in sezione con il percorso dell'energia. Le due
    // tecniche di prima restano in libreria.
    foto: foto("fotovoltaico", "storia-flusso-energia"),
  },
  bagni: {
    occhiello: "Sotto le piastrelle",
    titolo: "Quello che non vedrai, *fatto bene*.",
    intro: "Un bagno dura se è fatto bene dove poi non si vede più: impermeabilizzazione, scarichi e impianti. È la differenza fra un bagno bello e un bagno che resta bello.",
    voci: [
      v("Impermeabilizzazione", "Sotto doccia e pareti una membrana continua, rinforzata negli angoli: l'acqua non arriva ai muri né al piano di sotto.", "acqua"),
      v("Scarichi e pendenze", "Il fondo della doccia scende verso lo scarico con la pendenza giusta: niente ristagni, niente cattivi odori.", "strati"),
      v("Impianto idrico", "Tubazioni nuove per acqua calda e fredda, rubinetti di chiusura, e una prova di tenuta prima di chiudere le pareti.", "verifica"),
      v("Aria e comfort", "Ricambio d'aria, luce e scaldasalviette pensati insieme: meno condensa, niente muffa.", "ventilazione"),
    ],
    foto: foto("bagni", "tecnica-doccia-spaccato", "tecnica-impianto-idraulico"),
  },
  ristrutturazione: {
    occhiello: "Dentro le pareti",
    titolo: "Una casa rifatta *dentro*, non solo in superficie.",
    intro: "In una ristrutturazione il valore sta anche in quello che resta nascosto: impianti, sottofondi, isolamenti. È lì che si decide se la casa funzionerà bene per i prossimi trent'anni.",
    voci: [
      v("Impianti a norma", "Elettrico e idraulico rifatti secondo le norme, con la dichiarazione di conformità a fine lavori.", "energia"),
      v("Sottofondi e massetti", "Un pavimento dura se il sottofondo è in piano e asciutto: lo verifichiamo prima di posare.", "strati"),
      v("Isolamento e comfort", "Dove sono previsti, isolamenti e impianti che riducono i consumi e rendono la casa più piacevole.", "temperatura"),
      v("Un solo regista", "Demolizioni, impianti, opere murarie e finiture messe in fila da un unico referente, senza rimpalli.", "calendario"),
    ],
    foto: foto("ristrutturazione", "tecnica-casa-sezionata"),
  },
  tetti: {
    occhiello: "Come è fatto",
    titolo: "Un tetto che *respira* e non lascia passare l'acqua.",
    intro: "Un tetto fatto bene è una sequenza di strati, ognuno con il suo compito: il risultato è una casa asciutta, calda d'inverno e fresca d'estate.",
    voci: [
      v("Struttura e freno al vapore", "La base portante e un telo che impedisce all'umidità di casa di entrare nell'isolante.", "casa"),
      v("Isolante", "Lo strato che trattiene il calore d'inverno e lo tiene fuori d'estate.", "temperatura"),
      v("Ventilazione", "L'aria entra dalla gronda ed esce dal colmo: porta via il caldo e l'umidità.", "ventilazione"),
      v("Manto e raccolta delle acque", "Tegole, lattonerie e grondaie guidano l'acqua lontano dalla casa.", "acqua"),
    ],
    foto: foto("tetti", "tecnica-tetto-ventilato", "tecnica-dispersione"),
  },
  climatizzazione: {
    occhiello: "Come funziona",
    titolo: "Fresco d'estate, *caldo* d'inverno.",
    intro: "Una pompa di calore sposta il calore invece di produrlo: per questo consuma poco. Ecco cosa c'è dietro.",
    voci: [
      v("Unità interna", "Diffonde l'aria nella stanza, silenziosa, con i filtri che trattengono polvere e pollini.", "ventilazione"),
      v("Unità esterna", "Scambia il calore con l'aria di fuori: d'estate lo porta via, d'inverno lo porta dentro.", "temperatura"),
      v("Linee e condensa", "Tubazioni isolate e scarico della condensa con la pendenza giusta, senza gocciolamenti.", "acqua"),
      v("Manutenzione", "Filtri puliti e controlli periodici: l'impianto consuma meno e dura di più.", "verifica"),
    ],
    foto: foto("climatizzazione", "tecnica-estate-inverno", "tecnica-multisplit"),
  },
  elettrico: {
    occhiello: "Dentro le pareti",
    titolo: "Un impianto *sicuro*, anche dove non si vede.",
    intro: "Quello che non vedi è quello che ti protegge: quadro, protezioni, linee e messa a terra.",
    voci: [
      v("Il quadro", "Interruttori separati per zone: un guasto in cucina non spegne tutta la casa.", "energia"),
      v("Le protezioni", "Differenziali e magnetotermici che intervengono in una frazione di secondo.", "protezione"),
      v("Le linee", "Cavi della sezione giusta per ogni utenza, nelle loro canalizzazioni.", "strati"),
      v("La conformità", "A fine lavori la dichiarazione di conformità, come chiede la legge.", "conformita"),
    ],
    foto: foto("ristrutturazione", "tecnica-casa-sezionata"),
  },
  termoidraulico: {
    occhiello: "Come funziona",
    titolo: "Calore e acqua, *dove servono*.",
    intro: "Un impianto termico è una catena: chi produce il calore, chi lo porta nelle stanze, chi lo regola.",
    voci: [
      v("Generatore", "Caldaia o pompa di calore, scelta in base alla casa e ai consumi.", "fiamma"),
      v("Distribuzione", "Tubazioni isolate che portano il calore senza disperderlo lungo la strada.", "strati"),
      v("Terminali", "Radiatori o pavimento radiante: il calore arriva nelle stanze, dove serve.", "temperatura"),
      v("Collaudo e conformità", "Prova di tenuta dell'impianto e dichiarazione di conformità a fine lavori.", "verifica"),
    ],
    foto: foto("ristrutturazione", "tecnica-riscaldamento-pavimento"),
  },
  pavimenti: {
    occhiello: "Sotto il pavimento",
    titolo: "Un pavimento dura se è fatto *da sotto*.",
    intro: "La finitura si vede, il sottofondo no: ma è lui che decide se il pavimento resterà in piano e senza crepe.",
    voci: [
      v("Il supporto", "Umidità, planarità e pulizia verificate prima di iniziare.", "misura"),
      v("Il massetto", "Uno strato solido e in piano, con i tempi di asciugatura rispettati.", "strati"),
      v("La posa", "Colla e schema di posa scelti per il materiale e per l'ambiente.", "installazione"),
      v("I giunti", "Lungo i muri e sulle grandi superfici lasciano lavorare il pavimento senza rotture.", "verifica"),
    ],
    foto: foto("pavimenti", "tecnica-stratigrafia", "tecnica-giunto"),
  },
  piscine: {
    occhiello: "Come funziona",
    titolo: "Acqua limpida, *senza pensieri*.",
    intro: "Una piscina è una vasca e un circuito: l'acqua viene aspirata, filtrata, trattata e rimandata in vasca, di continuo.",
    voci: [
      v("La vasca", "Struttura, impermeabilizzazione e rivestimento: ogni strato fa la sua parte.", "strati"),
      v("Il circuito", "Skimmer, pompa, filtro e bocchette di ritorno tengono l'acqua in movimento.", "acqua"),
      v("Il trattamento", "Il dosaggio dei prodotti mantiene l'acqua limpida e sana.", "verifica"),
      v("Il locale tecnico", "Tutto l'impianto in un posto solo, facile da controllare.", "casa"),
    ],
    foto: foto("piscine", "tecnica-filtrazione", "tecnica-vasca"),
  },
};

const COMPRESO_BASE: Parziale = {
  occhiello: "Chiaro fin da subito",
  titolo: "Cosa è *compreso*, e cosa no.",
  intro: "Un prezzo si confronta solo sapendo cosa c'è dentro. Ecco cosa comprende questo preventivo, e cosa resta fuori.",
  voci: [
    v("Sopralluogo e rilievo", null, "sopralluogo"),
    v("Materiali indicati", null, "materiali"),
    v("Trasporto", null, "trasporto"),
    v("Posa e installazione", null, "installazione"),
    v("Protezione degli ambienti", null, "protezione"),
    v("Smaltimento dei materiali di risulta", null, "smaltimento"),
    v("Pulizia finale", null, "pulizia"),
    v("Collaudo", null, "collaudo"),
    v("Documentazione", null, "documenti"),
  ],
  escluse: [
    v("Lavori non indicati in questo preventivo", null, "escluso"),
    v("Opere murarie e finiture non indicate", null, "escluso"),
    v("Pratiche e permessi, se non indicati", null, "escluso"),
    v("Imprevisti scoperti in corso d'opera: li valutiamo insieme prima di procedere", null, "escluso"),
  ],
};

const COMPRESO: Partial<Record<SettoreBlocchi, Parziale>> = {
  serramenti: {
    voci: [
      v("Rilievo delle misure", null, "misura"),
      v("Smontaggio dei vecchi serramenti", null, "demolizione"),
      v("Trasporto", null, "trasporto"),
      v("Posa con sigillature", null, "installazione"),
      v("Protezione degli ambienti", null, "protezione"),
      v("Smaltimento dei vecchi serramenti", null, "smaltimento"),
      v("Regolazione e prova di funzionamento", null, "verifica"),
      v("Pulizia finale", null, "pulizia"),
      v("Documenti e garanzie", null, "documenti"),
    ],
    escluse: [
      v("Opere murarie e ripristini non indicati", null, "escluso"),
      v("Tinteggiature", null, "escluso"),
      v("Pratiche edilizie, dove servono", null, "escluso"),
      v("Accessori non elencati (zanzariere, oscuranti)", null, "escluso"),
    ],
  },
  fotovoltaico: {
    voci: [
      v("Sopralluogo tecnico", null, "sopralluogo"),
      v("Progetto dell'impianto", null, "progettazione"),
      v("Pratiche con Comune e distributore", null, "pratiche"),
      v("Pannelli, inverter e componenti indicati", null, "materiali"),
      v("Installazione", null, "installazione"),
      v("Collaudo e messa in servizio", null, "collaudo"),
      v("Dichiarazione di conformità", null, "conformita"),
      v("Configurazione del monitoraggio", null, "monitoraggio"),
    ],
    escluse: [
      v("Opere murarie o sulla copertura non indicate", null, "escluso"),
      v("Adeguamento dell'impianto elettrico esistente, se necessario", null, "escluso"),
      v("Linea vita e ponteggi, se non indicati", null, "escluso"),
      v("Eventuali costi richiesti dal distributore di rete", null, "escluso"),
    ],
  },
  bagni: {
    // Il bagno di prima, i lavori, il bagno finito: tutto quello che il prezzo comprende.
    foto: foto("bagni", "storia-prima-durante-dopo"),
    voci: [
      v("Sopralluogo e progetto del bagno", null, "progettazione"),
      v("Protezione della casa", null, "protezione"),
      v("Demolizione e smaltimento", null, "demolizione"),
      v("Impianto idrico e di scarico", null, "acqua"),
      v("Impermeabilizzazione", null, "strati"),
      v("Posa di pavimenti e rivestimenti", null, "installazione"),
      v("Sanitari e rubinetteria indicati", null, "materiali"),
      v("Prova di tenuta e collaudo", null, "collaudo"),
      v("Pulizia finale", null, "pulizia"),
      v("Dichiarazione di conformità", null, "conformita"),
    ],
    escluse: [
      v("Mobili e accessori non indicati", null, "escluso"),
      v("Lavori in altri locali", null, "escluso"),
      v("Colonne di scarico condominiali", null, "escluso"),
      v("Imprevisti scoperti con la demolizione: li valutiamo insieme prima di procedere", null, "escluso"),
    ],
  },
  ristrutturazione: {
    // Il ciclo dei lavori attorno alla casa: tutto quello che il prezzo comprende.
    foto: foto("ristrutturazione", "storia-ciclo-lavori"),
    voci: [
      v("Sopralluogo e rilievo", null, "sopralluogo"),
      v("Coordinamento dei lavori", null, "calendario"),
      v("Protezione di ambienti e parti comuni", null, "protezione"),
      v("Demolizioni e smaltimento", null, "demolizione"),
      v("Opere murarie", null, "muratura"),
      v("Impianti elettrico e idraulico", null, "energia"),
      v("Finiture indicate", null, "finiture"),
      v("Pulizia finale", null, "pulizia"),
      v("Collaudo e dichiarazioni di conformità", null, "conformita"),
    ],
    escluse: [
      v("Progettazione e pratiche edilizie, se non indicate", null, "escluso"),
      v("Arredi ed elettrodomestici", null, "escluso"),
      v("Lavori non indicati in questo preventivo", null, "escluso"),
      v("Imprevisti strutturali o negli impianti: li valutiamo insieme prima di procedere", null, "escluso"),
    ],
  },
};

const PROTEZIONE_BASE: Parziale = {
  occhiello: "Durante i lavori",
  titolo: "Trattiamo la tua casa *come se fosse la nostra*.",
  intro: "La prima paura, prima di un cantiere in casa, è ritrovarsela rovinata. Per questo la proteggiamo prima di iniziare e te la restituiamo pulita.",
  voci: [
    v("Pavimenti coperti", "Teli e cartoni sui percorsi di lavoro, dalla porta di casa alla stanza.", "protezione"),
    v("Mobili protetti", "Spostati o coperti prima di iniziare, rimessi a posto alla fine.", "casa"),
    v("Porte sigillate", "Teli con cerniera sulle stanze in lavorazione: la polvere resta lì.", "porta"),
    v("Polvere contenuta", "Aspirazione durante tagli e demolizioni, direttamente alla fonte.", "polvere"),
    v("Parti comuni protette", "In condominio, scale e ascensore coperti e puliti ogni giorno.", "chiavi"),
    v("Macerie in ordine", "Raccolte ogni giorno e portate via, mai lasciate in casa.", "smaltimento"),
    v("Pulizia finale", "Ti riconsegniamo gli ambienti puliti, pronti da vivere.", "pulizia"),
  ],
  foto: foto("comune", "protezione-ambienti", "pulizia-consegna"),
};

const PROTEZIONE: Partial<Record<SettoreBlocchi, Parziale>> = {
  serramenti: {
    intro: "Cambiare le finestre vuol dire lavorare dentro casa tua, stanza per stanza. La proteggiamo prima di smontare e te la restituiamo pulita.",
    voci: [
      v("Pavimenti e davanzali coperti", "Teli e cartoni sotto ogni finestra e lungo il percorso.", "protezione"),
      v("Muri protetti", "Le pareti vicino al vano restano pulite e integre.", "casa"),
      v("Polvere contenuta", "Lo smontaggio avviene con aspirazione, stanza per stanza.", "polvere"),
      v("Vecchi serramenti portati via", "Nessun ingombro lasciato in casa o in cortile.", "smaltimento"),
      v("Pulizia di vetri e ambienti", "A fine posa ti consegniamo le stanze pulite.", "pulizia"),
    ],
    foto: [...foto("serramenti", "protezione"), ...foto("comune", "pulizia-consegna")],
  },
  fotovoltaico: {
    occhiello: "In sicurezza",
    titolo: "Lavoriamo sul tuo tetto *in sicurezza*.",
    intro: "Il cantiere di un impianto fotovoltaico è quasi tutto sul tetto: la sicurezza di chi lavora e la cura della tua casa vengono prima di tutto.",
    voci: [
      v("Sicurezza sul tetto", "Operatori imbragati, protezioni e ancoraggi prima di salire.", "tecnico"),
      v("Tegole trattate con cura", "Spostate e rimesse a posto; quelle che si rompono le sostituiamo.", "casa"),
      v("Giardino e cortile protetti", "Materiali in un'area concordata con te, percorsi coperti.", "protezione"),
      v("Passaggi dei cavi puliti", "Canaline ordinate, fori sigillati, nessun filo a vista dove non serve.", "installazione"),
      v("Nessun rifiuto lasciato", "Imballi e scarti portati via a fine lavori.", "smaltimento"),
    ],
    foto: foto("fotovoltaico", "sicurezza-tetto"),
  },
  bagni: { foto: [...foto("bagni", "protezione"), ...foto("comune", "pulizia-consegna")] },
  ristrutturazione: { foto: foto("ristrutturazione", "protezione-scale", "cantiere-ordinato") },
};

const CONTROLLI_BASE: Parziale = {
  occhiello: "Controlli di qualità",
  titolo: "Prima della consegna *controlliamo ogni dettaglio*.",
  intro: "Il controllo non arriva solo alla fine: verifichiamo le lavorazioni mentre le facciamo, e a fine lavori le ricontrolliamo insieme a te.",
  voci: [
    v("Misure e livelli", null, "misura"),
    v("Fissaggi", null, "installazione"),
    v("Tenuta", null, "acqua"),
    v("Funzionamento", null, "verifica"),
    v("Finiture", null, "finiture"),
    v("Verbale di fine lavori", null, "documenti"),
  ],
  foto: foto("comune", "controllo-finale"),
};

const CONTROLLI: Partial<Record<SettoreBlocchi, Parziale>> = {
  serramenti: {
    voci: [
      v("Misure e squadro", "Ogni serramento in bolla e in squadro, prima di fissarlo.", "misura"),
      v("Fissaggi", "Tasselli e ancoraggi adatti al muro, nel numero giusto.", "installazione"),
      v("Sigillature", "Il giunto con il muro chiuso dentro, al centro e fuori.", "strati"),
      v("Tenuta all'acqua e all'aria", "Verifichiamo che acqua e spifferi restino fuori.", "acqua"),
      v("Apertura e chiusura", "Ante, maniglie e ferramenta regolate, una per una.", "verifica"),
      v("Pulizia e finiture", "Coprifili, davanzali e vetri puliti alla consegna.", "pulizia"),
    ],
    foto: foto("serramenti", "controllo-squadro", "controllo-tenuta-acqua"),
  },
  fotovoltaico: {
    voci: [
      v("Struttura e fissaggi", "Staffe e profili ancorati al tetto, controllati uno per uno.", "installazione"),
      v("Cablaggi e connettori", "Collegamenti serrati e protetti, stringa per stringa.", "energia"),
      v("Protezioni elettriche", "Sezionatori e protezioni installati e provati.", "protezione"),
      v("Prova di funzionamento", "Misure elettriche e prova dell'inverter prima della messa in servizio.", "verifica"),
      v("Monitoraggio attivo", "Ti lasciamo l'impianto collegato e visibile dal telefono.", "monitoraggio"),
      v("Verbale di collaudo", "Tutto scritto, e consegnato a te.", "documenti"),
    ],
    foto: foto("fotovoltaico", "controllo-termografico", "quadro-elettrico"),
  },
  bagni: {
    voci: [
      v("Impermeabilizzazione", "Controllata prima di posare le piastrelle, angoli compresi.", "acqua"),
      v("Pendenze", "L'acqua deve correre verso lo scarico, senza ristagni.", "strati"),
      v("Tenuta dell'impianto", "Prova in pressione prima di chiudere le pareti.", "verifica"),
      v("Silicone e fughe", "Continui, puliti, senza punti scoperti.", "finiture"),
      v("Sanitari e rubinetteria", "Montati, regolati e provati.", "installazione"),
      v("Pulizia finale", "Il bagno ti viene consegnato pronto da usare.", "pulizia"),
    ],
    foto: foto("bagni", "controllo-impermeabilizzazione", "storia-impermeabilizzazione"),
  },
  ristrutturazione: {
    voci: [
      v("Quote e livelli", "Pareti a piombo, pavimenti in piano, misure rispettate.", "misura"),
      v("Tenuta degli impianti", "Prove in pressione prima di chiudere tracce e massetti.", "verifica"),
      v("Impianto elettrico", "Verifiche e misure prima della consegna.", "energia"),
      v("Planarità", "Pavimenti e pareti controllati con la staggia.", "strati"),
      v("Finiture", "Stucchi, pitture e raccordi rivisti stanza per stanza.", "finiture"),
      v("Verbale di fine lavori", "Quello che abbiamo verificato, scritto e consegnato.", "documenti"),
    ],
    foto: foto("ristrutturazione", "controllo-planarita", "controllo-elettrico"),
  },
  tetti: { foto: foto("tetti", "controllo-termico") },
  climatizzazione: { foto: foto("climatizzazione", "controllo-collaudo") },
};

const DOCUMENTI_BASE: Parziale = {
  occhiello: "A fine lavori",
  titolo: "Ti consegniamo *un fascicolo completo*.",
  intro: "Quando il cantiere finisce, i documenti restano: ti servono per le garanzie, per la manutenzione e, se previste, per le detrazioni.",
  voci: [
    v("Dichiarazioni di conformità degli impianti", null, "conformita"),
    v("Schede tecniche dei prodotti", null, "documenti"),
    v("Manuali d'uso e manutenzione", null, "documenti"),
    v("Certificati di garanzia", null, "garanzia"),
    v("Foto delle lavorazioni", null, "foto"),
    v("Verbale di collaudo", null, "verifica"),
    v("Documenti per le detrazioni, se previste", null, "detrazione"),
    v("Fatture", null, "pagamento"),
  ],
  foto: foto("comune", "consegna-documenti"),
};

const DOCUMENTI: Partial<Record<SettoreBlocchi, Parziale>> = {
  serramenti: {
    voci: [
      v("Dichiarazione di prestazione e marcatura CE", null, "conformita"),
      v("Schede tecniche dei serramenti", null, "documenti"),
      v("Certificati di garanzia", null, "garanzia"),
      v("Istruzioni d'uso e manutenzione", null, "documenti"),
      v("Documenti per le detrazioni, se previste", null, "detrazione"),
      v("Fatture", null, "pagamento"),
    ],
    foto: foto("serramenti", "storia-consegna-collaudo"),
  },
  fotovoltaico: {
    voci: [
      v("Dichiarazione di conformità dell'impianto", null, "conformita"),
      v("Pratiche con distributore e GSE", null, "pratiche"),
      v("Schede tecniche e garanzie dei produttori", null, "garanzia"),
      v("Manuali d'uso e manutenzione", null, "documenti"),
      v("Accesso al monitoraggio", null, "monitoraggio"),
      v("Documenti per la detrazione, se prevista", null, "detrazione"),
      v("Fatture", null, "pagamento"),
    ],
    foto: foto("fotovoltaico", "consegna-app"),
  },
};

const DIARIO_BASE: Parziale = {
  occhiello: "Diario dei lavori",
  titolo: "Il tuo cantiere, *documentato*.",
  intro: "Fotografiamo le fasi del lavoro, soprattutto quelle che poi resteranno nascoste: tubazioni, impermeabilizzazioni, isolamenti. Le ritrovi nel fascicolo di fine lavori.",
  voci: [
    v("Prima dell'intervento", "Com'era, per poter confrontare.", "foto"),
    v("Lavorazioni nascoste", "Impianti e strati prima di chiuderli.", "strati"),
    v("Materiali installati", "Cosa è stato messo, e dove.", "materiali"),
    v("Controlli e collaudo", "Le prove fatte, con il loro esito.", "verifica"),
    v("Risultato finale", "Il lavoro consegnato.", "casa"),
  ],
  foto: foto("comune", "lavorazioni-nascoste"),
};

const DIARIO: Partial<Record<SettoreBlocchi, Parziale>> = {
  serramenti: {
    intro: "Fotografiamo la posa di ogni serramento, anche i punti che poi saranno coperti da coprifili e intonaco: ancoraggi, sigillature, raccordi con il muro.",
    voci: [
      v("Prima dell'intervento", "I vecchi serramenti e i vani, com'erano.", "foto"),
      v("Posa e sigillature", "I punti che poi saranno coperti.", "strati"),
      v("Serramenti installati", "Cosa è stato messo, e dove.", "materiali"),
      v("Risultato finale", "Il lavoro consegnato.", "casa"),
    ],
    foto: foto("serramenti", "rilievo", "risultato"),
  },
  fotovoltaico: {
    intro: "Fotografiamo l'impianto mentre lo montiamo: ancoraggi, passaggi dei cavi, collegamenti. Le foto restano con i documenti dell'impianto.",
    voci: [
      v("Il tetto prima dei lavori", "Com'era, per poter confrontare.", "foto"),
      v("Ancoraggi e struttura", "Quello che poi resta sotto i pannelli.", "installazione"),
      v("Cavi e collegamenti", "Percorsi e protezioni.", "energia"),
      v("Impianto finito", "Il lavoro consegnato.", "sole"),
    ],
    foto: foto("fotovoltaico", "installazione"),
  },
  bagni: { foto: foto("bagni", "demolizione", "risultato-moderno") },
  // Prima, durante e dopo in un'immagine sola, a tutta larghezza.
  ristrutturazione: { foto: foto("ristrutturazione", "storia-prima-durante-dopo") },
  piscine: { foto: foto("piscine", "storia-prima-durante-dopo") },
};

const TABELLE: Record<ChiaveBlocco, { base: Parziale | null; perSettore: Partial<Record<SettoreBlocchi, Parziale>> }> = {
  comeFunziona: { base: null, perSettore: COME_FUNZIONA },
  compreso: { base: COMPRESO_BASE, perSettore: COMPRESO },
  protezione: { base: PROTEZIONE_BASE, perSettore: PROTEZIONE },
  controlli: { base: CONTROLLI_BASE, perSettore: CONTROLLI },
  documenti: { base: DOCUMENTI_BASE, perSettore: DOCUMENTI },
  diario: { base: DIARIO_BASE, perSettore: DIARIO },
};

const VUOTO: ContenutoBlocco = { occhiello: "", titolo: "", intro: null, voci: [], escluse: [], foto: [], nota: null };

/** Il blocco com'è di serie per un settore. */
export function bloccoDiSerie(chiave: ChiaveBlocco, settore: SettoreBlocchi): ContenutoBlocco {
  const { base, perSettore } = TABELLE[chiave];
  const proprio = perSettore[settore] ?? {};
  const unito: ContenutoBlocco = { ...VUOTO, ...(base ?? {}), ...proprio };
  // Una pagina con foto di serie lo dice: il cliente non deve credere di vedere un cantiere dell'azienda.
  if (unito.nota == null && unito.foto.length > 0) unito.nota = NOTA_FOTO;
  return unito;
}

// ─── La libreria delle foto (public/pdf-stock) ───────────────────────────────

/** Le foto di serie per cartella: quelle del settore e quelle comuni a tutti. */
export const FOTO_LIBRERIA: Record<string, string[]> = {
  bagni: ["controllo-impermeabilizzazione", "demolizione", "installazione", "protezione", "risultato-classico", "risultato-moderno", "storia-impermeabilizzazione", "storia-prima-durante-dopo", "tecnica-doccia", "tecnica-doccia-spaccato", "tecnica-impianto-idraulico"],
  climatizzazione: ["controllo-collaudo", "installazione", "storia-prima-durante-dopo", "tecnica-estate-inverno", "tecnica-multisplit"],
  comune: ["consegna-documenti", "controllo-finale", "lavorazioni-nascoste", "protezione-ambienti", "pulizia-consegna", "storia-assistenza"],
  fotovoltaico: ["auto-elettrica-wallbox", "azienda-agricola", "batteria-modulare", "capannone", "co2-alberi", "co2-auto", "co2-bosco", "co2-voli", "componenti-elettrici", "consegna-app", "controllo-termografico", "dettaglio-celle", "fasi-installatori", "installazione", "inverter-batteria-garage", "inverter-monofase", "inverter-trifase", "investimento-impianto", "kit-fissaggio", "monitoraggio-app", "pannelli-neve", "pannelli-nuvoloso", "pannelli-pioggia", "pannello-bifacciale", "pannello-standard", "pannello-total-black", "quadro-elettrico", "sicurezza-tetto", "sopralluogo", "storia-bolletta-beneficio", "storia-bolletta-serena", "storia-drone-termografia", "storia-energia-serale", "storia-flusso-energia", "tecnica-giorno-sera", "tecnica-percorso-energia", "villa-tetto-coppi", "villa-tetto-piano", "villa-tramonto", "vista-drone", "wallbox"],
  pavimenti: ["installazione", "storia-prima-durante-dopo", "tecnica-giunto", "tecnica-stratigrafia"],
  pergole: ["installazione", "storia-prima-dopo", "tecnica-acqua", "tecnica-lamelle"],
  piscine: ["installazione", "storia-prima-durante-dopo", "tecnica-filtrazione", "tecnica-vasca"],
  ristrutturazione: ["cantiere", "cantiere-ordinato", "controllo-elettrico", "controllo-planarita", "protezione-scale", "risultato", "storia-ciclo-lavori", "storia-consegna-chiavi", "storia-prima-durante-dopo", "tecnica-casa-sezionata", "tecnica-riscaldamento-pavimento"],
  serramenti: ["controllo-squadro", "controllo-tenuta-acqua", "installazione", "protezione", "rilievo", "risultato", "storia-consegna-collaudo", "storia-famiglia-inverno", "storia-freddo-caldo", "storia-portafinestra", "storia-prima-durante-dopo", "storia-pulizia", "storia-sopralluogo-posa", "storia-termocamera", "tecnica-canalina", "tecnica-posa", "tecnica-prima-dopo"],
  tetti: ["controllo-termico", "installazione", "storia-prima-durante-dopo", "storia-strati", "tecnica-dispersione", "tecnica-tetto-ventilato"],
};

/** Le foto che l'editor propone per un settore: le sue, poi le comuni. */
export function fotoDellaLibreria(settore: SettoreBlocchi): Array<{ url: string; nome: string }> {
  const cartelle = [settore, "comune"];
  return cartelle.flatMap((c) => (FOTO_LIBRERIA[c] ?? []).map((f) => ({ url: `/pdf-stock/${c}/${f}.jpg`, nome: f.replace(/-/g, " ") })));
}

// ─── Le scelte dell'azienda ──────────────────────────────────────────────────

const testo = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

function leggiVoci(grezze: unknown): VoceBlocco[] | null {
  if (!Array.isArray(grezze)) return null;
  const voci = grezze
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === "object")
    .map((g) => ({ titolo: testo(g.titolo) ?? "", testo: testo(g.testo), icona: eIcona(g.icona) ? g.icona : null }))
    .filter((g) => g.titolo);
  return voci.length > 0 ? voci : null;
}

/**
 * Il blocco che esce: quello di serie, con sopra ciò che l'azienda ha cambiato.
 * Un campo vuoto o un elenco vuoto torna di serie; per togliere le foto c'è
 * `senzaFoto`, per togliere l'intera pagina l'interruttore del blocco.
 */
export function leggiBlocco(chiave: ChiaveBlocco, settore: SettoreBlocchi, salvati: unknown): ContenutoBlocco {
  const serie = bloccoDiSerie(chiave, settore);
  const tutti = salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {};
  const s = tutti[chiave] && typeof tutti[chiave] === "object" ? (tutti[chiave] as Record<string, unknown>) : {};
  const fotoSalvate = Array.isArray(s.foto) ? (s.foto as unknown[]).map(testo).filter((u): u is string => Boolean(u)) : [];
  const foto = s.senzaFoto === true ? [] : fotoSalvate.length > 0 ? fotoSalvate : serie.foto;
  return {
    occhiello: testo(s.occhiello) ?? serie.occhiello,
    titolo: testo(s.titolo) ?? serie.titolo,
    intro: s.intro === "" ? null : testo(s.intro) ?? serie.intro,
    voci: leggiVoci(s.voci) ?? serie.voci,
    escluse: leggiVoci(s.escluse) ?? serie.escluse,
    foto,
    // La nota sulle foto di serie resta finché resta almeno una foto di serie.
    nota: testo(s.nota) ?? (foto.some(eFotoDiSerie) ? serie.nota ?? NOTA_FOTO : null),
  };
}

/** Il settore dei blocchi per un modulo: la chiave del modulo, o quello di Serramenti e Fotovoltaico. */
export function settoreBlocchi(modulo: string): SettoreBlocchi {
  const noti: SettoreBlocchi[] = ["serramenti", "fotovoltaico", "ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"];
  return (noti as string[]).includes(modulo) ? (modulo as SettoreBlocchi) : "ristrutturazione";
}

// ─── Le foto delle pagine ────────────────────────────────────────────────────

/**
 * Una foto sola in una pagina che non è un blocco: la chiusura dei documenti
 * edili, il percorso e il confronto di Serramenti, le garanzie del Fotovoltaico…
 * Riempie lo spazio che quelle pagine lasciavano bianco. È di serie per settore
 * e l'azienda la cambia o la toglie: sta in `pdf_blocchi` sotto «pagina_<chiave>»,
 * con la forma dei blocchi ({ foto: [indirizzo], senzaFoto }), così la firma
 * delle foto private (_shared/immaginiModelloPdf.ts) la copre già.
 */
export type ChiaveFotoPagina =
  | "chiusura" | "percorso" | "confronto" | "cta"
  | "garanzie" | "bollette" | "decisione" | "componenti" | "costi" | "cassa" | "piano";

export const FOTO_PAGINE_ETICHETTE: Record<ChiaveFotoPagina, string> = {
  chiusura: "Foto dei prossimi passi",
  percorso: "Foto del percorso",
  confronto: "Foto del confronto",
  cta: "Foto della pagina finale",
  garanzie: "Foto delle garanzie",
  bollette: "Foto di «Perché farlo ora»",
  decisione: "Foto della pagina finale",
  componenti: "Foto dei componenti",
  costi: "Foto dei costi futuri",
  cassa: "Foto della cassa a 25 anni",
  piano: "Foto del piano economico",
};

/** Le foto di serie: «cartella/file» in public/pdf-stock. */
const FOTO_PAGINE: Partial<Record<SettoreBlocchi, Partial<Record<ChiaveFotoPagina, string>>>> = {
  serramenti: {
    percorso: "serramenti/storia-prima-durante-dopo",
    confronto: "serramenti/storia-termocamera",
    cta: "serramenti/storia-famiglia-inverno",
  },
  fotovoltaico: {
    garanzie: "fotovoltaico/villa-tramonto",
    bollette: "fotovoltaico/storia-bolletta-beneficio",
    decisione: "fotovoltaico/storia-energia-serale",
    componenti: "fotovoltaico/inverter-batteria-garage",
    costi: "fotovoltaico/storia-bolletta-serena",
    cassa: "fotovoltaico/villa-tetto-coppi",
    piano: "fotovoltaico/monitoraggio-app",
  },
  bagni: { chiusura: "bagni/risultato-moderno" },
  ristrutturazione: { chiusura: "ristrutturazione/risultato" },
  tetti: { chiusura: "tetti/installazione" },
  climatizzazione: { chiusura: "climatizzazione/installazione" },
  elettrico: { chiusura: "ristrutturazione/controllo-elettrico" },
  termoidraulico: { chiusura: "ristrutturazione/risultato" },
  pavimenti: { chiusura: "pavimenti/installazione" },
  piscine: { chiusura: "piscine/storia-prima-durante-dopo" },
};

export const chiaveSalvataFotoPagina = (chiave: ChiaveFotoPagina): string => `pagina_${chiave}`;

/** La foto di serie di una pagina per un settore, o null se quella pagina non ne ha. */
export function fotoPaginaDiSerie(chiave: ChiaveFotoPagina, settore: SettoreBlocchi): string | null {
  const file = FOTO_PAGINE[settore]?.[chiave];
  return file ? `/pdf-stock/${file}.jpg` : null;
}

/** La foto che esce in quella pagina: quella scelta dall'azienda, altrimenti quella di serie. */
export function leggiFotoPagina(chiave: ChiaveFotoPagina, settore: SettoreBlocchi, salvati: unknown): string | null {
  const tutti = salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {};
  const s = tutti[chiaveSalvataFotoPagina(chiave)];
  const scelta = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  if (scelta.senzaFoto === true) return null;
  const propria = Array.isArray(scelta.foto) ? (scelta.foto as unknown[]).map(testo).find(Boolean) : null;
  return propria ?? fotoPaginaDiSerie(chiave, settore);
}
