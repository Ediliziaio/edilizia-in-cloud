/**
 * Area «Pareti e soffitti» (Lotto 2): sette modelli sul motore Ristrutturazioni.
 * Ogni costante è dati a sé, con i testi scritti per quel lavoro: copiare o
 * cambiarne una non tocca le altre né gli altri modelli (regola d'oro del piano).
 */
import type { TetEditorialContent } from "./fullTettiFactory";

export const tinteggiaturaInternaContent: TetEditorialContent = {
  title: "Pareti pulite.\nColore steso a regola d'arte.",
  subtitle: "Preparazione, mani di finitura e protezioni: cosa si tinteggia e cosa resta com'è, scritto prima di iniziare.",
  eyebrow: "TINTEGGIATURA INTERNA",
  cover: "/pdf-stock/ristrutturazione/risultato.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/protezione-scale.jpg", name: "Protezione dei pavimenti e dei passaggi" },
    { url: "/pdf-stock/comune/pulizia-consegna.jpg", name: "Pulizia finale a fine lavori" },
  ],
  needs: [
    ["Sapere cosa si tinteggia", "Individuare stanze, pareti e soffitti compresi, distinguendoli dalle superfici che restano come sono."],
    ["Preparare il fondo", "Riconoscere crepe, fori e vecchie pitture che richiedono stuccatura o carteggiatura prima del colore."],
    ["Proteggere il resto", "Definire come si proteggono pavimenti, mobili, infissi e prese durante l'applicazione."],
  ],
  solution: [
    ["Un perimetro chiaro", "Ogni voce indica gli ambienti e le superfici comprese, in metri quadri. Le pareti non elencate restano fuori dal computo."],
    ["Fondo preparato", "Stuccature, carteggiature e mano di fondo si concordano dove servono, non dovunque per abitudine."],
    ["Colore confermato prima", "Tinta, finitura (opaca, lavabile, traspirante) e numero di mani si scelgono con te prima dell'applicazione."],
  ],
  usp: [
    ["Preparazione inclusa quando serve", "Un buon risultato dipende dal fondo: stuccature e carteggiature previste sono elencate, non sottintese."],
    ["Confini scritti", "Superfici comprese, protezioni e parti escluse sono distinte nel computo."],
    ["Tinta scelta insieme", "Colore e tipo di pittura si confermano prima di comprare i materiali."],
  ],
  journey: [
    ["01 · Rilevare", "Superfici da tinteggiare, stato del fondo e protezioni necessarie."],
    ["02 · Confermare", "Tinta, finitura, numero di mani e ambiti compresi."],
    ["03 · Applicare", "Preparazione del fondo e stesura del colore nelle zone concordate."],
    ["04 · Consegnare", "Rimozione delle protezioni, pulizia e verifica delle superfici trattate."],
  ],
  guarantees: [
    ["Fondo dichiarato", "La proposta dice quali preparazioni sono comprese e quali no."],
    ["Tinta a documento", "Colore e finitura confermati restano scritti nell'offerta."],
    ["Superfici verificate", "I riscontri riguardano le pareti trattate, non l'intero immobile."],
    ["Prodotti tracciati", "Tipo di pittura e schede restano a te, per ritocchi futuri coerenti."],
  ],
  schedule: [
    ["Sopralluogo", "Superfici, stato del fondo, umidità visibile e protezioni."],
    ["Preparazione", "Stuccature, carteggiature, mano di fondo dove prevista."],
    ["Tinteggiatura", "Mani di finitura nelle stanze concordate, con i tempi di asciugatura."],
    ["Consegna", "Rimozione protezioni, pulizia e giro di verifica con te."],
  ],
  faq: [
    ["Quante mani di pittura sono comprese?", "Quelle indicate nel computo, di solito due sul fondo preparato. Coprenza e resa dipendono dal colore di partenza e dalla tinta scelta: eventuali mani in più si concordano."],
    ["Devo svuotare le stanze?", "I mobili piccoli è meglio spostarli. Per quelli grandi si concorda chi li sposta e li protegge: nel prezzo rientra solo ciò che è elencato."],
    ["Si vedranno le crepe dopo la pittura?", "Solo se stuccate e carteggiate prima. Le riparazioni del fondo comprese sono quelle scritte; crepe strutturali o umidità vanno affrontate a parte."],
    ["Posso stare in casa durante i lavori?", "Di solito sì, una stanza alla volta. Odori e tempi di asciugatura dipendono dal prodotto; le pitture all'acqua sono poco intense ma serve comunque areare."],
    ["Che differenza c'è tra pittura lavabile e traspirante?", "La lavabile resiste ai lavaggi e si usa in cucina e nei corridoi; la traspirante lascia respirare il muro ed è utile dove c'è umidità. La scelta si fa stanza per stanza."],
    ["Coprite anche i soffitti?", "Solo se sono nel computo. Il soffitto ha una preparazione e una resa diverse dalle pareti e va indicato come voce a sé."],
    ["Rifate i ritocchi se resta qualche imperfezione?", "Alla consegna facciamo un giro insieme: i ritocchi delle superfici trattate rientrano nel lavoro. Nuovi danni fatti dopo la consegna sono un intervento separato."],
    ["Le foto mostrano il colore che avrò?", "No, sono immagini illustrative. Il colore reale dipende dalla tinta scelta, dalla luce della stanza e dal fondo: si conferma su cartella o campione."],
  ],
  blocks: {
    comeFunziona: { title: "Preparare, poi *stendere*.", intro: "Il colore dura se il fondo è pronto. La proposta distingue la preparazione dalla finitura, stanza per stanza.", photo: "/pdf-stock/ristrutturazione/risultato.jpg", items: [
      ["Superfici comprese", "Pareti e soffitti indicati nel computo, in metri quadri."],
      ["Preparazione del fondo", "Stuccature, carteggiature e mano di fondo dove previste."],
      ["Finitura", "Tipo di pittura, numero di mani e resa concordati."],
      ["Protezioni", "Pavimenti, infissi, prese e mobili da coprire durante l'applicazione."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Metri quadri e descrizioni confermate prevalgono sulle immagini.", items: [
      ["Preparazione", "Protezioni e preparazione del fondo dove indicate nel computo."],
      ["Materiali", "Pitture e prodotti della qualità e finitura concordate."],
      ["Applicazione", "Mani di finitura sulle superfici elencate."],
      ["Pulizia finale", "Rimozione delle protezioni e pulizia delle aree trattate."],
    ], excluded: [
      ["Superfici non elencate", "Stanze, soffitti e pareti fuori dal computo non sono compresi, anche se adiacenti."],
      ["Risanamenti", "Crepe strutturali, umidità di risalita e muffa richiedono un intervento a parte, prima della tinteggiatura."],
    ] },
    protezione: { title: "Tinteggiare le pareti. *Proteggere il resto*.", intro: "Le protezioni si scelgono per le superfici e i passaggi reali. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli e cartone sulle superfici mantenute nelle zone di lavoro."],
      ["Infissi e prese", "Mascheratura di porte, finestre, battiscopa e punti elettrici."],
      ["Mobili", "Concordare cosa spostare, coprire o lasciare, e chi se ne occupa."],
      ["Passaggi", "Percorsi puliti per l'accesso alle stanze in lavorazione."],
    ] },
    controlli: { title: "Fondo pronto. *Colore uniforme*.", intro: "I riscontri riguardano le superfici trattate e le lavorazioni concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Fondo", "Verificare che stuccature e carteggiature siano pronte alla pittura."],
      ["Coprenza", "Controllare uniformità del colore e assenza di aloni o riprese visibili."],
      ["Bordi", "Riscontrare le linee di stacco su infissi, soffitti e battiscopa."],
      ["Consegna", "Giro finale con te, ritocchi delle aree trattate e pulizia."],
    ] },
    documenti: { title: "Le superfici trattate. *I prodotti usati*.", intro: "La documentazione rende riconoscibile l'ambito e i materiali, senza attribuire ad altre parti lavorazioni non fatte.", items: [
      ["Perimetro", "Riepilogo delle stanze e delle superfici tinteggiate."],
      ["Colori e prodotti", "Tinte, finiture e schede delle pitture usate, per ritocchi futuri."],
      ["Preparazioni fatte", "Stuccature e carteggiature comprese nell'intervento."],
      ["Assistenza", "Indicazioni per la manutenzione delle superfici e contatti."],
    ] },
    diario: { title: "Prima grigio. *Poi il tuo colore*.", intro: "Quando concordato, il diario usa foto reali della stanza. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Stato delle pareti e dei fondi da preparare."],
      ["Durante", "Stuccature, mano di fondo e stesura del colore."],
      ["Dopo", "Superfici finite, protezioni rimosse e pulizia."],
    ] },
  },
};

