

# Tab "Marginalita" -- Dashboard Decisionale per l'Imprenditore

## Panoramica

Nuova tab nella pagina Previsionale Cassa, posizionata dopo "Incassato", che offre una vista completa sulla marginalita aziendale: per commessa, media, copertura costi fissi, break-even e alert intelligenti con simulatore strategico.

## Dati Necessari

La tab richiede dati che il hook `useCashFlowData` attualmente non fornisce (es. total_amount per ordine, order_items con purchase_price, order_external_teams, order_salespeople raggruppati per ordine). Serve un nuovo hook dedicato.

### Nuovo hook: `src/hooks/useMarginData.ts`

Query Supabase necessarie:

1. **Ordini con dettagli finanziari** -- dalla tabella `orders`:
   - `id, order_code, total_amount, vat_rate, description`
   - Join su `profiles` per nome cliente
   - Join su `order_salespeople` con `salespeople` per provvigioni
   
2. **Costi articoli per ordine** -- dalla tabella `order_items`:
   - `purchase_price, quantity, vat_rate` raggruppati per `order_id`
   
3. **Squadre esterne per ordine** -- dalla tabella `order_external_teams`:
   - `total_cost, vat_rate` raggruppati per `order_id`

4. **Provvigioni per ordine** -- dalla tabella `order_salespeople`:
   - `commission_type, commission_value, deduction_amount` con join su `salespeople`

5. **Costi fissi aziendali** -- dalla tabella `company_costs`:
   - Filtro `cost_type = 'fixed'`, aggregati per ricorrenza mensile

6. **Dipendenti attivi** -- dalla tabella `employees`:
   - `gross_salary` per calcolo costo stipendi mensile

Il hook calcolera per ogni ordine:
- **Fatturato Imponibile** = `total_amount` (gia netto IVA come da convenzione progetto)
- **Fatturato Lordo** = `total_amount * (1 + vat_rate/100)`
- **Costi Variabili** = costo articoli netti + squadre esterne nette + provvigioni
- **Margine Lordo** = Fatturato Imponibile - Costi Variabili
- **Margine %** = Margine Lordo / Fatturato Imponibile * 100

Il calcolo IVA usa `calculateNetFromGross` da `vatUtils.ts` (stessa logica di `OrderEconomics`).

## Struttura Componenti

### File da creare

```
src/hooks/useMarginData.ts           -- hook per query e calcoli marginalita
src/components/forecast/MarginTab.tsx -- componente principale della tab
```

### File da modificare

```
src/pages/azienda/CashFlowForecast.tsx -- aggiunta tab "Marginalita"
```

## Dettaglio Sezioni della Tab

### 1. Marginalita per Commessa (tabella principale)

Tabella con colonne:
- Cliente | Commessa | Fatturato Imp. | Costi Variabili | Margine EUR | Margine % | Stato

**Stato margine** con soglia personalizzabile (default 30%, salvata in localStorage):
- Rosso: margine < 10%
- Giallo: margine >= 10% e < soglia
- Verde: margine >= soglia

Ordinamento per margine % (crescente = commesse peggiori in cima).

### 2. Margine Lordo Medio Aziendale (4 card KPI)

- Margine Lordo Medio EUR
- Margine Lordo Medio %
- Margine Minimo (con nome commessa)
- Margine Massimo (con nome commessa)

Sotto le card, indicatore di deviazione standard con interpretazione:
- Bassa deviazione = vendite coerenti
- Alta deviazione = margini inconsistenti

### 3. Costi Fissi Aziendali (card riepilogativa)

Aggregazione da `company_costs` (cost_type = fixed, ricorrenza mensile) + stipendi dipendenti:
- Totale Costi Fissi Mensili con breakdown per categoria

### 4. Break Even Automatico (card visiva)

Formula: `Break Even = Costi Fissi Mensili / (Margine Lordo Medio % / 100)`

Output:
- Fatturato necessario per pareggio
- Fatturato attuale medio mensile (da somma total_amount degli ordini / mesi attivi)
- Delta con indicatore visivo (surplus verde o deficit rosso)

### 5. Alert Intelligenti (CFO Mode)

Card con lista alert generati automaticamente:
- Margine medio sotto soglia
- Commesse in perdita (margine < 0)
- Costi variabili > 70% del fatturato
- Break even non coperto
- Fatturato alto ma margine basso (> 100k EUR ma margine < 15%)

Ogni alert con icona, testo e suggerimento azione.

### 6. Simulatore Strategico

4 input slider/number:
- Margine target % (default = margine medio attuale)
- Fatturato target mensile
- Variazione costi fissi (+/-)
- Variazione costi variabili % (+/-)

3 output calcolati in tempo reale:
- Nuovo punto di pareggio
- Nuovo utile previsto mensile
- Impatto su cash flow (delta vs situazione attuale)

## UX

- Numeri grandi e leggibili nelle card KPI (text-3xl/4xl)
- Colori: verde per utile (emerald-600), rosso per perdita (red-600), ambra per warning (amber-600)
- Nessun termine contabile complesso -- linguaggio imprenditoriale
- Soglia margine personalizzabile tramite un piccolo input inline nella sezione tabella
- Responsive: card in griglia su desktop, stack su mobile
- Tabella commesse con scroll orizzontale su mobile

## Note Tecniche

- I calcoli seguono la stessa logica di `OrderEconomics.tsx` per coerenza
- `total_amount` e' trattato come imponibile (netto IVA) come da convenzione del progetto
- I costi articoli e squadre esterne vengono scorporati dall'IVA con `calculateNetFromGross`
- Le provvigioni sono calcolate sull'imponibile totale dell'ordine (stessa logica di `OrderEconomics`)
- Soglia margine salvata in `localStorage` con chiave `margin-threshold-{companyId}`

