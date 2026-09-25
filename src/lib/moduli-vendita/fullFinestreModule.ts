import type { SrEditorialContent } from "./fullSerramentiFactory";

export const finestreContent: SrEditorialContent = {
  id: "finestre", cover: "/module-art/serramenti.jpg",
  hero: "La luce di casa.\nLe scelte che contano.", subtitle: "Finestre e portefinestre, con prodotti e posa definiti vano per vano.", eyebrow: "FINESTRE E PORTEFINESTRE",
  needs: [
    ["Vivere meglio ogni ambiente", "Chiarire le esigenze di comfort, luce e utilizzo, senza dedurre le prestazioni dal solo materiale del telaio."],
    ["Aprire con gli ingombri giusti", "Verificare misure, verso di apertura, arredi, soglie e compatibilità con gli oscuranti esistenti."],
    ["Conoscere il lavoro completo", "Distinguere il serramento da rimozioni, posa, sigillature e ripristini necessari in ciascun vano."],
  ],
  solution: [
    ["Una configurazione identificata", "Telaio, vetro, ferramenta, apertura e finitura vengono associati a ogni posizione della fornitura."],
    ["Un nodo di posa da verificare", "Supporto, controtelaio e raccordi con il muro vengono valutati prima di confermare le lavorazioni."],
    ["Prestazioni documentate", "I valori del prodotto scelto si leggono nelle schede. Il risultato nell'edificio dipende anche dal progetto e dall'esecuzione."],
  ],
  usp: ["Una scheda leggibile per ogni vano", "Fornitura e lavorazioni distinte", "Varianti condivise prima di eseguirle"],
  phases: [
    ["Rilievo", ["Misure e supporti", "Esigenze degli ambienti", "Aperture e ingombri"]],
    ["Scelta", ["Telaio e vetro", "Ferramenta e finiture", "Lavorazioni di posa"]],
    ["Conferma", ["Schede approvate", "Prezzo e condizioni", "Tempi concordati"]],
    ["Consegna", ["Posa e regolazioni", "Prova delle aperture", "Documenti e cura"]],
  ],
  guarantees: [
    ["Prodotti riconoscibili", "Modello, configurazione e prestazioni dichiarate sono riportati nei documenti della fornitura."],
    ["Posa verificabile", "Controlli sui raccordi e sul funzionamento riguardano le lavorazioni concordate nell'offerta."],
    ["Indicazioni di cura", "Pulizia, regolazioni e manutenzione seguono le istruzioni del produttore e le condizioni di utilizzo."],
    ["Condizioni trasparenti", "Coperture, durate e assistenza sono quelle applicabili al prodotto e al contratto, senza estensioni presunte."],
  ],
  faq: [
    ["Doppio o triplo vetro?", "La scelta dipende da obiettivi, esposizione, dimensioni e sistema proposto. Si confrontano i dati documentati della configurazione, non soltanto il numero di lastre."],
    ["Il materiale del telaio basta per confrontare due offerte?", "No. Vetro, profili, ferramenta, dimensioni e posa concorrono alla configurazione. Confronta prodotti e lavorazioni equivalenti."],
    ["Si conserva il vecchio controtelaio?", "Solo dopo la verifica del suo stato e della compatibilità con la soluzione di posa. Rimozioni e modifiche devono risultare nelle voci."],
    ["Sono inclusi persiane e zanzariere?", "Solo nei vani e nelle quantità indicati. Oscuranti, reti e relativi adattamenti sono forniture distinte."],
    ["Quanto risparmierò sui consumi?", "Non si può ricavare dalla sola sostituzione del serramento. Un'eventuale stima richiede dati dell'edificio, utilizzo e ipotesi esplicite."],
    ["Chi esegue i ripristini?", "L'offerta deve indicare rimozione, gestione dei materiali, raccordi, intonaci e tinteggiature compresi, distinguendoli dalle opere escluse."],
    ["Come si confermano colore e aperture?", "Si approvano schede vano per vano e campioni pertinenti prima dell'ordine. Le immagini del modello sono illustrative."],
    ["Cosa ricevo alla consegna?", "Documenti del prodotto disponibili, istruzioni di uso e manutenzione e riepilogo delle lavorazioni. Eventuali pratiche aggiuntive devono essere espressamente previste."],
  ],
  blocks: {
    comeFunziona: { title: "Non solo un telaio: *un sistema*.", intro: "Quattro elementi aiutano a leggere la proposta e a confrontare configurazioni equivalenti.", items: [
      ["Profilo", "Materiale, serie, dimensioni e finitura identificano il telaio proposto per ogni vano."],
      ["Vetro", "Composizione e caratteristiche documentate devono essere coerenti con il prodotto e con le esigenze individuate."],
      ["Ferramenta", "Tipo di apertura, comando e accessori incidono sull'utilizzo quotidiano e vanno specificati."],
      ["Posa", "Supporto, fissaggi, sigillature e raccordi sono parte della soluzione da definire, non dettagli impliciti."],
    ] },
    protezione: { title: "Cambiare gli infissi, *organizzare gli spazi*.", intro: "Accessi, protezioni e rimozioni si concordano prima di intervenire nelle aperture della casa.", items: [
      ["Ambienti", "Concordare aree libere, passaggi e protezione di pavimenti, arredi e superfici vicine ai vani."],
      ["Rimozioni", "Definire come gestire i vecchi infissi e i materiali rimossi, quando il servizio è incluso."],
      ["Supporti", "Segnalare degrado o difetti emersi, distinguendo le lavorazioni già comprese dalle varianti necessarie."],
      ["Chiusura delle fasi", "Pianificare le aperture interessate e le eventuali protezioni temporanee secondo il lavoro concordato."],
    ] },
    controlli: { title: "Il riscontro, *vano per vano*.", intro: "La consegna verifica la configurazione installata e le lavorazioni previste, annotando ciò che resta da completare.", items: [
      ["Corrispondenza", "Verificare modello, vetro, colore, misure e apertura rispetto alle schede approvate."],
      ["Funzionamento", "Provare maniglie, apertura, chiusura e regolazioni, inclusi gli accessori effettivamente forniti."],
      ["Raccordi", "Riscontrare finiture, sigillature e raccordi previsti; eventuali prove strumentali richiedono uno specifico accordo."],
      ["Consegna", "Annotare riserve e regolazioni residue e condividere le istruzioni di utilizzo."],
    ] },
    documenti: { title: "Le informazioni da *conservare*.", intro: "La documentazione è riferita ai serramenti e ai servizi realmente presenti nella fornitura.", items: [
      ["Abaco dei vani", "Elenco delle posizioni con misure, configurazione e accessori concordati."],
      ["Documenti prodotto", "Schede e dichiarazioni disponibili e applicabili ai modelli forniti, con i relativi riferimenti."],
      ["Uso e manutenzione", "Istruzioni per pulizia, ferramenta, aerazione e precauzioni previste dal produttore."],
      ["Assistenza", "Condizioni applicabili e recapito per le segnalazioni. Le pratiche non comprese sono indicate separatamente."],
    ] },
    diario: { title: "Dal rilievo alla posa: *dettagli tracciabili*.", intro: "Se concordata, la documentazione fotografica rende riconoscibili le zone interessate. Le foto illustrative non sono immagini del tuo cantiere.", items: [
      ["Prima", "Vani, supporti, controtelai e interferenze rilevate prima delle rimozioni."],
      ["Durante", "Raccordi e dettagli utili che risultano meno visibili a lavorazioni concluse."],
      ["Dopo", "Aperture finite, accessori e condizioni delle superfici concordate alla consegna."],
    ] },
  },
};
