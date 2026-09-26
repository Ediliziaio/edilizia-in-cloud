# Manodopera (Operai · Subappaltatori · Mezzi) — piano di sviluppo (26/09/2026)

Pagina per il founder: https://claude.ai/artifact/8cTgkftnXfznBbtkAFTzys

Richiesta del founder: accanto a «Subappaltatori» serve una pagina **Operai** nella sidebar, per gestire dall'ufficio gli operai (che sono già nel Personale): vedere le presenze, associarli ai cantieri, creare le squadre. Si lavora fra commesse, operai, mezzi. **Prima il piano e le decisioni, poi l'implementazione.**

## 1. Stato di partenza (verificato sul codice e sul database live)

**Nessun cliente vero usa ancora gli operai**: `hr_profili` 52 righe (49 nelle due demo, 2 Ke Bei, 1 Suntech), `employees` 46 (tutte demo), `hr_timbrature` 3.039 (quasi tutte Demo Azienda 2), `order_campo_assignments` 7, `external_teams` 8 (tutte `esterna`). È il momento giusto per sistemare il modello: niente dati di clienti da migrare.

**Una persona, tre identità** (nessuna procedura le crea tutte e tre):
- `hr_profili` — scheda del Personale: timbrature, presenze (`hr_giornate`), ferie/richieste, documenti e scadenze (`hr_documenti`), mezzi (`mezzi.assegnato_hr_profilo_id`). Collegamenti: `user_id`, `employee_id` (nessun vincolo di unicità).
- `employees` — anagrafica di costo: `costo_orario`/lordo/INPS, `order_employees` (costi manodopera per fase), cedolini, `role_type`, `area` (cantiere|commerciale|amministrazione|tecnico), `user_id`.
- login (`profiles` + `user_roles` `employee`/`company_staff`) — accesso a /campo, `order_campo_assignments.user_id` (capocantiere).
- Tre vie di creazione, tutte parziali: Impostazioni → Persone → Dipendenti (`Employees.tsx`, solo `employees`), Utenti (`create-company-staff`, login + `employees`), Personale → Profili (solo `hr_profili`, e poi non si collega più: `useUpdateHrProfilo` scarta `user_id`/`employee_id`). Effetto visibile: «timbrature senza profilo HR».

**Pezzi già esistenti da riusare o superare**
- Vecchia «Gestione Staff» `src/pages/azienda/Employees.tsx` (dentro Impostazioni → Persone): tab Operai, Squadre (secondo editor di `external_teams` senza `kind`), Staff interno, Rapportini (`work_logs`, tabella che nessuno scrive).
- Personale (`/azienda/personale`): Regia HR (`useLiveStatus`: chi è presente, **non dove**), Timbrature (`useTimbratureAdmin`, limite 200 righe), Presenze (`hr_giornate` del mese), Documenti, Cedolini. Le policy fanno vedere tutta l'azienda solo a company_admin/super_admin.
- Squadre: `external_teams` (`kind` interna/esterna, `leader_user_id` mai letto, calendario Google) gestite in Impostazioni → Calendari lavori → Squadre. **Nessuna tabella dei membri in produzione.**
- **Lavoro locale di un'altra sessione, mai installato** (commit 864787b01, 25/09): composizione squadre interne con versioni (O1a, `internal_team_roster_*` su `employees.id`), turni giornalieri con sovrapposizioni (O1b, `internal_team_shift_versions`), agenda turni in /campo (O1c). SQL in `supabase/proposals/`, attivo solo con backend locale + `VITE_INTERNAL_TEAM_ROSTERS_LOCAL`. Documenti: `docs/internal-team-rosters-local.md`, `internal-team-shifts-local.md`, `campo-crew-agenda-local.md`.
- Assegnazione ai cantieri: tre punti che non si parlano — `OrderLaborCosts` (campo → costi), `useOrderWorkPhases` (costi → campo, rifiuta squadre interne), `EditOrderDatesDialog` (solo costi, accetta squadre interne). `order_campo_assignments` (accesso/capocantiere) e `order_employees` (costi) allineate a mano, non atomicamente. `campo_squadra_oggi` legge solo la prima.
- Presenze per cantiere: `campo_squadra_oggi(p_order_id)` esiste ma la usa solo /campo. In /azienda non c'è «chi è in quale cantiere oggi».
- Modello per la pagina: `SubappaltatoriPage.tsx` (KPI `OperationalKpiCard`, filtri, tabella/card mobile, azioni in blocco) e `SubappaltatoreDetail.tsx` (schede, blocco «App cantiere collegata»). Modello per menu+permessi+modulo: commit `e6649ca7b` (Mezzi).

**Difetti da correggere per strada**
- Costo orario: `Employees.tsx:109-131` salva lordo/ore **senza INPS** e marca la tariffa come manuale → la formula giusta `costo_orario_dipendente()` non scatta mai.
- `hr_giornate` e la copia campo→HR si aggiornano solo sugli INSERT: le correzioni dell'ufficio non arrivano alle presenze.
- Timbratura web senza `order_id`; tre raggi geografici diversi (cantieri_geofence, 200 m, 500 m).

## 2. Flusso logico (dal punto di vista dell'ufficio)

