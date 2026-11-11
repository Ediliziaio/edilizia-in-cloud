# Piano automazioni, design e UX — 11 novembre 2026

## Perimetro ed evidenza

Inventario in sola lettura del builder Squadd: **115 voci trigger e 175 voci azione** (175 righe: Google Sheets espone sette operazioni con lo stesso ID). Confronto con il catalogo sorgente EIC: **76 trigger (66 azienda, 10 piattaforma), 39 azioni (30 azienda, 9 piattaforma), 4 condizioni**. Le voci di piattaforma non vanno esposte nell’azienda.

Il censimento copre tutte le voci dei due cataloghi visibili, i comandi del builder e la pagina impostazioni. Non equivale a un collaudo di tutte le opzioni annidate di 290 nodi né di tutti i moduli del prodotto Squadd. I casi dei flussi migrati già migrati si basano anche sui grafi e sulle configurazioni raccolte il 10 novembre. La presenza in un catalogo non prova da sola che il runtime o gli account esterni siano operativi.

La matrice JSON allegata contiene una riga per ogni voce; “parziale” indica una differenza di semantica, “collegamento” un servizio esterno necessario, “mancante” una vera capacità da progettare. Un webhook generico NON viene contato come un’integrazione già realizzata.

## P0 — correzioni da rilasciare in questo intervento

1. Eliminazione ultimo trigger da pannello e tastiera: ripristino immediato della scheda di ingresso. Il nuovo trigger riprende tutte le radici operative esistenti; nessun collegamento diretto a Fine se ci sono azioni.
2. Persistenza dei collegamenti del trigger ricreato, con UUID reali: salvataggio e riapertura devono mantenere il percorso.
3. Annulla/ripeti: rimozione di schede provvisorie quando torna un trigger reale; non resuscitare collegamenti reali rimossi dalla cronologia.
4. Eliminazione di un passo lineare: mantenere label/handle del ramo Sì/No/A…E. Eliminando una biforcazione non creare un’esecuzione parallela di tutti i rami: avvertire e richiedere il ricollegamento esplicito nel canvas.
5. Simulazione: distinguere assegnatario noto vuoto da campo non caricato. Un dato assente produce “non verificabile”, non una decisione inventata.

## P1 — design e UX da rilasciare in questo intervento

- Scheda trigger utilizzabile con tastiera e pulsante trigger parallelo sempre visibile.
- Ricerca passi per nome, tipo e ID con centratura del nodo e apertura della sua configurazione.
- Scheda Condizioni realmente limitata alla logica; ricerca del catalogo etichettata e azzerata passando da azioni a trigger.
- Categorie aziendali future raggiungibili senza modificare una seconda lista; isolamento delle voci di piattaforma mantenuto.
- Pannello Statistiche con conteggi reali degli stati delle iscrizioni, errori e stato vuoto espliciti, aggiornamento manuale. Conteggi esatti sul server, non una pagina limitata di record.

## P2 — vere differenze residue, da sviluppare per parità estesa

Queste attività NON risultano implementate da questo rilascio frontend e non vanno presentate come semplici account da collegare:

1. Azione note contatto generica, trigger nota aggiunta/modificata e trigger opportunità aggiornata. dei flussi migrati possiede la compatibilità dei nodi note migrati, non un catalogo generico equivalente.
2. Webhook in ingresso autenticato: segreto per endpoint, payload/versioni, mapping campi, deduplica evento, verifica isolamento azienda, retry e registro. I webhook in uscita non bastano.
3. Attesa evento con unità minuti/ore/giorni, due rami espliciti “risposta” e “tempo scaduto”, anteprima della scadenza e gestione risposta multicanale. Le 12 ore dei flussi migrati sono già un’eccezione del motore migrato; il campo nativo resta in giorni.
4. Drip a lotti generico distinto da sequenza messaggi; code atomiche, prenotazione slot e ripartenza idempotente. Il comportamento dei flussi migrati migrato non costituisce un editor generico.
5. Calendari di squadra: pool, priorità, assegnazione round-robin, indisponibilità esterne, buffer, videoconferenza e link pubblico. I calendari esistenti sono basati sul proprietario.
6. Creazione/ricerca/unione contatti e opportunità, rimozione responsabile, follower, DND per canale, oggetti personalizzati e associazioni: schema, permessi e test dedicati prima di esporre pulsanti.
7. Ricerca e sostituzione di valori con anteprima delle differenze e annullamento atomico; oggi si introduce la ricerca dei passi, non la sostituzione globale.
8. Connettori dedicati Sheets, Slack, Ads/CAPI, social messaging, corsi/community/affiliati/IVR. Ognuno richiede API, credenziali, gestione eventi, quote e collaudo. Non attivare servizi a pagamento senza richiesta.
9. Commenti collaborativi, statistiche conversione per ramo e metriche dei messaggi, confronto versioni. Le note e i conteggi iscrizioni non sono l’intera collaborazione/analytics Squadd.

Ordine suggerito dopo P0/P1: note e ingressi → attese e lotti → calendari team → connettori effettivamente necessari. Ogni voce P2 deve avere prova di evento → nodo → record/messaggio e prova di retry senza duplicati.

## Impostazioni confrontate

| Squadd | EIC | Differenza |
|---|---|---|
| Consenti rientro | Presente | Verificare rientro per record evento e non solo contatto |
| Più opportunità | Parziale | Squadd descrive esecuzioni separate per opportunità; EIC descrive anche politica di upsert e pipeline: non chiamarle equivalenti |
| Interrompi alla risposta | Presente | Da collaudare dopo connessione dei canali |
| Fuso orario | Presente | Europa/Roma, verificare cambio ora |
| Finestra temporale | Presente | Opzioni weekend EIC; verificare confini e risveglio delle attese |
| Nome/email mittente | Presente | Account o dominio verificato richiesto |
| Numero SMS predefinito | Non equivalente | Provider e numero SMS da collegare |
| Segna conversazione come letta | Mancante come impostazione del flusso | Non confondere con visualizzazione inbox |

## Collegamenti lasciati al titolare

- **Email:** autorizzare la casella da usare e/o verificare dominio/mittente; configurare DNS se richiesti, ricezione e reply-to. Inviare e rispondere a un messaggio di collaudo solo dopo autorizzazione.
- **WhatsApp:** collegare Business Manager/WABA e numero reale, completare verifiche Meta, approvare i modelli proposti e mappare variabili/media. Il modulo WhatsApp non è abilitato dall’attuale piano: non è stato attivato alcun acquisto.
- **Meta Lead Ads:** autorizzare pagina e moduli originali e verificare ricezione lead.
- **Calendari:** ciascun venditore collega il suo Google/Microsoft e la videoconferenza. Questo non risolve da solo il pool round-robin mancante.
- **Servizi esterni:** fornire gli URL/servizi esterni e le relative autorizzazioni; mai riutilizzare endpoint dell’amico.
- **SMS/telefonia/AI:** account, numeri, crediti e consensi soltanto se desiderati; nessun servizio a pagamento attivato.

Le automazioni dei flussi migrati restano in bozza; nessuna iscrizione o invio reale è richiesto da questo collaudo. Squadd resta invariato.
