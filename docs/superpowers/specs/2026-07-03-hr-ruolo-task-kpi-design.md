# Personale — Ruolo, Task e KPI per persona (Mansionario)

Data: 2026-07-03
Modulo: `/azienda/personale` (HR)
Stato: design approvato — pronto per il piano d'implementazione

## Obiettivo

Trasformare la scheda di ogni dipendente da anagrafica statica a **scheda operativa**:
per ogni persona un **mansionario** (responsabilità), i **task assegnati** e i **KPI** con
target e andamento. Riutilizzo garantito da un **catalogo di mansioni** (ruoli edili
standard) da cui la persona eredita responsabilità e KPI suggeriti.

Scelte confermate col committente:
- Profondità: **MVP + catalogo mansioni riutilizzabile** (no performance-management completo, no portale dipendente per ora — solo lato gestione).
- KPI: **manuali + qualche auto-calcolato** (3 KPI derivati dai dati esistenti).
- Collocazione UI: **nuovo tab dentro la scheda persona** (`HrProfiloSheet`), non una pagina dedicata.
- Catalogo mansioni: gestito in **Impostazioni → HR**.

## Stato attuale (codice reale)

- `PersonalePage.tsx`: 12 tab lazy (regia, organigramma, profili, timbrature, presenze, richieste, sedi, festività, profili, cedolini, gps-percorsi, documenti, selezioni).
- Scheda persona = `src/components/hr/HrProfiloSheet.tsx`, tab: **Anagrafica** (dove `mansione` è testo libero, + `reparto`, `responsabile_id`), **Documenti & Scadenze**, **Assenze**, sezione **Contratto**.
- `TabOrganigramma.tsx`: gerarchia via `responsabile_id`, mostra `mansione` testuale.
- `TabProfili.tsx`: lista/griglia con ricerca + KPI aggregati (totali/attivi/cessati).
- DB HR esistente: `hr_profili`, `hr_assenze(_eventi)`, `hr_cedolini`, `hr_documenti`, `hr_festivita`, `hr_giornate`, `hr_onboarding_steps`, `hr_richieste`, `hr_sedi`, `hr_timbrature`, `hr_talent_*`. **Nessuna** tabella per ruoli/task/KPI → terreno vergine.

## Modello dati (nuove tabelle, tutte `company_id`-scoped con RLS come le altre `hr_*`)

### `hr_mansioni` — catalogo ruoli riutilizzabili
`id uuid pk`, `company_id uuid not null`, `nome text not null`, `area text` (es. Cantiere/Ufficio tecnico/Amministrazione), `descrizione text`, `responsabilita jsonb default '[]'` (array di stringhe), `kpi_suggeriti jsonb default '[]'` (array di `{nome, unita, target, direzione, periodo}`), `attivo bool default true`, `created_at`, `updated_at`. `unique(company_id, nome)`.

### `hr_profili` — aggiunte
- `mansione_id uuid null references hr_mansioni(id) on delete set null` — fonte "vera" quando valorizzata.
- `responsabilita jsonb default '[]'` — voci extra/override specifiche della persona.
- Il campo testuale **`mansione` resta** come etichetta denormalizzata (organigramma e liste già lo usano); al salvataggio, se `mansione_id` è settata, `mansione` viene sincronizzata col nome della mansione.

### `hr_task` — task/obiettivi per persona
`id`, `company_id`, `profilo_id uuid not null references hr_profili on delete cascade`, `titolo text not null`, `descrizione text`, `priorita text default 'media' check in ('bassa','media','alta')`, `scadenza date`, `stato text default 'da_fare' check in ('da_fare','in_corso','fatto','annullato')`, `order_id uuid null references orders(id) on delete set null` (link opzionale a commessa), `created_by uuid`, `completed_at timestamptz`, `created_at`, `updated_at`. Distinto dai task-commessa (`order_task_template`): questi sono person-scoped.

### `hr_kpi` — definizione KPI per persona
`id`, `company_id`, `profilo_id uuid not null references hr_profili on delete cascade`, `nome text not null`, `unita text default 'num' check in ('num','%','ore','€')`, `target numeric`, `direzione text default 'su' check in ('su','giu')` (su = più alto è meglio), `periodo text default 'mensile' check in ('mensile','trimestrale','annuale')`, `tipo text default 'manuale' check in ('manuale','auto')`, `auto_metric text null check in ('presenza_pct','ore_mese','task_completati')`, `origine_mansione_id uuid null`, `attivo bool default true`, `created_at`, `updated_at`.

### `hr_kpi_valori` — storico valori (solo KPI manuali)
`id`, `kpi_id uuid not null references hr_kpi on delete cascade`, `periodo_label text not null` (es. `'2026-07'`), `valore numeric not null`, `note text`, `created_at`. `unique(kpi_id, periodo_label)`. I KPI `auto` non si storicizzano qui: si calcolano al volo.

### Funzione auto-KPI
`hr_persona_kpi_auto(p_profilo_id uuid, p_periodo text)` → `jsonb` con:
- `presenza_pct` — % presenza nel periodo (da `hr_giornate`/`hr_timbrature`).
- `ore_mese` — ore lavorate nel periodo (da `hr_timbrature`).
- `task_completati` / `task_totali` — dai `hr_task` con scadenza nel periodo.
`SECURITY DEFINER`, company-scoped.

## UI

### Nuovo tab "Ruolo & Obiettivi" in `HrProfiloSheet`
Abilitato solo su profilo esistente (come Documenti/Assenze). Tre blocchi (componenti isolati sotto `src/components/hr/`):
- **`HrMansioneBlock`** — select `mansione_id` dal catalogo; mostra responsabilità ereditate (read-only) + editor delle voci extra della persona (`hr_profili.responsabilita`).
- **`HrTaskBlock`** — lista task della persona con aggiunta/modifica inline (titolo, scadenza, priorità, stato), filtro per stato, link opzionale a commessa.
- **`HrKpiBlock`** — una card per KPI: valore vs target + mini-trend (sparkline/gauge), badge "auto" sui calcolati; sui manuali un campo "aggiorna valore" per periodo. Quando si assegna una mansione, i `kpi_suggeriti` possono essere creati come KPI reali per la persona (con un click "Applica KPI del ruolo").

### Catalogo mansioni — Impostazioni → HR
`HrMansioniCatalog`: CRUD del catalogo (nome, area, descrizione, responsabilità, KPI suggeriti). Seed iniziale con ~10 ruoli edili (Capocantiere, Muratore, Geometra, Impiegato tecnico, Responsabile acquisti, Amministrativo, Preventivista, Posatore, Elettricista, Idraulico) con responsabilità e KPI suggeriti sensati.

### Ritorno visibile (Fase 2)
- **Organigramma**: ogni nodo mostra la mansione dal catalogo + semaforo (task aperti / KPI sotto target).
- **TabProfili**: badge "N task aperti" e "KPI ⚠️" sulle card.

## Fasi

- **Fase 1**: migration (tabelle + seed catalogo + RPC auto-KPI + RLS) → tab "Ruolo & Obiettivi" (mansione+responsabilità, task, KPI funzionanti) → CRUD minimo catalogo in Impostazioni HR.
- **Fase 2**: badge/semafori in Organigramma e Profili.

## Vincoli / non-obiettivi

- Nessun cambiamento al comportamento esistente: solo aggiunte (nuove tabelle, colonne additive, nuovo tab).
- No portale dipendente / self-service in questa iterazione.
- Migrazioni additive (basso rischio) sul progetto Supabase `rsbrguhkodgnqfomrevo`.
- Push su `main` solo dopo ok esplicito del committente (policy repo).
