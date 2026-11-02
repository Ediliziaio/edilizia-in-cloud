# Calcolo del cantiere con Silvio: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** data una commessa e una data di fine, dire quante ore e quanti operai servono per fase, chi è libero, quali ditte e mezzi usare e quale margine resta, con la fonte di ogni numero.

**Architecture:** il calcolo è codice, non AI: funzioni pure in `shared/piano-cantiere/`, usate da app e Silvio. L'AI spiega il risultato e non produce numeri. Le assegnazioni passano dalle conferme che già esistono.

**Tech Stack:** TypeScript puro (compatibile Deno), RPC Postgres, React con React Query, Vitest.

**Spec:** la richiesta del founder del 2/11/2026 e la prova su Demo 2 (`memory/eic-silvio-predittivo-stato`), riportate nelle sezioni qui sotto.

## Punto di partenza verificato (2/11/2026)

| Cosa | Stato |
|---|---|
| `src/lib/preventivi/stimaTempi.ts` | **Esiste già**: ore, giorni e `operaiPerTarget` dal computo. Usato nei preventivatori, Silvio non lo chiama |
| `ore_previste`, `costo_manodopera` nelle voci `*_computo_voci` | Ci sono le colonne. `ore_previste` sulle 763 voci ristrutturazione: 0 compilate |
| `prezzario_voce.incidenza_manodopera_pct` | 200.495 voci su 364.011 hanno la percentuale |
| `tariffe_aziendali.incidenza_manodopera_pct` | 0 su 1.309, comprese le 561 di Bonarrigo: va ricavata |
| `order_work_phase_voci` | Solo 186 righe, 1 azienda reale. N047 ha 6 fasi e 0 voci: **le voci vanno prese dal preventivo o computo** |
| Ore vere per fase da `campo_rapportini.fasi_lavorate` | Demo 2: 946 fasi, 30.672 ore. Aziende reali con rapportini: 3 al massimo |
| `employees.costo_orario` | 89 su 202: serve un valore predefinito dichiarato |
| Disponibilità persone e mezzi | `shared/silvio-commessa/risorse.ts` e il nuovo `silvio_employees_workload` |

## Global Constraints

