

# Analisi e Miglioramenti — Modulo Preventivi + Integrazione Contatti

## Problemi Trovati

### 1. QuoteBuilder non legge `?contact_id` dalla URL (BUG)
Il pannello `ContactQuotesPanel` nella scheda contatto naviga a `/preventivi/nuovo?contact_id=xxx`, ma `QuoteBuilder` non legge mai questo parametro. Il contatto non viene pre-selezionato.

### 2. Contact selection incompleta — campi mancanti
Quando si seleziona un contatto, `handleContactSelect` copia solo `first_name`, `last_name`, `email`, `phone`, `company_name`. **Non copia**: `address`, `city`, `province`, `postal_code`, `country`. L'indirizzo del preventivo resta sempre vuoto.

### 3. Nessun campo CF / P.IVA su `marketing_contacts`
La tabella `marketing_contacts` non ha campi `fiscal_code` e `vat_number`. Il preventivo li ha (`client_fiscal_code`, `client_vat_number`) ma non c'è modo di pre-popolarli dal contatto. Servono come custom fields o colonne dedicate.

### 4. QuoteDetail — nessun link al contatto
Il tab "Cliente" mostra dati statici, ma non ha un link per navigare al contatto CRM collegato. Se `contact_id` esiste, dovrebbe essere cliccabile.

### 5. Attività mancante nel CRM
Quando un preventivo viene inviato/accettato/rifiutato, non viene creata un'attività nella timeline del contatto (`marketing_contact_activities`). Il CRM non sa nulla dei preventivi.

### 6. Lista Preventivi — nessun filtro per contatto
`Preventivi.tsx` non ha un modo per filtrare per contatto specifico, utile per drill-down dal CRM.

---

## Piano di Implementazione

### A. Migrazione DB — aggiungere CF/P.IVA ai contatti + trigger attività
- Aggiungere colonne `fiscal_code` e `vat_number` a `marketing_contacts`
- Creare trigger: quando `quotes.status` cambia → inserire riga in `marketing_contact_activities` (tipo `quote_sent`, `quote_accepted`, `quote_refused`)

### B. QuoteBuilder — integrazione contatti completa
1. Leggere `?contact_id` da `useSearchParams` e auto-selezionare il contatto
2. Espandere la select dei contatti per caricare anche `address, city, province, postal_code, country, fiscal_code, vat_number` (dopo migration)
3. `handleContactSelect`: popolare anche `clientAddress` (composizione di address+city+province+CAP), `clientFiscalCode`, `clientVatNumber`

### C. QuoteDetail — link al contatto CRM
- Nel tab "Cliente", se `quote.contact_id` esiste, mostrare un bottone "Vedi nel CRM" che naviga a `/azienda/marketing/contatti/:contact_id`

### D. Trigger DB — log attività preventivi sulla timeline del contatto
- `quote_sent` → quando status passa a `inviata`
- `quote_accepted` → quando status passa ad `accettata`
- `quote_refused` → quando status passa a `rifiutata`
- Questi eventi appariranno nella `UnifiedContactTimeline` del contatto

### Riepilogo file modificati
| File | Modifica |
|------|----------|
| Migration SQL | 2 colonne + 1 trigger |
| `QuoteBuilder.tsx` | `useSearchParams`, select ampliata, auto-fill completo |
| `QuoteDetail.tsx` | Link "Vedi nel CRM" |

