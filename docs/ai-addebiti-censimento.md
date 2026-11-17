# AI a pagamento: chi la paga — censimento del 15/11/2026

Area A del piano `docs/piano-ai-addebiti-e-automazioni-20261115.md`. Obiettivo: ogni
chiamata a un servizio AI a pagamento è **addebitata all'azienda che la causa**, con
la tariffa configurata, oppure è **dichiarata qui** come costo della piattaforma.

Le misure sono state rifatte il 15/11 sui dati di produzione (ultimi 30 giorni): i
numeri del piano erano ancora quelli. Il censimento del codice copre frontend, edge
function, cron, webhook e worker. Nel frontend non c'è alcuna chiamata a pagamento
verso un provider: le uniche due chiamate dal browser leggono l'elenco pubblico dei
modelli o controllano una chiave scritta dall'admin, e sono gratuite.

## 1. Le strade di addebito

Sono **tre** strade, non due. Tutte scalano lo stesso portafoglio: `ai_credits`
(omaggio del mese prima, poi `company_credit_pool` con `pool_consuma`). Tutte
scrivono la riga di storico `ai_credit_transactions` (`consumo_ai`), che è quella
che finisce in `credit_transactions_unified`.

| Strada | Funzione SQL | Registro | Da dove viene il ricarico | Chiave di idempotenza | Lock sul saldo |
|---|---|---|---|---|---|
| Router `aiRouterComplete` | `charge_ai_call` | `ai_call_ledger` | Dal tier del compito (`ai_router_config.tier_key` → `ai_pricing_tiers`): prezzo a token `cost_per_1m_* × markup_pct`, con il pavimento `cost_reale × min_markup_multiplier` (3×). Prima di tutto vale l'override per azienda (`ai_pricing_overrides`). | Sì: unica su `idempotency_key`. Dal 15/11 una chiamata **nuova** con chiave già usata si addebita con `chiave~gen~<generation_id>` | `FOR UPDATE` su `ai_credits` |
| `chargeDirectAiCall` (`directAiLedger.ts`), `addebitaUnitario` (nuovo) | `charge_ai_call` | `ai_call_ledger` | Come il router, col tier passato dal chiamante. Senza token: `costo × (1 + markup/100)` più il pavimento. | Sì | Sì |
| `chargeAndLogDirect` (`ai-provider/directApi.ts`), `claudeMessagesBilled`, `chat()` di `ai-provider` | `addebita_ai_diretta` (nuova) → `deduct_ai_credits_with_markup` | `ai_model_usage_log` | `ai_pricing_markup`, per compito e modello (`task+model` → `task_catchall` → `default+model` → `default_catchall`). Il ricarico va dall'80% al 300%. | Dal 15/11 sì: colonna `idempotency_key` (indice unico) + advisory lock | `FOR UPDATE` su `ai_credits` |

Le unità che non si contano a token hanno una strada a parte:

- **Render**: crediti render. `deduct_render_credit_v3` prima della generazione, `refund_render_credit_all` se fallisce. Nel registro del router il compito risulta `skipped` («pagato in crediti render»).
- **Voce** (ElevenLabs e Fish): minuti di voce. `saldoVoce` prima della chiamata, `settleVoiceConversation` dal webhook di fine chiamata.
- **WhatsApp**: crediti WhatsApp, fuori da questo censimento.

**Cosa vede l'azienda.** La vista `consumi_ai_azienda` unisce le due tabelle dei
consumi. È `security_invoker`, quindi ogni azienda vede solo le sue righe, e mostra
solo ciò che serve all'azienda: compito, modello, token, importo addebitato e una nota
(«pagato in crediti render», «non addebitato: …», «stessa richiesta ripetuta»). Il
nostro costo e il ricarico non ci sono. La pagina Crediti → «Consumo AI del team»
(`TeamAIUsage.tsx`) ora legge da qui. Prima leggeva solo `ai_call_ledger`, quindi i
consumi diretti non comparivano: la qualificazione lead (2,19 € in 30 giorni), la
lettura degli ordini (`vision_po`), le trascrizioni e il bot del titolare. Il saldo e
lo storico movimenti erano già unici.

**Cosa vede il titolare della piattaforma.** `ai_regole_ricarico(giorni)` è riservata
al super admin. Per ogni compito mostra la regola applicata, il costo reale,
l'importo addebitato e il ricarico effettivo. `metriche_ai_azienda(azienda, giorni)`
dà le chiamate per compito, il costo medio e i lavori chiusi senza AI.

**Come arriva in fattura.** L'AI non si fattura a consumo. L'azienda compra i crediti
in anticipo (`ai_credit_topups` e portafoglio unico): la fattura è quella della
ricarica, e il consumo scala crediti già pagati. L'omaggio mensile
(`free_balance_eur`, `ensure_monthly_free_ai_credits`) si consuma per primo. Le
eccedenze non esistono: a saldo zero la chiamata si blocca (`precheck_ai_credit` →
«Saldo € 0,00 insufficiente»). I limiti del piano sono il tetto mensile
`hard_cap_eur_monthly` (blocca), la soglia `soft_cap_eur_monthly` (avvisa) e
`gateAiPayment` / `checkPaymentMethod` (senza carta, niente AI a consumo). Non c'è un
«consumo incluso nel piano» a numero di chiamate (vedi §6, domanda 3).

## 2. Misure del 15/11 (30 giorni)

### Gli scarti del router, uno per uno

Ogni riga di `ai_router_usage_log` è stata confrontata con `ai_call_ledger` per
azienda, compito, token in e token out, entro 30 secondi.

