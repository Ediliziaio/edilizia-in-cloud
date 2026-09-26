/**
 * Area «Pergole e tende» (Lotto 3): cinque modelli sul motore Ristrutturazioni.
 * Ogni costante è dati a sé, con i testi scritti per quel lavoro: copiare o
 * cambiarne una non tocca le altre né gli altri modelli (regola d'oro del piano).
 * Le pratiche edilizie non si affermano a memoria: si rimanda al Comune.
 */
import type { TetEditorialContent } from "./fullTettiFactory";

export const pergolaBioclimaticaContent: TetEditorialContent = {
  title: "Ombra quando vuoi.\nCielo quando serve.",
  subtitle: "Pergola con lamelle orientabili: struttura, motori e scarico dell'acqua definiti sul tuo spazio esterno.",
  eyebrow: "PERGOLA BIOCLIMATICA",
  cover: "/pdf-stock/pergole/tecnica-lamelle.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/pergole/installazione.jpg", name: "Montaggio della struttura, riferimento illustrativo" },
    { url: "/pdf-stock/pergole/tecnica-acqua.jpg", name: "Raccolta e scarico dell'acqua piovana" },
  ],
  needs: [
    ["Misurare lo spazio reale", "Dimensioni, appoggi disponibili (a terra o a parete) e come la pergola si affaccia su casa e giardino."],
    ["Scegliere copertura e comandi", "Lamelle orientabili e, dove previsti, motori, sensori di pioggia e vento, luci e chiusure laterali."],
    ["Gestire acqua e vento", "Definire dove va l'acqua delle lamelle chiuse e come la struttura è fissata per resistere al vento."],
  ],
  solution: [
    ["Struttura dimensionata", "Montanti, traversi e ancoraggi scelti sulla superficie, sugli appoggi e sull'esposizione al vento."],
    ["Comfort a comando", "Lamelle orientabili per dosare sole e aria; motori, sensori e accessori sono quelli elencati nel computo."],
    ["Acqua incanalata", "Le lamelle chiuse raccolgono l'acqua verso i montanti e lo scarico concordato, non a caso."],
  ],
  usp: [
    ["Ombra regolabile", "Le lamelle si orientano: ombra piena, luce filtrata o cielo aperto, quando serve."],
    ["Fissaggi verificati", "Ancoraggi a terra o a parete scelti sul supporto reale, per tenere anche col vento."],
    ["Accessori scelti prima", "Motori, sensori, luci e chiusure laterali sono nel computo, non promesse a voce."],
  ],
  journey: [
    ["01 · Rilevare", "Spazio, appoggi, esposizione e come si affaccia su casa e giardino."],
    ["02 · Confermare", "Dimensioni, colore, motori, sensori e accessori."],
    ["03 · Installare", "Ancoraggi, struttura, lamelle e collegamenti."],
    ["04 · Avviare", "Prova dei comandi, dello scarico dell'acqua e consegna."],
  ],
  guarantees: [
    ["Struttura dichiarata", "Materiale, dimensioni e ancoraggi compresi sono scritti nel computo."],
    ["Comandi provati", "Motori e sensori consegnati funzionanti, come configurati."],
    ["Garanzia del produttore", "Sulla pergola e sui motori vale la garanzia della casa, alle sue condizioni."],
    ["Documenti conservati", "Schede e istruzioni restano a te, per manutenzione e ricambi."],
  ],
  schedule: [
    ["Sopralluogo", "Spazio, appoggi, esposizione al vento e scarico dell'acqua."],
    ["Ordine", "Struttura, colore, motori e accessori confermati; tempi di consegna."],
    ["Installazione", "Ancoraggi, montaggio, lamelle e collegamenti elettrici."],
    ["Collaudo", "Prova di lamelle, sensori e scarico, e giro di consegna."],
  ],
  faq: [
    ["Serve un permesso per installarla?", "Dipende dal Comune, dalle dimensioni e dal vincolo dell'immobile: alcune rientrano nell'edilizia libera, altre chiedono una pratica. Le regole in vigore si verificano prima; noi indichiamo cosa serve, la pratica la segue il tecnico incaricato."],
    ["Ripara davvero dalla pioggia?", "Con le lamelle chiuse sì, e l'acqua viene incanalata verso lo scarico. Con pioggia forte e vento le chiusure laterali aiutano; la tenuta dipende dal modello scelto."],
    ["Resiste al vento e alla neve?", "Ogni struttura ha dei limiti dichiarati dal produttore: sopra una certa soglia le lamelle vanno aperte per non sovraccaricare. Ancoraggi ed esposizione si valutano al sopralluogo."],
    ["Posso metterci luci e chiusure laterali?", "Sì: faretti led, tende o vetrate scorrevoli laterali sono accessori. Sono compresi solo se elencati nel computo; le predisposizioni si lasciano comunque durante il montaggio."],
    ["Come si comanda?", "Con telecomando o app, e con i sensori di pioggia e vento che chiudono o aprono da soli, se previsti. La configurazione si concorda."],
    ["Va fissata al muro o sta in piedi da sola?", "Entrambe le soluzioni esistono: addossata alla parete o autoportante. La scelta dipende dagli appoggi e dallo spazio, e decide gli ancoraggi."],
    ["Quanta manutenzione richiede?", "Poca: pulizia delle lamelle e dello scarico, e un controllo periodico dei motori. Le indicazioni restano nella documentazione."],
    ["Le foto mostrano la mia pergola?", "No, sono illustrative. Struttura, colore e accessori reali sono quelli confermati nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "Lamelle che *orientano il cielo*.", intro: "Una bioclimatica dosa sole, aria e pioggia con le lamelle. La proposta dice struttura, comandi e scarico.", photo: "/pdf-stock/pergole/tecnica-lamelle.jpg", items: [
      ["Struttura", "Montanti, traversi e ancoraggi sulla superficie reale."],
      ["Copertura", "Lamelle orientabili, colore e finitura concordati."],
      ["Comandi", "Motori, sensori di pioggia e vento, luci dove previsti."],
      ["Acqua", "Percorso di scarico dalle lamelle chiuse ai montanti."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa struttura*.", intro: "Questa sintesi accompagna le voci. Dimensioni e accessori confermati prevalgono sulle immagini.", items: [
      ["Struttura", "Pergola nelle dimensioni e nel colore concordati."],
      ["Comandi", "Motori, sensori e luci elencati nel computo."],
      ["Fissaggi", "Ancoraggi a terra o a parete adatti al supporto."],
      ["Avviamento", "Collegamenti, prova dei comandi e dello scarico."],
    ], excluded: [
      ["Pratiche e opere edili", "Autorizzazioni, plinti di fondazione e opere murarie sono a parte se non elencati."],
      ["Accessori non previsti", "Chiusure laterali, tende e vetrate non computate richiedono una valutazione separata."],
    ] },
    protezione: { title: "Lavorare fuori. *Rispettare la casa*.", intro: "Accessi e appoggi si concordano sul posto reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Accessi", "Percorso per struttura e mezzi fino all'area esterna."],
      ["Appoggi", "Individuare punti di ancoraggio e loro tenuta."],
      ["Pavimentazione", "Proteggere pavimenti e finiture esterne dove si lavora."],
      ["Impianti", "Segnalare punti elettrici e scarichi esistenti."],
    ] },
    controlli: { title: "Struttura salda. *Comandi che rispondono*.", intro: "I riscontri riguardano la pergola installata e i comandi concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Ancoraggi", "Verificare tenuta e messa a piombo della struttura."],
      ["Lamelle", "Controllare orientamento e chiusura senza attriti."],
      ["Comandi", "Provare motori, sensori e luci."],
      ["Acqua", "Riscontrare lo scarico con le lamelle chiuse."],
    ] },
    documenti: { title: "La struttura installata. *Come si usa*.", intro: "La documentazione rende riconoscibili struttura, comandi e limiti d'uso, utili nel tempo.", items: [
      ["Composizione", "Riepilogo di struttura, copertura e accessori."],
      ["Comandi", "Configurazione di motori e sensori."],
      ["Limiti d'uso", "Soglie di vento e neve dichiarate dal produttore."],
      ["Assistenza", "Manutenzione, ricambi e contatti."],
    ] },
    diario: { title: "Spazio scoperto. *Terrazza vivibile*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Lo spazio esterno e gli appoggi."],
      ["Durante", "Ancoraggi, struttura e lamelle."],
      ["Dopo", "Pergola finita, comandi provati."],
    ] },
  },
};

