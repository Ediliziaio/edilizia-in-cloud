

# Aggiunta Filtri alla Dashboard Gestione Interna

## Situazione Attuale

La dashboard gestione interna (`CompanyDashboard.tsx`) non ha nessun filtro. Tutti i dati sono calcolati su periodi fissi (mese corrente, mese precedente, 7 giorni). La dashboard marketing ha invece un sistema di filtri con preset date, filtro utente, fonte e pipeline.

## Piano

### 1. Creare `CompanyDashboardFilters.tsx`

Nuovo componente filtri specifico per la dashboard gestione interna, con:

- **Preset date**: Oggi, Ieri, 7 giorni, 30 giorni, Mese corrente, Personalizzato (stessa logica del marketing)
- **Filtro stato ordine**: dropdown con gli stati ordine dell'azienda (dalla tabella `order_statuses`)
- **Filtro cliente**: dropdown multi-select con i clienti dell'azienda
- **Pulsante "Cancella filtri"** quando ci sono filtri attivi

Non servono filtri "fonte" e "pipeline" (sono concetti del CRM marketing).

### 2. Aggiungere state dei filtri in `CompanyDashboard.tsx`

- Aggiungere `useState` per gestire `datePreset`, `dateFrom`, `dateTo`, `statusFilter`, `customerFilter`
- Modificare la query principale per usare le date dai filtri invece dei calcoli fissi `thisMonthStart/thisMonthEnd`
- Il periodo di confronto (delta %) viene calcolato automaticamente come lo stesso intervallo temporale spostato indietro
- Passare i filtri come parametri alle query esistenti (aggiungere `.gte`/`.lte` su `created_at` e opzionalmente `.eq` su status/customer)

### 3. Inserire il componente nel layout

Posizionare `<CompanyDashboardFilters />` subito dopo l'header e prima della CEO Strip, come nella dashboard marketing.

### File

| Azione | File |
|--------|------|
| Creare | `src/components/dashboard/CompanyDashboardFilters.tsx` |
| Modificare | `src/pages/azienda/CompanyDashboard.tsx` |

Nessuna migrazione DB necessaria. Tutti i dati sono gia' disponibili nelle tabelle esistenti.

