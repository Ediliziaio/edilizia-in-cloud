# Edilizia in Cloud — attuazione e collaudo del piano

Richiesta del 19 novembre 2026: completare le attività dello screenshot partendo dalle aree del listino. Ramo `codex/listino-contabilita-fornitori-20261119`, sviluppato in una worktree separata per conservare le modifiche già presenti nella copia principale. Integrati gli aggiornamenti di main fino a `ba1173ad1`, comprese le nuove tabelle di prima nota e contabilità.

## Attività completate

- [x] Aree standard e personalizzate del listino.
- [x] Ruoli cumulabili: amministratore, venditore e operaio.
- [x] Prima nota: modifica, selezione ed eliminazione multipla.
- [x] Scadenzario: modifica e annullamento delle manuali, anche multiplo.
- [x] Contabilità generale: rettifica delle manuali e storni multipli.
- [x] Fornitori: verifica delle tipologie e categorie merceologiche multiple.
- [x] Test funzionali, prove sul database, controlli statici e browser.

## Problemi e soluzioni

| Area | Prima | Risultato |
|---|---|---|
| Listino | Tipologie create con richieste separate; rischio di area parziale. Mancava un percorso esplicito per le personalizzate. | Un'unica operazione atomica crea l'area. Nome e tipologie personalizzati, controllo dei duplicati, errori riprovabili, apertura dell'area salvata. |
| Ruoli | Ruoli aggiuntivi poco visibili, liste operative nella cache, possibile assenza della scheda operaio. | Ruoli sempre visibili; l'amministratore può essere anche venditore e operaio. Scheda personale collegata o creata senza duplicati; liste aggiornate. La rimozione del ruolo conserva lo storico personale. |
| Prima nota | Mancavano selezione con totali ed esito per riga; eliminazione meno protetta della modifica. | Selezione della pagina, conferma con importi, esclusioni spiegate ed errori conservati per riprovare. Modifica precompilata ed eliminazione delle manuali ammesse. L'annullamento dell'incasso aggiorna il residuo della fattura. Banca e documenti automatici rimandano all'origine. |
| Scadenzario | Mancava la modifica protetta delle manuali; possibili conflitti con pagamenti appena registrati. | Modifica di descrizione, importo, data, metodo e note; annullamento singolo o multiplo. Lock e controllo della versione. Scadenze pagate, parziali e generate da documenti protette. |
| Contabilità | Necessità di correggere le manuali conservando quadratura e storico. | «Rettifica» nel dettaglio, con modulo precompilato: storno e nuova scrittura atomici. Storni multipli con data e motivo. Riconoscimento degli storni anche negli esercizi successivi. |
| Fornitori | Una sola categoria merceologica per fornitori attivi in più settori. | Categorie cumulabili, rimozione singola, ricerca e filtri anche sulle secondarie, schede/ordini/esportazioni completi. L'unione di duplicati conserva tutte le categorie. I report non duplicano la spesa per categoria. |

Verificate e mantenute le tipologie contabili esistenti dei fornitori. «Idraulica» e «Climatizzazione» sono categorie merceologiche cumulabili e non cambiano il tipo contabile.

## Database, sicurezza e dati

Migrazioni applicate tramite MCP e riallineate al registro:

| Versione | Contenuto |
|---|---|
| `20290420100000` | Creazione atomica delle aree |
| `20290420101000` | Ruoli aggiuntivi e scheda personale |
| `20290420102000` | Scadenze, protezione prima nota, rettifiche contabili |
| `20290420103000` | Categorie multiple dei fornitori |

Le nuove RPC usano `SECURITY INVOKER`, RLS e privilegi espliciti; esecuzione pubblica/anonima revocata e `search_path` impostato. La funzione esistente per assegnare ruoli conserva i controlli amministrativi e il `SECURITY DEFINER` necessario a gestirli.

Tutte le prove con scritture sono terminate con `ROLLBACK` nella demo: nessun dato operativo di prova residuo. Le categorie precedenti vengono recuperate dal campo singolo quando l'array è vuoto, senza aggiornamenti massivi. Il vecchio campo rimane compatibile con i chiamanti precedenti.

