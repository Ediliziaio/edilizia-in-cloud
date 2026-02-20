

# Piano: Categorizzazione Errori per Frequenza

## Cosa faremo

Attualmente gli errori hanno solo due tipi generici: "Merce" e "Manodopera". Aggiungeremo un campo **categoria** per classificare meglio la causa dell'errore, in modo da poter analizzare quali errori si ripetono di piu.

### Categorie previste

- **Errore fornitore** - il fornitore ha consegnato materiale sbagliato o difettoso
- **Errore misura** - misure sbagliate in fase di rilievo o ordine
- **Errore quantita** - quantita ordinata errata (troppa o troppo poca)
- **Errore lavorazione** - errore durante l'esecuzione del lavoro
- **Errore comunicazione** - incomprensione con cliente/fornitore/squadra
- **Altro** - errori non classificabili

### Modifiche

1. **Database**: aggiungere colonna `error_category` (TEXT, default `'altro'`) alla tabella `order_errors`
2. **Componente `OrderErrors.tsx`**:
   - Aggiungere un Select per la categoria nel dialog di creazione
   - Mostrare la categoria come badge su ogni errore registrato
   - Aggiungere un mini-riepilogo per categoria nel sommario (es. "Errore misura: 2 volte - 500 EUR")
3. **Nessuna modifica** a `OrderEconomics.tsx` (il totale errori resta invariato)

---

## Dettagli tecnici

### Migrazione SQL

```sql
ALTER TABLE order_errors
ADD COLUMN error_category TEXT NOT NULL DEFAULT 'altro';
```

### Componente `OrderErrors.tsx`

- Nuovo array `ERROR_CATEGORIES` con le 6 categorie e relative icone/label
- Nuovo campo Select "Categoria Errore" nel dialog di creazione, posizionato dopo "Tipo Errore"
- Badge colorato per categoria visibile nella lista errori
- Sezione riepilogo aggiornata: oltre ai totali per tipo (Merce/Manodopera), mostra anche un breakdown per categoria con conteggio occorrenze e importo totale, ordinato dal piu frequente

### File coinvolti

- `supabase/migrations/` - nuova migrazione per `error_category`
- `src/components/orders/OrderErrors.tsx` - campo categoria + riepilogo per frequenza

