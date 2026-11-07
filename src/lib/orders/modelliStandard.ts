/**
 * I modelli standard di EdiliziaInCloud, uno per tipo di lavoro (07/11/2026).
 *
 * Prima erano solo nomi di fasi: le date della nuova commessa dividevano il tempo
 * in parti uguali. Ora ogni fase ha le sue sottofasi con i giorni di lavoro tipici,
 * così una commessa nasce con un calendario credibile (i serramenti aspettano la
 * merce, il massetto asciuga, il fotovoltaico aspetta l'allaccio). Sono stime da
 * cui partire: l'azienda le importa e le adatta, o le cambia nella commessa.
 *
 * `in_parallelo`: la sottofase corre accanto alla precedente e non allunga la fase.
 * Modulo puro.
 */
import type { FaseModello, SottofaseModello } from "./modelliFasi";

export interface ModelloStandard {
  key: string;
  label: string;
  hint: string;
  fasi: FaseModello[];
}

/** Una sottofase: nome, giorni di lavoro, peso nell'avanzamento (1 se non detto), in parallelo. */
const s = (nome: string, giorni: number, peso = 1, in_parallelo = false): SottofaseModello =>
  ({ nome, giorni, peso, ...(in_parallelo ? { in_parallelo } : {}) });
const f = (nome: string, ...sottofasi: SottofaseModello[]): FaseModello => ({ nome, sottofasi });

