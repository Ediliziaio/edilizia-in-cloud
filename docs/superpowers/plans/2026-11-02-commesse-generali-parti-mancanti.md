# Commesse generali, parti mancanti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare ciò che il piano di prodotto promette e che non esiste ancora, partendo da una prova vera con un'azienda vera.

**Architecture:** Ogni tappa si pubblica da sola e lascia l'app coerente. Logica pura in `src/lib/orders/generali/`, letture e scritture in `src/hooks/useGenerale*.ts`, interfaccia in `src/components/orders/generali/`. Tutto si calcola in lettura, come i costi comuni oggi.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase (Postgres, RPC, RLS), Vitest, ExcelJS.

**Spec:** `docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md` (§2 moduli e modelli, §3 UX, §4 tappe, §6 domande aperte, §7 stato).

## Dove siamo

Già su main (`ffcc41433`): nucleo, contratto e SAL, elenco prezzi, subappalti, piano economico, unità e vendite, varianti, investitori, simulatore, dossier, documenti, fatture, avvisi, cruscotto, Silvio.

Sul ramo `commesse-generali`, non ancora pubblicato: riquadri da telefono, «A SAL», «Per partire», togli/sposta con riepilogo, raggruppa, filtri, cron degli avvisi (`20281105111000`).

In produzione solo la Demo ha generali: 3, tutte d'esempio. Nessuna azienda vera l'ha ancora usata.

## Ordine e perché

| Tappa | Cosa | Dimensione | Dipende da |
|---|---|---|---|
| **0** | Pubblicare il ramo | Piccola | La tua conferma |
| **1** | Collaudo dal vivo e domande a Pistilli | Media | Il tuo login, un incontro |
| **2** | Finiture di Panoramica e tabella figlie | Media | — |
| **3** | Dove sta la funzione nei piani tariffari | Piccola | Decisione D1 |
| **4** | Quote manuali dei costi comuni, scenari salvati | Media | — |
| **5** | Modello personalizzato e moduli accendibili | Grande | Tappa 1 |
| **6** | Vita del contratto | Grande | Tappa 1, D2 |
| **7** | Post-vendita | Media | D3 |
| **8** | Cassa aziendale | Media | — |
| **9** | Affitti | Grande | D4, un cliente che lo chieda |

Le tappe 6-9 non vanno costruite prima della tappa 1: sono funzioni pensate a tavolino, e le risposte di Pistilli e di un costruttore (spec §6) possono cambiarle o toglierle.

## Decisioni che spettano a te

| # | Domanda | Cosa farei io |
|---|---|---|
| **D1** | In quale piano tariffario sta la funzione? | Modulo a parte, spento di base, acceso a mano per azienda finché non c'è un listino. L'interruttore in Impostazioni resta per scegliere i modelli |
| **D2** | Vita del contratto: solo appalti pubblici o anche privati? | Dipende da Pistilli. Un committente privato non ha le stesse regole |
| **D3** | Post-vendita: gli acquirenti aprono segnalazioni da soli o le registra l'ufficio? | Prima solo l'ufficio. Il portale acquirente è un lavoro a parte |
| **D4** | Affitti: serve davvero? | Da non costruire finché un cliente non lo chiede |

## Global Constraints

- Migrazioni: SQL idempotente; versione libera controllata con `ls supabase/migrations/<versione>_*.sql` subito prima di scrivere e di nuovo prima del push (main si muove spesso: il 31/10 ci sono state due collisioni).
- Un file in `supabase/migrations/` va in produzione al primo push; se `apply_migration` è negato, il file aspetta il push. Mai `supabase db push`.
- Funzioni nuove: `REVOKE ALL … FROM PUBLIC, anon` e `GRANT` esplicito. Permessi con `has_permission_for_company` e l'azienda della riga, mai `has_permission`.
- Tabelle nuove: `company_id`, RLS per azienda; `admin_backup_tabelle_scoperte()` deve restare vuota.
- Prove SQL in produzione: blocchi `DO` con `RAISE EXCEPTION` finale.
- Cron nuovi: secondo CLAUDE.md, dopo il deploy della funzione, attesa massima 15 secondi, segreto dal Vault.
- Testi in italiano. Da telefono la generale si legge soltanto; i campi restano a 14 px; niente testi descrittivi inutili; controllo a 375 px.
- Ogni euro una volta sola: una generale ha importo zero e non compare nei totali aziendali.
- Mai parole «server in UE/Italia/Europa».
- Prima del push: `npm run typecheck:ci`, `npm run test:critical`, suite completa confrontata con main pulito, build.

