
# Sincronizzazione Pagamenti Fornitori con Previsionale e Costi

## Problema Identificato

Quando paghi un fornitore (es. acconto di 2.500 EUR con metodo 50/50), questo pagamento NON appare nel Previsionale ne' nei Costi Aziendali. Il hook `useCashFlowData.ts` ha gia' una query `supplierBalances` (righe 110-128) che recupera i saldi non pagati, ma **i dati non vengono mai utilizzati** nei calcoli delle statistiche, nel grafico o nella tabella transazioni.

## Modifiche Previste

### 1. Hook `useCashFlowData.ts` - Integrare pagamenti fornitori

**a) Espandere la query `supplierBalances` (riga 110-128)**
- Rimuovere il filtro `balance_paid = false` per recuperare TUTTI gli articoli con metodo a rate (50/50, 30/70)
- Includere anche articoli con metodo a pagamento singolo (bonifico, riba, ecc.) che hanno `is_paid = false`
- Aggiungere `purchase_price, quantity, is_paid` alla select

**b) Creare nuovo computed `expectedSupplierPayments`**
- Tipo: array di oggetti con `supplierName, amount, expectedDate, direction: "out", isPaid, type ("Acconto Fornitore" | "Saldo Fornitore")`
- Per articoli 50/50 / 30/70: genera 2 righe (acconto + saldo), mostrando solo quelli non pagati
- Per articoli a pagamento singolo: genera 1 riga se non pagato

**c) Includere nei calcoli `stats`**
- Aggiungere `expectedSupplierPayments` (non pagati) alle uscite di ogni periodo (thisMonth, nextMonth, next3Months, total)
- Creare campo `stats.total.supplierPaymentsTotal` per il totale specifico

**d) Includere nel `chartData`**
- Aggiungere nuova barra stacked "Fornitori" nel grafico a 6 mesi
- Colore: un blu/viola distinto dalle altre categorie

**e) Esportare `expectedSupplierPayments` dal hook**

### 2. Tipo `forecastTypes.ts` - Nuova interfaccia

Aggiungere:
```
ExpectedSupplierPayment {
  orderItemId: string;
  orderId: string;
  orderCode: string | null;
  supplierName: string;
  type: "Acconto Fornitore" | "Saldo Fornitore" | "Pagamento Fornitore";
  amount: number;
  expectedDate: Date | null;
  direction: "out";
}
```

Aggiungere `supplierPaymentsTotal: number` a `ForecastStats.total`.

### 3. Componente `ForecastTransactionsTable.tsx`

- Accettare nuovo prop `expectedSupplierPayments`
- Includerli nelle transazioni combinate con badge dedicato (es. "Fornitore" con icona Truck, colore indaco)
- Mostrare nome fornitore e tipo (Acconto/Saldo)

### 4. Componente `ForecastChart.tsx`

- Aggiungere nuova barra stacked "Fornitori" con colore indaco (`hsl(230 80% 55%)`)
- Posizionarla nello stack delle uscite

### 5. Pagina `CashFlowForecast.tsx`

- Passare `expectedSupplierPayments` alla `ForecastTransactionsTable`
- Includerli nell'export CSV

### 6. Nuova sezione nel Previsionale: `ForecastSupplierPayments`

Nuovo componente card dedicato (simile a `ForecastCompanyCosts`) che mostra:
- Totale da pagare ai fornitori (non pagato)
- Totale gia' pagato ai fornitori (pagato di recente)
- Tabella con prossime scadenze: fornitore, ordine, tipo rata, importo, data scadenza
- Badge colore: rosso se scaduto, arancione se entro 7 giorni, grigio altrimenti
- Colore tema: indaco/blu (per distinguerlo dai costi aziendali rossi e dai materiali arancioni)

### 7. Pagina `CompanyCostsManager.tsx` - Sezione fornitori

Aggiungere un nuovo tab o sezione "Pagamenti Fornitori" che mostra:
- I pagamenti effettuati (deposit_paid / balance_paid = true con date)
- I pagamenti in scadenza
- Sincronizzazione automatica: i dati vengono letti direttamente da `order_items`, nessuna duplicazione in `company_costs`

---

## Riepilogo File

| Azione | File |
|--------|------|
| Modificare | `src/lib/forecastTypes.ts` (nuova interfaccia + campo stats) |
| Modificare | `src/hooks/useCashFlowData.ts` (query + computed + stats + chart + export) |
| Creare | `src/components/forecast/ForecastSupplierPayments.tsx` (nuova card) |
| Modificare | `src/components/forecast/ForecastTransactionsTable.tsx` (nuovo prop + righe fornitori) |
| Modificare | `src/components/forecast/ForecastChart.tsx` (nuova barra "Fornitori") |
| Modificare | `src/pages/azienda/CashFlowForecast.tsx` (integrazione + CSV) |
| Modificare | `src/components/forecast/CompanyCostsManager.tsx` (tab pagamenti fornitori) |

## Risultato Atteso

Esempio con il caso dell'utente (fornitore "marysorina", 50/50, totale 5.000 EUR):
- **Previsionale**: mostra -2.500 EUR a febbraio (acconto pagato) e -2.500 EUR a marzo (saldo da pagare)
- **Grafico**: barra indaco "Fornitori" visibile nei mesi corrispondenti
- **Tabella transazioni**: 1 riga "Saldo Fornitore - marysorina" con data prevista e importo
- **Card Fornitori**: riepilogo con barra progresso 50%, scadenza saldo evidenziata
- **Costi**: tab dedicato con storico pagamenti fornitori sincronizzato in tempo reale