```
Operaio (una scheda)  →  Squadra (chi lavora con chi, capo squadra)
        ↓                         ↓
   Documenti/idoneità       Pianificazione: chi va in quale cantiere, quali giorni
   Mezzo in carico                ↓
                           Giornata: chi è arrivato, dove, chi manca (timbrature)
                                  ↓
                  Consuntivo: rapportino approvato → ore e costo sulla commessa
                              presenze del mese → paghe (consulente del lavoro)
```

Regole: si assegna una **squadra o un operaio** a una **commessa** per **giorni**; l'assegnazione dà in un colpo solo il cantiere nell'app di cantiere e la riga di costo sulla commessa. Documenti scaduti, ferie o doppio cantiere **avvisano, non bloccano** (stessa scelta fatta per la disponibilità squadre, 08/09).

## 3. Struttura (aggiornata col founder il 26/09)

**Una voce «Manodopera»** in Cantieri & Lavori (`/azienda/manodopera`, tab via `?tab=`) al posto di «Mezzi e attrezzature» e «Subappaltatori». Tab: **Operai** (nuova; sotto-viste Oggi · Elenco · Squadre · Pianificazione · Presenze), **Subappaltatori** (`SubappaltatoriPage` spostata), **Mezzi e attrezzature** (pagina Mezzi spostata). Ogni tab ha il suo permesso (`can_view_operai` nuovo, `can_view_subappaltatori`, `can_view_mezzi`); la voce si vede se almeno uno è vero. `/azienda/subappaltatori`, `/azienda/mezzi` redirect alla tab; le schede di dettaglio (`/:id`) restano. Attenzione alla chiave di piano diversa fra menu (`subappaltatori`) e rotta (`cantieri_avanzati`) di Subappaltatori.

**Commessa → «Chi lavora qui»** (priorità 1 del founder): riquadro unico nella scheda Cantiere di `OrderDetail` con Operai, Squadre, Ditte, Mezzi. Un solo «Aggiungi» → tipo → chi, date, lavorazione (fase). Una RPC per tipo, atomica:
- Operaio: `order_campo_assignments` (accesso, capocantiere, date) + `order_employees` (riga costo preventivo, fase) insieme; sostituisce i tre percorsi `OrderLaborCosts` / `useOrderWorkPhases` / `EditOrderDatesDialog`.
- Squadra interna: la stessa cosa per ogni componente (composizione O1a).
- Ditta: collegamento ditta↔commessa con lavorazione, date, importo (oggi sparso fra `subappaltatori_sicurezza.order_id` — una sola commessa —, `contratti_subappalto`, `order_external_teams` con `subappaltatore_id`, `order_campo_assignments` role subcontractor); controllo DURC/documenti; legame contratto/SAL.
- Mezzo: `mezzi.assegnato_order_id` + persona + periodo (storico già da trigger).
- Avvisi, non blocchi: documenti scaduti, DURC, ferie/assenze, doppio cantiere.
- `loadCampoAssignments`, la copia in `CampoHome` e `campo_squadra_oggi` leggono la stessa fonte.

**App subappaltatore** (priorità 2): cantieri con date/lavorazione/referente e scadenza automatica; documenti: **oggi `SubDocumenti` scrive in `documenti_dipendenti` (0 righe) mentre la scheda ufficio legge `documenti_subappaltatore` (0) e `subappaltatori_documenti` (58)** → unificare, avviso all'ufficio e alla ditta prima della scadenza; elenco dei suoi uomini con tesserino (facoltativo); stato SAL (`sal_subappaltatori`) in sola lettura. App operaio: giorni/cantieri previsti, squadra, mezzo.

## 4. Fasi (ordine deciso col founder: commesse, poi app subappaltatore)

| Fase | Cosa |
|---|---|
| 0 Fondamenta | «Lavora in cantiere»; creazione unica operaio (`hr_profili`+`employees`+accesso facoltativo) e collegamento degli esistenti; `useUpdateHrProfilo` non scarta i collegamenti; costo orario con INPS; documenti ditta in un posto solo; ditta su più commesse; presenze ricalcolate anche su UPDATE/DELETE |
| 1 Voce Manodopera | Menu, 3 tab, redirect, permesso `can_view_operai`/`can_edit_operai` (modello commit e6649ca7b), tab Operai: Elenco, scheda, Oggi |
| 2 «Chi lavora qui» | Riquadro unico in commessa + RPC atomiche + avvisi |
| 3 App subappaltatore | Cantieri con date, documenti unificati, suoi uomini, SAL |
| 4 Squadre interne | Composizione (O1a dopo revisione sullo schema vero) + aggiungi squadra in commessa |
| 5 Pianificazione e presenze | Settimana per giorno, turni (O1b), agenda app (O1c), presenze del mese per le paghe |

## 5. Decisioni chieste al founder

1. Nome «Manodopera» anche se contiene i mezzi (proposta: sì).
2. Chi è operaio: interruttore «Lavora in cantiere» (proposta).
3. Assegnazione dal–al, giorni spostabili in pianificazione (proposta).
4. Documenti scaduti/DURC: avvisare, non bloccare (proposta).
5. La ditta dichiara nell'app i suoi uomini con tesserino, facoltativo (proposta).
6. Personale = HR, Manodopera = cantieri; «Gestione Staff» in Impostazioni sparisce (proposta).
