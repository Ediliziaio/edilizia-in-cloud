# Revisione 8 · Lotti 3–6

Prove del 20 novembre 2026 nel worktree locale della Revisione 8. PostgreSQL temporaneo con dati sintetici, React con API simulate e funzioni Deno controllate separatamente. I casi sotto includono 25 correzioni e due comportamenti già funzionanti nel perimetro provato.

## Dati, acquisti e contabilità

| Scheda | Prima | Dopo |
| --- | --- | --- |
| EIC036 | L’export pre-cancellazione usava un formato che il ripristino respingeva. | L’export viene costruito dal catalogo e conservato con un percorso nuovo. Il ripristino ha recuperato una fattura e la sua riga figlia. Se l’export manca o fallisce, la cancellazione si ferma. |
| EIC037 | La purga eliminava un’azienda appena ripristinata da una seconda connessione. | La purga salta la riga in corso di ripristino e le copie pregresse prive del nuovo formato. La fixture ha confermato la cancellazione della sola azienda ammissibile e la protezione della copia associata dalla scadenza. |
| EIC007 | Una spesa in contanti da 10 € chiudeva una commissione bancaria distinta da 10 €. | La commissione genera il suo costo. Un bonifico con abbinamento ambiguo resta aperto, mentre i successivi movimenti riconciliabili proseguono. |
| EIC049 | Il SAL da 1.100 € con oneri già inclusi restituiva 1.200 €. | Maturato 1.100 €. Residuo 700 € dopo fattura da 400 €, zero dopo fatturazione integrale. |
| EIC054 | Il progressivo manuale della serie note di credito usava il formato standard. | Con il formato personalizzato il test restituisce `NC/4` per la serie separata e `FT/6` per la condivisa. |
| EIC020 | Due connessioni confermavano la stessa matricola per due commesse. | La scrittura condizionata allo stato disponibile dà una sola conferma. La seconda riceve l’esito di matricola già occupata e può rileggere l’assegnazione. |
| EIC032 | Nella riga ordine si poteva scrivere la quantità ricevuta senza passare dalla ricezione. | Ricevuto 4 e residuo 6 sono consultabili e la colonna porta alla sezione DDT. Passano le prove SQL sulla riconciliazione delle ricezioni. Le scritture dirette fuori dall’interfaccia restano da esaminare. |
| EIC084 | Una seconda registrazione con un nuovo ID portava la spesa da 100 € a 200 €. | Se la risposta si perde, il modulo riutilizza l’identità. Il test client e il trigger PostgreSQL confermano una riga e 100 €. Il nuovo tentativo è protetto finché resta aperto lo stesso modulo. |
| EIC086 | La rinomina con lettura precedente poteva riportare un saldo di 120 € a 100 €. | La rinomina lascia 120 €. Apertura a 150 € e registrazione di 20 € danno 170 € in entrambi gli ordini. Due movimenti concorrenti da 20 e 30 € su un’apertura di 100 € danno 150 €. |

## Documenti, cantiere e personale

| Scheda | Prima | Dopo |
| --- | --- | --- |
| EIC008 | Il percorso mancante sul preventivo permetteva di proseguire con una nuova copia. | Il file firmato viene recuperato dalla richiesta di firma. Se lo stato o il file sono indisponibili, la generazione si ferma. I PDF ordinari hanno percorsi distinti e aggiornano solo la versione letta. |
| EIC034 | Il rinnovo poteva sostituire una riga cambiata durante il caricamento. | La scrittura confronta azienda, data di aggiornamento e percorso del file. Una modifica concorrente conserva l’originale. Con risposta ambigua restano entrambe le copie per salvaguardare il riferimento. |
| EIC035 | Il file del personale poteva essere rimosso prima che il database confermasse la cancellazione. | Il file resta se la riga è negata o assente. Dopo conferma si prova a rimuoverlo e viene segnalata l’eventuale mancata pulizia. |
| EIC064 | Il 31 gennaio più tre mesi produceva il 1º maggio. | Risulta 30 aprile. Passano anche febbraio bisestile e passaggio d’anno. |
| EIC065 | Le operazioni sui documenti potevano lasciare il conteggio scadenze in cache. | Le mutazioni invalidano sia elenco sia conteggio per l’azienda interessata. |
| EIC017 | L’avanzamento da solo lasciava disattivi la bozza e l’avviso di uscita. | Lo spostamento della percentuale attiva entrambi i percorsi. La prova esegue i predicati effettivi a form vuoto. |
| EIC055 | Annulla nella pagina personale poteva sovrascrivere un’approvazione concorrente. | Due connessioni confermano che l’approvazione resta. Una propria richiesta in attesa si può ancora annullare. Entrambe le viste personali aggiornano lo stato mostrato senza segnalare successo fittizio. |
| EIC071 | Due foto omonime potevano usare lo stesso percorso. La coda accettava qualsiasi file esistente con quel percorso. | UUID distinti anche nello stesso millisecondo. Un nuovo tentativo riusa lo stesso ID. Se al percorso c’è un file diverso, la coda conserva la foto locale. |

