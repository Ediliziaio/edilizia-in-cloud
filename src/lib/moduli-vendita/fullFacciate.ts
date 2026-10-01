/**
 * Facciate sul motore Ristrutturazioni (Lotto 10, Ricetta B): i testi si ricopiano
 * da facEditorialContent.ts (che non si tocca) nel formato TetEditorialContent del
 * motore rst. Ogni costante è dati a sé (regola d'oro). Le norme non si affermano a
 * memoria: progetto energetico, pratiche e agevolazioni si rimandano al tecnico e
 * alle regole in vigore.
 *
 * PROVA: per ora solo `cappotto`, per verificare che il documento Ristrutturazioni
 * regga le pagine delle Facciate. Se regge, si portano gli altri 5 modelli esistenti
 * e si aggiungono i 3 nuovi (ventilata, pietra, pulizia).
 */
import type { TetEditorialContent } from "./fullTettiFactory";

export const facciataCappottoContent: TetEditorialContent = {
  title: "Il comfort parte\ndall'involucro.",
  subtitle: "Cappotto esterno: supporto, sistema isolante e raccordi definiti prima della posa.",
  eyebrow: "CAPPOTTO TERMICO",
  cover: "/module-art/facciate-cappotto-dettaglio.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate.jpg", name: "Facciata con cappotto, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Leggere l'esistente", "Individuare superfici, discontinuità e stato degli intonaci prima di scegliere il sistema."],
    ["Definire lo spessore", "Confrontare ingombri, aperture e obiettivi del progetto energetico."],
    ["Organizzare gli accessi", "Concordare ponteggi, percorsi e interferenze con chi utilizza l'edificio."],
  ],
  solution: [
    ["Sistema coordinato", "Isolante, collante, fissaggi, rasatura e finitura identificati nella specifica dell'offerta."],
    ["Nodi espliciti", "Zoccolatura, imbotti, davanzali e attacchi in quota descritti con i rispettivi limiti."],
    ["Quantità leggibili", "Superfici e accessori misurati con criteri dichiarati nel computo."],
  ],
  usp: [
    ["Sistema, non solo pannello", "Isolante, rasatura, rete e finitura si scelgono come un insieme, sul supporto reale."],
    ["Nodi risolti prima", "Zoccolatura, davanzali e imbotti sono i punti dove il cappotto tiene o cede: si definiscono in offerta."],
    ["Quantità dichiarate", "Superfici e accessori misurati con criteri espliciti, non a forfait."],
  ],
  journey: [
    ["01 · Rilievo", "Superfici, supporto e nodi da confermare."],
    ["02 · Sistema", "Materiale, spessore, dettagli e campione di finitura."],
    ["03 · Posa", "Preparazione dei fondi, strati e punti singolari secondo le specifiche."],
    ["04 · Finitura", "Maturazione, verifiche e consegna delle informazioni disponibili."],
  ],
  guarantees: [
    ["Sistema documentato", "Isolante, rasante, rete e finitura seguono le schede del sistema effettivamente fornito."],
    ["Nodi verificati", "Zoccolatura, raccordi e bordi delle aperture sono realizzati secondo le specifiche del sistema."],
    ["Perimetro scritto", "Superfici, accessori e opere comprese ed escluse sono distinti nel computo."],
    ["Nessuna promessa energetica", "Risparmi e salti di classe non sono garantiti: dipendono da edificio, impianti e uso, e li valuta un tecnico."],
  ],
  faq: [
    ["Quale isolante e quale spessore sono previsti?", "Vanno definiti nella specifica tecnica dopo le verifiche sul fabbricato. Questo modello non seleziona automaticamente un materiale o uno spessore."],
    ["Il cappotto garantisce un risparmio in bolletta?", "Il risultato dipende dall'edificio, dagli impianti e dall'uso. Non sono promesse percentuali di risparmio né salti di classe energetica."],
    ["Davanzali e imbotti sono compresi?", "Solo i raccordi descritti e misurati. Prolungamenti o sostituzioni richiedono una voce dedicata."],
    ["Il ponteggio è incluso?", "L'offerta deve precisare tipo di accesso, durata e oneri. La voce dimostrativa non copre qualsiasi ponteggio o occupazione."],
    ["Si può posare su un intonaco ammalorato?", "L'idoneità del supporto va verificata. Le rimozioni e i ripristini necessari si definiscono prima dell'esecuzione."],
    ["Chi prepara il progetto energetico?", "L'incarico e il professionista vanno concordati separatamente se non esplicitamente compresi nel preventivo."],
    ["Quanto dura il cantiere?", "Il calendario dipende da quantità, disponibilità degli accessi, meteo e tempi del ciclo. Le date vengono concordate prima dell'avvio."],
    ["Sono previste agevolazioni o garanzie particolari?", "Nessuna agevolazione è calcolata in automatico. Eventuali garanzie aggiuntive devono essere documentate con condizioni e soggetto responsabile."],
  ],
  schedule: [
    ["Rilievo", "Superfici, supporto e nodi da confermare."],
    ["Scelta del sistema", "Materiale, spessore, dettagli e campione di finitura."],
    ["Preparazione e posa", "Accessi, protezioni, ripristino dei fondi, strati e punti singolari."],
    ["Finitura e riscontro", "Tempi di maturazione, verifiche e consegna delle informazioni."],
  ],
  blocks: {
    comeFunziona: { title: "Un sistema. *Non solo un pannello*.", intro: "Il cappotto è un ciclo coordinato: supporto, isolante, fissaggi, rasatura armata e finitura. La foto è illustrativa.", photo: "/module-art/facciate.jpg", items: [
      ["Supporto e preparazione", "Verificare consistenza e adesione del fondo; quantificare pulizie e ripristini prima della posa."],
      ["Isolante e fissaggio", "Indicare materiale, spessore e sistema di posa. Tipologia e quantità dei fissaggi dipendono da supporto e progetto."],
      ["Rasatura armata", "Definire rasante, rete, sovrapposizioni e rinforzi ai bordi delle aperture secondo il sistema scelto."],
      ["Raccordi e finitura", "Specificare profili, gocciolatoi, zoccolatura, tessitura e colore; risolvere i davanzali prima dell'ordine."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Superfici e sistema confermati prevalgono sulle immagini.", items: [
      ["Superfici individuate", "Isolamento dei soli prospetti e delle porzioni misurate nel computo."],
      ["Ciclo descritto", "Preparazioni, strati e finiture nella configurazione confermata."],
      ["Accessori elencati", "Profili e raccordi solo nelle quantità e nelle tipologie riportate."],
    ], excluded: [
      ["Incarichi tecnici", "Progetto energetico, pratiche e verifiche specialistiche non comprese se prive di voce dedicata."],
      ["Opere estranee", "Serramenti, coperture, impianti e modifiche strutturali esclusi."],
      ["Accessi ulteriori", "Occupazioni, noleggi prolungati e opere provvisionali diverse dalla voce di esempio da quotare separatamente."],
    ] },
    protezione: { title: "Lavorare in quota. *Proteggere l'edificio*.", intro: "Accessi e protezioni si definiscono nel piano di cantiere e si valorizzano nelle voci. La foto è un esempio.", items: [
      ["Ponteggi e percorsi", "Accessi e protezioni da definire nel piano di cantiere e valorizzare nelle voci dell'offerta."],
      ["Parti conservate", "Individuare serramenti, pavimentazioni e impianti da proteggere."],
      ["Condizioni ambientali", "Pianificare la posa in funzione dei limiti applicativi dei prodotti e del meteo."],
    ] },
    controlli: { title: "Prima della finitura. *I riscontri che contano*.", intro: "I controlli riguardano il ciclo previsto e le parti accessibili.", items: [
      ["Fondo", "Riscontri sulla preparazione delle superfici accessibili prima della posa."],
      ["Strati e nodi", "Verifiche previste su continuità, fissaggi e raccordi prima della finitura."],
      ["Finitura", "Controllo visivo con campione concordato e annotazione delle riserve."],
    ] },
    documenti: { title: "Il sistema posato. *Le informazioni da tenere*.", intro: "La documentazione è riferita ai prodotti e alle opere effettivamente forniti.", items: [
      ["Materiali", "Schede del sistema e dei prodotti effettivamente forniti, secondo disponibilità."],
      ["Dettagli", "Elenco delle scelte approvate e delle eventuali varianti."],
      ["Uso e manutenzione", "Indicazioni pertinenti alla finitura installata; attestazioni solo se dovute e incluse nell'incarico."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Superfici, supporto e nodi rilevati prima dell'intervento."],
      ["Durante", "Preparazione, strati e raccordi prima della finitura."],
      ["Dopo", "La facciata finita, con la tessitura e il colore concordati."],
    ] },
  },
};

export const facciataRifacimentoContent: TetEditorialContent = {
  title: "Una nuova superficie.\nLa facciata ritrova ordine.",
  subtitle: "Ripristino di intonaci e finiture esterne, senza sistema a cappotto.",
  eyebrow: "RIFACIMENTO FACCIATA",
  cover: "/module-art/facciate.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate-cappotto-dettaglio.jpg", name: "Ripristino dell'intonaco, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Mappare il degrado", "Distinguere le parti distaccate da quelle conservabili sui prospetti accessibili."],
    ["Scegliere un ciclo compatibile", "Leggere il supporto e le finiture esistenti prima di definire i prodotti."],
    ["Gestire il risultato estetico", "Concordare campioni, raccordi e limiti di uniformità rispetto alle porzioni mantenute."],
  ],
  solution: [
    ["Rimozioni misurate", "Quantità e profondità dei ripristini riferite alle zone individuate."],
    ["Supporti preparati", "Ricostruzione e regolarizzazione nei soli ambiti del computo."],
    ["Finitura condivisa", "Ciclo, grana e colore scelti dopo i riscontri sul fondo."],
  ],
  usp: [
    ["Perimetro misurato", "Rimozioni e ripristini riferiti alle zone individuate, non all'intero edificio a forfait."],
    ["Ciclo compatibile", "Fondo, malta e finitura scelti sul supporto reale, dopo i riscontri."],
    ["Nessuna uniformità promessa", "I raccordi con le parti conservate possono restare visibili: lo diciamo prima."],
  ],
  journey: [
    ["01 · Mappatura", "Porzioni da mantenere o rimuovere."],
    ["02 · Preparazioni", "Protezioni, accessi e rimozioni previste."],
    ["03 · Ripristini", "Ricostruzione delle zone concordate e attesa del ciclo."],
    ["04 · Finiture", "Regolarizzazione, fondo e colore approvato."],
  ],
  guarantees: [
    ["Ciclo documentato", "Prodotti e schede del ciclo effettivamente fornito restano a te."],
    ["Quantità concordate", "Superfici e ripristini misurati con criteri dichiarati nel computo."],
    ["Raccordi dichiarati", "I limiti di uniformità con le parti conservate sono detti prima, non scoperti dopo."],
    ["Cause a parte", "Il ripristino superficiale non cura infiltrazioni o movimenti: quelli richiedono valutazioni dedicate."],
  ],
  faq: [
    ["Questo intervento comprende il cappotto?", "No. Il perimetro riguarda intonaci e finiture; l'isolamento richiede una proposta dedicata."],
    ["Va rimosso tutto l'intonaco?", "Lo decide la verifica delle superfici. Il computo distingue rimozioni locali e superfici di finitura."],
    ["Le crepe scompaiono definitivamente?", "Il ripristino della superficie non dimostra la risoluzione della causa. Fessure attive o sospette richiedono valutazioni dedicate."],
    ["Come si misura la facciata?", "Il criterio per vuoti, spallette e cornici deve essere dichiarato nel computo e verificato con il rilievo."],
    ["Il nuovo colore sarà identico a quello vecchio?", "Non è garantita una corrispondenza perfetta. Esposizione, materiali e invecchiamento possono rendere visibili i raccordi."],
    ["Sono comprese le lattonerie?", "Solo se riportate in una voce specifica con elementi e quantità. La finitura non comporta automaticamente la loro sostituzione."],
    ["Quando si può applicare la finitura?", "Dopo le verifiche e i tempi previsti dal ciclo scelto, tenendo conto delle condizioni ambientali."],
    ["Il prezzo cambia se emergono altre parti distaccate?", "Le quantità ulteriori vanno documentate e concordate prima di estendere le lavorazioni; non si presume una copertura illimitata."],
  ],
  schedule: [
    ["Mappatura", "Porzioni da mantenere o rimuovere."],
    ["Preparazioni", "Protezioni, accessi e rimozioni previste."],
    ["Ripristini", "Ricostruzione delle zone concordate e attesa del ciclo."],
    ["Finiture e consegna", "Regolarizzazione, colore approvato e riscontro dei prospetti."],
  ],
  blocks: {
    comeFunziona: { title: "Rimuovere il degrado. *Ricostruire il fondo*.", intro: "Il rifacimento lavora sugli intonaci ammalorati e sulla finitura, non sull'isolamento. La foto è illustrativa.", photo: "/module-art/facciate-cappotto-dettaglio.jpg", items: [
      ["Indagine delle superfici", "Mappare le zone accessibili e precisare quali indagini ulteriori restano da eseguire."],
      ["Rimozione e ricostruzione", "Indicare spessore di rimozione, malta compatibile e criterio di misurazione dei rappezzi."],
      ["Regolarizzazione", "Descrivere la rasatura prevista e gli eventuali rinforzi locali, senza presumere un trattamento strutturale."],
      ["Finitura esterna", "Identificare fondo, rivestimento o pittura e campione approvato; rispettare i tempi del ciclo."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Quantità e ciclo confermati prevalgono sulle immagini.", items: [
      ["Intonaci indicati", "Rimozioni e ripristini limitati alle quantità espresse."],
      ["Fondi e finitura", "Preparazione e ciclo superficiale descritti per i prospetti scelti."],
      ["Raccordi locali", "Riprese presso gli elementi conservati nei limiti dell'offerta."],
    ], excluded: [
      ["Isolamento", "Cappotto e altre coibentazioni non fanno parte di questo intervento."],
      ["Strutture e infiltrazioni", "Consolidamenti e soluzione delle cause di infiltrazione non sono presunti nel ripristino superficiale."],
      ["Elementi accessori", "Sostituzione di lattonerie, serramenti e impianti da quotare se necessaria."],
    ] },
    protezione: { title: "Lavorare in quota. *Proteggere sotto*.", intro: "Accessi e protezioni si definiscono nel piano di cantiere. La foto è un esempio.", items: [
      ["Zone sottostanti", "Delimitare aree e percorsi interessati dalle lavorazioni in quota."],
      ["Elementi mantenuti", "Proteggere serramenti, soglie e pavimenti individuati."],
      ["Residui", "Definire raccolta e gestione dei materiali rimossi nelle relative voci."],
    ] },
    controlli: { title: "Prima della finitura. *I riscontri che contano*.", intro: "I controlli riguardano il ciclo previsto e le parti accessibili.", items: [
      ["Adesione del fondo", "Riscontro delle aree preparate prima dei ripristini."],
      ["Raccordi", "Controllo dei passaggi fra intonaco nuovo e conservato."],
      ["Aspetto finale", "Confronto della finitura con il campione approvato nelle condizioni concordate."],
    ] },
    documenti: { title: "Il ciclo eseguito. *Le informazioni da tenere*.", intro: "La documentazione è riferita ai prodotti e alle opere effettivamente forniti.", items: [
      ["Ciclo scelto", "Elenco dei prodotti e schede disponibili."],
      ["Quantità finali", "Riepilogo delle superfici effettivamente concordate e delle varianti."],
      ["Manutenzione", "Indicazioni per osservare e mantenere le finiture eseguite."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Le porzioni ammalorate e i distacchi rilevati."],
      ["Durante", "Rimozioni, ricostruzioni e preparazione dei fondi."],
      ["Dopo", "I prospetti rifiniti, con il colore concordato."],
    ] },
  },
};

export const facciataBalconiContent: TetEditorialContent = {
  title: "Balconi e frontalini.\nOgni dettaglio ha un perimetro.",
  subtitle: "Ripristini localizzati di elementi esterni, con accessi e verifiche da definire.",
  eyebrow: "BALCONI E FRONTALINI",
  cover: "/module-art/facciate-balconi-dettaglio.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate.jpg", name: "Balconi in ripristino, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Identificare gli elementi", "Numerare balconi, frontalini e intradossi interessati senza estendere l'offerta all'intero edificio."],
    ["Valutare il degrado", "Distinguere finiture degradate da condizioni che richiedono un approfondimento tecnico."],
    ["Coordinare gli accessi", "Concordare l'uso delle zone sottostanti e dei balconi durante i lavori."],
  ],
  solution: [
    ["Mappa delle porzioni", "Elementi e superfici collegati a un elenco verificabile."],
    ["Ciclo di ripristino", "Preparazione e materiali scelti in funzione delle condizioni rilevate."],
    ["Dettagli separati", "Gocciolatoi, pavimentazioni, impermeabilizzazioni e parapetti trattati come ambiti distinti."],
  ],
  usp: [
    ["Elementi numerati", "Ogni balcone e frontalino è associato a un elenco verificabile, non a un forfait."],
    ["Ambiti distinti", "Gocciolatoi, pavimenti, impermeabilizzazioni e parapetti restano voci separate."],
    ["Niente sicurezza presunta", "Il ripristino non certifica la portata del balcone: è un intervento di finitura."],
  ],
  journey: [
    ["01 · Rilievo", "Numerazione e valutazioni preliminari del degrado."],
    ["02 · Accessi", "Disponibilità dei balconi e delle zone sottostanti."],
    ["03 · Ripristino", "Rimozioni, ricostruzioni e raccordi concordati."],
    ["04 · Finitura", "Riscontro delle porzioni eseguite e chiusura delle riserve."],
  ],
  guarantees: [
    ["Elenco verificabile", "Le lavorazioni sono riferite a elementi numerati e quantità dichiarate."],
    ["Materiali documentati", "Schede dei prodotti e indicazioni di manutenzione restano a te."],
    ["Limiti scritti", "Strutture, tenuta e parapetti esclusi sono indicati chiaramente."],
    ["Varianti concordate", "Un degrado più esteso si documenta e si quota prima di procedere."],
  ],
  faq: [
    ["Il ripristino certifica la sicurezza del balcone?", "No. Questo modello non sostituisce una valutazione strutturale né certifica la portata dell'elemento."],
    ["Sono comprese le armature?", "L'eventuale trattamento dei ferri scoperti deve essere descritto dopo la valutazione tecnica; sostituzioni e rinforzi non sono presunti."],
    ["Si risolvono anche le infiltrazioni?", "Solo le lavorazioni specificamente progettate e incluse per la causa individuata possono riguardare la tenuta. Il frontalino da solo non la garantisce."],
    ["La pavimentazione verrà rifatta?", "Non in questo esempio. Demolizione, impermeabilizzazione e nuova pavimentazione richiedono voci separate."],
    ["Si può usare il balcone durante i lavori?", "Limitazioni e tempi di accesso vanno concordati in funzione delle lavorazioni e delle protezioni previste."],
    ["I parapetti sono inclusi?", "No, salvo voce specifica. La protezione del parapetto esistente non equivale alla sua riparazione o sostituzione."],
    ["Come sono conteggiati frontalini e intradossi?", "Con unità di misura dichiarate e riferimenti agli elementi: metri lineari o metri quadrati secondo la voce."],
    ["Cosa succede se il degrado è più esteso?", "Si documenta la condizione e si concordano approfondimenti, quantità e varianti prima di estendere l'intervento."],
  ],
  schedule: [
    ["Rilievo degli elementi", "Numerazione e valutazioni preliminari del degrado."],
    ["Accessi e delimitazioni", "Disponibilità dei balconi e delle zone sottostanti."],
    ["Ripristino", "Rimozioni, ricostruzioni e raccordi concordati, con i tempi del ciclo."],
    ["Finitura e consegna", "Riscontro delle porzioni eseguite e chiusura delle riserve."],
  ],
  blocks: {
    comeFunziona: { title: "Elemento per elemento. *Con un perimetro*.", intro: "Frontalini, intradossi e bordi si ripristinano su un elenco numerato, non a forfait. La foto è illustrativa.", photo: "/module-art/facciate-balconi-dettaglio.jpg", items: [
      ["Porzioni e profondità", "Identificare frontalini e intradossi, misure e limiti delle rimozioni previste."],
      ["Ferri eventualmente scoperti", "Trattamenti solo previa valutazione delle condizioni e specifica del tecnico; non equivalgono a un consolidamento."],
      ["Ricostruzioni", "Definire malta, spessori, preparazione e tempi applicativi compatibili con il supporto."],
      ["Bordi e finiture", "Specificare profili, gocciolatoi e ciclo protettivo; raccordi con gli strati superiori solo se inclusi."],
    ] },
    compreso: { title: "Il prezzo riguarda *questi elementi*.", intro: "Questa sintesi accompagna le voci. Elenco e quantità confermati prevalgono sulle immagini.", items: [
      ["Elementi numerati", "Ripristino delle porzioni individuate nell'elenco e nel computo."],
      ["Ciclo previsto", "Preparazione, ricostruzione e finitura nelle profondità concordate."],
      ["Bordi descritti", "Gocciolatoi e profili solo nelle quantità espresse."],
    ], excluded: [
      ["Interventi strutturali", "Verifiche di portata, consolidamenti e sostituzione delle armature esclusi da questo esempio."],
      ["Tenuta superiore", "Impermeabilizzazione e pavimentazione del balcone escluse se non descritte."],
      ["Parapetti", "Adeguamento, sostituzione e verniciatura dei parapetti da quotare separatamente."],
    ] },
    protezione: { title: "Lavorare sopra i passaggi. *In sicurezza*.", intro: "Delimitazioni e limitazioni d'uso si definiscono prima. La foto è un esempio.", items: [
      ["Aree inferiori", "Delimitazioni da definire prima di lavorare sopra passaggi o spazi utilizzati."],
      ["Utilizzo dei balconi", "Comunicare limitazioni temporanee e spostamento degli oggetti presenti."],
      ["Parti conservate", "Individuare parapetti, pavimenti e serramenti da proteggere."],
    ] },
    controlli: { title: "Il supporto scoperto. *I bordi rifatti*.", intro: "I controlli riguardano gli elementi trattati e le condizioni riscontrate.", items: [
      ["Supporto scoperto", "Registrare eventuali condizioni diverse da quelle previste prima di proseguire."],
      ["Geometria dei bordi", "Riscontro delle ricostruzioni e dei gocciolatoi inclusi."],
      ["Finitura", "Controllo delle superfici trattate e dei raccordi concordati."],
    ] },
    documenti: { title: "Gli elementi trattati. *Le informazioni da tenere*.", intro: "La documentazione elenca gli elementi effettivamente ripristinati.", items: [
      ["Mappa elementi", "Elenco dei balconi e delle porzioni effettivamente trattate."],
      ["Materiali", "Schede dei prodotti e indicazioni di manutenzione disponibili."],
      ["Riserve", "Annotazioni dei problemi esclusi e delle eventuali verifiche da completare."],
    ] },
    diario: { title: "I balconi, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Gli elementi degradati e le porzioni numerate."],
      ["Durante", "Rimozioni, ferri eventualmente scoperti e ricostruzioni."],
      ["Dopo", "I frontalini e gli intradossi rifiniti."],
    ] },
  },
};

