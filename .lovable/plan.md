
# Ristrutturazione Previsionale Cassa + Integrazione Provvigioni nei Costi

## Stato attuale e problemi

**Sezione Costi (`CompanyCostsManager.tsx`)**:
- Mostra: costi manuali, articoli fornitore, squadre esterne, manodopera
- **MANCA**: provvigioni commerciali (`order_salespeople`) -- vanno aggiunte

**Previsionale Cassa (`CashFlowForecast.tsx`)**:
- 8 stat cards + 4 sezioni dettaglio separate + grafico + tabella = troppo dispersivo
- Le provvigioni compaiono nella card separata ma **mancano dalla tabella unificata e dal CSV**
- Dati duplicati tra card dedicate e tabella

---

## Parte 1: Aggiungere Provvigioni nella sezione Costi

**File: `src/components/forecast/CompanyCostsManager.tsx`**

1. Aggiungere query `order_salespeople` (come gia' fatto per external teams e employees):
   ```
   from("order_salespeople")
     .select("id, commission_amount, is_paid, paid_date, payment_expected_date,
              salesperson:salespeople!inner(first_name, last_name, company_id),
              order:orders!inner(id, order_code, company_id)")
     .eq("salesperson.company_id", companyId)
   ```

2. Trasformare in `UnifiedCost[]` con categoria "Provvigioni":
   - `name`: nome del venditore
   - `amount`: `commission_amount`
   - `category`: "Provvigioni"
   - `due_date`: `payment_expected_date`
   - `is_paid`: dal campo `is_paid`
   - `isFromOrder`: true

3. Aggiungere al merge `allOrderDerivedCosts`:
   ```
   [...orderItemsAsVariableCosts, ...externalTeamAsVariableCosts,
    ...employeeAsVariableCosts, ...commissionAsVariableCosts]
   ```

4. Aggiornare il filtro Origine: "Da Ordine" includera' anche le provvigioni

---

## Parte 2: Ristrutturazione Previsionale Cassa

### Nuova struttura pagina

```text
+--------------------------------------------------+
|  Header: Previsionale Cassa       [CSV] [PDF]     |
+--------------------------------------------------+
|  [Questo Mese]  [Prossimo Mese]  [Prossimi 3M]   |
|  Entrate / Uscite / Netto per ciascuno            |
+--------------------------------------------------+
|  Riepilogo Uscite (card compatta)                 |
|  Squadre | Provvigioni | Fornitori | C.Fissi | V  |
|  + Burn Rate e Rapporto E/U                       |
+--------------------------------------------------+
|  Grafico 6 mesi (invariato)                       |
+--------------------------------------------------+
|  Tabella Unificata con filtro Categoria            |
|  [Tutti|Entrate|Uscite] [Categoria] [Data]        |
|  Include TUTTO: Incassi, Squadre, Provvigioni,    |
|  Costi Aziendali, Pagamenti Fornitori             |
+--------------------------------------------------+
```

### 2a. Semplificare Stat Cards (`ForecastStatCards.tsx`)
- Da 8 a **3 card**: Questo Mese, Prossimo Mese, Prossimi 3 Mesi
- Ogni card: Entrate (verde), Uscite (rosso), Netto (grassetto, colorato)
- Rimuovere card CFO KPIs separate

### 2b. Nuovo componente: Riepilogo Uscite (`ForecastExpensesSummary.tsx`)
- Una card compatta con breakdown uscite in sospeso
- 5 mini-sezioni inline: Squadre Esterne, Provvigioni, Pagamenti Fornitori, Costi Fissi, Costi Variabili
- Footer: Burn Rate mensile e Rapporto Entrate/Uscite
- Alert collapsible per materiali pendenti (se presenti)

### 2c. Rimuovere sezioni dettaglio separate dalla pagina
- Non importare piu': `ForecastMaterialCosts`, `ForecastCommissions`, `ForecastCompanyCosts`, `ForecastSupplierPayments`
- I file restano nel codebase (non vengono cancellati)
- Tutti i dati confluiscono nella tabella unificata

### 2d. Integrare Provvigioni nella tabella (`ForecastTransactionsTable.tsx`)
- Aggiungere prop `expectedCommissions`
- Includerle in `allTransactions` con badge viola "Provvigione" e icona UserCheck
- Aggiungere filtro **Categoria** (Select):
  - Tutte le categorie
  - Incassi Clienti
  - Squadre Esterne
  - Provvigioni
  - Costi Aziendali
  - Pagamenti Fornitori

### 2e. Fix Export CSV (`CashFlowForecast.tsx`)
- Aggiungere provvigioni all'array delle transazioni CSV
- Passare `expectedCommissions` alla tabella

---

## File modificati

| File | Azione |
|------|--------|
| `src/components/forecast/CompanyCostsManager.tsx` | Aggiungere query + trasformazione provvigioni |
| `src/components/forecast/ForecastStatCards.tsx` | Riscrittura: 3 card con breakdown |
| `src/components/forecast/ForecastExpensesSummary.tsx` | **Nuovo**: riepilogo compatto uscite |
| `src/components/forecast/ForecastTransactionsTable.tsx` | Aggiungere provvigioni + filtro categoria |
| `src/pages/azienda/CashFlowForecast.tsx` | Ristrutturare layout, fix CSV |

## Cosa NON cambia

- Hook `useCashFlowData.ts` (dati gia' tutti disponibili)
- Grafico `ForecastChart.tsx` (gia' ben strutturato)
- Nessuna modifica al database
- I file delle card rimosse restano nel codebase
