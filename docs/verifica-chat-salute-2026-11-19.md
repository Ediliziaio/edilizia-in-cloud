# Verifica chat e salute della piattaforma — 19 novembre 2026

La Chat Team rispetta le conversazioni private: entrando in Renova come super admin non si diventa partecipanti delle chat dei dipendenti. La schermata vuota dell’account admin non dimostra un guasto nell’invio. Il selettore colleghi risponde; i dati e le policy RLS delle tre tabelle chat sono presenti. Dei 64 canali diretti Renova, 53 coinvolgono clienti esterni e sono esclusi intenzionalmente dalla chat interna.

I difetti riprodotti sono l’elenco che non scopre nuove conversazioni, soprattutto quando parte vuoto, la dipendenza dai dettagli dei partecipanti per mostrare canali già autorizzati e l’assenza di recupero dei messaggi aperti quando Realtime non risponde. La correzione rilegge le membership al primo messaggio, alla riconnessione e ogni 15 secondi in primo piano. Le pagine dello storico già lette restano nella cache quando gli ultimi messaggi si aggiornano. Avatar dell’account corrente ed elenco vuoto in vista super admin sono più chiari. Nessun permesso di accesso alle chat private è stato ampliato.

Nelle 48 ore esaminate circa 3.500 risposte cron erano tutte HTTP 402 per credito aziendale esaurito, metodo di pagamento mancante o abbonamento bloccato. Le chiamate ripetute provengono dall’estrazione email opportunità/allegati. Il dispatcher opportunità non aveva rinvio né presa in carico: ora propone una lease atomica di 10 minuti, un’ora per i blocchi di credito e attese progressive per gli errori tecnici, con arresto dopo sei errori consecutivi. I blocchi di credito non consumano i sei tentativi tecnici. Il gate di pagamento e l’addebito AI restano attivi; il worker registra il rinvio prima di restituire l’errore.

Il registro propone una RPC che raggruppa prima del limite, conserva le occorrenze e distingue i codici aziendali `insufficient_credits`/`payment_method_required` dai guasti tecnici. Un 402 sconosciuto resta un errore tecnico. Gli errori tecnici sono prioritari nel risultato: mille blocchi recenti non nascondono un 503 più vecchio. Se la lettura fallisce, la pagina propone Riprova e non mostra «Nessun errore».

## Stato del rilascio

Il codice è proposto nella PR. Lo SQL è intenzionalmente in `docs/sql-proposte/20290421153000_chat_salute_retry.sql`, fuori da `supabase/migrations`: un push della PR non deve applicarlo in produzione. Per il rilascio occorre applicarlo con MCP, registrare la versione allineata e trasferire il file in migrations prima del merge. La nuova RPC del registro e la tabella tentativi devono esistere prima del deploy frontend/worker. Nessun messaggio di prova è stato spedito a persone reali e nessun credito o metodo di pagamento è stato modificato.

## Baseline vs finale

| Metrica | Prima | Dopo |
|---|---:|---:|
| Errori TypeScript | 0 | Verifica finale nei log/CI |
| Warning build | Avviso dimensione chunk | Verifica finale nei log/CI |
| Vulnerabilità Bun audit | 0 | Nessuna dipendenza cambiata |
| File rimossi | — | 0 |
| Bundle gzip | Non misurato | Non misurato |
| Lighthouse Performance | — | Non eseguito |
| Lighthouse A11Y | — | Non eseguito |

## Rimosso

Nessun file. È stata sostituita la subscription chat che funzionava solo con un elenco già popolato; rimosso il relativo valore derivato non più usato.

## Security fix

RLS chat invariata. Nuova tabella tentativi e RPC di scrittura riservate al service role. RPC di monitoraggio con verifica staff/super admin e nessun accesso anonimo. Scope azienda/utente e rilascio di timer/subscription verificati nei test. La prova SQL rifiuta un database diverso da `eic_chat_salute_test` o una connessione TCP.

## Bug corretti

| Problema | File | Causa | Correzione |
|---|---|---|---|
| Nuova chat assente | InternalChat / useInternalChatUpdates | Membership in cache e listener assente con elenco vuoto | Aggiornamento autorizzato anche al primo messaggio |
| Canali spariscono durante il caricamento | InternalChat | Filtro basato sulla query dettagli ancora pendente | Membership personale già verificata |
| Messaggi fermi senza Realtime | InternalChat / channelMessagesCache | Nessuna rete di sicurezza | Recupero in primo piano con storico conservato |
| Opportunità ritentate ogni giro | email-ai-opportunita / proposta SQL | Nessun backoff | Presa in carico, rinvio e contatore errori separato |
| Registro sommerso dai 402 | PlatformHealthPage / proposta SQL | Limite applicato prima del raggruppamento | Gruppi con conteggio e categoria esplicita |

## Accessibilità

Stato di errore del registro con `role=alert` e pulsante Riprova accessibile. Conservati i controlli esistenti della chat. I test interrogano etichette e ruoli dell’interfaccia.

## UX migliorata

Avatar dell’account disponibile anche nella vista azienda del super admin. Lo stato vuoto chiarisce la riservatezza delle conversazioni. Errori di lettura dei partecipanti non diventano un elenco vuoto.

## Performance

Query delle nuove membership ogni 15 secondi solo in primo piano; subscription condivisa per cache/azienda/utente, senza duplicazione in StrictMode. Il dispatcher non riaccoda durante la lease o il rinvio. La risposta rapida a pg_net evita di trattenere la coda globale durante l’AI.

## Checklist test finale

- Test chat, badge, storico, credito, autorizzazioni e registro: esiti nei log/CI.
- Interfaccia chat: arrivo di una conversazione nuova e stato di errore con Riprova verificati.
- SQL PostgreSQL 17 isolato: PASS per lease, rinvio, ripresa, tetto errori, gruppi prima del limite e autorizzazioni.
- Deno check della funzione modificata: PASS.
- Audit Bun sul lockfile: PASS (nessun advisory).
- Lint file modificati: cinque errori già presenti in InternalChat; nessun nuovo errore e una dipendenza effect corretta. Il lint globale è documentato separatamente.
- Invio/ricezione con due utenti reali, Safari, Firefox, responsive visuale e Lighthouse: non eseguiti in produzione.

## Problemi non risolti

| Problema | Stato | Azione |
|---|---|---|
| Crediti/carta/abbonamento delle aziende bloccate | Condizioni account ancora presenti | Il titolare dell’account ripristina il requisito; nessuna spesa autorizzata da questa verifica |
| Integrazioni calendario 404 e dominio email 401 | Registrati, senza prova di risoluzione | Verifica delle connessioni e dell’account coinvolto |
| Banca 429 / invalid_continuation 400 | Log provider confermati, non oggetto della patch chat | Diagnosi del limite provider e della ripresa paginata |
| Cinque errori ESLint preesistenti della chat | Presenti anche su main di partenza | Refactoring dedicato; non mascherati con disabilitazioni |
| Rilascio | Da autorizzare | Applicazione proposta SQL, allineamento migrazione, merge e deploy |

Verdetto: correzioni mirate collaudate; non è una certificazione «tutto OK» dell’intera piattaforma.
