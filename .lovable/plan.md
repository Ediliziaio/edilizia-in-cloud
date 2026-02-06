
# Analisi Software e Piano di Miglioramento

## Stato Attuale

### Utenti nel Database
Analizzando il database, sono presenti 3 utenti:
1. **Super Admin**: `flo.andriciuc@gmail.com` (password: `Tekno2026!`)
2. **Company Admin**: `amministrazione@domusgroupitalia.it` 
3. **Customer**: `mario.rossi@example.com` (password generata automaticamente)

### Problema di Autenticazione Identificato
L'errore `invalid_credentials` si verifica perche le password potrebbero essere state modificate o ci sono problemi con auth.users. La password del super admin e hardcoded nella edge function come `Tekno2026!`.

---

## Problemi Identificati

### 1. Codice Duplicato (Priorita Alta)
La funzione `formatCurrency` e definita localmente in 4 file diversi invece di usare quella centralizzata in `src/lib/formatters.ts`:
- `src/pages/azienda/CreateOrder.tsx` (linea 204)
- `src/pages/azienda/EditOrder.tsx` (linea 182)
- `src/pages/azienda/OrderDetail.tsx` (linea 260)
- `src/pages/azienda/OrdersList.tsx` (linea 100)

**Soluzione**: Rimuovere le definizioni locali e importare da `@/lib/formatters`.

### 2. Funzioni formatDate Duplicate
Simile a formatCurrency, le funzioni `formatDate` e `formatDateTime` sono duplicate:
- `src/pages/azienda/OrderDetail.tsx` (linee 267-272)
- `src/pages/azienda/OrdersList.tsx` (linea 107)

**Soluzione**: Usare le funzioni gia esistenti in `@/lib/formatters.ts`.

### 3. CORS Headers Inconsistenti
Le edge functions hanno CORS headers diversi:
- `create-super-admin`: Header base
- `create-customer`: Header completi con headers aggiuntivi Supabase

**Soluzione**: Standardizzare tutti i CORS headers con il formato completo.

### 4. Password Super Admin Hardcoded
In `create-super-admin/index.ts`, email e password sono hardcoded:
```typescript
const email = "flo.andriciuc@gmail.com";
const password = "Tekno2026!";
```

**Soluzione**: Accettare i parametri dal body della richiesta o da secrets.

### 5. Manca Reset Password per Admin
Quando un admin crea un cliente, la password e mostrata una sola volta. Non esiste modo di resettarla successivamente.

**Soluzione**: Creare edge function `reset-customer-password`.

### 6. Query Non Ottimizzate in CustomersList
In `CustomersList.tsx` vengono eseguite 3 query separate (profiles, user_roles, orders) che potrebbero essere ottimizzate.

---

## Piano di Implementazione

### Fase 1: Pulizia Codice Duplicato

**File da modificare:**

1. **`src/pages/azienda/OrdersList.tsx`**
   - Rimuovere la definizione locale di `formatCurrency` (linee 100-105)
   - Rimuovere la definizione locale di `formatDate` (linee 107-113)
   - Aggiungere import: `import { formatCurrency, formatDateShort } from "@/lib/formatters";`
   - Sostituire `formatDate` con `formatDateShort`

2. **`src/pages/azienda/OrderDetail.tsx`**
   - Rimuovere la definizione locale di `formatCurrency` (linee 260-265)
   - Rimuovere la definizione locale di `formatDate` (linee 267-269)
   - Rimuovere la definizione locale di `formatDateTime` (linee 271-273)
   - Aggiungere import: `import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";`

3. **`src/pages/azienda/CreateOrder.tsx`**
   - Rimuovere la definizione locale di `formatCurrency` (linee 204-209)
   - Aggiungere import: `import { formatCurrency } from "@/lib/formatters";`

4. **`src/pages/azienda/EditOrder.tsx`**
   - Rimuovere la definizione locale di `formatCurrency` (linee 182-187)
   - Aggiungere import: `import { formatCurrency } from "@/lib/formatters";`

### Fase 2: Standardizzazione CORS nelle Edge Functions

**File da modificare:**

1. **`supabase/functions/create-super-admin/index.ts`**
   - Aggiornare i CORS headers per includere tutti gli header necessari:
   ```typescript
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers":
       "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
   };
   ```

2. **`supabase/functions/create-company/index.ts`**
   - Stesso aggiornamento CORS headers

### Fase 3: Reset Password per Clienti

**File da creare:**

1. **`supabase/functions/reset-customer-password/index.ts`**
   - Accetta `customer_id` nel body
   - Verifica che il chiamante sia un admin dell'azienda del cliente
   - Genera una nuova password sicura
   - Aggiorna la password in auth.users
   - Restituisce la nuova password

**File da modificare:**

2. **`supabase/config.toml`**
   - Aggiungere configurazione per la nuova edge function

3. **`src/pages/azienda/CustomersList.tsx`**
   - Aggiungere bottone "Reset Password" per ogni cliente
   - Dialog di conferma e visualizzazione nuova password

### Fase 4: Miglioramenti UX

**Modifiche opzionali ma consigliate:**

1. **Dashboard Company**: La dashboard non mostra `effectiveCompany` correttamente quando il super admin fa impersonation (usa `company` invece di `effectiveCompany`)

2. **Filtro clienti by role**: Attualmente `CustomersList` filtra lato client, potrebbe usare una view o RPC per efficienza

---

## Riepilogo File da Modificare

| File | Azione | Priorita |
|------|--------|----------|
| `src/pages/azienda/OrdersList.tsx` | Rimuovere duplicati formatCurrency/formatDate | Alta |
| `src/pages/azienda/OrderDetail.tsx` | Rimuovere duplicati formatCurrency/formatDate/formatDateTime | Alta |
| `src/pages/azienda/CreateOrder.tsx` | Rimuovere duplicato formatCurrency | Alta |
| `src/pages/azienda/EditOrder.tsx` | Rimuovere duplicato formatCurrency | Alta |
| `supabase/functions/create-super-admin/index.ts` | Standardizzare CORS | Media |
| `supabase/functions/create-company/index.ts` | Standardizzare CORS | Media |
| `supabase/functions/reset-customer-password/index.ts` | Creare nuova funzione | Media |
| `src/pages/azienda/CustomersList.tsx` | Aggiungere reset password UI | Media |
| `src/pages/azienda/CompanyDashboard.tsx` | Usare effectiveCompany | Bassa |

---

## Verifica Integrazioni

### Funzionalita Integrate Correttamente
- Sistema di autenticazione con ruoli (super_admin, company_admin, customer)
- Impersonation del super admin
- Sistema ordini con progress tracker personalizzabile
- Sistema ticket di assistenza cliente-admin
- Profilo cliente modificabile
- Creazione clienti con password generata

### Test da Eseguire Post-Implementazione
1. Login super admin con `Tekno2026!`
2. Impersonation azienda
3. Creazione cliente → copia password
4. Login cliente con nuova password
5. Modifica profilo cliente
6. Creazione ticket assistenza
7. Risposta admin al ticket
8. Reset password cliente (nuova funzionalita)