export const cartaDaParatiContent: TetEditorialContent = {
  title: "La parete che cambia stanza.\nCarta posata a filo.",
  subtitle: "Preparazione del muro, allineamento del disegno e giunzioni curate: dove va la carta e cosa resta dipinto.",
  eyebrow: "CARTA DA PARATI",
  cover: "/pdf-stock/ristrutturazione/storia-consegna-chiavi.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/pavimenti/materiali.jpg", name: "Rotoli e colla, riferimento illustrativo" },
    { url: "/pdf-stock/comune/pulizia-consegna.jpg", name: "Pulizia finale a fine lavori" },
  ],
  needs: [
    ["Scegliere la parete giusta", "Individuare quali pareti rivestire e quali lasciare dipinte, tenendo conto di luce, umidità e usura."],
    ["Preparare un fondo liscio", "La carta segue il muro: crepe, fori e vecchie pitture vanno sistemati prima, o il difetto resta visibile."],
    ["Curare disegno e giunzioni", "Definire come si allinea il motivo, dove cadono le giunzioni e come si raccordano angoli, prese e interruttori."],
  ],
  solution: [
    ["Pareti indicate una per una", "Ogni voce dice quale parete e quanti metri quadri. Il resto della stanza resta come concordato."],
    ["Fondo pronto per la carta", "Rasatura e primer dove servono, così la carta aderisce e le giunzioni restano invisibili."],
    ["Carta confermata prima", "Tipo (tessuto non tessuto, vinilico, fotomurale), disegno e verso di posa si scelgono prima dell'ordine."],
  ],
  usp: [
    ["Fondo curato", "La resa della carta dipende dal muro sotto: le preparazioni previste sono elencate."],
    ["Giunzioni pulite", "Allineamento del disegno e raccordi su angoli e prese fatti a regola d'arte."],
    ["Materiale scelto insieme", "Tipo di carta, metratura e sfrido si confermano prima di ordinare i rotoli."],
  ],
  journey: [
    ["01 · Rilevare", "Pareti da rivestire, stato del fondo e metratura con lo sfrido del disegno."],
    ["02 · Scegliere", "Tipo di carta, motivo, colla e verso di posa."],
    ["03 · Posare", "Preparazione del fondo e applicazione con allineamento del disegno."],
    ["04 · Consegnare", "Verifica delle giunzioni, pulizia e ritiro degli scarti."],
  ],
  guarantees: [
    ["Fondo dichiarato", "La proposta dice quali preparazioni del muro sono comprese."],
    ["Materiale a documento", "Tipo di carta e metratura restano scritti nell'offerta."],
    ["Giunzioni verificate", "I riscontri riguardano le pareti rivestite e i raccordi."],
    ["Schede conservate", "Riferimenti della carta e della colla restano a te, per ritocchi o aggiunte."],
  ],
  schedule: [
    ["Sopralluogo", "Pareti, stato del fondo, umidità e metratura con lo sfrido."],
    ["Ordine", "Carta e colla confermate; tempi di consegna del materiale."],
    ["Preparazione e posa", "Rasatura o primer dove serve, poi applicazione allineata."],
    ["Consegna", "Verifica delle giunzioni, pulizia e ritiro degli scarti."],
  ],
  faq: [
    ["La carta si vede sulle pareti storte?", "La carta segue il muro: bugne, crepe e dislivelli restano percepibili se non si rasa prima. Le preparazioni comprese sono quelle scritte nel computo."],
    ["Quanto materiale serve davvero?", "Oltre alla superficie serve lo sfrido per allineare il disegno: più il motivo è grande, più aumenta. La metratura da ordinare si calcola sulla carta scelta."],
    ["Posso metterla in bagno o in cucina?", "Alcune carte (viniliche, lavabili) reggono l'umidità e i vapori, altre no. Nelle zone umide si sceglie il tipo adatto o si preferisce la pittura."],
    ["Si stacca dopo qualche anno?", "Con fondo preparato e colla giusta tiene a lungo. I distacchi nascono da muri umidi, fondi polverosi o colla sbagliata: per questo il fondo va sistemato prima."],
    ["Chi toglie la vecchia carta?", "La rimozione è una lavorazione a sé: se prevista è nel computo, con la preparazione del fondo che resta sotto."],
    ["Come vengono prese e interruttori?", "Si smontano le placche, si taglia la carta a filo e si rimontano: i raccordi sui punti elettrici sono parte della posa curata."],
    ["Il disegno sarà allineato tra un telo e l'altro?", "Sì, l'allineamento del motivo è il senso della posa a regola d'arte, ed è il motivo dello sfrido. Le giunzioni si controllano insieme alla consegna."],
    ["Le foto mostrano la carta che avrò?", "No, sono illustrative. Motivo, colore e finitura reali dipendono dalla carta scelta e vanno confermati su campione."],
  ],
  blocks: {
    comeFunziona: { title: "Fondo liscio, *disegno allineato*.", intro: "La carta valorizza la parete solo se il muro sotto è pronto e le giunzioni sono curate.", photo: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", items: [
      ["Pareti comprese", "Quali pareti e quanti metri quadri, con lo sfrido del disegno."],
      ["Preparazione del fondo", "Rasatura, primer e sistemazione dei difetti dove previsti."],
      ["Carta e colla", "Tipo di carta, motivo e adesivo adatto al supporto."],
      ["Raccordi", "Angoli, prese e interruttori rifiniti a filo."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste pareti*.", intro: "Questa sintesi accompagna le voci. Metratura e tipo di carta confermati prevalgono sulle immagini.", items: [
      ["Preparazione", "Protezioni e preparazione del fondo dove indicate."],
      ["Materiale", "Carta e colla della qualità concordata, con lo sfrido calcolato."],
      ["Posa", "Applicazione allineata sulle pareti elencate."],
      ["Pulizia", "Rimozione delle protezioni, pulizia e ritiro degli scarti."],
    ], excluded: [
      ["Pareti non elencate", "Le pareti fuori dal computo restano dipinte o come sono."],
      ["Risanamenti", "Umidità, muffa e crepe strutturali vanno risolti prima, come intervento a parte."],
    ] },
    protezione: { title: "Rivestire una parete. *Proteggere la stanza*.", intro: "Le protezioni si scelgono sulle superfici reali. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli sotto l'area di lavoro, dove cade colla e ritagli."],
      ["Punti elettrici", "Smontaggio delle placche e messa in sicurezza durante la posa."],
      ["Mobili", "Concordare cosa spostare dalla parete interessata."],
      ["Passaggi", "Accesso pulito e superficie d'appoggio per tagliare i teli."],
    ] },
    controlli: { title: "Aderenza piena. *Giunzioni invisibili*.", intro: "I riscontri riguardano le pareti rivestite e i raccordi concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Aderenza", "Verificare che non ci siano bolle o distacchi."],
      ["Disegno", "Controllare l'allineamento del motivo tra i teli."],
      ["Raccordi", "Riscontrare angoli, prese e bordi rifiniti a filo."],
      ["Consegna", "Giro finale con te, pulizia e ritiro degli scarti."],
    ] },
    documenti: { title: "Le pareti rivestite. *Il materiale usato*.", intro: "La documentazione rende riconoscibili l'ambito e la carta scelta, per aggiunte o ritocchi coerenti.", items: [
      ["Perimetro", "Riepilogo delle pareti rivestite e della metratura."],
      ["Carta e colla", "Riferimenti del prodotto usato, per acquistare lo stesso in futuro."],
      ["Preparazioni fatte", "Rasature e primer compresi nell'intervento."],
      ["Assistenza", "Indicazioni per la cura della carta e contatti."],
    ] },
    diario: { title: "Muro grezzo. *Parete che racconta*.", intro: "Quando concordato, il diario usa foto reali della parete. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Stato del fondo da preparare."],
      ["Durante", "Rasatura, primer e posa allineata dei teli."],
      ["Dopo", "Parete finita, giunzioni curate e pulizia."],
    ] },
  },
};

