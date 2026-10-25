# Pianificazione predittiva dei cantieri: trasferte, risorse e consegne

Data: 22 ottobre 2026. Stato: primo incremento implementato e in collaudo locale su Demo Azienda 2; programma completo nelle sezioni seguenti. Trasferte, capacità e confronto degli scenari non modificano i dati commerciali o operativi. Nessuna pubblicazione autorizzata o eseguita per questo incremento.

## 1. Risultato atteso e confini

L'utente deve poter chiedere: «Questo cantiere è a un'ora dalla sede: quanto tempo e costo perdo nei viaggi?» oppure «Devo consegnare entro questa data: quali squadre servono e quando devo ordinare i materiali?». Il sistema confronta scenari e spiega i vincoli. Non promette una data solo perché l'AI riesce a scriverla.

Il preventivo rimane la fonte commerciale; il cronoprogramma rimane il piano dei lavori; lo scenario è una simulazione separata. Un confronto non cambia prezzi, quantità, IVA, persone assegnate o ordini ai fornitori. Anche confermare uno scenario non deve inviare messaggi ai clienti o prenotare risorse: ogni eventuale applicazione operativa è un'azione distinta, autorizzata e riepilogata prima del salvataggio.

La prima versione è un motore di simulazione spiegabile. Una previsione statistica calibrata sui consuntivi aziendali è un incremento successivo: intervalli ipotizzati dall'AI non equivalgono a probabilità misurate.

## 2. Base locale verificata e lacune

| Base presente | Cosa conservare | Estensione necessaria |
| --- | --- | --- |
| [`quoteProject.ts`](../src/lib/preventivi/quoteProject.ts): costi per voce, ore, numero persone e ore/giorno | Costi mancanti distinti da zero; IVA e budget separati; nessuna deduzione delle ore dal solo prezzo | Ore per competenza e fase, capacità per giornata, trasferte e costi incrementali |
| [`quoteSchedule.ts`](../src/lib/preventivi/quoteSchedule.ts): dipendenze, lavoro lun–ven, attese di calendario, intervalli minimo/massimo | Calendario locale confermabile; variazioni fisiche rendono il piano da rivedere; prezzi/IVA non cambiano le durate | Calendari reali, carichi delle risorse, consegne, vincoli di spazio e pianificazione a ritroso |
| [`cronoprogramma.ts`](../src/lib/orders/cronoprogramma.ts): fasi, traguardi e ore da rapportini inviati/approvati | Separazione previsto/reale e collegamenti per ID | Adattatore in lettura per ricalcolare il residuo senza riscrivere il passato |
| [Piano personale e costi](piano-personale-costi-commesse.md) | Anagrafica unica, approvazioni e costo storico; timbrature e rapportini non sono due costi | Regole esplicite per viaggio, presenza, produzione e valorizzazione |
| [Piano Campo e commessa](piano-campo-commessa-sincronizzazione.md) | Fonti originali di ore, materiali, acquisti e mezzi; permessi esistenti | Lettura dello stato verificato e segnalazione di dati mancanti/non aggiornati |

Il calcolo attuale `ore / (persone × ore al giorno)` è un rapporto di capacità, non una durata di cantiere verificata. Non comprende automaticamente specializzazioni, altre commesse, attese, consegne o trasferte. Il grafo tecnico disponibile non copre questi collegamenti: la ricognizione sopra deriva dai sorgenti e dai piani locali, non da dipendenze dedotte dal grafo.

## 3. Esperienza in chat, senza rifare il preventivatore

Mantenere il flusso esistente: scelta iniziale del preventivo classico o del modulo, chat, voci modificabili e anteprima con il template aziendale. Nessuna nuova tab permanente per ciascun aspetto della pianificazione.

Alla richiesta «finire in un mese», la chat recupera quanto già confermato e domanda solo i dati decisivi mancanti, in piccoli gruppi:

1. «Entro quale data? Il mese parte da oggi o dall'apertura del cantiere?»
2. «Alle 8 dovete essere in cantiere o partite dalla sede?» Scelte: **Già in cantiere / Partenza dalla sede / Orario variabile**.
3. «Da dove parte la squadra? Conosci chilometri e minuti per tratta?» Prima versione manuale; successiva ricerca del percorso solo su richiesta.
4. «Quali squadre sono davvero disponibili, in quali giorni? Quali materiali hanno una consegna confermata?»

