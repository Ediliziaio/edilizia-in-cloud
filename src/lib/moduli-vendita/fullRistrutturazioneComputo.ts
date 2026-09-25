import type { TetEditorialContent } from "./fullTettiFactory";

export const ristrutturazioneComputoContent: TetEditorialContent = {
  title: "Ogni lavorazione.\nUn prezzo leggibile.",
  subtitle: "La proposta organizzata per capitoli, con descrizioni, quantità, prezzi ed esclusioni da confermare insieme.",
  eyebrow: "INTERVENTO A COMPUTO",
  cover: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg",
  closingPhoto: "/module-art/pavimenti.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", name: "Riscontro delle superfici lavorate" },
    { url: "/pdf-stock/ristrutturazione/protezione-scale.jpg", name: "Protezioni dei percorsi" },
  ],
  needs: [
    ["Capire ogni voce", "Riconoscere lavorazione, zona interessata, materiali previsti e limiti della prestazione."],
    ["Leggere il prezzo", "Distinguere quantità, unità di misura, prezzo unitario e importo, senza confondere imponibile e totale."],
    ["Gestire ciò che cambia", "Individuare quantità da verificare, parti escluse e variazioni da concordare prima dell'esecuzione."],
  ],
  solution: [
    ["Capitoli riconoscibili", "Le opere sono raggruppate per ambito e collegate agli ambienti o agli elaborati di riferimento."],
    ["Importi ricostruibili", "Il dettaglio delle voci accompagna il riepilogo economico, con eventuali sconti e imposte distinti."],
    ["Revisioni esplicite", "Nuove lavorazioni e quantità aggiornate sono descritte in una revisione da confermare."],
  ],
  usp: [
    ["Dettaglio utile", "Una voce descrive cosa viene offerto e dove, non soltanto un importo."],
    ["Confronto consapevole", "Inclusioni, quantità e caratteristiche aiutano a confrontare offerte con lo stesso ambito."],
    ["Scelte tracciabili", "Riferimenti, esclusioni e varianti mantengono riconoscibile il perimetro concordato."],
  ],
  journey: [
    ["01 · Raccogliere", "Rilievi disponibili, elaborati, esigenze e ambito da quotare."],
    ["02 · Dettagliare", "Capitoli, descrizioni, quantità, prezzi ed esclusioni."],
    ["03 · Confermare", "Scelte, condizioni e revisioni prima delle lavorazioni."],
    ["04 · Riscontrare", "Opere eseguite, quantità concordate e documenti pertinenti."],
  ],
  guarantees: [
    ["Perimetro scritto", "Le lavorazioni incluse sono quelle descritte nella proposta confermata."],
    ["Quantità riconoscibili", "Unità di misura e quantità sono esplicitate dove utilizzate per il prezzo."],
    ["Varianti condivise", "Opere aggiuntive o cambiamenti richiedono una valutazione economica e temporale."],
    ["Riscontri finali", "Le attività eseguite e le eventuali riserve sono riepilogate alla consegna."],
  ],
  schedule: [
    ["Definizione del computo", "Conferma delle descrizioni, dei riferimenti e delle quantità."],
    ["Preparazioni e forniture", "Accessi, disponibilità delle zone e approvvigionamenti previsti."],
    ["Esecuzione delle voci", "Sequenza delle opere in funzione delle interferenze reali."],
    ["Verifica e consegna", "Riscontri delle lavorazioni e riepilogo delle revisioni."],
  ],
  faq: [
    ["Il computo comprende tutta la ristrutturazione?", "Non automaticamente. Comprende le voci identificate e confermate, con le relative quantità e caratteristiche. Opere non descritte e prestazioni escluse devono essere valutate separatamente."],
    ["Le quantità sono definitive?", "Dipende dai riferimenti e dai rilievi disponibili. Le quantità stimate o da verificare devono essere riconoscibili; il criterio di conferma e di contabilizzazione va concordato nella proposta."],
    ["Che differenza c'è tra prezzo unitario e importo?", "Per una voce a quantità, l'importo deriva dalla quantità e dal prezzo unitario, tenendo conto degli eventuali sconti della voce. Il riepilogo distingue poi gli altri sconti e l'IVA applicata."],
    ["Una voce a corpo comprende qualsiasi lavorazione?", "No. Si riferisce al perimetro descritto in quella voce. Materiali, prestazioni, limiti ed eventuali esclusioni vanno precisati anche quando il prezzo è complessivo."],
    ["Il totale è fisso o può cambiare?", "Il solo elenco delle voci non definisce le condizioni economiche. Prezzo a corpo, a misura, quantità da riscontrare e gestione delle varianti devono essere concordati espressamente."],
    ["Posso sostituire materiali o aggiungere opere?", "La richiesta viene valutata rispetto a forniture, lavorazioni e tempi già confermati. La revisione deve chiarire cosa cambia e il relativo effetto economico prima di procedere."],
    ["Le immagini fanno parte delle forniture comprese?", "Le immagini del modello sono illustrative. Soltanto le descrizioni e le specifiche confermate identificano materiali e opere offerti; fotografie e arredi non aggiungono prestazioni al computo."],
    ["Progettazione, pratiche e documenti sono inclusi?", "Soltanto quelli espressamente elencati con ambito e responsabilità. Il preventivo economico non sostituisce gli elaborati, le verifiche o gli incarichi necessari al singolo intervento."],
  ],
  blocks: {
    comeFunziona: { title: "Dal rilievo alla proposta. *Voce per voce*.", intro: "Ogni capitolo raccoglie lavorazioni riconoscibili. I riferimenti servono a collegare descrizioni e quantità alle opere richieste, senza trasformare l'esempio in un progetto.", photo: "/pdf-stock/pavimenti/materiali.jpg", items: [
      ["Descrizione", "Prestazione, zona interessata, materiali e limiti dell'opera."],
      ["Quantità", "Unità di misura e riferimento utilizzato per la valutazione."],
      ["Prezzo", "Valore unitario o a corpo e importo della voce."],
      ["Riepilogo", "Capitoli, sconti, imposte e condizioni economiche concordate."],
    ] },
    compreso: { title: "Ciò che è scritto. *Ciò che è offerto*.", intro: "Il computo confermato definisce l'ambito. Le attività accessorie non vanno lasciate sottintese e devono comparire nelle voci o nelle condizioni della proposta.", items: [
      ["Lavorazioni elencate", "Opere riconoscibili per descrizione, quantità e caratteristiche."],
      ["Forniture indicate", "Materiali e dotazioni identificati nelle voci confermate."],
      ["Attività accessorie", "Protezioni, trasporti e ripristini soltanto quando descritti."],
      ["Riscontri previsti", "Controlli e documenti pertinenti all'ambito effettivamente offerto."],
    ], excluded: [
      ["Opere fuori elenco", "Lavorazioni, forniture e incarichi non descritti non sono inclusi automaticamente."],
      ["Modifiche non confermate", "Nuove quantità, scelte o condizioni emerse richiedono una valutazione separata."],
    ] },
    protezione: { title: "Il computo incontra il cantiere. *Spazi organizzati*.", intro: "Accessi e parti conservate condizionano le lavorazioni. Le protezioni necessarie devono essere riconoscibili nell'offerta e organizzate sulle condizioni reali.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Zone interessate", "Individuare l'ambito delle singole lavorazioni e le aree conservate."],
      ["Percorsi", "Concordare transito, movimentazione e deposito dei materiali."],
      ["Protezioni", "Descrivere superfici e dotazioni da mantenere durante i lavori."],
      ["Interferenze", "Valutare presenze, utenze e altre attività prima di fissare le fasi."],
    ] },
    controlli: { title: "Dalle voci alle opere. *Riscontri concreti*.", intro: "Le verifiche riguardano le prestazioni comprese e i criteri concordati. Riscontri e osservazioni si riferiscono alle lavorazioni effettivamente eseguite.", items: [
      ["Corrispondenza", "Riscontrare le opere rispetto alle descrizioni confermate."],
      ["Quantità", "Verificare i riferimenti secondo i criteri concordati per la proposta."],
      ["Materiali e finiture", "Controllare le scelte previste e le eventuali sostituzioni autorizzate."],
      ["Riserve", "Raccogliere attività residue e osservazioni prima della chiusura."],
    ] },
    documenti: { title: "Una proposta ricostruibile. *Anche alla consegna*.", intro: "I documenti mantengono collegati ambito iniziale, modifiche e opere eseguite. Non sono inclusi incarichi o attestazioni non previsti.", items: [
      ["Computo confermato", "Versione e riferimenti dell'elenco delle lavorazioni accettato."],
      ["Revisioni", "Varianti concordate con descrizione e impatto economico."],
      ["Specifiche", "Schede e indicazioni pertinenti alle forniture incluse."],
      ["Consegna", "Riscontri finali e documentazione prevista per le opere realizzate."],
    ] },
    diario: { title: "Documentare le opere. *Con riferimenti utili*.", intro: "Quando previsto, il diario usa fotografie reali collegate alle zone e alle lavorazioni. Le immagini illustrative del modello non sono documentazione del cantiere.", photo: "/pdf-stock/pavimenti/installazione.jpg", items: [
      ["Prima", "Condizioni accessibili e riferimenti iniziali delle aree interessate."],
      ["Durante", "Fasi e parti utili da documentare prima delle chiusure."],
      ["Alla consegna", "Opere ultimate e dettagli collegati alle eventuali osservazioni."],
    ] },
  },
};