| Compito | Chiamate | Addebiti | Righe senza addebito | Spiegazione |
|---|---|---|---|---|
| `preventivo_genera` | 526 | 489 | 37 (0,34 $) | **Buco.** 37 su 37 hanno una chiamata gemella precedente con lo stesso input, e 36 sono su Demo 2. Stessa richiesta ripetuta, chiave stabile, nessuna cache: il provider ha lavorato di nuovo, ma `charge_ai_call` ha risposto `idempotent_replay` e non ha scalato niente. |
| `pdf_vision_extract` | 107 | 96 | 11 (0,028 $) | Stesso difetto: 11 su 11 con un gemello, 10 su Demo 2. La chiave per pagina (`…:page:N`) è stabile. |
| `silvio_commessa_lettura` | 32 | 23 | 9 | Stesso difetto (`${chiaveOcr}:${pagina}`), tutte su Demo 2. |
| `preventivo_analisi` | 3 | 1 | 2 | Stesso difetto, Demo 2. |
| `listino_abbina_voci` | 10 | 9 | 1 | Stesso difetto, Demo 2. |
| `outreach_reply_intent` | 3 | 0 (3 `skipped`) | 3 | Giusto: outreach della piattaforma, `skipCharge`. Il costo resta registrato (`status='skipped'`). |
| `planimetria_genera` | 145 | 0 (111 `skipped`) | — | Giusto: si paga in crediti render. |
| `silvio_admin_chat`, `silvio_chief_of_staff` | 60 | 0 | 60 (0,30 $) | Senza azienda: Silvio dei super admin. Costo della piattaforma. Prima stava solo nel registro analitico, ora c'è anche in `platform_ai_usage_log`. |

Gli altri casi «errore» del registro sono **giusti**: 515 Silvio, 11 riassunti, 8
punteggi lead e 2 OpenWA risultano «error» perché `precheck_failed: insufficient_balance`
li ha bloccati prima del provider, a costo 0. È il credito finito che funziona.

**Correzione.** Una chiave di idempotenza protegge dal doppio addebito della **stessa
chiamata**, non deve nascondere una chiamata nuova che il provider ci fa pagare.
`aiRouter.ts`: se `charge_ai_call` risponde `idempotent_replay` dopo una risposta
nuova del provider, la chiamata si addebita con `chiave~gen~<generation_id>`. La stessa
generazione resta idempotente. Il retry che non richiama il provider (cache, richiesta
protetta da `runGuardedAiRequest`) continua a non costare niente.

### La strada diretta

| Compito | Righe | Senza azienda | Ricarico | Nota |
|---|---|---|---|---|
| `lead_qualificazione` | 111 | 0 | 300% (task+model) | |
| `vision_po` | 5 | 0 | 80% (default+model) | il più basso |
| **`email_ai_l3_batch`** | **218** | **218** | — | **Buco**: il triage L3 mescolava le email di più aziende in un batch e partiva con `companyId: null`. 0,35 $ in 30 giorni pagati da noi. |
| `bot_operativo_titolare`, `audio_transcription`, `email_ai_digest`, `parse_rapportino`… | 27 | 0 | 80–300% | |

### Ricarico effettivo (`ai_regole_ricarico(30)`)

Il router **non** applica «il 350% a tutto». Il 350% è il `markup_pct` del tier sul
listino interno. Conta il più alto fra quel prezzo a token e 3× il costo vero, quindi
il ricarico effettivo va da +200% (dove vince il pavimento) a oltre +1.000% (dove il
listino del tier è più caro del modello usato davvero):

| Compito | Regola | Ricarico effettivo |
|---|---|---|
| `persona_silvio`, `preventivo_genera`, `email_compose` | tier `t2_silvio`/`t3_balanced` | +206 / +232% |
| `pdf_vision_extract` | `t2_vision` | +310% |
| `fattura_classify`, `memory_extraction`, `listino_abbina_voci` | `t1_economic` | +900% |
| `email_triage`, `query_classifier`, `silvio_commessa_chat` | `t2_vision` su un modello economico | +1.295 / +1.323% |
| `persona_sales`, `documento_contratto` | `t2_vision` / `t3_balanced` | +1.750 / +2.382% |
| `lead_qualificazione` (diretta) | `ai_pricing_markup` task+model | +300% |
| `vision_po`, `email_ai_digest` (diretta) | `ai_pricing_markup` default+model | +80% |

Non ho cambiato nessun prezzo: vedi le domande al §6.

### Crediti render

Il rimborso che restituiva +1 anche quando il consumo aveva tolto 0 (aziende
illimitate) **era già corretto in produzione dal 05/11 sera**, con la migrazione
`20281213100000_render_refund_importi_reali`. `refund_render_credit_all` restituisce
`-delta` del consumo corrispondente (`consume_ledger_id`), cioè 0 per un consumo
illimitato. Lo dicono i dati:

- 21 rimborsi da +1 su consumi da 0, tutti su Demo 2: 16 il 02/11 e 5 il 05/11 fino alle 20:29, con la funzione vecchia;
- dopo quell'ora, 15 rimborsi, tutti da 0.

Demo 2 è illimitata, quindi il saldo in più non si spende. Non l'ho toccato.
`planimetria-genera` usa `refundRenderCreditSafe`, che chiama la versione corretta.

## 3. Censimento delle funzionalità

Legenda della colonna «Addebito»:

- **R**: router → `ai_call_ledger`;
- **D**: diretta → `ai_model_usage_log`;
- **U**: unitaria → `ai_call_ledger`;
- **RC**: crediti render;
- **V**: crediti voce;
- **P**: costo della piattaforma, dichiarato.

«Azienda dal server» vuol dire: dall'utente autenticato, dalla sua appartenenza o
dal record su cui si lavora. Con `requireCompanyAccess` l'azienda può arrivare dal
corpo della richiesta, ma il server verifica che l'utente le appartenga.

