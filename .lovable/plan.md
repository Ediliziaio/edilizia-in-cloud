

## ATT-03 · Task List Completa — Filtri, Kanban & Search

### Situazione attuale

Il tab "Tutte le attività" in `UnifiedTasks.tsx` (righe 208-339) ha già:
- Filtri per fonte, stato, priorità, categoria (Select dropdown)
- Table view con checkbox bulk selection
- `BulkActionsBar` per azioni multiple
- `TaskDialog` per creazione/modifica task

**Manca**: ricerca testuale, toggle List/Kanban, vista Kanban con drag-drop.

### Schema DB reale

La tabella `tasks` ha: `title`, `status`, `priority`, `category`, `due_date`, `assigned_to`, `notes`, `created_by`, `completed_at`, `contact_id`, `opportunity_id`, `order_id`, `stock_item_id`, `cost_id`, `ticket_id`. **Nessuna RPC necessaria** — i filtri sono già client-side e la query con joins funziona. La ricerca testuale sarà anch'essa client-side (già si caricano tutti i task).

### Piano

#### 1. Refactor `UnifiedTasks.tsx` tab "Tutte le attività"

Aggiungere al blocco filtri esistente (righe 212-248):
- **Input di ricerca** con icona Search e debounce — filtra su `title` e `notes` (client-side, dati già caricati)
- **Toggle List/Kanban** — due icone `LayoutList` / `Kanban` per switchare vista
- Mantenere tutti i filtri Select esistenti

Aggiungere sotto i filtri:
- Se `viewMode === "list"` → mostra la Table attuale (invariata)
- Se `viewMode === "kanban"` → mostra `<TaskKanbanBoard />`

Aggiungere `filterSearch` allo state e al `filteredTasks` memo.

#### 2. Nuovo componente `TaskKanbanBoard.tsx`

`src/components/attivita/TaskKanbanBoard.tsx`:
- 3 colonne: "Da fare", "In corso", "Completata" (i 3 stati esistenti)
- Ogni colonna mostra i task filtrati per stato
- HTML5 drag & drop: `onDragStart` setta `taskId`, `onDrop` chiama `supabase.from("tasks").update({ status: newStatus })`
- Usa il `TaskCard` esistente da `src/components/attivita/TaskCard.tsx` (ATT-02)
- Invalidate `queryKeys.tasks.all` e `my-task-count` on success

#### 3. File modificati/creati

| File | Azione |
|------|--------|
| `src/pages/azienda/UnifiedTasks.tsx` | Aggiungere search input, view toggle, kanban rendering |
| `src/components/attivita/TaskKanbanBoard.tsx` | **Nuovo** — vista Kanban con drag-drop |

### Nessuna migrazione DB, nessuna RPC, nessun nuovo hook

I dati sono già tutti caricati dalla query esistente. I filtri sono client-side. Il Kanban usa la stessa lista filtrata. L'unica aggiunta server-side è il `supabase.update` nel drag-drop (pattern già usato in `handleToggleComplete`).

