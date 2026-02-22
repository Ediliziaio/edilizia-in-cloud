
# Fix colonna sinistra tagliata - Layout adattivo

## Problema

Con 360px e `grid-cols-3`, le 3 colonne Titolare/Follower/Call Center hanno circa 112px ciascuna, insufficiente per mostrare le label e i valori dei select senza troncamento.

## Soluzione

### Cambio layout Titolare/Follower/Call Center

**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`**

Sostituire il `grid-cols-3` con un layout a 2 righe:
- Prima riga: `grid-cols-2` con Titolare e Follower (piu spazio per ciascuno)
- Seconda riga: `grid-cols-2` con Call Center e un eventuale spazio vuoto, oppure Call Center a larghezza piena

Approccio scelto: **`grid-cols-2` unico**, con Call Center che occupa una cella nella seconda riga. Cosi ogni colonna ha circa 170px, sufficiente per le label e i select.

**Modifiche specifiche (riga ~495)**:
- Da: `<div className="grid grid-cols-3 gap-1.5">` con 3 `<div>` figli
- A: `<div className="grid grid-cols-2 gap-2">` con 3 `<div>` figli (Call Center nella riga sotto, occupa 1 cella)

### Tabs non troncate

Le tabs "Tutti i campi", "DND", "Azioni" (riga ~598-603) dovrebbero essere gia OK a 360px, ma per sicurezza abbreviare "Tutti i campi" in "Campi" se necessario.

## Riepilogo

| Modifica | Dettaglio |
|----------|-----------|
| Grid assegnazione | Da `grid-cols-3 gap-1.5` a `grid-cols-2 gap-2` |
| Layout | Titolare e Follower sulla prima riga, Call Center sotto |
