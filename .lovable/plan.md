

# Piano: UserNotificationsTab — Matrice Notifiche per Utente

## Panoramica
Sostituire lo stub "Coming Soon" con una matrice notifiche completa: righe = eventi raggruppati per sezione, colonne = canali (In-app, Email, SMS), con toggle per cella e "Attiva/Disattiva tutti" per sezione.

## Modifiche

### 1. Migrazione DB — `user_notification_preferences`
Tabella flat con ~60 colonne booleane (una per combinazione evento×canale), `UNIQUE(user_id)`, RLS basata su `company_id` via profiles. Tutti i default già impostati nelle colonne. Nessun CHECK con `now()`.

### 2. Hook — `src/hooks/useUserNotificationPrefs.ts`
- `useUserNotifPrefs(userId)`: query con fallback a `DEFAULT_NOTIF_PREFS` costante
- `useSaveUserNotifPrefs(userId, companyId)`: upsert su `user_id`
- Tipo `NotifPrefs` con tutte le chiavi booleane

### 3. Componente — `src/components/users/UserNotificationsTab.tsx`
Sostituzione completa dello stub. Layout:
- Alert SMS se utente senza telefono (query su `profiles.phone`)
- 6 sezioni (Lead, Ordini, Appuntamenti, Task, Messaggi, Report) ognuna in una Card
- Header con icone canale + "Attiva/Disattiva tutti" per colonna-sezione
- Grid righe eventi con Switch per ogni cella
- SMS Switch disabilitato (opacity-30) se no telefono
- Bottone "Salva Preferenze" in fondo

### File
- `supabase/migrations/...` — nuova tabella `user_notification_preferences`
- `src/hooks/useUserNotificationPrefs.ts` — nuovo
- `src/components/users/UserNotificationsTab.tsx` — sostituzione completa

### Note
- Il prompt specifica import da `@/hooks/useUserNotificationPrefs` (non `useUserNotifPrefs`) — userò il nome file corretto
- Nessuna modifica a `SettingsUserDetail.tsx` necessaria