export const cartongessoContent: TetEditorialContent = {
  title: "Nuove pareti in un giorno.\nPulite, dritte, isolate.",
  subtitle: "Pareti e contropareti a secco: struttura, isolante e lastre, con predisposizioni per luci e impianti definite prima.",
  eyebrow: "PARETI IN CARTONGESSO",
  cover: "/pdf-stock/ristrutturazione/cantiere.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere.jpg", name: "Struttura a secco in fase di montaggio" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Definire cosa dividere", "Individuare dove nasce la nuova parete o controparete e quali funzioni deve avere (dividere, isolare, nascondere impianti)."],
    ["Scegliere la lastra giusta", "Ambienti umidi, resistenza al fuoco e isolamento acustico chiedono lastre diverse: si sceglie in base alla stanza."],
    ["Prevedere prima gli impianti", "Punti luce, prese, mensole e sanitari vanno predisposti dentro la struttura, prima di chiudere le lastre."],
  ],
  solution: [
    ["Struttura dimensionata", "Orditura metallica passo e spessore adatti all'altezza e ai carichi previsti (mensole, TV, sanitari sospesi)."],
    ["Lastra scelta per la stanza", "Idrofuga in bagno, fonoisolante dove serve silenzio, ignifuga dove richiesto: indicata nel computo."],
    ["Predisposizioni concordate", "Passaggi per impianti, rinforzi e scatole si definiscono prima di chiudere, non dopo."],
  ],
  usp: [
    ["Lavori puliti e veloci", "A secco: poca polvere, tempi corti e nessun tempo di asciugatura del massetto."],
    ["Isolamento dentro la parete", "Lana minerale nell'intercapedine per il caldo e il silenzio, dove previsto."],
    ["Impianti nascosti bene", "Cavi e tubi corrono nella struttura, con rinforzi dove poggeranno carichi."],
  ],
  journey: [
    ["01 · Progettare", "Posizione, funzione e impianti da predisporre nella parete."],
    ["02 · Confermare", "Tipo di lastra, isolante, rinforzi e finitura di consegna."],
    ["03 · Montare", "Orditura, impianti, isolante e chiusura con le lastre."],
    ["04 · Rifinire", "Stuccatura dei giunti, carteggiatura e consegna pronta alla pittura."],
  ],
  guarantees: [
    ["Struttura dichiarata", "Orditura, lastra e isolante compresi sono scritti nel computo."],
    ["Rinforzi dove servono", "I punti di carico predisposti restano indicati per usi futuri."],
    ["Giunti a regola d'arte", "La consegna prevista è la superficie pronta alla finitura concordata."],
    ["Schede conservate", "Riferimenti di lastre e isolante restano a te, per forare in sicurezza."],
  ],
  schedule: [
    ["Sopralluogo", "Posizione della parete, altezze, carichi e impianti da predisporre."],
    ["Preparazione", "Materiali confermati, protezioni e accessi."],
    ["Montaggio", "Orditura, impianti, isolante e chiusura con le lastre."],
    ["Finitura", "Stuccatura dei giunti, carteggiatura e pulizia."],
  ],
  faq: [
    ["Il cartongesso regge una TV o le mensole?", "Sì, se la struttura ha i rinforzi giusti nel punto previsto. Per questo i carichi vanno indicati prima di chiudere: appenderli a lastra vuota non tiene."],
    ["È adatto al bagno?", "Con le lastre idrofughe e, sotto le piastrelle, quelle apposite. La scelta della lastra dipende dall'umidità della stanza ed è indicata nel computo."],
    ["Isola dai rumori del vicino?", "Aiuta, con l'isolante nell'intercapedine e le lastre adatte. L'attenuazione reale dipende dalla stratigrafia scelta: non tutte le pareti a secco sono uguali."],
    ["Fa polvere come murare?", "Molto meno: si monta a secco. La carteggiatura dei giunti produce un po' di polvere fine, contenuta con le protezioni."],
    ["Ci passo gli impianti dentro?", "Sì, è uno dei vantaggi: cavi e tubi corrono nell'orditura. I passaggi vanno predisposti prima di chiudere le lastre."],
    ["Quanto spazio ruba alla stanza?", "Una parete divisoria a secco è più sottile di una in muratura; una controparete isolante ruba pochi centimetri. Lo spessore si concorda in base a isolante e impianti."],
    ["La consegna è già dipinta?", "No: la consegna prevista è la superficie stuccata e carteggiata, pronta alla pittura. La tinteggiatura, se la vuoi, è una voce a parte."],
    ["Le foto mostrano il mio lavoro?", "No, sono illustrative. La parete reale dipende dalla stratigrafia e dagli impianti concordati nel computo."],
  ],
  blocks: {
    comeFunziona: { title: "Struttura, isolante, *lastra*.", intro: "Una parete a secco è fatta a strati. La proposta dice quali, così sai cosa c'è dentro il muro.", photo: "/pdf-stock/ristrutturazione/cantiere.jpg", items: [
      ["Orditura", "Struttura metallica dimensionata su altezza e carichi."],
      ["Impianti", "Passaggi e scatole predisposti prima della chiusura."],
      ["Isolante", "Lana minerale nell'intercapedine dove previsto."],
      ["Lastre", "Tipo scelto per la stanza: idrofuga, fonoisolante o ignifuga."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa parete*.", intro: "Questa sintesi accompagna le voci. Stratigrafia e metratura confermate prevalgono sulle immagini.", items: [
      ["Struttura", "Orditura e rinforzi nei punti di carico indicati."],
      ["Materiali", "Lastre e isolante della qualità concordata."],
      ["Predisposizioni", "Passaggi impianti previsti nel computo."],
      ["Finitura", "Stuccatura dei giunti e superficie pronta alla pittura."],
    ], excluded: [
      ["Impianti e finiture", "Il cablaggio elettrico, l'idraulica e la tinteggiatura sono voci a sé se non elencate."],
      ["Pareti non previste", "Nuove pareti oltre a quelle indicate richiedono una valutazione separata."],
    ] },
    protezione: { title: "Montare pulito. *Proteggere il resto*.", intro: "Le protezioni si scelgono sulle superfici reali. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli nelle zone di montaggio e taglio."],
      ["Passaggi", "Percorsi per lastre e struttura fino alla stanza."],
      ["Mobili", "Spostare o coprire ciò che sta vicino alla nuova parete."],
      ["Polvere fine", "Contenere la polvere della carteggiatura dei giunti."],
    ] },
    controlli: { title: "Struttura salda. *Giunti piani*.", intro: "I riscontri riguardano la parete realizzata e le predisposizioni concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Struttura", "Verificare stabilità, piombo e rinforzi nei punti di carico."],
      ["Impianti", "Controllare che i passaggi predisposti siano accessibili."],
      ["Giunti", "Riscontrare stuccatura e planarità delle lastre."],
      ["Consegna", "Giro finale con te e pulizia."],
    ] },
    documenti: { title: "La parete realizzata. *Cosa c'è dentro*.", intro: "La documentazione rende riconoscibili stratigrafia e rinforzi, utili per forare o appendere in sicurezza.", items: [
      ["Composizione", "Riepilogo di struttura, isolante e lastre usate."],
      ["Rinforzi", "Posizione dei punti predisposti per i carichi."],
      ["Predisposizioni", "Passaggi impianti lasciati nella parete."],
      ["Assistenza", "Indicazioni per fissaggi futuri e contatti."],
    ] },
    diario: { title: "Vuoto. *Poi la stanza nuova*.", intro: "Quando concordato, il diario usa foto reali del cantiere. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Spazio e punti dove nascono le pareti."],
      ["Durante", "Orditura, impianti, isolante e lastre."],
      ["Dopo", "Superficie stuccata, pronta alla finitura."],
    ] },
  },
};