Le informazioni già note non si richiedono a ogni turno. Conservare la memoria per cantiere, squadra, lavorazione e periodo: una nuova finestra temporale non deve cancellare l'esclusione di una lavorazione.

Mostrare in chat una scheda compatta con: data obiettivo, stato della fattibilità, competenze mancanti, forniture critiche, differenza di costo e ipotesi aperte. Espandere i dettagli al clic. Pulsanti: **Confronta scenari / Cambia risorse / Cambia scadenza / Vedi vincoli**. Una domanda come «e con una persona in più?» ricalcola lo scenario, non ricompone tutto il preventivo.

A destra resta il documento aziendale. Il dettaglio interno di risorse/costi non compare nel PDF cliente; un eventuale allegato cronoprogramma contiene solo dati selezionati e confermati. Un cambio di scenario non deve azzerare lo scroll, animare ogni riga o bloccare la scrittura. Usare gli accenti blu/arancione già richiesti, stato testuale oltre al colore e animazioni ridotte secondo le preferenze del dispositivo.

## 4. Trasferte: distinguere disponibilità, produzione e costo

Registrare origine e destinazione effettive, chilometri **per tratta**, minuti di andata e ritorno, giorni interessati, orario di partenza e finestra di accesso al cantiere. Andata e ritorno possono avere durate diverse. Non ricavare i minuti dai soli chilometri con una velocità standard nascosta.

Per ogni persona/squadra distinguere:

- finestra disponibile e pause già sottratte o ancora da sottrarre;
- tempo di viaggio interno o esterno a quella finestra;
- tempo presente in cantiere, ulteriori attività non produttive e tempo realmente allocabile alle lavorazioni;
- ore eventualmente valorizzate a costo, rimborsi, mezzo, pedaggi, parcheggio e pernottamento;
- origine del costo orario: verificare se include già quote di trasferta o tempi non produttivi.

Il trattamento contrattuale del viaggio è configurato e validato dall'impresa con i propri referenti: non dedurlo dall'orario o dal ruolo di conducente/passeggero. La simulazione non è un motore paghe e non autorizza estensioni della giornata.

### Esempio aritmetico, non preventivo del bilocale

Ipotesi dichiarate: 3 persone; 8 ore disponibili a persona **dopo le pause**; 1 ora di andata e 1 di ritorno entrambe comprese nelle 8 ore; nessuna altra perdita di tempo. Tutte le persone hanno le competenze richieste e lavorano senza interferenze.

| Scenario | Ore in cantiere per persona/giorno | Capacità della squadra/giorno | Giorni per 360 ore-persona di lavoro |
| --- | ---: | ---: | ---: |
| Nessun viaggio dentro le 8 ore disponibili | 8 | 24 ore-persona | 15 |
| Due ore di viaggio dentro le stesse 8 ore | 6 | 18 ore-persona | 20 |

La capacità giornaliera diminuisce del 25%; per lo stesso carico i giorni aumentano da 15 a 20, circa il 33%. Non sono la stessa percentuale. Le 360 ore sono un dato sintetico di prova, non una quantità ricavata dal prezzo del preventivo.

Con 40 km per tratta, un unico furgone e 20 giornate di andata/ritorno: `40 × 2 × 20 = 1.600 km-mezzo`. Le ore-persona di viaggio sono invece `3 × 2 × 20 = 120`. Non moltiplicare i chilometri del furgone per il numero dei passeggeri.

Se alle 8 la squadra è già sul posto e viaggia fuori dalla finestra di produzione, le due ore non si sottraggono automaticamente dalle 8 ore in cantiere. Rimangono comunque un vincolo da valutare per disponibilità complessiva, costi, sostenibilità e regole applicabili. Non proporre «partite due ore prima» come soluzione gratuita.

Gestire anche partenza da casa, ritrovo in sede, raccolta di colleghi, carico attrezzi, ritiro materiali, ritorno su percorso diverso e trasferimento tra cantieri. Usare intervalli temporali non sovrapposti, non sottrazioni duplicate dello stesso evento. Per più cantieri nello stesso giorno il viaggio va contato una sola volta nel calendario della persona e del mezzo; la ripartizione economica richiede una regola esplicita.

## 5. Motore delle risorse e delle lavorazioni