L'advisor prima e dopo mantiene le segnalazioni preesistenti: RLS senza policy (46 oggetti), viste definer (21), search path modificabile (53), estensioni pubbliche (2), funzioni definer eseguibili da anon (50) e authenticated (1.285). Nessuna segnalazione nuova sulle funzioni introdotte. Non è stata eseguita una bonifica dell'intero database. Progetto `ACTIVE_HEALTHY`.

## Verifiche

| Controllo | Esito/metodo |
|---|---|
| Regressioni dopo integrazione con main | **480 test, 47 file**; incluso filtro di stampa/esportazione del giornale |
| TypeScript applicazione | `npm run typecheck`, baseline senza errori |
| ESLint dei file modificati | **0 errori**, 5 warning preesistenti |
| Build produzione | `npm run build:fast` |
| Prerender mirato | **2/2 passate**: funzionalità prima nota e scadenzario |
| Browser | Chromium e WebKit, 375/768/1280/1920 px |
| Console e adattamento | Nessun errore JavaScript o fuoriuscita orizzontale nei flussi provati |

Prove sul database, tutte con rollback:

- Aree: più tipologie, ripetizione senza duplicati, rollback completo su input invalido, rifiuto di accessi anonimi o di altra azienda.
- Ruoli: amministratore con entrambi i ruoli aggiuntivi, una sola scheda personale anche ripetendo l'operazione, venditore attivo, scheda conservata rimuovendo il ruolo operaio.
- Scadenze: modifica/annullamento manuale; rifiuto di versione obsoleta, pagata e automatica.
- Fattura di prova da 100 euro: incasso modificato a 60 con residuo aggiornato; cancellazione prima nota, incasso rimosso e fattura nuovamente da incassare.
- Contabilità: rettifica non quadrata rifiutata senza storno residuo; rettifica valida quadrata con originale conservato; storno riconosciuto nell'esercizio successivo.
- Fornitori: normalizzazione e deduplica delle categorie, lettura legacy, compatibilità con campo singolo, rimozione parziale/totale e tipo contabile invariato.

I test applicativi coprono anche errori di rete, esiti parziali, mantenimento delle righe fallite, selezione azzerata cambiando pagina/filtri, permessi, moduli precompilati e doppi invii.

## Accessibilità, UX e prestazioni

Campi e selezioni hanno etichette accessibili; esiti annunciati, errori in italiano, azioni bloccate durante i salvataggi. Prima delle operazioni multiple compaiono importi, righe elaborabili e motivi di esclusione. Verificati gli importi con virgola italiana. Corretto lo scorrimento orizzontale involontario della tabella scadenze a larghezza tablet.

La creazione dell'area passa da più richieste a una RPC. Nessuna dipendenza aggiunta e nessuna rimozione estranea al piano. Non sono dichiarate misure di performance non raccolte. Le selezioni lavorano sulle righe visibili.

## Limiti e problemi non risolti

- Browser con componenti reali e dati simulati, rete esterna bloccata; prove delle scritture reali separate sul database. Non eseguito uno smoke test autenticato completo nell'azienda dell'utente.
- WebKit verificato; Safari su dispositivo Apple reale non collaudato. Firefox non si avvia nell'ambiente per errore sandbox/framebuffer: verifica da effettuare su una postazione compatibile.
- Prerender completo delle 246 pagine pubbliche interrotto per durata locale. Non dichiarati completati tutti i controlli SEO, estranei alle schermate gestionali.
- `npm audit` richiede package-lock/shrinkwrap, assenti nel repository che usa Bun. Non introdotto un secondo lockfile; dipendenze invariate.
- Lighthouse non eseguito; nessun punteggio stimato.

Evidenze locali: `work/verifica-piano-20261119/` (log, schermate e SQL con rollback). I file temporanei non vengono inclusi nel rilascio. Non viene dichiarato un collaudo completo di tutte le funzionalità del prodotto.

## Ripristino

Il frontend può tornare al commit precedente al rilascio. Le migrazioni sono additive o mantengono le firme pubbliche esistenti; il frontend precedente continua a leggere il campo singolo del fornitore. Eventuali ripristini SQL richiedono una nuova migrazione con le definizioni precedenti, senza cancellare versioni applicate dal registro. Per scritture contabili reali usare gli storni, conservando lo storico.
