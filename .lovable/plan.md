

# Audit Sezioni Rimanenti: Automazioni, Calendari Marketing, Utenti, Catalogo, Profilo Azienda

## Componenti analizzati
- `AutomationsConfig.tsx` + `AutomationDialog.tsx`
- `MarketingCalendarsConfig.tsx` + `CalendarDialog.tsx`
- `UsersConfig.tsx`
- `ArticleCatalog.tsx`
- `CompanyProfileForm.tsx`
- `PersonalProfileForm.tsx`, `ChangePasswordForm.tsx`

---

## Bug e Problemi

### 1. AutomationsConfig: toggle/delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/AutomationsConfig.tsx`
- Toggle (riga 53): `.eq("id", id)` senza `company_id`
- Delete (riga 66): `.eq("id", id)` senza `company_id`

**Fix**: Aggiungere `.eq("company_id", effectiveCompany!.id)` a entrambe le mutazioni.

### 2. AutomationDialog: update senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/AutomationDialog.tsx` (riga 171)
L'update filtra solo per `.eq("id", form.id)`.

**Fix**: Aggiungere `.eq("company_id", effectiveCompany!.id)`.

### 3. AutomationDialog: manca `maxLength` sugli input (P1)
**File**: `src/components/settings/AutomationDialog.tsx`
- Nome automazione (riga 200): nessun limite
- Descrizione (riga 204): nessun limite
- Valore condizione (riga 299): nessun limite

**Fix**: `maxLength={100}` su nome, `maxLength={500}` su descrizione, `maxLength={200}` su valore condizione.

### 4. MarketingCalendarsConfig: update/toggle/delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/MarketingCalendarsConfig.tsx`
- Update (riga 193): `.eq("id", id)` senza `company_id`
- Toggle (riga 206): `.eq("id", id)` senza `company_id`
- Delete (riga 216): `.eq("id", id)` senza `company_id`

**Fix**: Aggiungere `.eq("company_id", effectiveCompanyId!)` a tutte e tre.

### 5. UsersConfig: `useToast` invece di `sonner` (P1)
**File**: `src/components/settings/UsersConfig.tsx` (righe 6, 174, 295-298, 302-306, 323, 326)

**Fix**: Migrare a `import { toast } from "sonner"`.

### 6. CompanyProfileForm: `useToast` invece di `sonner` (P1)
**File**: `src/components/settings/CompanyProfileForm.tsx` (riga 5, 27)

**Fix**: Migrare a `import { toast } from "sonner"`. Serve leggere il file completo per trovare tutte le chiamate toast.

---

## Componenti OK (nessun intervento necessario)

- `ArticleCatalog.tsx`: usa `sonner`, ha `company_id` su update/delete, ha `maxLength` su input principali
- `PersonalProfileForm.tsx`: usa `sonner`
- `ChangePasswordForm.tsx`: usa `sonner`
- `AutomationsConfig.tsx`: usa `sonner`, query filtrate per `company_id`
- `AutomationDialog.tsx`: usa `sonner`
- `MarketingCalendarsConfig.tsx`: usa `sonner`, query filtrate per `company_id`

---

## File da modificare

| File | Intervento |
|------|-----------|
| `AutomationsConfig.tsx` | company_id su toggle/delete |
| `AutomationDialog.tsx` | company_id su update + maxLength |
| `MarketingCalendarsConfig.tsx` | company_id su update/toggle/delete |
| `UsersConfig.tsx` | sonner |
| `CompanyProfileForm.tsx` | sonner |

