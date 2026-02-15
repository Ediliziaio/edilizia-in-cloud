
# Bonus Edilizio: Ritenuta Bancaria 11%

## Cosa viene aggiunto

Quando il cliente paga tramite bonifico per bonus edilizio, la banca trattiene l'11% dell'imponibile calcolato con IVA al 22% (anche se il contratto ha IVA diversa, es. 10%).

Esempio: Ordine da 10.000 euro con IVA 10% = Totale 11.000 euro.
La banca calcola l'imponibile come: 11.000 / 1.22 = 9.016,39 euro.
Ritenuta = 9.016,39 x 11% = 991,80 euro.

Questo importo non e un costo (si recupera sulle tasse), ma serve saperlo.

## Modifiche previste

### 1. Database: nuova colonna
Aggiunta colonna `has_building_bonus` (boolean, default false) alla tabella `orders`.

### 2. UI: Toggle + Calcolo automatico nel Riepilogo Finanziario
Nel componente `FinancialSummary.tsx`:
- Nuovo switch/checkbox "Bonus Edilizio" sotto l'aliquota IVA
- Quando attivo, appare un riquadro informativo con:
  - Imponibile bancario (Totale IVA inclusa / 1.22)
  - Ritenuta 11% calcolata
  - Nota: "Importo trattenuto dalla banca - recuperabile in dichiarazione"

Nella vista read-only (`FinancialSummaryReadOnly` e `OrderDetail`):
- Stesso riquadro informativo se il flag e attivo

### 3. File da modificare
- **Migrazione SQL**: aggiunta `has_building_bonus` boolean default false
- **`FinancialSummary.tsx`**: nuova prop `hasBuildingBonus` + `onHasBuildingBonusChange`, logica calcolo e UI
- **`CreateOrder.tsx`**: nuovo state `hasBuildingBonus`, passaggio props, salvataggio nel DB
- **`EditOrder.tsx`**: caricamento e salvataggio del campo, aggiornamento draft
- **`OrderDetail.tsx`**: passaggio prop alla vista read-only
- **`useOrderDraft.ts`**: aggiunta campo `hasBuildingBonus` nel tipo draft
- **`CustomerFinancialSummary.tsx`**: mostrare la ritenuta se attiva

### 4. Formula di calcolo

```text
imponibileBancario = totaleConIVA / 1.22
ritenutaBancaria = imponibileBancario * 0.11
```

Sempre calcolato con divisore 1.22, indipendentemente dall'IVA del contratto.

### 5. Impatto
- Nessun ordine esistente viene modificato (default: false)
- Nessun impatto sul previsionale cassa (non e un costo)
- Puramente informativo per l'utente
