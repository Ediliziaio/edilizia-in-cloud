# Tesoreria: unico flusso Distyra — 12 novembre 2026

## Problema e comportamento finale
Il pulsante generale Sincronizza chiamava ancora Salt Edge; la scheda Connessioni interrogava lo stato della vecchia beta e conteneva ulteriori azioni del connettore dismesso. Ora collegamento, verifica, aggiornamento singolo, aggiornamento generale e disconnessione passano solo da Distyra. Rimossi dal frontend client, ritorno e dialoghi Salt Edge; nessun dato bancario storico è stato cancellato.

## Flusso e controlli
Il pulsante generale legge i collegamenti Distyra dell'azienda selezionata ed esegue lo stesso flusso del pulsante della singola banca, in sequenza. Conferma i conti quando l'utente ha i permessi, poi importa i movimenti. Un errore non ferma gli altri collegamenti. Conti registrati e movimenti rinviati vengono distinti: nessun successo «zero movimenti» inventato. Le cache e i pannelli vengono aggiornati anche dopo un recupero parziale. Connessioni accessibili anche dal telefono.

## Verifica reale autorizzata
Nella prova sui collegamenti già esistenti di Impresa Vulcano, senza creare nuovi consensi o disporre pagamenti, BCC è passata a linked e ha restituito sei conti autorizzati; BPER è passata a linked e ne ha restituiti due. Le registrazioni sono state confermate nel database. Lo scarico dei movimenti, richiesto da superadmin, è stato rinviato dal provider con bank_fetch_limit_reached (HTTP 429). Non è stata dichiarata un'importazione di movimenti riuscita. Per una prova in presenza del titolare serve l'azione dal suo account; non si dichiara presenza del titolare dal contesto superadmin.

Non risulta configurato un cron di sincronizzazione Distyra: l'importazione parte al ritorno dal consenso e su aggiornamento manuale. Il cron bancario esistente riguarda la riconciliazione, non lo scarico periodico. Corretta l'etichetta che prometteva un aggiornamento automatico senza distinguere questi casi.

## Verifiche locali
39 test mirati superati su sette file: sincronizzazione generale con tre collegamenti, errori parziali, conti salvati con movimenti in attesa, assenza di connessioni, permessi, accesso mobile alle connessioni, assenza di chiamate Salt Edge dal frontend, isolamento aziendale e gestione saldi.

## Scelta dei conti e due aggiornamenti automatici

Su richiesta del titolare: Impresa Vulcano ha limite 3, zero preselezioni. I conti autorizzati restano disponibili per la scelta del cliente. `bank_select_accounts` salva la selezione sotto lock dell'impostazione aziendale, controlla ogni conto/azienda/consenso e aggiorna l'operatività. `bank_set_account_limit` è riservata al superadmin; non seleziona conti. Nessuna scrittura diretta alle due tabelle dal browser. Il trigger protegge anche il refresh metadata/upsert Distyra.

`bank_sync_enqueue` prepara al massimo un giro per collegamento e slot italiano 07/18, usando solo banche con conti scelti. Secret dal Vault, 15 secondi di attesa pg_net, gestore con risposta rapida e lavoro in background. Il job orario sarà acceso soltanto dopo il deploy della funzione. Esiti completato/fallito persistenti e leggibili nella scelta conti; un 429 non diventa un falso successo. Il job non effettua riconciliazioni o pagamenti.

Verifiche: selezione 0/3, quarto conto bloccato, limite riservato, conti di altra azienda/duplicati, refresh/upsert non riattiva esclusi, orari inverno/estate, slot idempotenti, importazione reale del gestore con banca simulata e PostgreSQL locale, 429 persistente, cron senza secret respinto. Nessuna nuova chiamata ai movimenti reali durante il blocco banca.

Conti e Connessioni sono unificati in Conti e banche; i vecchi indirizzi restano compatibili. Riconciliazione è adiacente a Transazioni e disponibile anche da telefono. `last_sync_at` viene aggiornato solo dopo l’importazione movimenti, non dal recupero dei metadati. Per Vulcano è stato corretto il timestamp precedente soltanto sui collegamenti senza alcun movimento importato.

Ogni giro automatico aggiorna saldi e un’unica finestra movimenti (con sette giorni di recupero): due chiamate ordinarie per giro, quattro nelle due fasce. Il recupero non riacquista l’arricchimento storico e conserva quello già presente. Eventuali pagine aggiuntive e letture manuali restano soggette ai limiti effettivi del fornitore.
