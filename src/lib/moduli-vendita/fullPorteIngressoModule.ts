import type { SrEditorialContent } from "./fullSerramentiFactory";

export const porteIngressoContent: SrEditorialContent = {
  id: "porte-ingresso", cover: "/module-art/serramenti-porte-ingresso-cover.jpg",
  hero: "Il tuo ingresso.\nUna scelta da conoscere.", subtitle: "Porta, serratura, rivestimenti e posa: una proposta definita nei dettagli che contano.", eyebrow: "PORTE D'INGRESSO",
  needs: [
    ["Scegliere con informazioni concrete", "Definire le esigenze dell'ingresso e confrontarle con le caratteristiche documentate della porta proposta."],
    ["Curare accesso e utilizzo", "Verificare verso di apertura, ingombri, passaggio e soglia in relazione all'ambiente reale."],
    ["Coordinare la sostituzione", "Chiarire rimozioni, posa, eventuali ripristini e gestione dell'accesso durante l'intervento."],
  ],
  solution: [
    ["Una porta identificata", "Modello, dimensioni, telaio, rivestimenti interno ed esterno e accessori sono riportati nella configurazione approvata."],
    ["Chiusura e comandi definiti", "Serratura, cilindro, maniglie e gli eventuali dispositivi di accesso sono specificati, senza dotazioni sottintese."],
    ["Posa coerente con il vano", "Supporto, fissaggi, soglia e raccordi vengono valutati prima di confermare le lavorazioni e le finiture."],
  ],
  usp: ["Caratteristiche documentate, non promesse generiche", "Fornitura e opere accessorie separate", "Consegna con prova di apertura e chiusura"],
  phases: [
    ["Rilievo", ["Vano e supporti", "Soglia e passaggio", "Apertura e accessi"]],
    ["Scelta", ["Modello e rivestimenti", "Serratura e accessori", "Caratteristiche richieste"]],
    ["Conferma", ["Scheda della porta", "Opere e condizioni", "Tempi di intervento"]],
    ["Consegna", ["Posa e regolazioni", "Prova della chiusura", "Chiavi e istruzioni"]],
  ],
  guarantees: [
    ["Caratteristiche verificabili", "Le prestazioni richieste si confrontano con i documenti del modello e della configurazione forniti."],
    ["Controllo della posa", "La consegna riscontra funzionamento, raccordi e finiture secondo le lavorazioni concordate."],
    ["Gestione delle chiavi", "Dotazione di chiavi e accessori viene riepilogata alla consegna, con le istruzioni del produttore."],
    ["Assistenza definita", "Coperture, limitazioni e servizi successivi seguono le condizioni applicabili al prodotto e all'offerta."],
  ],
  faq: [
    ["La porta proposta è blindata?", "La denominazione non basta. L'offerta deve identificare il modello e le caratteristiche documentate, compresa l'eventuale classe richiesta per la configurazione scelta."],
    ["Quale serratura e quale cilindro sono inclusi?", "Quelli riportati nella scheda della fornitura. Comandi aggiuntivi, dispositivi elettronici e accessori devono essere elencati espressamente."],
    ["Posso conservare il telaio esistente?", "La scelta si conferma dopo la verifica del vano, del supporto e della compatibilità con la nuova porta. Adattamenti e sostituzioni devono risultare nelle voci."],
    ["Il pannello interno può essere diverso da quello esterno?", "Se il modello lo consente. Materiali, finiture e campioni dei due lati si confermano prima dell'ordine, tenendo conto dell'esposizione prevista."],
    ["Sono comprese le opere murarie?", "Solo quelle descritte. Rimozioni, adattamento del vano, soglia, raccordi, pitture e gestione dei materiali devono essere distinti dalle attività escluse."],
    ["Come rimane protetto l'accesso durante la sostituzione?", "La sequenza e le eventuali chiusure provvisorie si concordano prima dei lavori in base al vano e all'intervento. Non si presume una durata identica per tutti i casi."],
    ["Posso aggiungere un'apertura smart?", "Occorre verificare la compatibilità della configurazione e specificare dispositivi, alimentazione, impostazioni e servizi inclusi. Non è una dotazione automatica."],
    ["Quali controlli facciamo alla consegna?", "Corrispondenza della porta, aperture, chiusure, comandi, finiture e dotazione delle chiavi. Le eventuali regolazioni residue vengono annotate."],
  ],
  blocks: {
    comeFunziona: { title: "La porta è un insieme di *scelte precise*.", intro: "Confrontare il solo pannello non basta: la proposta identifica la configurazione completa dell'ingresso.", items: [
      ["Anta e telaio", "Modello, misure, struttura e senso di apertura sono definiti in relazione al vano rilevato."],
      ["Serratura e accessori", "Cilindro, maniglie, chiavi e dispositivi previsti devono essere riconoscibili nelle specifiche."],
      ["Rivestimenti", "Finitura interna ed esterna, campioni ed esposizione si valutano per il modello proposto."],
      ["Posa e raccordi", "Supporto, fissaggi, soglia e finiture completano la fornitura quando espressamente compresi."],
    ] },
    protezione: { title: "Organizzare i lavori, *preservare l'accesso*.", intro: "La sostituzione dell'ingresso richiede una sequenza concordata e attenzione alle superfici della casa.", items: [
      ["Accessi e movimentazione", "Concordare spazi di manovra, passaggi e gestione degli ingombri prima della rimozione."],
      ["Protezioni", "Individuare pavimenti, pareti e arredi vicini da proteggere secondo le lavorazioni previste."],
      ["Continuità dell'accesso", "Definire tempi e modalità della sostituzione e le eventuali chiusure temporanee necessarie."],
      ["Ripristini", "Precisare gestione della vecchia porta, adattamenti e finiture incluse; gli imprevisti richiedono varianti concordate."],
    ] },
    controlli: { title: "Una consegna chiara, *anche nei dettagli*.", intro: "I riscontri riguardano la porta installata e le lavorazioni concordate, senza attribuire prestazioni non documentate.", items: [
      ["Configurazione", "Verificare modello, verso di apertura, rivestimenti, maniglie e accessori rispetto alla scheda approvata."],
      ["Apertura e chiusura", "Provare il movimento dell'anta, i comandi e la serratura secondo le istruzioni del sistema."],
      ["Raccordi e finiture", "Controllare soglia, raccordi e finiture previste, annotando le regolazioni o opere ancora da completare."],
      ["Dotazioni", "Riepilogare chiavi, dispositivi e documenti consegnati, mostrando l'utilizzo della configurazione fornita."],
    ] },
    documenti: { title: "Sapere cosa hai scelto, *anche domani*.", intro: "I riferimenti della fornitura aiutano a utilizzare la porta e a richiedere assistenza sul prodotto corretto.", items: [
      ["Scheda della porta", "Modello, configurazione, dimensioni, rivestimenti e accessori della fornitura approvata."],
      ["Documentazione prodotto", "Documenti disponibili e applicabili con le caratteristiche dichiarate della configurazione scelta."],
      ["Istruzioni e chiavi", "Indicazioni per uso, cura e gestione delle chiavi o dei dispositivi inclusi, secondo il produttore."],
      ["Condizioni e contatti", "Riepilogo delle lavorazioni, eventuali riserve e riferimenti per assistenza e segnalazioni."],
    ] },
    diario: { title: "Il tuo ingresso, *prima e dopo*.", intro: "Se previste, le foto tracciano i passaggi utili del lavoro. La copertina illustrativa non documenta un'installazione aziendale.", items: [
      ["Prima", "Vano, telaio, soglia e finiture esistenti, con le criticità individuate nel rilievo."],
      ["Durante", "Supporti e raccordi accessibili durante la posa, prima delle finiture concordate."],
      ["Dopo", "Ingresso finito, entrambi i lati della porta e dettagli utili alla consegna."],
    ] },
  },
};
