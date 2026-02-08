
# Piano: Gestione Utenti nelle Impostazioni + Sistema Venditori

## Panoramica

Questo piano implementa tre funzionalita principali:
1. **Spostare la gestione utenti nelle Impostazioni** - Tab "Utenti" in Settings per admin azienda
2. **Sistema Venditori completo** - Nuovo ruolo con tracciamento provvigioni e accesso al sistema
3. **Aggiornamento calcoli finanziari** - Integrare i costi dei venditori nel margine e nel flusso di cassa

---

## 1. Nuove Tabelle Database

### Tabella `salespeople` (Venditori)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | UUID | Chiave primaria |
| company_id | UUID | FK a companies |
| user_id | UUID | FK a auth.users (opzionale, per accesso) |
| first_name | TEXT | Nome |
| last_name | TEXT | Cognome |
| email | TEXT | Email contatto |
| phone | TEXT | Telefono |
| commission_type | TEXT | 'fixed', 'percentage_sold', 'percentage_collected' |
| commission_value | NUMERIC | Valore fisso o percentuale |
| is_active | BOOLEAN | Default true |

### Tabella `order_salespeople` (Provvigioni Ordine)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | UUID | Chiave primaria |
| order_id | UUID | FK a orders |
| salesperson_id | UUID | FK a salespeople |
| commission_type | TEXT | Override tipo per singolo ordine |
| commission_value | NUMERIC | Override valore |
| commission_amount | NUMERIC | Importo calcolato |
| is_paid | BOOLEAN | Se la provvigione e stata pagata |
| paid_date | DATE | Data pagamento |
| payment_expected_date | DATE | Data prevista |

---

## 2. Nuovo Ruolo: `salesperson`

Aggiunta all'enum `app_role` del valore 'salesperson' per permettere ai venditori di:
- Accedere alla propria dashboard
- Visualizzare i propri ordini
- Monitorare i propri guadagni

---

## 3. Modifiche alle Impostazioni

### Settings.tsx (Azienda)

Aggiunta di due nuovi tab:

| Tab | Contenuto |
|-----|-----------|
| **Utenti** | Gestione staff aziendali (spostato da pagina separata) |
| **Venditori** | CRUD venditori con configurazione provvigioni |

La struttura finale sara:
```
[Profilo] [Stati Ordine] [Fornitori] [Utenti] [Venditori] [Sicurezza]
```

### AdminSettings.tsx (Super Admin)

Aggiunta sezione per gestire utenti Super Admin aggiuntivi se necessario.

---

## 4. Gestione Venditori

### Componente SalespeopleConfig

- Lista venditori con nome, tipo provvigione, valore
- Dialog per creare/modificare venditore
- Possibilita di creare account accesso per il venditore
- Attivazione/disattivazione venditori

### Tipi di Provvigione

| Tipo | Descrizione |
|------|-------------|
| **Fisso** | Importo fisso per ordine (es. €500) |
| **% sul venduto** | Percentuale sull'imponibile dell'ordine |
| **% sull'incassato** | Percentuale sull'imponibile effettivamente incassato |

---

## 5. Integrazione Ordini

### Modifica Form Ordine (CreateOrder, EditOrder)

- Nuovo campo opzionale "Venditore"
- Select con lista venditori attivi
- Possibilita di override tipo/valore provvigione per singolo ordine
- Calcolo automatico provvigione in base al tipo

### Modifica OrderDetail

- Nuova sezione "Provvigioni" che mostra:
  - Venditore associato
  - Tipo e valore provvigione
  - Importo calcolato
  - Stato pagamento

---

## 6. Aggiornamento OrderEconomics

Aggiunta sezione "PROVVIGIONI VENDITORI" nel calcolo del margine:

```
VENDITA
- Imponibile: €X
- IVA: €Y
- Totale con IVA: €Z

COSTI ARTICOLI
- [dettagli esistenti]

COSTI MANODOPERA
- [dettagli esistenti]

PROVVIGIONI VENDITORI (NUOVO)
- Mario Rossi (3% sul venduto): €XXX
- Totale Provvigioni: €XXX

MARGINE
- Imponibile vendita: €X
- Costi netti totali: €Y (include ora provvigioni)
- Margine Lordo: €Z
```

---

## 7. Aggiornamento CashFlowForecast

