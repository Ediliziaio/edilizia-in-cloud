# Errori in produzione — controllo del 28/10/2026

Finestra guardata: 25–28 ottobre 2026 (i log delle edge function si leggono a
finestre di 24 ore: tre finestre contigue), più i registri del database su 7–14
giorni, dove la conservazione lo permette.

Fonti: `function_edge_logs` (status ≥ 400), `function_logs` (livello error e
`EarlyDrop`), `postgres_logs`, `cron.job_run_details`, `net._http_response`,
`system_health_metrics`, `ai_allarmi`, `email_delivery_log`,
`email_estrazione_tentativi`, e i due controlli di Supabase (`get_advisors`).

Una nota di metodo su `EarlyDrop`: in queste 24 ore `function_logs` ne conta
oltre settemila, distribuiti su quasi tutte le funzioni, comprese quelle che
rispondono 200 in cento millisecondi. Su questa versione del runtime è il motivo
di chiusura ordinario di un worker inattivo, non la prova che il lavoro si sia
interrotto: non è stato usato come segnale. I guasti qui sotto sono tutti
ancorati a un errore vero — uno status ≥ 400, una riga di livello `error`, un
timeout di `pg_net` o un `ERROR` di Postgres.

---

## 1. Corretto — PDF del preventivo: 500 su `ReferenceError: global is not defined`

**Cosa:** `generate-quote-pdf` ha risposto 500 cinque volte dalle 19:25 del
27/10 alle 09:26 del 28/10 (poi ancora alle 17:13). Nei log della funzione:

```
event loop error: ReferenceError: global is not defined
    at _shared/preventivoRenderer.mjs:6:249595
```

**Causa:** a quella posizione del bundle c'è **js-md5**, dipendenza di
`@react-pdf`. Decide dove attaccarsi così:

```js
a = typeof process == "object" && process.versions && process.versions.node;
a ? n = global : …
```

Il banner che `scripts/preventivi-render/build.mjs` mette in testa al bundle
installa `globalThis.process` da `node:process` — che ha `versions.node` — e
quindi il ramo scatta **sempre**. In Deno `global` non esiste: leggerlo è un
ReferenceError, non `undefined`. È intermittente perché md5 lo chiama solo su
certi documenti (font e immagini da mettere in cache). Lo stesso banner, e
quindi lo stesso guasto latente, stava nel bundle del PDF del bagno
(`bgn-genera-pdf/_render.mjs`), che il bot manda su WhatsApp.

**Correzione:** una riga in più nel banner dei due build —
`if(!globalThis.global) globalThis.global=globalThis;` — e la stessa riga
aggiunta ai due bundle già committati, **senza rigenerarli**: l'esbuild del
lockfile (0.25.12) non è quello che ha prodotto i bundle in `HEAD` e una
rigenerazione avrebbe cambiato migliaia di byte di minificazione senza motivo.
I due file differiscono da `HEAD` per una riga sola.

**Prova:** `src/test/logic/renderBundleShimGlobal.test.ts` (4 verdi). Esegue il
ramo di js-md5 in un contesto `node:vm` nuovo — c'è `process`, non c'è `global`,
come in Deno — e mostra che senza lo shim muore con `ReferenceError` e con lo
shim passa; poi controlla che entrambi i bundle committati abbiano lo shim nel
banner, legandosi alla presenza del ramo (`n=global:`) e non al nome della
dipendenza. Togliendo lo shim da un bundle il test diventa rosso: verificato.

`scripts/funzioni-da-ripubblicare.mjs` conferma che al push la CI ripubblica
`bgn-genera-pdf` e `generate-quote-pdf`.

---

## 2. Corretto — la coda di `pg_net` ferma due minuti ogni quattro ore

**Cosa:** in `net._http_response` i due soli timeout di oggi, alle 16:13 e alle
20:13, 120.002 ms ciascuno. Minuto 13, ogni 4 ore: il job
`meta-ads-sync-insights-4h` (`13 */4 * * *`), con
`timeout_milliseconds := 120000`.

