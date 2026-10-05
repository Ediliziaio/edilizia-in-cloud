/**
 * Le esigenze di serie dei preventivatori edili: le voci pronte da spuntare quando
 * l'azienda non ha ancora scritto la sua libreria (le «esigenze» del modello PDF).
 * Servono perché lo strumento si usi subito, con un clic, senza scrivere niente.
 *
 * Il tono è quello del PDF del cliente: «tu», frasi corte, il problema come lo dice
 * lui e cosa facciamo, senza promettere numeri. Una promessa («risparmi il 30%»)
 * non si scrive mai di serie: la scrive l'azienda se può mantenerla.
 */
import { PRESET_ESIGENZE, PRESET_ESIGENZE_ALT, PRESET_ESIGENZE_FAMIGLIA } from "@/lib/serramenti/presets";
import type { EsigenzaCliente } from "./esigenze";

export type ModuloConEsigenze =
  | "bagni"
  | "tetti"
  | "climatizzazione"
  | "elettrico"
  | "termoidraulico"
  | "pavimenti"
  | "piscine"
  | "ristrutturazione";

const voce = (titolo: string, descrizione: string): EsigenzaCliente => ({ titolo, descrizione });

export const ESIGENZE_DI_SERIE: Record<ModuloConEsigenze, EsigenzaCliente[]> = {
  bagni: [
    voce("Muffa e umidità alle pareti", "Macchie scure e odore di chiuso nascono da ventilazione e impermeabilizzazione che non bastano. Prevediamo guaine, rivestimenti e aerazione adatti al tuo bagno."),
    voce("Perdite e infiltrazioni", "Un'infiltrazione si risolve davvero solo trovando la causa. Controlliamo scarichi, tubazioni e guaine prima di chiudere pareti e pavimento."),
    voce("Doccia o vasca scomoda", "Entrare e uscire deve essere facile oggi e tra vent'anni. Possiamo proporti un piatto a filo, un sedile o dei maniglioni dove servono."),
    voce("Bagno datato", "Rivestimenti e sanitari invecchiati si notano ogni mattina. Scegliamo materiali, sanitari e luci coerenti con lo stile della casa."),
    voce("Poco spazio, poca luce", "Anche un bagno piccolo può funzionare bene: sanitari sospesi, nicchie e luci ben posizionate liberano spazio."),
    voce("Accessibilità per anziani o disabili", "Doccia senza gradino, sanitari all'altezza giusta e superfici antiscivolo. Valutiamo con te anche le detrazioni che possono spettarti."),
  ],
  tetti: [
    voce("Infiltrazioni d'acqua", "Macchie sul soffitto dopo la pioggia vengono da manto, scossaline o impermeabilizzazione da rivedere. Troviamo il punto esatto prima di intervenire."),
    voce("Freddo d'inverno, caldo d'estate", "Un tetto non isolato disperde calore in inverno e lo fa entrare d'estate. Valutiamo isolamento e ventilazione della copertura."),
    voce("Tegole rotte o spostate", "Con gli anni e dopo i temporali il manto si muove. Sostituiamo o riallineiamo gli elementi danneggiati."),
    voce("Grondaie e scossaline", "Grondaie che traboccano e scossaline staccate portano l'acqua dove non deve andare. Le sistemiamo o le rifacciamo."),
    voce("Manto a fine vita", "Quando le riparazioni diventano troppo frequenti, rifare la copertura conviene. Ti diciamo con chiarezza quando è il caso."),
    voce("Copertura in eternit", "Se il tetto è in cemento-amianto, valutiamo con te rimozione e rifacimento nel rispetto della normativa."),
  ],
  climatizzazione: [
    voce("Caldo d'estate in casa", "Le stanze esposte al sole non si rinfrescano con un ventilatore. Dimensioniamo il climatizzatore su metri quadrati ed esposizione."),
    voce("Freddo d'inverno", "Se il riscaldamento attuale non basta, una pompa di calore può scaldare d'inverno e rinfrescare d'estate con un solo impianto."),
    voce("Bolletta alta", "Un impianto vecchio consuma più del necessario. Confrontiamo i consumi di oggi con quelli del nuovo impianto."),
    voce("Aria umida o stantia", "Umidità e aria ferma si trattano con deumidificazione e ricambio d'aria scelti per i tuoi ambienti."),
    voce("Rumore dell'unità", "Il rumore dipende da modello e posizione dell'unità esterna. La scegliamo e la mettiamo dove disturba meno."),
    voce("Un solo impianto per tutta la casa", "Split in ogni stanza o impianto canalizzato: ti spieghiamo cosa conviene alla tua casa e al tuo budget."),
  ],
  elettrico: [
    voce("Impianto vecchio, non a norma", "Se il salvavita scatta o i fili sono quelli di una volta, l'impianto va messo a norma. A fine lavori rilasciamo la dichiarazione di conformità."),
    voce("Salta la corrente", "Troppi apparecchi su una sola linea fanno scattare l'interruttore. Rifacciamo quadro e linee sul carico reale."),
    voce("Poche prese, nei posti sbagliati", "Prese e punti luce dove servono davvero: in cucina, in camera, in garage."),
    voce("Ricarica per l'auto elettrica", "Ricaricare a casa in sicurezza richiede una linea dedicata e un quadro adeguato."),
    voce("Luce scarsa o fastidiosa", "Punti luce e faretti ben distribuiti cambiano le stanze. Pensiamo l'illuminazione insieme a te."),
    voce("Sicurezza e controllo da telefono", "Allarme, videocitofono e luci comandate dal telefono: li predisponiamo già nell'impianto."),
  ],
  termoidraulico: [
    voce("Caldaia vecchia o rumorosa", "Una caldaia a fine vita consuma di più e si ferma nei giorni più freddi. La sostituiamo con un generatore adatto alla tua casa."),
    voce("Poca acqua calda", "Se la doccia diventa fredda, il problema è nel generatore o nell'accumulo. Lo dimensioniamo sulle persone che vivono in casa."),
    voce("Bolletta del gas alta", "Confrontiamo consumi e costi di oggi con quelli di una caldaia a condensazione o di una pompa di calore."),
    voce("Termosifoni freddi", "Aria nei circuiti o impianto sbilanciato: lo sfoghiamo e lo bilanciamo perché scaldi in modo uniforme."),
    voce("Perdite nell'impianto", "Gocciolamenti e pressione che cala si cercano e si riparano rompendo solo il necessario."),
    voce("Calcare nell'acqua", "Il calcare rovina caldaia e rubinetti. Valutiamo con te un addolcitore o un trattamento dell'acqua."),
  ],
  pavimenti: [
    voce("Pavimento rovinato", "Piastrelle crepate o parquet segnato: ti diciamo quando conviene ripristinare e quando sostituire."),
    voce("Umidità dal pavimento", "Se il pavimento suda o si stacca, il problema sta sotto. Controlliamo massetto e barriera prima di posare."),
    voce("Freddo sotto i piedi", "Un isolamento sotto il pavimento, o il riscaldamento a pavimento, cambia il comfort delle stanze."),
    voce("Scivoloso o difficile da pulire", "Scegliamo finiture antiscivolo e materiali che si puliscono in fretta, soprattutto in cucina, bagno ed esterni."),
    voce("Rumore dei passi", "Un sottofondo acustico riduce il rumore verso chi abita sotto di te."),
    voce("Stile datato", "Formato, colore e posa cambiano il carattere di una stanza. Ti mostriamo le alternative."),
  ],
  piscine: [
    voce("Acqua che si sporca in fretta", "Filtrazione e ricircolo dimensionati bene tengono l'acqua pulita con meno fatica."),
    voce("Consumi alti di pompa e riscaldamento", "Pompe a velocità variabile e coperture riducono i consumi: ne valutiamo i costi con te."),
    voce("Rivestimento che perde o si rovina", "Un rivestimento a fine vita perde acqua e si sporca: lo rifacciamo e controlliamo la tenuta."),
    voce("Manutenzione che pesa", "Dosaggio automatico e robot riducono il lavoro di ogni settimana."),
    voce("Sicurezza dei bambini", "Coperture, recinzioni e scale antiscivolo: prevediamo ciò che serve alla tua famiglia."),
    voce("Vuoi usarla più mesi all'anno", "Pompa di calore e copertura allungano la stagione: valutiamo con te l'investimento."),
  ],
  ristrutturazione: [
    voce("Casa datata e poco funzionale", "Stanze chiuse e percorsi scomodi: ridisegniamo gli spazi per come vivi oggi."),
    voce("Freddo, spifferi e bollette alte", "Isolamento, serramenti e impianti vanno visti insieme: costruiamo un piano dei lavori in ordine logico."),
    voce("Umidità e muffa", "Capiamo da dove arriva prima di coprirla con la pittura."),
    voce("Impianti da rifare", "Elettrico e idraulico si rifanno prima di chiudere pareti e pavimenti: costa meno farlo adesso."),
    voce("Cantiere che non finisce mai", "Tempi e fasi scritti chiari: sai cosa succede ogni settimana e chi fa cosa."),
    voce("Detrazioni fiscali", "Valutiamo con te quali lavori possono rientrare nelle detrazioni; la verifica finale spetta al tuo commercialista."),
  ],
};

/**
 * Serramenti ha già i suoi testi pronti (`lib/serramenti/presets`): sono quelli che il
 * venditore trova da subito, se l'azienda non ha ancora scritto la libreria.
 */
export const ESIGENZE_DI_SERIE_SERRAMENTI: EsigenzaCliente[] = [
  ...PRESET_ESIGENZE,
  ...PRESET_ESIGENZE_ALT,
  ...PRESET_ESIGENZE_FAMIGLIA,
].map(({ titolo, descrizione }) => ({ titolo, descrizione }));