| Funzionalità | File e punto di chiamata | Provider | Unità | Tariffa o inclusione | Attribuzione azienda | Addebito e fatturazione | Problema | Correzione |
|---|---|---|---|---|---|---|---|---|
| Tutte le funzioni sul router (preventivi, Silvio, bolle, fatture, computo, listini, email triage…) | `_shared/aiRouter.ts` `aiRouterComplete` | OpenRouter | token | tier del compito + pavimento 3× | dal chiamante, che la ricava dal server (`requireCompanyAccess`, record) | R, pagato con i crediti ricaricati | stessa chiave + nuova chiamata = non addebitata (60 casi) | `chiaveAddebitoChiamataRipetuta`, addebito della chiamata nuova |
| Silvio dei super admin | router, `companyId` null | OpenRouter | token | — | nessuna | P | costo solo nel registro analitico | ora anche in `platform_ai_usage_log` (`interno: true`) |
| Triage email L3 (cron) | `email-ai-l3-batch/index.ts` → `claudeMessagesBilled` | OpenRouter (Haiku) | token | `ai_pricing_markup` | era `null`: batch con più aziende | D | 218 batch non addebitati | un batch per azienda, addebito a quell'azienda, chiave = id della generazione; a credito finito l'azienda si salta |
| Email: estrazione dati dall'allegato PDF | `email-ai-estrai-allegato/index.ts:157` | OpenRouter (Sonnet, PDF) | token | `ai_pricing_markup` | dalla email (RLS) | era nessuno | Sonnet sui PDF pagato da noi | `callOpenRouterAddebitato`: credito prima, addebito dopo, chiave allegato + generazione |
| Email: opportunità | `email-ai-opportunita/index.ts:95` | OpenRouter (Haiku) | token | `ai_pricing_markup` | dalla email | era nessuno | non addebitato | `callOpenRouterAddebitato` |
| Email: evento, bozza L4, digest, query Silvio | `claudeMessagesBilled` | OpenRouter | token | `ai_pricing_markup` | dalla email / `requireCompanyAccess` | D | nessuna chiave; addebito fallito ignorato | chiave dalla generazione; il consumo non addebitato resta registrato |
| Email: embedding della query Silvio | `email-silvio-query/index.ts:179` | OpenAI embedding | token | — | profilo | D | non addebitato | **chiuso (sera)**: `addebitaEmbedding` all'azienda del profilo |
| Email: embedding storico | `email-ai-embed-backfill/index.ts:88` | OpenAI embedding | token | `ai_pricing_markup` (default) | dalla email | D | bastava un JWT qualunque, su tutte le aziende | solo cron o super admin; addebito per email all'azienda della email |
| Ricerca semantica | `semantic-search-global/index.ts:56` | OpenAI embedding | token | `ai_pricing_markup` (default) | **era il corpo**, ora il profilo (il corpo solo per il super admin) | D | bastava il prefisso «Bearer»: chiave anonima pubblica | `auth.getUser`, azienda dal profilo, addebito |
| Assistente sopralluogo | `survey-ai-assistant/index.ts` | OpenRouter (Haiku) | token | `ai_pricing_markup` | dal sopralluogo | era nessuno | IDOR: sopralluogo di un'altra azienda letto via service role; non addebitato | `requireCompanyAccess` sull'azienda del sopralluogo; `claudeMessagesBilled`; 402 chiaro |
| Video per le inserzioni | `ai-ads-video-generate/index.ts:170` | Replicate (SVD, MiniMax) | video | tier `t2_vision` su costo stimato in `MODELS` (3 / 20 centesimi) | profilo (super admin escluso) | era nessuno → U | il costo unitario più alto, mai addebitato | `controllaCreditoUnitario` prima, `addebitaUnitario` con chiave `video_replicate_<id>`. Se l'addebito non passa dopo l'avvio, il lavoro Replicate si **annulla** (`/cancel`) e la risposta è 502: nessun video gratis, nessun video «orfano» che lo stato non sa dare |
| Stato del video | `ai-ads-video-status/index.ts:68` | Replicate GET | — | — | **era il corpo** | — | URL dal corpo chiamato col token Replicate (furto del token, SSRF); scrittura su qualunque azienda | URL costruito dal server; appartenenza verificata; la previsione deve essere addebitata a quell'azienda |
| Immagini per le inserzioni | `ai-ads-image-generate` → `image.ts` | OpenRouter / OpenAI | immagine | tier | profilo | U (`chargeDirectAiCall`) | chiave casuale senza `client_request_id` | **verificato, giusto**: ogni generazione richiama il provider, quindi una chiamata = un addebito; con `client_request_id` il retry dello stesso clic non conta due volte |
| Creatività di Silvio (worker) | `silvio-generation-worker` → `image.ts` | OpenRouter / OpenAI | immagine | tier | dal job | U, chiave `silvio-creativita:<job>` | il ramo non interno accettava qualunque utente | solo super admin (`requireRole`) |
| Render (10 funzioni `generate-*-render`) | `image.ts` `editImage`, visionQa, rewriter | OpenRouter / OpenAI | immagine + token | crediti render | sessione + `canAccessCompany` | RC | — | — |
| Render: azione `analyze` | floor :242, shutter :205, bathroom :338, facade :213 | OpenRouter vision | token | — | sessione obbligatoria | RC (incluso nel render) | analisi gratuita, in floor, shutter e bathroom anche senza sessione su un `image_url` qualsiasi | **chiuso (sera)**: sessione obbligatoria ovunque; ogni chiamata (anche i tentativi scartati della catena) registrata col costo vero in `ai_call_ledger`, `skipped`, motivo «incluso nei crediti render» (`_shared/costoAiIncluso.ts`). Addebitarla anche come AI sarebbe un doppio addebito: domanda 8 |
| Planimetria | `planimetria-genera` | OpenRouter | token | crediti render | sessione | RC (`skipped` nel router) | rimborso +1 su illimitate | già corretto in DB dal 05/11 |
| Dettatura | `detta-testo/index.ts:121` | Whisper | secondi audio | `ai_pricing_markup` | `requireCompanyAccess` | D, credito prima | si addebitava sulla durata **dichiarata dal browser** | `verbose_json`: si addebita la maggiore fra la durata misurata da Whisper e quella dichiarata, così un browser non può dichiarare meno |
| Rapportino a voce | `parse-rapportino-ai/index.ts:110` | Whisper + router | secondi + token | come sopra | profilo + accesso | D + R | come sopra | come sopra |
| Vocali WhatsApp | `whatsapp-ai-processor/openai.ts:155` | Whisper | secondi | `ai_pricing_markup` | dal messaggio (DB) | era nessuno → D | non addebitato | durata da Whisper (o stima dai byte), addebito all'azienda del messaggio |
| Trascrizioni Silvio / audio | `silvio-transcribe-audio`, `trascrizione-audio` | Whisper | secondi | `ai_pricing_markup` | profilo + accesso | D | esito ignorato | ora il consumo non addebitato resta registrato |
| Preventivo a voce | `ai-preventivo-conversazione/audio.ts` | Whisper | secondi | `ai_pricing_markup` | accesso | D, con `runGuardedAiRequest` | — (l'unico che controlla l'esito) | — |
| Matrice da immagine | `parse-matrix-image` :271/:308/:372 | OpenAI / OpenRouter / Gemini | token | `ai_pricing_markup` | accesso | D, credito prima | nessun credito prima; esito ignorato | **chiuso (sera)**: `precallCheck` prima del provider (402 chiaro); il consumo non addebitato resta registrato |
| Verifica ordine, offerta RDO | `verify-purchase-order`, `rdo-ai-estrai-offerta` | OpenRouter (Sonnet) | token | `ai_pricing_markup` | accesso | D, credito prima | `verify-purchase-order/index.ts` senza credito prima | **chiuso (sera)**: `precallCheck` prima della lettura (il ramo `controlloDocumento` lo aveva già). La chiave nei metadati non serve: ogni lettura richiama il provider e si paga |
| Foto finestra | `analyze-window-photo` | OpenRouter / OpenAI | token | tier | sessione + accesso | U | la ri-analisi della stessa sessione non si pagava (chiave fissa) | **chiuso (sera)**: chiave per chiamata |
| Assistente email, orchestratore Silvio | `email-ai-assistant`, `silvio-orchestratore` | OpenRouter | token | tier | thread / `get_effective_company_id` | U, chiave per chiamata | sul ramo di servizio l'orchestratore prende il `company_id` dal corpo | **verificato, giusto**: la chiave casuale vuol dire una chiamata = un addebito; il ramo di servizio vuole la chiave di servizio esatta o il segreto del cron, e i chiamanti (`silvio-trigger-tick`, `silvio-canale-adapter`) prendono l'azienda dal record |
| Chat dei bot (WhatsApp, lead, assistenza, ads) | `ai-provider` `chat()` | OpenRouter | token | `ai_pricing_markup` | dal record / profilo | D, credito prima, lancia se non addebita | — | — |
| Embedding (`brainEmbed`): computo, preventivi, RAG di Silvio, KB | `_shared/brainEmbed.ts` | OpenAI | token | — | vari | D per i punti di un'azienda; P per la KB della piattaforma | non addebitato | **chiuso (sera)**: `addebitaEmbedding` in computo (`computo_match_embedding`), preventivi (`preventivo_storico_embedding`, `preventivo_listino_embedding`), RAG di Silvio (`silvio_rag_embedding`); memoria e ingest del cervello erano già U; la KB della piattaforma (seed, ingest, test, playground, sync) resta P |
| KB della piattaforma: ingest, test RAG, rerank | `kb-ingest-batch`, `kb-test-rag`, `silvio-kb-search` (Cohere) | OpenAI / Cohere | token | — | nessuna | P | — | ora con la riga «interno_piattaforma» |
| Confronto dei modelli (super admin) | `ai-confronto-modelli`, router con `forceModel`, `companyId` null | OpenRouter | token | — | nessuna | P | — | costo interno (17/11/2026): prova dello standard operativo, mai addebitata alle aziende |
| Customer OS (6 agenti CS della piattaforma) | `_customer_os_shared` `callLLM` | OpenRouter | token | — | nessuna (piattaforma) | P, costo in `complete_workflow_run` | — | dichiarato |
| Voce: chiamate in uscita, centralino | `initiate-outbound-call`, `fishCentralino` | ElevenLabs / Fish | minuti | `voicePricing` | agente / servizio | V | il ramo di servizio prende il `company_id` dal corpo (solo chiave di servizio) | **verificato, giusto**: i chiamanti interni (`process-automation`, `silvio-execute-action`) passano l'azienda del record |
| Voce: gestione agenti, KB, clonazione | `elevenlabs-proxy`, `kb-sync` | ElevenLabs (API di gestione) | — | abbonamento | `agentCompanyAccess` | P | la clonazione voce consuma quota dell'abbonamento | dichiarato |
| Voce: anteprime Fish | `fish-agent-proxy` `preview_*`, `simulate` | Fish TTS | caratteri (≤ 500) | — | accesso | P, con limite di frequenza | non addebitato | dichiarato |
| Sweeper conversazioni | `ai-conversations-sweeper` | ElevenLabs GET | — | — | DB | V tramite webhook | — | — |
| Sonda del credito | `ops-canarino/creditoAI.ts` → `allarmeAISonda.ts` | OpenRouter | token (circa 0,01 $/giorno) | — | — | P, in `system_health_metrics.metadata.costo_usd` | — | — |
| Diagnostica e catalogo | `debug-ai-providers` (sonde a pagamento), `test-ai-models-suite` (in `ai_test_runs`), `check-api-health`, `get-openrouter-models`, `sync-openrouter-catalog` (endpoint gratuiti) | vari | — | — | super admin / cron | P | — | dichiarato; le ultime tre non spendono |

