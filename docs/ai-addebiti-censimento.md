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

## 9. Decisioni commerciali aperte (per il titolare)

1. **Ricarico unico?** Oggi il ricarico effettivo va da +80% (`vision_po`, diretta) a +2.382% (`documento_contratto`, router). La regola del router è «il più alto fra il listino del tier e 3× il costo». Si vuole un solo ricarico per tutto (per esempio 3× il costo vero, sempre), o un ricarico per compito scritto in una tabella?
2. **Errore dopo che il provider ha lavorato**: oggi si addebita (il JSON non si legge, il salvataggio fallisce, il video Replicate fallisce dopo l'avvio). Va bene o si rimborsa?
3. **Consumo incluso nel piano**: oggi c'è solo l'omaggio mensile in euro. Si vuole un numero di letture o chiamate incluse per piano, e oltre cosa succede: blocco, credito o avviso?
4. **Consumo a credito finito dopo la chiamata** (riga `non_addebitato`): si lascia a carico nostro, si scala in negativo o si recupera alla ricarica successiva?
5. **Video**: il prezzo si basa sulla stima del codice (3 e 20 centesimi a video) col ricarico del tier `t2_vision`. È il prezzo voluto per il video?
6. **Embedding**: dal 15/11 quelli fatti per un'azienda (ricerca, email, computo, preventivi, contesto di Silvio) si addebitano col ricarico di `ai_pricing_markup` (`default`), come le altre chiamate dirette: millesimi di euro al mese. Si tengono o si regalano? Rerank Cohere e KB della piattaforma restano a carico nostro.
7. **Silvio dei super admin**: resta costo interno. Proposta: sì, dichiarato com'è ora.
8. **Analisi della foto dei render**: oggi è inclusa nel credito render (registrata, non addebitata come AI). Si tiene inclusa o si fa pagare a parte?
