

## ATT-06 · Notifiche In-App — Analisi e Piano

### Cosa esiste già

Il sistema ha **quasi tutto** ATT-06 già implementato:

| Componente | Stato |
|---|---|
| Tabella `notifications` con realtime | ✅ Esiste |
| `useNotifications` hook con realtime subscription | ✅ Esiste |
| `NotificationsPanel` (Sheet laterale) con bell + badge | ✅ Esiste nell'header |
| Badge sidebar su "Attività" via `useMyTaskCount` | ✅ Esiste (rosso se overdue, warning se today) |
| DB trigger `notify_task_assigned` (INSERT) | ✅ Esiste |
| `mark_all_notifications_read` RPC | ✅ Esiste |
| `user_notification_preferences` tabella | ✅ Esiste (con 60+ colonne per canale) |
| `useUserNotifPrefs` hook | ✅ Esiste |
| `notificationSound.ts` | ✅ Esiste (usato solo nel supporto chat) |
| Preferenze notifiche UI | ✅ Esiste come `NotificationsTab` in Settings |

### Cosa manca (gap da colmare)

1. **Toast + suono su notifica realtime**: Il hook `useNotifications` aggiorna la cache ma **non mostra toast ne suono**. Deve mostrare un toast sonner e (opzionalmente) riprodurre il suono.

2. **Trigger per task riassegnato**: Il trigger attuale (`trg_notify_task_assigned`) scatta solo su `INSERT`, non su `UPDATE OF assigned_to`. Se un task viene riassegnato, il nuovo assegnatario non riceve notifica.

3. **Action URL errato**: Il trigger usa `/azienda/task` che non esiste — dovrebbe essere `/azienda/attivita`.

4. **Notifiche scadenza giornaliere**: Non esiste un meccanismo per notificare task in scadenza oggi o scaduti. Serve una funzione DB + cron job.

5. **Rispetto preferenze utente nei trigger**: I trigger DB non controllano `user_notification_preferences` prima di creare la notifica.

### Piano di implementazione

#### 1. Aggiornare `useNotifications` — Toast + Suono

Nel realtime handler (riga 61-65 di `useNotifications.ts`), dopo l'aggiunta alla cache, aggiungere:
- `toast()` con titolo e body della notifica, con action button per navigare
- `playNotificationSound()` importato da `@/lib/notificationSound`

#### 2. Migrazione DB — Fix trigger + aggiunta scadenze

- **Aggiornare `notify_task_assigned()`**: Scattare anche su `UPDATE OF assigned_to` (non solo INSERT). Controllare `user_notification_preferences.task_assigned_in_app` prima di creare. Fixare action_url a `/azienda/attivita`.
- **Nuova funzione `create_task_due_notifications()`**: Crea notifiche per task in scadenza oggi (`task_due_soon`) e task scaduti (`task_overdue`). Rispetta preferenze utente. Evita duplicati con `NOT EXISTS`.
- **Cron job**: Schedulare `create_task_due_notifications()` ogni giorno alle 08:00 via `pg_cron` + `pg_net`.

#### 3. File modificati

| File | Modifica |
|---|---|
| `src/hooks/useNotifications.ts` | Aggiungere toast + suono nel realtime handler |
| Migrazione SQL | Fix trigger task + funzione scadenze + cron |

Nessun nuovo componente UI — tutto esiste già.