export const pergolaTeloContent: TetEditorialContent = {
  title: "Una tenda grande.\nSopra tutto lo spazio.",
  subtitle: "Pergola con telo avvolgibile o a pacchetto: struttura leggera, telo tecnico e tensione definiti prima.",
  eyebrow: "PERGOLA CON TELO",
  cover: "/pdf-stock/pergole/installazione.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/pergole/storia-prima-dopo.jpg", name: "Prima e dopo, riferimento illustrativo" },
    { url: "/pdf-stock/comune/pulizia-consegna.jpg", name: "Pulizia finale a fine lavori" },
  ],
  needs: [
    ["Coprire senza appesantire", "Una struttura più leggera della bioclimatica, con un telo che si apre e chiude sopra la zona da ombreggiare."],
    ["Scegliere il telo giusto", "Telo tecnico impermeabile o filtrante, colore e sistema (avvolgibile o a pacchetto) secondo l'uso."],
    ["Tenere conto del vento", "Il telo prende vento: guide, tensione e i limiti di chiusura vanno definiti per non danneggiarlo."],
  ],
  solution: [
    ["Struttura leggera", "Profili e appoggi dimensionati sulla superficie e sul telo scelto."],
    ["Telo tecnico", "Impermeabile o filtrante, con guide che lo tengono in tensione ed evitano le sacche d'acqua."],
    ["Uso consapevole", "Con vento forte il telo si chiude: le soglie e i comandi si concordano prima."],
  ],
  usp: [
    ["Leggera ed elegante", "Copre la zona pranzo o il salotto esterno senza l'ingombro di una struttura pesante."],
    ["Telo su misura", "Impermeabile o filtrante, colore scelto, teso da guide per non fare sacche."],
    ["Motori dove servono", "Apertura a motore e sensore vento sono accessori elencati, non sottintesi."],
  ],
  journey: [
    ["01 · Rilevare", "Zona da coprire, appoggi ed esposizione al vento."],
    ["02 · Scegliere", "Sistema del telo, tessuto, colore e comandi."],
    ["03 · Installare", "Struttura, guide, telo e collegamenti."],
    ["04 · Provare", "Apertura, chiusura e tensione, poi consegna."],
  ],
  guarantees: [
    ["Struttura dichiarata", "Profili, telo e appoggi compresi sono nel computo."],
    ["Telo a documento", "Tipo di tessuto e colore restano scritti nell'offerta."],
    ["Garanzia del produttore", "Su struttura, telo e motori vale la garanzia della casa."],
    ["Istruzioni conservate", "Uso e manutenzione del telo restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Zona, appoggi, esposizione e uso previsto."],
    ["Ordine", "Sistema, tessuto, colore e comandi confermati."],
    ["Installazione", "Struttura, guide, telo e collegamenti."],
    ["Collaudo", "Prova di apertura e tensione, e consegna."],
  ],
  faq: [
    ["Il telo è impermeabile?", "Esistono teli tecnici impermeabili, tesi da guide per far scivolare l'acqua, e teli filtranti che fanno solo ombra. La scelta dipende dall'uso ed è indicata nel computo."],
    ["Con il vento cosa succede?", "Il telo si chiude sopra una certa soglia, a mano o col sensore. Aperto oltre il limite rischia strappi: le soglie e i comandi si concordano prima."],
    ["Fa le sacche d'acqua?", "Con le guide in tensione e la giusta pendenza l'acqua scivola. Le sacche nascono da teli lenti o mal tesi: per questo tensione e guide sono parte del lavoro."],
    ["Serve un permesso?", "Dipende dal Comune, dalle dimensioni e dal vincolo. Le regole in vigore si verificano prima; la pratica, se serve, la segue il tecnico incaricato."],
    ["Si può motorizzare?", "Sì, con apertura elettrica e sensore vento. Sono accessori elencati; le predisposizioni si lasciano durante il montaggio."],
    ["Quanto dura il telo?", "Dipende dal tessuto e dall'esposizione. È una parte sostituibile: chiuderlo con vento e pulirlo ne allunga la vita. La garanzia è quella del produttore."],
    ["Va fissata al muro?", "Può essere addossata o autoportante. La scelta dipende dagli appoggi e dallo spazio, e decide struttura e ancoraggi."],
    ["Le foto mostrano la mia pergola?", "No, sono illustrative. Struttura, telo e colore reali sono quelli confermati nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "Telo teso, *acqua che scivola*.", intro: "Una pergola a telo è leggera: conta la tensione del tessuto e le guide. La proposta lo dice.", photo: "/pdf-stock/pergole/installazione.jpg", items: [
      ["Struttura", "Profili leggeri e appoggi dimensionati."],
      ["Telo", "Tecnico impermeabile o filtrante, colore concordato."],
      ["Guide", "Tensione del telo per evitare sacche d'acqua."],
      ["Comandi", "Apertura a mano o a motore, con sensore vento dove previsto."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa copertura*.", intro: "Questa sintesi accompagna le voci. Sistema e tessuto confermati prevalgono sulle immagini.", items: [
      ["Struttura", "Profili nelle dimensioni concordate."],
      ["Telo", "Tessuto e colore scelti, con le guide."],
      ["Comandi", "Motore e sensore dove elencati."],
      ["Avviamento", "Montaggio, tensione e prova di apertura."],
    ], excluded: [
      ["Pratiche e opere edili", "Autorizzazioni, fondazioni e opere murarie sono a parte se non elencati."],
      ["Accessori non previsti", "Chiusure laterali e illuminazione non computate richiedono una valutazione separata."],
    ] },
    protezione: { title: "Montare leggero. *Rispettare la casa*.", intro: "Accessi e appoggi si concordano sul posto reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Accessi", "Percorso per struttura e telo fino all'esterno."],
      ["Appoggi", "Individuare i punti di fissaggio e la tenuta."],
      ["Pavimentazione", "Proteggere pavimenti e finiture esterne."],
      ["Impianti", "Segnalare punti elettrici per l'eventuale motore."],
    ] },
    controlli: { title: "Telo in tensione. *Apertura fluida*.", intro: "I riscontri riguardano la struttura installata e il telo concordato.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Struttura", "Verificare ancoraggi e messa a piombo."],
      ["Telo", "Controllare tensione, guide e assenza di sacche."],
      ["Comandi", "Provare apertura, chiusura e sensore vento."],
      ["Consegna", "Giro finale con te e istruzioni d'uso."],
    ] },
    documenti: { title: "La copertura installata. *Come si usa*.", intro: "La documentazione rende riconoscibili struttura, telo e limiti d'uso.", items: [
      ["Composizione", "Riepilogo di struttura, telo e accessori."],
      ["Uso", "Come aprire, chiudere e comportarsi col vento."],
      ["Manutenzione", "Pulizia e cura del telo."],
      ["Assistenza", "Ricambi del telo e contatti."],
    ] },
    diario: { title: "Sole pieno. *Ombra su misura*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Lo spazio da coprire."],
      ["Durante", "Struttura, guide e telo."],
      ["Dopo", "Pergola finita, telo in tensione."],
    ] },
  },
};