export const controsoffittiContent: TetEditorialContent = {
  title: "Il soffitto che nasconde.\nLuce, impianti, silenzio.",
  subtitle: "Controsoffitti e velette in cartongesso: cosa si abbassa, cosa si nasconde e dove va la luce, definiti prima.",
  eyebrow: "CONTROSOFFITTI E VELETTE",
  cover: "/pdf-stock/ristrutturazione/tecnica-casa-sezionata.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere.jpg", name: "Struttura del controsoffitto in montaggio" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Sapere perché si abbassa", "Nascondere impianti, creare punti luce, isolare o correggere un soffitto irregolare: la funzione decide la soluzione."],
    ["Non perdere troppa altezza", "Ogni controsoffitto ruba centimetri: si concorda quanto abbassare in base a impianti e faretti."],
    ["Prevedere luce e botole", "Faretti, strip led e accessi di ispezione vanno posizionati prima di chiudere le lastre."],
  ],
  solution: [
    ["Quota concordata", "L'abbassamento si decide sull'altezza reale della stanza e sugli impianti da nascondere."],
    ["Struttura per i carichi", "Orditura dimensionata per lastre, faretti e, dove serve, botole d'ispezione."],
    ["Luce predisposta prima", "Fori dei faretti, gole per le strip e alimentazioni previsti nella struttura, non tagliati dopo."],
  ],
  usp: [
    ["Impianti spariti", "Tubi, cavi e canaline dell'aria corrono sopra il controsoffitto, fuori vista."],
    ["Luce disegnata", "Faretti e velette luminose posizionati dove servono, non a caso."],
    ["Ispezione possibile", "Botole dove ci sono valvole o giunzioni da raggiungere in futuro."],
  ],
  journey: [
    ["01 · Progettare", "Funzione, quota di abbassamento e punti luce."],
    ["02 · Confermare", "Struttura, lastre, faretti e botole d'ispezione."],
    ["03 · Montare", "Orditura appesa, predisposizioni e chiusura con le lastre."],
    ["04 · Rifinire", "Stuccatura, carteggiatura e consegna pronta alla pittura."],
  ],
  guarantees: [
    ["Quota dichiarata", "L'altezza finale e l'abbassamento restano scritti nel computo."],
    ["Ispezioni previste", "Le botole d'accesso concordate restano indicate."],
    ["Giunti a regola d'arte", "La consegna prevista è la superficie pronta alla pittura."],
    ["Schede conservate", "Riferimenti di lastre e faretti restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Altezza, impianti da nascondere e punti luce voluti."],
    ["Preparazione", "Materiali e faretti confermati, protezioni e accessi."],
    ["Montaggio", "Orditura, predisposizioni luce e chiusura con le lastre."],
    ["Finitura", "Stuccatura dei giunti, carteggiatura e pulizia."],
  ],
  faq: [
    ["Quanti centimetri perdo di altezza?", "Dipende da cosa si nasconde: pochi centimetri per il solo estetico, di più con canaline dell'aria o faretti profondi. La quota si concorda sull'altezza reale."],
    ["Ci metto i faretti a incasso?", "Sì, è uno dei motivi del controsoffitto: fori e alimentazioni si predispongono prima di chiudere. Numero e posizione si decidono con te."],
    ["Serve una botola d'ispezione?", "Dove sopra ci sono valvole, giunzioni o macchine da raggiungere, sì. Le botole previste sono indicate: senza, quelle zone diventano inaccessibili."],
    ["Isola dal rumore di sopra?", "Con l'isolante sopra le lastre aiuta contro i rumori aerei; sui rumori di calpestio incide meno. La resa dipende dalla stratigrafia scelta."],
    ["Posso fare una veletta per le tende o le strip led?", "Sì, le velette perimetrali per luce indiretta o per nascondere il bastone tenda sono parte del lavoro, se previste nel computo."],
    ["Regge un lampadario pesante?", "Solo con il rinforzo nel punto giusto, predisposto prima. Il carico va indicato: la lastra da sola non tiene un corpo pesante."],
    ["La consegna è già dipinta?", "No: la superficie viene consegnata stuccata e carteggiata, pronta alla pittura. La tinteggiatura è una voce a parte."],
    ["Le foto mostrano il mio soffitto?", "No, sono illustrative. Il risultato dipende dalla quota, dalle luci e dalla stratigrafia concordate."],
  ],
  blocks: {
    comeFunziona: { title: "Abbassare per *nascondere e illuminare*.", intro: "Un controsoffitto serve a qualcosa: nascondere impianti, portare luce, isolare. La proposta dice cosa fa il tuo.", photo: "/pdf-stock/ristrutturazione/tecnica-casa-sezionata.jpg", items: [
      ["Quota", "Di quanto si abbassa, sull'altezza reale della stanza."],
      ["Struttura", "Orditura appesa dimensionata per lastre e carichi."],
      ["Luce", "Faretti, strip e velette predisposti prima della chiusura."],
      ["Ispezioni", "Botole dove servono accessi futuri."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo soffitto*.", intro: "Questa sintesi accompagna le voci. Quota e superficie confermate prevalgono sulle immagini.", items: [
      ["Struttura", "Orditura appesa e rinforzi nei punti di carico indicati."],
      ["Materiali", "Lastre e isolante della qualità concordata."],
      ["Predisposizioni", "Fori e alimentazioni per luci e botole previsti."],
      ["Finitura", "Stuccatura dei giunti e superficie pronta alla pittura."],
    ], excluded: [
      ["Corpi illuminanti", "Faretti, strip e lampadari sono voci a sé se non elencati; qui si predispone la sede."],
      ["Impianti a monte", "Il cablaggio elettrico e le canaline dell'aria si valutano a parte."],
    ] },
    protezione: { title: "Lavorare in alto. *Proteggere sotto*.", intro: "Le protezioni si scelgono sulla stanza reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli sotto l'area di lavoro."],
      ["Mobili", "Spostare o coprire ciò che sta sotto il soffitto."],
      ["Accessi", "Spazio per trabattelli e movimentazione delle lastre."],
      ["Polvere fine", "Contenere la polvere della carteggiatura dei giunti."],
    ] },
    controlli: { title: "Piano e saldo. *Luci al posto giusto*.", intro: "I riscontri riguardano il controsoffitto realizzato e le predisposizioni concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Planarità", "Verificare che il piano sia dritto e a livello."],
      ["Predisposizioni", "Controllare fori luce e botole nella posizione prevista."],
      ["Giunti", "Riscontrare stuccatura e assenza di crepe di ripresa."],
      ["Consegna", "Giro finale con te e pulizia."],
    ] },
    documenti: { title: "Il soffitto realizzato. *Cosa nasconde*.", intro: "La documentazione rende riconoscibili quota, ispezioni e predisposizioni, utili in futuro.", items: [
      ["Composizione", "Riepilogo di struttura e lastre."],
      ["Predisposizioni", "Posizione di fori luce, rinforzi e botole."],
      ["Ispezioni", "Dove si accede agli impianti sopra il controsoffitto."],
      ["Assistenza", "Indicazioni per interventi futuri e contatti."],
    ] },
    diario: { title: "Soffitto grezzo. *Poi luce e ordine*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Soffitto e impianti a vista da nascondere."],
      ["Durante", "Orditura, predisposizioni e chiusura."],
      ["Dopo", "Piano finito, pronto alla pittura e alle luci."],
    ] },
  },
};

