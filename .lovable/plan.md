

## Piano: [N1] Notifiche — DB, RLS, Funzione PG

Creazione della struttura dati per il sistema di notifiche in-app. Solo modifiche al database, nessun componente UI.

### Migrazione SQL unica con:

**1. Tabella `notifications`**
- Colonne: `id`, `company_id` (FK companies), `user_id` (FK auth.users), `type` (text), `title`, `body`, `entity_type`, `entity_id`, `action_url`, `is_read`, `is_dismissed`, `created_at`
- 4 indici: `user_id`, `company_id`, `is_read` (partial WHERE false), `created_at DESC`
- RLS abilitata con 2 policy:
  - SELECT: `auth.uid() = user_id`
  - UPDATE: `auth.uid() = user_id` (per is_read/is_dismissed)
  - Nessuna INSERT policy per utenti — solo SECURITY DEFINER functions inseriscono

**2. Funzione `create_notification()`**
- SECURITY DEFINER, accetta parametri per creare notifiche
- Verifica che l'utente destinatario esista prima di inserire
- Restituisce l'UUID della notifica creata

**3. Funzione `mark_all_notifications_read()`**
- SECURITY DEFINER, usa `auth.uid()` per aggiornare solo le notifiche dell'utente corrente
- Accetta `p_company_id` come parametro

**4. Realtime**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications`

### Note tecniche
- La tabella `lifecycle_notifications` già esistente è per notifiche di sistema/lifecycle (trial, inattività). La nuova tabella `notifications` è per notifiche utente in-app (ticket, ordini, task).
- I trigger (prompt N3) useranno `create_notification()` per inserire. La tabella `tasks` (non `marketing_tasks`) ha `assigned_to`, `created_by`, `company_id`. La tabella `orders` ha `assigned_to` e `customer_id` ma NON `created_by` — il trigger ordini notificherà `assigned_to` invece di `created_by`.

