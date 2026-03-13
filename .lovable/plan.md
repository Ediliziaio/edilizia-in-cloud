

## ATT-04 · Task Detail Panel — Piano di Implementazione

### Situazione attuale

- La tabella `tasks` ha: `title`, `notes`, `status`, `priority`, `category`, `due_date`, `assigned_to`, `created_by`, `completed_at`, `order_id`, `contact_id`, `opportunity_id`, `stock_item_id`, `cost_id`, `ticket_id`, `updated_at`
- **Non esistono** le tabelle `task_commenti`, `task_log`, ne il campo `parent_task_id` — sub-task, commenti e storia non sono supportati dal DB attuale
- Attualmente cliccando un task si apre `TaskDialog` (un Dialog modale per edit) — non un pannello laterale
- Auth context espone `user`, `effectiveCompany` via `useAuth` da `@/contexts/AuthContext`

### Adattamento allo schema reale

Non creeremo tabelle `task_commenti` o `task_log` in questo step. Il pannello laterale mostrerà:
- **Dettagli editabili**: titolo (inline), stato, priorità, scadenza, note, categoria, assegnatario — tutti i campi reali della tabella `tasks`
- **Correlazioni**: derivate da `order_id`, `contact_id`, `opportunity_id`, `stock_item_id`, `cost_id` — link alle entità collegate, con possibilità di rimuovere il collegamento (set null)
- **NO sub-task, commenti, storia** — il DB non li supporta; questi possono essere aggiunti in futuro con una migrazione

### Piano

#### 1. Nuovo `TaskDetailPanel.tsx` — Sheet slide-in da destra

`src/components/attivita/TaskDetailPanel.tsx`:
- Usa `Sheet` + `SheetContent` (side="right") da `@/components/ui/sheet`
- Riceve `task: any | null` e `onClose`
- Mostra header con titolo editabile inline (click to edit), dropdown stato/priorità
- Sezione campi: scadenza (date input), categoria, note (textarea), assegnatario (read-only per ora)
- Sezione correlazioni: mostra i link derivati da `order_id`, `contact_id`, `opportunity_id` etc. con possibilità di rimuovere (set FK to null)
- Update inline: ogni modifica chiama `supabase.from("tasks").update(...)` e invalida le query

#### 2. Integrazione in `UnifiedTasks.tsx`

- Aggiungere stato `selectedTask` (null | task object)
- Click su riga tabella o TaskCard → `setSelectedTask(task)` invece di aprire TaskDialog
- Mantenere TaskDialog per "Nuova Attività" (bottone +)
- Renderizzare `<TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />` alla fine

#### 3. File creati/modificati

| File | Azione |
|------|--------|
| `src/components/attivita/TaskDetailPanel.tsx` | **Nuovo** — pannello laterale dettaglio |
| `src/pages/azienda/UnifiedTasks.tsx` | Modificato — click task apre panel invece di dialog |

### Note
- Nessuna migrazione DB
- Il TaskDialog resta per la creazione di nuovi task
- Commenti, sub-task e storia potranno essere aggiunti in futuro con le relative tabelle

