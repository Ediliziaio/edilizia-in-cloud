# Una moneta sola: crediti AI in euro per tutto — piano operativo

Scritto il 25/11/2026. Riferimenti:
- `docs/piani/costi-servizi-2027.html`, il listino in euro e i margini;
- `docs/piani/piano-operativo-piani.md`, i piani Gestionale / Business / Pro;
- `docs/ai-addebiti-censimento.md`, le regole degli addebiti AI.

## Obiettivo

Il cliente vede **una sola moneta**, gli euro di credito AI. Render, render 3D, planimetrie AI, Silvio, preventivi e il resto scalano da lì. Ogni azione ha un **prezzo fisso in euro**, che il cliente vede sul pulsante prima di cliccare. Il costo vero resta sotto il 30% del prezzo.

Spariscono:
- i «crediti render» contati a pezzi;
- i loro pacchetti;
- il secondo borsellino nella pagina Crediti.

## Da dove partiamo

**Due monete.** I crediti AI sono in euro e stanno nel portafoglio unico (`company_credit_pool`, con l'omaggio mensile su `ai_credits.free_balance_eur`). I render invece si contano a pezzi su `render_credits`, con acquisti FIFO in `render_credit_purchases`.

**Chi scala un credito render** (`deductRenderCreditSafe` → `deduct_render_credit_v3`, e il rimborso con `refundRenderCreditSafe`):
- le 10 funzioni di render: `generate-render`, `generate-bathroom-render`, `generate-facade-render`, `generate-floor-render`, `generate-pergola-render`, `generate-pool-render`, `generate-roof-render`, `generate-room-render`, `generate-shutter-render`, `generate-technical-render`;
- `planimetria-genera`: pianta da documento, schizzo, descrizione o rilievo, chat sul progetto, norme, frazionamento. Sopralluogo e DXF non scalano;
- `planimetria-motore`: il render 3D. Il DWG online non scala.

**Un render oggi si paga in due monete.** Le analisi del render (`render_scene_analysis`, `render_image_qa`, `render_window_photo_analysis`) risultano addebitate in euro dai crediti AI, oltre al credito render della generazione. `render_window_photo_analysis` ha un prezzo medio di 0,50 € su un costo di 0,17 €. Va verificato in fase 2 funzione per funzione.

**Frontend che mostra i crediti render:**
- `useWallets`, che ritorna il secondo portafoglio «Render AI»;
- `RenderCreditGate`, `RenderCreditsWidget`, `RenderInSerieDialog`, `RenderNewV2`;
- `RechargeDialog`, che vende i pacchetti;
- `SettingsCredits`, `ConsumptionByService`, `CreditTransactionsTable`;
- lato admin: `CreditManagerCard`, `CompanyPacchettoCustom`;
- `OffertaCheckout`, `UpgradeScopriBanner`.

**Stripe:** `create-checkout-session` vende i pacchetti di `render_credit_packs` (tipo `render_credits`); `stripe-webhook` li accredita con `adjust_render_credits_atomic`.

**Listini dei pacchetti incoerenti.** In `render_credit_packs` convivono pacchetti a 0,60–0,90 € a credito (da 10 a 300) e a 0,07–0,10 € (da 50 a 2.000). **Nessun pacchetto è mai stato comprato**: tutto il `revenue_eur` degli ultimi 90 giorni è zero.

**Saldi esistenti:** 22 aziende con una riga in `render_credits`, 99 crediti residui in tutto. Una sola azienda è «unlimited»: Demo Azienda 2.

**Cosa c'è già e si riusa:**
- `addebitoAiUnitario.ts` (`controllaCreditoUnitario`, `addebitaUnitario` → `charge_ai_call`): addebito idempotente di un'unità senza token. Oggi però prezza a **costo × ricarico**, non a prezzo fisso;
- `rimborsaAddebitoAi` (`_shared/rimborsoAi.ts`): il rimborso scrive una riga, non cancella;
- `subscription_plans.monthly_free_ai_eur` con `ensure_monthly_free_ai_credits`: l'omaggio mensile non cumulabile, che si consuma per primo. È il meccanismo giusto per i crediti inclusi da 20 / 50 / 100 €.

## Fase 0 — Decisioni del titolare (confermate tutte il 25/11/2026)

| # | Decisione | Scelta |
|---|---|---|
| 0.1 | Prezzi fissi delle azioni | render, render 3D e planimetria AI a 0,50 €; chat sul progetto, domanda a Silvio e preventivo AI a 0,10 €; analisi della foto della finestra a 0,60 € |
| 0.2 | Le analisi del render (scena, controllo qualità, foto) | **dentro** il prezzo del render: il cliente vede 0,50 € e basta |
| 0.3 | I 99 crediti render residui | convertiti una volta in euro di ricarica a 0,50 € l'uno (49,50 € in tutto), con una riga nel registro che lo dice |
| 0.4 | Demo Azienda 2 «illimitata» | un flag di azienda «crediti illimitati» letto dall'addebito. Non un saldo enorme: `numeric(10,4)` non regge oltre 999.999 e rompe l'AI |
| 0.5 | Crediti inclusi dei piani nuovi | 20 / 50 / 100 € in `monthly_free_ai_eur`, insieme ai piani nuovi del piano operativo |
| 0.6 | Ricarico minimo per le azioni a consumo reale | da 3× a 3,5× |

## Fase 1 — Listino delle azioni nel database (1 giorno)

1. **Tabella `ai_listino_azioni`** con le colonne:
   - `azione` (chiave), `etichetta`, `prezzo_eur`;
   - `costo_stimato_usd` (per il controllo del credito);
   - `attiva`, `aggiornato_il`, `note`.

   Righe iniziali: `render`, `render_3d`, `planimetria_ai`, `planimetria_chat`, `render_analisi_finestra`.
2. **Vincolo:** `prezzo_eur >= 3.5 × costo_stimato_usd × cambio`. Si scrive come `CHECK` sulla stima, più un controllo nel rapporto settimanale sul costo vero.
3. **`addebita_azione(p_chiave, p_company, p_user, p_azione, p_costo_reale_usd, p_metadata)`:**
   - legge il prezzo dal listino;
   - scala prima l'omaggio del mese e poi la ricarica, dallo stesso percorso di `deduct_ai_credits_with_markup` / `pool_consuma`;
   - scrive `ai_call_ledger` con `cost_billed_eur` = prezzo fisso, `cost_real_eur` e `margin_eur`;
   - è idempotente sulla chiave;
   - con «crediti illimitati» registra la riga a prezzo zero, come fa oggi `deduct_render_credit_v3`.
4. **`controlla_credito_azione(p_company, p_azione)`:** il precheck sul prezzo, da chiamare prima della chiamata al provider.
5. **Rimborso:** `rimborsaAddebitoAi` sulla riga del ledger. Va verificato che accetti le righe a prezzo fisso.
6. **Accessi:** `REVOKE ALL … FROM PUBLIC, anon`, `GRANT` al solo service role (le edge function). Nessuna voce in `funzioni_pubbliche_di_proposito`.
7. **Migrazioni** secondo CLAUDE.md:
   - SQL idempotente;
   - `apply_migration`, poi riallineamento della versione;
   - file `2029…` dopo aver controllato che il numero sia libero.

## Fase 2 — Edge function: da credito render a euro (1,5 giorni)

1. **`_shared/addebitoAzione.ts`** con `controllaCreditoAzione`, `addebitaAzione`, `rimborsaAzione`. Stessa forma di `renderCreditDeduct.ts`, così la sostituzione è riga per riga.
2. **Sostituire `deductRenderCreditSafe` / `refundRenderCreditSafe`** nelle 12 funzioni elencate sopra. Restano uguali:
   - il momento dell'addebito (all'avvio);
   - il rimborso su errore o pianta non riuscita;
   - il messaggio 402 («Crediti AI esauriti…»).
