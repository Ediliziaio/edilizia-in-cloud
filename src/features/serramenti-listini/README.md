# Serramenti — Listini Avanzati

Feature modulare per gestire il listino prezzi del vertical serramentista
(finestre, porte, scorrevoli) con il flusso commerciale reale:

```
Fornitore → Azienda (carica griglia)
         → Sconto fornitore (−X%)
         → Ricarico azienda (+Y%)
         → Maggiorazioni assi (colore, vetro, telaio)
         → Manodopera (tariffa separata)
         → Prezzo cliente finale
```

## Isolamento

**Tutto il codice in questa cartella è opt-in** dietro feature flag
`listini_serramenti_avanzati` (DB: `platform_feature_flags`). Non tocca:

- Fatturazione / scadenzario / banking
- Cantieri / computo metrico / ordini
- Clienti / contatti / documenti
- Preventivatore verticale non-serramenti

L'unico punto di integrazione con il resto dell'app è il **wizard preventivo
serramentista** (`src/components/marketing/preventivi/QuoteWizardSerramenti.tsx`),
che in futuri step leggerà il prezzo dalla griglia fornitore applicando
sconto+ricarico+assi. Modifiche a quel file sono surgical: nessun cambio al
flusso preventivo non-serramenti.

## Struttura

```
src/features/serramenti-listini/
├── components/     Editor matrice, dialog import, preview griglia, ecc.
├── hooks/          useSupplierCatalogs, useProductLines, useFamilyGrid, ecc.
├── pages/          Pagine route-level (lista fornitori, editor, ecc.)
├── types/          Interfacce TypeScript del dominio
├── utils/          Pricing formula, parser Excel/CSV, anomaly detection
└── data/           Seed icone SVG tipologie + template fornitori
```

## Backend correlato

```
supabase/migrations/
  20260917000013_*  feature flag
  20260917000014_*  catalogo base tipologie
  20260917000015_*  supplier_catalogs + supplier_product_lines
  20260917000016_*  listino_griglia.axis_config + supplier tracking
  ...

supabase/functions/
  serramenti-installa-catalogo/   edge fn: seed 20 tipologie base nell'azienda
  serramenti-estrai-griglia-pdf/  edge fn: AI Vision estrae griglia da PDF
```

## Step di sviluppo

Vedi [`docs/status/STATUS_SERRAMENTI_LISTINI.md`](../../../docs/status/STATUS_SERRAMENTI_LISTINI.md).
