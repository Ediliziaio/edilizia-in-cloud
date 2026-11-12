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
