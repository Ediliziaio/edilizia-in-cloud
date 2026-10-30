# Piani Gestionale / Business / Pro — piano operativo di sviluppo

Scritto il 29/10/2026. Riferimenti:
- pagina dei costi e dei paletti: https://claude.ai/artifact/Jxum42zfgkrMdPYXsrwKR2 (sorgente in `docs/piani/costi-e-piani.html`);
- censimento dei blocchi esistenti, fatto lo stesso giorno (riassunto qui sotto).

## Obiettivo

Vendere tre piani i cui confini **tengano davvero**:

| Piano | Prezzo | In una frase |
|---|---|---|
| Gestionale | 297 €/mese | Controllo i lavori |
| Business | 447 €/mese | Controllo i soldi |
| Pro | 547 €/mese | Controllo l'impresa |

Un cliente non deve poter ottenere un piano superiore passando da Silvio, da MCP o digitando l'indirizzo di una pagina. Ogni consumo che ci costa (conti, cassetto fiscale, fatture SDI, render, AI) deve avere una dotazione e un extra a pagamento.

Margini attesi con la dotazione usata tutta: Gestionale ~91%, Business ~90%, Pro ~87%.

## Da dove partiamo (censimento del 29/10)

- I blocchi stanno nel **menu** e nelle **rotte** (`FeatureRoute`, `src/components/auth/FeatureRoute.tsx`). **Nessuna policy RLS dipende dal piano.**
- **Silvio e MCP ignorano il piano.** `getToolsForChannel` (`supabase/functions/_shared/silvioTools.ts:9011`) filtra per canale, ruolo e permessi, non per funzione acquistata. `platform-mcp` legge col service role.
- `subscription_plans.included_modules` nasconde solo il menu. Sono aperte via indirizzo:
  - commesse, magazzino, previsionale/costi/analisi acquisti;
  - `/email`, `/sopralluoghi`, `/formazione`.
- I limiti numerici non sono applicati:
  - `limit_value` non viene mai letto;
  - `max_users` e `max_storage_mb` non bloccano;
  - non c'è alcun conteggio di conti collegati, caselle email, calendari o numeri WhatsApp.
- Chiavi incoerenti o morte:
  - prima nota usa `prima_nota` nel menu e `tesoreria` nella rotta;
  - `portale_cliente`, `banca_extra`, `gps_fleet`, `reporting_advanced` e `agente_vocale` non sono lette dal codice.
- Alcune rotte si aprono se il controllo fallisce o è lento (`src/lib/featureRouteSoftOpen.ts`).
- La quota di struttura compare anche nella commessa (`src/components/orders/OrderEconomicsSummary.tsx`), quindi anche nel Gestionale.
- Si bloccano già bene:
  - WhatsApp, anche lato server;
  - render e voce, a crediti;
  - tesoreria e controllo di gestione, ciascuno tutto insieme.

## Fase 0 — Decisioni del titolare (prima di scrivere codice)

| # | Decisione | Perché blocca |
|---|---|---|
| 0.1 | Listino finale: prezzi, dotazioni, i 4 extra pubblici, prezzo dell'avvio una tantum | Serve per i prezzi Stripe e per i semi dei piani |
| 0.2 | ITALA: l'abbonamento M500 vale per tutte le partite IVA? Altrimenti ricarica R10000 | Cambia il costo del cassetto di 2× |
| 0.3 | Recupero dello storico: a pagamento (99 € ogni 1.000 documenti) o incluso con l'annuale | Cambia il flusso di acquisto |
| 0.4 | Clienti regalati: data di passaggio a pagamento e sconto | Fase 6 |
| 0.5 | Renova (127 €): mantiene il prezzo vecchio o passa al nuovo listino, e con quanto preavviso | Fase 6 |
| 0.6 | Utenti: tetto commerciale (5/8/15) oppure illimitati, con il tetto sulle caselle collegate | Fase 2 |

## Fase 1 — Modello dei piani nel database (1–2 giorni)

1. **Piani nuovi** in `subscription_plans` con gli slug `gestionale`, `business` e `pro2027`.
   - Lo slug `pro` esiste già a 247 €: non va riusato, per non spostare chi c'è sopra.
   - I vecchi `starter`, `pro` ed `enterprise` restano attivi finché ci sono clienti, ma non si vendono più.
