

# Piano: Numeri Virtuali Telnyx — Implementazione

## Panoramica
Modulo gestione numeri virtuali aziendali via Telnyx. Riutilizza l'edge function `telnyx-proxy` esistente. Crea tabelle DB, hook, pagina settings, route e sidebar item.

## Modifiche

### 1. Migrazione DB
- **`virtual_phone_numbers`**: `company_id`, `phone_number` (UNIQUE), `friendly_name`, `telnyx_phone_id`, `country_code`, `number_type` (local/mobile/toll_free), `capabilities` (jsonb), `is_active`, `assigned_to` (FK profiles), `monthly_cost_eur`, `purchased_at`, `released_at`
- **`phone_number_sms_usage`**: `phone_number_id` (FK), `period_start`, `period_end`, `sms_sent`, `sms_received`, `cost_eur`
- RLS su entrambe via `company_id` da profiles
- Indici su company_id, telnyx_phone_id, period_start

### 2. Hook — `src/hooks/usePhoneNumbers.ts`
- `usePhoneNumbers(companyId)`: query diretta su `virtual_phone_numbers` con join profiles per assigned_user
- `useSearchNumbers(companyId)`: invoca `telnyx-proxy` action `list_available_numbers`
- `usePurchaseNumber(companyId)`: invoca `telnyx-proxy` action `buy_number` + insert in `virtual_phone_numbers`
- `useReleaseNumber(companyId)`: invoca `telnyx-proxy` action `release_number` + update `virtual_phone_numbers`
- `useAssignNumber(companyId)`: update `assigned_to` diretto

### 3. Pagina — `src/pages/azienda/settings/SettingsPhoneNumbers.tsx`
- Lista numeri attivi con capabilities badges (SMS/Voice), utente assegnato (Select), costo mensile
- **PurchaseDialog** 3-step: filtri ricerca (paese, tipo, prefisso) → lista risultati → conferma acquisto
- Rilascio numero con AlertDialog
- Link a pagina Crediti
- Info box Telnyx

### 4. Routing & Sidebar
- **`companyRoutes.tsx`**: aggiungere lazy import + `<Route path="numeri-telefono" element={<SettingsPhoneNumbers />} />` dentro impostazioni
- **`CompanyLayout.tsx`**: aggiungere `Phone` all'import lucide e voce "Numeri Virtuali" dopo "Webhook" (riga ~484)

