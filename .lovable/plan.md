

# Stabilizzazione Email Builder - Fix Shortcut Ctrl+Z durante editing inline

## Bug trovato

### Ctrl+Z/Ctrl+Y intercettato globalmente durante editing inline
Quando l'utente sta scrivendo testo direttamente dentro un blocco `contentEditable` (la feature inline editing appena aggiunta) e preme **Ctrl+Z**, il sistema intercetta il comando e esegue l'**undo globale** (ripristina l'intero stato dei blocchi) invece di permettere l'**undo nativo del browser** all'interno del campo di testo.

Questo causa un comportamento confuso: l'utente si aspetta di annullare l'ultima parola digitata, ma invece l'intero blocco viene riportato allo stato precedente.

**Stessa cosa per Ctrl+Y / Ctrl+Shift+Z** (redo).

## Fix

### File: `src/pages/azienda/marketing/DragDropEmailBuilder.tsx` (righe 148-161)

Aggiungere un controllo nel handler della tastiera: se l'elemento attivo (`document.activeElement`) ha l'attributo `contentEditable === "true"`, lasciare passare il comportamento nativo del browser senza intercettare l'evento.

```
const handler = (e: KeyboardEvent) => {
  // Se l'utente sta editando inline (contentEditable), 
  // lascia il comportamento nativo del browser
  const active = document.activeElement;
  if (active && (active as HTMLElement).isContentEditable) return;
  
  const isMod = e.ctrlKey || e.metaKey;
  // ...resto invariato
};
```

## Pulizia codice
Nessun codice morto trovato - il modulo e gia stato pulito nelle sessioni precedenti.

## Riepilogo

| Cosa | Dettaglio |
|------|-----------|
| Bug corretto | Ctrl+Z/Y ora funziona nativamente dentro i campi contentEditable |
| File modificato | `DragDropEmailBuilder.tsx` (3 righe aggiunte nel handler keyboard) |
| Rischio regressione | Zero - aggiunge solo un early return condizionale |

