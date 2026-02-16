
# Redesign Previsionale: 3 Tab Pulite e Minimali

## Panoramica

Riprogettare completamente la pagina Previsionale sostituendo il layout attuale (stat cards + riepilogo uscite + grafico Recharts + tabella unificata) con un'interfaccia a 3 tab pulita e minimale:

1. **Incassato** - Cosa hai incassato e cosa devi ancora ricevere
2. **Previsionale Costi** - Tutte le uscite previste
3. **Previsione di Cassa** - Saldo netto entrate vs uscite

## Struttura delle 3 Tab

### Tab 1: Incassato

Sezione focalizzata sulle entrate dai clienti, divisa in due aree:

**Gia Incassato (questo mese)**
- Tabella con: Data Incasso, Ordine, Cliente, Tipo (Acconto 1/2, Saldo, Finanziamento), Importo
- Dati da ordini con `deposit_paid = true`, `deposit_2_paid = true`, `balance_paid = true`, `financing_paid = true` dove la data di pagamento cade nel mese corrente
- Card riepilogativa con totale incassato del mese

**Da Ricevere**
- 3 sotto-sezioni con indicatori temporali: Questo Mese, Prossimo Mese, Prossimi 3 Mesi
- Tabella con: Data Prevista, Ordine, Cliente, Tipo, Importo
- Dati dagli `expectedPayments` gia calcolati nel hook (pagamenti NON incassati)
- Card riepilogative per ogni periodo

### Tab 2: Previsionale Costi

Sezione focalizzata su tutte le uscite, organizzata per categoria:

- **Squadre Esterne** - Pagamenti non effettuati
- **Provvigioni Venditori** - Commissioni non pagate
- **Pagamenti Fornitori** - Rate fornitori in sospeso
- **Costi Aziendali** - Costi fissi e variabili non pagati

Ogni categoria mostra una tabella con i dettagli e un totale.
In cima, 3 card con totali per: Questo Mese, Prossimo Mese, 3 Mesi.

### Tab 3: Previsione di Cassa

Vista sintetica del flusso di cassa netto:

- 3 card: Questo Mese, Prossimo Mese, 3 Mesi - ciascuna con Entrate, Uscite, Netto
- Tabella unificata di tutti i movimenti (entrate + uscite) ordinati per data, con filtri per categoria e periodo
- Nessun grafico Recharts (rimosso per semplicita)

## Modifiche al Hook `useCashFlowData`

Aggiungere una nuova query per recuperare i **pagamenti gia incassati** (necessario per Tab 1):

```sql
-- Ordini con pagamenti gia effettuati nel mese corrente
SELECT id, order_code, deposit_amount, deposit_paid_date,
       deposit_2_amount, deposit_2_paid_date,
       balance_amount, balance_paid_date,
       financing_amount, financing_paid_date,
       customer:profiles(first_name, last_name)
FROM orders
WHERE company_id = ? AND (
  deposit_paid = true OR deposit_2_paid = true OR 
  balance_paid = true OR financing_paid = true
)
```

Il hook calcolera `collectedPayments` filtrando per mese.

## File da Creare

- `src/components/forecast/CollectedTab.tsx` - Tab "Incassato"
- `src/components/forecast/CostsForecastTab.tsx` - Tab "Previsionale Costi"
- `src/components/forecast/CashForecastTab.tsx` - Tab "Previsione di Cassa"

## File da Modificare

- `src/pages/azienda/CashFlowForecast.tsx` - Riscrittura completa con Tabs come struttura principale
- `src/hooks/useCashFlowData.ts` - Aggiungere query per pagamenti incassati

## File da Eliminare (non piu utilizzati)

Questi componenti non sono importati da nessuna parte e vengono definitivamente sostituiti:

- `src/components/forecast/ForecastChart.tsx` - Grafico Recharts rimosso
- `src/components/forecast/ForecastStatCards.tsx` - Sostituito da card nelle singole tab
- `src/components/forecast/ForecastExpensesSummary.tsx` - Sostituito da CostsForecastTab
- `src/components/forecast/ForecastTransactionsTable.tsx` - Sostituito da CashForecastTab
- `src/components/forecast/ForecastCommissions.tsx` - Gia orfano, mai importato
- `src/components/forecast/ForecastSupplierPayments.tsx` - Gia orfano, mai importato
- `src/components/forecast/ForecastMaterialCosts.tsx` - Gia orfano, mai importato
- `src/components/forecast/ForecastCompanyCosts.tsx` - Gia orfano, mai importato

## Design Visivo

- Layout minimal con sfondo bianco, bordi sottili, tipografia pulita
- Tabs in alto con `Tabs/TabsList/TabsTrigger/TabsContent` di shadcn
- Card con numeri grandi e colori semantici (verde per entrate, rosso per uscite)
- Tabelle semplici senza badge colorati eccessivi
- Nessun grafico
- Export CSV e Stampa PDF mantenuti nell'header

## Sequenza di Implementazione

1. Aggiornare `useCashFlowData.ts` con la query per i pagamenti incassati
2. Creare i 3 nuovi componenti tab
3. Riscrivere `CashFlowForecast.tsx` con la nuova struttura a tab
4. Eliminare i file obsoleti