export const facciataTinteggiaturaContent: TetEditorialContent = {
  title: "Il colore dell'edificio.\nUna scelta da condividere.",
  subtitle: "Preparazione e tinteggiatura delle superfici esterne su supporti idonei.",
  eyebrow: "TINTEGGIATURA FACCIATE",
  cover: "/module-art/facciate-tinteggiatura-dettaglio.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate.jpg", name: "Facciata tinteggiata, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Controllare il fondo", "Distinguere sporco e sfarinamento dai difetti che richiedono ripristini ulteriori."],
    ["Definire il colore", "Confrontare campioni sul posto, grana e accostamenti con le parti conservate."],
    ["Proteggere l'esistente", "Individuare serramenti, soglie e percorsi interessati dalle lavorazioni."],
  ],
  solution: [
    ["Preparazione mirata", "Pulizia e piccoli ripristini solo nell'estensione indicata."],
    ["Ciclo identificato", "Fondo e pittura scelti in funzione del supporto e dell'esposizione."],
    ["Campione approvato", "Colore e aspetto concordati prima dell'applicazione estesa."],
  ],
  usp: [
    ["Campione prima", "Colore, grana e aspetto approvati su un campione fisico, non solo a video."],
    ["Ciclo sul supporto", "Fondo e pittura scelti per supporto ed esposizione reali."],
    ["Solo finitura", "Distacchi e cause di umidità restano fuori: la pittura non li risolve."],
  ],
  journey: [
    ["01 · Valutazione", "Fondo, estensione e accessibilità delle superfici."],
    ["02 · Campionatura", "Scelta e approvazione del colore."],
    ["03 · Preparazione", "Protezioni, pulizia e riprese comprese."],
    ["04 · Applicazione", "Fondo e pittura con le attese del ciclo e condizioni adatte."],
  ],
  guarantees: [
    ["Colore documentato", "Campione approvato e codice del prodotto restano a te."],
    ["Ciclo dichiarato", "Mani, fondo e pittura sono indicati prima della conferma."],
    ["Perimetro chiaro", "Superfici comprese e opere escluse distinte nel computo."],
    ["Nessuna uniformità eterna", "Esposizione e invecchiamento incidono: non si promette una facciata sempre uniforme."],
  ],
  faq: [
    ["La tinteggiatura comprende il rifacimento degli intonaci?", "No. Comprende soltanto le preparazioni e le riprese descritte; distacchi estesi richiedono un intervento distinto."],
    ["Quante mani sono previste?", "Il numero e il tipo di applicazioni devono essere indicati nella specifica del ciclo scelto, prima della conferma."],
    ["Posso scegliere qualsiasi colore?", "La scelta va valutata con supporto, prodotto e contesto dell'edificio. Eventuali autorizzazioni o accordi condominiali sono da verificare."],
    ["Il campione a video è sufficiente?", "No. La resa dipende da luce, supporto e tessitura; è opportuno confermare un campione fisico sul posto."],
    ["La pittura elimina muffe e umidità?", "Non viene promessa la soluzione delle cause. I fenomeni di umidità richiedono una valutazione prima della finitura."],
    ["La facciata resterà sempre uniforme?", "Esposizione, manutenzione e materiali influenzano l'invecchiamento. Non è promessa un'uniformità permanente."],
    ["Si lavora anche con pioggia o forte sole?", "Il programma va adattato alle condizioni ammesse dai prodotti; il calendario non è indipendente dal meteo."],
    ["Sono inclusi infissi e ringhiere?", "Solo se espressamente descritti in voci dedicate. Il loro mascheramento serve a conservarli, non a verniciarli."],
  ],
  schedule: [
    ["Valutazione", "Fondo, estensione e accessibilità delle superfici."],
    ["Campionatura", "Scelta e approvazione del colore."],
    ["Preparazione e applicazione", "Protezioni, pulizia, riprese, fondo e pittura."],
    ["Riscontro e consegna", "Controllo delle superfici e pulizia finale prevista."],
  ],
  blocks: {
    comeFunziona: { title: "Il fondo prima. *Poi il colore*.", intro: "Una buona tinteggiatura parte dal supporto e da un campione approvato. La foto è illustrativa.", photo: "/module-art/facciate.jpg", items: [
      ["Pulizia del supporto", "Definire modalità e limiti della pulizia dopo la lettura del fondo; non presumere trattamenti risananti."],
      ["Piccole riprese", "Quantificare stuccature e ripristini superficiali separatamente dalla pittura."],
      ["Fondo e pittura", "Indicare prodotti, mani e modalità applicative secondo il ciclo selezionato."],
      ["Campione e raccordi", "Individuare codice colore, grana e superfici campione; considerare le differenze con le porzioni non trattate."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Superfici e ciclo confermati prevalgono sulle immagini.", items: [
      ["Superfici indicate", "Tinteggiatura dei prospetti o delle porzioni presenti nel computo."],
      ["Preparazione descritta", "Pulizia, fondo e riprese limitate alle rispettive voci."],
      ["Ciclo colore", "Applicazione della finitura confermata sul campione."],
    ], excluded: [
      ["Intonaci estesi", "Rifacimento degli intonaci e distacchi diffusi non compresi nella semplice tinteggiatura."],
      ["Cause di umidità", "Eliminazione di infiltrazioni, risalita o altre cause di degrado esclusa."],
      ["Altri materiali", "Verniciatura di metalli, legno e serramenti da valutare separatamente."],
    ] },
    protezione: { title: "Mascherare. *Poi dipingere*.", intro: "Superfici delicate e percorsi si proteggono prima. La foto è un esempio.", items: [
      ["Mascherature", "Definire superfici delicate, vetri e profili da proteggere."],
      ["Aree esterne", "Organizzare percorsi e aree di lavoro secondo l'accesso scelto."],
      ["Meteo", "Calendario da adeguare ai limiti di applicazione e asciugatura dei prodotti."],
    ] },
    controlli: { title: "Fondo idoneo. *Colore approvato*.", intro: "I controlli riguardano il ciclo previsto e le superfici concordate.", items: [
      ["Fondo preparato", "Valutare l'idoneità delle superfici prima del ciclo."],
      ["Campione", "Riscontro della scelta colore approvata."],
      ["Aspetto", "Verifica visiva di copertura e raccordi nelle condizioni concordate."],
    ] },
    documenti: { title: "Il colore posato. *Le informazioni da tenere*.", intro: "La documentazione rende ripetibile il colore e il ciclo scelti.", items: [
      ["Colore", "Riferimento del campione e codice del prodotto scelto."],
      ["Ciclo", "Elenco dei materiali impiegati e schede disponibili."],
      ["Cura delle superfici", "Indicazioni di pulizia e manutenzione pertinenti alla finitura."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Il fondo sporco o sfarinato e le porzioni da riprendere."],
      ["Durante", "Mascherature, pulizia, fondo e prime mani."],
      ["Dopo", "I prospetti col colore approvato."],
    ] },
  },
};

export const facciataInternoContent: TetEditorialContent = {
  title: "Il comfort,\ndal lato interno.",
  subtitle: "Isolamento delle pareti interne: spessori, umidità e raccordi da valutare insieme.",
  eyebrow: "ISOLAMENTO INTERNO",
  cover: "/module-art/facciate-interno-dettaglio.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate.jpg", name: "Isolamento dall'interno, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Capire la parete", "Valutare stratigrafia, stato e condizioni di umidità prima di chiudere la superficie."],
    ["Misurare gli ingombri", "Considerare la riduzione dello spazio e le interferenze con arredi, prese e radiatori."],
    ["Trattare i raccordi", "Definire le connessioni con solai, pareti adiacenti e aperture."],
  ],
  solution: [
    ["Sistema specificato", "Materiali e spessori scelti dopo le verifiche pertinenti al caso."],
    ["Nodi disegnati", "Raccordi e attraversamenti indicati nel progetto dell'intervento."],
    ["Finiture delimitate", "Estensione delle riprese di battiscopa, pittura e impianti esplicitata nel computo."],
  ],
  usp: [
    ["Verifiche prima", "Umidità e compatibilità del sistema si valutano prima di chiudere la parete."],
    ["Nodi disegnati", "Imbotti, attacchi e attraversamenti sono definiti nel progetto, non improvvisati."],
    ["Nessun valore promesso", "Prestazioni acustiche o energetiche non si dichiarano qui: derivano dal progetto."],
  ],
  journey: [
    ["01 · Rilievo", "Superfici, umidità, aperture e interferenze."],
    ["02 · Definizione", "Scelta della stratigrafia e dei raccordi pertinenti."],
    ["03 · Posa", "Sistema e nodi nelle configurazioni confermate."],
    ["04 · Finitura", "Riprese incluse, riscontro e indicazioni di gestione."],
  ],
  guarantees: [
    ["Sistema documentato", "Materiali e stratigrafia effettivamente concordati restano a te."],
    ["Nodi verificati", "Raccordi e attraversamenti sono controllati prima della chiusura."],
    ["Perimetro scritto", "Superfici, riprese e opere escluse sono distinte nel computo."],
    ["Nessuna prestazione presunta", "Acustica, classe e risparmi dipendono dal progetto e dalle verifiche, non da questo esempio."],
  ],
  faq: [
    ["L'isolamento interno elimina automaticamente la condensa?", "No. La soluzione va valutata rispetto alla parete e all'uso del locale; non si promette la scomparsa di condensa o muffa."],
    ["Quanto spazio si perde nella stanza?", "Dipende dallo spessore complessivo del sistema e dai raccordi. Gli ingombri vanno riportati nella proposta tecnica."],
    ["Serve sempre una barriera al vapore?", "Non è una scelta automatica. L'eventuale strato di controllo del vapore dipende dalla valutazione del sistema e delle condizioni reali."],
    ["Prese e radiatori vengono spostati?", "Solo se le modifiche sono descritte e quotate. Le interferenze devono essere risolte prima della posa."],
    ["Si isolano anche soffitto e pavimento?", "Soltanto le superfici e i risvolti esplicitamente compresi; non si estende automaticamente l'intervento a tutto il locale."],
    ["Si può abitare la stanza durante i lavori?", "Disponibilità del locale e limitazioni temporanee vanno concordate in funzione delle fasi e dei prodotti utilizzati."],
    ["La pittura finale è compresa?", "Nell'esempio sono previste le superfici trattate. Pareti adiacenti e intero ambiente richiedono quantità specifiche."],
    ["È garantito un miglioramento acustico o energetico?", "Questo modello non dichiara valori prestazionali. Eventuali obiettivi devono derivare dal progetto e dalle verifiche pertinenti."],
  ],
  schedule: [
    ["Rilievo interno", "Superfici, umidità, aperture e interferenze."],
    ["Definizione tecnica", "Scelta della stratigrafia e dei raccordi pertinenti."],
    ["Preparazione e posa", "Disponibilità del locale, protezioni, fondi, sistema e nodi."],
    ["Finitura e uso", "Riprese incluse, riscontro e indicazioni di gestione dell'ambiente."],
  ],
  blocks: {
    comeFunziona: { title: "Prima le verifiche. *Poi il sistema*.", intro: "L'isolamento dall'interno si progetta su umidità, ingombri e nodi. La foto è illustrativa.", photo: "/module-art/facciate.jpg", items: [
      ["Verifiche preliminari", "Valutare condizioni termoigrometriche e compatibilità del sistema prima della scelta; incarichi tecnici da definire."],
      ["Stratigrafia", "Indicare isolante, spessori, posa e finitura. Un eventuale controllo del vapore va progettato, non aggiunto automaticamente."],
      ["Nodi interni", "Descrivere imbotti, attacchi a pavimento e soffitto, divisori e attraversamenti impiantistici."],
      ["Ripristini", "Quantificare gli spostamenti impiantistici e le riprese di pittura e battiscopa inclusi."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste pareti*.", intro: "Questa sintesi accompagna le voci. Superfici e sistema confermati prevalgono sulle immagini.", items: [
      ["Pareti individuate", "Isolamento delle sole superfici e dei risvolti descritti."],
      ["Sistema descritto", "Preparazione, posa e finitura nella stratigrafia concordata."],
      ["Riprese misurate", "Raccordi e finiture accessorie limitati alle voci del computo."],
    ], excluded: [
      ["Cause di umidità", "Risanamento di infiltrazioni e risalita escluso dalla posa dell'isolamento."],
      ["Impianti e arredi", "Spostamento di prese, radiatori e mobili escluso se senza voce dedicata."],
      ["Prestazioni presunte", "Nessuna prestazione acustica, classe energetica o percentuale di risparmio è dichiarata da questo esempio."],
    ] },
    protezione: { title: "Ambiente occupato. *Lavoro pulito*.", intro: "Svuotamento, separazioni e interferenze si concordano prima. La foto è un esempio.", items: [
      ["Ambiente occupato", "Concordare svuotamento, percorsi e limitazioni d'uso della stanza."],
      ["Polvere e superfici", "Individuare separazioni e protezioni di pavimenti e arredi conservati."],
      ["Interferenze", "Coordinare le eventuali opere impiantistiche prima della chiusura delle pareti."],
    ] },
    controlli: { title: "Prima di chiudere. *I riscontri che contano*.", intro: "I controlli riguardano il sistema previsto e le parti accessibili.", items: [
      ["Prima della chiusura", "Riscontro del supporto e dei dettagli concordati."],
      ["Continuità del sistema", "Controlli previsti su nodi e attraversamenti nelle parti accessibili."],
      ["Finitura", "Verifica delle superfici e delle riprese incluse, senza sostituire le valutazioni progettuali."],
    ] },
    documenti: { title: "Il sistema posato. *Le informazioni da tenere*.", intro: "La documentazione è riferita ai materiali e ai dettagli concordati.", items: [
      ["Stratigrafia", "Riepilogo dei materiali e dei dettagli effettivamente concordati."],
      ["Prodotti", "Schede e istruzioni disponibili dei materiali forniti."],
      ["Uso del locale", "Indicazioni pertinenti su manutenzione e gestione dell'ambiente; elaborati tecnici secondo l'incarico."],
    ] },
    diario: { title: "La parete, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La parete e le condizioni di umidità rilevate."],
      ["Durante", "Sistema e nodi prima della chiusura."],
      ["Dopo", "Le superfici finite e le riprese incluse."],
    ] },
  },
};

