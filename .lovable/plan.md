
# Piano: Gestione IVA Acquisti su Articoli e Squadre Esterne

## Panoramica

Implementazione della gestione dell'IVA lato acquisti per calcolare correttamente il costo netto e l'IVA detraibile. Attualmente i costi vengono inseriti come valore lordo (IVA inclusa), ma il sistema non distingue l'aliquota IVA applicata.

---

## 1. Scenario Attuale vs Nuovo

| Scenario | Attuale | Nuovo |
|----------|---------|-------|
| Articolo da fornitore IT | Costo 1220€ → margine su 1220€ | Costo 1220€ con IVA 22% → netto 1000€, IVA detraibile 220€ |
| Articolo da fornitore estero | Costo 1000€ → margine su 1000€ | Costo 1000€ con IVA 0% → netto 1000€, IVA 0€ |
| Squadra forfettaria | Costo 2500€ → margine su 2500€ | Costo 2500€ con IVA 0% → netto 2500€, IVA 0€ |
| Squadra ordinaria | Costo 3050€ → margine su 3050€ | Costo 3050€ con IVA 22% → netto 2500€, IVA 550€ |

---

## 2. Modifiche Database

### 2.1 Tabella `suppliers`

Aggiungere aliquota IVA predefinita per il fornitore:

```sql
ALTER TABLE suppliers ADD COLUMN vat_rate numeric DEFAULT 22;
```

Esempi di utilizzo:
- Fornitore Italia: 22%
- Fornitore UE/Estero (reverse charge): 0%
- Fornitore con aliquota ridotta: 10% o 4%

### 2.2 Tabella `order_items`

Aggiungere aliquota IVA specifica per l'articolo (eredita dal fornitore ma modificabile):

```sql
ALTER TABLE order_items ADD COLUMN vat_rate numeric DEFAULT 22;
```

### 2.3 Tabella `external_teams`

Aggiungere aliquota IVA predefinita per la squadra:

```sql
ALTER TABLE external_teams ADD COLUMN vat_rate numeric DEFAULT 22;
```

Esempi:
- Ditta ordinaria: 22%
- Forfettario (no IVA): 0%
- Reverse charge: 0%

### 2.4 Tabella `order_external_teams`

Aggiungere aliquota IVA specifica per l'assegnazione:

```sql
ALTER TABLE order_external_teams ADD COLUMN vat_rate numeric DEFAULT 22;
```

---

## 3. Logica di Calcolo

### 3.1 Scorporo IVA dal Lordo

Poiché il costo viene inserito già ivato (lordo), lo scorporo funziona così:

```
Imponibile = Lordo / (1 + aliquota/100)
IVA = Lordo - Imponibile
```

Esempio con lordo 1220€ e IVA 22%:
- Imponibile = 1220 / 1.22 = 1000€
- IVA = 1220 - 1000 = 220€

### 3.2 Conto Economico Aggiornato

```
VENDITA
├─ Imponibile vendita:       10.000€
├─ IVA vendita (22%):         2.200€
└─ Totale lordo:             12.200€

COSTI ARTICOLI
├─ Finestra Alluminio (IT 22%):  1.220€ lordo → 1.000€ netto + 220€ IVA
├─ Vetro (Estero 0%):              800€ lordo →   800€ netto +   0€ IVA
└─ Totale netto articoli:        1.800€
   IVA detraibile articoli:        220€

COSTI MANODOPERA  
├─ Squadra A (Forfettario 0%):  2.500€ lordo → 2.500€ netto +   0€ IVA
├─ Squadra B (Ordinario 22%):   1.830€ lordo → 1.500€ netto + 330€ IVA
└─ Totale netto manodopera:     4.000€
   IVA detraibile manodopera:     330€

RIEPILOGO IVA
├─ IVA a debito (vendita):      2.200€
├─ IVA a credito (acquisti):      550€
└─ IVA netta da versare:        1.650€

MARGINE
├─ Imponibile vendita:         10.000€
├─ Costi netti totali:          5.800€
└─ Margine lordo:               4.200€ (42%)
```