Per ogni fase servono quantità, unità, ore necessarie o produttività dichiarata, competenze, squadra minima/massima utilizzabile, calendario, predecessori, materiali necessari e vincoli di spazio/accesso. Se si parte da una produttività, indicare se è per persona o per squadra: `m²/ora-squadra` non è `m²/ora-persona`.

Calcolare prima la capacità disponibile per competenza e giorno, sottraendo gli impegni effettivi, non solo contando i dipendenti dell'azienda. Un elettricista e un piastrellista non sono risorse intercambiabili. Una squadra assegnata all'intera commessa non occupa necessariamente tutte le persone per ogni ora di tutte le fasi: evitare di duplicarne i membri nelle assegnazioni individuali.

Il motore deve rispettare:

- competenze e disponibilità contemporanee, ferie/assenze come indisponibilità senza dettagli sanitari;
- mezzi, attrezzi e fronti di lavoro condivisi;
- limiti di persone nello stesso ambiente e interferenze fra lavorazioni;
- turni e finestre autorizzate, chiusure, festività configurate e calendario locale;
- tempi tecnici, prove e controlli come vincoli non comprimibili senza evidenza tecnica;
- indisponibilità del cliente, permessi, accessi condominiali e lavori di terzi quando pertinenti;
- subappalti come prestazioni con disponibilità e durata proprie, non dipendenti con costo orario inventato.

Una persona in più non dimezza automaticamente i giorni. La parallelizzazione è ammessa solo per fasi indipendenti con competenze, mezzi e spazio disponibili. Esporre il percorso che determina la fine e il vincolo che limita ogni accelerazione; non mettere tutte le fasi in serie per prudenza né tutte in parallelo per rispettare il desiderio del cliente.

## 6. Pianificazione a ritroso: «finire entro un mese»

Tradurre «un mese» in una data esplicita, con calendario e punto di partenza confermati. Un mese non equivale sempre a 20 giorni lavorativi. Distinguere fine lavori, collaudo e consegna al cliente.

Procedura del motore:

1. Bloccare una fotografia dell'ambito incluso e delle quantità; distinguere esclusioni, opzioni e lavori non ancora confermati.
2. Calcolare il piano di riferimento con risorse e forniture note. Se mancano dati, dichiarare «fattibilità non verificabile», non «fattibile» o «impossibile» in modo assoluto.
3. Partire dalla consegna richiesta e ricavare per ogni fase la partenza e la consegna materiali più tardive compatibili con i vincoli.
4. Cercare alternative entro limiti dichiarati: persone qualificate aggiuntive, squadre specialistiche, subappalto disponibile, acquisti anticipati, materiali alternativi approvati, fasi indipendenti parallele.
5. Ricalcolare durate, capacità e costo di ciascuna alternativa. Conservare i vincoli non risolti e gli impegni non confermati.
6. Rispondere con condizioni concrete: persone per competenza/settimana, date richieste ai fornitori, decisioni da prendere entro una data e margine temporale residuo.

Confrontare inizialmente al massimo tre alternative leggibili: **risorse attuali / completamento entro obiettivo / alternativa meno costosa compatibile**. Non chiamare l'ultima «ottimale» senza aver dimostrato l'ottimo. Se nessuno scenario rispetta i vincoli, indicare la prima data fattibile *tra gli scenari valutati* e ciò che impedisce la scadenza.

Esempio di controllo minimo: 360 ore-persona, 15 giornate effettivamente disponibili per quelle lavorazioni e 6 ore produttive a persona richiedono almeno `ceil(360 / (15 × 6)) = 4` persone equivalenti. È solo un limite aritmetico inferiore: specializzazioni, sequenze e attese possono rendere insufficienti anche quattro persone.

## 7. Fornitori, acquisti e consegne

Collegare ogni fornitura alla prima fase che la utilizza e alla relativa quantità. Non pretendere che tutti i materiali arrivino il primo giorno. Registrare lead time, tipo di calendario, disponibilità a magazzino, data di richiesta, conferma del fornitore, finestre di consegna e prerequisiti dichiarati come rilievo definitivo, scelta cliente o acconto.

La data limite d'ordine deriva dalla data di utilizzo meno il lead time e l'eventuale riserva esplicita, usando il calendario corretto. Se la data limite è già passata, segnalarlo; non retrodatare l'ordine. Una data desiderata non deve diventare una consegna confermata.

