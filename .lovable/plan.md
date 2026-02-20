

# Piano: Vista Globale Errori con Statistiche Aggregate

## Cosa faremo

Creeremo una nuova pagina `/azienda/errori` accessibile dal menu laterale, che mostra **tutti gli errori di tutti gli ordini** dell'azienda con statistiche aggregate per categoria, tipo e andamento temporale.

## Struttura della pagina

### Sezione 1 - Stat Cards (in alto)
- **Totale perdite**: somma di tutti gli errori
- **Errori Merce** vs **Errori Manodopera**: breakdown per tipo
- **Categoria piu frequente**: la categoria con piu occorrenze
- **Errori questo mese**: totale del mese corrente

### Sezione 2 - Grafici
- **Grafico a barre orizzontali**: perdite per categoria (fornitore, misura, quantita, lavorazione, comunicazione, altro), ordinato dal piu alto
- **Grafico a barre verticali**: andamento mensile errori (ultimi 6 mesi), stackato per tipo (Merce/Manodopera)

### Sezione 3 - Tabella errori completa
- Tutte le colonne: Data, Ordine (link), Tipo, Categoria, Importo, Descrizione
- Filtri: per categoria, per tipo, per range date
- Ordinamento per data (piu recente prima)

## Integrazione nel progetto

### Navigazione
- Nuova voce nel menu: "Errori" con icona `AlertTriangle`, dopo "Attivita"
- Permesso: `canViewOrders` (stesso degli ordini)
- Modulo: `orders`

### Routing
- Rotta: `/azienda/errori`

---

## Dettagli tecnici

### Nuovi file

| File | Descrizione |
|------|-------------|
| `src/pages/azienda/GlobalErrors.tsx` | Pagina principale con query, filtri, stat cards, grafici e tabella |

### File da modificare

| File | Intervento |
|------|-------------|
| `src/App.tsx` | Import `GlobalErrors` + rotta `/azienda/errori` |
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere voce "Errori" nel menu |

### Query database
La pagina eseguira una singola query su `order_errors` con join su `orders` per ottenere il codice/descrizione ordine:

```typescript
const { data } = await supabase
  .from("order_errors")
  .select("*, orders!inner(order_code, description)")
  .eq("company_id", companyId)
  .order("error_date", { ascending: false });
```

Le RLS gia presenti su `order_errors` (company admin + staff con `can_view_orders`) coprono l'accesso. Nessuna migrazione database necessaria.

### Grafici
Utilizzeremo `recharts` (gia installato) con:
- `BarChart` orizzontale per breakdown categorie
- `BarChart` verticale per andamento mensile

### Filtri
- Select per categoria (tutte le 6 categorie + "Tutte")
- Select per tipo (Merce/Manodopera + "Tutti")
- Date range opzionale
- Tutti calcolati lato client sui dati gia caricati