## Ufficio e servizi

| Scheda | Prima | Dopo |
| --- | --- | --- |
| EIC051 | «Crea e aggiorna» saltava i contatti nuovi. | Con un file misto verifica e aggiorna il contatto esistente e crea quello nuovo. Una ricerca fallita ferma le scritture. |
| EIC062 | Una lettura appena fallita rendeva modificabili i valori predefiniti. | Le impostazioni restano ferme, compare «Riprova» e la successiva lettura riparte dai valori salvati. |
| EIC067 | La scheda cliente poteva dichiarare pronto un PDF con ordini mancanti. | Legge tutte le pagine di commesse. La prova valida l’ultima e blocca la stampa se fallisce la prima o l’ultima. |
| EIC069 | Dopo il cambio di filtro, una selezione invisibile poteva alimentare le azioni di massa. | Contano gli ID visibili. La prova con due filtri di pari dimensione seleziona le due righe corrette. |
| EIC021 | Un errore prima del claim poteva cambiare lo stato della sessione posseduta da un altro worker. | Solo il worker con la presa in carico vigente può chiudere o stornare. Il test SQL verifica il subentro, il rifiuto del tentativo precedente e un solo addebito su due richieste uguali. |
| EIC022 | Dopo un upload riuscito il risultato poteva essere dichiarato completo anche con scrittura respinta. | Il worker controlla la riga confermata. Errore e rimborso sono coordinati in PostgreSQL. Una risposta persa dopo il completamento conserva il risultato e l’addebito. |
| EIC012 | Un timeout nella lettura del nodo chiudeva il passo come fallito. | La prima lettura in timeout rinvia il passo. La seconda lettura valida esegue l’azione una volta. Un nodo assente termina la run con errore. |
| EIC024 | HTTP 500 nella cancellazione dell’evento rimuoveva il riferimento locale e chiudeva la coda. | HTTP 500 mantiene il riferimento e il lavoro in coda con errore. HTTP 204, 404 e 410 consentono la rimozione del riferimento. |

## Casi già funzionanti nella prova precedente

- **EIC052** · La prova di anteprima con Excel numerico e CSV con virgola mantiene 12,50 € unitari e 25 € per due unità. Resta il collaudo con importazione e movimento persistiti.
- **EIC058** · Il trasferimento V3 sposta la matricola e la garanzia insieme alla giacenza. Resta da verificare quale percorso è attivo nel gestionale di collaudo.

## Collaudo ancora necessario

- Ripristinare una copia rappresentativa su Storage isolato e verificare anche gli allegati referenziati. Il collaudo di catalogo ha verificato il recupero delle righe. Le copie legacy incomplete restano protette dalla purga. Se la dimensione supera il limite del formato consentito, il tentativo di cancellazione si ferma.
- Verificare il replay completo delle migrazioni e i flussi con utenti autenticati, due aziende e permessi reali. Per EIC032 completare la verifica dei punti di scrittura esterni alla tabella del gestionale. Per EIC055 ripetere calendario, saldo, approvazione e revoca dopo il replay.
- Simulare in un’unica sessione il provider, la rete e Storage per i render, le foto, firme e DDT. Un errore di risposta dopo upload può lasciare un file non collegato quando il risultato è incerto. I test mantengono il riferimento precedente e lasciano la rimozione di questi file a una riconciliazione successiva.

## Verifica finale locale

- 487 test mirati passati in 34 suite, comprendendo i lotti precedenti e i casi di regressione aggiunti.
- Build Vite di produzione completata in una directory temporanea con configurazione backend locale fittizia. TypeScript superato sui file frontend interessati. Deno superato per preventivi, gestione aziende, render stanza, sincronizzazione Google e motore automazioni.
- Gli 8 errori ESLint rilevati nelle viste interessate erano già presenti sulla baseline, con gli stessi conteggi e regole. Le prove PostgreSQL hanno usato schemi circoscritti. Il replay integrale e il collaudo autenticato rimangono aperti.
- A fine verifica il riferimento locale `origin/main` era a `9cddba05e`, quattro commit oltre la baseline. Il confronto per percorso dà zero file in comune con le modifiche locali. L’allineamento e le verifiche di integrazione restano da fare sul nuovo riferimento.