Nuova sezione "Provvigioni da Pagare":

```
USCITE
- Squadre Esterne: €XXX
- Materiali in Sospeso: €XXX
- Provvigioni da Pagare: €XXX (NUOVO)

PROVVIGIONI DA PAGARE (NUOVA SEZIONE)
- Mario Rossi: €500 (scadenza: 28/02/2026)
- Luca Verdi: €750 (scadenza: 15/03/2026)
- Totale: €1.250
```

---

## 8. Area Venditore

### Nuove Pagine

| Pagina | Route | Descrizione |
|--------|-------|-------------|
| SalespersonDashboard | /venditore | Dashboard con KPI |
| MyOrders | /venditore/ordini | Lista ordini assegnati |
| MyEarnings | /venditore/guadagni | Dettaglio provvigioni |
| SalespersonProfile | /venditore/profilo | Profilo personale |

### Dashboard Venditore

- Ordini totali / Questo mese
- Venduto totale / Questo mese
- Provvigioni maturate / Provvigioni pagate
- Grafico trend mensile

---

## 9. File da Creare

| File | Descrizione |
|------|-------------|
| `src/components/settings/UsersConfig.tsx` | Gestione utenti staff in impostazioni |
| `src/components/settings/SalespeopleConfig.tsx` | Gestione venditori |
| `src/components/salespeople/SalespersonDialog.tsx` | Dialog CRUD venditore |
| `src/components/salespeople/SalespersonSelect.tsx` | Select venditore per ordini |
| `src/components/orders/OrderCommissions.tsx` | Sezione provvigioni in OrderDetail |
| `src/pages/venditore/SalespersonDashboard.tsx` | Dashboard venditore |
| `src/pages/venditore/MyOrders.tsx` | Ordini del venditore |
| `src/pages/venditore/MyEarnings.tsx` | Guadagni venditore |
| `src/pages/venditore/SalespersonProfile.tsx` | Profilo venditore |
| `src/components/layouts/SalespersonLayout.tsx` | Layout area venditore |
| `supabase/functions/create-salesperson-user/index.ts` | Edge function per account venditore |

---

## 10. File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/Settings.tsx` | Aggiungere tab Utenti e Venditori |
| `src/pages/admin/AdminSettings.tsx` | Usare layout a tab |
| `src/pages/azienda/CreateOrder.tsx` | Aggiungere campo venditore |
| `src/pages/azienda/EditOrder.tsx` | Aggiungere campo venditore |
| `src/pages/azienda/OrderDetail.tsx` | Mostrare provvigioni |
| `src/components/orders/OrderEconomics.tsx` | Includere provvigioni nel margine |
| `src/pages/azienda/CashFlowForecast.tsx` | Sezione provvigioni da pagare |
| `src/types/auth.ts` | Aggiungere tipo 'salesperson' |
| `src/App.tsx` | Rotte area venditore |
| `src/components/auth/RoleBasedRedirect.tsx` | Redirect venditore |

---

## 11. Logica Calcolo Provvigioni

### Tipo: Fisso
```
commission_amount = commission_value
```

### Tipo: % sul Venduto
```
commission_amount = imponibile_ordine * (commission_value / 100)
```

### Tipo: % sull'Incassato
```
imponibile_incassato = (depositi_pagati + saldo_pagato) / (1 + IVA%)
commission_amount = imponibile_incassato * (commission_value / 100)
```

---

## 12. Fasi di Implementazione

### Fase 1 - Database
1. Creare migration con nuove tabelle salespeople e order_salespeople
2. Aggiungere ruolo salesperson all'enum
3. Configurare RLS policies

### Fase 2 - Gestione nelle Impostazioni
1. Creare UsersConfig (estraendo logica da CompanyUsers)
2. Creare SalespeopleConfig
3. Aggiornare Settings.tsx con nuovi tab

### Fase 3 - Integrazione Ordini
1. Creare SalespersonSelect
2. Aggiornare CreateOrder e EditOrder
3. Creare OrderCommissions per OrderDetail

### Fase 4 - Calcoli Finanziari
1. Aggiornare OrderEconomics
2. Aggiornare CashFlowForecast

### Fase 5 - Area Venditore
1. Creare layout e pagine
2. Aggiungere rotte in App.tsx
3. Creare edge function per account venditore
