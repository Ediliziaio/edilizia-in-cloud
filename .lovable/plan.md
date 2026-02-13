

# Piano: UI Super Admin Monetizzazione (senza Stripe)

## Panoramica

Costruire le pagine Super Admin per gestire piani tariffari e abbonamenti, aggiornare la dashboard con metriche MRR, e aggiungere la sezione abbonamento nel dettaglio azienda. Tutto funziona con operazioni CRUD dirette sul database, senza integrazione Stripe per ora.

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/admin/SubscriptionPlans.tsx` | Crea | CRUD piani tariffari |
| `src/pages/admin/Subscriptions.tsx` | Crea | Lista abbonamenti aziende |
| `src/components/layouts/AdminLayout.tsx` | Modifica | Aggiungere "Piani" e "Abbonamenti" alla sidebar |
| `src/App.tsx` | Modifica | Aggiungere route `/admin/piani` e `/admin/abbonamenti` |
| `src/pages/admin/AdminDashboard.tsx` | Modifica | Aggiungere riga statistiche MRR, churn, trial in scadenza |
| `src/pages/admin/CompanyDetail.tsx` | Modifica | Aggiungere card "Abbonamento" con stato, piano, storico e azioni manuali |
| `src/types/auth.ts` | Modifica | Aggiungere tipo `CompanyStatus` |

---

## Dettagli Implementazione

### 1. Tipo `CompanyStatus` (`src/types/auth.ts`)

Aggiungere:
```text
type CompanyStatus = "trial" | "active" | "suspended" | "expired"
```

Aggiornare l'interfaccia `Company` con i nuovi campi `status`, `trial_ends_at`, `subscription_plan_id`, `stripe_customer_id`.

### 2. Sidebar Admin (`AdminLayout.tsx`)

Aggiungere due voci nella sezione Navigazione:
- "Piani" con icona `CreditCard` -> `/admin/piani`
- "Abbonamenti" con icona `Receipt` -> `/admin/abbonamenti`

### 3. Pagina Piani (`SubscriptionPlans.tsx`)

**Layout**: Griglia di Card, una per piano, con dialog per creazione/modifica.

**Contenuto card piano**:
- Nome, slug, descrizione
- Prezzi (mensile/annuale)
- Limiti: max ordini, max utenti, max storage
- Features (lista jsonb)
- Badge attivo/disattivo
- Bottoni modifica e disattiva/attiva

**Dialog creazione/modifica piano**:
- Form con tutti i campi
- Campi Stripe ID (product, price monthly, price yearly) lasciati vuoti per ora, editabili quando si collegherà Stripe
- Validazione con zod

**Query**: `useQuery` su `subscription_plans` ordinati per `position`.

### 4. Pagina Abbonamenti (`Subscriptions.tsx`)

**Layout**: Tabella con tutte le aziende e il loro stato abbonamento.

**Colonne tabella**:
- Azienda (nome + logo)
- Piano attuale (join con `subscription_plans`)
- Stato (badge colorato: trial=blue, active=green, suspended=orange, expired=red)
- Scadenza trial / fine periodo
- MRR contribuito (prezzo mensile del piano)

**Filtri**: Select per stato (tutti/trial/active/suspended/expired)

**Azioni per riga** (dropdown menu):
- Cambia piano (dialog con select piano)
- Sospendi / Riattiva
- Estendi trial (+7 giorni, +14 giorni, +30 giorni)
- Ogni azione scrive un log in `subscription_logs`

### 5. Dashboard MRR (`AdminDashboard.tsx`)

Aggiungere una seconda riga di statistiche sotto quella esistente con 4 card:

| Card | Calcolo |
|------|---------|
| MRR | Somma `price_monthly` dei piani delle aziende con status = 'active' |
| Aziende in Trial | Count companies con status = 'trial' |
| Trial in Scadenza | Count companies con trial_ends_at entro 3 giorni |
| Tasso Churn | (aziende expired ultimo mese / totale attive) * 100 |

### 6. CompanyDetail - Sezione Abbonamento

Aggiungere una card "Abbonamento" nel grid delle informazioni:

**Contenuto**:
- Stato con badge colorato
- Piano attuale (o "Nessun piano")
- Scadenza trial (se in trial)
- Periodo corrente (da `company_subscriptions`)

**Azioni rapide**:
- Cambia piano (dialog)
- Sospendi / Riattiva (con conferma)
- Estendi trial (se in trial)

**Storico** (sotto le azioni):
- Lista ultimi eventi da `subscription_logs` con data, tipo evento, note
- Formato timeline verticale compatta

### 7. Route (`App.tsx`)

Aggiungere dentro il blocco `/admin`:
```text
<Route path="piani" element={<SubscriptionPlans />} />
<Route path="abbonamenti" element={<Subscriptions />} />
```

---

## Sequenza di Implementazione

1. Tipo `CompanyStatus` in `auth.ts`
2. Sidebar + Route
3. Pagina Piani (CRUD)
4. Pagina Abbonamenti (tabella + azioni)
5. Dashboard MRR (statistiche aggiuntive)
6. CompanyDetail (sezione abbonamento + storico)