## Review Focus

1. **Quote manuali e commessa nuova:** se dopo aver scritto le quote entra una commessa senza quota, i costi non devono sparire né contare due volte: si torna al criterio automatico e il motivo lo dice (Task 7).
2. **Modulo spento con dati dentro:** spegnere gli investitori nasconde la scheda ma non cancella niente, e i costi di quel modulo restano nel margine del piano (Task 9).
3. **Generale personalizzata senza modulo Contratto:** barra, avvisi, dossier e Silvio non devono cercare dati di un modulo spento né dire «inserisci il contratto» (Task 9).
4. **Sospensione aperta:** una sospensione senza data di ripresa allunga la fine lavori ogni giorno che passa, e l'avviso non deve scattare come ritardo dell'impresa (Task 10).
5. **Cassa aziendale:** una fattura già in cassa e prevista anche nel piano della generale non deve contare due volte nella previsione (Task 13).

---

## Tappa 0 — Pubblicare

### Task 1: Pubblicare il ramo

**Files:** nessun file nuovo.

- [ ] **Step 1:** Suite completa, tipi e build verdi sul ramo. Expected: nessun file che fallisce solo sul ramo rispetto a main pulito.
- [ ] **Step 2:** `git fetch`, unire `origin/main`, ricontrollare `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d`. Expected: nessuna riga.
- [ ] **Step 3:** Commit e `git push origin commesse-generali:main`, solo dopo la tua conferma. Expected: avanzamento diretto, mai forzato.
- [ ] **Step 4:** Controllare CI e Supabase Preview su quel commit; verificare `select jobname from cron.job where jobname='generali-avvisi'`. Expected: una riga, e il primo giro senza errori in `net._http_response`.

---

## Tappa 1 — Collaudo

### Task 2: Prova dal vivo e domande aperte

**Files:**
- Create: `docs/superpowers/plans/2026-11-commesse-generali-collaudo.md`

Il login lo fai tu: la password non si scrive sul sito di produzione per conto tuo.

- [ ] **Step 1:** Percorso completo sulla Demo, a 1280 e 375 px, sui tre esempi (O-0026, O-0031, O-0038): creare, raggruppare, spostare, SAL, unità, investitori, dossier. Expected: elenco di difetti con schermata.
- [ ] **Step 2:** Provare tre ruoli: titolare, capocantiere di una figlia, commercialista (spec §4). Expected: chi non ha il permesso non vede importi o margini, né dalla pagina né da Silvio.
- [ ] **Step 3:** Misurare gli obiettivi di spec §3.6. Expected: contratto con 5 ordini sotto i 5 minuti; «quanto resta da incassare» sotto i 5 secondi; SAL sotto i 3 minuti.
- [ ] **Step 4:** Incontro con Pistilli e un costruttore sulle domande di spec §6, e risposta a D2. Expected: risposte scritte nel documento; tappe 5-9 riviste di conseguenza.
- [ ] **Step 5:** Correggere i difetti trovati, ognuno con il suo test. Togliere gli esempi `[Esempio]` dalla Demo solo quando hai finito di provarli.

---

## Tappa 2 — Finiture

### Task 3: Panoramica fedele al piano

**Files:**
- Create: `src/lib/orders/generali/numeriChiave.ts`
- Create: `supabase/migrations/<versione>_generale_riepilogo_ritardo_indirizzo.sql`
- Modify: `src/components/orders/generali/CommessaGeneraleDettaglio.tsx` (`NumeriChiave`, `TabellaFiglie`, elenco figlie)
- Modify: `src/lib/orders/commesseGenerali.ts` (`FigliaGenerale`, `leggiRiepilogo`)
- Modify: `src/components/orders/generali/NuovaGeneraleDialog.tsx`, `src/pages/azienda/CreateOrder.tsx`
- Test: `src/test/logic/generaleNumeriChiave.test.ts`, `src/test/ui/commesseGenerali.test.tsx`