export const MODELLI_STANDARD: ModelloStandard[] = [
  {
    key: "fotovoltaico",
    label: "Fotovoltaico",
    hint: "Dal sopralluogo all'allaccio dell'impianto",
    fasi: [
      f("Sopralluogo e preparazione", s("Sopralluogo tecnico", 1), s("Progetto e pratiche di avvio", 2)),
      f("Strutture e moduli", s("Sicurezza in copertura", 1), s("Strutture di fissaggio", 1, 2), s("Posa moduli", 1, 2)),
      f("Collegamenti e inverter", s("Inverter e quadri", 1, 2), s("Accumulo", 1, 1, true), s("Cablaggi e messa in servizio", 1)),
      f("Verifiche, collaudo e consegna", s("Collaudo e verifiche", 1), s("Consegna e app al cliente", 1, 1, true)),
      f("Pratiche e allaccio", s("Comunicazione al distributore", 1), s("Attesa allaccio del distributore", 15)),
    ],
  },
  {
    key: "ristrutturazione_completa",
    label: "Ristrutturazione completa",
    hint: "Appartamento/villa a 360°",
    fasi: [
      f("Demolizioni e rimozioni", s("Protezioni e allestimento", 1), s("Demolizioni", 3, 3), s("Sgombero macerie", 1)),
      f("Opere murarie", s("Tramezzi e chiusure", 6, 3), s("Assistenze murarie", 4, 2)),
      f("Impianto idraulico", s("Scarichi e adduzioni", 4, 2), s("Prova di tenuta", 1)),
      f("Impianto elettrico", s("Tracce e linee", 4, 2), s("Quadro e verifiche", 1)),
      f("Massetti e sottofondi", s("Massetti", 3, 2), s("Asciugatura", 7)),
      f("Intonaci e cartongessi", s("Intonaci", 5, 2), s("Cartongessi e controsoffitti", 3, 2, true)),
      f("Posa pavimenti e rivestimenti", s("Pavimenti", 5, 2), s("Rivestimenti", 5, 2)),
      f("Serramenti", s("Posa serramenti e porte", 3)),
      f("Tinteggiature", s("Stuccature e preparazione", 2), s("Tinteggiatura", 3, 2)),
      f("Finiture e pulizie finali", s("Frutti, sanitari e accessori", 2), s("Pulizie e consegna", 1)),
    ],
  },
  {
    key: "ristrutturazione_bagno",
    label: "Ristrutturazione bagno",
    hint: "Rifacimento bagno chiavi in mano",
    fasi: [
      f("Demolizioni e rimozioni", s("Protezione degli ambienti", 1), s("Smontaggio sanitari", 1), s("Demolizione rivestimenti e massetto", 2, 2)),
      f("Impianto idraulico", s("Nuovi scarichi e adduzioni", 2, 2), s("Prova di tenuta", 1)),
      f("Impianto elettrico", s("Tracce, linee e punti luce", 1)),
      f("Massetti e impermeabilizzazione", s("Massetto", 1), s("Asciugatura", 3), s("Impermeabilizzazione", 1)),
      f("Posa rivestimenti e pavimenti", s("Pavimento", 2, 2), s("Rivestimenti", 3, 2)),
      f("Sanitari e accessori", s("Sanitari e rubinetteria", 1), s("Accessori e specchi", 1, 1, true)),
      f("Box doccia e serramenti", s("Box doccia", 1)),
      f("Silicature e finiture", s("Silicature", 1), s("Pulizie e consegna", 1)),
    ],
  },
  {
    key: "nuova_costruzione",
    label: "Nuova costruzione",
    hint: "Edificio da zero",
    fasi: [
      f("Scavi e fondazioni", s("Tracciamento e scavi", 5, 2), s("Fondazioni", 10, 3)),
      f("Struttura portante (c.a./muratura)", s("Struttura", 30, 3)),
      f("Copertura e tetto", s("Copertura", 10, 2)),
      f("Tamponamenti e tramezzi", s("Tamponamenti", 10, 2), s("Tramezzi", 8, 2)),
      f("Impianto idraulico", s("Impianto idraulico", 8)),
      f("Impianto elettrico", s("Impianto elettrico", 8)),
      f("Massetti e sottofondi", s("Massetti", 5), s("Asciugatura", 10)),
      f("Intonaci e cartongessi", s("Intonaci e cartongessi", 12)),
      f("Serramenti", s("Posa serramenti", 5)),
      f("Posa pavimenti e rivestimenti", s("Pavimenti e rivestimenti", 15)),
      f("Tinteggiature", s("Tinteggiature", 8)),
      f("Finiture e pulizie finali", s("Finiture", 5), s("Pulizie e consegna", 2)),
    ],
  },
  {
    key: "cappotto_facciata",
    label: "Cappotto / Facciata",
    hint: "Isolamento e rifacimento facciata",
    fasi: [
      f("Ponteggio e allestimento cantiere", s("Montaggio ponteggio", 2)),
      f("Preparazione del supporto", s("Pulizia e ripristini", 3)),
      f("Posa pannelli isolanti", s("Incollaggio pannelli", 6, 2), s("Tasselli", 2)),
      f("Rasatura e rete armata", s("Rasatura con rete", 4, 2), s("Seconda rasatura", 1)),
      f("Finitura e tinteggiatura", s("Intonachino di finitura", 4, 2), s("Davanzali e dettagli", 1)),
      f("Smontaggio ponteggio e pulizie", s("Smontaggio ponteggio", 2), s("Pulizie", 1, 1, true)),
    ],
  },
  {
    key: "serramenti_infissi",
    label: "Serramenti / Infissi",
    hint: "Dalle misure alla posa, con l'attesa della merce",
    fasi: [
      f("Rilievo misure", s("Rilievo misure definitive", 1), s("Conferma misure con il cliente", 1)),
      f("Ordine al fornitore", s("Ordine e conferma d'ordine", 1)),
      f("Produzione e consegna", s("Attesa merce dal fornitore", 20), s("Arrivo e controllo in magazzino", 1)),
      f("Rimozione vecchi serramenti", s("Smontaggio e smaltimento", 1)),
      f("Posa nuovi serramenti", s("Posa", 2, 3), s("Sigillature e finiture", 1)),
      f("Oscuranti e zanzariere", s("Persiane, tapparelle o scuri", 1), s("Zanzariere", 1, 1, true)),
      f("Collaudo e pulizie", s("Collaudo e regolazioni", 1), s("Pulizie e consegna", 1, 1, true)),
    ],
  },
  {
    key: "impianti",
    label: "Impianti",
    hint: "Elettrico, idraulico, clima",
    fasi: [
      f("Tracce e predisposizioni", s("Tracce e scatole", 2)),
      f("Impianto elettrico", s("Linee e quadro", 3, 2), s("Frutti e verifiche", 1)),
      f("Impianto idraulico", s("Tubazioni e scarichi", 3, 2), s("Prova di tenuta", 1)),
      f("Climatizzazione / riscaldamento", s("Macchine e collegamenti", 2, 2), s("Messa in funzione", 1)),
      f("Collaudi e certificazioni", s("Collaudo", 1), s("Dichiarazione di conformità", 1)),
    ],
  },
  {
    key: "tetto_copertura",
    label: "Tetto / Copertura",
    hint: "Rifacimento copertura",
    fasi: [
      f("Ponteggio e sicurezza", s("Ponteggio", 2), s("Linea vita", 1, 1, true)),
      f("Rimozione manto esistente", s("Rimozione e smaltimento", 2)),
      f("Struttura e coibentazione", s("Struttura", 2, 2), s("Isolante", 2)),
      f("Impermeabilizzazione / guaina", s("Guaina", 2)),
      f("Posa manto di copertura", s("Manto", 4, 2)),
      f("Lattoneria e pluviali", s("Lattoneria", 2)),
      f("Smontaggio e pulizie", s("Smontaggio ponteggio e pulizie", 1)),
    ],
  },
  {
    key: "pavimenti",
    label: "Pavimenti",
    hint: "Rifacimento o posa di pavimenti",
    fasi: [
      f("Preparazione del fondo", s("Rimozione del vecchio pavimento", 1), s("Livellamento", 1)),
      f("Posa", s("Posa del pavimento", 4, 3)),
      f("Battiscopa e finiture", s("Battiscopa e soglie", 1)),
      f("Pulizie e consegna", s("Pulizie e consegna", 1)),
    ],
  },
  {
    key: "pittura",
    label: "Pittura e cartongesso",
    hint: "Tinteggiature interne ed esterne",
    fasi: [
      f("Protezioni e preparazione", s("Protezioni di pavimenti e arredi", 1)),
      f("Stuccature e carteggiatura", s("Stuccature", 1), s("Carteggiatura", 1)),
      f("Tinteggiatura", s("Prima mano", 1), s("Seconda mano", 1)),
      f("Ritocchi e pulizie", s("Ritocchi e pulizie", 1)),
    ],
  },
];