- Mai `git push` su main né `supabase db push` senza ok esplicito del founder. Migrazioni applicate a mano, una alla volta.
- Ogni numero porta la sua fonte: `scritte`, `storico`, `costo_voce`, `prezzario`, `manca`. Una voce senza dato non vale zero: si conta e si mostra.
- Sullo schermo niente termini tecnici; ogni ipotesi (costo orario, ore al giorno, resa) è visibile e modificabile.
- Ogni azienda può correggere le proprie rese; il predefinito resta «come oggi» (regola «il software si cuce sull'azienda»).
- Silvio non scrive senza conferma. Il calcolo non assegna nessuno.
- Mac da 8 GB: niente build o typecheck pieni in parallelo; `tsconfig.verifica.json` sui file toccati.

## Review Focus

- Commessa senza preventivo né computo: dire cosa manca e come aggiungerlo, senza dare 0 ore.
- Data di fine già passata o più vicina della durata minima: dire che non basta, non restituire 40 operai senza avviso.
- Voci a corpo o sola fornitura: non generano ore finte e restano contate come «senza manodopera».
- Più persone richieste che libere: mostrare quante mancano e proporre ditta o spostamento data.
- Costi parziali: il margine è «almeno/al massimo» o «non calcolabile», mai una cifra singola che sembra certa.

---

### Task 1: Le voci della commessa

**Files:** Create `shared/piano-cantiere/vociCommessa.ts`, migrazione `piano_cantiere_dati`; Test `src/test/logic/pianoCantiereVoci.test.ts`

**Interfaces:**
- Produces: `piano_cantiere_dati(p_order_id uuid) returns jsonb` con commessa, fasi, voci, costi registrati, ditte; `vociDellaCommessa(dati): VoceCantiere[]`, con `VoceCantiere = { fase: string | null; capitolo: string; descrizione: string; quantita: number; unita: string | null; importo: number | null; costo_manodopera: number | null; costo_materiali: number | null; ore_previste: number | null; incidenza_pct: number | null; origine: "fase" | "computo" | "preventivo" }`

- [ ] Test: voci di fase vincono sul computo; senza voci di fase si usano computo e righe del preventivo; niente doppioni; commessa vuota → `[]`.
- [ ] Mappare il percorso da `orders.quote_id` alle otto tabelle `*_computo_voci`, a `generale_computo` e alle righe del preventivo. Provarlo su N047, che oggi ha `quote_id` e 0 voci di fase.
- [ ] RPC con `assert_company_access`, provata in transazione annullata. Commit.

### Task 2: Ore, operai e durata per fase

**Files:** Create `shared/piano-cantiere/calcolo.ts`; Modify `src/lib/preventivi/stimaTempi.ts` (solo per riusarne le formule); Test `src/test/logic/pianoCantiereCalcolo.test.ts`

**Interfaces:**
- Consumes: `VoceCantiere`; `spostaGiorniLavorativi` e `CalendarioCantiere` da `shared/silvio-commessa/`
- Produces: `calcolaPiano(voci, fasi, ipotesi, { dal, al }): PianoCantiere`, con `ipotesi = { costoOrario, oreGiorno, resaPct, rese }` e per ogni fase `{ nome, ore, fonte, giorniDisponibili, operaiNecessari, vociSenzaDato }`, più `{ fattibile, durataMinimaGiorni, avvisi }`

- [ ] Test con numeri fissi: 1.000 € manodopera a 27 €/h = 37 ore; incidenza 40% su 1.000 € a 27 €/h = 14,8 ore; `ore_previste` vince sempre; fase da 200 ore in 10 giorni a 8 ore e resa 85% = 3 operai.
- [ ] Test sui casi di Review Focus: data passata, voci a corpo, nessuna voce.
- [ ] Ordine delle fonti: `ore_previste` → resa storica dell'azienda (Task 7) → `costo_manodopera` → incidenza. Commit.

### Task 3: Incidenza dove manca

**Files:** Create `shared/piano-cantiere/incidenza.ts`; Test `src/test/logic/pianoCantiereIncidenza.test.ts`

**Interfaces:** Produces `incidenzaPerVoce(voce, prezzario): { pct: number; fonte: "codice" | "simile" } | null`

- [ ] Test: stesso codice di tariffa → percentuale esatta; nessun accostamento sicuro → `null`, mai un valore medio silenzioso.
- [ ] Prova sulle 561 voci di Bonarrigo, in sola lettura: contare quante si agganciano al prezzario. Sotto il 60% fermarsi e riportare al founder prima di proseguire. Commit.

### Task 4: Margine previsto

**Files:** Create `shared/piano-cantiere/margine.ts`; Test `src/test/logic/pianoCantiereMargine.test.ts`

**Interfaces:** Produces `marginePrevisto(piano, dati): { ricavi; costi: { manodopera; materiali; ditte; mezzi; giaRegistrati }; margine: number | null; completo: boolean; mancano: string[] }`

- [ ] Test: i costi già registrati non si contano due volte con quelli previsti; una ditta senza costo → `completo: false` e `mancano` la nomina.
- [ ] Confrontare i casi con `silvioVerifiedEconomics.ts`: stessi ricavi e stessi costi consuntivi. Commit.

### Task 5: Chi e con che cosa

**Files:** Modify `shared/silvio-commessa/risorse.ts`; Create `shared/piano-cantiere/risorse.ts`; Test `src/test/logic/pianoCantiereRisorse.test.ts`

**Interfaces:**
- Consumes: `proposteRisorse`, `personaOccupata`, `mezzoOccupato`
- Produces: `risorsePerPiano(piano, contesto): { persone; ditte; mezzi; mancano: { fase: string; persone: number }[] }`; `PERSONE_PER_FASE` diventa un parametro, predefinito 2

- [ ] Test: 3 operai necessari e 2 liberi → propone 2 e dichiara che ne manca 1; ferie e commesse sovrapposte sono rispettate; nessuno in due cantieri lo stesso giorno.
- [ ] Mezzi: da lavori simili fatti dall'azienda; senza storico solo una tabella lavorazione → categoria, modificabile, e i nomi veri fra quelli liberi. Commit.

### Task 6: Silvio lo usa

**Files:** Modify `supabase/functions/_shared/silvioTools.ts`, `_shared/silvioSiteHealth.ts`, `supabase/functions/computo-cronoprogramma/index.ts`; Test `src/test/logic/silvioCalcolaPiano.test.ts`

**Interfaces:** Produces lo strumento `calcola_piano_cantiere({ commessa_codice, data_fine?, costo_orario?, ore_giorno? })`, rischio `safe`, sola lettura, permessi come `quadro_commessa`

- [ ] Test del registro: ruoli e canali; il risultato riporta fonti e avvisi. Regola: i numeri su operai e margine vengono da qui.
- [ ] Cronoprogramma: passare le ore del calcolo; scartare le fasi non presenti nel computo (salvo allestimento, attese e pulizia) e rispettare il numero di squadre.
- [ ] Prova vera su Demo 2 con le domande del 2/11, confrontate col database. Commit.

### Task 7: Schermata in commessa e correzioni

**Files:** Create `src/components/orders/PianoCantiereDialog.tsx`; Modify `src/components/orders/SilvioCommessa.tsx`; migrazione `rese_azienda`; Test `src/test/ui/pianoCantiereDialog.test.tsx`

**Interfaces:** Produces la voce di menu «Calcola come finire» e la tabella `rese_azienda(company_id, chiave_lavorazione, ore_per_unita, unita, fonte, aggiornata_da)` con policy per azienda

- [ ] Test UI: data di fine, ipotesi modificabili, fasi con ore e operai, fonte a parole, margine, pulsante «Assegna» che passa dalla conferma esistente.
- [ ] Correggere una resa la salva per l'azienda e ricalcola. Telefono: solo ciò che serve (regola «meno è meglio»).
- [ ] Prova nel browser su Demo 2, prima di dire che funziona. Commit.

### Task 8: Impara dai rapportini e prevede i ritardi

**Files:** Create `shared/piano-cantiere/storico.ts`, `shared/piano-cantiere/previsione.ts`; Test `src/test/logic/pianoCantierePrevisione.test.ts`

**Interfaces:** Produces `reseDalloStorico(fasiChiuse): Map<string, { oreVsStima: number; campioni: number }>`, attiva da 5 fasi chiuse simili; `prevediFine(fasi, rapportini, oggi): { dataPrevista: string | null; ritardoGiorni: number | null; affidabile: boolean; perche: string }`

- [ ] Test: fase al 50% con il 75% del tempo consumato → data spostata in proporzione; senza rapportini recenti → `affidabile: false`, nessuna data.
- [ ] Strumento Silvio `prevedi_fine_cantiere`, che distingue ritardo di oggi e previsione. Prova su Demo 2, poi su una fase chiusa di cui si conosce la fine vera. Commit.

## Ordine di pubblicazione

1. Correzioni del punto 1 (ramo `fix/silvio-carico-operai`).
2. Task 1–6, solo su Demo 2: Silvio risponde con il calcolo.
3. Task 7: schermata, dietro interruttore per azienda.
4. Task 8, poi una prima azienda vera scelta dal founder.

## Decisioni del founder

1. **Dove manca il dato:** usare il prezzario regionale come partenza, dichiarandolo (consigliato), oppure far scrivere le rese all'azienda prima di calcolare.
2. **Costo orario predefinito** per le 113 schede su 202 che non l'hanno: il valore del simulatore costo orario, modificabile, oppure bloccare il calcolo finché non c'è.
3. **Prima azienda vera** dopo Demo 2. Bonarrigo ha i computi ma 0 commesse, per sua indicazione.