Il «DNS time» dei messaggi non c'entra, come da nota in CLAUDE.md: qui è
`0.024 ms` e tutto il tempo sta in `HTTP Request/Response time`.

**Causa:** `pg_net` ha un solo worker e consuma il lotto dentro una
transazione; finché la richiesta più lenta non risponde, **tutta** la coda dei
cron è fermata. `meta-ads-sync-insights` girava sotto `Deno.serve` nudo e si
prende oltre due minuti. Era già il primo nome dell'elenco scritto in testa alla
migrazione `20280920230000_cron_attese_brevi_pg_net` (396 secondi al giorno
sulla coda, p50 66 s): restava da convertire.

**Correzione:** passata a `serveConMetricheRapida("meta-ads-sync-insights", …)`.
A `pg_net` risponde 202 entro cinque secondi e finisce il lavoro sotto
`EdgeRuntime.waitUntil`; «Aggiorna ora» dall'interfaccia continua a ricevere
l'esito completo, perché `pg_net` si riconosce dallo User-Agent. Come effetto
collaterale la funzione entra in `system_health_metrics`, dove finora non
compariva: la sua durata vera non era misurata da nessuna parte.

**Non fatto, e volutamente:** abbassare a 15.000 ms l'attesa del job. CLAUDE.md
dice «prima la funzione, poi l'attesa», e la funzione è rapida solo dal momento
in cui la CI la ripubblica. Da fare **dopo** il deploy, con la verifica che
l'attesa dei successivi giri stia sotto i 5 secondi:

```sql
select cron.alter_job(129, command := replace(
  (select command from cron.job where jobid = 129),
  'timeout_milliseconds := 120000', 'timeout_milliseconds := 15000'));
```

---

## 3. Corretto — `email-triage-ai`: 322 errori in 24 ore, tutti lo stesso muro

**Cosa:** 322 righe in 24 ore, la voce più numerosa di tutto `function_logs`:

```
[email-triage] ai failure: AiRouterError: Registra una carta di pagamento
aziendale per usare questo strumento (Impostazioni → Fatturazione).
```

Non è di questi giorni: la prima email rimasta senza classificazione è del
**18/09/2026**, e in tutto sono **1.884**. Negli ultimi quattordici giorni il
ritmo è stabile fra le 20 e le 140 al giorno (111 oggi).

Nelle ultime 7 giorni, per azienda:

| azienda | metodo di pagamento | stato | email non classificate |
|---|---|---|---|
| Innovasol srl | `none` | trial | 274 |
| New Habitat S.r.l. | `none` | trial | 96 |
| Palma S.r.l. | `none` | trial | 72 |
| Dimora Torino | `none` | trial | 25 |
| Demo Azienda S.r.l. | `none` | suspended | 5 |

**Causa:** `aiRouterComplete` ha un gate «carta obbligatoria»
(`_shared/requirePaymentMethod.ts`) che lancia **prima** di qualunque chiamata al
provider. `processTriagePending` lo scopriva una email alla volta: ogni email
bruciava i suoi tre tentativi — con il rinvio a 5 e 10 minuti — contro un muro
che in cinque minuti non si sposta, e scriveva una riga di errore per tentativo.
Il poller della posta richiama il triage a ogni scarico, fino a 25 email per
giro: da lì le centinaia di righe.

**Correzione:** il gate si guarda **una volta per azienda** e l'azienda senza
carta si salta, con **una** riga di log al posto di N. I tentativi restano
interi: quando la carta arriva, le email ancora dentro la finestra dei tre
giorni si classificano al primo giro utile — prima venivano consumati tutti e
tre contro il muro. La risposta porta un contatore nuovo,
`saltate_senza_carta`.

**Prova:** `src/test/logic/emailTriageSaltaSenzaCarta.test.ts` (3 verdi). Prende
il gestore vero dal sorgente con `gestoriVeri` e verifica che dieci email della
stessa azienda senza carta facciano **una** lettura e **una** riga di log, che
l'azienda con la carta passi e non finisca nel log, e che due aziende nello
stesso giro siano giudicate una per una.