export const tendeSoleContent: TetEditorialContent = {
  title: "Ombra alla finestra.\nUn gesto.",
  subtitle: "Tende da sole a bracci, a cassonetto o verticali: misure, tessuto e comandi definiti finestra per finestra.",
  eyebrow: "TENDE DA SOLE",
  cover: "/pdf-stock/pergole/storia-prima-dopo.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/pergole/installazione.jpg", name: "Fissaggio del cassonetto, riferimento illustrativo" },
    { url: "/pdf-stock/comune/pulizia-consegna.jpg", name: "Pulizia finale a fine lavori" },
  ],
  needs: [
    ["Misurare ogni apertura", "Larghezza, sporgenza e altezza di ogni finestra o balcone, con lo spazio libero per l'apertura."],
    ["Scegliere il tipo giusto", "A bracci per balconi e terrazzi, a cappottina per le vetrine, verticali (a caduta) per pergole e logge."],
    ["Verificare il muro", "Il fissaggio deve reggere il peso e il vento: si controlla il supporto prima di forare."],
  ],
  solution: [
    ["Tenda per l'apertura", "Modello, sporgenza e tessuto scelti sulla finestra reale e sull'esposizione."],
    ["Fissaggio verificato", "Staffe e tasselli adatti al muro (pieno, forato, cappotto), per tenere anche col vento."],
    ["Comodità a comando", "Manovella o motore, con sensore vento dove previsto per rientrare da sole."],
  ],
  usp: [
    ["Su misura per finestra", "Ogni apertura ha la sua tenda: tipo, sporgenza e tessuto scelti uno per uno."],
    ["Fissaggi sicuri", "Staffe adatte al supporto reale, cappotto compreso, per resistere al vento."],
    ["Motore e sensori", "Automazione e sensore vento sono accessori elencati, non promesse."],
  ],
  journey: [
    ["01 · Misurare", "Aperture, sporgenze, supporti ed esposizione."],
    ["02 · Scegliere", "Tipo di tenda, tessuto, colore e comandi."],
    ["03 · Installare", "Staffe, cassonetti e collegamenti."],
    ["04 · Provare", "Apertura, sensori e consegna."],
  ],
  guarantees: [
    ["Fissaggi dichiarati", "Staffe e tasselli adatti al supporto restano indicati nel computo."],
    ["Tessuti a documento", "Modelli e colori confermati restano scritti nell'offerta."],
    ["Garanzia del produttore", "Su tende e motori vale la garanzia della casa, alle sue condizioni."],
    ["Istruzioni conservate", "Uso e manutenzione restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Aperture, supporti, esposizione e uso."],
    ["Ordine", "Tipi, tessuti, colori e comandi confermati."],
    ["Installazione", "Staffe, tende e collegamenti."],
    ["Collaudo", "Prova di apertura e sensori, e consegna."],
  ],
  faq: [
    ["Che tenda serve per il mio balcone?", "A bracci se sporge sul balcone, a caduta (verticale) se scherma di lato, a cappottina per le finestre. Il tipo si sceglie sull'apertura e sull'esposizione reali."],
    ["Regge sul cappotto?", "Con le staffe e i tasselli giusti sì: sul cappotto serve un fissaggio che scarichi sul muro sotto, non solo sull'isolante. Il supporto si verifica prima di forare."],
    ["Rientra da sola con il vento?", "Con il sensore vento sì, se previsto. Senza, va chiusa a mano: le tende aperte col vento forte sono la causa più comune di rotture."],
    ["Meglio manovella o motore?", "Il motore è più comodo, soprattutto in alto o su più tende, e permette i sensori. La manovella costa meno. La scelta è tua ed è indicata nel computo."],
    ["Il tessuto stinge o si strappa?", "I tessuti tecnici resistono ai raggi e all'acqua, con garanzie del produttore. Durata e resa dipendono dall'esposizione e dall'uso corretto."],
    ["Ripara dalla pioggia?", "Fanno soprattutto ombra. Alcune, ben inclinate e con tessuto adatto, reggono una pioggia leggera; non sono una copertura. La tenuta si dice prima."],
    ["Serve un permesso?", "Di solito le tende rientrano nell'edilizia libera, ma nei centri storici e nei condomini possono esserci regole su colore e tipo. Si verifica prima."],
    ["Le foto mostrano le mie tende?", "No, sono illustrative. Tipo, tessuto e colore reali sono quelli confermati nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "La tenda giusta *per ogni finestra*.", intro: "Non tutte le aperture vogliono la stessa tenda. La proposta sceglie tipo e fissaggio uno per uno.", photo: "/pdf-stock/pergole/storia-prima-dopo.jpg", items: [
      ["Tipo", "A bracci, a cappottina o verticale, secondo l'apertura."],
      ["Tessuto", "Tecnico, colore e trasparenza concordati."],
      ["Fissaggio", "Staffe e tasselli adatti al supporto, cappotto compreso."],
      ["Comandi", "Manovella o motore, con sensore vento dove previsto."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste tende*.", intro: "Questa sintesi accompagna le voci. Modelli e quantità confermati prevalgono sulle immagini.", items: [
      ["Fornitura", "Tende nei tipi, tessuti e colori scelti."],
      ["Fissaggi", "Staffe e tasselli adatti al supporto reale."],
      ["Comandi", "Motori e sensori dove elencati."],
      ["Installazione", "Montaggio, collegamenti e prova."],
    ], excluded: [
      ["Aperture non elencate", "Le finestre fuori dal computo non sono comprese."],
      ["Opere e pratiche", "Rinforzi del supporto e autorizzazioni condominiali sono a parte se non previsti."],
    ] },
    protezione: { title: "Forare bene. *Non rovinare*.", intro: "I supporti si verificano sul posto reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Supporti", "Individuare muro pieno, forato o cappotto e la tenuta."],
      ["Accessi", "Trabattelli e spazio per il montaggio in quota."],
      ["Finiture", "Proteggere davanzali, infissi e pavimenti."],
      ["Impianti", "Segnalare i punti elettrici per i motori."],
    ] },
    controlli: { title: "Fissaggi saldi. *Manovra fluida*.", intro: "I riscontri riguardano le tende installate e i comandi concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Fissaggi", "Verificare tenuta di staffe e tasselli."],
      ["Apertura", "Controllare scorrimento e sporgenza."],
      ["Comandi", "Provare motori e sensori vento."],
      ["Consegna", "Giro finale con te e istruzioni d'uso."],
    ] },
    documenti: { title: "Le tende installate. *Come si usano*.", intro: "La documentazione rende riconoscibili modelli, fissaggi e cura, utili per ricambi.", items: [
      ["Composizione", "Riepilogo di tipi, tessuti e comandi."],
      ["Uso", "Apertura, sensori e comportamento col vento."],
      ["Manutenzione", "Pulizia e cura dei tessuti."],
      ["Assistenza", "Ricambi e contatti."],
    ] },
    diario: { title: "Sole in faccia. *Ombra fresca*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Le finestre esposte al sole."],
      ["Durante", "Staffe, cassonetti e tende."],
      ["Dopo", "Tende installate e provate."],
    ] },
  },
};

