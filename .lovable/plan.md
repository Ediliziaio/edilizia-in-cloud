

# Modifica Card Opportunita - Rimuovere label e sostituire icona Copia con Etichetta

## Modifiche richieste

### 1. Rimuovere i testi descrittivi dalle righe di dettaglio
Attualmente la card mostra:
- "Fonte dell'opportunita: facebook"
- "Valore dell'opportunita: EUR 0,00"
- "Email del contatto: email@..."
- "Telefono del contatto: 342..."

Deve mostrare SOLO i valori senza le label:
- facebook
- EUR 0,00
- email@...
- 342...

### 2. Sostituire icona "Copia nome" con "Etichetta/Tag"
Nella barra azioni in basso, la terza icona (attualmente `Copy` per copiare il nome) viene sostituita con l'icona `Tag` di Lucide. Al click mostrera i tag/etichette associati all'opportunita (per ora toast informativo "Tag: funzionalita in arrivo").

---

## Dettaglio tecnico

### File modificato (1)
**`src/components/opportunities/OpportunityCard.tsx`**

### Modifiche specifiche:
1. Nella sezione "Detail rows" (righe 126-135): rimuovere il componente `DetailRow` con le label e mostrare solo i valori come semplici `<p>` o `<span>` con stile appropriato
2. Nell'array `actionIcons` (riga 95): sostituire `{ icon: Copy, tooltip: "Copia nome", action: handleCopyName }` con `{ icon: Tag, tooltip: "Etichette", action: handleComingSoon("Etichette") }`
3. Rimuovere import `Copy`, aggiungere import `Tag` da lucide-react
4. Rimuovere la funzione `handleCopyName` (non piu usata)
5. Il componente `DetailRow` viene semplificato o rimosso, mostrando solo i valori in righe separate