3. **Analisi dentro il prezzo:** nelle funzioni di render le chiamate di analisi e controllo qualità passano con `skipCharge`, come già fa `planimetria-genera` con le sue chiamate al modello. Il costo vero resta registrato.
4. **Toccare l'`index.ts` di ogni funzione modificata.** Il job di deploy guarda solo i file cambiati sotto `supabase/functions/` (trappola di CLAUDE.md): una modifica solo in `_shared/` non le ripubblica.
5. **Transizione:** per 30 giorni `deduct_render_credit_v3` resta in piedi ma non viene più chiamata. Se in quel periodo una riga nuova compare in `render_credit_ledger`, una funzione è rimasta indietro.

## Fase 3 — Interfaccia (1,5 giorni)

1. **`useWallets`:** un solo portafoglio, «Crediti AI» in euro. Va tolto il tipo `render_credits` dalle mappe di `RechargeDialog`, senza rompere i `Record<WalletType, …>`.
2. **`RenderCreditGate` e `RenderCreditsWidget`:** al posto di «N render rimasti» mostrano «0,50 € · saldo 37,20 €».
3. **Pulsanti con il prezzo:** «Genera render · 0,50 €», «Genera pianta · 0,50 €». In `RenderInSerieDialog` il totale della serie va mostrato prima di partire.
4. **`SettingsCredits`, `ConsumptionByService`, `CreditTransactionsTable`:** render e planimetrie diventano righe del consumo in euro, con il nome dell'azione.
5. **Admin:** `CreditManagerCard` senza la rettifica dei crediti render; `CompanyPacchettoCustom` senza i pacchetti render.
6. **`OffertaCheckout` e `UpgradeScopriBanner`:** i testi passano da «N render» a «N € di crediti AI».

## Fase 4 — Stripe e pacchetti (0,5 giorni)

1. `render_credit_packs`: tutte le righe `is_active = false`. Non si cancellano: sono storico.
2. `create-checkout-session` rifiuta il tipo `render_credits` con un messaggio chiaro. `stripe-webhook` tiene il ramo `render_credits` per un mese, per un eventuale pagamento già partito, poi si toglie.
3. La ricarica resta una sola: il prodotto in euro che oggi finisce nel portafoglio unico.