export const decorativiContent: TetEditorialContent = {
  title: "La parete che si tocca.\nEffetti e materia.",
  subtitle: "Stucco veneziano, microcemento e resine a parete: preparazione del fondo e campioni prima di stendere.",
  eyebrow: "FINITURE DECORATIVE",
  cover: "/pdf-stock/pavimenti/materiali.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", name: "Preparazione del fondo, riferimento illustrativo" },
    { url: "/pdf-stock/comune/pulizia-consegna.jpg", name: "Pulizia finale a fine lavori" },
  ],
  needs: [
    ["Scegliere l'effetto giusto", "Stucco lucido, microcemento materico, resine spatolate: ognuno ha resa, manutenzione e ambiente adatto diversi."],
    ["Preparare un fondo perfetto", "Le finiture decorative sono sottili e non perdonano: il fondo va rasato e regolarizzato prima, o il difetto emerge."],
    ["Vedere un campione", "Colore ed effetto reali dipendono da mano, luce e strati: si conferma su un campione prima di stendere su tutta la parete."],
  ],
  solution: [
    ["Superfici indicate", "Ogni voce dice quali pareti e quanti metri quadri. Il resto resta come concordato."],
    ["Fondo regolarizzato", "Rasatura e primer specifici del ciclo scelto, così l'effetto viene uniforme."],
    ["Campione prima del lavoro", "Effetto, colore e finitura protettiva si approvano su campione, non a parete finita."],
  ],
  usp: [
    ["Effetto su misura", "Materia, lucido o cemento a seconda della stanza e del gusto, scelti su campione."],
    ["Fondo curato", "La resa dipende dalla preparazione: rasature e primer del ciclo sono elencati."],
    ["Protezione finale", "Cera o resina di protezione dove l'uso lo richiede (cucine, bagni, zone toccate)."],
  ],
  journey: [
    ["01 · Scegliere", "Effetto, colore e ambiente su campione."],
    ["02 · Preparare", "Rasatura e primer del ciclo sulle superfici indicate."],
    ["03 · Applicare", "Stesura degli strati e lavorazione dell'effetto."],
    ["04 · Proteggere", "Finitura protettiva dove prevista e consegna."],
  ],
  guarantees: [
    ["Ciclo dichiarato", "Preparazione, strati e protezione compresi sono scritti nel computo."],
    ["Campione approvato", "L'effetto confermato su campione è il riferimento della parete."],
    ["Superfici verificate", "I riscontri riguardano le pareti trattate."],
    ["Prodotti tracciati", "Riferimenti del ciclo restano a te, per manutenzione e ritocchi."],
  ],
  schedule: [
    ["Sopralluogo e campione", "Superfici, stato del fondo ed effetto approvato su campione."],
    ["Preparazione", "Rasatura, primer e protezioni del ciclo scelto."],
    ["Applicazione", "Strati e lavorazione dell'effetto, con i tempi tra le mani."],
    ["Protezione e consegna", "Finitura protettiva dove prevista e pulizia."],
  ],
  faq: [
    ["Che differenza c'è tra stucco veneziano e microcemento?", "Lo stucco veneziano è lucido e minerale, elegante e delicato; il microcemento è materico e resistente, adatto anche a bagni e zone d'uso. La scelta dipende dalla stanza e dal gusto."],
    ["Si può fare sopra le piastrelle o il vecchio muro?", "Spesso sì, con il fondo e il primer giusti: è uno dei vantaggi. La fattibilità si verifica sul supporto reale ed è la ragione della preparazione."],
    ["L'effetto sarà uguale al campione?", "Il campione è il riferimento approvato. Piccole variazioni sono nella natura di una finitura fatta a mano: per questo si conferma prima, non a parete finita."],
    ["Si può lavare?", "Con la protezione adatta sì, nelle zone previste. Senza protezione le finiture minerali temono l'acqua e le macchie: la protezione si sceglie in base all'uso."],
    ["Quanto dura la lavorazione?", "Più di una tinteggiatura: ci sono più strati e tempi di asciugatura tra le mani. Il calendario si concorda sul ciclo scelto."],
    ["Posso ritoccarlo se si segna?", "I ritocchi su finiture materiche si vedono più che sulla pittura. Conservare i riferimenti del ciclo aiuta; certe finiture si ravvivano meglio a tutta parete."],
    ["Va bene in un bagno con doccia?", "Il microcemento con protezione adatta sì, anche in doccia con il ciclo corretto. Lo stucco lucido tradizionale no nelle zone bagnate: si sceglie di conseguenza."],
    ["Le foto mostrano l'effetto che avrò?", "No, sono illustrative. Effetto e colore reali si vedono sul campione approvato per la tua parete."],
  ],
  blocks: {
    comeFunziona: { title: "Fondo perfetto, *effetto a mano*.", intro: "Le finiture decorative sono sottili: valgono quanto il fondo sotto e la mano che le stende.", photo: "/pdf-stock/pavimenti/materiali.jpg", items: [
      ["Superfici", "Quali pareti e quanti metri quadri."],
      ["Fondo", "Rasatura e primer specifici del ciclo scelto."],
      ["Effetto", "Tipo, colore e numero di strati, approvati su campione."],
      ["Protezione", "Cera o resina dove l'uso lo richiede."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Ciclo e metratura confermati prevalgono sulle immagini.", items: [
      ["Preparazione", "Protezioni, rasatura e primer del ciclo."],
      ["Materiali", "Prodotti del ciclo decorativo concordato."],
      ["Applicazione", "Strati e lavorazione dell'effetto sulle superfici indicate."],
      ["Protezione", "Finitura protettiva dove prevista e pulizia."],
    ], excluded: [
      ["Superfici non elencate", "Pareti e stanze fuori dal computo non sono comprese."],
      ["Risanamenti", "Umidità, muffa e crepe vanno risolti prima, come intervento a parte."],
    ] },
    protezione: { title: "Lavorare fine. *Proteggere tutto*.", intro: "Le protezioni si scelgono sulle superfici reali. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti e infissi", "Mascheratura accurata: gli spruzzi si vedono su un decorativo."],
      ["Bordi", "Nastrature precise per gli stacchi netti."],
      ["Mobili", "Spostare o coprire ciò che sta vicino."],
      ["Ambiente", "Pulizia e assenza di polvere durante la stesura."],
    ] },
    controlli: { title: "Effetto uniforme. *Come il campione*.", intro: "I riscontri riguardano le superfici trattate e l'effetto approvato.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Fondo", "Verificare la regolarità prima della stesura."],
      ["Effetto", "Confrontare la resa con il campione approvato."],
      ["Protezione", "Controllare la finitura protettiva dove prevista."],
      ["Consegna", "Giro finale con te e pulizia."],
    ] },
    documenti: { title: "Le superfici trattate. *Il ciclo usato*.", intro: "La documentazione rende riconoscibili ambito e prodotti, per manutenzione e ritocchi coerenti.", items: [
      ["Perimetro", "Riepilogo delle pareti trattate."],
      ["Ciclo e colore", "Prodotti, effetto e protezione usati."],
      ["Campione", "Riferimento approvato dell'effetto."],
      ["Assistenza", "Indicazioni per la cura e i ritocchi, e contatti."],
    ] },
    diario: { title: "Muro liscio. *Parete materica*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Fondo da preparare."],
      ["Durante", "Primer, strati e lavorazione dell'effetto."],
      ["Dopo", "Parete finita e protetta."],
    ] },
  },
};

