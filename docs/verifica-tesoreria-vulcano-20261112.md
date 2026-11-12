# Verifica collegamento bancario — 12 novembre 2026

## Risultato e priorità
Correzione urgente del collegamento Distyra in Tesoreria. Nessun nuovo consenso bancario avviato dall'assistente; nessun dato bancario del cliente modificato durante la diagnosi.

## Baseline e causa riscontrata
Per Impresa Vulcano le connessioni BPER e BCC risultavano in errore con zero conti. I log del servizio indicavano anche il limite di quattro richieste automatiche giornaliere esaurito. Il gestore passava al database i saldi strutturati restituiti dal provider, anziché il valore numerico, e ignorava l'errore di scrittura. Il messaggio «La banca non ha dato nessun conto» poteva quindi descrivere un errore di importazione.

Riferimento primario verificato: https://www.distyra.eu/reference — elenco conti, limiti di lettura e intestazioni PSU per l'utente effettivamente sullo schermo.

## Modifiche
- Importazione dei saldi `{amount,currency}` come numeri; saldo sconosciuto conservato, mai trasformato in zero.
- Finalizzazione dai conti già autorizzati con `balances=false&allow_stored=true`, senza consumare una lettura dei saldi.
- Errori di scrittura espliciti; consenso in attesa e zero conti non vengono dichiarati riusciti.
- Sincronizzazione richiesta dal titolare presente sullo schermo: IP dal gateway e User-Agent reale, mai dati dichiarati dal corpo né un IP del server. Sincronizzazioni automatiche e richieste di altri utenti mantengono i limiti automatici.
- Errori del provider conservano stato HTTP, codice e attesa, con testo comprensibile. Collegamento riuscito e movimenti rinviati sono distinti anche nell'interfaccia, compresa la ripresa manuale.
- Chi può consultare Tesoreria continua ad aggiornare i conti esistenti senza ottenere permessi per cambiare i consensi.

## Sicurezza e dati
Verifiche azienda, utente e permessi conservate. Nessun nuovo segreto, nessuna migrazione o modifica di prezzo. Test e diagnosi non interrogano le banche reali e non consumano le richieste del cliente. Il titolare deve completare personalmente l'eventuale autenticazione richiesta dalla banca.

## Prove
39 test superati su sei file: gestore effettivo con banca simulata e PostgreSQL locale, tre conti, saldi positivi/negativi/zero/sconosciuti, idempotenza, errore di salvataggio, consenso pending, limite 429, separazione aziende e permessi, ritorno nell'app e ripresa manuale. Inclusi i controlli esistenti su Salt Edge, richieste protette e riservatezza dei saldi.

Controllo Deno della funzione: superato. Controllo TypeScript completo iniziale: zero errori; nel nuovo test dell'interfaccia aggiunta l'annotazione esplicita del ritorno nullo richiesta dal controllo CI. Compilazione frontend di produzione e generazione pagine: superate in CI. Servizio bancario versione 20 attivo in produzione, con codice pubblicato riletto e verificato.

## Limiti della verifica
La prova dimostra il salvataggio e la gestione di tre conti; non equivale a tre conti reali già collegati. La disponibilità dei conti e la conferma del consenso dipendono dalla banca. Un limite ancora attivo non richiede di creare un nuovo consenso.