export const vetrateChiusureContent: TetEditorialContent = {
  title: "Il balcone, tutto l'anno.\nVetro che scompare.",
  subtitle: "Vetrate panoramiche e chiusure di balconi e logge: profili sottili, ante impacchettabili e requisiti da verificare.",
  eyebrow: "VETRATE E CHIUSURE",
  cover: "/pdf-stock/pergole/tecnica-acqua.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/pergole/installazione.jpg", name: "Montaggio delle guide, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Definire cosa si chiude", "Balcone, loggia o veranda: quali lati si vetrano e come le ante si aprono (a libro, scorrevoli, impacchettabili)."],
    ["Capire i vincoli", "La chiusura di un balcone può cambiare i volumi dell'immobile: i requisiti e le pratiche dipendono dal caso e dal Comune."],
    ["Scegliere il sistema giusto", "Vetrate a tutto vetro senza montanti, o vetrocamera con profili: cambia l'isolamento e l'uso invernale."],
  ],
  solution: [
    ["Perimetro chiaro", "Si indica quali lati si chiudono, il tipo di apertura e come le ante si raccolgono."],
    ["Requisiti verificati", "Si distingue una schermatura leggera da una chiusura che modifica i volumi, con le pratiche che ne derivano."],
    ["Sistema sull'uso", "Tutto vetro per riparare da vento e polvere, vetrocamera dove serve calore: si sceglie sull'uso reale."],
  ],
  usp: [
    ["Spazio in più", "Il balcone diventa vivibile anche col freddo, senza murare nulla."],
    ["Vetro che sparisce", "Ante impacchettabili che si raccolgono di lato: aperto d'estate, chiuso d'inverno."],
    ["Onestà sui vincoli", "Diciamo prima cosa cambia nei volumi e quali pratiche servono, senza promesse facili."],
  ],
  journey: [
    ["01 · Rilevare", "Lati da chiudere, misure, appoggi e uso previsto."],
    ["02 · Verificare", "Requisiti, tipo di sistema e pratiche necessarie."],
    ["03 · Installare", "Guide, profili, vetri e regolazioni."],
    ["04 · Consegnare", "Prova delle ante, tenuta e giro finale."],
  ],
  guarantees: [
    ["Perimetro scritto", "Lati chiusi, sistema e apertura restano nel computo."],
    ["Vincoli dichiarati", "Ciò che incide sui volumi e sulle pratiche è indicato, non taciuto."],
    ["Garanzia del produttore", "Su profili, vetri e ferramenta vale la garanzia della casa."],
    ["Documenti conservati", "Schede e istruzioni restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Lati, misure, appoggi e uso."],
    ["Verifica e ordine", "Requisiti, sistema e pratiche; poi conferma."],
    ["Installazione", "Guide, profili, vetri e regolazione delle ante."],
    ["Collaudo", "Prova di apertura e tenuta, e consegna."],
  ],
  faq: [
    ["Chiudere il balcone è sempre permesso?", "No: a seconda di come si chiude può cambiare la superficie o il volume dell'immobile, con pratiche e requisiti diversi. È il punto più delicato: si verifica prima, sul caso concreto e sulle regole del Comune."],
    ["Le vetrate isolano dal freddo?", "Le vetrate a tutto vetro riparano da vento, pioggia e polvere ma isolano poco; per un uso invernale caldo servono vetrocamera e profili adatti. La scelta dipende dall'uso."],
    ["Le ante spariscono davvero?", "I sistemi impacchettabili raccolgono le ante di lato, lasciando il balcone aperto d'estate. Lo spazio di raccolta e il tipo di apertura si concordano."],
    ["C'è condensa?", "Su un vetro singolo, con la casa calda dietro, può formarsi. Si riduce con vetrocamera e aerazione: se ne parla prima, in base all'uso previsto."],
    ["Serve il tecnico per le pratiche?", "Quando la chiusura incide sui volumi, sì: la pratica la segue un tecnico incaricato. Noi indichiamo cosa serve; l'incarico è separato dalla fornitura."],
    ["Reggono il vento in quota?", "I sistemi hanno guide e ferramenta dimensionate, con limiti dichiarati. Esposizione e altezza si valutano al sopralluogo."],
    ["Il condominio può dire di no?", "Sì: aspetto esterno e decoro possono richiedere l'ok dell'assemblea. È bene verificarlo prima dell'ordine; non è compreso nella fornitura."],
    ["Le foto mostrano la mia vetrata?", "No, sono illustrative. Sistema, profili e vetri reali sono quelli confermati nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "Vetro che *apre e chiude la stagione*.", intro: "Una chiusura vale per come si apre e per cosa ripara. La proposta dice sistema, perimetro e requisiti.", photo: "/pdf-stock/pergole/tecnica-acqua.jpg", items: [
      ["Perimetro", "Quali lati si chiudono e come le ante si aprono."],
      ["Sistema", "Tutto vetro o vetrocamera, secondo l'uso."],
      ["Requisiti", "Cosa incide su volumi e pratiche, dichiarato."],
      ["Ferramenta", "Guide e ante impacchettabili dimensionate."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa chiusura*.", intro: "Questa sintesi accompagna le voci. Sistema e perimetro confermati prevalgono sulle immagini.", items: [
      ["Fornitura", "Profili, vetri e ferramenta del sistema scelto."],
      ["Installazione", "Guide, montaggio e regolazione delle ante."],
      ["Sigillature", "Tenuta ad acqua e aria dove previsto."],
      ["Prova", "Apertura, chiusura e riscontro finale."],
    ], excluded: [
      ["Pratiche edilizie", "Autorizzazioni, calcoli e incarichi tecnici sono a parte se non elencati."],
      ["Opere edili", "Rinforzi, soglie e ripristini murari si valutano separatamente."],
    ] },
    protezione: { title: "Vetri in quota. *Cantiere sicuro*.", intro: "Accessi e appoggi si concordano sul posto reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Accessi", "Percorso per vetri e profili fino al balcone."],
      ["Appoggi", "Verificare parapetto, soglia e punti di fissaggio."],
      ["Finiture", "Proteggere pavimenti e parapetti esistenti."],
      ["Sicurezza", "Movimentazione dei vetri in quota in sicurezza."],
    ] },
    controlli: { title: "Ante allineate. *Chiusura a tenuta*.", intro: "I riscontri riguardano la chiusura installata e il sistema concordato.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Guide", "Verificare scorrimento e allineamento delle ante."],
      ["Tenuta", "Controllare le sigillature ad acqua e aria previste."],
      ["Apertura", "Provare l'impacchettamento e la chiusura."],
      ["Consegna", "Giro finale con te e istruzioni d'uso."],
    ] },
    documenti: { title: "La chiusura installata. *Vincoli e uso*.", intro: "La documentazione rende riconoscibili sistema, requisiti e limiti d'uso.", items: [
      ["Composizione", "Riepilogo di profili, vetri e ferramenta."],
      ["Requisiti", "Cosa è stato verificato su volumi e pratiche."],
      ["Uso", "Apertura, aerazione e gestione della condensa."],
      ["Assistenza", "Manutenzione della ferramenta e contatti."],
    ] },
    diario: { title: "Balcone aperto. *Stanza in più*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Il balcone o la loggia da chiudere."],
      ["Durante", "Guide, profili e vetri."],
      ["Dopo", "Chiusura finita, ante provate."],
    ] },
  },
};

