

# Audit Super Admin: Risultati Verifica e Piano Fix

## Riepilogo Verifica

Ho letto tutti i file citati nel prompt. Molti dei bug e delle disconnessioni segnalati sono **già stati risolti** in iterazioni precedenti. Ecco lo stato reale:

### Già risolti (nessun intervento necessario)

| Issue | Stato | Dettaglio |
|-------|-------|-----------|
| BUG #1 — UUID hardcodato Implementations.tsx | **Non esiste** | Il file non esiste. Sostituito da `FeatureFlags.tsx` che usa `platform_feature_flags` + `company_feature_overrides` senza hack |
| BUG #2 — UUID hack AdminSupportChatList | **Non presente** | Nessun `.neq('id', '000...')` nel file |
| BUG #3 — Ricerca AuditLog solo client-side | **Già fixato** | Ricerca server-side con debounce, lookup profili, paginazione corretta |
| DISCONN #2 — Feature Flags mancanti | **Già implementato** | Modulo completo con `platform_feature_flags`, override per azienda, bulk, audit log |
| DISCONN #4 — QuickLoginReturnBanner | **Già montato** | Presente in CompanyLayout, EmployeeLayout, SalespersonLayout, CustomerLayout |
| DISCONN #5 — Test Email | **Già implementato** | `EmailProviderConfig` ha test email con `send-test-email` edge function |
| DISCONN #6 — Export CSV AuditLog | **Già implementato** | Pulsante CSV presente nell'header di AuditLogTab |
| OPT #1 — adminRpc.ts | **Già creato** | File `src/types/adminRpc.ts` con interfacce tipizzate |
| OPT #2 — Realtime cleanup | **Già presente** | `supabase.removeChannel(channel)` nel cleanup di useEffect |

### Da fixare (interventi necessari)

#### 1. BUG #4 — NotificationsTab: `as any` su operazioni DB
- `from("admin_notification_prefs" as any)` e `.upsert(... as any)` nascondono errori di tipo
- Fix: rimuovere i cast `as any`, la tabella esiste nel DB ed è funzionante

#### 2. BUG #5 — SyncLogs: nessun error state UI
- Il componente non gestisce `isError` dalla query. Se la query fallisce, l'utente vede solo "Nessun log trovato" invece di un messaggio di errore con retry
- Fix: aggiungere check `isError` con Alert destructive e pulsante Riprova

#### 3. BUG #6 — MRR expansion/contraction hardcodati a 0
- `useAdminRevenueData.ts` linee 282-283: `expansionMrr: 0, contractionMrr: 0`
- Il grafico AdminMrrMovements non mostra nemmeno le barre expansion/contraction (solo newMrr e churnMrr)
- Fix parziale per go-live: aggiungere nota informativa nel componente `AdminMrrMovements` che spiega i dati parziali

#### 4. DISCONN #1 — Plan change non sincronizza Stripe
- `useCompanyDetail.ts` linea 327: il cambio piano fa solo `.update({ subscription_plan_id })` sul DB senza toccare Stripe
- Fix: creare edge function `admin-change-plan` che aggiorna sia DB che Stripe subscription (se `stripe_customer_id` e `stripe_price_id_monthly` sono configurati)

#### 5. DISCONN #3 — Trial extension senza limite hard
- `CompanyLifecycle.tsx`: mostra warning dialog dopo 3 estensioni ma non blocca. Funziona già con AlertDialog, serve solo rendere il messaggio più esplicito
- Fix minimo: il comportamento attuale è già accettabile (warning + conferma esplicita). Nessun fix bloccante.

## Piano Implementazione

### Fase 1 — Bug fix (priorità alta)
1. **SyncLogs error state**: aggiungere gestione `isError` con UI di errore e retry
2. **NotificationsTab**: rimuovere `as any` cast
3. **AdminMrrMovements**: aggiungere nota visiva su dati parziali expansion/contraction

### Fase 2 — Stripe sync (priorità media)
4. **Edge function `admin-change-plan`**: crea funzione che gestisce cambio piano con sync Stripe opzionale
5. **useCompanyDetail.ts**: aggiornare `changePlanMutation` per invocare la nuova edge function invece del `.update()` diretto

### File impattati
- `src/pages/admin/SyncLogs.tsx` — aggiunta error state
- `src/components/admin/settings/NotificationsTab.tsx` — rimozione `as any`
- `src/components/admin/dashboard/AdminMrrMovements.tsx` — nota informativa
- `supabase/functions/admin-change-plan/index.ts` — nuova edge function
- `src/hooks/useCompanyDetail.ts` — usa edge function per cambio piano

