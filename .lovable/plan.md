
# Audit Sezione Super Admin -- Pulizia, Bug Fix, UX

## 1. Bug e problemi trovati

### 1.1 ReferralDashboard: nessuna gestione errore (BUG CRITICO)
`ReferralDashboard.tsx` e l'unica pagina admin senza `isError`/`refetch`. Se una delle 3 query (referrers, referral_companies, referral_payouts) fallisce, la UI si blocca senza feedback.

**Fix**: Estrarre `isError` e `refetch` dalla query `referrers`. Aggiungere `Alert` + "Riprova" (stesso pattern di CompaniesList, SubscriptionPlans, AdminDashboard).

### 1.2 SubscriptionPlans: `toggleActiveMutation` senza `onError`
Se il toggle attiva/disattiva fallisce, l'utente non riceve nessun feedback. Tutte le altre mutation nella stessa pagina hanno `onError`.

**Fix**: Aggiungere `onError` con toast destructive.

### 1.3 SubscriptionPlans: `staleTime` mancante sulla query principale
La query `subscription-plans` non ha `staleTime`, quindi ogni navigazione alla pagina riesegue la query. Le altre query admin usano `staleTime: 2-5 min`.

**Fix**: Aggiungere `staleTime: 2 * 60 * 1000` alla query `subscription-plans`.

### 1.4 AdminSettings: form non sincronizzato con `profile`
Il form inizializza `formData` con `profile?.first_name` allo mount, ma se `profile` arriva dopo (async), il form resta vuoto. Manca un `useEffect` di sincronizzazione (come fatto in `useCompanyDetail` con `useRef`).

**Fix**: Aggiungere `useEffect` che aggiorna `formData` quando `profile` cambia.

## 2. Codice morto e pulizia

### 2.1 `as any` residui in SubscriptionPlans.tsx e CompanyDetail.tsx
Ci sono 7 occorrenze di `(plan as any).included_modules`. La colonna `included_modules` esiste nella tabella `subscription_plans` come `jsonb`, quindi il tipo Supabase dovrebbe includerla. Il cast `as any` puo essere ridotto usando un tipo helper locale.

**Fix**: Creare un type helper `PlanWithModules` e sostituire i cast.

### 2.2 SubscriptionPlans: `saveMutation` usa `Record<string, any>` per payload
Il payload e tipizzato come `Record<string, any>`, poi castato `as any` per insert/update.

**Fix**: Rimuovere i cast e usare il tipo derivato da Supabase o un tipo esplicito.

## 3. Miglioramenti UX

### 3.1 ReferralDashboard: stato vuoto migliorato
Se non ci sono referrer, la tabella mostra solo "Nessun referrer". Manca una CTA per crearne uno direttamente.

**Fix**: Aggiungere un bottone "Crea il primo referrer" nello stato vuoto della tabella.

### 3.2 SubscriptionPlans: nessun piano creato -- stato vuoto
Se non ci sono piani, la griglia e vuota senza messaggio.

**Fix**: Aggiungere uno stato vuoto con icona + CTA "Crea il primo piano".

### 3.3 AdminSettings: feedback visivo mancante per operazioni disabilitate
Il bottone "Cambia Password" si disabilita se la password e vuota, ma non c'e nessuna indicazione visiva di successo dopo il cambio (es. checkmark temporaneo).

**Fix**: gia gestito dal toast, nessun intervento necessario.

## 4. Riepilogo modifiche

| File | Azione |
|------|--------|
| `ReferralDashboard.tsx` | + isError/refetch con Alert e Riprova |
| `SubscriptionPlans.tsx` | + onError su toggleActiveMutation, + staleTime su query principale, + stato vuoto griglia, pulizia `as any` |
| `CompanyDetail.tsx` | Pulizia `as any` su included_modules (tipo helper) |
| `AdminSettings.tsx` | + useEffect per sincronizzare form con profile asincrono |

## 5. Cosa rimane invariato (gia corretto in precedenza)
- AdminDashboard: isError/refetch gia presente
- CompaniesList: isError/refetch gia presente, staleTime gia configurato
- AdminSupportChatList: isError/refetch gia presente, useQuery migrato
- AdminSupportChatSheet: useQuery migrato, realtime ottimizzato
- GlobalTickets: wrapper puro, delega tutto
- CreateCompany: form ben validato con zod
- useCompanyDetail: useRef + useEffect per form sync, Promise.all, staleTime