**Resta a Florin, ed è una decisione di prodotto, non un guasto:** tutte e
quattro le aziende sono **in prova** e senza carta. La correzione toglie il
rumore e lo spreco, non cambia l'esito: quelle email restano non classificate.
Se il triage deve funzionare anche in prova, va deciso (e aggiunto a
`GIFTED_EXEMPT_METHODS`, o esentato per gli account in trial). Se invece non
deve, il titolare dell'azienda non ne sa nulla: non c'è nessun avviso in
interfaccia che dica «la posta non viene classificata perché manca la carta».

---

## 4. Corretto — `silvio-memory-extract`: 49 errori alle 04:08, tutti `[object Object]`

**Cosa:** alle 04:08:13–14 del 28/10, 49 righe:

```
[silvio-memory-extract] user <uuid> failed: [object Object]
```

Di pari passo, in `postgres_logs`, **47 `ERROR: Actor unavailable`**.

**Causa, in due pezzi.**

*Il guasto:* `silvio_users_needing_memory_extract` restituiva 50 bersagli e **47
erano utenti con `profiles.is_blocked = true`**. Per ognuno
`silvio_claim_memory_batch` chiama `silvio_context_actor_roles`, che su un
profilo bloccato alza `Actor unavailable` (ERRCODE 42501). Il lavoro vero — tre
utenti — finiva sepolto sotto 47 errori garantiti.

*Il perché non si capiva:* `const msg = e instanceof Error ? e.message :
String(e)`. Un errore di PostgREST è un oggetto semplice, non un `Error`:
`String(e)` dà `[object Object]`, e la causa non si leggeva da nessuna parte.

**Correzione, due migrazioni e un file nuovo.**

1. Migrazione **`20281028213000_silvio_memoria_salta_utenti_bloccati`**
   (applicata con `apply_migration`, registro riallineato al nome del file): la
   coda applica la stessa condizione dell'attore — profilo esistente e non
   bloccato. Nessun altro cambio di semantica.
2. `supabase/functions/_shared/messaggioErrore.ts`, usato nel punto che
   scriveva `[object Object]`: tiene il messaggio quando c'è, altrimenti il
   JSON, e mette davanti il codice SQLSTATE.

**Prova:** la migrazione provata **prima** in una transazione annullata da sé
(`begin; create or replace …; select …; rollback;`): 50 bersagli → 3, zero
bloccati. Dopo l'applicazione vera,
`select count(*) from silvio_users_needing_memory_extract(24,4)` → **3**.
Per il logger, `src/test/logic/messaggioErroreEdge.test.ts` (6 verdi), che fra
l'altro fissa nero su bianco il comportamento di prima
(`String(errorePostgrest) === "[object Object]"`) e il nuovo
(`"[42501] Actor unavailable"`).

**Nota a margine, non toccata:** `silvio_users_needing_memory_extract` ha un
parametro `p_lookback_hours` che il corpo non usa — era già così, e cambiarlo
cambierebbe quanti messaggi entrano in ogni giro. Da valutare a parte.

**Resta aperto:** in tutto il repository ci sono **214** occorrenze di
`e instanceof Error ? e.message : String(e)`. Sostituito solo il punto che ha
prodotto errori veri in questi giorni; gli altri sono una bonifica da fare con
calma, non un guasto in corso.

---

## 5. Corretto — `email-ai-estrai-allegato`: 502 su 11 chiamate su 17

**Cosa:** 11 risposte 502 in 24 ore su 17 chiamate totali (il 65%), tutte da
`pg_net`. Le riuscite durano 10–17 secondi, le fallite 20–27. In
`email_estrazione_tentativi`: **5 allegati su `parse_failed`, uno con 14
tentativi** — ognuno una chiamata Sonnet pagata sullo stesso PDF.