export const facciataRiparazioniContent: TetEditorialContent = {
  title: "Intervenire dove serve.\nCon limiti chiari.",
  subtitle: "Riparazioni puntuali di facciata: zone identificate, difetti e riprese descritti.",
  eyebrow: "RIPARAZIONI DI FACCIATA",
  cover: "/module-art/facciate.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/module-art/facciate-cappotto-dettaglio.jpg", name: "Ripresa localizzata, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Localizzare il difetto", "Associare ogni segnalazione a una zona accessibile e identificabile."],
    ["Capire i limiti", "Distinguere la ripresa superficiale dalla soluzione delle cause ancora da accertare."],
    ["Concordare i raccordi", "Valutare in anticipo le possibili differenze di colore e tessitura."],
  ],
  solution: [
    ["Elenco delle zone", "Lavorazioni riferite a porzioni numerate, con fotografie reali da aggiungere al caso."],
    ["Riparazione mirata", "Materiali e preparazioni definiti per il difetto individuato."],
    ["Estensioni concordate", "Quantità aggiuntive autorizzate dopo il riscontro, senza allargare implicitamente l'offerta."],
  ],
  usp: [
    ["Zone numerate", "Ogni riparazione è riferita a una porzione identificata e quantificata."],
    ["Limiti detti prima", "La ripresa superficiale non certifica la soluzione della causa: lo diciamo subito."],
    ["Estensioni concordate", "Le quantità aggiuntive si autorizzano dopo il riscontro, non a sorpresa."],
  ],
  journey: [
    ["01 · Segnalazione", "Raccolta delle informazioni e localizzazione delle zone."],
    ["02 · Riscontro", "Valutazione delle parti accessibili e scelta del trattamento."],
    ["03 · Riparazione", "Applicazione del ciclo locale concordato."],
    ["04 · Chiusura", "Riscontro delle riprese, limiti e indicazioni di osservazione."],
  ],
  guarantees: [
    ["Zone verificabili", "Le lavorazioni sono riferite a porzioni identificate e quantità dichiarate."],
    ["Materiali documentati", "Schede disponibili dei prodotti impiegati restano a te."],
    ["Limiti scritti", "Rifacimento generale e cause non accertate sono esclusi chiaramente."],
    ["Nessun rappezzo invisibile", "Colore ed esposizione possono rendere riconoscibile la ripresa: lo diciamo prima."],
  ],
  faq: [
    ["La riparazione riguarda tutta la facciata?", "No. Riguarda le sole zone identificate nel computo; altre porzioni richiedono una valutazione separata."],
    ["Il rappezzo sarà invisibile?", "Non è garantito. Materiali, colore ed esposizione possono rendere riconoscibile la ripresa rispetto all'esistente."],
    ["Una fessura riparata non tornerà più?", "La ricomparsa dipende anche dalla causa e dai movimenti del supporto. Il trattamento superficiale non certifica la loro eliminazione."],
    ["Bastano fotografie per un prezzo definitivo?", "Le fotografie aiutano a localizzare il difetto ma non sostituiscono i riscontri necessari per quantità, supporto e accessi."],
    ["È possibile aggiungere altre zone durante i lavori?", "Sì, dopo averne concordato descrizione, quantità, costo e conseguenze sul programma."],
    ["L'accesso in quota è compreso?", "Solo nelle modalità e nella durata della voce dedicata. Mezzi o allestimenti diversi richiedono una quotazione."],
    ["Si risolvono le infiltrazioni?", "Solo se la causa è individuata e il relativo trattamento è espressamente compreso; una ripresa locale non garantisce la tenuta generale."],
    ["Quali documenti riceverò?", "Il riepilogo concordato delle zone e dei materiali disponibili. Relazioni o prove specialistiche sono comprese soltanto con incarico specifico."],
  ],
  schedule: [
    ["Segnalazione", "Raccolta delle informazioni e localizzazione delle zone."],
    ["Riscontro", "Valutazione delle parti accessibili e scelta del trattamento."],
    ["Preparazione e riparazione", "Accesso, delimitazioni, rimozioni e ciclo locale."],
    ["Chiusura", "Riscontro delle riprese, limiti e indicazioni di osservazione."],
  ],
  blocks: {
    comeFunziona: { title: "Solo dove serve. *Con un perimetro*.", intro: "Le riparazioni si riferiscono a zone numerate: la ripresa non è un rifacimento. La foto è illustrativa.", photo: "/module-art/facciate-cappotto-dettaglio.jpg", items: [
      ["Localizzazione", "Identificare prospetto, quota e dimensioni di ogni riparazione; documentare solo le zone effettivamente osservate."],
      ["Natura del difetto", "Descrivere distacco, fessura o giunto; valutare se servano indagini prima di scegliere il trattamento."],
      ["Ciclo locale", "Indicare rimozioni, preparazioni e materiali compatibili con la parte esistente."],
      ["Raccordo finale", "Definire il bordo della ripresa e la finitura; non promettere l'invisibilità del rappezzo."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste zone*.", intro: "Questa sintesi accompagna le voci. Elenco e quantità confermati prevalgono sulle immagini.", items: [
      ["Zone elencate", "Riparazioni limitate alle porzioni identificate e quantificate."],
      ["Trattamento descritto", "Preparazioni, riprese e finiture del difetto considerato."],
      ["Accesso previsto", "Allestimento limitato alle condizioni espresse nella specifica voce."],
    ], excluded: [
      ["Rifacimento generale", "Tinteggiatura integrale, intonaci estesi e cappotto esclusi."],
      ["Cause non accertate", "Risoluzione di movimenti, infiltrazioni o difetti nascosti non compresa per presunzione."],
      ["Altre porzioni", "Zone non elencate e quantità eccedenti da valutare e quotare dopo il riscontro."],
    ] },
    protezione: { title: "Accesso puntuale. *Parti adiacenti protette*.", intro: "Modalità di accesso e protezioni si scelgono sulle zone concordate. La foto è un esempio.", items: [
      ["Accesso puntuale", "Scegliere modalità e protezioni adeguate alle zone concordate."],
      ["Parti adiacenti", "Definire le superfici conservate da proteggere durante la ripresa."],
      ["Interruzioni", "Concordare l'uso dei passaggi coinvolti per il tempo necessario."],
    ] },
    controlli: { title: "La zona giusta. *Il raccordo dichiarato*.", intro: "I controlli riguardano le riparazioni eseguite e le condizioni riscontrate.", items: [
      ["Zona e dimensione", "Confrontare la riparazione con la porzione indicata nell'offerta."],
      ["Fondo e materiale", "Verifiche previste prima della chiusura del ripristino."],
      ["Raccordi visibili", "Annotare aspetto finale e limiti residui da osservare nel tempo."],
    ] },
    documenti: { title: "Le zone trattate. *Le informazioni da tenere*.", intro: "La documentazione elenca le zone e i materiali della riparazione.", items: [
      ["Scheda delle zone", "Riepilogo di localizzazione, quantità e trattamento concordato."],
      ["Materiali", "Schede disponibili dei prodotti impiegati."],
      ["Esiti e limiti", "Annotazioni delle riprese effettuate e degli aspetti esclusi dall'intervento."],
    ] },
    diario: { title: "Le zone, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Le zone segnalate e i difetti localizzati."],
      ["Durante", "Rimozioni, preparazioni e ciclo locale."],
      ["Dopo", "Le porzioni riparate, con i limiti dichiarati."],
    ] },
  },
};

