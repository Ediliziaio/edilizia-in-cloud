

## Piano: [N2] Notifiche — Hook Realtime + UI (Bell + Panel)

### Analisi codebase

- Auth context: `useAuth()` da `@/contexts/AuthContext` (non `@/hooks/useAuth`). Espone `profile` e `effectiveCompany`.
- `CompanySidebar` e' una funzione interna in CompanyLayout.tsx. Il footer della sidebar (linee 587-631) contiene Impostazioni + avatar + logout.
- `CompanyLayout` (linee 639-706) gestisce i dialog/sheet globali (SupportChatSheet, SupportChannelDialog).
- Il progetto usa gia' `Sheet` da vaul/radix per pannelli laterali (SupportChatSheet).

### File da creare

**1. `src/hooks/useNotifications.ts`**
- Hook con `useQuery` per notifiche non dismissed (limit 50, order desc)
- Import `useAuth` da `@/contexts/AuthContext` (non `@/hooks/useAuth`)
- Realtime subscription su `postgres_changes` INSERT con filtro `user_id`
- Mutations ottimistiche: `markAsRead`, `markAllAsRead` (via RPC), `dismiss`
- `unreadCount` calcolato dal filtro client

**2. `src/components/notifications/NotificationsPanel.tsx`**
- Sheet laterale (destra) con lista notifiche
- Icone per tipo (MessageSquare, Package, CheckSquare, Banknote, Bell)
- Sfondo `bg-primary/5` per non lette
- Timestamp relativo con `formatDistanceToNow` + locale `it`
- Click su notifica con `action_url`: navigate + markAsRead + close panel
- Pulsante X su hover per dismiss
- Auto mark-all-read dopo 500ms all'apertura del pannello
- Empty state

### File da modificare

**3. `src/components/layouts/CompanyLayout.tsx`**

In `CompanySidebar` (linea ~587, prima del blocco `mt-auto border-t`):
- Aggiungere Bell button con badge `unreadCount` nel footer della sidebar, prima del link Impostazioni

In `CompanyLayout` (linea ~693, accanto ai dialog Support):
- Aggiungere stato `notificationsPanelOpen` + `NotificationsPanel`
- Passare `setNotificationsPanelOpen` al `CompanySidebar` via prop (dato che e' una funzione interna nello stesso file, si puo' anche sollevare lo stato nel componente padre e passarlo)

Nota: siccome `CompanySidebar` e' definita come funzione interna senza props, bisognera' o passare una prop callback oppure usare un approccio diverso. La soluzione piu' pulita: aggiungere lo stato nel `CompanyLayout` e passare `onOpenNotifications` come prop a `CompanySidebar`.

### Riepilogo

| Azione | File |
|--------|------|
| Creare | `src/hooks/useNotifications.ts` |
| Creare | `src/components/notifications/NotificationsPanel.tsx` |
| Modificare | `src/components/layouts/CompanyLayout.tsx` |

