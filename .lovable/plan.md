
# Redesign Pagina Implementazioni - Stile Launchpad

## Cosa cambia

La pagina "Implementazioni" viene ridisegnata per somigliare al riferimento visivo fornito (stile Launchpad). Le aziende non sono piu' tutte visibili con checkbox, ma si accede alla selezione tramite un **dialog/popup** dedicato.

---

## Nuovo Layout per ogni modulo

```text
+------------------------------------------------------------------+
| Messaggistica (BETA)                                              |
| (icona occhio) Visibile per tutte le aziende / X aziende selez.  |
|------------------------------------------------------------------|
| Messaggistica (BETA)                                              |
| Modulo di messaggistica con AI per gestire conversazioni e        |
| automatizzare task.                                               |
|                                                                    |
|------------------------------------------------------------------|
| [Abilitato per aziende specifiche]  [Attiva funzionalita']       |
+------------------------------------------------------------------+
```

### Comportamento pulsanti

- **"Attiva funzionalita'"** (primary, blu): attiva il modulo per **tutte** le aziende con un click. Diventa "Disattiva funzionalita'" se gia' attivo per tutte.
- **"Abilitato per aziende specifiche"** (outline): apre un **Dialog** con la lista delle aziende e checkbox per selezionare/deselezionare singolarmente. Include "Seleziona tutte" / "Deseleziona tutte" nel dialog.

### Sottotitolo dinamico

Sotto il titolo del modulo, una riga con icona occhio mostra:
- "Visibile per tutte le aziende" se tutte attive
- "Attivo su X/Y aziende" se solo alcune
- "Non attivo" se nessuna

---

## Dettaglio tecnico

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/admin/Implementations.tsx` | Riscrittura completa del layout card + aggiunta Dialog per selezione aziende |

### Nessun nuovo file

Il Dialog usa i componenti `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` gia' presenti in `src/components/ui/dialog.tsx`.

### Pulizia

- Rimosso import `useState` inutilizzato (era importato ma non usato)
- La griglia checkbox viene spostata dentro il Dialog, rendendo la card principale piu' pulita e leggibile

### Logica invariata

- Toggle singolo e bulk usano le stesse mutation gia' esistenti
- Query dati identica
- Nessuna modifica al database
