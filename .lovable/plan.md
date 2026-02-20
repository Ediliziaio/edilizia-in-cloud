
# Piano: Aggiunta Articoli dall'Anteprima + Sezione Errori Ordine

## Cosa faremo

### 1. Aggiungere articoli direttamente dall'anteprima ordine
Attualmente nella pagina dettaglio ordine, la lista articoli appare solo se ci sono gia articoli e non permette di aggiungerne di nuovi. Modificheremo la pagina per:
- Mostrare sempre la sezione "Articoli dell'Ordine" (anche se vuota)
- Aggiungere un pulsante "Aggiungi Articolo" che inserisce nuovi articoli direttamente nel database
- Utilizzare il dialog esistente di `OrderItemsList` con `editable=true` per la creazione

### 2. Nuova sezione "Errori" nell'ordine
Una nuova sezione per tracciare errori/perdite economiche legate all'ordine, con:
- **Tipo errore**: Merce (errore ordinazione materiale) o Manodopera (errore lavorazione)
- **Importo perso**: quanto e costato l'errore
- **Motivo/Descrizione**: testo libero per spiegare cosa e andato storto
- **Data**: quando e avvenuto l'errore
- Riepilogo con totale errori e integrazione nel Conto Economico

---

## Dettagli tecnici

### Database - Nuova tabella `order_errors`

```sql
CREATE TABLE order_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  error_type TEXT NOT NULL DEFAULT 'merce', -- 'merce' | 'manodopera'
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  error_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Con policy RLS per company_admin e super_admin (stesse policy degli altri sotto-oggetti dell'ordine).

### Componente `OrderErrors`
Nuovo componente `src/components/orders/OrderErrors.tsx`:
- Card con lista degli errori registrati
- Dialog per aggiungere/modificare un errore
- Select per tipo (Merce / Manodopera)
- Campo importo, descrizione obbligatoria, data
- Possibilita di eliminare errori
- Totale errori visibile in fondo

### Modifiche a `OrderDetail.tsx`
- Rimuovere la condizione `displayItems.length > 0` per mostrare sempre la sezione articoli
- Passare `editable={true}` a `OrderItemsList` per permettere l'aggiunta
- Aggiungere mutazione per inserire nuovi articoli nel database
- Inserire la nuova sezione `OrderErrors` nella sidebar (sotto Manodopera/Provvigioni)

### Modifiche a `OrderEconomics.tsx`
- Fetch degli errori dalla tabella `order_errors`
- Aggiungere sezione "ERRORI/PERDITE" con totale
- Sottrarre il totale errori dal margine lordo

### Pulizia cascata
- Aggiungere delete di `order_errors` nella mutazione di eliminazione ordine (gia gestito dal CASCADE su FK, ma per sicurezza)

### File coinvolti
- `src/pages/azienda/OrderDetail.tsx` - mostrare sempre articoli + sezione errori
- `src/components/orders/OrderErrors.tsx` - nuovo componente
- `src/components/orders/OrderEconomics.tsx` - integrare errori nel conto economico
- Migrazione SQL per la nuova tabella
