# Fiscalità: KPI operativi e verifiche leggibili

## Interventi implementati in locale

1. KPI condivisi con pulsante accessibile, indicatore di apertura e stato attivo. Le schede filtrano l’elenco, senza modificare documenti o riepiloghi del periodo.
2. Registro IVA: scelta vendite/acquisti/tutti, filtro delle verifiche aperte, gruppi per registro/aliquota/natura/esigibilità, apertura delle righe e delle fonti, azzeramento filtri. Le proiezioni RC non entrano nei totali documentali. Il conteggio per gruppo non è sommabile quando un documento ha più aliquote.
3. Prospetto preliminare: dati server presentati come elenchi etichettati, importi in euro e aliquote esplicite; valori mancanti non trasformati in zero. Confronto con i totali documentali dell’intero periodo, non con i soli risultati di ricerca. Un eventuale scostamento non genera rettifiche o F24.
4. Ritenute: ricerca per commessa/controparte, stato (comprese perse e svincolate nell’anno), data prevista raggiunta, prossimi 30 giorni, data mancante. KPI collegati ai relativi filtri, paginazione di 50 righe e somme in centesimi con importi incompleti segnalati.
5. Registro F24: KPI separati per importi registrati da pagare, registrazioni scadute e scadenze entro 30 giorni (oggi incluso). Ricerca e filtri, pannello di sola consultazione dei riferimenti registrati. Nessuna attestazione o azione automatica di pagamento.
6. Archivio: filtro origine (attive/ricevute/manuali), riferimenti XML presenti/da verificare, accesso diretto dagli indicatori agli elenchi, ricerca degli allegati manuali distinta dai documenti gestionali. Il conteggio dei riferimenti XML mancanti non afferma che il file originale non esista.
7. Date uniformate nei registri, dettagli delle fonti, svincoli e allegati. Validazione delle date impossibili e giorni civili per le scadenze, senza dipendere dall’ora di esecuzione.

## Permessi e dati

Restano attive autorizzazioni, feature gate, separazione per azienda e accessi originali. Nessuna modifica dello schema o degli stati fiscali, nessuna scrittura automatica, trasmissione, caricamento o pagamento effettuato. Nessuna nuova dipendenza.

La skill Supabase ha guidato il controllo delle fonti e degli allegati: consultati changelog e documentazione ufficiale; non introdotti URL pubblici, nuove chiavi o privilegi. L’accesso ai file continua a dipendere dai controlli già presenti.

## Verifiche

- 15 file di test: 110 test superati, 3 controlli live non eseguiti.
- Nuovi casi: confini temporali/Rome, giorni validi, scadenza oggi e +30, valori ignoti, gruppi IVA e note di credito, esclusione RC, formattazione delle fonti, confronto documentale, filtri archivio/garanzie, consultazione F24 senza salvataggi.
- Typecheck mirato: zero diagnostiche in 18 file; lint mirato senza errori. Non è dichiarato risolto il typecheck generale del repository.
- Build di produzione completata con esito positivo in una directory temporanea isolata, senza pubblicazione. Log e schermata in `output/fiscalita-kpi-20261027/`.
- Browser Demo Azienda 2: KPI svincoli, filtro delle 22 verifiche IVA, aliquote, calcolo server di sola lettura e confronto (scostamento 0 nel periodo provato), archivio e allegati manuali. Date di ricezione mancanti ancora segnalate.

## Parte che richiede dati e integrazione dedicata

Non è stato implementato un sistema di attestazione dei pagamenti o di conservazione a norma: lo schema letto non fornisce un esito documentale verificato per queste operazioni.

Prima di attivarlo occorrono:

- per F24: fonte della quietanza, identificativo/esito, data, riferimento verificato alle singole registrazioni e storico; la presenza di `pdf_url` non basta;
- per conservazione: servizio utilizzato, ricevuta/esito, identificativo del pacchetto e corrispondenza con gli originali; hash e allegato manuale non bastano;
- un flusso server tracciato e atomico con controllo dei permessi, prove isolate e conferma esplicita, senza effettuare pagamenti né trasmissioni di prova reali.

### Chiarimento dell’utente e controllo delle integrazioni esistenti

L’utente conferma che le quietanze F24 provengono dal commercialista e che l’archivio operativo deve rimanere Edilizia in Cloud. Non è richiesto spostare l’archivio o acquistare servizi.

Il codice contiene già il percorso Impostazioni fatturazione → Conservazione a norma (`FatturaElettronicaPassi`), con il campo `conservazione_ade_aderito_il`. Lo stato visualizzato è derivato dalla data di adesione inserita e dai rinnovi teorici: non è una verifica del servizio esterno o dell’esito di conservazione di ogni fattura. L’archivio manuale salva file e metadati nel bucket privato; non recupera ricevute di conservazione. Non è stata verificata l’adesione effettiva della singola azienda sul portale esterno.

Il collegamento tracciato delle quietanze del commercialista ai singoli F24 resta da implementare: non si deduce un pagamento verificato dalla sola presenza di un allegato o dalla dichiarazione dell’operatore. Analogamente l’interfaccia dell’archivio mantiene «non verificata» per la conservazione documentale, senza negare l’eventuale adesione esterna già esistente.
