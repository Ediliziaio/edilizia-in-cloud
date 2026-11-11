# CRM e preventivi classici — verifica aggiuntiva del 11 novembre 2026

Ambito: perdita di appuntamenti durante modifica/annullamento, sincronizzazione
Google/Apple e protezione delle bozze del preventivo classico. Baseline sorgente:
`b15746291e733bdb7abdb2be9c5fb20a1d5046ae`. Nessuna migrazione né modifica a
record dei clienti; prove riproducibili con dati sintetici. Non è una
certificazione dell'intero gestionale.

### 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---------|-------|------|
| Errori TypeScript | baseline repository: 0 | controllo mirato: 0; controllo completo richiesto in CI prima del merge |
| Errori/warning ESLint nei file frontend e test interessati | 13 / 40 | 13 / 38; nessun nuovo errore |
| Warning build | non misurati localmente | build completa e prerender richiesti in CI prima del merge |
| Vulnerabilità dipendenze (`bun audit`) | 0 critical, 0 high, 4 moderate, 2 low | identiche; dipendenze e lockfile non modificati |
| File rimossi | — | 0 |
| Bundle size gzip | non misurato | nessun obiettivo di riduzione in questo intervento |
| Lighthouse Performance | — | non eseguito |
| Lighthouse A11Y | — | non eseguito |
| Pattern di debug/TODO/any nei quattro file campione | 37 | 37 |
| Regressioni mirate | difetti riprodotti con nuovi casi | 276 test superati, 24 file |

### 🗑️ RIMOSSO

| Tipo | Path esatto | Motivo |
|------|------------|--------|
| Nessuna rimozione | — | Conservate API e funzionalità esistenti; niente pulizia estesa durante un intervento sulla persistenza. |

### 🔒 SECURITY FIX

| Problema | Severità | Fix |
|----------|---------|-----|
| Le API Google/Apple si fidavano della sola appartenenza all'azienda prima di usare credenziali del provider | Alta: operazioni esterne non soggette alla RLS | Verifica sul server della sola lettura, esclusione del portale clienti, lettura dell'appuntamento con JWT/RLS e controllo dei permessi. Conservati i job interni autenticati. |
| Letture Apple di appuntamenti e mappature senza filtro azienda | Alta: separazione aziende | Filtro company_id su letture e scritture, anche per chiamate interne. |
| CalDAV inoltrava credenziali a URL e redirect senza validazione | Alta: rischio di invio credenziali fuori dal provider | HTTPS e soli host iCloud; validazione di ogni redirect, limite di redirect e rifiuto di URL con credenziali o porte arbitrarie. |

Test eseguono gli handler reali con dipendenze simulate: accessi vietati,
appuntamento non visibile, azioni dirette sul provider, account autorizzati e job
interni. Nessuna credenziale reale utilizzata. Il controllo fallisce chiuso se le
RPC dei permessi non rispondono correttamente.

### 🐛 BUG CORRETTI

| Problema | File / gestore | Root cause | Fix applicato |
|----------|----------------|------------|---------------|
| Cancellazione esterna anche se il CRM non salva | `src/components/marketing/MarketingAppointmentDialog.tsx`, handleDelete | Chiamata provider prima della conferma del database | Prima annullamento CRM con riga restituita, poi sincronizzazione; l'API pubblica rifiuta delete di un appuntamento ancora attivo. |
| Nota modificata da un collega non aggiornata su Google/Apple | Dialog, lista e `MarketingCalendar.tsx` | Decisione push/update basata su una mappa invisibile al collega sotto RLS | Update delegato al server; se manca la mappa il server crea l'evento. |
| Stato, spostamento o durata annunciati salvati senza righe scritte | Lista e calendario CRM | Verifica del solo error, senza conferma della riga | Richiesta select della riga e blocco di successo/sync quando manca. |
| Rollback di uno spostamento nasconde aggiornamenti concorrenti | `src/lib/marketing/appointmentEdit.ts`, rollbackAppointmentTiming | Ripristino di tutta la cache precedente | Ripristino dei soli orari cambiati dell'appuntamento interessato, senza toccare note, altri record o uno spostamento successivo; rilettura dal server. |
| Annulla spostamento sovrascrive un successivo intervento del collega | `MarketingCalendar.tsx`, handleDropAppointment | Undo incondizionato | Confronto sul database della data e degli orari prodotti dallo spostamento prima dell'undo. |
| Apple perde il collegamento dopo DELETE fallita | `supabase/functions/apple-calendar-sync/index.ts` | Errori del provider ignorati, mappa eliminata comunque | Mappa conservata su errore di rete/5xx; errori di lettura e scrittura propagati. |
| Primo salvataggio del preventivo perde input scritto nel frattempo | `QuoteBuilder.tsx`, handleSave | Navigazione e cancellazione bozza dopo un salvataggio di uno snapshot precedente | Confronto degli input, permanenza nell'editor e secondo salvataggio sullo stesso record con versione verificata. |
| Nuovo tentativo dopo errore allegati può duplicare il preventivo | `QuoteBuilder.tsx`, createdQuoteRef | Stato di creazione parziale non ripreso | Riutilizzo del record creato dalla stessa istanza; le creazioni recuperate vengono aperte nell'editor corretto, trasferendo la bozza. |
| Digitazione continua rinvia indefinitamente la copia locale | `QuoteBuilder.tsx`, useBoundedAutosave | Solo debounce senza attesa massima | Bozza locale dopo 500 ms di pausa o entro 2 secondi di scrittura continua; cloud del documento esistente resta a 3/15 secondi. |
| Input dopo anteprima di un nuovo preventivo non protetto | `QuoteBuilder.tsx`, persistLocalDraft | Flag creazione completata impediva ogni copia successiva | Esclusione soltanto dello snapshot già salvato; i nuovi input restano protetti. |