## 4. Cosa poteva costare senza essere addebitato

In ordine di costo unitario:

1. **Video Replicate** (`ai-ads-video-generate`): da 3 a 20 centesimi a video, mai addebitati. **Chiuso.**
2. **Sonnet sui PDF allegati alle email** (`email-ai-estrai-allegato`): la chiamata AI più cara di ogni email. **Chiuso.**
3. **Triage email L3**: 218 batch in 30 giorni con azienda nulla. **Chiuso.**
4. **Richieste ripetute sul router**: 60 chiamate in 30 giorni. **Chiuso.**
5. **Vocali WhatsApp** (Whisper). **Chiuso.**
6. **Assistente sopralluogo** e **email opportunità**. **Chiusi.**
7. **Ricerca semantica** e **embedding storico delle email**, raggiungibili oltre il dovuto: la prima con la sola chiave anonima, il secondo da qualunque utente. **Chiusi.**
8. **Trascrizioni sulla durata dichiarata dal browser**: un client poteva dichiarare 1 secondo. **Chiuso** (`detta-testo`, `parse-rapportino-ai`).
9. **Consumi diretti a credito esaurito dopo la chiamata**: `deduct_ai_credits_with_markup` rispondeva `insufficient_credits` senza scrivere niente. Ora la riga resta (`credits_deducted=false`, `error_code='non_addebitato'`, il motivo e il prezzo non addebitato).

**Restano a carico della piattaforma, dichiarati qui:**

