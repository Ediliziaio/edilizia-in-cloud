

# Ottimizzazioni P2: Quick Login Popover + Stat Card Navigation

## Modifiche da implementare

### 1. Quick Login Popover — Limite 50 risultati + ricerca server-side

**File**: `src/components/admin/QuickLoginPopover.tsx`

**Problema attuale**: Il popover carica TUTTI i profili, ruoli e aziende (3 query senza `.limit()`) e filtra client-side. Non scala su database con centinaia di utenti.

**Correzione**:
- Aggiungere `.limit(50)` alle query `profiles` e `user_roles`
- Quando l'utente digita nella barra di ricerca, filtrare server-side con `.or()` su `first_name`, `last_name`, `email` invece di filtrare l'array completo in memoria
- Usare `debouncedSearch` con un ritardo di 300ms per evitare troppe chiamate
- La `queryKey` diventa `["admin-all-users-for-login", debouncedSearch]` per re-fetch automatico al cambio ricerca
- Logica: se `search` e' vuoto, carica i primi 50 profili ordinati per nome; se `search` ha testo, filtra server-side con `.ilike()` o `.or()` e limita a 50 risultati

**Struttura query ottimizzata**:
```
profiles query:
  .select("id, first_name, last_name, email, company_id")
  .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  .order("first_name")
  .limit(50)
```

### 2. Admin Stat Cards — Click handler per navigazione rapida

**File**: `src/components/admin/dashboard/AdminStatCards.tsx`

**Problema attuale**: Le stat card sono statiche, non cliccabili. L'utente deve navigare manualmente alla sezione desiderata.

**Correzione**:
- Aggiungere un campo `href` a ogni stat card:
  - "Aziende Attive" -> `/admin/aziende`
  - "Ordini Totali" -> `/admin/aziende` (non esiste una pagina ordini globale)
  - "Clienti Totali" -> `/admin/aziende`
  - "Supporto Aperto" -> `/admin/ticket`
- Wrappare ogni `Card` con `useNavigate` + `onClick` handler
- Aggiungere `cursor-pointer hover:shadow-md transition-shadow` per feedback visivo
- Non usare `<Link>` per evitare di cambiare la semantica del componente Card

### 3. Verifica end-to-end

Dopo l'implementazione, navigare tutte le sezioni admin per verificare che nulla sia rotto:
- Dashboard (`/admin`)
- Lista Aziende (`/admin/aziende`)
- Impostazioni (`/admin/impostazioni`)
- Assistenza (`/admin/ticket`)
- Piani (`/admin/piani`)
- Referral (`/admin/referral`)
- Implementazioni (`/admin/implementazioni`)

## File da modificare

| File | Modifica |
|------|----------|
| `src/components/admin/QuickLoginPopover.tsx` | Aggiungere `.limit(50)`, ricerca server-side con debounce, queryKey dinamica |
| `src/components/admin/dashboard/AdminStatCards.tsx` | Aggiungere `href` + `onClick` + `useNavigate` + hover styles |

## Impatto stimato

- **Quick Login**: riduzione payload da N profili illimitati a max 50 per request
- **Stat Cards**: navigazione 1-click verso sezioni rilevanti, UX migliorata
- **Rischio regressione**: zero — entrambe le modifiche sono additive e behavior-preserving