2. **Chiavi di funzione nuove**, ciascuna in `platform_feature_flags` e `plan_feature_defaults`:

   | Chiave | Cosa separa |
   |---|---|
   | `banca_collegata` | collegamento dei conti, separato dalla prima nota manuale |
   | `previsionale_cassa` | oggi è `forecast`, solo nel menu |
   | `struttura_su_commessa` | quota di struttura e margine dopo la struttura |
   | `hr_avanzato` | organigramma, candidati, corsi interni; oggi stanno sotto `hr_personale` |
   | `cassetto_fiscale` | ITALA, separato da `documenti` |
   | `silvio_tesoreria`, `silvio_impresa` | gli strumenti di Silvio per area |

3. **Allineare `prima_nota`**: una sola chiave, la stessa per menu e rotta.
4. **Limiti** in `plan_feature_defaults.limit_value`, uno per ogni quantità: conti, caselle, calendari, numeri WhatsApp, utenti, GB, fatture SDI e documenti del cassetto al mese.
5. **`plan_ai_budgets`**: una riga per piano (20, 20 e 30 € a listino) con il tetto massimo attivo. Oggi l'Enterprise ha 500 € con addebito automatico.
6. **Funzione SQL `limite_piano(company_id, chiave)`**, che restituisce il limite e il consumo del periodo. Nasce con `REVOKE ALL … FROM PUBLIC, anon` e il `GRANT` al solo service role, come da CLAUDE.md.

Ogni migrazione segue la procedura di CLAUDE.md:
- SQL idempotente;
- applicata con `apply_migration`;
- versione riallineata;
- file `2028…`, controllando prima che il numero non sia già preso.

## Fase 2 — Blocchi lato server (3–4 giorni) — la fase più importante

**2a. Silvio e MCP rispettano il piano.**
- Una mappa strumento → chiave di funzione: tesoreria, riconciliazione, previsionale e conti vanno sotto `tesoreria`/`silvio_tesoreria`; controllo di gestione, budget, patrimoniale e rating sotto `controllo_gestione_v1`/`silvio_impresa`; HR sotto `hr_personale`; fatture sotto `documenti`.
- `getToolsForChannel` riceve le funzioni attive dell'azienda (una chiamata `resolve_company_features` per conversazione) e toglie gli strumenti non acquistati.
- Quando la domanda tocca un'area chiusa, Silvio risponde «questa analisi è nel piano Business/Pro».
- Stessa mappa in `platform-mcp`, prima di ogni lettura.
- Test: un'azienda Gestionale chiede il saldo e il conto economico, e non li ottiene.

**2b. Tetti numerici dove nasce il costo.** Il controllo va prima di creare la risorsa. Oltre il tetto il messaggio dice di acquistare l'extra.

| Risorsa | Dove si controlla |
|---|---|
| Conti correnti | `bank-distyra` |
| Caselle email | `email-oauth-start`, `outreach-mailbox-connect` |
| Calendari | `google-calendar-auth`, `outlook-calendar-auth` |
| Numeri WhatsApp | `whatsapp-connect` |
| Utenti d'ufficio, se si decide il tetto | `create-employee-user`, `create-salesperson-user` |

**2c. Contatori a consumo con l'extra automatico.**
- Fatture inviate allo SDI (`invia-sdi`): conteggio nel mese. Oltre la dotazione l'invio parte comunque e si scala dal portafoglio con `pool_consuma(..., 'sdi', ...)`. Una fattura non si blocca mai.
- Documenti del cassetto (`billing-massive`, `_shared/importItala.ts`): stesso schema. Il recupero dello storico chiede conferma del costo prima di partire; la conferma esiste già.
- Avviso all'80% e al 100% della dotazione: email al titolare più la campanella.

**2d. Niente apertura se il controllo fallisce sulle funzioni a pagamento.** In `featureRouteSoftOpen.ts` restano aperte solo le chiavi gratuite. Lo stesso vale per `seNonVerificabile:"consenti"` sugli invii.

## Fase 3 — Blocchi nell'interfaccia (1–2 giorni)

1. `FeatureRoute` sulle rotte aperte che cambiano tra i piani:
   - `/previsionale` e analisi acquisti → `previsionale_cassa`;
   - prima nota;
   - HR avanzato → `hr_avanzato`;
   - `/email` → `email_client`.
