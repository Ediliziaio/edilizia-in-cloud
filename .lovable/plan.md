
# Piano: Integrazione Articoli Ordine nei Costi Variabili + Pulizia e Stabilizzazione

## Obiettivo principale

Gli articoli degli ordini con stato "da_ordinare" e "ordinato" devono comparire automaticamente nella sezione **Costi Variabili** del `CompanyCostsManager`, con stato "Da pagare" (perche la merce non e ancora stata pagata). Quando un articolo passa a "in_magazzino" o "installato", non serve piu mostrarlo come costo da pagare.

---

## 1. Integrazione articoli ordine nei Costi Variabili

**File**: `src/components/forecast/CompanyCostsManager.tsx`

### Cosa cambia:
- Aggiungere una query per recuperare gli `order_items` con status `da_ordinare` o `ordinato` (stessa query gia presente nel previsionale)
- Creare una lista "virtuale" di costi variabili derivati dagli articoli, con:
  - **Nome**: nome dell'articolo
  - **Importo**: `purchase_price * quantity`
  - **Stato**: "Da pagare" (da_ordinare) o "Ordinato" (ordinato) con badge dedicati
  - **Ordine**: collegamento al codice ordine
  - **Fornitore**: nome del fornitore se presente
  - **Ricorrenza**: "Una tantum" (sono costi puntuali)
- Questi costi "da ordine" saranno mostrati nel tab **Costi Variabili** e nel tab **Tutti**, mescolati con i costi variabili manuali ma distinguibili tramite un badge "Da Ordine"
- NON sono editabili/cancellabili dal cost manager (si gestiscono dall'ordine)
- Aggiornare i summary card per includere questi costi nei totali "Da pagare"

### Dettagli tecnici:
- Query: `order_items` con `.select("id, name, quantity, purchase_price, status, supplier:suppliers(name), order:orders!inner(id, order_code, company_id)")` filtrata per `status IN (da_ordinare, ordinato)`
- Merge nella lista `variableCosts` con un flag `isFromOrder: true` per distinguerli
- Nella tabella: riga con badge arancione "Da Ordine" + badge stato articolo, azioni disabilitate (solo link all'ordine)

---

## 2. Fix bug: warning "Function components cannot be given refs"

**File**: `src/components/forecast/CompanyCostsManager.tsx`

Il console log mostra un warning su `Select` di Radix. Il problema e nell'uso di `<Select>` dentro il form dialog dove viene passato un ref implicito. Il fix e assicurarsi che i `SelectTrigger` non ricevano ref non gestiti. Verifico e correggo eventuali usi errati.

---

## 3. Pulizia codice e stabilizzazione

### 3a. Rimozioni
- Rimuovere import inutilizzati in `CompanyCostsManager.tsx` (verifico dopo analisi completa)
- Rimuovere eventuali variabili non referenziate

### 3b. Fix funzionali
- Gestire il caso `SelectItem value=""` (non valido in Radix Select) nel campo "Collega a ordine" - usare `"none"` al posto di stringa vuota
- Assicurarsi che i filtri funzionino correttamente con i nuovi costi da ordine
- Gestire il riepilogo annuale per escludere i costi da ordine (sono puntuali, non ricorrenti)

### 3c. UX
- Badge "Da Ordine" colorato (es. arancione) per distinguere i costi automatici da quelli manuali
- Tooltip sulle righe da ordine: "Questo costo viene dagli articoli dell'ordine. Gestiscilo dalla pagina ordine."
- Aggiungere link diretto all'ordine cliccando sul codice ordine
- Loading skeleton per la nuova query
- Conteggi aggiornati nei tab (includendo articoli ordine)

---

## Riepilogo tecnico

| File | Modifica |
|------|----------|
| `src/components/forecast/CompanyCostsManager.tsx` | Query order_items, merge nei costi variabili, badge "Da Ordine", fix Select ref warning, fix SelectItem value vuoto, pulizia import |
| `src/pages/azienda/CashFlowForecast.tsx` | Nessuna modifica (gia integrato nel previsionale) |

Nessuna migrazione database necessaria. I dati degli articoli ordine sono gia disponibili nella tabella `order_items`.
