# Prompt — sviluppo dei piani Gestionale / Business / Pro

> Da incollare in una sessione nuova di Claude Code aperta su `/Users/florinandriciuc/Edilizia in Cloud`.
> Scritto il 29/10/2026. Documenti collegati:
> - `docs/piani/piano-operativo-piani.md` — il piano a fasi;
> - `docs/piani/costi-e-piani.html` — costi, dotazioni e paletti;
> - pagina pubblicata: https://claude.ai/artifact/Jxum42zfgkrMdPYXsrwKR2

---

## Chi sei e cosa devi fare

Lavori su Edilizia in Cloud: React + Vite + TypeScript, Supabase (Postgres, edge function Deno), deploy su Cloudflare Pages. Rispondi e scrivi sempre in italiano, con testi semplici per imprenditori edili.

Devi costruire nel software tre **piani nuovi** e i loro **paletti**, in modo che i confini tengano davvero: nel menu, negli indirizzi delle pagine, in Silvio, in MCP e nei consumi che ci costano.

| Slug | Nome | Prezzo | In una frase |
|---|---|---|---|
| `gestionale` | Gestionale | 297 €/mese | Controllo i lavori |
| `business` | Business | 447 €/mese | Controllo i soldi |
| `pro2027` | Pro | 547 €/mese | Controllo l'impresa |

Lo slug `pro` esiste già (Pro a 247 €) e ha clienti sopra: **non riusarlo**.

---

## REGOLA N. 1 — Le aziende già avviate non si toccano

È il vincolo più importante. Vale per ogni riga di codice e di SQL.

1. **Nessuna azienda esistente cambia piano, prezzo, funzioni, limiti o crediti.**
   - Non modificare righe di `companies`, `company_features`, `company_feature_overrides`, `company_billing_overrides`, `company_credit_pool`, `ai_credits`, `render_credits`, `company_subscriptions` o simili delle aziende esistenti.
   - Non modificare le righe di `plan_feature_defaults` e `plan_ai_budgets` dei piani esistenti: `starter`, `pro`, `enterprise`, `scopri`, `marketing`, `render-only`, `render-serramenti`, `ener-italia-marketing-preventivi`, `infissi-e-living-serramenti`, `offerta-clienti-marketing` e qualunque altro presente.
2. **Ogni blocco nuovo vale solo per le aziende sui piani nuovi.** Per tutte le altre il comportamento resta identico a oggi:
   - Silvio vede gli stessi strumenti;
   - le stesse pagine si aprono;
   - nessun tetto nuovo;
   - nessun addebito nuovo.

   Implementalo con un'unica funzione SQL, `azienda_su_piano_nuovo(company_id) returns boolean`, vera solo per gli slug `gestionale`, `business` e `pro2027`, e una gemella lato client e lato edge. Ogni blocco nuovo controlla prima quella.
3. **Chiavi di funzione nuove.** Una chiave nuova (vedi fase 1) deve risolversi a **abilitata** per ogni azienda che non è su un piano nuovo:
   - `default_value = true` nel flag;
   - righe esplicite `is_enabled=false` solo sui piani nuovi dove va chiusa.

   Così nessuno perde niente.
4. **Prova obbligatoria prima e dopo.**
   - Prima di qualunque migrazione, salva una fotografia: per ogni azienda esistente, il risultato di `resolve_company_features` su tutte le chiavi, compresi `access_level` e `limit_value`. Salvala in `docs/piani/fotografia-prima.json`; contiene solo id, chiavi e valori, niente dati personali.
   - Dopo ogni migrazione rifai la fotografia e confrontala. **Deve essere identica.**
   - Se una sola riga cambia, fermati, annulla e correggi.
5. **Niente comunicazioni ai clienti, niente checkout, niente email.** Il passaggio dei clienti esistenti ai piani nuovi (fase 6 del piano operativo) è **fuori da questo lavoro**: lo decide il titolare più avanti.
6. Per le prove usa **aziende di prova nuove**, create apposta e con un nome che inizi con `[PROVA PIANI]`, una per piano. Non usare aziende di clienti. Demo Azienda 2 (`d2000000-0000-0000-0000-000000000002`) resta com'è, con crediti illimitati: non toccarla.

