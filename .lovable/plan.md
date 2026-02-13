
# Piano: Progress Bar Mobile + Campi Aggiuntivi Creazione Cliente

## 1. Progress Bar nella vista Settimana mobile

Aggiungere la barra di capacita anche nella sezione mobile (layout collassabile) della vista Settimana.

**File**: `src/components/calendar/CalendarWeekView.tsx`

- Nel blocco mobile `Collapsible`, aggiungere `<Progress>` sotto il badge lavori, nello stesso modo in cui e stato fatto per la versione desktop.

---

## 2. Nuovi campi per la creazione cliente

I nuovi campi richiesti:
- **Codice Fiscale / P.IVA** (campo unico con label "CF / P.IVA")
- **Indirizzo di residenza/sede legale** (gia esiste come `address`, rinominare la label)
- **Indirizzo cantiere** (nuovo campo)
- **Note aggiuntive** (nuovo campo)

### 2a. Migrazione database - Nuove colonne su `profiles`

Aggiungere 3 nuove colonne alla tabella `profiles`:

```text
ALTER TABLE public.profiles
  ADD COLUMN fiscal_code text,
  ADD COLUMN site_address text,
  ADD COLUMN notes text;
```

La colonna `address` esistente verra usata come "Indirizzo residenza/sede legale".

### 2b. Edge Function `create-customer`

**File**: `supabase/functions/create-customer/index.ts`

- Accettare i nuovi campi dal body: `fiscal_code`, `site_address`, `notes`
- Inserirli nella creazione del profilo

### 2c. Form `CreateCustomer.tsx`

**File**: `src/pages/azienda/CreateCustomer.tsx`

- Aggiungere stati: `fiscalCode`, `siteAddress`, `notes`
- Aggiungere campi nel form:
  - **CF / P.IVA**: Input di testo, placeholder "RSSMRA80A01H501U o 01234567890"
  - **Indirizzo residenza/sede legale**: rinominare la label dell'attuale campo `address`
  - **Indirizzo cantiere**: Textarea, placeholder "Via del Cantiere 5, 00100 Roma"
  - **Note aggiuntive**: Textarea, placeholder "Note interne sul cliente..."
- Inviare i nuovi campi nella chiamata alla edge function
- Organizzare il form in sezioni logiche con separatori

### 2d. Profilo cliente `CustomerProfile.tsx`

**File**: `src/pages/cliente/CustomerProfile.tsx`

- Aggiungere campi per visualizzare/modificare fiscal_code, site_address, notes

### 2e. Tipo Profile

**File**: `src/types/auth.ts`

- Aggiungere all'interfaccia `Profile`: `fiscal_code`, `site_address`, `notes`

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/components/calendar/CalendarWeekView.tsx` | Progress bar nella sezione mobile |
| `src/types/auth.ts` | Nuovi campi nel tipo Profile |
| `src/pages/azienda/CreateCustomer.tsx` | Nuovi campi nel form (CF/P.IVA, indirizzo cantiere, note) |
| `src/pages/cliente/CustomerProfile.tsx` | Nuovi campi nel profilo cliente |
| `supabase/functions/create-customer/index.ts` | Accettare e salvare i nuovi campi |
| **Migrazione DB** | 3 nuove colonne su `profiles` |

Nessun impatto su RLS: le policy esistenti su `profiles` coprono gia i nuovi campi.
