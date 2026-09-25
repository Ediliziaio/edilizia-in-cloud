import type { TetEditorialContent } from "./fullTettiFactory";

export const ristrutturazioneParzialeContent: TetEditorialContent = {
  title: "Cambia ciò che serve.\nConserva ciò che ami.",
  subtitle: "Un intervento mirato, con ambienti, lavorazioni e parti da conservare definiti prima di iniziare.",
  eyebrow: "RISTRUTTURAZIONE PARZIALE",
  cover: "/module-art/ristrutturazioni-parziale-cover.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/protezione-scale.jpg", name: "Protezione dei passaggi, da adattare all'immobile" },
    { url: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", name: "Controllo del supporto, se previsto nelle lavorazioni" },
  ],
  needs: [
    ["Scegliere dove intervenire", "Individuare stanze, superfici e componenti da rinnovare, senza estendere implicitamente i lavori a tutta la casa."],
    ["Conservare il resto", "Riconoscere finiture, arredi e impianti da mantenere e i passaggi necessari per accedere alle zone di lavoro."],
    ["Gestire i raccordi", "Definire come le parti nuove incontrano quelle esistenti e quali ripristini rientrano nella proposta."],
  ],
  solution: [
    ["Un perimetro stanza per stanza", "Ogni voce riporta l'ambiente o la zona interessata e la quantità prevista. Le aree non indicate restano fuori dal computo."],
    ["Preparazioni proporzionate", "Protezioni, spostamenti e interruzioni delle utenze si concordano in base alle opere, alle condizioni della casa e agli accessi."],
    ["Scelte prima dei raccordi", "Materiali, soglie e finiture vengono confermati prima della posa, chiarendo eventuali differenze rispetto all'esistente."],
  ],
  usp: [
    ["Intervento riconoscibile", "Rinnovare una parte non significa acquistare il rifacimento dell'intero immobile."],
    ["Confini espliciti", "Ripristini, protezioni e parti escluse vengono distinti nel computo e nelle condizioni."],
    ["Decisioni condivise", "Le estensioni emerse durante i lavori si valutano con prezzo e tempi prima della conferma."],
  ],
  journey: [
    ["01 · Individuare", "Ambienti coinvolti, elementi conservati e punti di raccordo."],
    ["02 · Confermare", "Materiali, quantità, accessi e condizioni della proposta."],
    ["03 · Intervenire", "Preparazioni e lavorazioni nelle zone concordate."],
    ["04 · Riconsegnare", "Verifiche delle parti interessate e riepilogo degli eventuali residui."],
  ],
  guarantees: [
    ["Perimetro scritto", "La proposta distingue l'intervento dalle parti che non vengono rinnovate."],
    ["Scelte identificabili", "Materiali e finiture sono quelli confermati, con eventuali differenze dichiarate."],
    ["Riscontri mirati", "I controlli riguardano le lavorazioni eseguite e non attestano l'intero immobile."],
    ["Assistenza pertinente", "Garanzie e riferimenti riguardano le forniture effettive e i documenti applicabili."],
  ],
  schedule: [
    ["Rilievo mirato", "Perimetro, condizioni accessibili, raccordi e interferenze."],
    ["Preparazione", "Materiali confermati, accessi liberi e protezioni previste."],
    ["Lavorazioni", "Sequenza nelle zone interessate, con eventuali tempi tecnici."],
    ["Consegna parziale", "Riscontri, ripristini compresi e documenti pertinenti."],
  ],
  faq: [
    ["Quali stanze rientrano nel prezzo?", "Solo gli ambienti, le superfici e le opere identificati nelle voci confermate. Il titolo del modulo non estende la proposta a tutta la casa."],
    ["Posso continuare a usare le altre stanze?", "Dipende da accessi, polvere, rumore, utenze e condizioni effettive. Le zone utilizzabili e le eventuali limitazioni si concordano prima dell'avvio."],
    ["Le nuove finiture saranno identiche alle vecchie?", "Non sempre: disponibilità, usura e lotti possono cambiare l'aspetto. Campioni, raccordi e differenze accettabili vanno definiti prima della conferma."],
    ["Sono compresi i ripristini nelle stanze vicine?", "Soltanto se descritti nel computo. Una lavorazione localizzata non implica la tinteggiatura o il rifacimento completo delle superfici adiacenti."],
    ["E se un impianto esistente richiede altri lavori?", "Si descrive il riscontro e si propone l'eventuale estensione con perimetro, prezzo e tempi. Le parti non interessate non vengono dichiarate nuove o verificate per intero."],
    ["Chi sposta e custodisce i mobili?", "Sgombero, movimentazione e deposito devono avere un responsabile e un ambito concordati. Sono inclusi solo gli interventi espressamente elencati."],
    ["Quanto dura un intervento parziale?", "Le date dipendono dalle opere, dalla disponibilità dei materiali e dai tempi tecnici. Il calendario si conferma sul caso concreto, non sul nome del modulo."],
    ["Le immagini mostrano quello che riceverò?", "Sono riferimenti illustrativi. Arredi, accessori e soluzioni fotografate non fanno parte della fornitura se non sono descritti nelle voci dell'offerta."],
  ],
  blocks: {
    comeFunziona: { title: "Un intervento mirato. *Confini chiari*.", intro: "La proposta identifica cosa cambia e cosa rimane. Il lavoro si legge per zone, senza confondere un rinnovo parziale con un rifacimento completo.", photo: "/pdf-stock/pavimenti/installazione.jpg", items: [
      ["Zona interessata", "Stanze, superfici e componenti indicati nel computo."],
      ["Parti conservate", "Elementi esistenti che non vengono sostituiti o rinnovati."],
      ["Raccordi", "Punti di incontro tra nuovo ed esistente da definire prima dell'opera."],
      ["Ripristini", "Superfici e finiture comprese, con limiti e quantità riconoscibili."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste opere*.", intro: "Questa sintesi accompagna le voci dell'offerta. Quantità e descrizioni confermate prevalgono sulle immagini illustrative.", items: [
      ["Preparazioni", "Protezioni, sgomberi e accessi soltanto dove previsti nel computo."],
      ["Rimozioni mirate", "Elementi e porzioni identificati, con gestione dei materiali rimossi descritta."],
      ["Nuove lavorazioni", "Forniture e attività nelle zone espressamente interessate."],
      ["Raccordi e ripristini", "Finiture e pulizie finali limitate al perimetro concordato."],
    ], excluded: [
      ["Rinnovo dell'intera casa", "Stanze, impianti e superfici non elencati non sono compresi, anche se adiacenti alle opere."],
      ["Estensioni e dotazioni", "Opere nascoste non previste, arredi e forniture non descritte richiedono una valutazione separata."],
    ] },
    protezione: { title: "Rinnovare una parte. *Proteggere il resto*.", intro: "Le protezioni vanno scelte per superfici, percorsi e condizioni reali. La foto è un esempio e non definisce da sola le misure del tuo cantiere.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Percorsi", "Concordare i passaggi per persone, materiali e rimozioni."],
      ["Superfici mantenute", "Individuare pavimenti, porte e parti adiacenti da proteggere."],
      ["Arredi e oggetti", "Definire cosa spostare, chi se ne occupa e dove conservarlo."],
      ["Uso dell'immobile", "Chiarire limitazioni, interruzioni e accessi durante le fasi."],
    ] },
    controlli: { title: "Curare il nuovo. *Verificare i raccordi*.", intro: "I riscontri sono riferiti alle opere eseguite e alle verifiche concordate. Non attestano condizioni o prestazioni delle parti escluse.", photo: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", items: [
      ["Supporti", "Verificare le condizioni accessibili delle superfici interessate."],
      ["Materiali", "Riscontrare modelli, finiture e quantità confermate."],
      ["Raccordi", "Controllare soglie, giunti e bordi compresi nella lavorazione."],
      ["Consegna", "Registrare esiti, eventuali riserve e attività ancora da definire."],
    ] },
    documenti: { title: "Solo le opere eseguite. *Tutti i riferimenti*.", intro: "La documentazione deve rendere riconoscibile l'ambito dell'intervento, senza attribuire alle parti conservate caratteristiche mai verificate.", items: [
      ["Perimetro finale", "Riepilogo degli ambienti e delle lavorazioni effettivamente comprese."],
      ["Scelte e varianti", "Materiali confermati e modifiche approvate durante l'intervento."],
      ["Documenti applicabili", "Schede e documentazione pertinente alle forniture e opere reali."],
      ["Uso e assistenza", "Indicazioni disponibili per le nuove parti e contatti di riferimento."],
    ] },
    diario: { title: "Il cambiamento, *nelle zone giuste*.", intro: "Quando concordato, il diario usa foto reali dello stesso ambiente. Le immagini del modello non sostituiscono una documentazione del tuo immobile.", items: [
      ["Prima", "Zone interessate e condizioni delle parti adiacenti da conservare."],
      ["Durante", "Passaggi utili e parti che verranno successivamente coperte."],
      ["Dopo", "Opere ultimate, raccordi e annotazioni della consegna."],
    ] },
  },
};
