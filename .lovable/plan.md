

# Piano: Campi Anagrafici in CreateCompany + Estrazione Costanti DRY

## 1. Nuovo file condiviso `src/lib/companyUtils.ts`

Estrarre da `CompaniesList.tsx` e `CompanyDetail.tsx` le costanti duplicate:

- `sectorLabels` (Record string -> string)
- `statusConfig` (Record CompanyStatus -> label + variant)
- `sectors` (array value/label per i Select)

Queste costanti verranno importate nei 3 file che le usano: `CompaniesList`, `CompanyDetail`, `CreateCompany`.

---

## 2. Campi anagrafici in `CreateCompany.tsx`

Aggiungere al form di creazione le sezioni anagrafiche (tutti opzionali, come nel dettaglio):

**Sezione "Dati Fiscali"** (dopo Settore):
- Ragione sociale (`business_name`)
- Partita IVA (`vat_number`)
- Codice Fiscale (`fiscal_code`)
- PEC (`pec`)
- Codice SDI (`sdi_code`)
- Telefono (`phone`)
- Sito web (`website`)

**Sezione "Sede Legale"**:
- Indirizzo, CAP, Citta, Provincia

**Sezione "Sede Operativa"** (con checkbox "uguale alla sede legale"):
- Indirizzo, CAP, Citta, Provincia

I nuovi campi vanno passati alla edge function `create-company`, che li inserira nel record aziendale.

---

## 3. Aggiornamento Edge Function `create-company`

La edge function attualmente inserisce solo `name`, `email`, `sector`, `logo_url`. Va aggiornata per accettare e salvare i nuovi campi opzionali:
- `businessName`, `vatNumber`, `fiscalCode`, `phone`, `pec`, `sdiCode`, `website`
- `legalAddress`, `legalCity`, `legalProvince`, `legalPostalCode`
- `operationalAddress`, `operationalCity`, `operationalProvince`, `operationalPostalCode`

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/lib/companyUtils.ts` | Crea | Costanti condivise (sectorLabels, statusConfig, sectors) |
| `src/pages/admin/CreateCompany.tsx` | Modifica | Aggiungere form anagrafici + importare da companyUtils |
| `src/pages/admin/CompaniesList.tsx` | Modifica | Rimuovere costanti duplicate, importare da companyUtils |
| `src/pages/admin/CompanyDetail.tsx` | Modifica | Rimuovere costanti duplicate, importare da companyUtils |
| `supabase/functions/create-company/index.ts` | Modifica | Accettare e salvare i nuovi campi anagrafici |

Nessuna migrazione DB necessaria: i campi esistono gia nella tabella `companies`.

---

## Dettagli Tecnici

### companyUtils.ts

```text
export const sectorLabels = { serramenti: "Serramenti", ... }
export const sectors = [{ value: "serramenti", label: "Serramenti" }, ...]
export const statusConfig = { trial: { label: "Trial", variant: "outline" }, ... }
```

### CreateCompany - Schema aggiornato

Aggiungere al `formSchema` tutti i campi opzionali con `.optional().or(z.literal(""))`, stesso pattern usato in `CompanyDetail`.

### Edge Function - Insert aggiornato

```text
.insert({
  name: companyName,
  email: companyEmail,
  sector,
  logo_url: logoUrl || null,
  business_name: businessName || null,
  vat_number: vatNumber || null,
  fiscal_code: fiscalCode || null,
  phone: phone || null,
  pec: pec || null,
  sdi_code: sdiCode || null,
  website: website || null,
  legal_address: legalAddress || null,
  legal_city: legalCity || null,
  legal_province: legalProvince || null,
  legal_postal_code: legalPostalCode || null,
  operational_address: operationalAddress || null,
  operational_city: operationalCity || null,
  operational_province: operationalProvince || null,
  operational_postal_code: operationalPostalCode || null,
})
```