- gli embedding della KB della piattaforma (seed, ingest, test, playground, sync esterni);
- il rerank Cohere della KB;
- le API di gestione di ElevenLabs, compresa la clonazione della voce (consuma la quota dell'abbonamento);
- le anteprime Fish (≤ 500 caratteri, con limite di frequenza);
- il Customer OS;
- Silvio dei super admin;
- la sonda;
- la diagnostica.

**Inclusi in un'altra unità** (registrati col costo, a 0 sul portafoglio AI): l'analisi della foto e la generazione dei render (crediti render), le planimetrie (crediti render).

## 5. Politica comune

- **Azienda dal server.** Dal profilo e dall'appartenenza (`requireCompanyAccess`), oppure dal record su cui si lavora (email, allegato, sopralluogo, job, messaggio). Il `company_id` del corpo vale solo dopo il controllo di appartenenza.
- **Prima il credito, poi il provider.** `precheck_ai_credit` (router e unità non a token) e `precallCheck` (strada diretta). Il messaggio è «Credito AI esaurito: ricarica il borsellino…» con HTTP 402.
- **Una chiamata al provider, un addebito.** La chiave identifica la chiamata: lavoro + id della generazione. Per Whisper, che non dà un id, una trascrizione è una chiamata, quindi nessuna chiave. Chi vuole che un retry non costi non deve richiamare il provider: cache (`cacheTtlDays`), richieste protette (`runGuardedAiRequest`), dato già letto.
- **Richieste simultanee.** Il saldo si scala sotto `FOR UPDATE`. La chiave diretta prende un advisory lock e ha un indice unico. Il router ha l'indice unico su `ai_call_ledger.idempotency_key` e `unique_violation` diventa replay.
- **Errori, timeout, risultati parziali.** Il provider risponde con errore: niente addebito (riga a 0, `status='error'`). Timeout o esito sconosciuto lato nostro: col guard la richiesta resta «uncertain» e non si ripete, senza guard si prova il modello successivo. Il provider ha risposto e il nostro lavoro fallisce dopo (JSON non valido, salvataggio): **si addebita**, perché il provider ha lavorato. Video: si addebita quando Replicate accetta il lavoro.
- **Lavori in background.** Cron e worker prendono l'azienda dal record: l'email per L3, embedding e allegati; il messaggio per WhatsApp; il job per le creatività. Le funzioni interne si chiamano col segreto del cron o con la chiave di servizio a confronto esatto.
- **Gratuito, promozionale, amministrativo.** L'omaggio del mese si consuma per primo ed è tracciato (`da_omaggio`). Demo 2 è illimitata ma ha i consumi registrati. I costi interni hanno `interno: true` o `error_code='interno_piattaforma'`.
- **Isolamento.** Provato sul database con un amministratore di Demo 2: 2.230 righe sue in `consumi_ai_azienda`, 0 delle 6.386 di altre aziende. Un utente di cantiere (`e_solo_campo`) non vede consumi. `metriche_ai_azienda` su un'altra azienda risponde «Accesso non autorizzato». I clienti esterni del portale non leggono più `ai_model_usage_log`: prima lo leggevano, ora la regola è la stessa di `ai_call_ledger`.

**Righe tecniche aperte: nessuna** dopo il secondo giro del 15/11 sera. Le scelte rimaste sono commerciali (§9).

## 6. Prima i dati, poi l'AI (§7.16)

- **Registro dei lavori.** La tabella `lavori_ai_esiti` registra un lavoro per riga (azienda + flusso + chiave) con l'esito: `senza_ai`, `con_ai`, `dato_gia_presente` o `eccezione`, e il numero di chiamate. La scrive `registra_esito_lavoro_ai`, dal codice `_shared/esitoLavoroAi.ts`.
- **Dove si legge.** `metriche_ai_azienda` restituisce la percentuale di lavori chiusi senza AI, per flusso, insieme alle chiamate e all'importo per compito e al costo medio. La pagina «Consumo AI del team» la mostra nel riquadro «Lavori chiusi senza AI».
- **Primo flusso agganciato: la classificazione delle fatture ricevute** (`ai-fattura-classify`). Se CUP, CIG o codice commessa la risolvono, l'esito è `senza_ai`. Se la risposta arriva dalla cache, è `dato_gia_presente`.
- **Gli altri flussi.** Le sessioni B, C e D li agganciano con una riga (`registraEsitoLavoroAi`) nei flussi che riducono: lettura bolle, abbinamenti, rapportini.
- **La misura vera, 30 giorni al 15/11 sera** (`ai_metriche_piattaforma(30)`): 2.084 chiamate, 1.970 addebitate, 84,40 € addebitati su 29,55 € di costo reale, costo medio 0,043 € per chiamata addebitata; lavori chiusi senza AI **93,5%** (triage email: 3.536 email con le regole, 245 con Haiku). Il registro `lavori_ai_esiti` si riempie man mano che i flussi lo scrivono; il triage email si legge da `email_inbox.classificato_da`, che c'era già.
- **Dove la vede il titolare.** Pannello admin → AI Provider & Margini → riquadro «AI: addebiti e lavori senza AI» (`AdminAiAddebitiMisureCard`, da `ai_metriche_piattaforma`): totali, lavori senza AI per flusso, chiamate/costo/addebitato/costo medio per compito, per azienda (con il costo non addebitato), e quanto paga la piattaforma per conto suo. L'azienda vede la sua parte in «Consumo AI del team».
- **Controlli già presenti prima dell'AI.** La cache delle risposte (`cacheTtlDays`), l'impronta del file sulle bolle persistenti (`ddt_persistente_<azienda>_<hash>`), la guardia SDI sugli allegati XML/p7m e il filtro dei candidati nell'estrazione degli allegati. Il triage email L1/L2 usa regole e mittente imparato e chiama Haiku solo per i casi irrisolti.

## 7. Correzioni, file per file

**Migrazioni** (applicate con `apply_migration`, versione riallineata):

- `20290403150000_ai_diretta_idempotente_e_non_addebitati.sql`: colonna e indice `ai_model_usage_log.idempotency_key`; `addebita_ai_diretta` (chiave, lock, replay, riga non addebitata, costo interno).
- `20290403150100_consumi_ai_in_un_posto.sql`: vista `consumi_ai_azienda`, regola di lettura di `ai_model_usage_log`, `ai_regole_ricarico`, `lavori_ai_esiti`, `registra_esito_lavoro_ai`, `metriche_ai_azienda`.

**Codice condiviso**:

- `_shared/aiRouter.ts`: addebito della chiamata ripetuta; registro dei costi senza azienda.
- `_shared/ai-provider/directApi.ts`: porta unica `addebita_ai_diretta`, `chiaveAddebitoDiretto`.
- `_shared/claudeProxy.ts`: `idempotencyKey` in `ClaudeBillingCtx`.
- `_shared/ai-provider/openrouter.ts`: `OpenRouterParams` esportato.
- Nuovi: `_shared/ai-provider/openrouterAddebitato.ts`, `_shared/addebitoAiUnitario.ts`, `_shared/esitoLavoroAi.ts`.

**Funzioni**:

- `email-ai-l3-batch`
- `email-ai-estrai-allegato`
- `email-ai-opportunita`
- `email-ai-embed-backfill`
- `semantic-search-global`
- `survey-ai-assistant`
- `ai-ads-video-generate`
- `ai-ads-video-status`
- `silvio-generation-worker`
- `entity-embed-batch`
- `whatsapp-ai-processor` (`openai.ts`, `media.ts`, `index.ts`)
- `detta-testo`
- `parse-rapportino-ai`
- `ai-fattura-classify`

**Frontend**: `src/components/credits/TeamAIUsage.tsx`, `src/integrations/supabase/types.ts` (rigenerato).

**Secondo giro (15/11 sera)**:
- migrazione `20290403150200_misure_ai_per_il_titolare.sql` (applicata e riallineata): `lavori_ai_periodo` (lavori registrati + triage email), `metriche_ai_azienda` che la usa, `ai_metriche_piattaforma` per il super admin;
- nuovi `_shared/costoAiIncluso.ts` (costo registrato a 0 per il portafoglio AI, col motivo) e `_shared/addebitoEmbedding.ts`;
- `_shared/ai-provider/sceneAnalysis.ts` (ogni chiamata registrata); `generate-floor-render`, `generate-shutter-render`, `generate-bathroom-render` (sessione obbligatoria per l'analisi);
- `parse-matrix-image`, `verify-purchase-order` (credito prima); `analyze-window-photo` (chiave per chiamata); `ai-ads-video-generate` (annulla il video se l'addebito non passa);
- embedding addebitati in `computo-ai-extract`, `ai-quote-supreme`, `ai-quote-from-capture`, `_shared/ragInjector.ts` (Silvio e orchestratore), `email-silvio-query`;
- `src/components/admin/ai-provider/AdminAiAddebitiMisureCard.tsx` nel pannello `AdminAiMarginsPanel`.

## 8. Test

- **`src/test/logic/aiAddebitiCensimento.test.ts`**: 27 casi con provider e database finti.
  - Crediti disponibili, e il prezzo addebitato corrisponde all'atteso (0,01 $ × 0,92 × 3 = 0,0276 €).
  - Stessa chiave con il provider richiamato: secondo addebito. Stessa generazione: nessun doppio.
  - Crediti insufficienti: il provider non parte.
  - Errore e timeout del provider: saldo intatto.
  - Senza azienda: costo interno registrato. Due aziende con le stesse chiavi restano isolate.
  - Strada diretta: replay, tre richieste simultanee (ne passa una sola), credito finito dopo la chiamata (registrato, non addebitato).
  - Video: credito negato col messaggio, addebito senza token, replay. Il lavoro si annulla se l'addebito non passa.
  - Costo incluso nei crediti render e costo interno. Embedding addebitati e mai bloccanti.
  - Esiti dei lavori.
  - Lettura del codice:
    - L3 un batch per azienda;
    - URL di Replicate costruito dal server;
    - controlli d'accesso;
    - sessione obbligatoria per l'analisi dei render;
    - credito controllato prima della chiamata;
    - chiave per chiamata;
    - strade che addebitano.
- **Restano verdi**: `aiRouterBillingVerification` (28), `costoVeroAI`, `dettaTesto`, `dettaTestoGestore`, `allarmeAIAgganci`, `silvioBloccoCartaMotivoVero` e le suite che leggono i file toccati.
  - Rossi anche su `main`, prima di questo lavoro: `funzioniDaRipubblicare`, `silvioMenoToken`, `silvioPermessiDelVenditore`.
- **Sul database, in transazioni annullate:**
  - `addebita_ai_diretta` su Demo 2: addebito di 0,0276 €, replay senza secondo addebito, costo interno senza azienda, azienda bloccata con la riga `non_addebitato`.
  - **Uso incluso nel piano (omaggio mensile)**: con 0,05 € di omaggio, il primo addebito da 0,0414 € esce tutto dall'omaggio. Il secondo prende gli 0,0086 € rimasti e mette 0,0328 € sul portafoglio.
  - Isolamento di `consumi_ai_azienda` (2.230 righe proprie, 0 delle 6.386 altrui) e di `metriche_ai_azienda` (un'altra azienda → «Accesso non autorizzato»).
- **Dopo il deploy, in produzione** (giro CI 43736659603: 136 funzioni ripubblicate, nessun errore):
  - Prima di qualunque prova, l'embedding delle email (6 righe) e le opportunità dalle email (2 righe, con chiave) di aziende vere risultavano già addebitati all'azienda. Prima non lo erano.
  - **Chiamate vere su Demo 2** (via `pg_net` col segreto del cron), tutte con `credits_deducted = true` e il movimento nello storico crediti:

    | Funzione | Costo reale | Addebitato |
    |---|---|---|
    | triage L3 «single» (Haiku, 1.154 token in + 53 out) | 0,00142 $ | 0,0039 € |
    | opportunità dalla email | 0,00117 $ | 0,0032 € |
    | embedding storico | — | 0,000003 € |

**Verifiche non fatte, e perché:**

- **Ricerca semantica, assistente del sopralluogo, dettatura, video, analisi dei render dal vivo**: vogliono il token di un utente vero. Non ho una sessione nell'app e non inserisco credenziali.
  - Da fare: una prova a mano su Demo 2, poi in `consumi_ai_azienda` deve comparire la riga del compito: `semantic_search_embedding`, `survey_ai_assistant`, `audio_transcription`, `ads_video_genera`, oppure la riga `skipped` dell'analisi render.
  - Sono coperte dai test con il provider finto.
- **Estrazione dall'allegato PDF**: Demo 2 non ha email con allegati.
- **Video**: il costo vero di un video MiniMax non è misurato, vale la stima scritta nel codice. Non so se `REPLICATE_API_TOKEN` è impostato in produzione: i segreti delle funzioni non sono visibili da qui.
- **Fatturazione esterna delle ricariche (Stripe)**: non riletta in questa sessione.

## 8 bis. Revisione finale (15/11 notte)

La revisione dei commit `4d1618e04` e `1a2d2e449` ha segnalato nove difetti. Ognuno è stato verificato prima di correggerlo.

1. **Costo e margine leggibili dal browser.** Vero, e più largo di quanto segnalato: anche sei viste invoker (`ai_revenue_summary`, `ai_usage_log`, `company_ai_usage_month`, `v_ai_margin_by_model`, `v_ai_real_cost_per_model`, `v_markup_simulator`) davano a ogni azienda il nostro costo per le sue righe.
   - Migrazione `20290403150300`: GRANT di SELECT per colonna su `ai_call_ledger` e `ai_model_usage_log`, tutto tranne `cost_real_usd`, `cost_real_eur`, `margin_eur`, `applied_markup_pct`, `markup_applied_pct` e `cost_usd`. Scritture tolte ad `authenticated`, viste coi costi chiuse.
   - I pannelli admin ora passano da funzioni definer riservate (super admin o `can_view_platform_stats`): `admin_ai_spesa_reale`, `admin_ai_diretta_per_azienda`, `admin_ai_revenue_summary`, `admin_ai_usage_aggregato`. Quest'ultima `useAIUsageMonitor` la cercava già, ma non esisteva e il pannello ripiegava sulla vista.
   - `consumi_ai_azienda` non usa colonne di costo e resta la lettura dell'azienda.
2. **L3 con aziende senza credito che occupavano il lotto.** Vero. La selezione è larga (200), il credito si controlla una volta per azienda, le aziende senza credito escono dalla query successiva e il lotto si fa con le altre. La risposta elenca `aziende_senza_credito`.
   - Stessa protezione nell'embedding storico delle email.
3. **Whisper senza credito prima.** Vero. Ora `precallCheck` precede la trascrizione nei vocali WhatsApp, e a credito finito arriva una risposta chiara all'utente.
   - Credito prima anche nella ricerca semantica e nell'embedding storico.
   - Gli embedding di `addebitaEmbedding` girano dentro flussi (computo, preventivi, Silvio) che hanno già il controllo del router sulla chiamata principale, quindi non lo ripetono.
4. **Errore 23514 da `pool_consuma` che annullava la riga.** Vero. In `addebita_ai_diretta` l'addebito ora sta in un blocco con `EXCEPTION`, e resta la riga `non_addebitato` con `errore_<SQLSTATE>`.
   - Provato su Demo 2 col portafoglio azzerato, in una transazione annullata: riga scritta, motivo `errore_23514`.
5. **`deduct_ai_credits_with_markup` ferma a `20280130000000` nel repository.** Vero. La definizione attuale ora è nella migrazione `20290403150400`, riapplicata identica: stesso md5 prima e dopo.
6. **Durata audio, il massimo fra misurata e dichiarata.** Vero. Ora conta quella misurata da Whisper, e quella dichiarata serve solo da ripiego. Nel rapportino a voce il ripiego ha un tetto di 15 minuti.
7. **Analisi della foto dei render senza limite.** Vero. Il tetto è di 15 chiamate per sessione, contate dalle righe incluse già registrate, prima della chiamata al provider. Il prezzo non cambia: resta la domanda 8.
8. **Ricerca semantica sempre sull'azienda del profilo.** Vero. Ora vale l'azienda del corpo se `user_can_access_company` lo consente.
9. **Ripiego su `ad_video_jobs` per i video avviati prima del deploy.** **Non si può fare**: la tabella non esiste nel database, e l'inserimento in `ai-ads-video-generate` è sempre fallito senza dirlo. Non c'è un registro dei video vecchi da consultare. Un video avviato prima del deploy lo vede solo chi ha l'id della previsione, e non è mai stato addebitato.

## 9. Decisioni commerciali (approvate il 16/11/2026)

Il titolare ha approvato le proposte («per i prezzi AI va bene come proponi»):

| # | Domanda | Decisione | Stato |
|---|---|---|---|
| 1 | Ricarico unico o per compito? | Un ricarico per compito in una tabella (`ai_ricarico_compito`), stesso minimo di 3× il costo vero su tutte le strade | Applicato (prezzi dal 16/11, migrazione `20290417120100`) |
| 2 | Errore nostro dopo che il provider ha lavorato | Si rimborsa, con una riga di rimborso | Applicato |
| 3 | Consumo incluso nel piano (letture per piano) | Il numero lo decide il titolare | Fuori da questo lavoro |
| 4 | Chiamata fatta a credito finito | Diventa un debito, scalato alla ricarica successiva (omaggio compreso) | Applicato |
| 5 | Prezzo dei video | Da decidere quando i video tornano a funzionare (`ad_video_jobs` non esiste) | Fuori da questo lavoro |
| 6 | Embedding | Regalati: costo della piattaforma, registrato | Applicato |
| 7 | Silvio dei super admin | Costo nostro, dichiarato | Com'era |
| 8 | Analisi della foto dei render | Inclusa nel credito render | Com'era |

## 10. Come funzionano adesso (16/11/2026)

Migrazione `20290417120000_ai_ricarico_rimborsi_debito.sql` (applicata, versione riallineata).

**Ricarico per compito.** `ai_ricarico_compito(compito, moltiplicatore, regalato)`, letta da
`ai_ricarico_per(compito, modello)`:

- c'è la riga del compito → prezzo = costo vero × moltiplicatore;
- altrimenti la riga `default`;
- un `CHECK` impedisce un moltiplicatore sotto 3, e la funzione lo rialza comunque a 3;
- un modello `*embed*` o una riga `regalato` → costo della piattaforma (vedi sotto).

La leggono `charge_ai_call` (router, unità) e `deduct_ai_credits_with_markup` (quindi anche
`addebita_ai_diretta` e `chat()` di `ai-provider`). Senza riga del compito e senza `default`
valgono le regole di prima (tier con pavimento, `ai_pricing_markup`); il pavimento del tier non
scende mai sotto 3×. Gli override per azienda (`ai_pricing_overrides`, oggi nessuno) restano sul
listino del tier. Ogni riga del registro scrive la regola usata (`metadata.regola_ricarico`:
`compito`, `default`, `tier`, `override`).

**Anteprima.** `ai_ricarico_anteprima(giorni)` (super admin): per compito, ricarico di oggi
(addebitato / costo vero), quello nuovo (dalla tabella, o la proposta: il prezzo di oggi, mai sotto
3×), e la differenza in euro.

**Rimborso.** `ai_rimborsa_addebito(motivo, chiave | ledger_id | usage_log_id)`, solo service role,
dal codice `rimborsaAddebitoAi` (`_shared/rimborsoAi.ts`, non lancia mai):

- la riga originale resta; si scrive una riga nuova: `status = 'refunded'` e importo negativo nel
  router (il `CHECK` su `cost_billed_eur` ora lo permette solo per `refunded`), `error_code = 'rimborso'`
  nella diretta; chiave `rimborso:<chiave originale>`, quindi è idempotente;
- torna l'omaggio se è ancora il suo mese, torna il portafoglio (riga `in` nel registro del
  portafoglio, senza contare come ricarica), si annulla l'eventuale debito ancora aperto;
- nello storico crediti compare «Rimborso AI — compito: motivo» (`rimborso_ai`).

Agganciato in: router (JSON chiesto e non leggibile sull'ultimo modello: `rimborsato: true` nel
risultato), `ai-ads-video-status` (video fallito o senza file), `ai-fattura-classify` (JSON non
leggibile, salvataggio fallito), `ddt-ai-extract` (lettura non leggibile). **Regola per i flussi
nuovi:** se dopo una chiamata addebitata il lavoro fallisce per colpa nostra, `rimborsaAddebitoAi`
con `ledgerId` (router) o `usageLogId` (diretta). Gli errori del provider non si addebitano già.

**Debito.** Quando il credito (omaggio + portafoglio) non basta per una chiamata già fatta:

- router: la riga si scrive col prezzo intero e `metadata.da_debito`, niente esce dal portafoglio;
- diretta: riga `error_code = 'a_debito'` (prima era `non_addebitato`), `reason = 'a_debito'`;
- in entrambi i casi una riga in `ai_debiti` (residuo, saldato, annullato);
- `ai_credits_salda_debito`, trigger differito su `ai_credits`: quando saldo o omaggio crescono
  (ricarica, omaggio del mese, rimborso) `ai_debito_salda` scala i debiti, prima dall'omaggio poi
  dal portafoglio, anche a pezzi. Non fa mai fallire la ricarica;
- il titolare lo vede in Crediti (`DebitoAiAlert`): «AI a debito: € …, si scala da solo alla
  prossima ricarica». In «Consumo AI del team» la nota dice «a debito».

`blocked` (tetto mensile o blocco dell'azienda) resta `non_addebitato`: chi ha messo un tetto non
deve trovarsi un debito. Il 16/11 non c'era nessuna riga `non_addebitato` da convertire.

**Embedding.** Non si addebitano più: la riga resta col costo vero e l'azienda, a 0
(`status = 'skipped'` nel router, `error_code = 'interno_piattaforma'` nella diretta, nota «non
addebitato: embedding…»). La ricerca semantica e l'embedding storico delle email non controllano
più il credito.

### Anteprima dei prezzi (ultimi 30 giorni, 16/11/2026)

Totale addebitato in 30 giorni: 85,5 € su 25,6 € di costo vero (+234%). Con i nuovi ricarichi:
**+0,44 €** in tutto. Cambia solo dove oggi si sta sotto 3×:

| Compito | Strada | Chiamate | Costo vero | Addebitato oggi | Ricarico oggi | Nuovo | Addebitato nuovo |
|---|---|---|---|---|---|---|---|
| `vision_po` | diretta | 5 | 0,357 € | 0,643 € | 1,80× | 3× | 1,072 € (+0,43) |
| `email_ai_digest` | diretta | 2 | 0,009 € | 0,017 € | 1,80× | 3× | 0,028 € (+0,01) |
| `chat_routine` | diretta | 2 | 0,0007 € | 0,0018 € | 2,50× | 3× | 0,0021 € |
| embedding (`email_embedding`, `memory_summary_embedding`, …) | entrambe | 78 | 0,0004 € | 0,0027 € | 3× / 43× | regalati | 0 |

Tutti gli altri compiti mantengono il ricarico medio di oggi (es. `persona_silvio` 3,32×,
`preventivo_genera` 3,06×, `pdf_vision_extract` 4,09×, `email_triage` 13,6×, `fattura_classify` 10×,
`documento_contratto` 24,8×). Il prezzo di una singola chiamata può spostarsi di poco intorno alla
media, perché oggi dipende dal modello che ha risposto; il totale per compito resta quello.

Effetti fuori dai 30 giorni:

- i compiti senza riga passano a 3× (riga `default`). Prima la strada diretta usava il ricarico del
  modello (da 1,3× su Opus a 15× su Llama 8B), il router il listino del tier;
- per i compiti mai visti la tabella usa la stima del listino del tier sul modello configurato
  (es. `serramenti_photo_to_quote` 24,1×, i `template_*` su t4 a 3×);
- `bot_operativo_titolare` passa sulle due strade allo stesso 3,02× (oggi 3× diretta, 13,95× router su 2 chiamate).

I valori sono nella migrazione `20290417120100_ai_ricarico_per_compito_prezzi.sql`, applicata il
16/11/2026 dopo il sì del titolare su questa anteprima (78 compiti con prezzo più `default` a 3×).

### Test

- `src/test/logic/aiDecisioniCommerciali.test.ts`: rimborso del JSON non leggibile nel router (e
  nessun rimborso col JSON leggibile o senza JSON chiesto), `rimborsaAddebitoAi` che non lancia,
  punti agganciati, minimo 3×, funzioni chiuse ad anon, debito su router e diretta, avviso in Crediti,
  ogni compito di embedding nel codice regalato.
- Sul database, in transazioni annullate su Demo 2:
  - embedding sul router `skipped` a 0;
  - addebito di prima (0,0455 €), rimborso di 0,0455 € tornato nel portafoglio, secondo rimborso
    `gia_rimborsato`;
  - riga `default` a 4×: 0,0368 € (= 0,01 $ × 0,92 × 4); riga sotto 3× bloccata dal `CHECK`;
  - portafoglio a zero: router e diretta a debito, embedding regalato anche a zero, rimborso della
    diretta che annulla il debito, ricarica di 1 € che salda il debito del router (pool 0,9545 €);
  - omaggio del mese di 0,03 € che salda 0,03 € di un debito di 0,0455 € (residuo 0,0155 €);
  - con la tabella piena: `preventivo_genera` 3,06×, `email_triage` 13,63×, compito nuovo 3×
    (`default`), `vision_po` 3×.
