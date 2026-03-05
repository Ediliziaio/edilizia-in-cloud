

# Dettaglio Articolo Magazzino — Dialog on click

## Obiettivo
Cliccando su un articolo nella lista magazzino si apre un dialog con tutte le informazioni disponibili sull'articolo.

## Modifiche

**1. Nuovo componente `src/components/warehouse/WarehouseItemDetailDialog.tsx`**

Dialog modale che mostra:
- **Nome articolo** e descrizione
- **Quantità** e **prezzo di acquisto**
- **Stato** corrente (con colore) + possibilità di cambiarlo
- **Fornitore** (nome)
- **Ordine** collegato (codice + cliente) con link al dettaglio ordine
- **Date**: data posa prevista, giorni rimanenti (con indicatore urgenza/ritardo)
- **Note** (editabili inline)
- **Giacenza corrispondente** (se presente match in stock)
- **Ultimo aggiornamento** (updated_at)

**2. Modifica `src/components/warehouse/WarehouseListView.tsx`**

- Aggiungere stato `selectedItem` per tracciare l'articolo selezionato
- Rendere la riga dell'articolo cliccabile (onClick sulla div principale, escludendo checkbox e select stato)
- Renderizzare `WarehouseItemDetailDialog` in fondo al componente