export const carportContent: TetEditorialContent = {
  title: "L'auto al riparo.\nSenza costruire un garage.",
  subtitle: "Carport e tettoie per auto, legna o ingressi: struttura, copertura e ancoraggi definiti sul tuo spazio.",
  eyebrow: "CARPORT E TETTOIE",
  cover: "/module-art/pavimenti-esterni-controllo-pendenza-v1.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/pergole/installazione.jpg", name: "Montaggio della struttura, riferimento illustrativo" },
    { url: "/pdf-stock/pergole/tecnica-acqua.jpg", name: "Scarico dell'acqua dalla copertura" },
  ],
  needs: [
    ["Sapere cosa riparare", "Auto, legna, l'ingresso o un'area di servizio: la larghezza e l'altezza cambiano in base all'uso."],
    ["Scegliere la copertura", "Lamiera, pannelli, policarbonato o legno: cambia il peso, la luce che passa e la manutenzione."],
    ["Fondare e scaricare l'acqua", "Una tettoia raccoglie tanta acqua e prende vento: fondazioni, ancoraggi e scarico vanno definiti."],
  ],
  solution: [
    ["Struttura sull'uso", "Luce e altezza dimensionate su cosa si ripara (un'auto, due, un fuoristrada) e sullo spazio."],
    ["Copertura adatta", "Opaca per ombra piena o traslucida per la luce, con la pendenza che porta via l'acqua."],
    ["Ancoraggi seri", "Plinti o fissaggi dimensionati per il vento e per il peso della copertura e dell'eventuale neve."],
  ],
  usp: [
    ["Riparo senza permessi pesanti", "Una tettoia costa e impegna meno di un garage; le pratiche dipendono dal caso e dal Comune."],
    ["Struttura dimensionata", "Luce e altezza sull'uso reale, con ancoraggi che tengono col vento."],
    ["Acqua gestita", "Pendenza e canale di scarico previsti, non lasciati al caso."],
  ],
  journey: [
    ["01 · Rilevare", "Spazio, uso, terreno e scarico dell'acqua."],
    ["02 · Confermare", "Dimensioni, copertura, fondazioni e ancoraggi."],
    ["03 · Installare", "Fondazioni, struttura, copertura e scarico."],
    ["04 · Consegnare", "Verifica di tenuta e stabilità, e giro finale."],
  ],
  guarantees: [
    ["Struttura dichiarata", "Materiale, luce, altezza e ancoraggi compresi sono nel computo."],
    ["Fondazioni previste", "Plinti e fissaggi restano indicati e verificati."],
    ["Garanzia del produttore", "Su struttura e copertura vale la garanzia della casa."],
    ["Documenti conservati", "Schede e limiti d'uso restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Spazio, uso, terreno, vento e scarico."],
    ["Ordine", "Struttura, copertura e fondazioni confermate."],
    ["Installazione", "Fondazioni, montaggio, copertura e scarico."],
    ["Collaudo", "Verifica di stabilità e tenuta, e consegna."],
  ],
  faq: [
    ["Serve il permesso per un carport?", "Dipende: dimensioni, materiali, distanza dai confini e Comune decidono se basta una comunicazione o serve una pratica. Le regole in vigore si verificano prima; la pratica, se serve, la segue il tecnico."],
    ["Che copertura conviene?", "Lamiera coibentata o pannelli per ombra piena e poco caldo sotto; policarbonato per far passare luce; legno per l'estetica. Peso e manutenzione cambiano: si sceglie sull'uso."],
    ["Regge la neve?", "Ogni struttura ha un carico di neve dichiarato: nelle zone nevose si dimensiona di conseguenza. Fondazioni e ancoraggi si valutano sul terreno reale."],
    ["Servono le fondazioni?", "Quasi sempre: plinti in calcestruzzo o fissaggi su platea esistente. Appoggiare una tettoia senza ancoraggi adeguati la rende pericolosa col vento."],
    ["Dove va a finire l'acqua?", "La copertura ha una pendenza e, dove serve, un canale di gronda che porta l'acqua a uno scarico. Il percorso si concorda per non allagare il vialetto."],
    ["Posso chiuderlo in futuro?", "Alcune strutture si possono tamponare con pareti o vetrate in un secondo momento, cambiando però i requisiti edilizi. Se è un obiettivo, si dice prima per predisporre."],
    ["Va bene anche per la legna o le bici?", "Sì: la stessa struttura ripara legna, bici o un'area di servizio. Cambia solo la dimensione, indicata nel computo."],
    ["Le foto mostrano la mia tettoia?", "No, sono illustrative. Struttura, copertura e dimensioni reali sono quelle confermate nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "Riparo su misura. *Acqua incanalata*.", intro: "Una tettoia vale per come è fondata e per dove porta l'acqua. La proposta lo dice.", photo: "/module-art/pavimenti-esterni-controllo-pendenza-v1.jpg", items: [
      ["Struttura", "Luce e altezza sull'uso e sullo spazio reali."],
      ["Copertura", "Opaca o traslucida, con la pendenza giusta."],
      ["Fondazioni", "Plinti o fissaggi dimensionati per vento e neve."],
      ["Acqua", "Scarico dalla copertura verso il punto concordato."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa tettoia*.", intro: "Questa sintesi accompagna le voci. Dimensioni e copertura confermate prevalgono sulle immagini.", items: [
      ["Struttura", "Nella luce, altezza e materiale concordati."],
      ["Copertura", "Del tipo scelto, con la pendenza."],
      ["Fondazioni", "Plinti o fissaggi previsti nel computo."],
      ["Scarico", "Canale e discesa dell'acqua dove elencati."],
    ], excluded: [
      ["Pratiche e opere edili", "Autorizzazioni, calcoli e pavimentazioni sono a parte se non elencati."],
      ["Tamponamenti", "Chiusure laterali o vetrate future richiedono una valutazione separata."],
    ] },
    protezione: { title: "Fondare bene. *Rispettare lo spazio*.", intro: "Terreno e accessi si valutano sul posto reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Terreno", "Verificare consistenza e sottoservizi prima di scavare."],
      ["Accessi", "Percorso per struttura e mezzi fino all'area."],
      ["Pavimentazione", "Proteggere o ripristinare le superfici esistenti."],
      ["Scarico", "Individuare dove convogliare l'acqua."],
    ] },
    controlli: { title: "Struttura stabile. *Copertura a tenuta*.", intro: "I riscontri riguardano la tettoia installata e le opere concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Fondazioni", "Verificare plinti e ancoraggi."],
      ["Struttura", "Controllare piombo e stabilità al vento."],
      ["Copertura", "Riscontrare fissaggio, pendenza e tenuta."],
      ["Acqua", "Provare lo scarico verso il punto previsto."],
    ] },
    documenti: { title: "La tettoia installata. *Limiti e uso*.", intro: "La documentazione rende riconoscibili struttura, fondazioni e carichi ammessi.", items: [
      ["Composizione", "Riepilogo di struttura e copertura."],
      ["Fondazioni", "Tipo e posizione degli ancoraggi."],
      ["Limiti", "Carichi di vento e neve dichiarati."],
      ["Assistenza", "Manutenzione e contatti."],
    ] },
    diario: { title: "Auto sotto il sole. *Auto al riparo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Lo spazio da coprire."],
      ["Durante", "Fondazioni, struttura e copertura."],
      ["Dopo", "Tettoia finita, scarico provato."],
    ] },
  },
};
