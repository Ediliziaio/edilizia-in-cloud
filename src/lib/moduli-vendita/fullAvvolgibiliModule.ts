import type { SrEditorialContent } from "./fullSerramentiFactory";

export const avvolgibiliContent: SrEditorialContent = {
  id: "avvolgibili", cover: "/module-art/serramenti-avvolgibili-cover.jpg",
  hero: "La luce che scegli.\nIl gesto di ogni giorno.", subtitle: "Avvolgibili e cassonetti: componenti compatibili, comandi chiari e lavorazioni definite.", eyebrow: "AVVOLGIBILI E CASSONETTI",
  needs: [
    ["Usare ogni apertura con facilità", "Individuare dove lo scorrimento è difficoltoso e scegliere il comando in base all'utilizzo quotidiano."],
    ["Sapere cosa va sostituito", "Distinguere telo, guide, rullo, comando e cassonetto, verificando quali parti esistenti si possono conservare."],
    ["Chiarire tutte le lavorazioni", "Separare fornitura, installazione e gli eventuali collegamenti, adattamenti e ripristini necessari."],
  ],
  solution: [
    ["Una configurazione per ogni vano", "Materiale e colore del telo, guide e comando sono identificati insieme alle misure da confermare."],
    ["Ingombri verificati prima dell'ordine", "Spazio di avvolgimento, accessibilità del cassonetto e compatibilità dei componenti sono oggetto del rilievo."],
    ["Comando manuale o motorizzato", "La soluzione scelta indica componenti e attività incluse. Alimentazione e automazioni non si intendono comprese automaticamente."],
  ],
  usp: ["Componenti elencati, senza inclusioni implicite", "Compatibilità verificata nel vano reale", "Prova di utilizzo e indicazioni di cura"],
  phases: [
    ["Rilievo", ["Vani e guide", "Rullo e cassonetto", "Comandi e accessi"]],
    ["Scelta", ["Telo e finitura", "Componenti da conservare", "Comando previsto"]],
    ["Conferma", ["Configurazione per vano", "Opere comprese", "Prezzo e tempi"]],
    ["Consegna", ["Posa e regolazione", "Prova di movimento", "Uso e documenti"]],
  ],
  guarantees: [
    ["Fornitura identificata", "Telo, guide, comando ed eventuale motore sono riconoscibili nelle specifiche della fornitura."],
    ["Verifiche concordate", "Il controllo finale riguarda lo scorrimento e i comandi della configurazione effettivamente installata."],
    ["Cura del sistema", "Pulizia e manutenzione seguono le istruzioni dei componenti scelti, senza interventi improvvisati sul meccanismo."],
    ["Riferimenti per l'assistenza", "Condizioni, limitazioni e servizi successivi sono quelli applicabili ai prodotti e all'offerta, senza durate presunte."],
  ],
  faq: [
    ["Devo sostituire tutto l'avvolgibile?", "Non necessariamente. Il rilievo distingue le parti da sostituire da quelle compatibili e conservabili; la decisione va riportata nell'offerta."],
    ["Posso passare dal comando manuale al motore?", "La proposta si conferma dopo la verifica di spazio, rullo, componenti e disponibilità dell'alimentazione. Motore e collegamenti devono risultare nelle voci."],
    ["Il cassonetto è compreso?", "Solo se indicato. Sostituzione, rivestimento, interventi interni e finiture del cassonetto sono lavorazioni differenti, da descrivere separatamente."],
    ["Sono inclusi telecomando e controllo da telefono?", "Solo per i dispositivi e i servizi elencati. Compatibilità con sistemi esistenti, configurazione e accessori vanno confermati prima dell'ordine."],
    ["Si possono mantenere le guide esistenti?", "Occorre verificarne stato, misure e compatibilità con il telo scelto. Gli eventuali adattamenti o sostituzioni devono essere quantificati."],
    ["Chi esegue i collegamenti elettrici?", "L'offerta deve identificare le attività e il soggetto che le esegue. Se non comprese, tempi e predisposizioni si concordano prima dell'installazione."],
    ["L'avvolgibile aumenta automaticamente la sicurezza?", "Non si attribuiscono prestazioni non documentate. Eventuali requisiti specifici vanno richiesti e confrontati con la documentazione della configurazione proposta."],
    ["Cosa verifico alla consegna?", "Configurazione e finiture, salita e discesa, arresto e comandi previsti. Ricevi le istruzioni dei componenti forniti e i riferimenti per segnalare anomalie."],
  ],
  blocks: {
    comeFunziona: { title: "Un movimento semplice, *un sistema coordinato*.", intro: "Il prezzo riguarda una configurazione: leggere ogni componente aiuta a confrontare offerte equivalenti.", items: [
      ["Telo", "Materiale, profilo, colore e dimensioni identificano la parte che oscura il vano."],
      ["Guide e rullo", "Ingombri e compatibilità si verificano sul sistema reale, indicando le parti nuove e quelle conservate."],
      ["Cassonetto", "Accessibilità e spazio disponibile condizionano il lavoro. Gli interventi sul cassonetto vanno descritti esplicitamente."],
      ["Comando", "Cinghia, motore e dispositivi accessori si scelgono secondo la configurazione concordata, con attività incluse riconoscibili."],
    ] },
    protezione: { title: "Intervenire nel vano, *curare l'ambiente*.", intro: "L'apertura del cassonetto e le sostituzioni richiedono accessi e protezioni da concordare prima dei lavori.", items: [
      ["Spazi liberi", "Concordare accesso al vano e al cassonetto, spostamento degli arredi e protezione delle superfici vicine."],
      ["Rimozioni", "Specificare quali parti vengono rimosse e la gestione dei materiali quando prevista dalla fornitura."],
      ["Coordinamento", "Pianificare l'eventuale intervento elettrico e le predisposizioni prima del montaggio dei componenti motorizzati."],
      ["Finiture", "Distinguere chiusura del cassonetto, adattamenti e ripristini di intonaco o pittura effettivamente compresi."],
    ] },
    controlli: { title: "Ogni comando, *un riscontro concreto*.", intro: "La verifica finale segue le istruzioni del prodotto e le attività concordate, con eventuali regolazioni residue annotate.", items: [
      ["Configurazione", "Confrontare telo, guide, finitura e comandi installati con la scheda approvata per ciascun vano."],
      ["Scorrimento", "Provare salita e discesa, rilevando attriti o interferenze da correggere secondo le istruzioni del sistema."],
      ["Comandi", "Verificare il funzionamento e le regolazioni previste, inclusi gli accessori effettivamente forniti."],
      ["Consegna", "Mostrare l'utilizzo, consegnare le istruzioni disponibili e registrare eventuali attività ancora da completare."],
    ] },
    documenti: { title: "Prodotti e comandi, *tutto riconoscibile*.", intro: "Conserva i riferimenti utili per utilizzare il sistema e richiedere assistenza sulla fornitura ricevuta.", items: [
      ["Scheda per vano", "Configurazione, misure, materiale, colore, componenti sostituiti e parti conservate."],
      ["Documenti dei componenti", "Riferimenti del telo, del motore e degli accessori presenti, con documentazione disponibile e applicabile."],
      ["Uso e manutenzione", "Istruzioni per comandi, pulizia e precauzioni del sistema; nessuna operazione sul meccanismo è sottintesa."],
      ["Opere e assistenza", "Riepilogo delle lavorazioni, eventuali documenti delle attività aggiuntive e recapito per le segnalazioni."],
    ] },
    diario: { title: "Dentro e fuori il cassonetto: *le fasi utili*.", intro: "Quando concordate, le foto documentano lo stato reale. Le immagini illustrative del modello non costituiscono un resoconto dei lavori.", items: [
      ["Prima", "Vano, telo, guide e cassonetto esistenti, con le criticità emerse durante il rilievo."],
      ["Durante", "Componenti sostituiti e dettagli accessibili durante il lavoro, prima della chiusura del cassonetto."],
      ["Dopo", "Finiture e configurazione consegnata, insieme alle eventuali riserve da completare."],
    ] },
  },
};
