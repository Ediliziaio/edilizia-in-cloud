# Commessa: economia delle lavorazioni e Cronoprogramma (Gantt) — piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella commessa, ogni fase di lavoro mostra Venduto · Costo previsto · Costo consuntivo (con i margini), e il Cantiere ha una vista nuova «Cronoprogramma»: un Gantt con la firma del contratto, le fasi con date previste e reali, oggi, i ritardi e l'avanzamento.

**Architecture:** una sola colonna nuova nel database (`order_work_phases.importo_venduto`, vedi «Revisione dopo la prova sui dati»); il resto si ricava da quello che c'è:
- venduto della fase = l'importo scritto sulla fase; se manca, le righe del contratto collegate alla fase con un prezzo (`order_items.phase_id`, prezzo × quantità − sconto di riga); se mancano anche quelle, non c'è («—», mai «0,00 €»);
- costo previsto = `cost_preventivo` di persone (`order_employees`) e ditte (`order_external_teams`) della fase + costo d'acquisto delle righe collegate (`purchase_price`, altrimenti `standard_cost`);
- costo consuntivo = `total_cost` di persone e ditte + righe degli ordini d'acquisto emessi e scarichi di magazzino delle righe della fase, con la regola di `v_ordine_marginalita` (uno scarico di una riga coperta da un OdA non si conta due volte);
- date reali: inizio = primo rapportino inviato/approvato con ore sulla fase (`campo_rapportini.fasi_lavorate`), fine = `completata_il` (o l'ultimo rapportino) per le fasi completate;
- data del contratto = `quotes.signed_at` del preventivo collegato (`orders.quote_id`), altrimenti `orders.created_at` detto «Commessa aperta».
La logica sta in due moduli puri e testati (`src/lib/orders/economiaFasi.ts`, `src/lib/orders/cronoprogramma.ts`); due hook leggono i dati che mancano; i componenti mostrano.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Supabase (PostgREST), Tailwind + shadcn/ui, date-fns, Vitest + Testing Library.

**Regole del progetto da rispettare:** solo in locale (worktree `eic-ui`, branch `traccia-ui`), niente push; l'unica migrazione è una colonna in più, vuota, applicata e riallineata come da CLAUDE.md (non cambia niente per l'app pubblicata); permessi: venduto con `canViewOrderAmounts`, costi con `canViewCosts`, margini con `canViewMargins`; da telefono il Cronoprogramma non c'è (vista solo tablet/computer) e la riga economica della fase è nascosta come il riepilogo costi; testi in italiano, dal punto di vista di chi usa l'app.

---

## File

| File | Cosa |
|---|---|
| Crea `src/lib/orders/economiaFasi.ts` | Venduto, costo previsto, costo consuntivo e margini per fase; parte «senza fase» |
| Crea `src/lib/orders/cronoprogramma.ts` | Date reali dai rapportini, ritardi, traguardi, asse del tempo, tacche, avanzamento complessivo |
| Crea `src/hooks/useCostiMaterialiFasi.ts` | Righe degli OdA emessi e movimenti di magazzino della commessa |
| Crea `src/hooks/useCronoprogramma.ts` | Rapportini (data, stato, fasi) e firma del preventivo collegato |
| Crea `src/components/orders/EconomiaFaseRiga.tsx` | Riga «Economia» nella scheda della fase |
| Crea `src/components/orders/RiepilogoEconomicoFasi.tsx` | Riepilogo in cima a Lavorazioni (sostituisce «Riepilogo costi della manodopera») |
| Crea `src/components/orders/CronoprogrammaCommessa.tsx` | Il Gantt |
| Modifica `src/hooks/useOrderWorkPhases.ts` | `completata_il` nella fase; prezzo, sconto, costo standard nelle righe; chiusura dall'ufficio che scrive `completata_il` |
| Modifica `src/components/orders/OrderWorkPhases.tsx` | Economia per fase, riepilogo nuovo, avviso «costo oltre il previsto», etichette |
| Modifica `src/components/orders/WorkAssignmentRow.tsx` | «Budget» → «Costo previsto», «Costo registrato» → «Costo consuntivo» |
| Modifica `src/components/orders/LaborApprovalDialog.tsx` | Stessi nomi |
| Modifica `src/lib/orders/detailNavigation.ts` | Vista `cronoprogramma` e sezione `section-cronoprogramma` |
| Modifica `src/components/orders/CantiereViewNav.tsx` | Da telefono la vista non compare |
| Modifica `src/pages/azienda/OrderDetail.tsx` | Mostra il Cronoprogramma; da telefono ricade su Lavorazioni |
| Test | `src/test/logic/economiaFasi.test.ts`, `src/test/logic/cronoprogramma.test.ts`, `src/test/ui/cronoprogrammaCommessa.test.tsx`, aggiornare `orderWorkPlanning.test.tsx`, `laborApprovalDialog.test.tsx`, `cantiereViewNav.test.tsx` |