**Interfaces:**
- Produces: `numeriChiave(modello, t: TotaliGenerale, piano: { margineStima: number; capitaleMassimo: number } | null): { id: string; etichetta: string; valore: number | null }[]`; `FigliaGenerale.previstaIl: string | null`; `giorniDiRitardo(previstaIl: string | null, finitaIl: string | null, oggi: string): number | null`.

Spec §3.3: i quattro numeri sono *Valore · Margine a finire · Da incassare · Capitale impegnato (o Residuo)*, oggi sono fissi su «Da assegnare».

- [ ] **Step 1: Test**

```ts
it("con il piano: appalto mostra il residuo, sviluppo il capitale impegnato", () => {
  const piano = { margineStima: 120_000, capitaleMassimo: 400_000 };
  expect(numeriChiave("appalto", totali, piano).map((n) => n.id)).toEqual(["valore", "margine", "incassare", "residuo"]);
  expect(numeriChiave("sviluppo", totali, piano).map((n) => n.id)).toEqual(["valore", "margine", "incassare", "capitale"]);
});
it("senza piano il margine è quello delle commesse, non uno zero", () => {
  expect(numeriChiave("sviluppo", totali, null).find((n) => n.id === "capitale")).toBeUndefined();
});
it("ritardo: solo se la data è passata e il lavoro non è finito", () => {
  expect(giorniDiRitardo("2026-10-01", null, "2026-10-11")).toBe(10);
  expect(giorniDiRitardo("2026-10-01", "2026-10-05", "2026-10-11")).toBeNull();
  expect(giorniDiRitardo(null, null, "2026-10-11")).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run src/test/logic/generaleNumeriChiave.test.ts`. Expected: FAIL, modulo inesistente.
- [ ] **Step 3:** Scrivere le due funzioni; `NumeriChiave` legge il piano con `useGeneralePianoNumeri(r)` (stessa cache del riquadro).
- [ ] **Step 4:** Migrazione: `commessa_generale_riepilogo` aggiunge `prevista_il` (`orders.expected_date`) e `indirizzo` della generale; `commessa_generale_crea` riceve `p_indirizzo text default null` e lo scrive in `orders.work_address` (nuova firma, `DROP` della vecchia, `REVOKE`/`GRANT`). L'ultima versione del riepilogo è in `20281031172000`: partire da quella.
- [ ] **Step 5:** `TabellaFiglie`: colonna «Ritardo» solo se almeno una figlia ce l'ha. Oltre 50 figlie, pagine da 50 lato client con i totali sempre sull'intera generale.
- [ ] **Step 6:** `NuovaGeneraleDialog` con `CampoIndirizzo`; `CreateOrder` con `?generale=` precompila l'indirizzo della generale, modificabile (spec §2.1).
- [ ] **Step 7:** Test UI: con 60 figlie si vedono 50 righe e il totale le somma tutte. Expected: PASS. Commit.

### Task 4: Ogni numero dice da dove viene, Excel del piano, lotti

**Files:**
- Create: `src/lib/orders/generali/pianoExcelEsporta.ts`
- Create: `supabase/migrations/<versione>_generale_lotti.sql`
- Modify: `src/components/orders/generali/piano/PianoEconomico.tsx`, `piano/RiquadroPiano.tsx`, `CommessaGeneraleDettaglio.tsx`
- Test: `src/test/logic/generalePianoExcelEsporta.test.ts`, `src/test/ui/generalePiano.test.tsx`

**Interfaces:**
- Consumes: `DettaglioRighe`, `DettaglioAperto`; `TIPO_XLSX` da `rendicontoExcel.ts`.
- Produces: `creaExcelPiano(d: { nome: string; confronto: Confronto; cassa: MeseCassa[] }): Promise<ArrayBuffer>`; colonna `orders.lotto text`.

- [ ] **Step 1: Test:** il foglio «Voci» ha una riga per voce con celle numeriche, non testo; la riga totale coincide con `confronto.totali`. Expected: FAIL.
- [ ] **Step 2:** Scrivere `creaExcelPiano` con import dinamico di `exceljs`, come `creaExcelDossier`; bottone «Scarica Excel» nel piano, nascosto da telefono.
- [ ] **Step 3:** Margine e costi in Panoramica aprono `DettaglioRighe` con le righe reali che li compongono (spec §3.1). Test UI: il clic mostra le righe.
- [ ] **Step 4:** Lotti: `orders.lotto` è una sola etichetta di testo, niente terzo livello (spec §5). `TabellaFiglie` raggruppa per lotto solo se almeno una figlia ce l'ha. Test UI: senza lotti la tabella non cambia. Commit.

