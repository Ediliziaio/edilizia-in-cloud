

## ATT-02 · My Day — Piano di Implementazione

### Situazione attuale

La tabella `tasks` ha: `title`, `status` (da_fare/in_corso/completata), `priority` (bassa/normale/alta/urgente), `category`, `due_date`, `assigned_to`, `notes`, `contact_id`, `opportunity_id`, `order_id`, `stock_item_id`, `cost_id`, `ticket_id`. **Non** ha `tempo_stimato_min`, `fonte`, `descrizione`, `correlazioni` JSONB — il piano ATT-02 originale va adattato allo schema reale.

La pagina `UnifiedTasks.tsx` già esiste con table view, filtri e TaskDialog. L'hook `useMyTaskCount` è già funzionante. La sidebar ha già il badge sulla voce "Attività" via `CruscottoNavItems`.

### Cosa fare

Trasformare `UnifiedTasks.tsx` in una pagina con **due tab**: "La mia giornata" (My Day) e "Tutte le attività" (la vista tabella attuale). Creare i componenti My Day adattati allo schema reale.

---

#### 1. Refactor `UnifiedTasks.tsx` → container con Tabs

Aggiungere Tabs con due pannelli:
- **"La mia giornata"** → `<MyDayView />` (nuova)
- **"Tutte le attività"** → il contenuto table/filtri attuale estratto in un componente inline o lasciato nel TabsContent

Mantiene header con titolo "Attività" e bottone "Nuova Attività".

#### 2. Nuovi componenti in `src/components/attivita/`

| File | Scopo |
|------|-------|
| `MyDayView.tsx` | Orchestratore: header KPI + sezioni scadute/oggi |
| `MyDayHeader.tsx` | Saluto + 3 KPI cards (oggi, scadute, in scadenza) — no tempo stimato (campo non esiste) |
| `MyDayTimeline.tsx` | Lista task raggruppati per priorità con header sezione |
| `TaskCard.tsx` | Card singolo task con checkbox completamento, priorità, scadenza, categoria, correlazione |
| `PrioritaBadge.tsx` | Badge colorato per priorità |
| `MyDayEmptyState.tsx` | Stato vuoto |

**Adattamenti allo schema reale:**
- Niente `tempo_stimato_min`, `fonte`, `descrizione`, `correlazioni` JSONB
- La "fonte" viene derivata da `category` (marketing/contatti/opportunita → Marketing, resto → Cantieri/Generale)
- Le correlazioni vengono derivate da `order_id`, `contact_id`, `opportunity_id`, `stock_item_id`, `cost_id` con join
- `TaskCard` mostra: checkbox, titolo, PrioritaBadge, categoria, scadenza label, correlazione link

#### 3. Query My Day

`MyDayView` fa una singola query sulla tabella `tasks` filtrando per:
- `company_id` = effectiveCompany.id
- `assigned_to` = user.id
- `status` != 'completata'

Poi suddivide client-side in:
- **Scadute**: `due_date < oggi`
- **Oggi**: `due_date = oggi`
- **Senza scadenza**: `due_date IS NULL`

Ordinate per priorità (urgente → alta → media → bassa), poi scadenza.

#### 4. TaskCard completamento

Click checkbox → `supabase.from("tasks").update({ status: "completata", completed_at: new Date().toISOString() })` → invalidate queries → toast.

#### 5. File modificati/creati

| File | Azione |
|------|--------|
| `src/pages/azienda/UnifiedTasks.tsx` | Refactor: wrap in Tabs, tab 1 = MyDayView, tab 2 = contenuto attuale |
| `src/components/attivita/MyDayView.tsx` | Nuovo |
| `src/components/attivita/MyDayHeader.tsx` | Nuovo |
| `src/components/attivita/MyDayTimeline.tsx` | Nuovo |
| `src/components/attivita/TaskCard.tsx` | Nuovo |
| `src/components/attivita/PrioritaBadge.tsx` | Nuovo |
| `src/components/attivita/MyDayEmptyState.tsx` | Nuovo |

Nessuna migrazione DB necessaria. Nessuna modifica a routing o sidebar.

