

# Piano: Export CSV/PDF + Miglioramenti CFO alla Sezione Costi e Previsionale

## Analisi da Direttore Finanziario

Dopo analisi approfondita, le aree di miglioramento principali sono:

1. **Manca export dati** - Un CFO deve poter esportare report per CdA, commercialista, banca
2. **KPI insufficienti** - Mancano indicatori chiave come burn rate, runway, rapporto entrate/uscite
3. **Nessun confronto temporale** - Non c'e modo di vedere come evolvono i costi mese su mese
4. **Sezione Costi troppo basica** - Mancano filtri per periodo, ricerca, e riepilogo annuale
5. **Grafico limitato** - Solo barre, nessuna linea del netto cumulativo per capire il trend

---

## 1. Export CSV e PDF del Previsionale

**File**: `src/pages/azienda/CashFlowForecast.tsx`

### Export CSV
- Pulsante "Esporta CSV" nell'header della pagina
- Genera un file CSV con tutte le transazioni (entrate + uscite + costi aziendali)
- Colonne: Data, Tipo, Descrizione, Ordine, Direzione, Importo
- Include una sezione di riepilogo in cima con i totali KPI
- Usa `Blob` + `URL.createObjectURL` per il download lato client

### Export PDF
- Pulsante "Esporta PDF" accanto al CSV
- Genera un PDF formattato usando la funzionalita nativa `window.print()` con CSS `@media print`
- Aggiungere un wrapper con classe `print:` per formattare il layout in stampa
- Include: KPI, tabella movimenti, riepilogo costi aziendali

---

## 2. Miglioramenti Previsionale (visione CFO)

**File**: `src/pages/azienda/CashFlowForecast.tsx`

### 2a. Nuove KPI Card
Aggiungere una seconda riga di KPI sotto quella esistente:
- **Burn Rate Mensile**: media uscite mensili (ultimi dati disponibili)
- **Rapporto Entrate/Uscite**: percentuale (es. "1.5x" = entrate 50% superiori alle uscite)
- **Costi Scaduti**: totale costi con `due_date < oggi` e `is_paid = false`
- **Costi Ricorrenti Mensili**: somma di tutti i costi con `recurrence = monthly`

### 2b. Grafico migliorato
- Aggiungere una **linea del Netto Cumulativo** sovrapposta alle barre (ComposedChart di Recharts)
- Mostra la tendenza del flusso di cassa accumulato mese su mese
- Colore verde se positivo, rosso se negativo

### 2c. Breakdown uscite nel grafico
- Stacked bar per le uscite: separare visivamente "Squadre Esterne", "Provvigioni", "Costi Fissi", "Costi Variabili", "Materiali"
- Permette al CFO di capire dove vanno i soldi

---

## 3. Miglioramenti Sezione Costi

**File**: `src/components/forecast/CompanyCostsManager.tsx`

### 3a. Filtri avanzati
- **Filtro per periodo**: Select con "Questo mese", "Prossimo mese", "Ultimi 3 mesi", "Quest'anno", "Tutti"
- **Ricerca**: Input di ricerca per nome costo
- **Filtro stato**: "Tutti", "Da pagare", "Pagati", "Scaduti"

### 3b. Riepilogo annuale
- Card aggiuntiva nel summary: **"Totale Annuo Stimato"** che proietta i costi ricorrenti su 12 mesi
  - Mensili x 12, Trimestrali x 4, Annuali x 1, Una tantum x 1
- Mostra la distribuzione per categoria (mini breakdown)

### 3c. Tab "Tutti i Costi"
- Aggiungere un terzo tab "Tutti" che mostra tutti i costi unificati (fissi + variabili) ordinati per scadenza
- Utile per avere una vista completa delle uscite

### 3d. Export CSV dei Costi
- Pulsante "Esporta CSV" nell'header della card Costi
- Esporta tutti i costi con: Nome, Tipo, Categoria, Importo, Ricorrenza, Scadenza, Stato

---

## Riepilogo tecnico

| File | Modifica |
|------|----------|
| `src/pages/azienda/CashFlowForecast.tsx` | Export CSV/PDF, nuove KPI (burn rate, rapporto, scaduti), grafico ComposedChart con netto cumulativo e stacked bars |
| `src/components/forecast/CompanyCostsManager.tsx` | Filtri (periodo, ricerca, stato), riepilogo annuale, tab "Tutti", export CSV costi |

Nessuna migrazione database necessaria. Tutti i dati sono gia disponibili nella tabella `company_costs` e nelle query esistenti.

