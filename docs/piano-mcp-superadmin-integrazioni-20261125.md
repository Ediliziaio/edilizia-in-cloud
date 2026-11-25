# Piano — Pagina Integrazioni superadmin + Claude/ChatGPT con i poteri del superadmin

25/11/2026. Due lavori legati: rifare `/admin/impostazioni/integrazioni` e farne il punto
da cui il superadmin collega Claude e ChatGPT alla **propria area**, non a un'azienda.

## Stato al 25/11/2026 — fatto

- **Pagina Integrazioni**: solo «Assistenti AI» e «Facebook e Instagram dei brand». Le chiavi dei
  servizi sono uscite del tutto (si installano nel database/Vault, non da una pagina); le regole di
  Google Calendar sono in *Calendari marketing*. File: `AdminSettingsIntegrations.tsx`,
  `AdminAssistentiAi.tsx`, `AdminGoogleCalendarPolicies.tsx`.
- **Database** (applicate e riallineate):
  - `20290607100000_mcp_area_superadmin` — `mcp_oauth_grants.ambito` (`azienda` | `piattaforma`),
    `mcp_oauth_upsert_grant_piattaforma` (solo super admin), scope `platform:read/write` in
    `mcp_reserve_tool_call`, `admin_mcp_collegamenti`, `admin_mcp_ultime_azioni`.
  - `20290607100100_admin_aziende_azioni_lato_server` — `admin_azienda_cambia_stato`,
    `admin_azienda_proroga_prova`, `admin_regala_piano` (usate anche dalla scheda azienda, che prima
    scriveva dal browser) e il ponte `mcp_superadmin_chiama` (solo service role, elenco chiuso).
- **Consenso** (`/oauth/consent`): il super admin sceglie «Area superadmin» o l'azienda.
- **Server MCP** (`platform-mcp/platformTools.ts`): `statistiche_piattaforma`, `andamento_mrr`,
  `aziende_piattaforma`, `scheda_azienda_piattaforma`, `insoluti`, `lista_piani`,
  `salute_piattaforma`, `registro_attivita`; con conferma: `crea_azienda`, `cambia_stato_azienda`,
  `proroga_prova`, `cambia_piano`, `regala_piano`, `aggiungi_crediti_ai`. CRM ed email del
  superadmin: strumenti aziendali con `company="piattaforma"`. Ogni strumento ricontrolla ruolo e
  lista delle email ammesse. Crea azienda passa da `_shared/creaAzienda.ts` (lo stesso codice di
  `create-company`); la password non passa dall'assistente, arriva con l'email di benvenuto.
- **Provati**: test `mcpConnectorSafety` (ambito, conferma, allowlist) e
  `adminIntegrazioniAssistentiAi`; nel database, in transazioni annullate, proroga/sospensione/
  piano regalato e il consenso di piattaforma (un utente qualunque viene rifiutato).
- **Non fatto**: strumenti per i ticket di assistenza; invio di campagne (resta escluso).


---

## 1. Com'è oggi

### La pagina
`src/components/admin/settings/AdminSettingsIntegrations.tsx` (853 righe):

- tre riquadri KPI («3/5 configurate», «Da configurare», «Stripe Live») che non dicono niente
  di utile: contano chiavi scritte, non collegamenti funzionanti;
- sei card a metà larghezza, ognuna un modulo lungo con campi segreti, occhio, «Valore attuale»,
  «Salva configurazione» e una frase sul fallback d'ambiente ripetuta sei volte;
- dentro ci sono tre cose di natura diversa, mescolate:
  1. **credenziali dell'app** che si scrivono una volta (Stripe, Meta App ID/Secret, Google
     OAuth client, Google Maps, WhatsApp verify token/config ID);
  2. **un collegamento vero** fatto da qui: Facebook/Instagram dei brand → CRM piattaforma
     (`AdminMetaLeadsCard`);
  3. **regole di comportamento** dei calendari delle aziende (`GoogleCalendarPoliciesCard`:
     two-way, crea contatti, importa eventi), che non sono un'integrazione;
