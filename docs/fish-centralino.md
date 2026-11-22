# Centralino Fish Audio

L’area Agenti AI include un editor Fish con procedura guidata, flussi pronti,
agenda, simulazioni, prova vocale e richiesta di collegamento del numero.
Il centralino e le schede cliente mostrano storico, trascrizioni, registrazioni
disponibili e collegamenti alle segnalazioni. Le prove con dati dimostrativi
sono distinte dal collaudo amministrativo che salva realmente un ticket.

## Configurazione del servizio

Nel backend Supabase sono richiesti `FISH_API_KEY`, `FISH_WEBHOOK_SECRET`
e `FISH_BACKEND_URL`. Non vanno nelle variabili `VITE_*` o nel browser.
Le funzioni `fish-agent-proxy`, `fish-agent-tools`, `fish-inbound` e
`fish-webhook` usano rispettivamente accesso autenticato, sessione verificata
e firme. Le migrazioni Fish del 10 novembre 2026 sono già versionate.

Il modello vocale predefinito è Drama 3. L’editor permette anche una scelta
esplicita di S2.1 Pro e usa la scelta salvata sia nelle sessioni sia nelle
anteprime audio. Voce, modello di sintesi e modello linguistico sono campi
distinti. Le prove vocali e le simulazioni consumano credito Fish.

## Prove e uso operativo

Da **Centralino → Numeri e collegamenti** scegli l’assistente Fish e apri
**Collegamento numero**. Per mantenere un numero aziendale, inserisci il
recapito internazionale. Operatore e disponibilità di SIP sono facoltativi
per inviare la richiesta di verifica.

- **Entrata via SIP**. L’operatore o il centralino instrada a Fish le chiamate
  per il numero esistente. La linea può restare presso l’operatore attuale.
- **Uscita con lo stesso numero**. Configura la terminazione SIP con un
  operatore che autorizza quel numero come identificativo chiamante.
  `supports_outbound` indica la configurazione della linea e va verificato
  con una chiamata di collaudo.
- **Deviazione**. Può mantenere il recapito pubblico per le chiamate in ingresso.
  Verifica che il numero originario del chiamante arrivi all’agente, soprattutto
  per il riconoscimento del cliente. La portabilità è un’opzione se serve
  passare a un operatore con SIP compatibile.

