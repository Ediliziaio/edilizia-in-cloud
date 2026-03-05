

# Nuovi Filtri Ordini + UX Migliorata

## Problema attuale
I filtri sono disposti su 2 righe con ~12 elementi visibili contemporaneamente, creando un "mapazzone". Mancano i filtri per Venditore, Manodopera e Fornitore.

## Soluzione UX: Filtri a due livelli

**Riga 1 — Filtri principali** (sempre visibili): Ricerca + Stato + Pagamento + Mese

**Riga 2 — Filtri avanzati collassabili**: Un pulsante "Più filtri" con badge contatore mostra/nasconde la riga con: Cliente, Venditore, Manodopera, Fornitore, Importo, Date (contratto, magazzino, posa). Quando un filtro avanzato è attivo, la riga resta aperta e il pulsante mostra il conteggio filtri attivi. Chips/badge colorati indicano i filtri attivi.

## Nuovi filtri da aggiungere

| Filtro | Dati sorgente | Logica |
|--------|--------------|--------|
| **Venditore** | `salespeopleMap` (già costruita in OrdersList) | Mostra ordini dove `salespeopleMap.get(orderId)` contiene il venditore selezionato |
| **Manodopera** | `laborMap` (già costruita in OrdersList) | Mostra ordini dove `laborMap.get(orderId)` contiene il lavoratore/squadra selezionato |
| **Fornitore** | Nuova query `order_items.supplier_id` + `suppliers(id, name)` | Mostra ordini che hanno almeno un item con quel fornitore |

## Dati aggiuntivi necessari (OrdersList.tsx)

1. **Fornitori per ordine**: Espandere la query `order_items` per includere `supplier_id`, poi query `suppliers` per i nomi. Costruire `supplierMap: Map<string, string[]>` (order_id → nomi fornitori).
2. **Liste uniche** per popolare i Select: `uniqueSalespeople`, `uniqueLabor`, `uniqueSuppliers` — estratti dalle mappe esistenti.

## Modifiche ai file

### OrdersFilters.tsx
- Aggiungere stato `showAdvanced` per collassare/espandere la seconda riga
- Riga 1: Ricerca + Stato + Pagamento + Mese (invariata)
- Pulsante "Più filtri" con badge contatore filtri avanzati attivi
- Riga 2 (collassabile): Cliente, Venditore, Manodopera, Fornitore, Importo, 3x Date
- Nuove props: `salespersonFilter`, `laborFilter`, `supplierFilter` + relativi `onChange` + liste uniche
- Bottone "Pulisci filtri" resta in fondo alla riga 2

### OrdersList.tsx
- Aggiungere 3 nuovi state: `salespersonFilter`, `laborFilter`, `supplierFilter`
- Aggiungere query per `suppliers` (nomi) e costruire `supplierMap`
- Aggiungere `uniqueSalespeople`, `uniqueLabor`, `uniqueSuppliers` con `useMemo`
- Aggiungere logica di filtraggio per i 3 nuovi filtri in `filteredOrders`
- Aggiornare `hasAnyFilter` e `clearAllFilters`
- Passare nuove props a `<OrdersFilters>`

Nessuna migrazione DB necessaria — i dati sono già tutti nelle tabelle esistenti.

