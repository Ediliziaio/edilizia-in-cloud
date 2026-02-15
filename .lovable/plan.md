

# Combobox "Categoria Prodotti" con Ricerca e Creazione

## Cosa cambia

Il campo "Categoria Prodotti" nel form di creazione/modifica fornitore viene trasformato da un semplice campo di testo in un combobox ricercabile che:

1. Mostra l'elenco delle categorie gia' usate da altri fornitori della stessa azienda
2. Permette di cercare tra le categorie esistenti
3. Permette di creare una nuova categoria digitando un testo libero

L'esperienza sara' identica allo screenshot di riferimento: un Popover con campo di ricerca e lista filtrata, con possibilita' di selezionare una categoria esistente o crearne una nuova.

---

## Dettaglio Tecnico

### File modificato: `src/components/settings/SuppliersConfig.tsx`

**1. Estrazione categorie esistenti**

Aggiungere un `useMemo` che estrae le categorie uniche dai fornitori gia' caricati:

```
const existingCategories = useMemo(() => {
  if (!suppliers) return [];
  const cats = new Set(suppliers.map(s => s.product_category).filter(Boolean));
  return Array.from(cats).sort();
}, [suppliers]);
```

Non serve una query aggiuntiva: i fornitori sono gia' caricati nella query `suppliers-config`.

**2. Sostituzione Input con Combobox**

Il campo `Input` per `product_category` (riga 427-428) viene sostituito con un componente Popover + Command (gia' disponibili nel progetto) che:

- Mostra un bottone trigger con il valore corrente o "Seleziona..."
- Apre un popover con campo di ricerca ("Cerca o crea categoria...")
- Lista le categorie esistenti filtrate per la ricerca
- Se il testo digitato non corrisponde a nessuna categoria, mostra un'opzione "Crea: [testo]" per aggiungere la nuova categoria
- Al click su una categoria esistente o su "Crea", imposta il valore nel form

**3. Stato aggiuntivo**

Aggiungere uno stato `categoryPopoverOpen` per gestire l'apertura del popover e `categorySearch` per il filtro di ricerca.

**4. Nessuna modifica al database**

Le categorie vengono derivate dai dati esistenti nella colonna `product_category` della tabella `suppliers`. Non servono nuove tabelle o colonne.

---

## Nessun file rimosso, nessun componente eliminato

L'unica modifica e' in `SuppliersConfig.tsx`: sostituzione di un `Input` con un combobox Popover+Command.