---

### Task 1: logica dell'economia delle fasi

**Files:** crea `src/lib/orders/economiaFasi.ts`; test `src/test/logic/economiaFasi.test.ts`

- [x] **Step 1: test che falliscono** — casi:
  - venduto = prezzo × quantità − sconto di riga, solo righe della fase;
  - costo previsto = manodopera (`employee`) + ditte (`team`) + righe (`purchase_price`, se manca `standard_cost`);
  - consuntivo = `total_cost` + righe OdA della riga + scarichi meno carichi (mai sotto zero) delle righe NON coperte da un OdA;
  - scostamento = consuntivo − previsto; margini % sul venduto, `null` senza venduto;
  - righe e assegnazioni senza fase (o con una fase che non c'è) finiscono in `senzaFase`; `totaleFasi` = somma delle fasi.
- [x] **Step 2:** `npx vitest run src/test/logic/economiaFasi.test.ts` → FAIL (modulo mancante).
- [x] **Step 3: implementazione** — funzioni `vendutoRiga`, `costoPrevistoRiga`, `costoConsuntivoRighe`, `economiaFasi` con i tipi `RigaContrattoFase`, `AssegnazioneFase`, `RigaAcquisto`, `MovimentoMagazzino`, `EconomiaFase { venduto, costoPrevisto, costoConsuntivo, previsto, consuntivo, scostamento, marginePrevistoPct, margineConsuntivoPct, righe }`, `EconomiaFasi { perFase, senzaFase, totaleFasi }`. Arrotondamento ai centesimi solo alla fine.
- [x] **Step 4:** stessi test → PASS.
- [x] **Step 5:** commit «Commessa: economia delle fasi (venduto, costo previsto, consuntivo)».

### Task 2: logica del cronoprogramma

**Files:** crea `src/lib/orders/cronoprogramma.ts`; test `src/test/logic/cronoprogramma.test.ts`

- [x] **Step 1: test che falliscono** — casi:
  - `lavoroRealeFasi`: solo rapportini `inviato`/`approvato`; primo e ultimo giorno e ore per fase da `fasi_lavorate: [{ phase_id, ore }]`; ignora voci senza `phase_id`;
  - `fasiCronoprogramma`: inizio reale dal primo rapportino; fine reale = `completata_il`, altrimenti ultimo rapportino, solo se completata; `ritardoFine` per una chiusa tardi e per una aperta oltre la fine prevista; `ritardoInizio` per una iniziata tardi e per una non iniziata oltre l'inizio previsto; completata = 100%;
  - `traguardiCommessa`: «Contratto firmato» con la firma del preventivo, altrimenti «Commessa aperta»; inizio/fine lavori e consegna solo se ci sono; ordinati per data;
  - `intervalloCronoprogramma`: da 3 giorni prima della data più vecchia a 3 dopo la più recente, oggi compreso;
  - `barra`: posizione e larghezza in % (estremi compresi, tagliate ai bordi);
  - `tacche`: lunedì fino a 120 giorni, poi primi del mese;
  - `avanzamentoComplessivo`: pesato sul venduto se tutte le fasi ne hanno, sulla durata prevista se tutte hanno le date, altrimenti in parti uguali; dice quale peso ha usato.
- [x] **Step 2:** run → FAIL. **Step 3:** implementazione (date come `yyyy-MM-dd`, conti in UTC). **Step 4:** run → PASS. **Step 5:** commit.

### Task 3: dati

**Files:** modifica `src/hooks/useOrderWorkPhases.ts`; crea `src/hooks/useCostiMaterialiFasi.ts`, `src/hooks/useCronoprogramma.ts`

- [x] `WorkPhase.completata_il` (giorno locale `yyyy-MM-dd` o `null`); `PhaseMaterial` con `unit_price`, `discount_percent`, `standard_cost` (select di `order_items` allargata).
- [x] `updatePhase`: se lo stato diventa `completata` scrive anche `completata_il = now`, `completata_da = utente` (come l'app di campo, `CampoAvanzamento`; la percentuale non serve, ovunque una fase completata vale 100); se torna aperta svuota `completata_il`/`completata_da`. Oggi dall'ufficio la data di chiusura non si scriveva mai (98 fasi, 0 con data).
- [x] `useCostiMaterialiFasi(orderId, abilitato)`: `purchase_order_items(order_item_id, line_total, purchase_orders!inner(status, order_id))` della commessa con stato `inviato|confermato|parziale|ricevuto`; `warehouse_movements(order_item_id, movement_type, quantity, unit_cost)` della commessa, `carico|scarico`. Solo con `canViewCosts`.
- [x] `useCronoprogramma(orderId, quoteId)`: `campo_rapportini(data_lavoro, stato, fasi_lavorate)` della commessa; `quotes.signed_at` del preventivo collegato (se non si legge: nessuna firma, si usa l'apertura).
- [x] Test: i test UI esistenti sulle fasi devono restare verdi; commit.

### Task 4: nomi giusti per i costi

**Files:** `WorkAssignmentRow.tsx`, `OrderWorkPhases.tsx` (dialog «Aggiungi persona o ditta»), `LaborApprovalDialog.tsx`; test `orderWorkPlanning.test.tsx`, `laborApprovalDialog.test.tsx`

- [x] «Budget» → «Costo previsto», «Costo registrato» → «Costo consuntivo», «Budget manodopera €» → «Costo previsto manodopera €», «Budget, costi e listino» → «Costi previsti e consuntivi, listino»; nella revisione dei rapportini «Budget manodopera interna» → «Costo previsto manodopera interna», «Già registrato sulla commessa» → «Costo consuntivo già registrato».
- [x] Aggiornare i test che cercano le etichette vecchie; run; commit.

### Task 5: economia nella fase e riepilogo

**Files:** crea `EconomiaFaseRiga.tsx`, `RiepilogoEconomicoFasi.tsx`; modifica `OrderWorkPhases.tsx`

- [x] `OrderWorkPhases` calcola `economiaFasi({ fasi, righe: materials, assegnazioni: allAssignments, acquisti, movimenti })`.
- [x] Nella scheda della fase, dopo «Chi la fa», una riga **Economia**: Venduto · Costo previsto · Costo consuntivo (rosso se oltre il previsto, «+X € sul previsto»), sotto il dettaglio (manodopera · ditte · materiali e forniture) e, con `canViewMargins`, «Margine previsto X% · consuntivo Y%». Senza righe collegate il venduto dice «—» e spiega come averlo («collega le righe del contratto alla fase»). Nascosta da telefono (`max-sm:hidden`), come il riepilogo costi.
- [x] Al posto di «Manodopera della fase: budget … · costo …» niente: la riga Economia la sostituisce.
- [x] Nel riepilogo chiuso della fase (sempre visibile): «costo oltre il previsto» in rosso, come «scadenza superata», solo con `canViewCosts`.
- [x] In cima a Lavorazioni «Riepilogo economico delle lavorazioni» al posto di «Riepilogo costi della manodopera»: le stesse tre voci per tutte le fasi, scostamento, barra consuntivo/previsto, e una riga per quello che non è in nessuna fase.
- [x] Test UI: permessi (senza `canViewOrderAmounts` niente venduto; senza `canViewCosts` niente costi; senza `canViewMargins` niente margini); commit.

### Task 6: Cronoprogramma

**Files:** crea `CronoprogrammaCommessa.tsx`; modifica `detailNavigation.ts`, `CantiereViewNav.tsx`, `OrderDetail.tsx`; test `cronoprogrammaCommessa.test.tsx`, `cantiereViewNav.test.tsx`

- [x] Vista `{ value: "cronoprogramma", label: "Cronoprogramma", description: "Le fasi nel tempo: date previste e reali, ritardi e avanzamento." }` dopo «Lavorazioni»; sezione `section-cronoprogramma`.
- [x] Da telefono non compare nel menu e un link diretto mostra Lavorazioni.
- [x] In cima: data del contratto (o apertura), lavori previsti dal–al, avanzamento complessivo (con l'atteso a oggi di `order_schedule_health`), fasi in ritardo e ritardo massimo.
- [x] Il grafico: asse con tacche (settimane o mesi), riga dei traguardi (contratto, inizio e fine lavori, consegna), linea di oggi; per ogni fase la barra prevista (chiara, con l'avanzamento dentro) e sotto la barra reale (verde chiusa in tempo, ambra in corso, rossa la parte oltre la fine prevista); «+N gg» accanto alla fase in ritardo; con `canViewCosts` «costo +X €» se il consuntivo supera il previsto. Al clic su una fase il dettaglio: previsto, reale, ritardo, avanzamento, ore, e i tre numeri economici secondo i permessi.
- [x] Fasi senza date previste elencate sotto, con l'invito ad aggiungerle in Lavorazioni. Commessa senza fasi: invito a crearle.
- [x] Il grafico scorre in orizzontale nel suo riquadro, non la pagina.
- [x] Test UI con dati finti: righe, linea di oggi, ritardi, traguardo del contratto, permessi; commit.

### Task 7: verifica

- [x] Typecheck mirato dei file toccati (tsconfig ristretto nella radice, con errore voluto come prova); `npx vitest run` dei test toccati, poi suite completa contro i rossi noti.
- [x] Browser su `localhost:8095` (preview `eic-ui`): la commessa demo ORD-DEM-RIS01 (10 fasi) — riga Economia, tabella, Cronoprogramma; il venduto si prova con un fetch finto (niente dati scritti nella demo); a 375 px il Cronoprogramma non c'è e Lavorazioni resta densa.
- [x] Niente push. Memoria aggiornata.

## Rischi e scelte

- **Doppio conteggio della manodopera prevista:** se una riga del contratto ha un costo d'acquisto che è già manodopera e la stessa manodopera è anche in un'assegnazione, il costo previsto la conta due volte. Nessun campo delle righe distingue lavoro e materiale (`categoria` è il nome della categoria). Mitigazione: il dettaglio mostra sempre le tre voci (manodopera · ditte · materiali e forniture), così si vede da dove viene il numero.
- **Venduto non collegato:** oggi 40 righe su 93 delle commesse con fasi hanno una fase. Il riepilogo dice quanto venduto resta fuori dalle fasi.
- **Fine reale delle fasi già chiuse:** nessuna ha `completata_il`; per loro la fine reale è l'ultimo rapportino, e dove manca anche quello la barra reale non c'è.
- **SAL e varianti come traguardi:** in produzione 0 SAL e 1 variante senza data: non entrano ora.

## Revisione dopo la prova sui dati (06/10/2026, pomeriggio)

Guardando la commessa demo nel browser sono venute fuori tre cose che il piano non aveva previsto.

**1. Il venduto delle righe non basta.** Sulle 17 commesse con fasi solo 5 hanno righe del contratto collegate a una fase, e quelle righe sono quasi tutte materiali con il costo d'acquisto e il prezzo di vendita a zero (23 righe con un prezzo in tutto). Nella commessa ORD-DEM-RIS01 il valore venduto (85.000 € imponibile) sta solo nel totale della commessa. Il «Venduto» per lavorazione, il primo dei tre numeri chiesti, sarebbe stato «—» ovunque, o peggio «0,00 €».
- [x] Colonna `order_work_phases.importo_venduto numeric(12,2)` (≥ 0, vuota = dalle righe): migrazione `20281006120000_fasi_importo_venduto.sql`, applicata con `apply_migration` e riallineata. Nessun trigger, nessuna vista la usa: per l'app pubblicata non cambia niente.
- [x] `economiaFasi`: venduto = importo della fase, altrimenti righe con un prezzo, altrimenti nessuno (`fonteVenduto: "fase" | "righe" | null`); `vendutoRighe` per il confronto; `fasiSenzaVenduto`.
- [x] Il venduto si scrive nella fase (campo nella riga Economia) e nella tabella in cima a Lavorazioni; vuoto torna alle righe; Esc annulla; formato italiano (`parseDecimalIT`, «8.000» = ottomila). Con `canEditOrders` e `canViewOrderAmounts`.
- [x] Confronto col contratto (`agreedContractValue`: imponibile più varianti approvate): «nelle lavorazioni X · da ripartire Y», anche nella riga chiusa della tabella.

**2. Margini e scostamenti a metà lavori ingannano.** Un consuntivo parziale fa margini altissimi e «risparmi» che non lo sono.
- [x] Il margine di una fase si legge sul consuntivo solo se la fase è chiusa o ha già superato il previsto; altrimenti è quello previsto, detto «previsto».
- [x] Il margine del totale c'è solo se ogni fase ha il venduto, e sul consuntivo solo a lavori finiti.
- [x] Niente colonna «scostamento»: il rosso con «+X €» sta sul consuntivo delle fasi sforate. Il margine è rosso solo se negativo.

**3. Troppa roba nella fase aperta** (richiesta dell'utente: «migliora gli spazi, meno casino»).
- [x] Aperta, la fase non ripete sotto il titolo date e persone (sono subito sotto) né lo stato (c'è la tendina).
- [x] Ordine delle righe: Quando · Economia · Chi la fa · Note · Materiali, tutte con la stessa colonna delle etichette.
- [x] Riga Economia senza riquadro: quattro cifre in colonna (Venduto, Costo previsto, Costo consuntivo, Margine); le voci dei costi nel titolo delle cifre e nell'elenco sotto.
- [x] Persone e ditte in un elenco solo (`ElencoAssegnazioni`): intestazione «Costo previsto · Costo consuntivo» una volta, i due costi in colonna, la matita al posto del bottone «Gestisci»; da telefono la riga sotto il nome è corta («senza app»).
- [x] «Riepilogo economico delle lavorazioni» diventa «Economia delle lavorazioni»: chiusa, i totali in una riga; aperta, una tabella con una riga per fase (venduto scrivibile, costi, margine), totale, fuori dalle fasi e contratto. Solo in Lavorazioni, non in Squadra e mezzi.

**Cronoprogramma, dopo averlo visto con 10 fasi su quattro mesi:**
- [x] Larghezza: 8 px al giorno fino a 120 giorni, 4 oltre (prima 14: un cantiere di quattro mesi era largo il doppio dello schermo). I nomi delle fasi restano fermi quando il grafico scorre; se scorre, si apre su oggi.
- [x] Un solo ritardo per fase: quello sulla fine (chiusa tardi, o aperta oltre la fine prevista). Una fase partita tardi ma chiusa in tempo non è in ritardo; l'inizio mancato di una fase che ha ancora la fine davanti si segnala a parte, in ambra («inizio +N gg»).
- [x] Una fase aperta con la fine prevista passata è rossa fino a oggi anche senza rapportini: è lì che si sfora.
- [x] Avanzamento = media delle fasi, lo stesso conto della testata della commessa (prima 56% nel Gantt e 55% in testata).
- [x] Senza preventivo firmato il traguardo si chiama «Commessa aperta», non «Contratto»; etichette dei traguardi dentro il grafico e su due righe quando sono vicini.

**Rischio in più:** `importo_venduto` lo legge chi legge le fasi, compresi gli operai assegnati alla commessa (via API, non dall'app). È la stessa esposizione che hanno già i prezzi delle righe del contratto (`order_items`, che legge anche il cliente). Se serve chiuderla: colonna in una tabella a parte con la policy di `can_view_order_amounts`.

## Tempi della fase e Attività (06/10/2026, sera)

Richiesta dell'utente: nella riga «Quando», se la tempistica sfora, di lato il paragone — previsti X giorni, ce ne sono voluti Y, quando è finita davvero — e sistemare il riquadro «Attività».

- [x] `confrontoTempi(fase, oggi)` in `cronoprogramma.ts`: esito (`finita_in_tempo`, `finita_in_ritardo`, `finita` senza data reale, `aperta_oltre`, `in_ritardo_inizio`, `in_corso`, `da_iniziare`), giorni previsti (inizio e fine compresi), giorni reali (dal primo rapportino alla fine reale, o a oggi se aperta), ritardo, giorni che mancano.
- [x] Giorni reali non detti quando non sono credibili: fase chiusa senza giorno di chiusura e con un solo giorno di rapportini (`chiusuraRegistrata` nel cronoprogramma). Il titolo della frase dice da dove vengono le date reali.
- [x] `TempiFase` accanto alle date: «Previsti 7 giorni → reali 12 · finita il 14/06 · 6 giorni di ritardo» (rosso), «… finita l'08/06, in tempo» (verde), «Previsti 7 giorni → aperta da 64 · doveva finire il 05/08 · 62 giorni di ritardo», «Non ancora iniziata · doveva finire …», «Doveva iniziare … · N giorni di ritardo sull'inizio» (ambra), «Previsti 10 giorni → in corso da 4 · mancano 4 giorni». Da telefono solo la frase breve, se qualcosa non va.
- [x] Nel riepilogo della fase chiusa «scadenza superata» diventa il ritardo in giorni («84 giorni di ritardo», «finita con 6 giorni di ritardo»).
- [x] Attività della commessa: `LinkedTasks compatta` — una riga sola («Attività · nessuna · Aggiungi», 46 px invece del riquadro col messaggio al centro); l'elenco compare sotto solo se ci sono attività; mentre carica non dice «nessuna», se non carica mostra l'errore. Le altre pagine che usano le attività restano come prima.
