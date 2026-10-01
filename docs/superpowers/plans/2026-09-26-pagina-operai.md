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

## 6. Stato

- **Fase 0** — fatta e pubblicata il 26/09 (8965d5d3a): una scheda per operaio, presenze che seguono correzioni e cancellazioni, costo orario con i contributi.
- **Fase 1** — fatta il 26/09, migrazione `20280927101500_manodopera_permesso_operai` applicata e registrata; frontend in commit locale, **non pubblicato** (serve l'ok del founder).
  - Permesso «Operai» (`can_view_operai`/`can_edit_operai`), acceso a chi vedeva dipendenti o Personale (10 persone) e nel ruolo Ufficio; spento per il commercialista.
  - Le tabelle del Personale restano chiuse: l'ufficio legge gli operai con `manodopera_operai`, `manodopera_oggi`, `manodopera_operaio` e scrive con `manodopera_salva_operaio` (controllano il permesso, niente IBAN/PIN/contatti privati; stipendio solo a chi modifica).
  - Menu: «Manodopera e Mezzi» al posto di «Mezzi e attrezzature» e «Subappaltatori»; la voce c'è se almeno una scheda è aperta (`lib/manodopera/schede.ts`, stessa regola per menu e pagina). `/azienda/mezzi` e `/azienda/subappaltatori` rimandano alla scheda; i dettagli restano.
  - Scheda Operai: «Giornata» (chi è al lavoro, in pausa, uscito, assente, chi non ha timbrato, cantiere timbrato o previsto; giorni precedenti con le frecce; si aggiorna ogni minuto) ed «Elenco» (costo orario, documenti, mezzo, cantieri, app). Scheda operaio `/azienda/manodopera/operai/:id` con presenze di 31 giorni, costo, cantieri, documenti, mezzi, «Dagli l'app» (solo amministratori).
  - Personale: interruttore «Lavora in cantiere» nella scheda del profilo.
  - Da sapere: la Demo 2 ha timbrature fino al 25/09 ma giornate calcolate solo fino al 06/09; le ore si contano anche dalle timbrature, quindi la pagina è giusta lo stesso.
- **Squadre (anticipate dalla fase 4, 26/09)** — migrazioni `20280927140000_manodopera_squadre`, `…141500_manodopera_persone_responsabili`, `…150000_campo_squadra_oggi_con_le_squadre`, `…151500_manodopera_scheda_ordine_cantieri`, applicate e registrate; frontend in commit locale.
  - La squadra resta `external_teams` kind `interna`; nuovi: `responsabile_hr_profilo_id` (chiunque del Personale, della squadra o no), `squadre_componenti` (un operaio in una squadra per volta), `squadre_commesse` (dal–al, responsabile capocantiere sì/no), `order_campo_assignments.da_squadra_id`. `squadra_allinea_accessi()` dà e toglie l'accesso al cantiere a chi entra ed esce; quelli dati a mano non si toccano.
  - Operai → tre viste: Giornata divisa per squadra (con «a riposo» fuori dai giorni lavorativi e nei festivi), Squadre (crea, modifica, metti su una commessa, sciogli), Elenco con la squadra.
  - Commessa: riquadro «Squadre al lavoro» in Panoramica e in Cantiere (aggiungi, cambia date, togli).
  - App di cantiere: in «Chi c'è oggi» il capocantiere vede anche chi della squadra non ha l'app.
  - Chi fa lavoro d'ufficio non è più operaio (`mansione_da_ufficio`): tolti i due «Francesco Barbieri» delle demo.
  - Demo Azienda 2: 5 mezzi e 7 attrezzature con scadenze e tagliandi, 3 squadre (Posa Serramenti, Muratori con responsabile il Direttore Tecnico, Finiture e Impianti) su 4 commesse, mezzi sui cantieri.
  - Resta: le ore e i costi della squadra sulla commessa (righe `order_employees`) sono della fase 2; la demo genera le timbrature il venerdì per tutta la settimana, quindi la Giornata di oggi è vuota fino al venerdì.
- **Diario, calendario, km (26/09, sera)** — migrazioni `20280927160000_manodopera_diario_km_costo` e `…161500_manodopera_diario_ore`, applicate e registrate; frontend in commit locale.
  - Il costo della persona (stipendio, ore, contributi, costo orario) non si vede più in Manodopera: sta nel Personale, scheda del profilo, «Costo per le commesse» (`personale_costo` / `personale_salva_costo`, permesso Personale). I numeri si leggono all'italiana (`numero_italiano`: «3.100», «24,50»).
  - Giornata: calendario per saltare a un giorno qualsiasi, ricerca (persona, cantiere, mezzo, squadra, rapportino), i mezzi di ciascuno quel giorno (dallo storico) e il rapportino; a destra «Cosa è successo» (`manodopera_diario`: rapportini, giornale dei lavori, foto, mezzi spostati, guasti, officina, uscite non timbrate).
  - Scheda operaio: il mese in un calendario colorato (`manodopera_operaio_mese`), toccando un giorno: orari, cantiere, mezzi, rapportino, anomalie.
  - Km dei mezzi: strada sede→cantiere col servizio percorsi già in uso (HERE, ripiego OSRM), salvata in `orders.distanza_sede_km` (si azzera se cambia la posizione del cantiere); km = giorni lavorativi sul cantiere × andata e ritorno, solo per furgoni, autocarri e auto. In commessa («Mezzi sul cantiere») e nella scheda del mezzo, nuova scheda «Cantieri e km» con il grafico degli ultimi 90 giorni per cantiere e per persona.
  - Demo 2: giornale dei lavori 22–25/09 sui tre cantieri, 4 rapportini di Luca Ferrari, 2 guasti, storico di agosto dei mezzi.
  - Da sapere: se cambia la sede, le distanze già salvate restano quelle vecchie; i km sono una stima (i giorni lavorativi del periodo, non i viaggi veri).
- **Commessa: un blocco solo «Lavori e squadre» (26/09, sera)** — migrazione `20280927173000_manodopera_sposta_operaio_accessi_azienda`, applicata e registrata.
  - Il riquadro «Squadre al lavoro» non è più separato: le squadre stanno dentro «Lavori e squadre» (in cima tre azioni: Aggiungi squadra, Persona o ditta, Lavorazioni; una riga di riepilogo al posto dei riquadri a zero; poi Squadre, Lavorazioni e costi, Accesso all'app e ditte in subappalto). In Panoramica resta una riga con le squadre in «Organizzazione del cantiere».
  - Un operaio si sposta da una squadra all'altra trascinandolo o dal menu del suo nome («Sposta in…», «Togli dalla squadra»), con «Annulla» nell'avviso (`manodopera_sposta_operaio`).
  - Sicurezza: una squadra non dà più accessi ad account di un'altra azienda (`account_della_azienda`). La Demo 2 aveva 7 schede collegate agli account della Demo 1 (residuo della copia): staccate, tolti i 2 accessi nati così. Resta 1 caso nella Demo 1 da guardare; 6 schede `employees` fuori Demo 2 collegate altrove non toccate.
  - Pannello accessi all'app: date per esteso, nome di ripiego, frasi semplici.
- **Fasi, squadre sulle fasi, note per gli operai (26/09, sera)** — migrazione `20280927184500_lavori_squadre_fasi_note` (la 180000 era già presa da un altro lavoro), applicata e registrata.
  - «Lavori e squadre» parte dalle FASI: in cima «Fasi di lavoro», «Squadra», «Persona o ditta»; riepilogo «10 fasi · 3 squadre · 8 operai · 4 note»; commessa vuota = guida in tre passi (fasi → chi le fa → istruzioni). Filtri e ricerca solo oltre 6 fasi.
  - Ogni fase: in testa date e «chi la fa» (squadre colorate, persone, ditte) e quante note; dentro Quando, Chi la fa (+ Squadra, + Persona o ditta), Note per gli operai, materiali. Stato e menu (Rinomina, Elimina) a destra. «Ditta esterna» al posto di «squadra esterna».
  - Squadra su una fase: `squadre_commesse.phase_id` + `segue_fase` (le date seguono la fase via trigger); un accesso all'app per persona e commessa, dalla prima all'ultima data. Una squadra su una fase conta come «chi la fa» (non chiede più di organizzarla).
  - Note: `note_cantiere` (commessa o fase; per tutti, una squadra, una persona; importante) + `note_cantiere_letture`. Ufficio: `note_cantiere_elenco/salva/elimina`, «letta da N su M» con i nomi. App: «Istruzioni dall'ufficio» in cima alla pagina del lavoro (`campo_note_cantiere`, `campo_nota_letta`), avviso sul telefono per le note nuove.
  - Demo 2, ORD-2026-030: 10 fasi con date e squadre, 4 note.

