import type { TetEditorialContent } from "./fullTettiFactory";
const detail = "/module-art/tetti-riparazioni-cover.jpg";
export const riparazioniContent: TetEditorialContent = {
  title: "Capire il problema.\nDefinire l'intervento.", subtitle: "Verifiche, riparazioni e limiti della proposta: ogni passaggio spiegato prima di iniziare.",
  eyebrow: "RIPARAZIONI E INFILTRAZIONI", cover: detail,
  journeyPhoto: "/module-art/tetti.jpg",
  closingPhoto: "/pdf-stock/tetti/squadra.jpg",
  images: [{ url: "/module-art/tetti.jpg", name: "Contesto della copertura" }],
  needs: [
    ["Ricostruire la segnalazione", "Raccogliere posizione, comparsa del fenomeno e verifiche già svolte, distinguendo i segni visibili dalle cause ancora da accertare."],
    ["Individuare la zona da verificare", "Definire le parti accessibili e le indagini necessarie: il punto in cui compare l'acqua non identifica da solo l'origine."],
    ["Conoscere i limiti della riparazione", "Sapere quali elementi vengono trattati e quali parti del tetto restano invariate."],
  ],
  solution: [
    ["Una verifica con perimetro chiaro", "La proposta distingue sopralluogo, eventuali aperture o prove e successiva riparazione, indicando ciò che è già definito."],
    ["Una lavorazione localizzata", "Zona, componenti e raccordi interessati sono identificati nel computo, senza estendere il prezzo all'intera copertura."],
    ["Un riscontro documentato", "Esiti, limiti e possibili approfondimenti vengono riportati alla consegna, con le attività successive da concordare."],
  ],
  usp: [
    ["Diagnosi e opere distinguibili", "Le verifiche non vengono confuse con una riparazione già definita quando la causa non è accertata."],
    ["Ambito riconoscibile", "Il cliente può ritrovare nel riepilogo la zona trattata, i materiali e le lavorazioni comprese."],
    ["Approfondimenti condivisi", "Se emerge un problema diverso, si concordano nuove verifiche, soluzione, prezzo e tempi."],
  ],
  journey: [
    ["01 · Segnalazione", "Raccolta delle informazioni e individuazione delle aree da verificare."],
    ["02 · Verifica e proposta", "Esiti accessibili, eventuali indagini e perimetro della riparazione da confermare."],
    ["03 · Intervento mirato", "Lavorazioni localizzate previste, con registrazione delle condizioni riscontrate."],
    ["04 · Riscontro", "Consegna degli esiti e definizione di eventuali controlli successivi."],
  ],
  guarantees: [
    ["Zona identificata", "Il riepilogo distingue le parti trattate da quelle non interessate dalle opere."],
    ["Materiali riconoscibili", "I componenti impiegati sono indicati con i riferimenti disponibili e applicabili."],
    ["Limiti dichiarati", "Le condizioni della riparazione non vengono estese implicitamente a tutta la copertura o a cause non verificate."],
    ["Segnalazioni successive", "Contatti, modalità e condizioni di assistenza si riferiscono alla fornitura effettivamente concordata."],
  ],
  schedule: [
    ["Raccolta dati", "Informazioni sul fenomeno, accessi disponibili e verifiche precedenti."],
    ["Verifiche", "Sopralluogo e sole indagini concordate, con esiti e limitazioni."],
    ["Riparazione", "Lavorazioni previste dopo la conferma della soluzione e delle condizioni meteo compatibili."],
    ["Riscontro", "Esiti delle verifiche finali e controlli successivi quando concordati."],
  ],
  faq: [
    ["La macchia indica il punto esatto del problema?", "Non necessariamente. La proposta deve distinguere il segno osservato dalla causa accertata e dalle parti ancora da verificare."],
    ["Il sopralluogo comprende già la riparazione?", "Solo se espressamente indicato. Ispezioni, aperture, prove e opere si distinguono nel computo e nelle condizioni dell'offerta."],
    ["Il prezzo vale per tutto il tetto?", "No. Vale per zona, quantità e lavorazioni elencate. Un rifacimento esteso richiede un perimetro e una proposta diversi."],
    ["E se la causa non si vede subito?", "Si riportano gli esiti e si concordano gli approfondimenti necessari prima di attribuire una causa certa o procedere con altre opere."],
    ["Sono compresi i danni all'interno della casa?", "Solo se descritti. Asciugatura, pitture, intonaci e altre finiture interne non si presumono inclusi nella riparazione della copertura."],
    ["È prevista una prova con acqua?", "Soltanto se concordata e ritenuta adatta dai soggetti competenti. Modalità, tempi, ambito e limiti della prova devono essere definiti."],
    ["Cosa succede se il fenomeno ricompare?", "Si segnala quanto osservato con i riferimenti dell'intervento. La valutazione distingue la zona riparata da eventuali altre cause, secondo le condizioni applicabili."],
    ["Le fotografie mostrano il mio tetto?", "Solo le foto del rilievo identificate come tali. Le immagini illustrative del modello non dimostrano una diagnosi né un lavoro già eseguito."],
  ],
  blocks: {
    comeFunziona: { title: "Dal segnale alla *zona da trattare*.", intro: "Una riparazione parte dalle verifiche. Il dettaglio illustrato è soltanto un esempio di raccordo: non identifica la causa del tuo caso.", photo: detail, items: [
      ["Segnalazione", "Posizione e circostanze del fenomeno aiutano a impostare il sopralluogo."],
      ["Verifica", "Si osservano le parti accessibili e si indicano le indagini ulteriori eventualmente necessarie."],
      ["Perimetro", "Zona, componenti e lavorazioni si definiscono sulla base degli esiti disponibili."],
      ["Riscontro", "Le verifiche finali riguardano ciò che è stato concordato e realmente eseguito."],
    ] },
    compreso: { title: "Una zona definita. *Un prezzo leggibile*.", intro: "Il computo distingue le attività di verifica dalle opere. Descrizioni e immagini non aggiungono lavorazioni al prezzo.", items: [
      ["Ispezioni", "Zone accessibili e attività di sopralluogo espressamente previste."],
      ["Aperture", "Soli saggi o rimozioni localizzate elencati, con i ripristini concordati."],
      ["Riparazione", "Componenti, raccordi e quantità identificati nella soluzione confermata."],
      ["Verifica finale", "Controlli e prove specificate nell'offerta, con relativi limiti."],
    ], excluded: [
      ["Intera copertura", "Rifacimento esteso, nuove stratigrafie e opere strutturali non sono inclusi salvo voci dedicate."],
      ["Interni e altre cause", "Finiture interne, danni preesistenti e fenomeni estranei alla zona trattata richiedono una valutazione separata."],
    ] },
    protezione: { title: "Intervenire sul punto. *Organizzare il contesto*.", intro: "Anche un lavoro circoscritto richiede accessi e protezioni definiti dai soggetti competenti per le condizioni reali dell'immobile.", items: [
      ["Accessibilità", "Concordare come raggiungere la zona e quali spazi rendere disponibili."],
      ["Aree sottostanti", "Individuare passaggi e superfici interessate dalle attività."],
      ["Aperture temporanee", "Definire fasi e protezioni previste per la porzione aperta, considerando il meteo."],
      ["Materiali rimossi", "Specificare movimentazione e gestione dei soli materiali compresi nell'offerta."],
    ] },
    controlli: { title: "Verificare la riparazione. *Dichiarare i limiti*.", intro: "L'esito descrive la zona trattata e le prove effettivamente svolte, non una verifica indiscriminata dell'intero tetto.", items: [
      ["Corrispondenza", "Confrontare posizione, componenti e opere con il perimetro confermato."],
      ["Raccordi", "Riscontrare il dettaglio riparato e le parti limitrofe accessibili previste."],
      ["Prove concordate", "Registrare modalità, condizioni ed esiti dei controlli eseguiti."],
      ["Attività residue", "Annotare le parti non verificabili e gli eventuali approfondimenti ancora necessari."],
    ] },
    documenti: { title: "Un riepilogo della *zona riparata*.", intro: "La consegna deve rendere riconoscibili il problema segnalato, l'ambito lavorato e quanto resta da approfondire.", items: [
      ["Segnalazione iniziale", "Riferimenti della zona e informazioni disponibili all'avvio."],
      ["Opere e materiali", "Lavorazioni eseguite e componenti utilizzati, comprese le varianti concordate."],
      ["Esiti e limiti", "Riscontri effettuati, eventuali prove e parti escluse dalle verifiche."],
      ["Assistenza", "Condizioni applicabili, contatti e indicazioni per le segnalazioni successive."],
    ] },
    diario: { title: "Il dettaglio, *prima e dopo*.", intro: "Se concordate, le foto reali mantengono un riferimento riconoscibile della zona. Non sostituiscono la valutazione delle cause.", items: [
      ["Prima", "Segni osservati e area interessata prima delle aperture o delle opere."],
      ["Durante", "Condizioni emerse e dettaglio della lavorazione prima dei ripristini."],
      ["Dopo", "La stessa zona al termine, con riserve o controlli successivi annotati."],
    ] },
  },
};