---

## 4. Modifiche UI

### 4.1 Dialog Nuovo Fornitore (`SupplierSelect.tsx`)

Aggiungere campo IVA predefinita:

```
┌────────────────────────────────────┐
│        Nuovo Fornitore             │
├────────────────────────────────────┤
│ Nome Fornitore *                   │
│ [ABC Serramenti________________]   │
│                                    │
│ Aliquota IVA Predefinita           │
│ [▼ 22% - Italia ordinaria     ]    │
│    ├─ 22% - Italia ordinaria       │
│    ├─ 10% - Aliquota ridotta       │
│    ├─  4% - Aliquota minima        │
│    └─  0% - Estero/Reverse charge  │
│                                    │
│            [Annulla] [Crea]        │
└────────────────────────────────────┘
```

### 4.2 Dialog Articolo (`OrderItemsList.tsx`)

Aggiungere campo IVA (ereditato dal fornitore ma modificabile):

```
┌────────────────────────────────────┐
│        Nuovo Articolo              │
├────────────────────────────────────┤
│ Nome Articolo *                    │
│ [Finestra 120x140______________]   │
│                                    │
│ Quantità          Costo Acquisto   │
│ [2___]            [€ 1220.00____]  │
│                                    │
│ IVA Acquisto                       │
│ [▼ 22%                        ]    │
│ ⓘ Ereditato da fornitore           │
│                                    │
│ Fornitore                          │
│ [▼ ABC Serramenti        ] [+]     │
│                                    │
│            [Annulla] [Aggiungi]    │
└────────────────────────────────────┘
```

### 4.3 Dialog Squadra Esterna (`ExternalTeamDialog.tsx`)

Aggiungere regime IVA:

```
┌────────────────────────────────────┐
│     Nuova Squadra Esterna          │
├────────────────────────────────────┤
│ Nome Ditta/Squadra *               │
│ [Installazioni Rossi Srl_______]   │
│                                    │
│ Regime IVA                         │
│ [▼ 22% - Regime ordinario     ]    │
│    ├─ 22% - Regime ordinario       │
│    └─  0% - Forfettario/Esente     │
│                                    │
│ Nome Referente                     │
│ [Mario Rossi___________________]   │
│ ...                                │
└────────────────────────────────────┘
```

### 4.4 Dialog Assegna Squadra (`AssignExternalTeamDialog.tsx`)

Aggiungere IVA specifica per l'assegnazione:

```
┌────────────────────────────────────┐
│     Aggiungi Squadra Esterna       │
├────────────────────────────────────┤
│ Squadra *                          │
│ [▼ Installazioni Rossi        ]    │
│                                    │
│ Costo Totale (€) *   IVA           │
│ [3050__________]     [▼ 22%   ]    │
│ ⓘ Inserisci il totale fattura      │
│   (netto 2500€ + IVA 550€)         │
│                                    │
│ Data Pagamento Prevista            │
│ [📅 Seleziona data_____________]   │
│                                    │
│            [Annulla] [Aggiungi]    │
└────────────────────────────────────┘
```

### 4.5 Conto Economico Aggiornato (`OrderEconomics.tsx`)

Nuova visualizzazione con dettaglio IVA:

