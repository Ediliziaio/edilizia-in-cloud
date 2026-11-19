# Eliminazione della prima nota e aggiornamenti tra utenti

Il problema segnalato da Urban aveva due cause comuni alle aziende. La prima
nota escludeva dalla cancellazione tutti i movimenti automatici, compresi i
pagamenti dei costi. Il bridge finanziario notificava soltanto le altre schede
dello stesso browser: le modifiche di un collega o di un'importazione restavano
in cache. Il recupero delle fonti mancanti nello scadenzario era già nella PR 150.

## Eliminare la registrazione scelta

Un amministratore può eliminare un pagamento del costo dalla riga, dalla
selezione o dal dettaglio mobile. La conferma spiega gli effetti. La RPC
`prima_nota_elimina_registrazione(id, versione)` controlla permessi e versione,
blocca costo e movimenti e ricalcola il saldo sui pagamenti rimasti. L'ultimo
pagamento eliminato riapre il costo e le relative scadenze; una rata singola e la
fattura ricevuta seguono i trigger canonici esistenti.

Eliminare un originale già stornato rimuove anche la sua contropartita.
Eliminare soltanto lo storno ripristina l'effetto dell'originale, se compatibile
con il costo. La selezione di entrambi non ripete l'operazione. Una copia di
audit conserva i dati e impedisce a una vecchia richiesta ritentata di ricreare
il pagamento cancellato. Le cancellazioni manuali e gli incassi delle fatture
importate mantengono il loro percorso di allineamento.

I collegamenti a banca, SAL, documenti fiscali nativi e incassi delle unità
richiedono la correzione dalla fonte. Con più rate chiuse senza un riferimento
univoco al pagamento, la funzione chiede di riaprire prima la rata corretta:
non sceglie una rata arbitrariamente. I pagati storici non documentati dalla
prima nota restano protetti.

## Ricevere i cambiamenti di altri utenti e importazioni

Quindici fonti finanziarie producono un solo segnale per azienda e transazione.
La pubblicazione Realtime espone soltanto `company_id`, un UUID di revisione e
la data tecnica nella tabella `finanza_revisioni`, protetta dai permessi
finanziari dell'azienda. Non espone movimenti, importi o nominativi.

Una subscription condivisa per cache e azienda raggruppa gli eventi per 300 ms.
Il frontend rilegge le query finanziarie osservate quando cambia l'impronta dei
segnali. Il controllo ogni 30 secondi e i ritorni su focus/online recuperano gli
eventi persi controllando solo l'impronta: senza modifiche non ricaricano i dati
finanziari. Schede nascoste o offline sospendono le richieste. Gli eventi
arrivati durante un caricamento vengono recuperati senza richieste sovrapposte.

## Migrazioni e verifiche

- `20290421120000_finanza_revisioni_live.sql`
- `20290421121000_prima_nota_elimina_registrazione.sql`

Entrambe applicate con MCP e riallineate nel registro prima del push.
RLS attiva, anon escluso, client senza scrittura sui segnali. Nessun rilievo
dell'advisor di sicurezza sui nuovi oggetti.

Verifiche locali: 116 test in 18 file, lint dei file coinvolti, Chromium e WebKit
a 375/768/1280/1920 px con notifiche simulate, conferma/annullamento ed
eliminazione singola. Prova sul database reale con ruolo amministratore demo:
creazione e pagamento attraverso la funzione canonica, eliminazione, costo
riaperto, audit e impronta cambiata. Tutta la prova è stata annullata con
`ROLLBACK`; nessun movimento Urban modificato. Non è stata usata una sessione
cliente Urban per un test WebSocket reale.

La ricostruzione completa dello storico non gira su questa macchina perché
Docker è assente: viene verificata dal relativo job CI, insieme a typecheck e
build. Il rilascio richiede l'esito dei controlli della PR.

La preview da zero ha inoltre rilevato un `LOCK TABLE` fuori transazione nella
migrazione storica `20290317151100`. Il file ora dichiara `BEGIN`/`COMMIT`, come
le altre migrazioni con lock; le regole SQL rimangono le stesse. Il database
principale l'aveva già applicata con MCP dentro una transazione e non viene
rieseguita. La prima ricostruzione e un push successivo della PR avevano anche
avviato due esecuzioni concorrenti sulla stessa preview: il secondo tentativo
si era fermato per versione duplicata, senza duplicati nei file.

Rollback applicativo: revert dei file frontend. Il vecchio percorso continua
a funzionare con i nuovi oggetti presenti. Se serve sospendere le notifiche,
rimuovere i quindici trigger `finanza_revisione` con una nuova migrazione;
conservare l'archivio delle cancellazioni e il blocco delle richieste ritentate.
