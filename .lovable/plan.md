

# Fix Costi Variabili Ordini Demo — purchase_price errati

## Problema Identificato

Il campo `purchase_price` negli `order_items` rappresenta il costo **per unità** (lordo IVA). Il sistema calcola il costo totale come `purchase_price × quantity`. Per gli ordini con quantità > 1, i valori inseriti sono troppo alti — sembrano essere il costo **totale** anziché unitario, causando costi variabili astronomici.

### Dettaglio errori per ordine

| Ordine | Articolo | Qty | purchase_price attuale | Costo calcolato (qty × pp) | Problema |
|--------|----------|-----|----------------------|---------------------------|---------|
| **ORD-001** (€15K, target 35%) | Piatto doccia | 1 | 4.880 | 4.880 | OK (qty=1) ma margine risulta 20% non 35% |
| **ORD-001** | Rubinetteria | 1 | 7.015 | 7.015 | Troppo alto per target 35% |
| **ORD-002** (€8.5K, target 25%) | Finestra PVC | 3 | 4.890 | 14.670 | Costo > fatturato! |
| **ORD-002** | Persiana | 3 | 2.888 | 8.664 | Costo > fatturato! |
| **ORD-003** (€22K, target 10%) | Pannelli tetto | 50 | 14.640 | 732.000 | Assurdo |
| **ORD-003** | Tegole | 200 | 9.516 | 1.903.200 | Assurdo |
| **ORD-004** (€12K, target 20%) | Kit pannelli | 1 | 7.320 | 7.320 | Margine solo 0.3% |
| **ORD-004** | Inverter | 1 | 4.392 | 4.392 | |
| **ORD-005** (€6K, target 30%) | Pittura | 4 | 2.440 | 9.760 | Costo > fatturato! |
| **ORD-005** | Stucco | 2 | 2.684 | 5.368 | Costo > fatturato! |

## Correzione

Ricalcolo i `purchase_price` **per unità** (lordi IVA 22%) per ogni articolo, rispettando la formula:

**Margine = (Imponibile - Costo articoli netto - Squadre netto - Provvigioni) / Imponibile**

### Valori corretti

| Ordine | Target | Articolo | Qty | Nuovo purchase_price (lordo/unità) |
|--------|--------|----------|-----|------------------------------------|
| **ORD-001** (€15K) | 35% | Piatto doccia | 1 | 5.049 |
| | | Rubinetteria | 1 | 4.131 |
| **ORD-002** (€8.5K) | 25% | Finestra PVC | 3 | 1.218 |
| | | Persiana | 3 | 812 |
| **ORD-003** (€22K) | 10% | Pannelli tetto | 50 | 235 |
| | | Tegole | 200 | 39 |
| **ORD-004** (€12K) | 20% | Kit pannelli | 1 | 5.300 |
| | | Inverter | 1 | 3.534 |
| **ORD-005** (€6K) | 30% | Pittura | 4 | 603 |
| | | Stucco | 2 | 804 |

## Azione

10 istruzioni UPDATE sulla tabella `order_items` per correggere i `purchase_price`. Nessun file di codice da modificare.

