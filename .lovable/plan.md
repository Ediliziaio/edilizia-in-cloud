

# Aggiungere colori allo stato nella lista magazzino

## Problema
Nella vista lista del magazzino, i selettori di stato ("Da Ordinare", "Ordinato", "In Magazzino", "Installato") sono tutti grigi/neutri senza distinzione visiva.

## Soluzione
Applicare i colori già definiti in `STATUS_CONFIG` al `SelectTrigger` di ogni articolo, così che il selettore abbia il colore di sfondo e testo corrispondente allo stato corrente.

## Modifiche

**`src/components/warehouse/WarehouseListView.tsx`**:
- Importare `STATUS_CONFIG` (già importato)
- Al `SelectTrigger` (attualmente `className="w-32 h-8 text-xs"`), aggiungere dinamicamente le classi di colore dallo `STATUS_CONFIG[item.status]`: background color + text color
- Es: "Da Ordinare" → sfondo ambra, "Ordinato" → sfondo blu, "In Magazzino" → sfondo verde, "Installato" → sfondo grigio

Risultato: ogni riga mostra immediatamente lo stato con il colore corretto, migliorando la leggibilità a colpo d'occhio.

