

## Piano: SALES-REP-01 — Adattato al Codebase Esistente

### Adattamenti chiave rispetto al prompt originale

Il prompt originale assume tabelle `venditori`, `ordini`, `preventivi` che NON esistono. Il codebase usa:
- `salespeople` (gia esistente, con `first_name`, `last_name`, `commission_type/value`, `company_id`)
- `orders` + `order_salespeople` (junction table per ordini↔venditori)
- `quotes` (preventivi CRM)
- `documenti_fiscali` (fatturazione nativa)
- `useEffectiveCompanyId()` per il company scoping

### 1. Migration: Estendere schema esistente

**a) Aggiungere colonne mancanti a `salespeople`:**
- `area_geografica TEXT`
- `zona TEXT`
- `data_inizio DATE`
- `avatar_url TEXT`

**b) Creare `obiettivi_venditori`** (referenzia `salespeople.id`, non `venditori.id`):
- Stessa struttura del prompt ma con FK → `salespeople(id)`
- RLS con `get_my_company_id()` + bypass super_admin (standard del progetto)

**c) Creare `attivita_venditori`** (referenzia `salespeople.id`):
- FK verso `salespeople`, `anagrafiche_native`, `quotes`, `orders`
- RLS con `get_my_company_id()` + bypass super_admin

**d) Aggiungere `salesperson_id` a `quotes` e `documenti_fiscali`** (condizionale IF NOT EXISTS):
- `orders` gia collegata via `order_salespeople`, non serve FK diretta

**e) Indici e RLS** come da prompt, adattati ai nomi tabella reali.

**f) View `performance_base_venditori`**: adattata a `salespeople`, `quotes`, `orders`/`order_salespeople`, con colonne reali (`first_name`/`last_name` invece di `nome`/`cognome`, `status` invece di `stato`, ecc.)

### 2. Tab nella Reportistica esistente

Aggiungere **"Report sui venditori"** come nuova tab nella `ReportisticaPage.tsx` esistente:
- Aggiungere `{ key: "venditori", label: "Report sui venditori" }` all'array TABS
- Aggiungere `TabsContent` con componente placeholder (per SALES-REP-02+)

### 3. Hook `useVenditori.ts`

Creare hook usando `salespeople` (non `venditori`):
- `useVenditori()` → lista venditori attivi
- `usePerformanceBaseVenditori()` → dalla view
- `useVenditore(id)` → singolo venditore
- Tutti con `useEffectiveCompanyId()` come standard progetto

### File da modificare/creare

| File | Azione |
|---|---|
| Nuova migration SQL | Estende `salespeople`, crea `obiettivi_venditori` + `attivita_venditori`, aggiunge FK, crea view |
| `src/pages/azienda/ReportisticaPage.tsx` | Aggiunge tab "Report sui venditori" |
| `src/hooks/useVenditori.ts` | Nuovo hook per venditori e performance |

