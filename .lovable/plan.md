
# Piano: Elimina Cliente + Storico Ordini + Anagrafica Azienda

## 1. Eliminazione cliente dalla pagina dettaglio

Aggiungere un pulsante "Elimina Cliente" con conferma tramite AlertDialog nella pagina `CompanyCustomerDetail.tsx`.

**Logica**:
- Verificare che il cliente non abbia ordini associati prima di eliminare
- Se ha ordini, mostrare un messaggio di errore e bloccare l'eliminazione
- Se non ha ordini, eliminare il profilo e l'utente associato (tramite `supabase.from("profiles").delete()`)
- Dopo l'eliminazione, redirect a `/azienda/clienti`

**File**: `src/pages/azienda/CompanyCustomerDetail.tsx`

---

## 2. Storico ordini nella pagina dettaglio cliente

Aggiungere una sezione sotto il form di modifica che mostra la lista degli ordini del cliente con:
- Codice ordine
- Descrizione
- Stato corrente (con pallino colorato)
- Data creazione
- Importo totale
- Link per navigare al dettaglio ordine

**Query**: `supabase.from("orders").select("id, order_code, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color)").eq("customer_id", id)`

**File**: `src/pages/azienda/CompanyCustomerDetail.tsx`

---

## 3. Anagrafica completa nel Profilo Azienda (Impostazioni)

La tabella `companies` ha gia tutti i campi necessari. Serve solo il form di modifica.

### 3a. Nuova RLS policy per UPDATE

Attualmente i company_admin possono solo leggere la propria azienda (SELECT). Serve una policy per UPDATE:

```text
CREATE POLICY "Company admins can update their own company"
ON public.companies FOR UPDATE
USING (id = get_user_company_id(auth.uid()))
WITH CHECK (id = get_user_company_id(auth.uid()));
```

### 3b. Nuovo componente `CompanyProfileForm`

Creare `src/components/settings/CompanyProfileForm.tsx` con form editabile per:

**Dati Generali**:
- Nome azienda (read-only, informativo)
- Email azienda (read-only)
- Ragione Sociale (`business_name`)
- Settore (read-only, informativo)

**Dati Fiscali**:
- P.IVA (`vat_number`)
- Codice Fiscale (`fiscal_code`)
- PEC (`pec`)
- Codice SDI (`sdi_code`)

**Contatti**:
- Telefono (`phone`)
- Sito Web (`website`)

**Sede Legale**:
- Indirizzo (`legal_address`)
- Citta (`legal_city`)
- Provincia (`legal_province`)
- CAP (`legal_postal_code`)

**Sede Operativa** (con checkbox "Uguale alla sede legale"):
- Indirizzo (`operational_address`)
- Citta (`operational_city`)
- Provincia (`operational_province`)
- CAP (`operational_postal_code`)

**Note**:
- Note interne (`notes`)

### 3c. Aggiornamento Settings.tsx

Sostituire il contenuto attuale del tab "Profilo" (che mostra solo logo + nome) con:
- Il `LogoUploader` esistente
- Il nuovo `CompanyProfileForm` sotto

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/CompanyCustomerDetail.tsx` | Pulsante elimina + storico ordini |
| `src/components/settings/CompanyProfileForm.tsx` | Nuovo componente form anagrafica azienda |
| `src/pages/azienda/Settings.tsx` | Integrare CompanyProfileForm nel tab Profilo |
| **Migrazione DB** | Policy UPDATE per company_admins su companies |