export const umiditaMuffaContent: TetEditorialContent = {
  title: "Prima la causa.\nPoi la parete sana.",
  subtitle: "Umidità di risalita, condensa e muffa: si cerca l'origine, si risana il muro e si rifinisce, in quest'ordine.",
  eyebrow: "UMIDITÀ E MUFFA",
  cover: "/pdf-stock/ristrutturazione/controllo-planarita.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/controllo-elettrico.jpg", name: "Diagnosi del fondo, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Capire da dove viene", "Risalita dal terreno, infiltrazione, condensa da ponte termico o scarsa aerazione: la causa decide la soluzione."],
    ["Trattare, non coprire", "Ridipingere sopra la muffa la fa tornare: prima si risana il fondo e si affronta la causa."],
    ["Scegliere il ciclo giusto", "Intonaco deumidificante, barriera contro la risalita, pittura traspirante o antimuffa: dipende dal tipo di umidità."],
  ],
  solution: [
    ["Diagnosi prima del preventivo", "Si osserva dove e quando compare, si valuta l'origine e si distingue la risalita dalla condensa."],
    ["Ciclo adatto alla causa", "Rimozione dell'intonaco ammalorato, trattamento del fondo e ciclo traspirante o deumidificante indicato."],
    ["Aspettative oneste", "Si dice cosa risolve l'intervento e cosa dipende da abitudini d'uso o da opere fuori perimetro."],
  ],
  usp: [
    ["Si parte dalla causa", "Nessuna pittura miracolosa: prima l'origine, poi la parete."],
    ["Ciclo traspirante", "Materiali che lasciano respirare il muro, non che sigillano il problema dentro."],
    ["Confini chiari", "Cosa risolve l'intervento e cosa no, scritto prima di iniziare."],
  ],
  journey: [
    ["01 · Diagnosticare", "Origine dell'umidità, estensione e stato dell'intonaco."],
    ["02 · Confermare", "Ciclo di risanamento e finitura, con i limiti dichiarati."],
    ["03 · Risanare", "Rimozione dell'ammalorato, trattamento del fondo e nuovo intonaco."],
    ["04 · Rifinire", "Pittura traspirante e indicazioni per non far tornare il problema."],
  ],
  guarantees: [
    ["Causa dichiarata", "La proposta dice l'origine ipotizzata e cosa l'intervento affronta."],
    ["Ciclo scritto", "Trattamenti e materiali del risanamento restano nel computo."],
    ["Limiti onesti", "Ciò che dipende da cause esterne o dall'uso è indicato, non taciuto."],
    ["Prodotti tracciati", "Riferimenti dei prodotti restano a te, per la manutenzione."],
  ],
  schedule: [
    ["Sopralluogo e diagnosi", "Origine, estensione e umidità del fondo."],
    ["Preparazione", "Rimozione dell'intonaco ammalorato e protezioni."],
    ["Risanamento", "Trattamento del fondo e nuovo intonaco traspirante, con i tempi di maturazione."],
    ["Finitura", "Pittura adatta e giro di consegna con le indicazioni d'uso."],
  ],
  faq: [
    ["La muffa tornerà dopo la pittura?", "Se si copre e basta, sì. Torna quando la causa resta: per questo prima si affronta l'origine (risalita, infiltrazione, condensa) e poi si rifinisce con prodotti traspiranti."],
    ["Come capite da dove viene l'umidità?", "Da dove e quando compare, dall'altezza sulla parete e dallo stato dell'intonaco. La risalita parte dal basso, la condensa segue i ponti termici e gli angoli freddi."],
    ["Basta una pittura antimuffa?", "In casi lievi di condensa aiuta, insieme all'aerazione. Sulla risalita o su intonaci ammalorati no: serve rimuovere e risanare il fondo."],
    ["Quanto tempo prima di ridipingere?", "Gli intonaci di risanamento hanno tempi di maturazione da rispettare, altrimenti la finitura non tiene. Il calendario si concorda sul ciclo scelto."],
    ["Dovrò cambiare abitudini in casa?", "Sulla condensa spesso sì: aerare, non stendere il bucato dentro, non ostruire le pareti fredde. Sono cose che diciamo apertamente, perché incidono sul risultato."],
    ["Risolvete anche l'infiltrazione dall'esterno?", "La diagnosi la individua, ma la riparazione esterna (tetto, facciata, terrazzo) è un intervento a sé. Trattare solo l'interno senza fermare l'ingresso non dura."],
    ["Serve la barriera chimica contro la risalita?", "Dove c'è risalita capillare dal terreno può servire. Si valuta sul caso: è una lavorazione a sé, indicata nel computo se prevista."],
    ["Le foto mostrano il mio muro?", "No, sono illustrative. L'intervento reale dipende dalla diagnosi della tua parete."],
  ],
  blocks: {
    comeFunziona: { title: "Prima la causa. *Poi il muro*.", intro: "L'umidità non si dipinge sopra. La proposta parte dall'origine e la affronta prima della finitura.", photo: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", items: [
      ["Diagnosi", "Origine ipotizzata: risalita, infiltrazione o condensa."],
      ["Rimozione", "Intonaco e pittura ammalorati da togliere."],
      ["Risanamento", "Trattamento del fondo e nuovo intonaco adatto."],
      ["Finitura", "Pittura traspirante e indicazioni d'uso."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo risanamento*.", intro: "Questa sintesi accompagna le voci. Ciclo e superfici confermati prevalgono sulle immagini.", items: [
      ["Preparazione", "Rimozione dell'ammalorato e protezioni."],
      ["Trattamento", "Prodotti di risanamento del fondo previsti."],
      ["Intonaco e finitura", "Nuovo intonaco e pittura traspirante sulle superfici indicate."],
      ["Indicazioni", "Consigli d'uso per non far tornare il problema."],
    ], excluded: [
      ["Cause esterne", "Riparazioni di tetto, facciata, terrazzi o impianti idraulici sono interventi a sé."],
      ["Opere strutturali", "Barriere contro la risalita e drenaggi si valutano e quotano separatamente."],
    ] },
    protezione: { title: "Aprire il muro. *Contenere il resto*.", intro: "Le protezioni si scelgono sulla stanza reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli nelle zone di rimozione dell'intonaco."],
      ["Mobili", "Spostare ciò che tocca la parete interessata."],
      ["Polvere", "Contenere la polvere della rimozione."],
      ["Aerazione", "Garantire il ricambio d'aria durante la maturazione."],
    ] },
    controlli: { title: "Fondo asciutto. *Finitura che tiene*.", intro: "I riscontri riguardano le superfici trattate e la diagnosi concordata.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Fondo", "Verificare la rimozione dell'ammalorato e lo stato del supporto."],
      ["Trattamento", "Controllare l'applicazione del ciclo di risanamento."],
      ["Finitura", "Riscontrare la traspirabilità e l'uniformità della pittura."],
      ["Consegna", "Giro finale con te e indicazioni d'uso."],
    ] },
    documenti: { title: "Cosa è stato fatto. *E cosa dipende da te*.", intro: "La documentazione rende riconoscibili l'intervento, i limiti e le abitudini che aiutano a mantenerlo.", items: [
      ["Diagnosi", "Origine ipotizzata e superfici trattate."],
      ["Ciclo usato", "Prodotti di risanamento e finitura applicati."],
      ["Limiti", "Ciò che dipende da cause esterne o dall'uso."],
      ["Assistenza", "Indicazioni per aerazione e manutenzione, e contatti."],
    ] },
    diario: { title: "Muro segnato. *Parete sana*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Muffa e intonaco ammalorato da trattare."],
      ["Durante", "Rimozione, trattamento del fondo e nuovo intonaco."],
      ["Dopo", "Parete risanata e rifinita."],
    ] },
  },
};