### Task 5: Sposta anche dalla pagina della figlia

**Files:**
- Modify: `src/components/orders/generali/PercorsoGenerale.tsx`
- Test: `src/test/ui/commesseGenerali.test.tsx`

**Interfaces:**
- Consumes: `SpostaFigliaDialog` (`riepilogo`, `totali`, `figlia`, `azione`, `onClose`).

- [ ] **Step 1:** Test: dalla striscia in cima alla figlia si apre lo stesso riepilogo; da telefono il menu non c'è. Expected: FAIL.
- [ ] **Step 2:** Aggiungere il menu, riusando il dialogo. Test verde. Commit.

---

## Tappa 3 — Piani tariffari

### Task 6: La funzione dietro il suo flag

**Files:**
- Create: `supabase/migrations/<versione>_commesse_generali_flag.sql`
- Modify: `src/hooks/useCommesseGenerali.ts` (`useImpostazioniCommesseGenerali`), `src/pages/azienda/settings/SettingsCommesseGenerali.tsx`
- Test: `src/test/ui/commesseGenerali.test.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess("commesse_generali")`, RPC `resolve_company_feature`.
- Produces: `disponibile: false` da `useImpostazioniCommesseGenerali` quando il flag è spento.

Serve D1. Il catalogo dei flag è chiuso in caso di dubbio: un flag non registrato risulta spento (vedi `20271101010000_simulatore_feature_flag.sql` per il modello).

- [ ] **Step 1:** Test: flag spento → in Impostazioni nessun interruttore e `modelli` vuoto. Expected: FAIL.
- [ ] **Step 2:** Migrazione: registrare `commesse_generali` in `platform_feature_flags` con `default_value` falso; override acceso per le 2 aziende che hanno già una riga in `company_commesse_generali_settings`, così nessuno perde niente. `commessa_generale_crea` rifiuta se il flag è spento, con codice `42501` e messaggio per l'utente.
- [ ] **Step 3:** Hook e pagina. Le generali già create restano leggibili a flag spento: si blocca solo la creazione. Test verde. Commit.

---

## Tappa 4 — Costi comuni e scenari

### Task 7: Quote manuali

**Files:**
- Create: `supabase/migrations/<versione>_generale_quote_manuali.sql`
- Modify: `src/lib/orders/generali/pianoConti.ts:461-540`, `src/hooks/useQuoteCostiComuni.ts`, `src/hooks/useCommesseGenerali.ts:326`, `src/components/orders/generali/ModificaGeneraleDialog.tsx`, `src/lib/orders/generali/unitaConti.ts`
- Test: `src/test/logic/generalePianoConti.test.ts`

**Interfaces:**
- Produces: `CriterioRipartizione` con `"manuale"`; `ripartisciCostiComuni(figlie, unita, totale, scelto, manuali?: ReadonlyMap<string, number>)`; RPC `generale_quote_manuali_salva(p_generale_id uuid, p_quote jsonb)`; tabella `generale_quote_manuali(generale_id, figlia_id, company_id, percentuale numeric(7,4))`.

- [ ] **Step 1: Test**

