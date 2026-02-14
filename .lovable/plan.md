

# Upgrade Sezione Assistenza Aziende - Customer Care Professionale

## Panoramica

La sezione attuale mostra solo una lista di chat senza alcun sistema di gestione. Serve trasformarla in un vero pannello di customer care con stato conversazione, priorita, filtri, note interne e metriche SLA.

## 1. Nuova tabella database: `support_conversations`

Aggiungere una tabella che traccia lo stato di ogni conversazione (una per azienda), separata dai messaggi:

| Colonna | Tipo | Default | Descrizione |
|---------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | PK |
| `company_id` | uuid | - | FK verso companies (UNIQUE) |
| `status` | text | 'open' | open / in_progress / resolved / closed |
| `priority` | text | 'normal' | low / normal / high / urgent |
| `assigned_to` | uuid | null | ID admin assegnato (per futuro multi-admin) |
| `internal_notes` | text | null | Note interne visibili solo all'admin |
| `resolved_at` | timestamptz | null | Quando e stato risolto |
| `created_at` | timestamptz | now() | Prima apertura |
| `updated_at` | timestamptz | now() | Ultimo aggiornamento |

- RLS: solo `super_admin` puo gestire questa tabella
- Un trigger `on INSERT` su `support_messages` crea o aggiorna automaticamente la riga in `support_conversations` (setta `status = 'open'` se era `resolved/closed` e il messaggio arriva dall'azienda, aggiorna `updated_at`)

## 2. Barra filtri nella lista conversazioni

Aggiungere sotto la search bar una riga di filtri:

- **Stato**: Tutti / Aperte / In lavorazione / Risolte / Chiuse (tabs o select)
- **Priorita**: Tutte / Bassa / Normale / Alta / Urgente (select)
- **Ordinamento**: Piu recenti / Piu vecchie / Priorita (select)

I filtri lavorano lato client sui dati gia fetchati (come il search attuale).

## 3. Upgrade delle card conversazione

Ogni card nella lista mostrera:

- Badge **stato** colorato (verde=risolto, giallo=in lavorazione, rosso=aperto, grigio=chiuso)
- Badge **priorita** (solo se alta/urgente, con icona fiamma/alert)
- Indicatore **aging** (pallino verde <24h, giallo 24-48h, rosso >48h dall'ultimo messaggio azienda senza risposta)
- Conteggio messaggi e timestamp ultimo messaggio (gia presente)

## 4. Azioni rapide nella chat sheet (AdminSupportChatSheet)

Aggiungere una toolbar sopra la chat con:

- **Dropdown stato**: cambio rapido tra Open / In Progress / Resolved / Closed
- **Dropdown priorita**: cambio rapido Low / Normal / High / Urgent  
- **Pulsante "Note interne"**: apre un popover/collapsible con textarea per note admin (salvate in `support_conversations.internal_notes`)
- **Pulsante "Segna come risolto"**: shortcut che setta status=resolved e resolved_at=now()

Quando si cambia stato a "resolved", un messaggio automatico di sistema appare nella chat: "[Sistema] Conversazione contrassegnata come risolta"

## 5. Stats cards aggiornate

Aggiornare `SupportStats.tsx` con 4 metriche:

1. **Aperte** - conversazioni con status open
2. **Da rispondere** - ultimo messaggio da azienda (gia presente)
3. **Tempo medio risposta** - calcolato come media del delta tra ultimo messaggio azienda e prima risposta admin successiva
4. **Risolte questa settimana** - count di resolved_at negli ultimi 7 giorni

## 6. File coinvolti

### Database
- **Migrazione**: Creare tabella `support_conversations` con RLS policies, trigger auto-upsert su `support_messages` INSERT, abilitare realtime

### File da creare
- `src/components/admin/support/SupportFilters.tsx` - Barra filtri (stato, priorita, ordinamento)
- `src/components/admin/support/ConversationActions.tsx` - Toolbar azioni nella chat (stato, priorita, note)

### File da modificare
- `src/components/admin/support/AdminSupportChatList.tsx` - Fetch `support_conversations`, join con dati messaggi, integrazione filtri, aging badge
- `src/components/admin/support/AdminSupportChatSheet.tsx` - Aggiungere toolbar azioni sopra la chat
- `src/components/admin/support/SupportStats.tsx` - Nuove metriche da `support_conversations`

## Dettagli tecnici

### Trigger database (auto-upsert conversazione)

```sql
CREATE OR REPLACE FUNCTION handle_support_message_conversation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO support_conversations (company_id, status, updated_at)
  VALUES (NEW.company_id, 'open', now())
  ON CONFLICT (company_id) DO UPDATE SET
    updated_at = now(),
    status = CASE
      WHEN NEW.sender_role != 'super_admin'
        AND support_conversations.status IN ('resolved', 'closed')
      THEN 'open'
      ELSE support_conversations.status
    END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Struttura ConversationSummary aggiornata

```typescript
interface ConversationSummary {
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageDate: string;
  totalMessages: number;
  unansweredByAdmin: boolean;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  internalNotes: string | null;
  resolvedAt: string | null;
  agingHours: number; // ore dall'ultimo messaggio azienda senza risposta
}
```

### Filtri (SupportFilters.tsx)

```typescript
interface SupportFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  priorityFilter: string;
  onPriorityChange: (priority: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}
```

Usa `Tabs` per lo stato (piu visivo) e `Select` per priorita/ordinamento.

### ConversationActions.tsx (toolbar nella chat)

```typescript
interface ConversationActionsProps {
  companyId: string;
  status: string;
  priority: string;
  internalNotes: string | null;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onNotesChange: (notes: string) => void;
}
```

Layout: riga orizzontale con Select per stato, Select per priorita, Button per note interne, Button accent "Risolto" come shortcut.

