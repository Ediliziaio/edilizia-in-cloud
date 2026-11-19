# Integrazioni: banca, dominio email e calendari — 19 novembre 2026

Il log bancario conferma `invalid_continuation`: le richieste alle pagine successive ripetevano filtri, `resumable` e `enrich`, mentre il [client ufficiale Distyra](https://pypi.org/project/distyra/#pulling-connect-transactions) richiede solo `continuation`. La correzione conserva le righe già importate, non riavvia automaticamente scarichi a costo e non aggiorna `last_sync_at` dopo una lettura incompleta. `bank_fetch_limit_reached` resta un limite reale del fornitore, con la sua attesa; non viene aggirato e non richiede un nuovo consenso.

I tre 401 di `manage-email-domain` appartengono allo stesso amministratore multi-azienda. La funzione confrontava solo `profiles.company_id`, escludendo gli altri accessi amministrativi validi. Ora verifica l'accesso attivo, usa la RPC `aziende_amministrate` del chiamante e mantiene i permessi email per lo staff. Lo stato si consulta in sola lettura; registrazione, verifica DNS e rimozione richiedono scrittura. Un rifiuto di permessi è 403, una sessione assente 401. La pagina mostra l'errore con Riprova invece del modulo per un dominio inesistente.

Le prenotazioni pubbliche chiamavano sempre Google, Apple e Outlook. In produzione non risultano account Apple collegati: molte risposte 404 provenivano da un servizio mai configurato. La scelta ora segue il calendario agganciato, il membro prenotato di una squadra e infine le connessioni del responsabile; update/delete conservano i provider delle mappe esistenti. Tutte le letture sono limitate all'azienda. Il 404 di un provider effettivamente selezionato viene ancora segnalato: può richiedere il ricollegamento dell'account.

Carta e credito non sono bypassati. I gate esistenti bloccano gli strumenti a costo prima del provider; le verifiche periodiche continuano, così lo sblocco può essere rilevato. La PR 158 introduce un'ora di rinvio per i blocchi account, separata dagli errori tecnici. Nessuna ricarica, modifica a metodi di pagamento o nuovo collegamento bancario è parte di questa verifica.

## Baseline vs finale

| Metrica | Prima | Dopo |
|---|---:|---:|
| Errori TypeScript | 0 sulla baseline della PR 158 | Controllo finale in corso |
| Warning build | Dimensione chunk già segnalata | Build finale in CI |
| Vulnerabilità Bun | 0 nel controllo precedente; nessuna dipendenza cambiata | Lockfile invariato |
| File rimossi | — | 0 |
| Bundle gzip | Non misurato | Non misurato |
| Lighthouse Performance / A11Y | Non eseguiti | Non eseguiti |

## Rimosso

Il confronto esclusivo con l'azienda principale nel dominio email e i parametri iniziali ripetuti nelle pagine bancarie. Nessun dato o file eliminato.

## Security fix

Accesso al dominio coerente con le aziende amministrate; accessi sospesi, scaduti o senza permesso restano negati. Sola lettura rispettata. Routing calendari limitato all'azienda, senza leggere credenziali nel browser. Il collaudo bancario usa soltanto provider simulato e PostgreSQL locale.

## Bug corretti

| Problema | File | Causa | Correzione |
|---|---|---|---|
| Ripresa movimenti rifiutata | bank-distyra | Parametri incompatibili con token | Solo continuation dopo la prima pagina |
| Admin multi-azienda respinto | manage-email-domain | Confronto con sola azienda principale | Accessi attivi e RPC del chiamante |
| Pagina dominio falsamente vuota | SettingsEmailDomain | Errore di lettura senza stato esplicito | Motivo e Riprova |
| 404 da provider mai collegati | providersAppuntamento / appuntamentiPubblici | Chiamata indiscriminata a tre servizi | Destinazione effettiva e mappe esistenti |

## Accessibilità

Errore dominio con `role=alert`, pulsante Riprova con nome accessibile, nessun cambiamento ai controlli esistenti.

## UX migliorata

Motivo utile per ripresa bancaria scaduta, distinzione tra permessi e sessione, dominio non caricato distinto da dominio non configurato.

## Performance

Nessuna richiesta ai provider calendario assenti; letture locali limitate a un appuntamento, una destinazione e le connessioni del responsabile. Nessun polling aggiunto.

## Checklist test finale

- 105 test mirati superati su otto file: gestore bancario reale con banca simulata, autorizzazione dominio, stato errore UI, routing calendario e prenotazioni.
- Deno check delle funzioni cambiate: PASS.
- Lint dei file frontend/test cambiati: zero errori. Il file Deno è escluso dal lint frontend.
- TypeScript e build finali: in corso; nessuna dichiarazione di rilascio prima degli esiti.
- Test permanenti in CI; deploy edge subordinato anche al nuovo job integrazioni.
- Browser multipli, Safari, Lighthouse e modifiche a connessioni reali dei clienti: non eseguiti.

## Problemi non risolti

| Problema | Motivo | Azione |
|---|---|---|
| Limite giornaliero bancario 429 | Vincolo provider | Attendere `resets_at` / retry indicato |
| Crediti, carta o abbonamento bloccati | Requisiti account | Ripristino da parte del titolare; il sistema continua a controllare lo stato |
| Eventuale OAuth revocato o collegamento calendario scaduto | Richiede l'account del titolare | Ricollegamento dall'app; errore conservato |
| Rilascio e collaudo chat della PR 158 | Ultima preview in corso | Merge dopo tutti i controlli e verifica online |

Verdetto: difetti riprodotti corretti e coperti da test; nessuna certificazione generale della piattaforma.