```ts
const figlie = [{ id: "a", nome: "A", importo: 100 }, { id: "b", nome: "B", importo: 100 }];
it("divide secondo le percentuali scritte, senza perdere centesimi", () => {
  const r = ripartisciCostiComuni(figlie, null, 1000.01, "manuale", new Map([["a", 70], ["b", 30]]));
  expect(r.criterio).toBe("manuale");
  expect(r.quote.reduce((t, q) => t + q.importo, 0)).toBeCloseTo(1000.01, 2);
});
it("una commessa senza quota: si torna all'automatico e il motivo lo dice", () => {
  const r = ripartisciCostiComuni(figlie, null, 1000, "manuale", new Map([["a", 100]]));
  expect(r.criterio).toBe("importo");
  expect(r.motivo).toMatch(/quota/);
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implementare; il resto dell'arrotondamento va sull'ultima quota. Aggiungere `manuale` al vincolo `criterio_ripartizione` e a `commessa_generale_criterio`.
- [ ] **Step 4:** Migrazione con RLS; la RPC rifiuta se la somma non fa 100 (tolleranza 0,01) con codice `22023`. Prova con `DO` annullato.
- [ ] **Step 5:** `ModificaGeneraleDialog`: scegliendo «Manuale» compare una riga per commessa e il totale in tempo reale; «Salva» spento finché non fa 100. Test UI. Commit.

### Task 8: Scenari salvati

**Files:**
- Create: `supabase/migrations/<versione>_generale_piano_scenari.sql`
- Modify: `src/hooks/useGeneralePiano.ts`, `src/components/orders/generali/piano/CassaIndicatori.tsx`, `piano/PianoEconomico.tsx:47`
- Test: `src/test/ui/generalePiano.test.tsx`

**Interfaces:**
- Consumes: `Scenario` `{ prezzoPct, ritardoMesi, costiPct }` da `pianoConti.ts`.
- Produces: tabella `generale_piano_scenari(id, generale_id, company_id, nome, prezzo_pct, ritardo_mesi, costi_pct)`; `useScenariPiano(generaleId)`, `useSalvaScenario(generaleId)`, `useEliminaScenario(generaleId)`.

Solo salvataggio: il calcolo c'è già. Uno scenario non tocca mai il piano approvato.

- [ ] **Step 1:** Test UI: «Prezzi −10%» salvato si riapre e rimette i tre valori; cambiarli non altera lo scenario salvato finché non si risalva. Expected: FAIL.
- [ ] **Step 2:** Migrazione, hook, menu «Scenari» accanto ai cursori, permesso `can_view_margins` in lettura e `can_edit_orders` in scrittura. Test verde. Commit.

---

## Tappa 5 — Modello personalizzato

### Task 9: Moduli accendibili per generale

**Files:**
- Create: `supabase/migrations/<versione>_generale_moduli_personalizzati.sql`
- Modify: `src/lib/orders/generali/moduli.ts`, `src/components/orders/generali/schede.tsx`, `src/lib/orders/commesseGenerali.ts`, `src/components/settings/CommesseGeneraliConfig.tsx`, `src/components/orders/generali/ModificaGeneraleDialog.tsx`, `supabase/functions/generali-avvisi/index.ts`
- Modify: i 20 file che controllano `modello === "…"` (elenco con `grep -rlE 'modello *(===|!==) *"' src`)
- Test: `src/test/logic/generaleModuli.test.ts`, `src/test/ui/commesseGenerali.test.tsx`

**Interfaces:**
- Produces: `moduliDellaGenerale(g: { modello: ModelloGenerale; moduli: ModuloGenerale[] | null }): readonly ModuloGenerale[]`; `RiepilogoGenerale.generale.moduli`; `nomeFiglie: { una: string; tante: string } | null`; `definizioneDi(g)` che sostituisce gli accessi diretti a `DEFINIZIONI_MODELLI[g.modello]`.

È il pezzo più rischioso: 28 controlli sul modello sparsi in 20 file diventano domande sul modulo. Si fa in due commit: prima la sostituzione a comportamento invariato, poi il modello nuovo.

- [ ] **Step 1: Test**

```ts
it("modello pronto senza scelte: i suoi moduli", () => {
  expect(moduliDellaGenerale({ modello: "appalto", moduli: null })).toEqual(["contratto", "piano", "documenti"]);
});
it("personalizzato: solo quelli scelti, nell'ordine standard", () => {
  expect(moduliDellaGenerale({ modello: "personalizzato", moduli: ["documenti", "contratto"] })).toEqual(["contratto", "documenti"]);
});
it("spegnere un modulo su un modello pronto vale come scelta", () => {
  expect(moduliDellaGenerale({ modello: "sviluppo", moduli: ["unita", "piano"] })).toEqual(["unita", "piano"]);
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Primo commit, nessun cambiamento visibile: `moduliDellaGenerale` e `definizioneDi`; sostituire i controlli `modello === "appalto"` con `moduli.includes("contratto")` e simili. Expected: tutta la suite delle generali verde senza toccare un test.
- [ ] **Step 4:** Migrazione: `commesse_generali.moduli_attivi text[]`, `nome_figlie_una`, `nome_figlie_tante`; aggiungere `personalizzato` al vincolo e a `commesse_generali_impostazioni_salva`. RPC `commessa_generale_moduli_salva(p_generale_id, p_moduli text[])`.
- [ ] **Step 5:** Test del Review Focus: con investitori spento la scheda sparisce, le righe restano nel database e gli oneri restano nel margine del piano; senza contratto nessun testo dice «inserisci il contratto», e `generali-avvisi` non calcola avvisi di contratto.
- [ ] **Step 6:** Interfaccia: un quarto interruttore in Impostazioni, «Moduli» in `ModificaGeneraleDialog` con la frase «spegnere nasconde, non cancella». Il cambio di `src/lib/orders/generali/` richiede di toccare anche `generali-avvisi/index.ts`, o la funzione non si ripubblica. Commit.

---

## Tappa 6 — Vita del contratto

Richiede la tappa 1 e D2. Le regole di legge (sospensioni, riserve, revisione prezzi, collaudo) vanno confermate con un consulente prima di scrivere testi o avvisi che le citano: questo piano fissa la struttura, non il diritto.

### Task 10: Sospensioni e riprese

**Files:**
- Create: `supabase/migrations/<versione>_generale_contratto_eventi.sql`
- Create: `src/lib/orders/generali/contrattoVita.ts`, `src/components/orders/generali/contratto/VitaContratto.tsx`
- Modify: `src/lib/orders/generali/contratto.ts` (`scadenzeContratto`), `src/hooks/useGeneraleContratto.ts`, `contratto/SchedaContratto.tsx`
- Test: `src/test/logic/generaleContrattoVita.test.ts`

**Interfaces:**
- Produces: tabella `generale_contratto_eventi(id, generale_id, company_id, tipo, dal, al, importo, stato, motivo, documento_id)`; `fineLavoriAggiornata(fine: string | null, sospensioni: { dal: string; al: string | null }[], oggi: string): string | null`.

- [ ] **Step 1: Test**

```ts
it("una sospensione chiusa allunga la fine dei suoi giorni", () => {
  expect(fineLavoriAggiornata("2027-01-10", [{ dal: "2026-11-01", al: "2026-11-11" }], "2026-12-01")).toBe("2027-01-20");
});
it("una sospensione aperta cresce ogni giorno e non vale come ritardo", () => {
  expect(fineLavoriAggiornata("2026-11-05", [{ dal: "2026-11-01", al: null }], "2026-11-10")).toBe("2026-11-14");
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Migrazione, funzione, scheda; `scadenzeContratto` e `generali-avvisi` usano la fine aggiornata e tacciono sui ritardi durante una sospensione. Commit.

### Task 11: Riserve, revisione prezzi, collaudo

**Files:**
- Modify: i file del Task 10; `src/lib/orders/generali/rendiconto.ts`; `src/components/orders/generali/rendiconto/DossierPDF.tsx`
- Test: `src/test/logic/generaleContrattoVita.test.ts`

**Interfaces:**
- Consumes: `generale_contratto_eventi` con `tipo` in `riserva | revisione_prezzi | collaudo`, e `stato` in `iscritta | accolta | respinta` per le riserve.
- Produces: `riserveTotali(eventi): { iscritte: number; accolte: number }`; `valoreContratto` somma solo le revisioni approvate.

- [ ] **Step 1:** Test: una riserva iscritta non cambia il valore del contratto e si vede a parte; accolta entra come ricavo; una revisione approvata aumenta il valore aggiornato; il collaudo con esito positivo fa comparire le ritenute da svincolare tra le scadenze. Expected: FAIL.
- [ ] **Step 2:** Implementare; le voci entrano nel dossier. Prove `DO` annullate. Commit.

---

## Tappa 7 — Post-vendita

### Task 12: Consegna, garanzie, segnalazioni per unità

**Files:**
- Create: `supabase/migrations/<versione>_unita_post_vendita.sql`
- Create: `src/lib/orders/generali/postVendita.ts`, `src/components/orders/generali/unita/PostVendita.tsx`
- Modify: `src/components/orders/generali/unita/UnitaDialog.tsx`, `unita/RiquadroUnita.tsx`, `src/lib/orders/generali/avvisi.ts`
- Test: `src/test/logic/generalePostVendita.test.ts`

**Interfaces:**
- Consumes: tabella `tickets` esistente, che ha già `order_id` (169 ticket su commessa in produzione): una segnalazione è un ticket sull'unità, nessuna tabella nuova.
- Produces: `unita_immobiliari.data_consegna date`; `scadenzeGaranzia(dataConsegna: string | null, regole: { etichetta: string; mesi: number }[]): { etichetta: string; scade: string }[]`; `costoPostVendita` dal consuntivo della figlia.

Durate delle garanzie: configurabili dall'azienda, con valori proposti da far confermare al consulente.

- [ ] **Step 1:** Test: senza consegna nessuna scadenza; con consegna una riga per regola; unità non rogitata senza scheda post-vendita. Expected: FAIL.
- [ ] **Step 2:** Migrazione, scheda «Post-vendita» in `UnitaDialog` con «Nuova segnalazione» che crea il ticket con `order_id` già valorizzato; avviso per garanzia in scadenza. I costi di un intervento restano sulla commessa dell'unità, quindi il margine dell'unità li vede da solo. Serve D3. Commit.

---

## Tappa 8 — Cassa aziendale

### Task 13: Le generali nella previsione di cassa

**Files:**
- Create: `src/lib/orders/generali/cassaAziendale.ts`
- Modify: `src/pages/azienda/CashFlowForecast.tsx`, `src/pages/azienda/Tesoreria.tsx`
- Test: `src/test/logic/generaleCassaAziendale.test.ts`

**Interfaces:**
- Consumes: `piano.cassa.stima: MeseCassa[]` da `useGeneralePianoNumeri`, viste `movimenti_cassa_native` e `cashflow_forecast_snapshots`.
- Produces: `sommaPrevisioneGenerali(cassaAziendale: MeseCassa[], piani: { generaleId: string; cassa: MeseCassa[] }[], mesePassatoFinoA: string): MeseCassa[]`.

- [ ] **Step 1: Test**

```ts
it("i mesi già passati vengono dalla cassa vera, non dal piano", () => {
  const r = sommaPrevisioneGenerali(cassa, [{ generaleId: "g", cassa: piano }], "2026-10");
  expect(r.find((m) => m.mese === "2026-10")?.uscite).toBe(cassa.find((m) => m.mese === "2026-10")?.uscite);
});
it("nei mesi futuri somma il piano una volta sola", () => {
  const r = sommaPrevisioneGenerali(cassa, [{ generaleId: "g", cassa: piano }], "2026-10");
  expect(r.find((m) => m.mese === "2026-12")?.uscite).toBe(1500);
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implementare. Prima di agganciare la pagina, leggere come `CashFlowForecast` calcola oggi i mesi futuri: se include già rate e scadenze delle figlie, il piano va sommato solo per le voci senza scadenza registrata, e il test va esteso a quel caso (Review Focus 5). Da telefono niente.
- [ ] **Step 4:** Filtro «per generale» in Tesoreria sui movimenti della generale e delle sue figlie. Commit.

---

## Tappa 9 — Affitti

### Task 14: Unità che restano e rendono

**Files:**
- Create: `supabase/migrations/<versione>_unita_locazioni.sql`
- Create: `src/lib/orders/generali/locazioni.ts`, `src/components/orders/generali/unita/Locazione.tsx`
- Modify: `unita/UnitaDialog.tsx`, `src/lib/orders/generali/pianoConti.ts`
- Test: `src/test/logic/generaleLocazioni.test.ts`

**Interfaces:**
- Produces: tabella `unita_locazioni(id, unita_id, company_id, conduttore_id, dal, al, canone_mensile, cauzione)`; `canoniDelPeriodo(l, dal: string, al: string): number`; `rendimentoLordoAnnuo(canoneAnnuo: number, costoUnita: number): number | null`.

Da costruire solo con D4 positiva: cambia il significato di «stato di vendita» e del rendimento degli investitori, e va deciso col cliente che lo chiede.

- [ ] **Step 1:** Test: canoni pro rata per mese parziale; contratto scaduto non conta; rendimento `null` a costo zero. Expected: FAIL.
- [ ] **Step 2:** Migrazione con `stato_vendita` esteso a `affittata`; i canoni entrano come ricavo del piano; il rendiconto investitori li mostra a parte. Commit.

---

## Cosa resta fuori di proposito

- **Portale per gli acquirenti:** progetto a sé, dopo D3.
- **Prototipo cliccabile (tappa P del piano originale):** superato, l'app vera è già provabile. Lo sostituisce la tappa 1.
- **Connessione del piano ai subappaltatori in cassa:** si rivede dopo la tappa 8, se serve.
