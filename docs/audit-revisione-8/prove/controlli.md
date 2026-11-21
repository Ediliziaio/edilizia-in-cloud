# Controlli del lotto locale

Verifica del 20 novembre 2026 sulla baseline `45db324e3` e sulle modifiche del worktree locale.

| Controllo | Baseline | Dopo |
| --- | --- | --- |
| Suite funzionale mirata | I nuovi casi di regressione riproducono i problemi del lotto con fixture e adattatori simulati. Gli esiti sono riportati nella tabella prima/dopo del rapporto. | 369 test riusciti in 34 suite. Include casi anomali e controlli positivi, oltre a firme, SAL, backup, calendario, editor fatture e magazzino. |
| TypeScript | Job GitHub TypeScript riuscito sulla baseline. | Nessun errore rilevato nel controllo mirato sui sorgenti e test modificati e le dichiarazioni TypeScript del repo. |
| Edge Deno | Job GitHub relativo alle Edge Functions riuscito sulla baseline. | `deno check --cached-only --no-lock` riuscito per `customer-portal`, `generate-native-pdf` e `generate-sal-pdf`. |
| Build | Job GitHub build di produzione riuscito. | Build Vite con URL e chiave fittizi locali riuscita in 1m 7s. Rollup segnala annotazioni nelle dipendenze e chunk grandi oltre 1.500 kB. |
| ESLint | I due hook PDF avevano una segnalazione sulla memoizzazione controllata. | Nessun errore sui file del lotto. Restano 19 avvisi nei file esistenti. |
| Quattro assert di censimento | Tre riferimenti a etichette in `permessiConLettore`, un percorso spostato in `salSoloConPermesso`. | I fallimenti sono aperti e registrati in AUD002. |
| Database completo | Replay offline GitHub riuscito, Supabase Preview rosso per divergenza del registro remoto. | Nessuna migrazione nel lotto. Metadati attivi interrogati in sola lettura. |
| Smoke test con login e invii reali | — | Da ripetere in staging con tenant e servizi sintetici. |

## Evidenze prima e dopo

- In EIC001 ed EIC002 sono state eseguite le funzioni applicative vere con archivio in memoria. Le prove negative riguardano la conferma tecnica cancellata, la fonte cambiata senza avviso e la richiesta errata da 10. Dopo la modifica sono passati anche ripresa, copertura mutata e controlli del preflight.
- In EIC003 il tetto simulato perdeva 205 associazioni. Il ramo corretto ha ricevuto 1.205 associazioni distinte e ha rigettato una pagina interrotta.
- In EIC006 il campione IT00 superava la validazione. Con la stessa prova ora è rifiutato, mentre le forme normalizzate del campione valido passano.
- In EIC010 le tre prove negative restituivano tutte 200. Ora upload fallito dà 502, update fallito o senza righe dà 503. Anteprima e archivio completo danno 200.
- In EIC014 la fixture con revoca rimaneva autenticata. In EIC015 la fixture con cambio azienda e errore vedeva il flag economico attivo. Dopo il lotto, la revoca è applicata e la nuova azienda ottiene i propri permessi solo dopo lettura riuscita.
- In EIC040 il gestore senza contesto creava la sessione simulata e restituiva 200. Ora il caso di contesto indisponibile dà 503, l’azienda diversa o l’utente privo di accesso danno 403 e la disdetta legittima usa il customer previsto.
- In EIC048 i casi negati arrivavano alla lettura con credenziali di servizio nella fixture. Ora terminano con 403 prima della lettura privilegiata del documento. Si è verificato anche l’ingresso consentito senza generare link di firma reali.
- In EIC068 i due test del lettore fallivano sul filtro del profilo collegato. Ora verificano i predicati prima della paginazione. Il benchmark dimostra l’esito della query prima e dopo. [EIC068](EIC068-ricerca-sql-sintetica.json)
- In EIC083 e AUD001 i caricatori della baseline rimanevano rifiutati al secondo tentativo. Il test finale conferma un solo tentativo condiviso e il nuovo import dopo guasto. Simula il caricamento del modulo e lascia aperta la prova nel browser.
- In EIC085 il parser perdeva la data Excel nativa. La prova del dialogo dà due movimenti validi da 100 e 20 euro, un esito escluso esplicito e chiavi stabili.
- In EIC089 il rendering mobile con un ID bozza conteneva «Fatturato» e il colore verde. I due rami JSX ora danno coerentemente «Da fatturare» e lo stato cambia quando il flag fiscale indica l’emissione.