Con un centralino esistente, usa regole per orario o mancata risposta e
destinazioni di trasferimento che raggiungono direttamente gli operatori.
Collauda chiamata in entrata, numero presentato in uscita e trasferimento
con mancata risposta prima di spostare il traffico ordinario. Vedi
[collegamento SIP e numero esistente](https://docs.fish.audio/agents/telephony/byo-sip)
e [trasferimenti](https://docs.fish.audio/agents/telephony/transfers).

La prova vocale usa un agente web privato separato, strumenti client
dimostrativi e nessuna registrazione audio. Non chiama numeri, non trasferisce
una tratta telefonica e non modifica il CRM. Il banco del passaggio simula
il primo collega disponibile, accettazione, mancata risposta e ritorno all’AI.
Il collaudo con un cliente reale richiede invece la selezione della scheda,
verifica di nome e indirizzo e consenso prima della segnalazione di prova.

Nel flusso lead si configurano azienda, servizi, comuni e modalità
dell’appuntamento. Il server verifica il consenso nella conversazione
effettiva prima di prenotazioni, richiami e note; non si fida di un semplice
parametro del modello. Una richiesta esplicita di non essere richiamati
viene persistita sul contatto associabile e blocca nuovi tentativi e retry.
In caso di associazione ambigua il sistema richiede verifica manuale.

Il trasferimento telefonico operativo richiede linea, destinazioni approvate,
presenza dei colleghi e collaudo del carrier. Le chiamate Fish in uscita
richiedono un collegamento pubblicato e abilitato, tariffa e credito.
La pubblicazione del frontend non abilita agenti su linee o campagne.

## Verifiche

`npm run test:fish` comprende controlli di configurazione, conversazioni,
isolamento aziendale, consenso, flussi e fixture SQL eseguite con PGlite.
La CI esegue questa suite insieme ai controlli già previsti dal repository.
Per la compilazione locale usare le sole variabili pubbliche Supabase e
`npm run build:fast`. La pipeline di produzione conserva la propria build
e la prerenderizzazione delle pagine pubbliche.

## Assistenza completa e centro attività di Silvio (locale, 17 novembre 2026)

Da Centralino → **Configura l’assistenza** si apre la procedura con il flusso
**Assistenza completa · ticket e appuntamento** preselezionato. Basta scegliere
un calendario attivo; titolare, durata, disponibilità e conflitti seguono le
regole già presenti nel gestionale. Nome, saluto e operatore restano
personalizzabili. Le regole avanzate sono già incluse e restano consultabili.

Il percorso telefonico è: numero verificato della sessione → nome e indirizzo
dichiarati → memoria della pratica → conferma del ticket → creazione o nota
sulla segnalazione scelta → disponibilità agenda → nuova conferma → appuntamento.
Il consenso al ticket non vale per la prenotazione. Una scheda cambiata o
un’associazione ambigua ferma l’azione; una richiesta d’emergenza richiede una
persona. L’agente si presenta sempre come assistente virtuale.

`ai_fish_assistance` collega la sessione a un unico `silvio_task` e ai suoi tre
passi. Ticket e collegamento alla conversazione sono salvati insieme. La
prenotazione usa il servizio calendario esistente tramite una transazione che
salva anche il riferimento alla pratica e aggiorna Silvio. Un retry restituisce
l’appuntamento già salvato, con la sua data effettiva. L’appuntamento descrive
il riferimento del ticket e l’indirizzo verificato. Una cancellazione successiva
è mostrata come richiesta da verificare, senza riprenotazioni automatiche.

Il centro è raggiungibile da Centralino, dalla chat di Silvio e da
`/azienda/silvio-ai/attivita`. La stessa vista è nel centralino e nel Silvio Hub;
i link aprono scheda cliente, ticket/conversazione e calendario. Le letture
rispettano l’azienda corrente e i permessi sui ticket; la data dell’appuntamento
rispetta anche le policy del calendario. Le funzioni di scrittura sono invoker
e utilizzabili soltanto dal servizio, dopo l’autorizzazione della sessione Fish.

Per attivare il collegamento nell’ambiente destinazione servono la migrazione
`20261117165309_fish_silvio_assistance.sql` e l’aggiornamento delle funzioni Fish
che importano `fishCentralino.ts` (proxy, strumenti, webhook e inbound). Questo
lavoro è stato preparato in locale: non applicare la migrazione al progetto
condiviso durante una semplice prova grafica. La verifica `assistance_capabilities`
impedisce la creazione/sincronizzazione del nuovo flusso prima che il backend e
la tabella siano disponibili. Non acquista numeri e non pubblica una linea.

`npm run test:fish` include i casi di verifica e consenso, il blocco prima del
ticket, il cambio della scheda, il requisito calendario, il blocco del backend
non pronto e i test UI. `scripts/fish-centralino/assistance-db.test.mjs` verifica
con PostgreSQL/PGlite transazioni, retry, collegamenti, permessi e avanzamento;
il servizio calendario è sostituito da una prenotazione deterministica locale
per isolare il collegamento, mentre la sua implementazione è coperta dai test
calendario esistenti. Nessuna prova qui descritta richiede credito Fish.

L’anteprima grafica, con componenti reali e soli dati fittizi, è disponibile
nel server Vite su `/scripts/fish-centralino/assistance-preview.html`.
Non fa parte degli ingressi della build di produzione.

## Backend locale utilizzabile per il collaudo

### Numero aziendale, ufficio e richiamo

Apri **Centralino → Prova telefonia** oppure
`/scripts/fish-centralino/phone-local.html` nel server Vite. La linea fittizia
`+390000000404` passa prima all’interno 201, poi all’assistente dopo 15 secondi.
Puoi cambiare l’attesa, rispondere come operatore o simulare subito la mancata
risposta. L’assistente mantiene il numero del chiamante di test e chiede se
può richiamarlo. Dopo il consenso e la chiusura della prima chiamata, il
display del cliente mostra il numero aziendale da cui arriva il richiamo.
Disabilita **Uscita SIP abilitata** per provare l’esito con richiesta lasciata
all’ufficio. La cronologia distingue entrata, risposta, consenso e richiamo.

Il backend locale simula il collegamento e prepara il richiamo con lo stesso
formato usato dal connettore Fish. Il test opera su numeri fittizi e conserva
gli eventi in memoria durante la sessione del server. **Ascolta con Drama 3**
usa Fish soltanto per leggere la battuta dell’assistente. Le impostazioni
reali di instradamento e uscita vanno impostate sul centralino o sull’operatore
SIP e verificate con una chiamata sul numero reale.

### Bozza SIP per il numero aziendale reale

Nel collaudo telefonico, apri **Prepara SIP**, inserisci il numero aziendale
e, quando lo hai scelto, il telefono da usare per il pilota. L’host e il
trasporto di uscita si possono completare dopo la risposta dell’operatore.
La scheda prepara due risultati nel browser. **Copia testo** prepara la richiesta
di compatibilità e dati tecnici. **Scarica bozza JSON** esporta la regola del
centralino e il corpo dell’importazione in Fish, da rivedere con il tecnico.

La regola di ingresso distingue il numero chiamato dal numero del cliente.
Per il pilota, il centralino riconosce il telefono di test, fa squillare prima
l’ufficio e instrada verso Fish solo in caso di mancata risposta, prima che la
segreteria prenda la chiamata. Gli altri chiamanti seguono la regola ordinaria.
La preparazione del richiamo vincola il numero presentato alla linea aziendale
autorizzata e il destinatario al telefono di prova. La bozza lascia da
confermare autenticazione, indirizzo di uscita e autorizzazione del numero.

Il pilota effettivo richiede che il tecnico applichi il routing in una finestra
concordata e che importi la linea in un ambiente Fish dedicato, con un agente
di test abilitato a ricevere e richiamare. Verifica separatamente risposta
dell’ufficio, passaggio all’AI, identità del chiamante e numero visualizzato al
richiamo. Per chiudere il pilota riattiva la regola precedente sul centralino.

### Avvio e prova dell’assistenza

Il comando `npm run centralino:assistenza-local` avvia un servizio limitato a
`127.0.0.1:8798`. Legge solo la chiave Fish dal file privato `.env.fish.local`;
non usa credenziali Supabase o dati aziendali. Il server Vite inoltra esclusivamente `/__local-assistance` a questo
indirizzo. Per provare aprire **Centralino → Apri collaudo locale**, oppure
`/azienda/centralino/collaudo-locale`. La voce e la pagina sono abilitate solo in
sviluppo. È disponibile anche l’ingresso senza login
`/scripts/fish-centralino/assistance-local.html`, con la stessa interfaccia.

Il database PostgreSQL/PGlite è persistente nella cartella ignorata da Git
`.tmp/fish-assistance-v1`. Contiene solo Edilizia Test Locale, Mario Prova,
Giulia Collaudo, numeri fittizi e due agende di test. Il backend carica le
funzioni SQL effettive di riconoscimento, memoria della pratica, aggiornamento
segnalazioni, prenotazione atomica e collegamento a Silvio dalle migrazioni del
progetto. Le prenotazioni usano anche i candidati e gli orari del servizio
calendario reale, con tabelle e disponibilità fittizie; non una risposta positiva
precostituita. Le sincronizzazioni esterne sono sostituite da un effetto locale
vuoto passato esplicitamente agli strumenti. Il comportamento in produzione
conserva la sincronizzazione predefinita.

La conversazione di collaudo è una procedura guidata locale, senza LLM.
Verifica numero della sessione di prova, problema e urgenza, nome, indirizzo,
consenso al ticket, disponibilità e nuovo consenso alla prenotazione. Le azioni
attraversano `fishAssistanceTool`, le stesse verifiche di consenso e le medesime
transazioni SQL del flusso operativo. **Attiva voce Fish** legge le risposte
con la voce italiana Giulia e il modello `drama-3`, senza ripiegare su altri
modelli. **Registra risposta** apre il microfono solo dopo il clic, ferma
la registrazione entro 45 secondi e usa Fish `transcribe-1`. La trascrizione
viene proposta nel campo risposta: occorre controllarla e premere **Invia**.
La sola trascrizione non modifica la pratica e non costituisce consenso.
**Riascolta** riusa la risposta vocale già generata durante lo stesso avvio.
Senza chiave Fish resta disponibile la lettura locale del dispositivo.

La chiave resta sul server, nel file `.env.fish.local` escluso da Git (permessi
`600`); non va inserita nel browser o in variabili `VITE_`. Il comando di avvio
la carica senza richiedere credenziali del gestionale. Il backend inoltra solo
voce e trascrizione a `https://api.fish.audio/v1/tts` e `/v1/asr`; non crea,
modifica o pubblica agenti Fish, numeri o webhook. Fish elabora l'audio del
microfono e il testo delle risposte. La registrazione grezza non viene salvata
su disco dal server; il testo viene salvato nella conversazione solo dopo Invia.
Le richieste vocali richiedono lo stesso nonce locale delle azioni. La sintesi
accetta soltanto l'ID di una risposta dell'assistente già presente nella prova,
non testi, voci, modelli o URL arbitrari dal browser.

La schermata mostra i record salvati, la conversazione persistita nel ticket e
l’avanzamento di Silvio. **Riapri una prova salvata** permette di riprendere una
sessione dopo aver riavviato pagina o backend. **Nuovo collaudo** conserva le
prove precedenti. Gli identificatori delle richieste evitano una seconda azione
quando si ripete un invio interrotto.

I casi disponibili comprendono richiesta nuova, ticket esistente, numero assente,
numero ambiguo, calendario senza disponibilità e conflitto reale d’orario prima
della conferma. Un pericolo immediato viene lasciato a una persona, senza
prenotazione ordinaria. Le chiamate HTTP accettano soltanto le operazioni della
procedura: nessun endpoint SQL/RPC generico, nessun inoltro a URL forniti dal
client e nessun token del gestionale. Host, origine e nonce locale sono verificati.

`npm run test:assistenza-local` verifica percorso completo, conferme negative,
identità errata, ambiguità, memoria, conflitti, attesa ufficio, ripresa del database
su disco e protezioni HTTP. Nei test del runtime ogni `fetch` è bloccato, per
intercettare qualsiasi tentativo di accesso esterno. Questi controlli sono inclusi
anche nella suite Fish. Il backend prenota la porta prima di aprire il database,
così un secondo avvio sulla stessa porta non apre i file già in uso.

### Collaudo lead collegato al CRM locale

Avvia il backend con `npm run centralino:assistenza-local`, poi apri **Centralino
→ Collaudi locali → Prova lead e CRM** nel gestionale avviato con Vite sulla
porta 8086. La stessa schermata è disponibile in locale all’indirizzo
`/scripts/fish-centralino/lead-local.html`.

Scegli **appuntamento confermato** oppure **consulente assente e richiamo**.
Il collaudo usa un lead fittizio, la voce Giulia con Drama 3 e una sessione
web privata Fish. L’assenza del consulente simula uno squillo senza risposta. Prenotazioni, note e richiami passano per le funzioni del gestionale
e vengono scritti e riletti nel database locale isolato. L’agenda usa una
prenotazione atomica. Le azioni richiedono un riepilogo confermato. La nota
commerciale si salva dopo l’azione concordata. A fine prova, **Dati salvati**
mostra anche la conversazione. Le credenziali restano in `.env.fish.local`.

Nel flusso telefonico del gestionale, il collegamento parte dalla scheda del
lead associata alla chiamata in uscita. L’appuntamento è associato anche
all’opportunità se il contatto ne ha una sola aperta. In caso di richiamo,
l’attività resta collegata alla scheda verificata e riporta il recapito
concordato. Il collaudo locale esclude sincronizzazione esterna del calendario
e inoltri telefonici.

### Scheda chiamata e richiami

Dal contatto CRM, apri **Collegati → Chiamate** su mobile oppure **Chiamate**
nella colonna laterale su desktop. Il dettaglio di una chiamata Fish con
richiamo confermato si apre in **Centralino → Richiami**. Da lì si può leggere
la trascrizione e, con i permessi sulle attività, aggiornare responsabile,
stato e note. La coda mostra prima i richiami da gestire, a partire da quelli
in scadenza. **Tutti** comprende anche i richiami conclusi. Premendo **Richiama**
il softphone usa il recapito concordato nella richiesta. Dopo la telefonata,
**Segna esito** aggiunge un risultato datato e una nota facoltativa all’attività.
**Contattato** chiude il richiamo. Gli altri esiti lo lasciano da gestire.

In **Centralino → Telefono** trovi il tastierino, la disponibilità al
passaggio e i collaudi locali. **Chiamate** mostra lo storico con ricerca
e filtri.

Da **Agenti AI → Chiamate**, il Centralino si apre con lo storico filtrato per agente. I collegamenti precedenti alle chiamate o ai richiami reindirizzano alla vista corrispondente.

Il flusso lead usa una sola attività per chiamata in uscita. I tentativi
ripetuti recuperano l’attività originale. Il richiamo legge la conversazione
dallo storico chiamate. La prova locale mostra la stessa scheda trascrizione
nella cronologia CRM e nel richiamo.