export const acusticaContent: TetEditorialContent = {
  title: "Meno rumore.\nStanza per stanza.",
  subtitle: "Isolamento acustico di pareti e soffitti: prima si capisce che rumore è, poi si sceglie la stratigrafia.",
  eyebrow: "ISOLAMENTO ACUSTICO",
  cover: "/pdf-stock/ristrutturazione/tecnica-riscaldamento-pavimento.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/tecnica-casa-sezionata.jpg", name: "Stratigrafia fonoisolante, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Capire che rumore è", "Voci e TV del vicino (rumore aereo) o passi e trascinamenti dal piano di sopra (calpestio) si affrontano in modo diverso."],
    ["Trovare la via del suono", "Il rumore passa dalla parete più debole, dai giunti o dagli impianti: si individua il punto prima di intervenire."],
    ["Scegliere la stratigrafia", "Controparete fonoisolante, isolante nell'intercapedine, materiali smorzanti: la soluzione dipende dal rumore e dallo spazio."],
  ],
  solution: [
    ["Diagnosi del rumore", "Si distingue l'aereo dal calpestio e si individua la superficie o il giunto da cui passa."],
    ["Stratigrafia dedicata", "Controparete con struttura disaccoppiata, isolante e lastre adatte, dimensionata sul risultato voluto."],
    ["Aspettative misurate", "Si dice quanto ci si può attendere e cosa resta fuori portata senza opere più profonde."],
  ],
  usp: [
    ["Soluzione mirata", "Non un pannello qualsiasi: la stratigrafia si sceglie sul rumore reale."],
    ["Cura dei dettagli", "Giunti, prese e passaggi impianti trattati: sono le vie da cui il suono scappa."],
    ["Onestà sul risultato", "Attenuare non è azzerare: si dice cosa aspettarsi prima di iniziare."],
  ],
  journey: [
    ["01 · Ascoltare", "Tipo di rumore, sorgente e superficie interessata."],
    ["02 · Confermare", "Stratigrafia, spessore e risultato atteso."],
    ["03 · Montare", "Struttura disaccoppiata, isolante e lastre, con i giunti curati."],
    ["04 · Rifinire", "Stuccatura e consegna pronta alla pittura."],
  ],
  guarantees: [
    ["Stratigrafia dichiarata", "Materiali e composizione compresi sono scritti nel computo."],
    ["Dettagli curati", "Il trattamento di giunti e passaggi resta indicato."],
    ["Risultato onesto", "L'attenuazione attesa e i suoi limiti sono dichiarati, non promessi."],
    ["Schede conservate", "Riferimenti dei materiali fonoisolanti restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Tipo di rumore, sorgente e superfici coinvolte."],
    ["Preparazione", "Stratigrafia confermata, protezioni e accessi."],
    ["Montaggio", "Struttura disaccoppiata, isolante, lastre e cura dei giunti."],
    ["Finitura", "Stuccatura, carteggiatura e pulizia."],
  ],
  faq: [
    ["Sentirò ancora il vicino?", "L'isolamento attenua, non azzera. Su voci e TV una controparete ben fatta riduce molto; sui bassi e sul calpestio incide meno. Si dice prima quanto aspettarsi."],
    ["Perde molto spazio la stanza?", "Una controparete fonoisolante ruba alcuni centimetri, di più se si vuole più attenuazione. Lo spessore si concorda tra risultato voluto e spazio disponibile."],
    ["Basta un pannello attaccato al muro?", "Raramente: incollare un pannello rigido al muro fa poco. Conta la struttura disaccoppiata e la massa: per questo la stratigrafia si sceglie, non si improvvisa."],
    ["Il rumore dei passi di sopra si risolve dalla mia stanza?", "Il calpestio si combatte meglio sul pavimento di chi sta sopra. Da sotto, con un controsoffitto disaccoppiato si attenua in parte: il limite va detto chiaro."],
    ["Serve trattare anche prese e giunti?", "Sì: il suono scappa dai punti deboli. Prese passanti, giunti e passaggi impianti trattati sono ciò che fa la differenza tra un lavoro fatto e uno apparente."],
    ["Posso isolare solo una parete?", "Si può, se il rumore passa da lì. Ma se la via principale è un'altra superficie o un giunto, isolare la parete sbagliata rende poco: per questo prima si individua la via del suono."],
    ["L'isolante acustico isola anche dal freddo?", "In parte: molti materiali fanno entrambe le cose, ma non sono ottimizzati per tutte e due. Se servono entrambi si sceglie la stratigrafia di conseguenza."],
    ["Le foto mostrano il mio lavoro?", "No, sono illustrative. La stratigrafia reale dipende dal rumore e dallo spazio concordati."],
  ],
  blocks: {
    comeFunziona: { title: "Capire il suono. *Poi fermarlo*.", intro: "Ogni rumore ha la sua via. La proposta parte dal tipo di rumore e sceglie la stratigrafia adatta.", photo: "/pdf-stock/ristrutturazione/cantiere.jpg", items: [
      ["Tipo di rumore", "Aereo (voci, TV) o di calpestio (passi da sopra)."],
      ["Via del suono", "La superficie o il giunto da cui passa."],
      ["Stratigrafia", "Struttura disaccoppiata, isolante e lastre dimensionate."],
      ["Dettagli", "Prese, giunti e passaggi impianti trattati."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo isolamento*.", intro: "Questa sintesi accompagna le voci. Stratigrafia e superfici confermate prevalgono sulle immagini.", items: [
      ["Struttura", "Orditura disaccoppiata sulle superfici indicate."],
      ["Materiali", "Isolante fonoassorbente e lastre della composizione concordata."],
      ["Dettagli", "Trattamento di giunti e passaggi previsti."],
      ["Finitura", "Stuccatura e superficie pronta alla pittura."],
    ], excluded: [
      ["Superfici non elencate", "Pareti e soffitti fuori dal computo non sono compresi."],
      ["Interventi sulla sorgente", "Opere sul pavimento di chi sta sopra o sugli impianti rumorosi si valutano a parte."],
    ] },
    protezione: { title: "Aggiungere strati. *Proteggere la stanza*.", intro: "Le protezioni si scelgono sulla stanza reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Pavimenti", "Teli nelle zone di montaggio."],
      ["Mobili", "Spostare ciò che sta contro la parete interessata."],
      ["Impianti", "Individuare prese e passaggi da trattare."],
      ["Polvere fine", "Contenere la polvere della carteggiatura dei giunti."],
    ] },
    controlli: { title: "Strati continui. *Giunti sigillati*.", intro: "I riscontri riguardano la stratigrafia realizzata e i dettagli concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Struttura", "Verificare il disaccoppiamento e la continuità dell'isolante."],
      ["Dettagli", "Controllare il trattamento di prese e giunti."],
      ["Finitura", "Riscontrare stuccatura e planarità."],
      ["Consegna", "Giro finale con te e riscontro d'ascolto."],
    ] },
    documenti: { title: "Cosa è stato fatto. *Cosa aspettarsi*.", intro: "La documentazione rende riconoscibili la stratigrafia e il risultato atteso, senza promettere il silenzio assoluto.", items: [
      ["Composizione", "Riepilogo di struttura, isolante e lastre."],
      ["Dettagli", "Trattamento di giunti e passaggi eseguito."],
      ["Risultato atteso", "Attenuazione prevista e limiti dichiarati."],
      ["Assistenza", "Indicazioni per fissaggi futuri e contatti."],
    ] },
    diario: { title: "Parete sottile. *Stanza più quieta*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Superficie da cui passa il rumore."],
      ["Durante", "Struttura disaccoppiata, isolante e lastre."],
      ["Dopo", "Superficie finita, pronta alla pittura."],
    ] },
  },
};