```
┌────────────────────────────────────────────┐
│ 💰 Conto Economico                         │
├────────────────────────────────────────────┤
│ VENDITA                                    │
│ Imponibile                     € 10.000,00 │
│ IVA (22%)                       € 2.200,00 │
│ Totale con IVA                 € 12.200,00 │
├────────────────────────────────────────────┤
│ COSTI ARTICOLI                             │
│ Finestra (22%)    € 1.220 → € 1.000 netto  │
│ Vetro (0%)          € 800 →   € 800 netto  │
│ ─────────────────────────────────────────  │
│ Totale netto articoli          € 1.800,00  │
│ IVA detraibile articoli          € 220,00  │
├────────────────────────────────────────────┤
│ COSTI MANODOPERA                           │
│ Squadra A (0%)    € 2.500 → € 2.500 netto  │
│ Squadra B (22%)   € 1.830 → € 1.500 netto  │
│ ─────────────────────────────────────────  │
│ Totale netto manodopera        € 4.000,00  │
│ IVA detraibile manodopera        € 330,00  │
├────────────────────────────────────────────┤
│ RIEPILOGO IVA                              │
│ IVA a debito (vendita)         € 2.200,00  │
│ IVA a credito (acquisti)         € 550,00  │
│ IVA netta da versare           € 1.650,00  │
├────────────────────────────────────────────┤
│ MARGINE                                    │
│ ↗ Margine Lordo                € 4.200,00  │
│ Margine %                           42,0%  │
└────────────────────────────────────────────┘
```

---

## 5. File da Modificare

| File | Modifiche |
|------|-----------|
| `supabase/migrations/` | Nuova migrazione per aggiungere campi `vat_rate` |
| `src/components/orders/SupplierSelect.tsx` | Aggiungere campo IVA nel dialog creazione fornitore |
| `src/components/orders/OrderItemsList.tsx` | Aggiungere campo IVA articolo con ereditarietà da fornitore |
| `src/components/employees/ExternalTeamDialog.tsx` | Aggiungere campo regime IVA |
| `src/components/employees/AssignExternalTeamDialog.tsx` | Aggiungere campo IVA con ereditarietà da squadra |
| `src/components/orders/OrderEconomics.tsx` | Refactor completo per calcoli IVA acquisti |

---

## 6. Comportamento Ereditarietà IVA

### Articoli

1. Utente seleziona fornitore → campo IVA viene precompilato con valore del fornitore
2. Utente può modificare manualmente se necessario
3. Al salvataggio, il valore IVA viene salvato su `order_items.vat_rate`

### Squadre Esterne

1. Utente seleziona squadra → campo IVA viene precompilato con valore della squadra
2. Utente può modificare se questa fattura specifica ha regime diverso
3. Al salvataggio, il valore IVA viene salvato su `order_external_teams.vat_rate`

---

## Sezione Tecnica

### Formula Scorporo IVA

```typescript
function calculateNetFromGross(grossAmount: number, vatRate: number) {
  const netAmount = grossAmount / (1 + vatRate / 100);
  const vatAmount = grossAmount - netAmount;
  return { netAmount, vatAmount };
}

// Esempio
calculateNetFromGross(1220, 22);
// { netAmount: 1000, vatAmount: 220 }
```

### Struttura Dati OrderEconomics

```typescript
interface CostBreakdown {
  name: string;
  grossCost: number;      // Costo lordo inserito
  vatRate: number;        // Aliquota IVA (0, 4, 10, 22)
  netCost: number;        // Costo netto (scorporato)
  vatAmount: number;      // IVA detraibile
}

interface EconomicsData {
  // Vendita
  saleNet: number;
  saleVat: number;
  saleGross: number;
  
  // Costi articoli
  itemCosts: CostBreakdown[];
  totalItemsNet: number;
  totalItemsVat: number;
  
  // Costi manodopera
  laborCosts: CostBreakdown[];
  totalLaborNet: number;
  totalLaborVat: number;
  
  // Riepilogo IVA
  vatDebit: number;       // IVA vendita (a debito)
  vatCredit: number;      // IVA acquisti (a credito)
  vatBalance: number;     // Differenza da versare/recuperare
  
  // Margine
  grossMargin: number;
  marginPercentage: number;
}
```

### Aliquote IVA Predefinite

```typescript
const VAT_RATES = [
  { value: 22, label: "22% - Ordinaria" },
  { value: 10, label: "10% - Ridotta" },
  { value: 4, label: "4% - Minima" },
  { value: 0, label: "0% - Esente/Estero" },
];
```
