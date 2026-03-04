

# Filtro Dropdown per Ruolo: Titolare = Venditori, Call Center = Call Center

## Problema

Tutti i dropdown (Titolare, Follower, Call Center) in contatti e opportunita mostrano la stessa lista generica di staff. Serve filtrare per ruolo:

| Dropdown | Lista corretta |
|----------|---------------|
| **Titolare** (assigned_to) | Venditori (`salesperson`) + Admin |
| **Follower** (follower_id) | Tutti staff (invariato) |
| **Call Center** (call_center_id) | Solo utenti con ruolo `call_center` |

## Interventi

### 1. Nuovi hook in `useOpportunitiesData.ts`

Aggiungere due hook:

- **`useCompanySalespeople()`**: Filtra profili con ruolo `salesperson` o `company_admin`
- **`useCompanyCallCenterUsers()`**: Filtra profili con ruolo `call_center`

Mantiene `useCompanyStaff()` invariato per il Follower.

### 2. `OpportunityDialog.tsx` (riga 80, 399-430)

- Importare i 2 nuovi hook + mantenere `useCompanyStaff` per Follower
- Dropdown **Titolare**: usare `salespeople` invece di `staff`
- Dropdown **Follower**: resta `staff` (invariato)
- Dropdown **Call Center**: usare `callCenterUsers`

### 3. `OpportunityDetailDialog.tsx` (riga 57, 603-633)

- Stessa logica: importare i nuovi hook
- Titolare → `salespeople`, Follower → `staff`, Call Center → `callCenterUsers`

### 4. `MarketingContactDetail.tsx` (righe 404-430, 655-707)

- La query inline `company_staff` (riga 405) resta per il Follower
- Aggiungere 2 query inline (o usare i hook) per salespeople e call center users
- Aggiornare i 3 dropdown di conseguenza

## File da modificare

- `src/hooks/useOpportunitiesData.ts` — 2 nuovi hook
- `src/components/opportunities/OpportunityDialog.tsx` — dropdown filtrati
- `src/components/opportunities/OpportunityDetailDialog.tsx` — dropdown filtrati
- `src/pages/azienda/marketing/MarketingContactDetail.tsx` — dropdown filtrati

