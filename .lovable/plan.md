

# Fix Ruoli Utente: Bug Critici + Verifiche

## Bug Critici Trovati

### 1. AuthContext: `.maybeSingle()` restituisce UN SOLO ruolo (P0)

**File**: `src/contexts/AuthContext.tsx` (riga 53-57)

La query ruoli usa `.maybeSingle()` che ritorna un solo record. Per utenti dual-role (`salesperson` + `company_staff`), potrebbe restituire `company_staff` invece di `salesperson`, causando routing e permessi errati.

**Fix**: Cambiare in `.select("role").eq("user_id", userId)` (senza `.maybeSingle()`), poi applicare la stessa logica di priorita usata altrove: `salesperson` > `call_center` > `company_admin` > `company_staff`.

### 2. RoleBasedRedirect: manca `call_center` nel switch (P0)

**File**: `src/components/auth/RoleBasedRedirect.tsx` (riga 79-91)

Il `switch(role)` non ha il case `"call_center"`, quindi un utente call_center finisce nel `default` → `/login`. Stessa cosa in Login.tsx.

**Fix**: Aggiungere `case "call_center":` → redirect a `/azienda` (stessa area di company_staff).

### 3. ProtectedRoute: manca `call_center` nei roleRedirects (P1)

**File**: `src/components/auth/ProtectedRoute.tsx` (riga 32-39)

L'oggetto `roleRedirects` non include `call_center`, quindi un utente call_center che accede a una rotta non autorizzata viene mandato a `/login`.

**Fix**: Aggiungere `call_center: "/azienda"`.

### 4. Password check: solo per `company_staff` (P1)

**File**: `src/components/auth/RoleBasedRedirect.tsx` (riga 68)

Il check `must_change_password` si attiva solo se `role === "company_staff"`. Con la nuova logica di priorita, un venditore/call_center avra ruolo effettivo `salesperson`/`call_center`, saltando il check.

**Fix**: Estendere la condizione a `["company_staff", "salesperson", "call_center"].includes(role)`.

### 5. Console warning: forwardRef (P2)

`UserRolesPermissionsTab` riceve un `ref` da `SettingsUserDetail` via il `key` prop. Warning innocuo, nessun fix necessario (e' il Select di Radix internamente).

## Dropdown Contatti/Opportunita: Verifica

I dropdown sono **gia correttamente implementati**:
- **Titolare** → `useCompanySalespeople()` filtra `salesperson` + `company_admin`
- **Call Center** → `useCompanyCallCenterUsers()` filtra `call_center`
- **Follower** → `useCompanyStaff()` tutti staff (come richiesto)
- **MarketingContactDetail** → query inline con stessa logica

## File da modificare

| File | Intervento |
|------|-----------|
| `src/contexts/AuthContext.tsx` | Query tutti i ruoli + logica priorita |
| `src/components/auth/RoleBasedRedirect.tsx` | Aggiungere `call_center` + estendere password check |
| `src/components/auth/ProtectedRoute.tsx` | Aggiungere `call_center` a roleRedirects |
| `src/pages/Login.tsx` | Aggiungere `call_center` al switch redirect |