---

## Regole del progetto da rispettare (da CLAUDE.md)

- **Migrazioni:**
  - SQL idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`);
  - applicate col tool MCP `apply_migration`, mai `supabase db push`;
  - subito dopo, riallinea la versione in `supabase_migrations.schema_migrations` al nome del file;
  - file `2028…_nome.sql` con versione unica: controlla prima con `ls supabase/migrations/<versione>_*.sql`;
  - un file nella cartella va in produzione al primo push, quindi una migrazione non pronta resta fuori.
- **Funzioni nuove:** nascono con `REVOKE ALL … FROM PUBLIC, anon` e un `GRANT` esplicito. Nessuna RPC nuova aperta ad `anon`.
- **Edge function:** il CI ripubblica solo le funzioni con file cambiati sotto la propria cartella. Se cambi solo `_shared/`, tocca anche l'`index.ts` di ogni funzione che lo importa.
- **Prima di ogni commit:** `npm run typecheck:ci` e i test toccati. Non usare `npx vite build` nudo: va in memoria piena, usa `build:fast`.
- **Git:**
  - mai `git stash`;
  - lavora su un ramo nuovo (`piani-2027`) partito da `origin/main`;
  - committa solo i tuoi file: nella cartella ci sono modifiche di altre sessioni, non includerle e non toccarle;
  - **non fare push e non aprire PR senza il via del titolare.**
- **Supabase Preview** deve restare verde.
- **Mai** scrivere segreti nei cron, nei file o nei log.

---

## Situazione di partenza (censimento del 29/10/2026)

- `useFeatureAccess` → RPC `resolve_company_feature(s)`: override, poi `plan_feature_defaults`, poi `platform_feature_flags.plans_included`, poi `default_value`. Definizione in `supabase/migrations/20280251000000_chiudi_feature_cross_tenant_backup_e_token_sal.sql:99-170`.
- `FeatureRoute` (`src/components/auth/FeatureRoute.tsx`) blocca le rotte in `src/routes/companyRoutes.tsx`. Il menu sta in `src/lib/sidebarConfig.ts`.
- `subscription_plans.included_modules` (`src/hooks/useSubscriptionLimits.ts`) nasconde solo il menu. Restano aperte via indirizzo:
  - commesse, magazzino, `/previsionale`, costi, analisi acquisti;
  - `/email`, `/sopralluoghi`, `/formazione`.
- **Silvio ignora il piano:** `getToolsForChannel` in `supabase/functions/_shared/silvioTools.ts:9011` filtra per canale, ruolo, persona e permessi. Lo chiama `silvio-chat/index.ts` (circa righe 960-1010).
- **MCP ignora il piano:** `supabase/functions/platform-mcp/index.ts` legge col service role, con controllo solo su chiave, scope e azienda.
- **Prima nota:** il menu usa `prima_nota` (`sidebarConfig.ts:191`), la rotta usa `tesoreria` (`companyRoutes.tsx:791`).
- **Apertura a controllo fallito:** `src/lib/featureRouteSoftOpen.ts` (render_ai, marketing_reporting, sales_os, crm_modulo, modulo_fotovoltaico_attivo, firma_fea). Gli invii WhatsApp usano `seNonVerificabile:"consenti"`.
- **Limiti non applicati:** `limit_value` non viene mai letto; `max_users` (`canAddUser` non usato), `max_storage_mb` e `check_plan_limit` sono solo informativi.
- **Nessun conteggio** di conti (`bank-distyra`), caselle (`email-oauth-start`, `outreach-mailbox-connect`), calendari (`google-calendar-auth`, `outlook-calendar-auth`) e numeri WhatsApp (`whatsapp-connect`).
- **Quota di struttura dentro la commessa:** `src/components/orders/OrderEconomicsSummary.tsx`, circa riga 105.
- **HR:** organigramma, candidati e corsi stanno sotto `hr_personale`, insieme al personale base.
- **Fatture e cassetto:**
  - SDI via openapi (`invia-sdi`, `POST /IT-invoices`, 0,049 € a fattura; ricezione `GET /IT-invoices` a 0,001 €);
  - cassetto fiscale via ITALA (`billing-massive`, `_shared/importItala.ts`, 1 credito a documento);
  - il portafoglio unico è `company_credit_pool` con `pool_consuma` e `pool_ricarica`.
- **Pagamenti:** `create-checkout-session`, `public-checkout`, `stripe-webhook`, `sync-stripe-mrr` (mappa `ACCESSORI`). La pagina `/azienda/upgrade` è `UpgradePage` in `companyRoutes.tsx:612`.

Prima di cambiare qualcosa, **rileggi ogni punto citato**: i numeri di riga possono essere cambiati.

---

## Contenuto dei piani

### Paletti per area

✓ = incluso · — = chiuso · € = a consumo

| Area | Gestionale | Business | Pro | Chiave |
|---|---|---|---|---|
| CRM, contatti, pipeline, appuntamenti | ✓ | ✓ | ✓ | `crm_modulo` |
| Preventivi, preventivatori verticali, listini | ✓ | ✓ | ✓ | `preventivi_crm`, `modulo_*_attivo` |
| Commesse, fasi, SAL, varianti, squadre, rapportini, Campo | ✓ | ✓ | ✓ | — |
| RDO, ordini, DDT, magazzino, subappalti, mezzi | ✓ | ✓ | ✓ | `cantieri_avanzati` |
| Margine diretto della commessa | ✓ | ✓ | ✓ | — |
| Fatture emesse, ricevute, scadenzario, incassi manuali | ✓ | ✓ | ✓ | `documenti`, `fatturazione` |
| Recupero dal cassetto fiscale (ITALA) | — | € dotazione | € dotazione | **`cassetto_fiscale`** (nuova) |
| Conti collegati (Distyra), riconciliazione, tesoreria | — | ✓ | ✓ | `tesoreria` + **`banca_collegata`** (nuova) |
| Previsionale di cassa | — | ✓ | ✓ | **`previsionale_cassa`** (nuova) |
| Prima nota | — | ✓ | ✓ | `prima_nota` (una sola chiave per menu e rotta) |
| Controllo di gestione (tutte le schede) | — | — | ✓ | `controllo_gestione_v1` |
| Quota di struttura e margine dopo struttura nella commessa | — | — | ✓ | **`struttura_su_commessa`** (nuova) |
| Organigramma, candidati, corsi interni | — | — | ✓ | **`hr_avanzato`** (nuova) |
| Personale base, presenze, costo orario, documenti | ✓ | ✓ | ✓ | `hr_personale` |
| Dashboard personalizzate | — | — | ✓ | `dashboard_builder_v1` |
| WhatsApp, email, calendari, email marketing | ✓ | ✓ | ✓ | esistenti |
| Render AI | ✓ | ✓ | ✓ | `render_ai` |
| Silvio su vendite, clienti, cantieri | ✓ | ✓ | ✓ | — |
| Silvio su tesoreria e riconciliazione | — | ✓ | ✓ | **`silvio_tesoreria`** (nuova) |
| Silvio sul controllo di gestione | — | — | ✓ | **`silvio_impresa`** (nuova) |
| Firma FEA, centralino e agenti vocali | € | € | € | `firma_fea`, `ai_agents` |

### Dotazioni mensili (`limit_value`)

| Chiave limite | Gestionale | Business | Pro |
|---|---|---|---|
| `limite_conti_bancari` | 0 | 2 | 4 |
| `limite_caselle_email` | 3 | 5 | 10 |
| `limite_calendari` | 3 | 5 | 10 |
| `limite_numeri_whatsapp` | 1 | 1 | 2 |
| `limite_utenti_ufficio` | 5 | 8 | 15 (gli operai del Campo non contano) |
| `limite_spazio_gb` | 50 | 75 | 150 |
| `limite_fatture_sdi_mese` | 50 | 60 | 100 (le ricevute sono illimitate) |
| `limite_cassetto_mese` | 0 | 150 | 300 |
| credito AI a listino (`plan_ai_budgets`) | 20 € | 20 € | 30 € |
| render inclusi | 20 | 20 | 40 |

### Extra

Prezzi IVA esclusa. Da mettere in una tabella `listino_extra`; il prezzo va letto da lì, non scritto nel codice.

| Extra | Prezzo |
|---|---|
| Conto corrente in più | 15 €/mese |
| Utente d'ufficio in più | 15 €/mese |
| Casella email in più | 5 €/mese |
| Numero WhatsApp in più | 15 €/mese |
| 50 GB in più | 10 €/mese |
| Fattura SDI oltre la dotazione | 0,15 € a fattura |
| Documento del cassetto oltre la dotazione | 0,10 € a documento |
| Recupero storico | 0,10 € a documento, con conferma prima |
| Render in più | 0,40 € |
| Credito AI | ricarica a listino, come oggi |

**Se il titolare ha cambiato questi numeri** nella pagina dei costi, chiedigli di incollarti la configurazione (pulsante «Copia la configurazione»): vale quella.

---

## Lavoro da fare, in ordine

### Fase 1 — Modello dei piani (migrazioni)

1. `azienda_su_piano_nuovo(company_id)`: SQL `stable`, `security definer`, `search_path` fisso, `REVOKE` da `PUBLIC`/`anon`, `GRANT` ad `authenticated` e `service_role`.
2. I tre piani in `subscription_plans`, con `is_active = true` ma **non visibili nel checkout** finché il titolare non dice di sì (usa un campo esistente o aggiungi `in_vendita boolean default false`).
3. Le chiavi nuove in `platform_feature_flags`, con `default_value = true`: `cassetto_fiscale`, `banca_collegata`, `previsionale_cassa`, `struttura_su_commessa`, `hr_avanzato`, `silvio_tesoreria`, `silvio_impresa`.
4. Le chiavi di limite (`limite_*`), con `default_value` che significa «nessun limite»: `limit_value NULL`.
5. `plan_feature_defaults` **solo per i tre piani nuovi**, secondo le tabelle sopra.
6. `plan_ai_budgets` per i tre piani nuovi, con tetto massimo `require_topup`.
7. `listino_extra(chiave, descrizione, prezzo_eur, unita, attivo)`, letta dal service role e da `authenticated` in sola lettura.
8. `limite_piano(company_id, chiave) returns table(limite int, usato int, periodo text)`:
   - per le aziende **non** su piano nuovo restituisce sempre `limite = NULL` (illimitato);
   - il conteggio di `usato` avviene per ciascuna chiave sulla tabella giusta. Verifica i nomi veri delle tabelle prima di scriverla.
9. Prima nota: oggi tutti i piani esistenti hanno sia `tesoreria` sia `prima_nota` abilitate. Verifica che sia vero **azienda per azienda** con la fotografia. Solo dopo, menu e rotta useranno entrambi `prima_nota`. Se un'azienda esistente risolve le due chiavi in modo diverso, non cambiare la rotta: segnalalo al titolare.

Ogni migrazione: fotografia prima e dopo, che deve risultare identica.

### Fase 2 — Blocchi lato server

**2a. Silvio rispetta il piano.**
- Crea `supabase/functions/_shared/strumentiPerPiano.ts` con la mappa strumento → chiave:
  - tesoreria, riconciliazione, conti, saldi, previsionale, prima nota → `silvio_tesoreria`;
  - controllo di gestione, conto economico, budget, struttura, patrimoniale, rating, pacchetto banca → `silvio_impresa`;
  - organigramma e candidati → `hr_avanzato`.

  Leggi tutti gli strumenti in `silvioTools.ts` e classificali uno per uno; nel commento in testa al file metti l'elenco di quelli lasciati liberi, col motivo.
- In `getToolsForChannel` aggiungi le funzioni attive dell'azienda (una sola chiamata `resolve_company_features` per richiesta) e togli gli strumenti chiusi **solo se `azienda_su_piano_nuovo`**.
- Quando la domanda tocca un'area chiusa, Silvio risponde in modo chiaro che quell'analisi è nel piano Business o Pro. Aggiungi l'istruzione al prompt solo per le aziende su piano nuovo.
- Test con DB finto: un'azienda Gestionale non riceve gli strumenti di tesoreria e controllo di gestione; un'azienda Business non riceve quelli di controllo di gestione; un'azienda su `enterprise` riceve esattamente gli stessi strumenti di prima. L'elenco va confrontato con quello prodotto dal codice attuale.

**2b. MCP rispetta il piano.** Stessa mappa in `platform-mcp`, prima di ogni lettura, solo per le aziende su piano nuovo. Test come sopra.

**2c. Tetti dove nasce il costo.** Prima di creare la risorsa, `limite_piano`: se `usato >= limite`, rispondi 402 con un messaggio chiaro («Il piano Business include 2 conti. Aggiungi un conto per 15 €/mese.») e non creare niente.

| Risorsa | Funzioni da toccare |
|---|---|
| Conti | `bank-distyra` |
| Caselle | `email-oauth-start`, `outreach-mailbox-connect` |
| Calendari | `google-calendar-auth`, `outlook-calendar-auth` |
| Numeri WhatsApp | `whatsapp-connect` |
| Utenti d'ufficio | `create-employee-user`, `create-salesperson-user`, senza contare gli operai del Campo |

Per le aziende non su piano nuovo il limite è `NULL`: niente cambia.

**2d. Contatori con addebito oltre la dotazione** (solo piani nuovi).
- `invia-sdi`: dopo un invio riuscito, conta le fatture del mese. Oltre `limite_fatture_sdi_mese`, addebita il prezzo di `listino_extra` con `pool_consuma(company, 'sdi', …)`.
  - **L'invio non si blocca mai**, nemmeno a portafoglio vuoto: si registra il debito e si avvisa.
  - Idempotente per fattura: un nuovo tentativo non addebita due volte.
- `billing-massive` / `importItala.ts`: stesso schema per i documenti del cassetto.
  - Senza `cassetto_fiscale` attivo (Gestionale) il recupero non parte e propone il passaggio a Business.
  - Il recupero dello storico mostra il costo e chiede conferma; la conferma esiste già, va estesa con il prezzo.
- Avvisi all'80% e al 100% di ogni dotazione: campanella più email al titolare dell'azienda. Al massimo una volta per soglia e per mese; l'idempotenza sta nel database.

**2e. Niente apertura a controllo fallito, per i piani nuovi.**
- `featureRouteSoftOpen.ts`: per le aziende su piano nuovo le chiavi a pagamento si chiudono se il controllo fallisce; per le altre resta tutto com'è.
- Stesso criterio per `seNonVerificabile`.

### Fase 3 — Interfaccia

1. Hook `usePianoNuovo()` e `useLimitePiano(chiave)`.
2. `FeatureRoute` sulle rotte aperte che cambiano tra i piani:
   - `/previsionale`, costi, analisi acquisti → `previsionale_cassa`;
   - prima nota → `prima_nota`;
   - organigramma, candidati e corsi interni → `hr_avanzato`;
   - `/email` → `email_client`.

   Le chiavi nuove valgono `true` per i piani esistenti, quindi per loro non cambia niente. Verificalo.
3. `OrderEconomicsSummary`: quota di struttura e margine dopo struttura visibili solo con `struttura_su_commessa`. Senza, il margine diretto porta la scritta «prima dei costi generali dell'azienda».
4. Aree chiuse in **anteprima** (modalità preview esistente) con il pulsante «Passa a Business» o «Passa a Pro», non nascoste. Silvio non entra in anteprima.
5. Pagina **«Il tuo piano»** (sotto Impostazioni → Abbonamento, `SettingsSubscriptionBilling.tsx`):
   - dotazioni e consumi del mese con barre: conti 1/2, fatture 34/60, cassetto 120/150, credito AI, render, spazio, utenti, caselle;
   - gli extra con il prezzo da `listino_extra`.

   Per le aziende sui piani vecchi la pagina resta com'è oggi.
6. Testi in italiano semplice, senza termini tecnici. Nessun importo scritto nel codice.

### Fase 4 — Blocco sui calcoli (dopo le fasi 1-3)

Le RPC che calcolano tesoreria, previsionale e controllo di gestione verificano la funzione nel database, **solo per le aziende su piano nuovo**. Elenca prima le RPC, poi proponi la migrazione al titolare **senza applicarla**. Non legare le RLS delle tabelle al piano.

### Fase 5 — Stripe (preparazione, senza attivare)

1. **Solo in modalità test di Stripe**: prodotti e prezzi per i tre piani, mensile e annuale (= 10 mensilità), avvio una tantum (490 / 990 / 1.490 €, da confermare) e gli extra ricorrenti.
   - **Non creare niente in Stripe live senza il via esplicito del titolare.** L'account Stripe è condiviso con altri prodotti AEDIX.
2. `stripe-webhook`: riconosce i nuovi prezzi e mette lo slug sull'azienda. Gli extra ricorrenti scrivono `company_feature_overrides.limit_value`, sommando alla dotazione.
3. `sync-stripe-mrr`: aggiungi i nuovi slug e gli extra nella mappa `ACCESSORI`. Tieni allineata la lista dei metodi non paganti in `src/lib/adminRevenue.ts`: le due liste vanno aggiornate insieme.
4. `/azienda/upgrade`: le tre colonne con i paletti, visibili solo se `in_vendita`. Su iOS resta bloccata come oggi.

### Fase 6 — Collaudo

1. Crea tre aziende `[PROVA PIANI] Gestionale`, `… Business` e `… Pro`, ciascuna con un utente titolare di prova. Le credenziali vanno nel file di seed del progetto, non in chat.
2. Per ogni piano verifica, e scrivi l'esito in `docs/piani/collaudo-piani.md`:

   | Blocco | Prova |
   |---|---|
   | Menu | le voci giuste sono visibili |
   | Indirizzi | le rotte chiuse portano all'upgrade o all'anteprima |
   | Silvio | «quanto ho in banca?» e «qual è il mio punto di pareggio?» rispondono solo dove il piano lo prevede |
   | MCP | le aree chiuse non si leggono |
   | Tetti | il conto, la casella e il numero oltre il limite vengono rifiutati con il messaggio giusto |
   | Contatori | la fattura oltre la dotazione parte ed è addebitata una volta sola |
   | Avvisi | partono all'80% e al 100% |

3. **Fotografia finale di tutte le aziende esistenti: identica alla prima.** Allegala al collaudo.
4. Silvio su un'azienda `enterprise` esistente: stesso elenco di strumenti di prima. Allega il confronto.
5. `npm run typecheck:ci`, test toccati, test critici e build con `build:fast`.
6. Elimina le aziende di prova **solo se il titolare lo chiede**: possono servire per le dimostrazioni.

### Fase 7 — Consegna

- Commit sul ramo `piani-2027`, divisi per fase, con messaggi in italiano che dicono cosa cambia per l'utente.
- Prima di proporre il push, passa il lavoro all'agente `revisore-pubblicazione`, con l'elenco dei file e lo sha.
- Un riepilogo per il titolare:
  - cosa è pronto e cosa no;
  - le migrazioni applicate e quelle solo proposte (fase 4);
  - il confronto delle fotografie;
  - cosa serve da lui per accendere la vendita (Stripe live, `in_vendita = true`, prezzi definitivi).
- **Nessun push, nessuna PR, nessuna attivazione della vendita senza il suo sì.**

---

## Fuori da questo lavoro

- Spostare i clienti esistenti sui piani nuovi, cambiare i loro prezzi, scrivere ai clienti regalati, a Renova o a chiunque.
- Toccare Demo Azienda 2 e le aziende demo.
- Creare prodotti in Stripe live, accendere `in_vendita`, cambiare il sito pubblico.
- Cambiare le RLS delle tabelle in base al piano.

## Decisioni ancora aperte (chiedi al titolare quando servono, non inventarle)

1. ITALA: l'abbonamento M500 vale per tutte le partite IVA o per una sola? Oggi si calcola con la ricarica R10000 a 0,03 €.
2. Recupero dello storico: a pagamento a 0,10 € a documento, o incluso con l'abbonamento annuale?
3. Utenti d'ufficio: tetto 5/8/15 o illimitati? È costruito come limite disattivabile: `limit_value NULL` = illimitato.
4. Prezzo dell'avvio una tantum.