2. `OrderEconomicsSummary`: la quota di struttura e il margine dopo la struttura solo con `struttura_su_commessa`. Senza, si vede il margine diretto con la scritta «prima dei costi generali».
3. Controllo di gestione: la chiave unica va bene, perché nel Pro c'è tutto.
4. Le aree chiuse si vedono in anteprima (modalità preview già esistente) con il pulsante di passaggio al piano superiore, invece di sparire.
5. **Pagina «Il tuo piano»**: dotazioni e consumi del mese (conti 1/2, fatture 34/60, cassetto 120/150, credito AI, render, spazio) e gli extra acquistabili.

## Fase 4 — Blocco sui dati (2 giorni, dopo il lancio se serve)

- Le RPC che calcolano tesoreria, previsionale e controllo di gestione verificano la funzione con `resolve_company_feature` lato database. Chi chiama le API direttamente con la sessione non ottiene i calcoli.
- Le RLS sulle tabelle grezze restano per azienda e permessi. Legare le tabelle al piano costerebbe molto in prestazioni, e il valore sta nei calcoli, non nelle righe.

## Fase 5 — Stripe e acquisto (2–3 giorni)

1. Prodotti e prezzi in Stripe:
   - i tre piani, mensile e annuale (annuale = 10 mensilità);
   - l'avvio una tantum;
   - i 4 extra pubblici.
2. `create-checkout-session` e `public-checkout` con i piani nuovi. `stripe-webhook` mette lo slug giusto sull'azienda.
3. `sync-stripe-mrr`: aggiungere i nuovi slug e gli extra nella mappa `ACCESSORI`.
4. Extra ricorrenti (conto, utente, casella) come voci dell'abbonamento: a ogni modifica aggiornano `company_feature_overrides.limit_value`.
5. Pagina `/azienda/upgrade` con le tre colonne, i paletti e il confronto. Su iOS resta bloccata, come oggi.

## Fase 6 — Passaggio dei clienti esistenti (1 giorno di lavoro + tempo commerciale)

1. Tabella di mappatura: ogni azienda attiva, piano attuale, piano nuovo, prezzo, data.
2. Clienti regalati: avviso con 30 giorni di anticipo, poi checkout. In mancanza di pagamento si passa a un piano limitato, non si sospende.
3. Lo storico del cassetto delle aziende già attive non si rifà: ce l'hanno.

## Fase 7 — Collaudo (2 giorni)

- Un'azienda di prova per ciascun piano. Demo 2 resta senza limiti per le dimostrazioni.
- Per ciascun piano, cosa si prova:

  | Blocco | Prova |
  |---|---|
  | Menu | le voci giuste sono visibili |
  | Indirizzi | le rotte chiuse rimandano alla pagina di upgrade |
  | Silvio | risponde solo sulle aree del piano |
  | MCP | non legge le aree chiuse |
  | Tetti | il terzo conto, la quarta casella e il secondo numero vengono rifiutati |
  | Contatori | la fattura numero 61 viene addebitata e parte lo stesso |

- `typecheck:ci`, i test critici e il controllo Supabase Preview verde prima di ogni push.
- Le edge function toccate vengono ripubblicate dal CI. Se cambia solo `_shared/`, va toccato l'`index.ts` delle funzioni che lo importano (CLAUDE.md, «Trappola»).

## Fase 8 — Lancio

1. Listino pubblico sul sito, con le sole funzioni collaudate. Non vanno promessi:
   - lo stato patrimoniale storico;
   - il rating come rating bancario;
   - il canale diretto con l'Agenzia delle Entrate.
2. Primo mese: rapporto settimanale su consumi contro dotazioni e margine vero per azienda.

## Tempi e ordine

| Fase | Giorni | Dipende da |
|---|---|---|
| 0 Decisioni | — | titolare |
| 1 Modello dei piani | 1–2 | 0.1, 0.6 |
| 2 Blocchi lato server | 3–4 | 1 |
| 3 Blocchi nell'interfaccia | 1–2 | 1 (in parallelo alla 2) |
| 5 Stripe | 2–3 | 0.1, 1 |
| 7 Collaudo | 2 | 2, 3, 5 |
| 6 Passaggio dei clienti | 1 | 7, 0.4, 0.5 |
| 4 Blocco sui dati | 2 | dopo il lancio |

**Totale: circa 10–14 giorni di sviluppo fino al lancio.** Le fasi 2 e 3 possono andare in parallelo perché non toccano gli stessi file.

## Cosa può partire subito, senza aspettare le decisioni

- **2a, Silvio e MCP che rispettano il piano.** Serve con qualunque listino.
- **2d, niente apertura a controllo fallito.**
- **La chiave unica della prima nota.**