**Causa:** tutte le risposte registrate cominciano con ` ```json ` e un oggetto
scritto in bella copia, e si interrompono a metà di un valore. Lo schema chiesto
dal prompt — un oggetto `valore`/`conf` per ogni campo, più l'array `righe` —
non sta in `max_tokens: 1500`: la risposta viene troncata. Il vecchio
`visText.match(/\{[\s\S]*\}/)` è avido e si fermava all'**ultima graffa
interna**, consegnando a `JSON.parse` un frammento. E `callOpenRouter`
restituisce `finish_reason`, che la funzione ignorava: il troncamento era
scritto nella risposta e nessuno lo leggeva.

**Correzione:**
- `max_tokens` da 1500 a 4000. Il tetto non costa: si paga l'uscita prodotta.
- `supabase/functions/email-ai-estrai-allegato/jsonDalModello.ts`: leva la
  staccionata markdown e prende l'oggetto a graffe bilanciate (le graffe dentro
  le stringhe non contano). Se non si bilancia, lo dice.
- `finish_reason === "length"` e graffe non bilanciate diventano l'esito
  **`troncato`**, con il motivo scritto al posto del dump della risposta. Il
  tetto dei tentativi del dispatcher (`silvio_email_dispatch_fatture`: sei
  tentativi per gli esiti diversi da `credito`) vale anche per `troncato`, così
  lo stesso documento non si ripaga all'infinito.

**Prova:** `src/test/logic/estrazioneAllegatoJsonTroncato.test.ts` (6 verdi),
scritto sulla risposta vera tagliata dove la tagliava il tetto. Un test mostra
di proposito che il vecchio `match` trovava qualcosa e che `JSON.parse` di quel
qualcosa lancia.

**Attenzione da tenere a mente:** il 25/10 `ai_allarmi` ha registrato
`402 This request requires more credits, or fewer max_tokens. You requested up
to 4000 tokens, but can only afford 2493`. Con il saldo OpenRouter sottile un
tetto più alto può diventare un 402 — ma è il saldo il problema, e l'allarme
credito AI c'è già e funziona (quell'allarme è stato aperto e richiuso da sé).
Oggi nessun allarme è aperto.

---

## 6. Corretto — MRR e numeri di ogni azienda leggibili da qualunque utente loggato

Non è un errore prodotto dalla piattaforma, ma è venuto fuori dal controllo di
Supabase (`materialized_view_in_api`) ed è troppo grosso per lasciarlo scritto
solo in un elenco di avvisi.

**Cosa:** `set role authenticated; select count(*) from
public.mv_company_metrics` → **28 righe**, con `mrr_listino`, `mrr_incassato`,
`utenti_totali`, `clienti`, `ordini` e `ultimo_accesso` di **ogni** azienda.
Stessa cosa per `admin_dashboard_summary`. Una vista materializzata **non**
rispetta le policy RLS: col GRANT a `authenticated`, qualunque utente loggato di
qualunque azienda poteva chiederle a PostgREST.

**Perché era sicuro chiuderle:** le sette funzioni che le interrogano
(`admin_order_companies`, `admin_home_aziende`, `admin_home_soldi`,
`admin_kpi_saas`, `admin_consumi_aziende`, `admin_briefing_operativo`,
`get_company_user_counts_v2`) sono **tutte** `SECURITY DEFINER`, e
`admin_dashboard_summary` la legge solo la edge function
`admin-dashboard-data` col service role: il privilegio del chiamante non viene
controllato. Il ripiego di `/admin/aziende` quando l'RPC non risponde interroga
`companies`, non la vista.

**Correzione:** migrazione **`20281028214500_viste_materializzate_admin_chiuse_ad_authenticated`**
(applicata, registro riallineato). Solo privilegi: nessuna riga scritta.

**Prova:** prima, `set local role authenticated; select count(*)` → 28 righe
(dentro una transazione annullata). Dopo:
`has_table_privilege('authenticated', …)` → `false` per entrambe, `anon` →
`false`, `service_role` → `true`, e `admin_order_companies('mrr', true, …)`
restituisce ancora le sue 5 righe.

---

## Spiegati e lasciati come sono

Errori veri, ma che fanno il loro mestiere: rifiutano. Nessuno va corretto.

| funzione | status | quanti | cosa è |
|---|---|---|---|
| `platform-mcp` | 405 | 16 (31 il giorno prima) | GET da `claude-code/2.1.31x (sdk-cli)`: un client MCP che sonda; la funzione accetta solo POST. Rumore di sviluppo, non della piattaforma. |
| `genera-pos` | 401 | 5+5 | `curl/8.7.1` senza header di autorizzazione (`UNAUTHORIZED_NO_AUTH_HEADER`): il gateway respinge prima della funzione. |
| `billing-connect` / `billing-import` / `billing-sync` / `billing-massive` | 401 | 4 | Tutte e quattro fra 10:40:33 e 10:40:36 del 27/10: una raffica da uno script senza credenziali. |
| `silvio-chat`, `ai-customer-ltv`, `ai-preventivo-conversazione/audio` | 402 | 5 | Gate del credito/carta: è la risposta prevista, quella che fa aprire la finestra di ricarica. |
| `payments-connect`, `manage-super-admins`, `lead-scraper`, `email-oauth-diagnostic` | 403 | 6 | Rifiuti di autorizzazione. |
| `public-booking-gestisci`, `genera-pos`, `bank-distyra` | 409 | 4 | Conflitti: slot già preso, lavoro già in carico. |
| `ai-preventivo-conversazione` e sotto-rotte | 401 | 11 (25/10) | Sessione scaduta sul telefono: il client rifà il login e riprova. |
| — | `Http: connection closed before message completed` | 3 | Il browser ha chiuso prima della fine. Non è un guasto. |

---

## Resta aperto — decide Florin, oppure è lavoro a sé

### Costa soldi: non toccato

1. **Crediti email a zero: Ener Italia, 859 invii falliti in 7 giorni.**
   `email_delivery_log`: 4.653 `sent` e **860 `failed`**, di cui 859 di Ener
   Italia S.p.A. fra il 21 e il 27 ottobre, tutti
   `Crediti email insufficienti: saldo 0.0000 EUR, servono 0.0015 EUR`. È il
   seguito del caso del 27/10 (2.040 invii persi): **la ricarica è una
   decisione di spesa**. L'altro fallito è Dimora Torino il 26/10 alle 12:52:55
   — ed è lo stesso evento del 500 di `send-quote-signature` di quel minuto.
   L'**allarme crediti email** (il gemello di `ai_allarmi` per la posta) resta
   da fare: oggi il saldo a zero è silenzioso.

2. **`bank-distyra`: la connessione bancaria non funziona per configurazione.**
   Il 28/10, fra le 06:37 e le 08:00, 5 × 500, 5 × 404, 3 × 401, 2 × 409. Nei
   log della funzione due messaggi espliciti del provider:
   - `Distyra 401 su /v1/connect/hosted-link: invalid_key The API key is
     missing, malformed, revoked, or expired`
   - `Distyra 403 su /v1/connect/hosted-link: connect_branding_required Set
     your Connect brand name in the portal (Connect, Branding)`

   Non è un difetto del codice: la chiave va rinnovata e il nome del brand va
   messo nel portale Distyra. Due cose che solo Florin può fare.

3. **`email-triage-ai` per le aziende in prova** — vedi il punto 3: se il
   triage deve funzionare in prova è una scelta di prodotto (e di costo AI).

### Lavoro tecnico a sé

4. **Tre funzioni lente chiamate da cron ancora da convertire.** Dall'elenco in
   testa a `20280920230000_cron_attese_brevi_pg_net`, oggi tutte e tre girano
   ancora sotto `Deno.serve` nudo e con l'attesa del job a 120.000 o 150.000 ms:
   `meta-diagnostica-messaggi`, `auto-genera-giornale-cantiere`,
   `elena-cs-health-daily`. Nessuna ha prodotto timeout nella finestra guardata
   (`net._http_response` conserva poche ore), ma il meccanismo è identico a
   quello del punto 2. In più **non sono misurate**: non compaiono in
   `system_health_metrics`, quindi quanto tengano ferma la coda non lo sa
   nessuno — esattamente la condizione in cui era `meta-ads-sync-insights`.

5. **`email_estrazione_tentativi` non registra l'uso AI.** `ai_model_usage_log`
   non ha **nessuna** riga con `task_kind = 'email_estrai_allegato'`, benché la
   funzione chiami Sonnet in visione su PDF fino a 12 MB. Negli ultimi tre
   giorni il registro ha solo `email_ai_l3_batch` (32) e
   `audio_transcription` (13): la spesa di questa funzione non si vede
   nell'analisi dei costi. Da capire se è `callOpenRouter` chiamato per una via
   che non scrive, o un filtro sul `company_id`.

6. **Una data di ricezione impossibile.** Su `email_inbox` c'è una riga di
   Innovasol con `received_at = 2037-09-18`. Viene dall'intestazione `Date:` di
   un'email, presa per buona. Finisce in cima a ogni ordinamento per data. Non
   ha fatto danni visibili, ma una data futura va rifiutata allo scarico.

7. **I due controlli di Supabase, per intero.** Nessuno di questi produce errori
   oggi; è lo stato strutturale, già noto dagli audit precedenti.

   Sicurezza: 8 × `security_definer_view` (ERROR — fra cui le viste dei flussi
   pubblici a token: `public_booking_calendars`, `public_appointment_slots`,
   `public_calendar_busy_slots`, `public_calendar_owner_prefs`,
   `ai_personas_public`, `referral_leaderboard_public`, `fattura_pagamento_stato`,
   e `v_appalto_rapportini_da_rendicontare`, nuova e di un'altra sessione);
   910 × `authenticated_security_definer_function_executable`;
   53 × `function_search_path_mutable`;
   52 × `anon_security_definer_function_executable`;
   26 × `rls_enabled_no_policy` (INFO);
   2 × `extension_in_public` (`vector`, `pg_trgm`);
   2 × `materialized_view_in_api` — **questi due corretti**, punto 6.

   Prestazioni: 4.164 × `multiple_permissive_policies`;
   1.430 × `unused_index`; 1.009 × `unindexed_foreign_keys`;
   170 × `auth_rls_initplan`; 12 × `no_primary_key` (quasi tutte tabelle di
   backup e di staging); 2 × `duplicate_index`
   (`ordini_variazione`, e `sal_sub_pagamenti` che è di un'altra sessione);
   1 × `auth_db_connections_absolute` (il server Auth è fermo a 10 connessioni:
   aumentare la taglia dell'istanza non lo migliora da sé).

---

## Attenzione all'ordine del push

Il registro `supabase_migrations.schema_migrations` contiene ora, oltre alle mie
due, anche sette versioni `20281028150000`–`20281028170000` applicate dalla
sessione che lavora sugli appalti. **I file di quelle sette non stanno in questo
branch**, stanno nel suo. Il controllo Supabase Preview confronta il registro con
i file in `supabase/migrations/`: se questo branch arriva su `main` prima del
suo, quelle sette righe risultano senza file e il controllo diventa rosso — è
esattamente il guasto del 27/10/2026. I due branch vanno uniti insieme, o il suo
per primo.

---

## Dove non ho guardato, e perché

- `cron.job_run_details` con `status <> 'succeeded'` negli ultimi 7 giorni:
  **nessuna riga**. I cron partono tutti; i guasti stanno dentro le funzioni.
- `net._http_response` conserva poche ore (oggi 1.491 righe, tutte del 28/10):
  dei timeout dei giorni prima non resta traccia. Per quelli serve
  `system_health_metrics`, che però misura solo le funzioni avvolte da
  `conMetriche` — ed è il buco del punto 4.
- `ai_allarmi`: zero allarmi aperti. Gli ultimi, del 24–25/10, sono
  `credito_esaurito` su OpenRouter, aperti e richiusi da sé entro i 15 minuti.