## Fase 5 — Conversione dei saldi e crediti inclusi (0,5 giorni)

1. **Migrazione di conversione**, con `lock_timeout` e `statement_timeout` come da CLAUDE.md, ma sono 22 righe:
   - per ogni azienda con crediti render > 0: `pool_ricarica` di `crediti × 0,50 €` con causale «conversione crediti render»;
   - poi `render_credits.balance` a zero, con una riga di `render_credit_ledger` che lo dice.
2. **Flag «crediti illimitati»** su Demo Azienda 2, al posto di `render_credits.unlimited`.
3. **Ricarico minimo:** `ai_ricarico_compito.default` e il vincolo (oggi «mai sotto 3×») a 3,5×. Prima si guarda `ai_ricarico_anteprima(30)` per vedere l'effetto sui clienti attivi.
4. **`monthly_free_ai_eur`** a 20 / 50 / 100 sui piani nuovi `gestionale`, `business`, `pro2027`, quando nascono (fase 1 del piano operativo). I piani vecchi non si toccano.

## Fase 6 — AI d'ufficio illimitata (2 giorni, si può fare dopo)

È un lavoro a parte, perché il «regalato» di oggi (`ai_ricarico_compito.regalato`) vale per tutti e non per piano.

1. Colonna `ufficio boolean` su `ai_ricarico_compito`. Si accende su: smistamento e classificazione email, lettura e classificazione fatture, riconciliazione, DDT, rapportini, POS, DUVRI, lettura dei PDF.
2. **Chiave di piano `ai_ufficio_illimitata`** (Business e Pro). Con la chiave attiva i compiti `ufficio` si registrano a prezzo zero.
3. **Contatore mensile per azienda.** Oltre i 1.000 documenti (100 per il Gestionale) si torna a scalare dai crediti, con un avviso al titolare.
4. Il costo vero resta registrato in `ai_call_ledger`: il rapporto settimanale mostra quanto costa davvero l'«illimitato».

## Fase 7 — Collaudo (1 giorno)

Su un'azienda di prova, non Demo 2:

| Prova | Esito atteso |
|---|---|
| Un render per ognuno dei 10 tipi | scala 0,50 €, una riga nel ledger, nessuna riga in `render_credit_ledger` |
| Render fallito | rimborso di 0,50 €, una sola volta anche se il fallimento arriva due volte |
| Retry con la stessa chiave | nessun secondo addebito |
| Planimetria AI da PDF, schizzo, descrizione, rilievo | 0,50 € ciascuna |
| Planimetria da sopralluogo e DXF | nessun addebito |
| Render 3D e DWG online | render 3D 0,50 €, DWG gratis |
| Saldo a zero | 402 prima della chiamata al provider, nessun costo |
| Omaggio del mese e ricarica | si consuma prima l'omaggio |
| Demo 2 con «crediti illimitati» | riga a prezzo zero, nessun blocco |

Prima del push:
- `typecheck:ci`;
- i test di `renderCreditDeduct` riscritti per `addebitoAzione`;
- il test degli agganci di `segnalaErroreAI`;
- il controllo Supabase Preview verde.

## Fase 8 — Pulizia (dopo 30 giorni)

- Controllo: nessuna riga nuova in `render_credit_ledger` dal passaggio.
- Si tolgono `deductRenderCreditSafe`, `refundRenderCreditSafe` e il ramo `render_credits` di `stripe-webhook`.
- Le tabelle `render_credits`, `render_credit_purchases`, `render_credit_ledger` e `render_credit_packs` **restano**, in sola lettura, come storico.

## Tempi

| Fase | Giorni | Dipende da |
|---|---|---|
| 0 Decisioni | — | titolare |
| 1 Listino delle azioni | 1 | 0.1, 0.4 |
| 2 Edge function | 1,5 | 1 |
| 3 Interfaccia | 1,5 | 1 (in parallelo alla 2) |
| 4 Stripe e pacchetti | 0,5 | 2, 3 |
| 5 Conversione e crediti inclusi | 0,5 | 2, 3, 0.3 |
| 7 Collaudo | 1 | 2–5 |
| 6 AI d'ufficio illimitata | 2 | dopo, con i piani nuovi |
| 8 Pulizia | — | 30 giorni dopo il passaggio |

**Totale: circa 6 giorni fino alla moneta unica, più 2 per l'AI d'ufficio illimitata.**

## Cosa non cambia

- Il costo vero di ogni chiamata resta registrato com'è oggi.
- I rimborsi su errore nostro restano automatici.
- Il portafoglio unico, l'omaggio mensile non cumulabile e la ricarica automatica (5 € / 25 €) restano com'erano.
- Le aziende già avviate mantengono il loro piano. Cambia solo la moneta con cui pagano render e planimetrie, e i crediti render che avevano diventano euro.
