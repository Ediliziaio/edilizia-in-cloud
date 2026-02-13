

# Piano: Miglioramento Completo Tab Dettaglio Azienda

## Panoramica

Aggiungere i campi anagrafici mancanti alla tabella `companies` e migliorare tutte le tab del dettaglio azienda con un design professionale da gestionale SaaS.

---

## 1. Nuovi Campi Database (Migrazione SQL)

Aggiungere alla tabella `companies` i seguenti campi:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `business_name` | text | Ragione sociale |
| `vat_number` | text | Partita IVA |
| `fiscal_code` | text | Codice Fiscale |
| `phone` | text | Telefono aziendale |
| `pec` | text | PEC (posta certificata) |
| `sdi_code` | text | Codice SDI (fatturazione elettronica) |
| `legal_address` | text | Indirizzo sede legale |
| `legal_city` | text | Citta sede legale |
| `legal_province` | text | Provincia (sigla) |
| `legal_postal_code` | text | CAP |
| `operational_address` | text | Indirizzo sede operativa |
| `operational_city` | text | Citta operativa |
| `operational_province` | text | Provincia operativa |
| `operational_postal_code` | text | CAP operativo |
| `website` | text | Sito web |
| `notes` | text | Note interne Super Admin |

Tutti nullable, nessun impatto sui dati esistenti.

---

## 2. Tab "Dettagli di base" - Layout Professionale

Layout a 2 colonne (2/3 + 1/3):

**Colonna sinistra** - Form organizzato in 3 sezioni con separatori:

*Sezione 1 - "Identificazione"*
- Ragione sociale (`business_name`)
- Nome commerciale (`name`)
- Email, Telefono
- Settore (select)

*Sezione 2 - "Dati Fiscali"*
- Partita IVA, Codice Fiscale
- PEC, Codice SDI
- Sito web

*Sezione 3 - "Sede Legale"*
- Indirizzo, CAP, Citta, Provincia

*Sezione 4 - "Sede Operativa"* (con checkbox "uguale alla sede legale")
- Indirizzo, CAP, Citta, Provincia

*Sezione 5 - "Note interne"*
- Textarea per annotazioni del Super Admin

Bottone "Salva Modifiche" sticky in basso.

**Colonna destra** - Card riepilogo (gia presente, migliorata):
- Logo o placeholder
- Nome + ragione sociale
- Badge stato e settore
- Piano attuale
- Date importanti (creazione, aggiornamento, scadenza trial)
- Contatori rapidi (ordini, clienti, team)

---

## 3. Tab "SaaS" - Miglioramenti

Aggiungere:
- Card "Storage" con spazio usato (basato su `max_storage_mb` del piano)
- Sezione "Limiti piano" piu visiva con icone e numeri grandi
- Confronto visivo tra piano attuale e piani superiori (upsell info)
- Separare "Moduli inclusi" con icone piu grandi e descrizione per ogni modulo

---

## 4. Tab "Abbonamento" - Miglioramenti

- Aggiungere ID Stripe customer se presente
- Aggiungere data inizio abbonamento corrente (da `company_subscriptions`)
- Timeline storico piu ricca con icone per tipo evento
- Card con dati fatturazione (ragione sociale + P.IVA dal tab dettagli, mostrati in sola lettura)

---

## 5. Tab "Attivita" - Miglioramenti

- Aggiungere card "Valore medio ordine" (ordersValue / ordersCount)
- Aggiungere card "Team" con conteggio per ruolo
- Aggiungere sezione "Ultimi ordini" (lista degli ultimi 5 ordini con stato)
- Aggiungere sezione "Ultimi ticket" (lista degli ultimi 5 ticket)

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione SQL | Crea | Aggiungere campi anagrafici a `companies` |
| `src/pages/admin/CompanyDetail.tsx` | Riscrivere | Tutti i miglioramenti alle 4 tab + tab Team |
| `src/types/auth.ts` | Modifica | Aggiornare interfaccia `Company` con nuovi campi |

---

## Dettagli Tecnici

### Migrazione SQL

```text
ALTER TABLE companies
  ADD COLUMN business_name text,
  ADD COLUMN vat_number text,
  ADD COLUMN fiscal_code text,
  ADD COLUMN phone text,
  ADD COLUMN pec text,
  ADD COLUMN sdi_code text,
  ADD COLUMN legal_address text,
  ADD COLUMN legal_city text,
  ADD COLUMN legal_province text,
  ADD COLUMN legal_postal_code text,
  ADD COLUMN operational_address text,
  ADD COLUMN operational_city text,
  ADD COLUMN operational_province text,
  ADD COLUMN operational_postal_code text,
  ADD COLUMN website text,
  ADD COLUMN notes text;
```

### Form Schema aggiornato

```text
formSchema = z.object({
  name: z.string().min(2),
  business_name: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  sector: z.enum([...]),
  vat_number: z.string().optional(),
  fiscal_code: z.string().optional(),
  pec: z.string().optional(),
  sdi_code: z.string().optional(),
  legal_address: z.string().optional(),
  legal_city: z.string().optional(),
  legal_province: z.string().optional(),
  legal_postal_code: z.string().optional(),
  operational_address: z.string().optional(),
  operational_city: z.string().optional(),
  operational_province: z.string().optional(),
  operational_postal_code: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
})
```

### Tab Attivita - Query aggiuntive

```text
-- Ultimi 5 ordini
SELECT id, description, total_amount, created_at, current_status_id
FROM orders WHERE company_id = :id
ORDER BY created_at DESC LIMIT 5

-- Ultimi 5 ticket
SELECT id, subject, status, created_at
FROM tickets WHERE company_id = :id
ORDER BY created_at DESC LIMIT 5
```

### Interfaccia Company aggiornata

Aggiungere i nuovi campi opzionali (tutti `string | null`) all'interfaccia `Company` in `src/types/auth.ts`.

