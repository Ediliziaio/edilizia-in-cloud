# Commessa: economia delle lavorazioni e Cronoprogramma (Gantt) — piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella commessa, ogni fase di lavoro mostra Venduto · Costo previsto · Costo consuntivo (con i margini), e il Cantiere ha una vista nuova «Cronoprogramma»: un Gantt con la firma del contratto, le fasi con date previste e reali, oggi, i ritardi e l'avanzamento.

**Architecture:** nessuna modifica al database. Tutto si ricava da quello che c'è:
- venduto della fase = righe del contratto collegate alla fase (`order_items.phase_id`, prezzo × quantità − sconto di riga);
- costo previsto = `cost_preventivo` di persone (`order_employees`) e ditte (`order_external_teams`) della fase + costo d'acquisto delle righe collegate (`purchase_price`, altrimenti `standard_cost`);
- costo consuntivo = `total_cost` di persone e ditte + righe degli ordini d'acquisto emessi e scarichi di magazzino delle righe della fase, con la regola di `v_ordine_marginalita` (uno scarico di una riga coperta da un OdA non si conta due volte);
- date reali: inizio = primo rapportino inviato/approvato con ore sulla fase (`campo_rapportini.fasi_lavorate`), fine = `completata_il` (o l'ultimo rapportino) per le fasi completate;
- data del contratto = `quotes.signed_at` del preventivo collegato (`orders.quote_id`), altrimenti `orders.created_at` detto «Commessa aperta».
La logica sta in due moduli puri e testati (`src/lib/orders/economiaFasi.ts`, `src/lib/orders/cronoprogramma.ts`); due hook leggono i dati che mancano; i componenti mostrano.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Supabase (PostgREST), Tailwind + shadcn/ui, date-fns, Vitest + Testing Library.

**Regole del progetto da rispettare:** solo in locale (worktree `eic-ui`, branch `traccia-ui`), niente push e niente migrazioni; permessi: venduto con `canViewOrderAmounts`, costi con `canViewCosts`, margini con `canViewMargins`; da telefono il Cronoprogramma non c'è (vista solo tablet/computer) e la riga economica della fase è nascosta come il riepilogo costi; testi in italiano, dal punto di vista di chi usa l'app.

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

- [ ] **Step 1: test che falliscono** — casi:
  - venduto = prezzo × quantità − sconto di riga, solo righe della fase;
  - costo previsto = manodopera (`employee`) + ditte (`team`) + righe (`purchase_price`, se manca `standard_cost`);
  - consuntivo = `total_cost` + righe OdA della riga + scarichi meno carichi (mai sotto zero) delle righe NON coperte da un OdA;
  - scostamento = consuntivo − previsto; margini % sul venduto, `null` senza venduto;
  - righe e assegnazioni senza fase (o con una fase che non c'è) finiscono in `senzaFase`; `totaleFasi` = somma delle fasi.
- [ ] **Step 2:** `npx vitest run src/test/logic/economiaFasi.test.ts` → FAIL (modulo mancante).
- [ ] **Step 3: implementazione** — funzioni `vendutoRiga`, `costoPrevistoRiga`, `costoConsuntivoRighe`, `economiaFasi` con i tipi `RigaContrattoFase`, `AssegnazioneFase`, `RigaAcquisto`, `MovimentoMagazzino`, `EconomiaFase { venduto, costoPrevisto, costoConsuntivo, previsto, consuntivo, scostamento, marginePrevistoPct, margineConsuntivoPct, righe }`, `EconomiaFasi { perFase, senzaFase, totaleFasi }`. Arrotondamento ai centesimi solo alla fine.
- [ ] **Step 4:** stessi test → PASS.
- [ ] **Step 5:** commit «Commessa: economia delle fasi (venduto, costo previsto, consuntivo)».

### Task 2: logica del cronoprogramma

**Files:** crea `src/lib/orders/cronoprogramma.ts`; test `src/test/logic/cronoprogramma.test.ts`

- [ ] **Step 1: test che falliscono** — casi:
  - `lavoroRealeFasi`: solo rapportini `inviato`/`approvato`; primo e ultimo giorno e ore per fase da `fasi_lavorate: [{ phase_id, ore }]`; ignora voci senza `phase_id`;
  - `fasiCronoprogramma`: inizio reale dal primo rapportino; fine reale = `completata_il`, altrimenti ultimo rapportino, solo se completata; `ritardoFine` per una chiusa tardi e per una aperta oltre la fine prevista; `ritardoInizio` per una iniziata tardi e per una non iniziata oltre l'inizio previsto; completata = 100%;
  - `traguardiCommessa`: «Contratto firmato» con la firma del preventivo, altrimenti «Commessa aperta»; inizio/fine lavori e consegna solo se ci sono; ordinati per data;
  - `intervalloCronoprogramma`: da 3 giorni prima della data più vecchia a 3 dopo la più recente, oggi compreso;
  - `barra`: posizione e larghezza in % (estremi compresi, tagliate ai bordi);
  - `tacche`: lunedì fino a 120 giorni, poi primi del mese;
  - `avanzamentoComplessivo`: pesato sul venduto se tutte le fasi ne hanno, sulla durata prevista se tutte hanno le date, altrimenti in parti uguali; dice quale peso ha usato.
- [ ] **Step 2:** run → FAIL. **Step 3:** implementazione (date come `yyyy-MM-dd`, conti in UTC). **Step 4:** run → PASS. **Step 5:** commit.

### Task 3: dati

**Files:** modifica `src/hooks/useOrderWorkPhases.ts`; crea `src/hooks/useCostiMaterialiFasi.ts`, `src/hooks/useCronoprogramma.ts`

- [ ] `WorkPhase.completata_il` (giorno locale `yyyy-MM-dd` o `null`); `PhaseMaterial` con `unit_price`, `discount_percent`, `standard_cost` (select di `order_items` allargata).
- [ ] `updatePhase`: se lo stato diventa `completata` scrive anche `completata_il = now`, `completata_da = utente`, `percentuale = 100` (come l'app di campo, `CampoAvanzamento`); se torna aperta svuota `completata_il`/`completata_da`. Oggi dall'ufficio la data di chiusura non si scriveva mai (98 fasi, 0 con data).
- [ ] `useCostiMaterialiFasi(orderId, abilitato)`: `purchase_order_items(order_item_id, line_total, purchase_orders!inner(status, order_id))` della commessa con stato `inviato|confermato|parziale|ricevuto`; `warehouse_movements(order_item_id, movement_type, quantity, unit_cost)` della commessa, `carico|scarico`. Solo con `canViewCosts`.
- [ ] `useCronoprogramma(orderId, quoteId)`: `campo_rapportini(data_lavoro, stato, fasi_lavorate)` della commessa; `quotes.signed_at` del preventivo collegato (se non si legge: nessuna firma, si usa l'apertura).
- [ ] Test: i test UI esistenti sulle fasi devono restare verdi; commit.

### Task 4: nomi giusti per i costi

**Files:** `WorkAssignmentRow.tsx`, `OrderWorkPhases.tsx` (dialog «Aggiungi persona o ditta»), `LaborApprovalDialog.tsx`; test `orderWorkPlanning.test.tsx`, `laborApprovalDialog.test.tsx`

- [ ] «Budget» → «Costo previsto», «Costo registrato» → «Costo consuntivo», «Budget manodopera €» → «Costo previsto manodopera €», «Budget, costi e listino» → «Costi previsti e consuntivi, listino»; nella revisione dei rapportini «Budget manodopera interna» → «Costo previsto manodopera interna», «Già registrato sulla commessa» → «Costo consuntivo già registrato».
- [ ] Aggiornare i test che cercano le etichette vecchie; run; commit.

### Task 5: economia nella fase e riepilogo

**Files:** crea `EconomiaFaseRiga.tsx`, `RiepilogoEconomicoFasi.tsx`; modifica `OrderWorkPhases.tsx`

- [ ] `OrderWorkPhases` calcola `economiaFasi({ fasi, righe: materials, assegnazioni: allAssignments, acquisti, movimenti })`.
- [ ] Nella scheda della fase, dopo «Chi la fa», una riga **Economia**: Venduto · Costo previsto · Costo consuntivo (rosso se oltre il previsto, «+X € sul previsto»), sotto il dettaglio (manodopera · ditte · materiali e forniture) e, con `canViewMargins`, «Margine previsto X% · consuntivo Y%». Senza righe collegate il venduto dice «—» e spiega come averlo («collega le righe del contratto alla fase»). Nascosta da telefono (`max-sm:hidden`), come il riepilogo costi.
- [ ] Al posto di «Manodopera della fase: budget … · costo …» niente: la riga Economia la sostituisce.
- [ ] Nel riepilogo chiuso della fase (sempre visibile): «costo oltre il previsto» in rosso, come «scadenza superata», solo con `canViewCosts`.
- [ ] In cima a Lavorazioni «Riepilogo economico delle lavorazioni» al posto di «Riepilogo costi della manodopera»: le stesse tre voci per tutte le fasi, scostamento, barra consuntivo/previsto, e una riga per quello che non è in nessuna fase.
- [ ] Test UI: permessi (senza `canViewOrderAmounts` niente venduto; senza `canViewCosts` niente costi; senza `canViewMargins` niente margini); commit.

### Task 6: Cronoprogramma

**Files:** crea `CronoprogrammaCommessa.tsx`; modifica `detailNavigation.ts`, `CantiereViewNav.tsx`, `OrderDetail.tsx`; test `cronoprogrammaCommessa.test.tsx`, `cantiereViewNav.test.tsx`

- [ ] Vista `{ value: "cronoprogramma", label: "Cronoprogramma", description: "Le fasi nel tempo: date previste e reali, ritardi e avanzamento." }` dopo «Lavorazioni»; sezione `section-cronoprogramma`.
- [ ] Da telefono non compare nel menu e un link diretto mostra Lavorazioni.
- [ ] In cima: data del contratto (o apertura), lavori previsti dal–al, avanzamento complessivo (con l'atteso a oggi di `order_schedule_health`), fasi in ritardo e ritardo massimo.
- [ ] Il grafico: asse con tacche (settimane o mesi), riga dei traguardi (contratto, inizio e fine lavori, consegna), linea di oggi; per ogni fase la barra prevista (chiara, con l'avanzamento dentro) e sotto la barra reale (verde chiusa in tempo, ambra in corso, rossa la parte oltre la fine prevista); «+N gg» accanto alla fase in ritardo; con `canViewCosts` «costo +X €» se il consuntivo supera il previsto. Al clic su una fase il dettaglio: previsto, reale, ritardo, avanzamento, ore, e i tre numeri economici secondo i permessi.
- [ ] Fasi senza date previste elencate sotto, con l'invito ad aggiungerle in Lavorazioni. Commessa senza fasi: invito a crearle.
- [ ] Il grafico scorre in orizzontale nel suo riquadro, non la pagina.
- [ ] Test UI con dati finti: righe, linea di oggi, ritardi, traguardo del contratto, permessi; commit.

### Task 7: verifica

- [ ] Typecheck mirato dei file toccati (tsconfig ristretto nella radice, con errore voluto come prova); `npx vitest run` dei test toccati, poi suite completa contro i rossi noti.
- [ ] Browser su `localhost:8095` (preview `eic-ui`): la commessa demo con 8 fasi (Elena Demo CFO 3) — riga Economia, riepilogo, Cronoprogramma; a 375 px il Cronoprogramma non c'è e Lavorazioni resta densa.
- [ ] Niente push, niente migrazioni. Memoria aggiornata.

## Rischi e scelte

- **Doppio conteggio della manodopera prevista:** se una riga del contratto ha un costo d'acquisto che è già manodopera e la stessa manodopera è anche in un'assegnazione, il costo previsto la conta due volte. Nessun campo delle righe distingue lavoro e materiale (`categoria` è il nome della categoria). Mitigazione: il dettaglio mostra sempre le tre voci (manodopera · ditte · materiali e forniture), così si vede da dove viene il numero.
- **Venduto non collegato:** oggi 40 righe su 93 delle commesse con fasi hanno una fase. Il riepilogo dice quanto venduto resta fuori dalle fasi.
- **Fine reale delle fasi già chiuse:** nessuna ha `completata_il`; per loro la fine reale è l'ultimo rapportino, e dove manca anche quello la barra reale non c'è.
- **SAL e varianti come traguardi:** in produzione 0 SAL e 1 variante senza data: non entrano ora.
