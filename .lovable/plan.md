

# Criticita' attive nel sistema

Le criticita' precedenti (role priority, effectiveCompany, RPC rotta, AdminPulseBar) sono state risolte. Ecco le criticita' **attualmente attive**:

---

## 1. SICUREZZA -- Dati sensibili esposti ad utenti anonimi (CRITICA)

### 1.1 Appointments: dati privati visibili a tutti
La policy RLS `Public can check appointment slots` sulla tabella `appointments` espone **tutte le colonne** (note interne, coordinate GPS, indirizzo completo, contact_id) a utenti anonimi. Dovrebbe esporre solo i campi necessari per la disponibilita' slot.

**Fix**: Creare una VIEW `public_appointment_slots` che espone solo `appointment_date`, `appointment_time`, `appointment_end_time`, `is_blocked_slot`, `calendar_id`, e aggiornare la policy per usare la view oppure restringere la policy anon SELECT.

### 1.2 Quote Items: accesso senza token di firma
La policy `qi_anon_sel` su `quote_items` consente a utenti anonimi di leggere tutte le righe preventivo senza verificare il possesso del `signature_token` (a differenza della tabella `quotes` che lo verifica via header `x-quote-token`).

**Fix**: Aggiungere alla policy la condizione di verifica del token:
```sql
AND EXISTS (
  SELECT 1 FROM quotes q 
  WHERE q.id = quote_items.quote_id 
  AND q.signature_token = (current_setting('request.header.x-quote-token', true))::uuid
)
```

### 1.3 Billing Integrations: token OAuth leggibili da tutto lo staff
La policy su `billing_integrations` consente a qualsiasi membro dell'azienda (anche staff operativo) di leggere `access_token`, `refresh_token` e `api_key` dei provider di fatturazione.

**Fix**: Restringere la SELECT policy ai soli `company_admin` o `super_admin`.

---

## 2. SICUREZZA -- Configurazione Auth (MEDIA)

### 2.1 Leaked Password Protection disabilitata
La protezione contro password compromesse (presenti in data breach noti) e' disattivata. Utenti possono registrarsi con password gia' compromesse.

**Fix**: Abilitare tramite configurazione auth.

---

## 3. UI -- Warning Console (BASSA)

### 3.1 forwardRef su DealHealthBadge
Il componente `Tooltip` (da Radix) viene usato come child diretto in contesti che passano un ref. Il `DealHealthBadge` wrappa un `Tooltip` al livello piu' esterno ma non forwarda il ref.

**Fix**: Wrappare il componente con `forwardRef` o aggiungere un `<div>` container.

---

## Riepilogo

| # | Criticita' | Problema | Effort |
|---|-----------|----------|--------|
| 1 | **CRITICA** | Appointments espone GPS, note interne ad anonimi | Basso (SQL) |
| 2 | **ALTA** | Quote items leggibili senza token | Basso (SQL) |
| 3 | **ALTA** | Token OAuth billing leggibili da staff | Basso (SQL) |
| 4 | **MEDIA** | Leaked password protection disabilitata | Basso (config) |
| 5 | **BASSA** | forwardRef warning DealHealthBadge | Basso (TSX) |

### Implementazione proposta

1. **Migration SQL**: Restringere la policy anon su `appointments` a sole colonne necessarie, aggiungere verifica token su `quote_items`, restringere `billing_integrations` a admin
2. **Config Auth**: Abilitare leaked password protection
3. **DealHealthBadge.tsx**: Aggiungere forwardRef o div wrapper