### ♿ ACCESSIBILITÀ

| Problema | Fix |
|----------|-----|
| Nessun nuovo controllo grafico | Conservati label, dialog di conferma, focus e notifiche esistenti; verifica funzionale in Chrome locale. Nessun audit completo di contrasto o lettore di schermo effettuato. |

### ✨ UX MIGLIORATA

| Area | Problema | Fix |
|------|----------|-----|
| Errori di salvataggio | Falso successo o chiusura con perdita degli input | Editor conservato, messaggi in italiano e possibilità di riprovare. |
| Modifiche durante il salvataggio | L'utente non sapeva quale versione fosse salvata | Notifica che distingue la versione salvata dagli input ancora da salvare. |
| Ripresa creazione parziale | Apertura del documento senza trasferire gli ultimi input | Copia della bozza nella chiave dell'editor corretto prima della navigazione. |

### ⚡ PERFORMANCE

| Ottimizzazione | Impatto stimato |
|---------------|----------------|
| Eliminata la lettura frontend della mappa prima di ogni update esterno | Una richiesta in meno per provider e operazione. |
| Rollback limitato al record e ai campi coinvolti | Conserva gli aggiornamenti concorrenti; non è una misura del tempo di rendering. |
| Attesa massima per la bozza locale | Protezione degli input entro 2 secondi durante digitazione continua. |
| Controlli server aggiuntivi | Piccolo costo di RPC autorizzative intenzionale; nessuna misura di latenza dichiarata. |

### ✅ CHECKLIST TEST FINALE

- [x] Regressioni mirate: PASS, 276 test in 24 file.
- [x] TypeScript mirato helper/test sicurezza: PASS.
- [x] Deno check delle tre funzioni Google sync, Apple sync e Apple auth: PASS.
- [x] ESLint differenziale: PASS per assenza di nuovi errori; 13 errori preesistenti restano.
- [x] Chrome locale con componente reale e servizi sintetici: PASS. Annullamento respinto conserva appuntamento confermato e non invoca delete esterna; modifica nota successiva salva solo description e invoca update.
- [x] Edge cases: PASS per scrittura durante salvataggio, tentativo dopo errore allegati, bozza parziale, cambio concorrente, zero righe scritte, errore provider, permessi vietati e redirect CalDAV.
- [x] Errore rete: PASS in simulazione; nessuna prova distruttiva su calendari dei clienti.
- [ ] Build completa e typecheck di progetto: demandati ai controlli obbligatori della PR; devono passare prima del merge.
- [ ] Smoke end-to-end autenticato produzione (login, modifica dati reali, logout): non eseguito; evitata la modifica di appuntamenti dei clienti.
- [ ] Mobile 375 px / Safari / Firefox: non verificati in questo intervento.
- [ ] Lighthouse Performance / A11Y: non eseguiti.
- [ ] Console globale dell'applicazione: non certificata dalla simulazione locale.

Le nuove regressioni sono aggiunte al workflow CI, gruppo core. Il rilascio deve
includere sia frontend Cloudflare Pages sia le tre edge function: il solo merge
non è prova che l'interfaccia pubblica sia già aggiornata.

### 🔴 PROBLEMI NON RISOLTI

| Problema | Motivo blocco / limite | Soluzione proposta | Sprint stimato |
|----------|------------------------|-------------------|----------------|
| Scomparsa storica dell'appuntamento HVC da Google | Nessun cliente/data identificabile; nessun collegamento Google attivo rilevato per Gruppo HVC nella verifica precedente | Confrontare un caso preciso con storico e account Google quando disponibile; le cause riproducibili nel codice sono corrette. | Dipende dal caso |
| Trasferimento fra account esterni distinti / presenza Apple del collega | Questo intervento aggiorna la mappa esistente; non ridisegna il trasferimento tra provider/account | Verifica dedicata con calendari di prova collegati e politica esplicita di trasferimento. | Separato |
| 13 errori ESLint preesistenti nei file interessati | React Compiler/ref/effect legacy; nessun nuovo errore aggiunto | Refactoring dell'idratazione dell'editor con test di comportamento. | Separato |
| 4 moderate e 2 low nelle dipendenze | Nessuna modifica di dipendenze in un fix di persistenza | Aggiornamento mirato con build e regressioni; nessuna high/critical nel controllo eseguito. | Separato |
| Avvisi generali Supabase su viste, RPC e indici | Gli advisor non distinguono automaticamente tutte le aperture intenzionali. RLS verificata attiva sulle tabelle del flusso; quattro viste pubbliche dei calendari limitano intenzionalmente la visibilità agli slot pubblici | Classificare viste/RPC singolarmente prima di cambiare permessi; non revocare o eliminare indici in massa. | Audit dedicato |

**Verdetto:** correzioni mirate verificate localmente; rilascio subordinato ai
controlli CI. Non dichiarata assenza di bug nell'intero gestionale.
