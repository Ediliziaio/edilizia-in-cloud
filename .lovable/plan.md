
# Tesoreria: Separazione Sostenuto vs Previsionale + Grafico Corretto

## Problema attuale

La Tesoreria attualmente mescola concetti. Manca la distinzione fondamentale tra:
- **Sostenuto**: flussi di cassa effettivi (pagamenti ricevuti/effettuati con date reali)
- **Previsionale**: flussi attesi in futuro (basati su date previste, non ancora pagati)

Il grafico puo andare sotto zero, il che non ha senso per una tesoreria che rappresenta il saldo bancario reale.

## Soluzione

### 1. Vista di default: Solo Sostenuto
La griglia e il grafico mostrano SOLO i flussi effettivamente realizzati (come gia funziona nella griglia). Il saldo cumulativo parte da 0 e cresce/decresce in base ai pagamenti reali. Non puo mai andare sotto zero se i dati sono corretti (rappresenta il conto in banca).

### 2. Bottone toggle "Mostra Previsionale"
Un bottone nella toolbar accanto al selettore date permette di sovrapporre i dati previsionali:
- **Nel grafico**: barre previsionali semi-trasparenti (con pattern tratteggiato o opacita ridotta) affiancate alle barre sostenute, e una seconda linea tratteggiata per la tesoreria prevista
- **Nella griglia**: colonne future mostrano i valori previsionali in colore piu chiaro o con un badge "Prev." accanto

### 3. Dati previsionali necessari
La TreasuryTab deve ricevere anche i dati previsionali (gia disponibili nel hook):
- `expectedPayments` (entrate attese non ancora incassate)
- `expectedExpenses` (squadre esterne non pagate)
- `expectedCommissions` (provvigioni non pagate)
- `expectedSupplierPayments` (fornitori non pagati)
- `expectedCompanyCosts` (costi aziendali non pagati)

Questi dati vengono mappati nella stessa struttura ad albero ma con un suffisso "forecast" e visualizzati solo quando il toggle e attivo.

## Dettagli tecnici

### File: `src/components/forecast/TreasuryTab.tsx`

**Nuove props:**
```typescript
interface TreasuryTabProps {
  // Dati sostenuti (esistenti)
  orders: any[];
  paidCompanyCosts: any[];
  paidExternalTeams: any[];
  paidCommissions: any[];
  paidSupplierItems: any[];
  activeEmployees: any[];
  treasuryCategories: any[];
  companyId: string | undefined;
  // Dati previsionali (nuovi)
  expectedPayments: ExpectedPayment[];
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  expectedCompanyCosts: CompanyCostEntry[];
}
```

**Nuovo stato:**
```typescript
const [showForecast, setShowForecast] = useState(false);
```

**Logica grafico:**
- Sostenuto: barre piene verdi/rosse + linea blu continua (saldo cumulativo reale)
- Previsionale (quando attivo): barre semi-trasparenti + linea blu tratteggiata
- Il saldo cumulativo del sostenuto non va mai sotto zero perche rappresenta movimenti reali
- Il previsionale parte dal saldo sostenuto dell'ultimo mese e proietta in avanti

**Logica griglia:**
- Quando `showForecast = true`, accanto ai valori sostenuti appare il valore previsto in grigio/corsivo
- Per i mesi futuri (senza sostenuto), si mostrano solo i valori previsionali

**UI del toggle:**
```text
[Periodo: Da — A]  [Mostra Previsionale: OFF/ON]
```
Bottone con icona `Eye`/`EyeOff` e testo "Mostra Previsionale"

### File: `src/pages/azienda/CashFlowForecast.tsx`
- Passare le props previsionali aggiuntive alla TreasuryTab

### File da modificare:
- `src/components/forecast/TreasuryTab.tsx` -- Toggle, doppio calcolo (sostenuto + previsionale), grafico con overlay
- `src/pages/azienda/CashFlowForecast.tsx` -- Passare le nuove props

### Struttura grafico aggiornata:

```text
ComposedChart
  |-- Bar (income, pieno verde) -- sostenuto
  |-- Bar (expenses, pieno rosso) -- sostenuto  
  |-- Bar (forecastIncome, verde 40% opacita, tratteggiato) -- solo se toggle ON
  |-- Bar (forecastExpenses, rosso 40% opacita, tratteggiato) -- solo se toggle ON
  |-- Line (treasury, blu continua, spessa) -- saldo cumulativo sostenuto
  |-- Line (forecastTreasury, blu tratteggiata) -- saldo cumulativo previsto, solo se toggle ON
```

### Sequenza:
1. Aggiornare le props in CashFlowForecast per passare i dati previsionali
2. Aggiungere stato `showForecast` e bottone toggle
3. Calcolare `forecastTreeData` con la stessa logica del `treeData` ma usando i dati expected
4. Aggiornare il grafico con barre/linee doppie
5. Aggiornare la griglia per mostrare valori previsionali in parallelo
