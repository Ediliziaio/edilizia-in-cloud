import type { SrEditorialContent } from "./fullSerramentiFactory";

export const combinatoContent: SrEditorialContent = {
  id: "combinato", cover: "/module-art/serramenti-combinato-cover-v3.jpg",
  images: [
    { url: "/module-art/serramenti-combinato-dettaglio-v3.jpg", name: "Sistemi coordinati · dettaglio illustrativo" },
    { url: "/module-art/serramenti-persiane-cover.jpg", name: "Persiane e facciata" },
    { url: "/module-art/serramenti-zanzariere-cover.jpg", name: "Zanzariera plissettata" },
    { url: "/module-art/serramenti-avvolgibili-cover.jpg", name: "Avvolgibile e cassonetto" },
    { url: "/module-art/serramenti-porte-ingresso-cover.jpg", name: "Porta d'ingresso" },
    { url: "/module-art/serramenti-porte-interne-cover.jpg", name: "Porte interne coordinate" },
  ],
  hero: "Più soluzioni.\nUn progetto coordinato.", subtitle: "Finestre, oscuranti e zanzariere: prodotti e lavorazioni riuniti in una proposta, vano per vano.", eyebrow: "INTERVENTO COMBINATO",
  needs: [
    ["Coordinare prodotti diversi", "Associare a ogni apertura ciò che serve realmente, distinguendo finestre, oscuranti, reti e altri prodotti previsti."],
    ["Evitare interferenze", "Verificare spazi, movimenti, guide, cassonetti e accessori nel loro insieme, prima di confermare le singole forniture."],
    ["Leggere un'offerta unica", "Riconoscere quantità, prodotti, lavorazioni comuni e attività specifiche senza duplicazioni implicite."],
  ],
  solution: [
    ["Un abaco delle aperture", "Ogni vano ha un riferimento condiviso e l'elenco dei prodotti da fornire, conservare o sostituire."],
    ["Configurazioni compatibili", "Misure, aperture, finiture e accessori dei diversi sistemi vengono confrontati nella stessa fase di rilievo."],
    ["Una sequenza concordata", "Rimozioni, predisposizioni, posa e controlli si coordinano con le eventuali altre lavorazioni presenti."],
  ],
  usp: ["Un riferimento per ogni vano", "Forniture e lavorazioni comuni distinguibili", "Consegna con verifica dell'insieme"],
  phases: [
    ["Rilievo", ["Mappa delle aperture", "Prodotti esistenti", "Ingombri e supporti"]],
    ["Scelta", ["Abbinamenti per vano", "Finiture coordinate", "Compatibilità dei sistemi"]],
    ["Conferma", ["Quantità e schede", "Opere comuni e specifiche", "Prezzo e programma"]],
    ["Consegna", ["Posa coordinata", "Prova delle interferenze", "Documenti per prodotto"]],
  ],
  guarantees: [
    ["Configurazioni tracciabili", "Ogni prodotto è identificato e collegato al vano previsto, con le caratteristiche documentate della fornitura."],
    ["Verifica dell'insieme", "La consegna riscontra i prodotti installati e le interferenze tra aperture e accessori effettivamente presenti."],
    ["Cura per ogni sistema", "Finestre, oscuranti e reti conservano le rispettive istruzioni, senza applicare indicazioni indistinte a prodotti diversi."],
    ["Assistenza riconoscibile", "Documenti, condizioni applicabili e riferimenti dei prodotti sono riuniti per facilitare le segnalazioni."],
  ],
  faq: [
    ["Ogni vano deve avere gli stessi prodotti?", "No. L'abaco indica ciò che è previsto in ciascuna apertura: una finestra può essere abbinata a un oscurante, a una rete o ad altri componenti solo dove richiesto."],
    ["Il prezzo include tutti i prodotti mostrati nelle immagini?", "No. Le immagini sono illustrative; fanno fede prodotti, quantità e lavorazioni elencati nella proposta confermata."],
    ["Come evitiamo di contare due volte una lavorazione?", "Le opere comuni si distinguono dalle singole forniture e si verificano nel riepilogo economico. Il solo abbinamento dei prodotti non elimina automaticamente le duplicazioni."],
    ["Possiamo conservare alcuni componenti esistenti?", "Sì, se compatibili e in condizioni adatte dopo il rilievo. L'offerta deve distinguere componenti conservati, sostituiti e adattamenti previsti."],
    ["Le finiture saranno identiche su materiali diversi?", "La corrispondenza si valuta sui campioni disponibili. Materiali e processi differenti possono avere resa diversa: le scelte si approvano prima dell'ordine."],
    ["Tutti i prodotti vengono montati nello stesso giorno?", "Il programma dipende da disponibilità, vani e sequenza delle opere. Fasi separate e protezioni temporanee devono essere concordate, non presunte."],
    ["Sono compresi collegamenti e ripristini?", "Solo quelli elencati. Opere elettriche, murarie, pitture e gestione dei materiali rimossi devono essere definite insieme ai relativi incarichi."],
    ["Riceverò documenti e garanzie distinti?", "I prodotti mantengono le rispettive condizioni e istruzioni. Il riepilogo deve permettere di riconoscere ogni componente e il vano in cui è installato."],
  ],
  blocks: {
    comeFunziona: { title: "Un vano, *scelte coordinate*.", intro: "La proposta combina solo i sistemi elencati: la compatibilità si verifica sul vano reale e sulle configurazioni scelte.", photo: "/module-art/serramenti-combinato-cover-v3.jpg", items: [
      ["Serramento", "Telaio, vetro, ferramenta e apertura identificano l'infisso quando previsto nella fornitura."],
      ["Oscurante", "Persiana o avvolgibile richiede spazio, fissaggi e comandi compatibili con il resto dell'apertura."],
      ["Zanzariera", "Rete, guide e sistema di apertura devono lasciare utilizzabili i passaggi e gli altri componenti."],
      ["Opere comuni", "Rilievo, rimozioni, predisposizioni e ripristini vanno attribuiti con chiarezza, evitando sovrapposizioni."],
    ] },
    protezione: { title: "Più lavorazioni, *una sequenza chiara*.", intro: "Il coordinamento riduce le incertezze: accessi, protezioni e responsabilità devono essere concordati prima dell'intervento.", items: [
      ["Spazi e accessi", "Definire aree libere, passaggi, deposito e movimentazione per i prodotti previsti."],
      ["Rimozioni", "Precisare ciò che viene tolto e ciò che resta, con la gestione dei materiali quando compresa."],
      ["Predisposizioni", "Coordinare le eventuali opere murarie o elettriche prima della posa dei sistemi interessati."],
      ["Fasi e chiusure", "Concordare l'ordine delle lavorazioni e le eventuali protezioni provvisorie dei vani."],
    ] },
    controlli: { title: "Non soltanto i pezzi: *l'insieme*.", intro: "Ogni vano si verifica come configurazione completa, oltre ai controlli previsti per i singoli prodotti.", items: [
      ["Abaco e quantità", "Confrontare i componenti installati con quelli approvati per il vano, senza attribuire accessori non previsti."],
      ["Movimenti", "Provare aperture, scorrimenti e comandi dei sistemi effettivamente presenti."],
      ["Interferenze", "Verificare ingombri e accessibilità di maniglie, guide, fermi e passaggi nell'uso combinato."],
      ["Consegna", "Riepilogare riserve, regolazioni e ripristini residui, associandoli al vano e al prodotto interessati."],
    ] },
    documenti: { title: "Un dossier, *prodotti riconoscibili*.", intro: "Il cliente deve poter risalire dal vano ai componenti e alle lavorazioni ricevute.", items: [
      ["Abaco unico", "Elenco delle aperture con prodotti inclusi, configurazioni, misure e quantità approvate."],
      ["Schede prodotto", "Documenti disponibili e applicabili per ogni sistema, con riferimenti che permettano di identificarlo."],
      ["Istruzioni distinte", "Uso e manutenzione dei singoli prodotti, senza confondere precauzioni e caratteristiche."],
      ["Riepilogo delle opere", "Lavorazioni comuni e specifiche, eventuali riserve, condizioni applicabili e contatti di assistenza."],
    ] },
    diario: { title: "Il lavoro, *vano per vano*.", intro: "Se concordata, la documentazione fotografica segue gli stessi riferimenti dell'abaco. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Aperture esistenti, componenti da conservare e interferenze individuate nel rilievo."],
      ["Durante", "Predisposizioni, raccordi e dettagli che risultano meno accessibili dopo la posa di tutti i sistemi."],
      ["Dopo", "Configurazione finale di ogni vano, con aperture e accessori previsti e le eventuali attività residue."],
    ] },
  },
};