Gestire consegne parziali, prodotti su misura, sostituzioni soggette ad approvazione, trasporto, spazio di deposito, mezzi di scarico e disponibilità della squadra per ricevere. Una consegna anticipata può generare costi o essere impraticabile. Le stime dell'AI restano ipotesi e non prevalgono sulla conferma aggiornata del fornitore.

Nessun ordine, sollecito, email, acquisto o cambio prodotto viene generato operativamente dal semplice confronto. La scheda può proporre «Richiedi conferma consegna», ma l'invio richiede un flusso autorizzato separato.

## 8. Costi, margine, IVA e cassa

Separare costo aziendale aggiuntivo, prezzo al cliente e flusso di cassa. Il tempo del viaggio può ridurre la capacità senza produrre automaticamente una nuova voce da fatturare. Se un costo è già incluso in una tariffa, in un subappalto a corpo o in una riga composita, non sommarlo una seconda volta.

Attribuire una fonte unica a ore, mezzi, rimborsi e trasporti. Distinguere spesa realmente incrementale e ripartizione di un costo fisso già esistente. Non sommare timbratura, rapportino, cedolino e tariffa caricata come quattro costi della stessa prestazione. Per il mezzo scegliere una base di valorizzazione esplicita e non aggiungere carburante se già incluso nella tariffa chilometrica applicata.

Mostrare differenza di costo e possibile impatto sul margine solo con costi sufficientemente completi. In caso contrario: «costi noti + componenti mancanti», mai margine affidabile calcolato su zeri impliciti. Il prezzo regionale di vendita non fornisce da solo ore e costi interni.

Riutilizzare i calcoli commerciali esistenti per IVA, sconti e totali; non introdurre un secondo calcolatore nella pianificazione. Un costo interno non determina l'aliquota al cliente. Le date ipotizzate di SAL, acconti e incassi servono al fabbisogno di cassa, ma non emettono SAL/fatture e non costituiscono avanzamento certificato.

Un eventuale aggiornamento commerciale passa da una proposta esplicita: voci interessate, prezzo precedente/nuovo, fonte, revisione e conferma. Lo scenario da solo non modifica l'offerta.

## 9. Dati, integrazione e compatibilità

Introdurre un oggetto scenario opzionale e versionato, separato dalla bozza commerciale e dal piano confermato. Nomi dei moduli da definire nell'implementazione; non creare ora un secondo archivio di persone, fornitori o fasi.

Ogni scenario conserva identificativi azienda/progetto, revisione dell'ambito, data di calcolo, versioni dei calendari, riferimenti delle forniture, ipotesi, origine dei dati, vincoli, risultati e versione dell'algoritmo. Stati degli input: **confermato / ipotesi / mancante / non aggiornato**. Una risposta dell'AI non promuove un dato a confermato.

| Cambiamento | Effetto atteso |
| --- | --- |
| Quantità, ambito incluso, lavorazione o dipendenza | Scenario temporale ed economico da ricalcolare |
| Disponibilità, viaggio, calendario, consegna o produttività | Scenario da ricalcolare anche se la revisione del preventivo è identica |
| Solo prezzo o IVA | Aggiornare il confronto economico; non alterare automaticamente le durate |
| Cambio azienda, permesso revocato o fonte non accessibile | Interrompere la richiesta e non riutilizzare dati dell'azienda precedente |
| Dato arrivato dopo una nuova richiesta | Ignorare il risultato obsoleto, non sovrascrivere lo scenario corrente |

Gli adattatori leggono le fonti autorizzate esistenti; le prime prove usano esclusivamente fixture locali e dati della demo consentiti. Nessuna migrazione obbligatoria delle vecchie bozze: un progetto senza scenari continua ad aprirsi come prima. Eventuali sincronizzazione e salvataggi server saranno una fase separata con verifiche di permessi, isolamento aziendale e concorrenza.

Non sovraccaricare il contratto attuale del cronoprogramma con campi che il lettore non conserva. Usare uno schema scenario distinto e un adattatore verso il piano esistente; il cronoprogramma confermato resta intatto finché non si approva la sostituzione. Conservare le baseline precedenti e i consuntivi reali.

## 10. Ruolo dell'AI e previsione basata sullo storico