- una riga di link a Email, Banche, Webhook, che stanno già nel menu.

### Il server MCP
`supabase/functions/platform-mcp/` esiste e funziona per le **aziende**:

- auth con chiave API (`api_keys`) oppure OAuth di Supabase (`mcp_oauth_grants`), consenso in
  `src/pages/oauth/OAuthConsent.tsx`; Claude.ai e ChatGPT entrano dall'OAuth;
- ~55 strumenti (contatti, opportunità, attività, commesse, listino, email, KPI e i ponti
  `silvio_tool_*`), tutti **dentro un'azienda**;
- una chiave «piattaforma» (company_id NULL, da `/admin/impostazioni/api-mcp`) già oggi lascia
  Claude Code lavorare su **qualsiasi** azienda passando `company` — ma senza nessuno strumento
  del superadmin;
- `mcp_oauth_grants.company_id` è **NOT NULL**: col consenso OAuth un superadmin può collegare
  solo un'azienda. ChatGPT, che accetta solo OAuth, oggi non può entrare nell'area superadmin.
- `mcp_authorize_principal` per un super_admin risponde già `true` anche senza azienda.

### Le azioni del superadmin (dove stanno)
| Area | Lettura | Scrittura | Controllo lato server |
|---|---|---|---|
| Statistiche, MRR | RPC `admin_home_soldi`, `admin_home_aziende`, `admin_home_outreach`, `get_company_health_data`, `mrr_snapshots`, vista `v_insoluti` | — | sì (`is_super_admin`) |
| Aziende | `companies` + `get_company_user_counts_v2`, `get_company_last_access` | crea: edge `create-company` | sì |
| | | **sospendi / riattiva / proroga prova**: `companies.update` dal browser (`useCompanyDetail.ts`) | **solo RLS**, log scritto dal client |
| Piani | `subscription_plans`, `get_plan_company_counts` | edge `admin-change-plan` | sì |
| | | **piano regalato**: `companies.update` dal browser (`CompanySubscriptionTab.tsx`) | **solo RLS** |
| Crediti AI | — | edge `admin-adjust-credits` | sì |
| CRM piattaforma | stesse tabelle delle aziende, azienda `PLATFORM_ADMIN_COMPANY_ID` | idem | come le aziende |
| Email | — | `outreach-send-single`, `send-email-campaign` | sì |
| Gestionale aziende | RPC `silvio_tool_*` | — | sì |
| Ticket | tabella `tickets` | tabella `tickets` | solo RLS |
| Salute, audit | `admin_platform_health`, `admin_errori_raggruppati`, `admin_audit_search` | — | sì |

Le edge function con `requireRole(["super_admin"])` vogliono il **JWT dell'utente** e la sua
email nella allowlist (`_shared/superAdminAllowlist.ts`): il server MCP, che lavora col service
role, non può chiamarle così come sono.

---

## 2. Cosa si costruisce

### 2.1 La pagina Integrazioni, rifatta

Tre sezioni, dall'alto, densa e senza card giganti:

