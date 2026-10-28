# Viaggi e tratte dei mezzi — 27 ottobre 2026

## Flusso per chi guida

1. Nell’app operai aprire **Il mio mezzo / I miei mezzi → Registra viaggio**. Il registro compare sui veicoli stradali con contatore in km, non sugli attrezzi.
2. In alternativa, dal rapportino segnare il proprio veicolo come usato e aprire **Registra viaggio**: la finestra resta sopra il rapportino e la commessa corrente è proposta solo se autorizzata dal server. I dati del rapportino non vengono cancellati.
3. Compilare partenza e arrivo (anche con i pulsanti «ora»), quindi una tratta per ogni tappa. La nuova tratta parte dall’arrivo della precedente. Aggiungere esplicitamente il ritorno, senza raddoppi automatici.
4. Per ciascuna tratta indicare km, eventuali minuti e destinazione: commessa, spostamento generale oppure da attribuire in ufficio. Una sosta presso un fornitore può essere descritta liberamente, collegandola alla commessa pertinente.
5. Salvare una bozza sul server o inviare all’ufficio. È possibile inviare km mancanti, stimati o ancora da attribuire, purché luoghi e intervallo del viaggio siano validi. L’ufficio non può verificarli finché le incongruenze non sono risolte.

Il viaggio appartiene a chi lo dichiara: i passeggeri non devono ricopiarlo nei propri rapportini. Il server richiede che il mezzo sia attualmente assegnato al dichiarante. Dopo una riassegnazione il precedente dichiarante conserva la lettura dei propri viaggi, ma le rettifiche passano all’ufficio.

## Flusso per l’ufficio

- Nella commessa, **Cantiere → Lavorazioni → Mezzi → Registro viaggi e tratte**, si vedono soltanto le tratte attribuite a quella commessa, senza note globali o contachilometri dell’intero giro.
- Dalla scheda del mezzo, **Viaggi e tratte**, si apre il registro completo; il collegamento dalla commessa conserva il giorno del viaggio.
- L’ufficio autorizzato seleziona il conducente effettivo, completa attribuzioni e misure, controlla contachilometri e verifica. Un viaggio verificato o annullato può essere rettificato/riaperto solo dall’ufficio, con motivo e storico.
- Le stime sede–cantiere già presenti nelle assegnazioni restano separate dal nuovo registro: non vengono sommate di nuovo ai viaggi.

Esempio verificato nei test: Sede → A 20 km; A → Fornitore 8 km; Fornitore → A 8 km; A → B 14 km; B → Sede 30 km. Totale mezzo **80 km**, commessa A **36 km**, B **44 km**. Un’eventuale tariffa onnicomprensiva di 0,50 €/km produce simulazioni di 18 € e 22 €, non registrazioni contabili.

## Misure, limiti e protezioni

- Km dichiarati, stimati dal percorso e verificati dall’ufficio sono distinti. «Non indicato» non diventa zero.
- I contachilometri sono facoltativi, ma vanno inseriti entrambi. Scarti superiori a 0,1 km, percorsi interrotti, stime residue, attribuzioni mancanti e tempi incoerenti impediscono la verifica.
- Le tratte sono da 1 a 30; l’intervallo deve essere già effettuato e non superare 48 ore. Per un mezzo non si possono sovrapporre viaggi inviati/verificati; si controlla anche la compatibilità dei contatori con i viaggi vicini.
- La stima stradale parte solo su richiesta esplicita e con coordinate note, usando il servizio già configurato. Nessun GPS o monitoraggio in background.
- Tariffe e simulazioni sono visibili solo ai permessi ufficio/costi. Non vengono creati automaticamente costi, rimborsi, presenze, straordinari, notifiche, aggiornamenti del contatore o spostamenti del mezzo.
- La compilazione di un nuovo viaggio viene conservata nel browser per azienda, utente e mezzo. Non è una coda offline sincronizzata: solo il salvataggio confermato dal server rende la bozza disponibile agli altri dispositivi. Se manca spazio locale viene mostrato un avviso. In caso di errore di rete la finestra resta aperta; riprovare dalla stessa finestra preserva anche il token della richiesta.
- Versioni e token impediscono aggiornamenti persi e doppi invii nella stessa compilazione. In caso di conflitto ricaricare il registro prima di riprendere le modifiche.
- Elenchi paginati da 50 viaggi, periodo massimo 366 giorni. Con più pagine il riepilogo dichiara esplicitamente di riferirsi alle sole righe della pagina.
- Nessuna lettura/scrittura diretta delle due tabelle dal client. Le RPC verificano azienda, identità, assegnazione, permessi e commesse autorizzate. Il trigger di archiviazione rifiuta tipi JSON impropri e scarta campi di tratta estranei allo schema.

## Verifiche eseguite e attivazione

- **135 test applicativi superati**, su 10 file: dominio, UI operaio/ufficio, ripresa bozza, cambio utente, dialogo dentro il rapportino, retry idempotente, riepiloghi e regressioni navigazione. Compresi la ricerca/selezione del conducente e la chiusura con Esc del solo menu, senza chiudere la finestra né lasciare la pagina bloccata.
- **51 controlli PostgreSQL isolati superati**, con ruoli anon/authenticated e migrazioni ripetute: isolamento aziende, permessi, concorrenza ottimistica, invii duplicati, sovrapposizioni, odometri, errori atomici, rettifiche motivate, paginazione e JSON malformato.
- Typecheck degli 11 file selezionati: zero diagnostiche. Lint dei nuovi moduli e test: zero errori/avvisi. Build di produzione e prerender delle 243 pagine verificati.
- Browser reale, Demo Azienda 2: lettura contesto e registro, apertura modulo dalla commessa, precompilazione della commessa autorizzata e menu conducenti verificati. Rimosso dal dialogo il selettore con stack Radix incompatibile e sostituito con menu ricercabile sullo stesso stack della finestra; Esc chiude prima il menu e la pagina torna cliccabile dopo la chiusura del dialogo. Nessun viaggio salvato nell’archivio condiviso per i test.
- Il ruolo operaio è coperto nei test UI/SQL isolati. Non è stata eseguita una sessione browser reale con un account operaio assegnatario; nessuna assegnazione è stata modificata per simulare l’accesso.
- Database condiviso aggiornato, dopo i test, con `20281027180500_mezzi_viaggi_multitratta.sql` e `20281027180600_mezzi_viaggi_formato_tratte.sql`. Versioni locali/remoto allineate; RLS attiva, accessi diretti negati, trigger attivo. Catalogo backup senza tabelle scoperte; nessun nuovo avviso di sicurezza rispetto al controllo precedente.
- Frontend modificato soltanto nel checkout locale: nessun commit, push, pubblicazione o invio ai clienti in questa attività.

L’impostazione Supabase ha orientato la separazione tra dati leggibili dall’operaio e dati dell’ufficio, con salvataggi atomici e autorizzazioni applicate sul server anziché affidate alla sola interfaccia.