L'LLM interpreta la richiesta, recupera la memoria pertinente, propone fasi e ipotesi, domanda i dati mancanti e spiega il risultato. Il motore validato calcola ore, calendari, dipendenze, costi e confronto delle alternative. Non affidare l'aritmetica decisiva al testo libero del modello.

Per i dati mancanti offrire una simulazione preliminare con ipotesi modificabili, senza interrogatorio infinito. Il motore deve però distinguere ciò che può stimare da ciò che non può confermare: nessuna competenza disponibile, consegna reale, regola contrattuale o misura nascosta inventata.

In una fase successiva confrontare ore e quantità approvate di lavorazioni comparabili, con contesto di accesso, trasferte, materiali, squadra e difficoltà. Usare il lavoro residuo e i problemi confermati per aggiornare la previsione, senza cambiare ciò che è già stato eseguito. Dati incompleti o non confrontabili non diventano una produttività aziendale di riferimento.

Prevedere un campione di verifica separato e misurare errore sulle durate e copertura degli intervalli. Mostrare probabilità come P50/P80 solo dopo calibrazione verificata e spiegabile; prima usare «intervallo di scenario», non «80% di certezza». Considerare cause comuni di ritardo: meteo, accessi e forniture possono colpire più fasi insieme. Non attribuire automaticamente ritardi a una persona e non ricavare punteggi dalle assenze.

## 11. Prestazioni e comportamento in errore

- Calcoli puri separati dall'interfaccia; ricalcolo solo dei dati cambiati, cancellazione delle richieste precedenti e lavoro pesante fuori dal thread della chat.
- Nessuna chiamata LLM per spostare una data, modificare un tempo di viaggio già noto o aggiornare un totale deterministico.
- Caricare calendari e dati solo per l'intervallo e le risorse coinvolte; niente lettura di tutto lo storico aziendale all'apertura della chat.
- Iniziare con un numero limitato di scenari e limiti espliciti del problema. Per problemi grandi offrire elaborazione progressiva, tempo massimo e migliore soluzione trovata, senza dichiarare impossibilità quando scade la ricerca.
- Percorsi manuali disponibili anche senza mappe. Eventuali percorsi remoti hanno fonte, ora del controllo, scadenza della cache e informativa sull'invio degli indirizzi; nessun tracciamento GPS continuo implicito.
- Se AI, mappe o fornitori non rispondono, conservare la bozza e l'ultimo scenario distinguendolo come precedente; non sostituire dati mancanti con zero.
- Misurare tempi e memoria prima/dopo sugli stessi casi. Obiettivi iniziali da verificare: ricalcoli piccoli entro 200 ms sul dispositivo di prova, nessun blocco visibile della scrittura; scenari complessi annullabili. Non sono prestazioni già ottenute.

## 12. Casistiche di collaudo

| Caso | Risultato da verificare |
| --- | --- |
| Partenza dalla sede alle 8 oppure presenza in cantiere alle 8 | Capacità diversa solo secondo la finestra esplicita; nessuna regola paghe presunta |
| Tre passeggeri e un mezzo, più mezzi o partenze differenti | Distinzione ore-persona/km-mezzo; nessuna duplicazione |
| Andata 45 minuti, ritorno 75, carico e pause già registrati | Somma coerente degli intervalli; niente doppia sottrazione |
| Viaggio che assorbe tutta la disponibilità | Capacità nulla segnalata; nessuna divisione per zero o durata fittizia |
| Un mese con festività, sabati non lavorati e disponibilità parziali | Giorni realmente utilizzabili; verifica delle date e dei confini di giornata |
| Squadra e membri assegnati anche singolarmente | Persone contate una volta; conflitto con altre commesse visibile |
| Bagno piccolo con quattro persone proposte | Limite del fronte di lavoro e interferenze; nessuna accelerazione lineare automatica |
| Serramenti su misura con consegna oltre la scadenza | Blocco fornitura spiegato; più muratori non risolvono il problema |
| Fotovoltaico o tetto con meteo/accessi/mezzo di sollevamento | Vincoli dichiarati e scenari condizionali; niente previsione meteo inventata |
| Nuova costruzione con tempi tecnici e controlli | Attese rispettate; compressione non autorizzata rifiutata |
| Appalto pubblico o opere specialistiche | Documenti e vincoli specifici da verificare; nessuna dichiarazione automatica di conformità |
| Consegna parziale, ordine non confermato o data limite passata | Livello di attendibilità e azioni necessarie espliciti |
| Carico enorme e termine matematicamente incompatibile | Limite inferiore spiegato; non risolvere riducendo ore o eliminando fasi |
| Tariffa comprensiva di viaggio/subappalto tutto incluso | Nessun secondo costo; scelta della fonte tracciata |
| Cambio quantità, esclusione o calendario dopo il calcolo | Scenario obsoleto, conferma disabilitata fino al ricalcolo |
| Più richieste rapide, rete assente, timeout, modello non disponibile | Chat utilizzabile, ultima bozza preservata, risultato tardivo ignorato |
| Feature disattivata, preventivo classico e moduli, IVA mista e sconti | Stesse voci, totali e template di prima, nessuna regressione |
| Planimetria illeggibile o visione remota non disponibile | Nessuna geometria o quantità inventata; prosecuzione con dati dichiarati |