1. **Assistenti AI** (nuova, in cima)
   - due righe, Claude e ChatGPT, con logo, stato («Collegato · usato 3 min fa» / «Non collegato»);
   - «Collega» apre un pannello laterale con l'URL del server da copiare e i 3 passi per
     ciascun client (Claude.ai → Connettori → Aggiungi connettore personalizzato; ChatGPT →
     Modalità sviluppatore → Connettore; Claude Code → comando `claude mcp add`);
   - elenco dei collegamenti attivi in area superadmin: client, livello, invii sì/no, ultimo uso,
     azioni di oggi, **Revoca**;
   - link «Registro azioni» (le chiamate MCP filtrate dall'audit).
2. **Collegamenti della piattaforma** — solo quello che si collega davvero da qui:
   Facebook/Instagram dei brand → CRM (l'attuale `AdminMetaLeadsCard`, compattata).
3. **Credenziali dei servizi** — una tabella compatta, una riga per servizio: logo, nome, stato
   (configurato / mancante / **ultimo test fallito**), aggiornato il, «Prova». Cliccando la riga si
   apre il modulo in un pannello laterale (un servizio per volta), non sei moduli aperti insieme.
   Righe: Stripe (con interruttore Live/Test ben visibile), Meta App, Google OAuth, Google Maps,
   WhatsApp Embedded Signup.

**Esce dalla pagina:**
- i tre KPI;
- le regole dei calendari Google → `/admin/impostazioni/calendari`, dove già si parla di
  sincronizzazione;
- la riga di link a Email / Banche / Webhook (sono nel menu);
- la frase sul fallback d'ambiente ripetuta in ogni card (una nota sola, in fondo).

> Da confermare con te: quali voci intendi con «non devono comparire perché non si collegano da
> qui». Ipotesi del piano: escono le regole calendario e i link; le credenziali restano ma
> diventano righe compatte. Se anche Stripe o WhatsApp vanno via da qui, si spostano nelle loro
> pagine (Fatturato, WhatsApp) senza toccare il backend.

### 2.2 Il collegamento in area superadmin

**Un solo server**, `platform-mcp`, con un secondo **ambito**: «piattaforma».

- **Database** (migrazione idempotente):
  - `mcp_oauth_grants.company_id` diventa nullable, con `ambito text` (`azienda` | `piattaforma`)
    e `CHECK (ambito = 'azienda' AND company_id IS NOT NULL OR ambito = 'piattaforma' AND company_id IS NULL)`;
  - indice unico `(client_id, user_id)` per i grant piattaforma (uno per client);
  - `mcp_oauth_upsert_grant` accetta l'ambito piattaforma **solo se** chi consente è
    `super_admin`; `mcp_authorize_principal` lo ricontrolla a ogni chiamata (già oggi: super_admin
    → true; azienda nulla → false per chiunque altro);
  - livelli nuovi: `superadmin_lettura`, `superadmin_operativo` (+ `invii` separato, spento di serie).
- **Pagina di consenso** (`OAuthConsent.tsx`): se chi accede è super_admin, prima scelta
  «Area superadmin (tutta la piattaforma)» oppure «Un'azienda»; poi il livello. Avviso chiaro su
  cosa potrà fare l'assistente.
- **Server** (`ctxDaOAuth`): grant piattaforma → `company_id = null`, scope del livello
  superadmin; controllo allowlist sull'email dell'utente del grant (stessa regola di
  `requireRole`). Le istruzioni del server cambiano per l'ambito: «sei il superadmin, le aziende
  si scelgono con `company`, il CRM è quello della piattaforma».
- **Chiavi API piattaforma** (Claude Code): ricevono gli stessi scope superadmin, scelti alla
  creazione in `/admin/impostazioni/api-mcp`.

### 2.3 Gli strumenti del superadmin

Regola: **lo strumento chiama la stessa strada del server che usa la pagina**, mai una copia
della logica. Dove la pagina scrive dal browser, prima si crea la RPC (e la pagina passa a usarla:
si chiude anche il buco «solo RLS»).

| Gruppo | Strumento | Strada | Livello |
|---|---|---|---|
| Statistiche | `statistiche_piattaforma` (MRR, aziende attive, prove, churn, outreach) | `admin_home_*` | lettura |
| | `ricavi_e_mrr` (serie mensile, regalati esclusi) | `mrr_snapshots`, `get_company_health_data` | lettura |
| | `insoluti` | `v_insoluti` | lettura |
| | `coorti` | RPC della pagina Cohort | lettura |
| | `salute_piattaforma` (job, errori, funzioni lente) | `admin_platform_health`, `admin_errori_raggruppati` | lettura |
| Aziende | `lista_aziende` (c'è) + filtri stato/piano | — | lettura |
| | `scheda_azienda` (piano, utenti, ultimo accesso, salute, crediti) | RPC esistenti | lettura |
| | `crea_azienda` | logica di `create-company` estratta in `_shared/admin/creaAzienda.ts` | operativo |
| | `cambia_stato_azienda` (sospendi / riattiva / proroga prova) | **RPC nuova** `admin_azienda_cambia_stato` | operativo |
| Piani e crediti | `lista_piani` | `subscription_plans` + `get_plan_company_counts` | lettura |
| | `cambia_piano` | logica di `admin-change-plan` in `_shared/admin/` | operativo |
| | `regala_piano` | **RPC nuova** `admin_regala_piano` | operativo |
| | `aggiungi_crediti_ai` | logica di `admin-adjust-credits` | operativo |
| CRM piattaforma | contatti, opportunità, attività, pipeline | strumenti esistenti con azienda = piattaforma di default | lettura / operativo |
| Email | `scrivi_email` (bozza, mostrata prima) / `invia_email` | `outreach-send-single` (logica estratta) | invii |
| | `prepara_campagna` (solo bozza, mai invio) | tabelle campagne | operativo |
| Gestionale | tutti gli strumenti aziendali esistenti con `company` | `silvio_tool_*` | lettura (scritture solo se richieste) |
| Supporto | `ticket_aperti`, `rispondi_ticket` | `tickets` | lettura / operativo |
| Registro | `registro_attivita` | `admin_audit_search` | lettura |

**Fuori, di proposito** (restano solo nell'interfaccia): purga e cancellazione aziende o utenti,
impersonazione, gestione superadmin e permessi, impostazioni e segreti della piattaforma,
rimborsi e incassi Stripe, invio di una campagna a una lista.

### 2.4 Sicurezza
- Ogni scrittura: `request_id` + `confirmed=true` dopo aver mostrato l'anteprima (convenzione già
  in uso nel server).
- Ogni chiamata in `api_usage_log` **e** in `admin_audit_log` con origine `mcp:<client>`: nel
  registro attività si vede cosa ha fatto l'assistente.
- Tetti: per minuto, per giorno, e per le azioni sensibili (crea azienda, cambia piano, crediti,
  invii) un tetto giornaliero basso (es. 20).
- Email al titolare quando nasce un collegamento in area superadmin (chi, quale client, livello).
- Revoca immediata dalla pagina Integrazioni; il token successivo viene rifiutato.
- Funzioni nuove: `REVOKE ALL … FROM PUBLIC, anon`, `GRANT` solo a `service_role` /
  `authenticated` dove serve la pagina. Revisione col `guardiano-accessi`.
- Nessuno strumento che chiama un provider AI a pagamento (niente `outreach-ai-email`): il
  ragionamento lo fa Claude/ChatGPT, a spese tue.

---

## 3. Lotti

| # | Lotto | Cosa vedi alla fine |
|---|---|---|
| 0 | **Pagina Integrazioni rifatta** (solo frontend) | tre sezioni, credenziali a righe, sezione Assistenti AI ancora vuota |
| 1 | **Fondamenta**: migrazione grant piattaforma, consenso con scelta «Area superadmin», server con ambito piattaforma, `guida_piattaforma` che lo dice, card Assistenti AI con elenco e revoca | colleghi Claude.ai e ChatGPT; l'assistente risponde «sono collegato come superadmin» |
| 2 | **Lettura**: statistiche, ricavi, insoluti, salute, aziende, piani, registro, CRM piattaforma, gestionale | «fammi le statistiche di novembre», «quali aziende sono in prova e scadono questa settimana» |
| 3 | **Aziende e piani**: RPC `admin_azienda_cambia_stato` e `admin_regala_piano` (usate anche dalla pagina), estrazione di crea azienda / cambia piano / crediti in `_shared/admin/` | «crea l'azienda X con piano Pro», «proroga di 14 giorni la prova di Y» |
| 4 | **CRM ed email**: scritture CRM sulla piattaforma, email singola con anteprima e conferma, bozze di campagna | «scrivi a Z e fissa un'attività per giovedì» |
| 5 | **Collaudo e chiusura**: test (estensione di `mcpConnectorSafety.test.ts`, ambito e scope), guardiano-accessi, runbook in `docs/`, prova completa con Claude e ChatGPT | elenco prove superate |

Ogni lotto è pubblicabile da solo. Le edge function si ripubblicano col push (attenzione: se si
tocca solo `_shared/`, toccare anche `index.ts` delle funzioni che lo importano).

## 4. Come proverai tu
1. Integrazioni → Assistenti AI → Claude → Collega: copi l'URL.
2. Claude.ai → Impostazioni → Connettori → Aggiungi connettore personalizzato → incolli l'URL →
   accedi con il tuo account → scegli «Area superadmin» e il livello.
3. ChatGPT → Impostazioni → Modalità sviluppatore → nuovo connettore → stesso URL.
4. Prime prove in sola lettura; poi livello operativo su **Demo Azienda 2**; gli invii per ultimi,
   verso un tuo indirizzo.

---

# Seconda parte (25/11/2026 pomeriggio) — l'assistente fa solo ciò che l'utente può fare, e lavora davvero

## A. Permessi dell'utente che collega (il punto più importante)

Oggi gli strumenti girano col service role e un consenso vale per **tutta l'azienda**: un operaio
che collegasse Claude vedrebbe costi, fatture e commesse di tutti. Regole nuove:

1. **Chi può collegare.** Amministratori come oggi; i dipendenti (company_staff, venditore, call
   center, operaio, subappaltatore) solo se l'azienda accende «Permetti ai dipendenti di collegare
   il proprio assistente» (`companies.ai_connettore_dipendenti`, spento di serie). Clienti, worker e
   commercialisti no. Gli invii reali restano solo agli amministratori.
2. **Cosa vede e fa.** Ogni strumento dichiara i permessi dell'app che servono
   (`platform-mcp/permessiStrumenti.ts`, presi dalla mappa di Silvio `DOMAIN_STAFF_PERMISSION` e dai
   contratti `silvioPermissionContracts`). Per chi non è amministratore:
   - strumento senza permessi dichiarati → nascosto (fail-closed);
   - permesso mancante nella riga `staff_permissions` → nascosto e rifiutato;
   - `sola_lettura`, operaio e subappaltatore → nessuna scrittura;
   - strumenti «ampi» (che restituiscono righe di tutta l'azienda senza filtro per utente) →
     nascosti a chi ha `only_assigned` o è operaio/subappaltatore;
   - importi solo con «Venduto e importi», costi solo con «Costi o Acquisti».
   Il controllo si ripete a ogni chiamata (permessi tolti = effetto immediato).
3. **Dove lo vede il dipendente.** Il mio profilo → «Assistente AI»: istruzioni, i propri
   collegamenti, revoca. L'amministratore vede e revoca tutti quelli dell'azienda.

## B. Preventivi dall'assistente (con le strade che esistono)

| Strumento | Strada riusata | Note |
|---|---|---|
| `proponi_voci_preventivo` | `ai-genera-preventivo-v2` (chiamata interna) | voci dal listino dell'azienda; crediti AI dell'azienda |
| `crea_preventivo` | `silvio_create_quote_draft` | numero vero, totali e IVA dal database, bozza; controlla `can_edit_preventivi` |
| `pdf_preventivo` | `generate-quote-pdf` (chiamata interna) | link firmato valido 1 ora |
| `invia_preventivo_in_firma` | `send-quote-signature` col token dell'utente (solo OAuth) | invio reale: conferma + «invii» |
| `fissa_appuntamento`, `crea_sopralluogo` | stesse scritture degli esecutori di Silvio | |

## C. File dall'assistente a Edilizia in Cloud (planimetrie e computi)

Il file allegato in Claude/ChatGPT non arriva agli strumenti. Strada: `link_caricamento` crea un
caricamento firmato (2 ore, un solo percorso) e restituisce una pagina `/carica/<token>` dove
l'utente trascina il file, senza login. Poi:
- `leggi_planimetria` → `planimetria-genera` (ingresso «documento», 1 credito render) col token
  dell'utente, e `planimetria_crea` per salvarla;
- `leggi_computo` → `computo_uploads` + `computo-ai-extract`, poi `apply_computo_review` →
  preventivo. Tutto col token dell'utente: valgono le sue regole sulle righe.
In alternativa Claude legge la pianta da sé e passa stanze e misure a `proponi_voci_preventivo`.

## D. Superadmin, in più

- `assistenza_aperta`: chat e ticket di assistenza delle aziende in attesa di risposta.
- `aziende_a_rischio`: chi non entra da giorni, prove in scadenza, pagamenti falliti.
- Avviso via campanella e email quando nasce un collegamento all'area superadmin.

## Ordine di lavoro
A (permessi) → B (preventivi, appuntamenti) → C (caricamento e lettura file) → D → pagine
(profilo dipendente, interruttore azienda) → test e collaudo.

## Stato della seconda parte (25/11/2026 sera) — fatto

- **A. Permessi** — migrazione `20290607100200_mcp_collegamento_dipendenti` (applicata e riallineata):
  `companies.ai_connettore_dipendenti`, `mcp_e_admin_azienda`, `mcp_dipendente_collegabile`,
  `mcp_authorize_principal` e `mcp_oauth_upsert_grant` aggiornate (il dipendente non ottiene mai gli
  invii), `mcp_revoca_collegamento`, `azienda_ai_connettore_dipendenti` (spegnere chiude i
  collegamenti dei dipendenti). Server: `permessiStrumenti.ts` + `caricaAttore` in `index.ts`,
  riletti a ogni richiesta. Provato nel database: spento → rifiutato; acceso → entra senza invii;
  rispento → fuori.
- **Pagine**: interruttore nel connettore Claude/ChatGPT dell'azienda (`InterruttoreDipendenti`),
  scheda «Il tuo assistente AI» nel profilo del dipendente (`AssistenteAiPersonale`), consenso aperto
  ai dipendenti quando l'azienda lo permette.
- **B/C. Strumenti azienda** (`aziendaTools.ts`): `proponi_voci_preventivo`, `crea_preventivo`,
  `pdf_preventivo`, `invia_preventivo_in_firma`, `fissa_appuntamento`, `crea_sopralluogo`,
  `link_caricamento` (pagina pubblica `/carica-file`), `leggi_file_caricato`, `importa_computo`.
- **D. Superadmin**: `aziende_a_rischio`, `assistenza_aperta`.

**Da fare dopo:** pianta disegnata dall'assistente (`planimetria-genera` + `planimetria_crea`
richiedono il token dell'utente e salvano dal browser: serve una funzione che salvi lato server);
voci del preventivo legate agli articoli del listino (`silvio_create_quote_draft` non salva
`article_template_id`); traduzioni dei testi nuovi per i dipendenti stranieri; email al titolare
quando nasce un collegamento all'area superadmin.

## File allegati in chat → Edilizia in Cloud (aggiunta del 25/11/2026)

Verificato: si può, senza clic dell'utente.
- **ChatGPT**: `carica_file_dalla_chat` dichiara `_meta["openai/fileParams"] = ["file"]`; ChatGPT passa
  `{ download_url, file_id, file_name, mime_type }` e il server scarica (solo da domini OpenAI, max 50 MB)
  e salva in `planimetrie` o `computi`. Problemi segnalati da altri sviluppatori: da telefono il
  riferimento può arrivare incompleto; in una chiamata su dieci circa il file manca.
- **Claude.ai**: l'allegato sta nella sandbox dell'esecuzione del codice. `link_caricamento` restituisce
  anche `caricamento_diretto` (URL firmato per PUT) e Claude lo carica con curl. Serve l'esecuzione del
  codice attiva e il dominio `rsbrguhkodgnqfomrevo.supabase.co` tra i domini consentiti.
- Altrimenti resta la pagina `/carica-file` per l'utente.