export const facciataVentilataContent: TetEditorialContent = {
  title: "La facciata che respira.\nProtegge e isola.",
  subtitle: "Facciata ventilata: sottostruttura, isolante e rivestimento con la camera d'aria che fa la differenza.",
  eyebrow: "FACCIATA VENTILATA",
  cover: "/module-art/facciate-cappotto-dettaglio.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate.jpg", name: "Facciata ventilata, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Capire l'edificio", "Superfici, supporto e ancoraggi disponibili determinano la fattibilità della sottostruttura."],
    ["Scegliere il rivestimento", "Gres, pietra, legno o metallo cambiano peso, aspetto, manutenzione e sottostruttura."],
    ["Progettare la camera d'aria", "La ventilazione tra isolante e rivestimento è il cuore del sistema: si progetta, non si improvvisa."],
  ],
  solution: [
    ["Sistema completo", "Sottostruttura, isolante, camera d'aria e rivestimento identificati nella specifica."],
    ["Ancoraggi verificati", "Staffe e montanti scelti sul supporto reale, con le verifiche del caso."],
    ["Nodi risolti", "Angoli, aperture, zoccolatura e coronamenti descritti con i loro limiti."],
  ],
  usp: [
    ["Sistema, non solo rivestimento", "Sottostruttura, isolante, camera d'aria e finitura si progettano insieme."],
    ["Ancoraggi sul supporto reale", "Staffe e montanti si dimensionano dopo la verifica del muro."],
    ["Nessuna prestazione promessa", "Risparmi e classe dipendono dal progetto e dall'edificio, non da questo esempio."],
  ],
  journey: [
    ["01 · Rilievo", "Superfici, supporto, ancoraggi e nodi."],
    ["02 · Sistema", "Sottostruttura, isolante, rivestimento e campione."],
    ["03 · Posa", "Ancoraggi, isolante, camera d'aria e rivestimento."],
    ["04 · Finitura", "Nodi, coronamenti e riscontro."],
  ],
  guarantees: [
    ["Sistema documentato", "Sottostruttura, isolante e rivestimento seguono le schede del sistema fornito."],
    ["Ancoraggi verificati", "Staffe e montanti sono dimensionati e verificati sul supporto reale."],
    ["Perimetro scritto", "Superfici, nodi e opere escluse sono distinti nel computo."],
    ["Nessuna promessa energetica", "Prestazioni e salti di classe non sono garantiti: li valuta un tecnico."],
  ],
  faq: [
    ["Qual è il vantaggio rispetto al cappotto?", "La camera d'aria ventilata favorisce lo smaltimento dell'umidità e protegge l'isolante; il rivestimento è a secco e ispezionabile. La scelta dipende dall'edificio e dal budget."],
    ["Quale rivestimento posso scegliere?", "Gres, pietra, legno o metallo: cambiano peso, aspetto e sottostruttura. Si sceglie sul supporto reale e sul progetto, non a priori."],
    ["Va bene su ogni parete?", "Il supporto deve reggere gli ancoraggi: muratura, stato e planarità si verificano prima. La fattibilità non si dà per scontata."],
    ["Garantisce un risparmio in bolletta?", "Il risultato dipende dall'edificio, dagli impianti e dall'uso. Non si promettono percentuali né salti di classe."],
    ["La sottostruttura è compresa?", "Sì, se elencata: staffe, montanti e ancoraggi fanno parte del sistema e si quotano con l'isolante e il rivestimento."],
    ["Serve un progetto?", "Ancoraggi, camera d'aria e nodi vanno progettati. L'incarico tecnico, se non compreso, si concorda a parte."],
    ["Quanto dura il cantiere?", "Dipende da superfici, accessi, meteo e disponibilità dei materiali. Le date si concordano prima dell'avvio."],
    ["Ci sono agevolazioni?", "Nessuna è calcolata in automatico. Le regole in vigore si verificano prima: la pratica la segue chi di competenza."],
  ],
  schedule: [
    ["Rilievo", "Superfici, supporto, ancoraggi e nodi."],
    ["Scelta del sistema", "Sottostruttura, isolante, rivestimento e campione."],
    ["Posa", "Ancoraggi, isolante, camera d'aria e rivestimento."],
    ["Finitura e riscontro", "Nodi, coronamenti e verifiche."],
  ],
  blocks: {
    comeFunziona: { title: "La camera d'aria *fa il sistema*.", intro: "La facciata ventilata è sottostruttura, isolante, camera d'aria e rivestimento a secco. La foto è illustrativa.", photo: "/module-art/facciate.jpg", items: [
      ["Supporto e ancoraggi", "Verificare muratura, stato e planarità; staffe e montanti si dimensionano sul supporto reale."],
      ["Isolante", "Materiale e spessore scelti sul progetto, applicati sul supporto dietro la camera d'aria."],
      ["Camera d'aria", "La ventilazione tra isolante e rivestimento va progettata: è il cuore del sistema."],
      ["Rivestimento", "Gres, pietra, legno o metallo: peso, aspetto e fissaggio definiti in scheda."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo sistema*.", intro: "Questa sintesi accompagna le voci. Superfici e sistema confermati prevalgono sulle immagini.", items: [
      ["Superfici individuate", "Sistema sui soli prospetti e porzioni misurate nel computo."],
      ["Sistema descritto", "Sottostruttura, isolante, camera d'aria e rivestimento nella configurazione confermata."],
      ["Nodi elencati", "Angoli, aperture, zoccolatura e coronamenti nelle quantità riportate."],
    ], excluded: [
      ["Incarichi tecnici", "Progetto, verifiche strutturali e pratiche non compresi se privi di voce dedicata."],
      ["Opere estranee", "Serramenti, coperture, impianti e modifiche strutturali esclusi."],
      ["Accessi ulteriori", "Occupazioni e opere provvisionali diverse dalla voce di esempio da quotare separatamente."],
    ] },
    protezione: { title: "Lavorare in quota. *Proteggere l'edificio*.", intro: "Accessi e protezioni si definiscono nel piano di cantiere. La foto è un esempio.", items: [
      ["Ponteggi e percorsi", "Accessi e protezioni da definire nel piano di cantiere e valorizzare nelle voci."],
      ["Parti conservate", "Individuare serramenti, pavimentazioni e impianti da proteggere."],
      ["Condizioni ambientali", "Pianificare la posa in funzione dei limiti applicativi dei materiali e del meteo."],
    ] },
    controlli: { title: "Ancoraggi saldi. *Camera d'aria continua*.", intro: "I controlli riguardano il sistema previsto e le parti accessibili.", items: [
      ["Ancoraggi", "Riscontro di staffe e montanti prima del rivestimento."],
      ["Isolante e camera d'aria", "Verifica di continuità dell'isolante e della ventilazione prevista."],
      ["Rivestimento e nodi", "Controllo di allineamenti, fissaggi e coronamenti concordati."],
    ] },
    documenti: { title: "Il sistema posato. *Le informazioni da tenere*.", intro: "La documentazione è riferita ai materiali e ai dettagli concordati.", items: [
      ["Sistema", "Schede di sottostruttura, isolante e rivestimento forniti."],
      ["Dettagli", "Elenco delle scelte approvate e delle eventuali varianti."],
      ["Manutenzione", "Indicazioni per l'ispezione del rivestimento e la cura della finitura."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La parete e il supporto rilevati."],
      ["Durante", "Ancoraggi, isolante e camera d'aria prima del rivestimento."],
      ["Dopo", "Il rivestimento finito, con i nodi risolti."],
    ] },
  },
};

export const facciataPietraContent: TetEditorialContent = {
  title: "La pietra sulla facciata.\nCarattere che dura.",
  subtitle: "Rivestimenti in pietra e listelli: supporto, ancoraggio e posa definiti sul prospetto reale.",
  eyebrow: "RIVESTIMENTI IN PIETRA",
  cover: "/module-art/facciate.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/module-art/facciate-cappotto-dettaglio.jpg", name: "Posa dei listelli, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Leggere il supporto", "Consistenza, planarità e capacità portante decidono se e come rivestire."],
    ["Scegliere pietra o listello", "Pietra naturale, ricostruita o listelli cambiano peso, posa e manutenzione."],
    ["Definire posa e ancoraggio", "Incollata o ancorata: dipende dal peso del materiale e dal supporto reale."],
  ],
  solution: [
    ["Materiale identificato", "Tipo di pietra o listello, formato, colore e campione riportati nella specifica."],
    ["Posa compatibile", "Incollaggio o ancoraggio scelti sul peso del materiale e sul supporto verificato."],
    ["Nodi curati", "Angoli, spigoli, davanzali e coronamenti descritti con i loro limiti."],
  ],
  usp: [
    ["Supporto verificato", "Portata e planarità si controllano prima di scegliere posa e materiale."],
    ["Posa sul peso reale", "Incollata o ancorata secondo il materiale: la pietra pesante non si improvvisa."],
    ["Nodi curati", "Angoli, davanzali e coronamenti fanno l'aspetto e la durata: si definiscono prima."],
  ],
  journey: [
    ["01 · Rilievo", "Supporto, superfici e nodi."],
    ["02 · Materiale", "Pietra o listello, posa e campione."],
    ["03 · Posa", "Preparazione, ancoraggio o incollaggio, stuccatura."],
    ["04 · Finitura", "Nodi, protezione e riscontro."],
  ],
  guarantees: [
    ["Materiale documentato", "Tipo, formato e lotto della pietra o dei listelli restano a te."],
    ["Posa verificata", "Incollaggio o ancoraggio sono scelti sul supporto e sul peso reali."],
    ["Perimetro scritto", "Superfici, nodi e opere escluse sono distinti nel computo."],
    ["Aspetto naturale", "Venature e tono della pietra variano: si concorda un campione, senza promettere uniformità."],
  ],
  faq: [
    ["Posso rivestire su qualsiasi muro?", "No: il supporto deve reggere il peso del rivestimento. Portata, planarità e stato si verificano prima della scelta."],
    ["Pietra naturale o ricostruita?", "Cambiano peso, aspetto, costo e manutenzione. La ricostruita è più leggera e regolare; la naturale ha venature uniche. Si sceglie su campione."],
    ["Va incollata o ancorata?", "Dipende dal peso del materiale e dal supporto. I materiali pesanti richiedono ancoraggi dedicati, da progettare."],
    ["Il colore sarà uniforme?", "La pietra è naturale: tono e venature variano tra le lastre. Si concorda un campione, sapendo che non è uniforme come una piastrella."],
    ["Serve manutenzione?", "Alcune pietre richiedono un trattamento protettivo, soprattutto in facciata esposta. Le indicazioni si consegnano con i materiali."],
    ["Sono compresi angoli e davanzali?", "Solo i pezzi speciali e i nodi elencati. Angoli, spigoli e coronamenti si quotano con le loro quantità."],
    ["Si può rivestire solo una porzione?", "Sì, valutando i raccordi e le possibili differenze con le superfici adiacenti non rivestite."],
    ["Ci sono agevolazioni?", "Nessuna è calcolata in automatico. Le regole in vigore si verificano prima: la pratica la segue chi di competenza."],
  ],
  schedule: [
    ["Rilievo", "Supporto, superfici e nodi."],
    ["Scelta del materiale", "Pietra o listello, posa e campione."],
    ["Posa", "Preparazione, ancoraggio o incollaggio, stuccatura."],
    ["Finitura e riscontro", "Nodi, protezione e verifiche."],
  ],
  blocks: {
    comeFunziona: { title: "Il supporto prima. *Poi la pietra*.", intro: "Un rivestimento in pietra vive sull'ancoraggio e sul supporto, non solo sull'estetica. La foto è illustrativa.", photo: "/module-art/facciate-cappotto-dettaglio.jpg", items: [
      ["Supporto e portata", "Verificare consistenza, planarità e capacità di reggere il peso del rivestimento."],
      ["Materiale e formato", "Pietra naturale, ricostruita o listelli: peso, formato e campione definiti in scheda."],
      ["Posa e ancoraggio", "Incollaggio o ancoraggio scelti sul peso e sul supporto reali."],
      ["Nodi e finitura", "Angoli, spigoli, davanzali, stuccatura ed eventuale protezione descritti con i limiti."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Superfici e materiale confermati prevalgono sulle immagini.", items: [
      ["Superfici individuate", "Rivestimento sui soli prospetti e porzioni misurate nel computo."],
      ["Ciclo di posa", "Preparazione, ancoraggio o incollaggio e stuccatura nella configurazione confermata."],
      ["Pezzi speciali", "Angoli, davanzali e coronamenti nelle quantità e nei tipi riportati."],
    ], excluded: [
      ["Opere strutturali", "Consolidamenti e rinforzi del supporto esclusi se privi di voce dedicata."],
      ["Opere estranee", "Serramenti, lattonerie, impianti e coperture esclusi."],
      ["Accessi ulteriori", "Occupazioni e opere provvisionali diverse dalla voce di esempio da quotare separatamente."],
    ] },
    protezione: { title: "Lavorare in quota. *Proteggere sotto*.", intro: "Accessi e protezioni si definiscono nel piano di cantiere. La foto è un esempio.", items: [
      ["Ponteggi e percorsi", "Accessi e protezioni da definire nel piano di cantiere e valorizzare nelle voci."],
      ["Parti conservate", "Individuare serramenti, soglie e pavimentazioni da proteggere."],
      ["Movimentazione", "Definire deposito e sollevamento dei materiali pesanti in sicurezza."],
    ] },
    controlli: { title: "Ancoraggio saldo. *Posa allineata*.", intro: "I controlli riguardano il ciclo previsto e le parti accessibili.", items: [
      ["Supporto e ancoraggi", "Riscontro della preparazione e degli ancoraggi previsti prima della posa."],
      ["Allineamento e stuccatura", "Controllo di fughe, allineamenti e pezzi speciali."],
      ["Protezione", "Verifica dell'eventuale trattamento protettivo concordato."],
    ] },
    documenti: { title: "Il rivestimento posato. *Le informazioni da tenere*.", intro: "La documentazione rende riconoscibili materiali e trattamenti.", items: [
      ["Materiale", "Tipo, formato e lotto della pietra o dei listelli forniti."],
      ["Ciclo di posa", "Prodotti di ancoraggio, incollaggio e stuccatura impiegati."],
      ["Manutenzione", "Indicazioni per pulizia e rinnovo dell'eventuale protezione."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Il supporto e le superfici da rivestire."],
      ["Durante", "Preparazione, ancoraggi e posa dei pezzi."],
      ["Dopo", "La facciata rivestita, con i nodi risolti."],
    ] },
  },
};

export const facciataPuliziaContent: TetEditorialContent = {
  title: "La facciata pulita.\nProtetta nel tempo.",
  subtitle: "Pulizia e protezione delle facciate: rimozione di sporco e depositi, poi un trattamento protettivo.",
  eyebrow: "PULIZIA E PROTEZIONE",
  cover: "/module-art/facciate.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/module-art/facciate-tinteggiatura-dettaglio.jpg", name: "Pulizia della facciata, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Capire lo sporco", "Smog, alghe, muschi o efflorescenze si trattano in modo diverso: prima si identifica."],
    ["Leggere il materiale", "Intonaco, pietra o cotto reagiscono diversamente al metodo di pulizia scelto."],
    ["Decidere la protezione", "Un trattamento idrorepellente o antimuffa prolunga il risultato, dove il materiale lo consente."],
  ],
  solution: [
    ["Metodo compatibile", "Pulizia scelta sul tipo di sporco e sul materiale, con una prova su una zona campione."],
    ["Trattamento protettivo", "Prodotto e modalità definiti in funzione della superficie e dell'esposizione."],
    ["Perimetro chiaro", "Superfici, metodo e limiti descritti; ripristini e finiture restano voci separate."],
  ],
  usp: [
    ["Metodo sul materiale", "La pulizia si sceglie su sporco e superficie reali, con prova su zona campione."],
    ["Protezione dove serve", "Idrorepellente o antimuffa applicati dove il materiale lo consente."],
    ["Solo pulizia e protezione", "Ripristini, intonaci e tinteggiatura restano interventi distinti."],
  ],
  journey: [
    ["01 · Sopralluogo", "Tipo di sporco, materiale e prova su campione."],
    ["02 · Metodo", "Pulizia e trattamento compatibili."],
    ["03 · Pulizia", "Rimozione di sporco e depositi sulle superfici indicate."],
    ["04 · Protezione", "Trattamento protettivo e riscontro."],
  ],
  guarantees: [
    ["Metodo documentato", "Prodotti e modalità di pulizia e protezione restano a te."],
    ["Prova su campione", "Il metodo è verificato su una zona prima dell'estensione."],
    ["Perimetro scritto", "Superfici, metodo e opere escluse sono distinti nel computo."],
    ["Nessun risultato eterno", "Sporco e alghe possono tornare: la protezione rallenta, non elimina, il fenomeno."],
  ],
  faq: [
    ["Che tipo di sporco si può togliere?", "Smog, alghe, muschi ed efflorescenze si trattano con metodi diversi. Prima si identifica lo sporco e la superficie, poi si sceglie il metodo."],
    ["La pulizia rovina l'intonaco?", "Con il metodo giusto no. Idropulitura, prodotti o metodi delicati si scelgono sul materiale, con una prova su zona campione."],
    ["Serve il trattamento protettivo?", "Non è obbligatorio, ma un idrorepellente o antimuffa prolunga il risultato dove il materiale lo consente. Si concorda a parte se non incluso."],
    ["Lo sporco tornerà?", "La protezione rallenta il ritorno di alghe e depositi, ma non lo elimina per sempre. Esposizione e umidità incidono."],
    ["Si può fare senza ponteggio?", "Dipende dall'altezza e dal metodo. Accessi e mezzi vanno indicati nella voce dedicata."],
    ["Copre anche i ripristini?", "No, salvo voce specifica. Distacchi e intonaci ammalorati richiedono un intervento distinto."],
    ["Serve dopo la pulizia una tinteggiatura?", "Non sempre: la pulizia può bastare a rinnovare l'aspetto. La tinteggiatura è un intervento separato, da valutare."],
    ["Ci sono rischi per le piante o i vicini?", "Con le protezioni corrette il rischio è controllato. Metodo e prodotti si scelgono anche in base al contesto."],
  ],
  schedule: [
    ["Sopralluogo", "Tipo di sporco, materiale e prova su campione."],
    ["Scelta del metodo", "Pulizia e trattamento compatibili."],
    ["Pulizia", "Rimozione di sporco e depositi sulle superfici indicate."],
    ["Protezione e consegna", "Trattamento protettivo, riscontro e pulizia finale."],
  ],
  blocks: {
    comeFunziona: { title: "Prima lo sporco. *Poi la protezione*.", intro: "Pulizia e protezione si scelgono su sporco e materiale reali, con una prova. La foto è illustrativa.", photo: "/module-art/facciate-tinteggiatura-dettaglio.jpg", items: [
      ["Tipo di sporco", "Identificare smog, alghe, muschi o efflorescenze prima di scegliere il metodo."],
      ["Materiale della facciata", "Intonaco, pietra o cotto reagiscono diversamente: il metodo si sceglie sul materiale."],
      ["Prova su campione", "Verificare il metodo su una zona prima di estenderlo a tutta la superficie."],
      ["Protezione", "Idrorepellente o antimuffa applicati dove il materiale e l'esposizione lo consentono."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste superfici*.", intro: "Questa sintesi accompagna le voci. Superfici e metodo confermati prevalgono sulle immagini.", items: [
      ["Superfici indicate", "Pulizia dei soli prospetti e porzioni misurate nel computo."],
      ["Metodo descritto", "Pulizia e trattamento nella configurazione confermata."],
      ["Protezione elencata", "Trattamento protettivo solo nelle quantità e nei tipi riportati."],
    ], excluded: [
      ["Ripristini", "Intonaci ammalorati, distacchi e tinteggiatura non compresi se privi di voce dedicata."],
      ["Cause di degrado", "Eliminazione di infiltrazioni e umidità di risalita esclusa."],
      ["Accessi ulteriori", "Occupazioni e mezzi diversi dalla voce di esempio da quotare separatamente."],
    ] },
    protezione: { title: "Lavorare in quota. *Proteggere l'intorno*.", intro: "Accessi, prodotti e contesto si definiscono prima. La foto è un esempio.", items: [
      ["Accessi e mezzi", "Definire ponteggio, piattaforma o altro accesso adeguato all'altezza."],
      ["Superfici e intorno", "Proteggere serramenti, verde e superfici adiacenti dal metodo scelto."],
      ["Prodotti e meteo", "Pianificare la posa in funzione dei limiti dei prodotti e delle condizioni."],
    ] },
    controlli: { title: "Superficie pulita. *Protezione stesa*.", intro: "I controlli riguardano le superfici trattate e il metodo concordato.", items: [
      ["Pulizia", "Riscontro della rimozione di sporco e depositi sulle superfici previste."],
      ["Assenza di danni", "Controllo che il metodo non abbia alterato il materiale."],
      ["Protezione", "Verifica dell'applicazione del trattamento protettivo concordato."],
    ] },
    documenti: { title: "Il trattamento eseguito. *Le informazioni da tenere*.", intro: "La documentazione rende ripetibile il metodo e la protezione.", items: [
      ["Metodo", "Prodotti e modalità di pulizia impiegati."],
      ["Protezione", "Prodotto protettivo applicato e sue caratteristiche."],
      ["Manutenzione", "Indicazioni per osservare la facciata e rinnovare la protezione."],
    ] },
    diario: { title: "La facciata, *prima e dopo*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Lo sporco e i depositi rilevati sulle superfici."],
      ["Durante", "Pulizia e prova su zona campione."],
      ["Dopo", "La facciata pulita e protetta."],
    ] },
  },
};