## 13. Piano operativo incrementale

| Passo | Consegna | Criterio per procedere |
| --- | --- | --- |
| 0. Proteggere la base | Fixture delle bozze attuali, contratti dei dati e test di non modifica | Preventivi e template identici con funzione spenta; nessuna scrittura online |
| 1. Trasferte e capacità | Dati in chat, tre scenari manuali, ore e km separati, spiegazione dei calcoli | Casi numerici e calendario verificati; costo sconosciuto non trasformato in zero |
| 2. Risorse per fase | Competenze, disponibilità, mezzi e vincoli di spazio | Nessuna sovrapposizione impossibile; incremento persone non lineare nei casi vincolati |
| 3. Consegne | Forniture collegate alle fasi, calendari di lead time e date limite | Ritardo propagato correttamente; nessun ordine inviato |
| 4. Scadenza obiettivo | Pianificazione a ritroso e confronto delle alternative | Risultato riproducibile, vincoli visibili, fallimento/timeout distinti da impossibilità |
| 5. Applicazione controllata | Riepilogo delle differenze e conferma distinta per piano ed economia | Revisione verificata, storico preservato, rollback della feature senza perdita di dati |
| 6. Storico e previsione | Confronto previsto/reale, produttività contestualizzata e intervalli calibrati | Dati sufficienti, verifica su casi separati e miglioramento misurato sul riferimento |

Per ogni passo: test unitari dei calcoli, test delle combinazioni e invarianti, integrazione con la chat, prova visuale desktop/mobile e confronto prestazionale. Annotare prove superate e limiti rimasti, senza chiamare «testato» un comportamento solo progettato. Non mettere in produzione l'intero piano in un unico rilascio.

La prima implementazione consigliata è il passo 1: dà un beneficio leggibile e prepara la capacità reale senza sostituire il cronoprogramma. Il passo 4 dipende da 1–3: la sola richiesta all'LLM non basta per sapere quante risorse servono davvero.

## 14. Applicazione al bilocale già simulato

La [verifica locale del bilocale](../work/preventivatore-ai-20261022/verifica-bilocale-pianta.json) contiene una proposta indicativa di 38.600 euro netti, IVA da definire, e un programma non confermato di 16 fasi con intervallo 68–169 giorni di calendario, inclusa un'ipotesi di approvvigionamento di 20–60 giorni. Non sono durate misurate né un'offerta dei fornitori.

Non correggere quel programma imponendo «30 giorni» o ricavando ore dal totale economico. Duplicare soltanto lo scenario di pianificazione, mantenendo la bozza originale, poi raccogliere:

1. Avvio e data desiderata di consegna, con eventuali accessi limitati.
2. Origine squadra, viaggio per tratta e riferimento delle ore 8.
3. Competenze disponibili e ore di lavoro per fase, oppure produttività dichiarate da validare.
4. Finestre effettive di idraulico, elettricista, posatori e altre risorse necessarie.
5. Disponibilità/consegna di serramenti, porte, sanitari e finiture; prerequisiti d'ordine.
6. Tempi tecnici applicabili e condizioni ancora da verificare sul posto.

Separare «tempo da oggi all'apertura», «lavori in cantiere» e «tempo fino alla consegna». Confrontare il piano attuale, una squadra specialistica e un'organizzazione con fasi indipendenti parallele. Se i dati non bastano, proporre ipotesi riconoscibili per una simulazione, non trasformarle in impegni reali. Non dichiarare risolto il precedente errore della visione remota: la pianificazione deve funzionare anche con misure dichiarate e OCR da confermare.

