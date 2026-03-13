

## AUT-UNIF-02 — Analisi Critica

### Problema di Prerequisito

Il prompt AUT-UNIF-02 presuppone che la tabella `automation_rules` esista (creata in AUT-UNIF-01). In AUT-UNIF-01 abbiamo scelto l'approccio **UI-only** — nessuna tabella unificata è stata creata. Le automazioni vivono ancora in 3 tabelle separate:

| Tabella esistente | Tipo |
|---|---|
| `internal_automation_flows` + nodes + connections | Flow builder visuale (operative) |
| `task_automation_rules` | Regole task semplici |
| `automation_flows` + nodes + connections | Flow builder marketing |

Il prompt AUT-UNIF-02 vuole **sostituire** tutto con un unico sistema basato su `automation_rules` — card-based, con template gallery e form drawer. Questo è un **cambiamento architetturale significativo** che:

- **Rimuoverebbe** i flow builder visuali (canvas con nodi e connessioni SVG) sostituendoli con card + form
- **Creerebbe** una nuova tabella `automation_rules` con schema diverso dalle tabelle esistenti
- **Richiederebbe** migrazione dati da `task_automation_rules` (fattibile) ma non dai flow builder (incompatibili — i flow builder hanno nodi/connessioni, non regole singole)

### Due Approcci Possibili

**Approccio A — Implementare AUT-UNIF-02 come layer aggiuntivo**
- Creare `automation_rules` + `automation_log` come **nuova** funzionalità "Regole rapide"
- Mantenere i flow builder esistenti nelle tab "Operative" e "Marketing"
- Aggiungere una 4a tab "Regole" o integrare le card nella tab "Task" (che già usa regole semplici)
- I template diventano un modo per creare `task_automation_rules` o nuove `automation_rules`
- **Pro**: nessuna regressione, aggiunge valore. **Contro**: due sistemi coesistono.

**Approccio B — Implementare AUT-UNIF-02 come descritto, sostituendo tutto**
- Creare `automation_rules` e migrare `task_automation_rules`
- Rimuovere i flow builder (o mantenerli solo come "avanzato")
- Sostituire la pagina attuale con la nuova UI card-based
- **Pro**: UI unificata. **Contro**: rischio alto, perde funzionalità flow builder.

### Piano Raccomandato — Approccio A (Additivo)

Creare il sistema `automation_rules` come **nuovo layer** dentro la pagina unificata esistente, senza rimuovere i flow builder.

#### STEP 1 — Database
- Creare tabella `automation_rules` (schema dal prompt, adattato)
- Creare tabella `automation_log`
- Creare RPC `get_automation_counts` e `get_automation_log_recent`
- Seed con i 20+ template (`is_template = true`)
- RLS con policies company-scoped

#### STEP 2 — Hook `useAutomazioni.ts`
- CRUD su `automation_rules` (come nel prompt)
- Funzione `useAttivaTemplate` per clonare template

#### STEP 3 — Nuova tab "Regole" nella pagina AutomazioniUnified
- Aggiungere 4a tab alla pagina esistente: **Operative | Task | Marketing | Regole**
- La tab "Regole" contiene: header KPI, filtro per categoria, lista card, toggle template gallery
- Riutilizza i componenti del prompt: `AutomazioniHeader`, `AutomazioniList`, `AutomazioneCard`, `AutomazioniTemplateGallery`, `AutomazioneFormDrawer`, `AutomazioniEmptyState`

#### STEP 4 — Componenti UI (6 file)
- `AutomazioniHeader.tsx` — KPI pillole (attive, totali, errori)
- `AutomazioniList.tsx` — griglia card raggruppata per categoria
- `AutomazioneCard.tsx` — card singola con trigger → azione, toggle, menu
- `AutomazioniTemplateGallery.tsx` — gallery searchabile con "Attiva" one-click
- `AutomazioneFormDrawer.tsx` — Sheet con 4 tab (Info, Trigger, Azione, Avanzato)
- `AutomazioniEmptyState.tsx` — stato vuoto con CTA

### File coinvolti

| File | Azione |
|---|---|
| Migration SQL | Nuovo — `automation_rules`, `automation_log`, RPC, seed 20+ template |
| `src/hooks/useAutomazioni.ts` | Nuovo — CRUD + template hooks |
| `src/pages/azienda/AutomazioniUnified.tsx` | Modifica — aggiunta tab "Regole" |
| `src/components/automazioni/AutomazioniHeader.tsx` | Nuovo |
| `src/components/automazioni/AutomazioniList.tsx` | Nuovo |
| `src/components/automazioni/AutomazioneCard.tsx` | Nuovo |
| `src/components/automazioni/AutomazioniTemplateGallery.tsx` | Nuovo |
| `src/components/automazioni/AutomazioneFormDrawer.tsx` | Nuovo |
| `src/components/automazioni/AutomazioniEmptyState.tsx` | Nuovo |