## 15. Condizione di accettazione complessiva

L'utente deve capire **che cosa serve, entro quando, con quali ipotesi e con quale impatto economico**. Deve poter cambiare una condizione e vedere la differenza senza perdere il preventivo, senza duplicare costi e senza ricevere una promessa non dimostrata. In assenza di conferma esplicita, nessun risultato della simulazione modifica il lavoro operativo.

## 16. Primo incremento locale disponibile

Nella chat di Demo Azienda 2, scrivere «Mostra scenari di cantiere» oppure usare **Strumenti → Trasferte, risorse e scadenze**. La scheda vive dentro la conversazione: nessuna nuova tab, nessun secondo preventivatore. La simulazione rimane separata da prezzi, IVA e cronoprogramma precedenti.

Il [motore locale](../src/lib/preventivi/quotePlanningScenario.ts) gestisce finestre sede/cantiere, andata e ritorno distinti, pause e preparazione, persone con competenze e indisponibilità, capacità parziali per data, fasi dipendenti, attese solari, limiti di squadra e persone presenti, forniture collegate alle fasi, calendari di approvvigionamento e disponibilità dichiarate. Confronta la base con una e due persone aggiuntive ipotetiche. Calcola costi di lavoro, viaggio, mezzi e altri costi giornalieri soltanto sulle basi esplicite; i componenti mancanti impediscono un totale completo.

Le voci incluse possono essere copiate come bozza di fasi, non come programma operativo approvato. Le ore vengono dai costi locali pertinenti se disponibili, altrimenti restano mancanti; non sono ricavate dai prezzi. La sequenza iniziale è seriale e le competenze generiche vanno riviste. La copia non modifica le righe originali e non sostituisce il precedente cronoprogramma.

Il confronto parte con un pulsante, non a ogni tasto. Le modifiche ancora incomplete, un errore o un ambito cambiato sospendono il risultato. La memoria dello scenario è locale e separata dalle copie backend, con chiave proprietario/azienda/sessione, validazione e controllo della copia precedente prima del salvataggio. I normali messaggi di chat continuano a seguire le impostazioni di memoria già scelte; gli input e gli oggetti dello scenario non vengono aggiunti al contesto LLM né al preventivo salvato.

La chat comprende comandi dichiarativi mirati come «Siamo 4 persone», «Carico: 360 ore-persona», «Andata: 45 minuti; ritorno: 75 minuti», «Scadenza: 2026-11-27» e «Partiamo dalla sede». Domande, alternative ambigue e dati non validi non diventano modifiche. La comprensione libera di qualunque frase da parte dell'LLM e l'accesso automatico ai calendari aziendali non fanno parte di questo incremento.

L'esempio da 360 ore-persona si carica solo con una scelta esplicita ed è etichettato sintetico: non è il carico del bilocale. Con tre persone, 480 minuti dopo le pause e 60 minuti per tratta dentro la finestra, produce 18 ore-persona al giorno e 20 giorni attivi; le alternative a quattro e cinque persone producono rispettivamente 15 e 12 giorni, in assenza di altri vincoli. Le tariffe sconosciute restano sconosciute.

### Limiti del calcolo attuale

Il pianificatore è una simulazione giornaliera con priorità nell'ordine delle fasi, limitata a 64 fasi, 32 persone e 366 giorni. Non è un ottimizzatore globale: i successori iniziano in una data successiva e non viene dimostrata la contemporaneità delle squadre all'interno della giornata. «Non completato nell'orizzonte» non significa impossibilità assoluta.

Le date a ritroso conservano le durate del piano calcolato e le dipendenze: mostrano avvii e ordini richiesti dall'obiettivo, ma non riverificano la disponibilità delle risorse nelle date spostate. Non sono una prova di fattibilità, un ordine o una promessa del fornitore. Il confronto in avanti resta la verifica dello scenario inserito.

Restano successivi: calcolo dei percorsi/traffico, più cantieri e mezzi con itinerari distinti, prenotazioni e disponibilità aziendali reali, capacità simultanea di attrezzature, subappalti con calendari dedicati, gestione paghe, ottimizzazione avanzata e apprendimento dai consuntivi. Nessuna di queste funzioni è dichiarata attiva dalla prima scheda locale.
