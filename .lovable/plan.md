

# Miglioramenti Contact Dialog: Citta/Provincia + Fullname Import

## 1. Aggiungere Citta e Provincia al dialog contatto

### File: `src/components/marketing/ContactDialog.tsx`

- Aggiungere `city` e `province` a `ContactFormData` e a `emptyForm`
- Aggiungere i due campi nel form tra "Azienda" e "Tag", in una riga grid a 2 colonne
- Aggiornare `initialData` mapping in `MarketingContacts.tsx`

### File: `src/pages/azienda/marketing/MarketingContacts.tsx`

- Aggiungere `city` e `province` all'`initialData` passato al dialog per l'editing
- Aggiungere `city` e `province` ai CSV_FIELDS per l'importazione
- Aggiungere `city` e `province` alla logica di export CSV
- Aggiungere `city` e `province` alla mappatura `toInsert` nell'import

## 2. Fix label Email obbligatoria

Il codice attuale mostra gia `*` condizionale, ma si aggiunge chiarezza rendendo le label piu evidenti con un testo helper sotto i campi quando entrambi sono vuoti.

## 3. Campo "Fullname" per importazione CSV

### Logica

- Aggiungere `fullname` come campo importabile in `CSV_FIELDS`
- Durante l'import, se `fullname` e presente e `first_name` non lo e:
  - Splittare `fullname` al primo spazio: la prima parte diventa `first_name`, il resto diventa `last_name`
  - Se non c'e spazio, tutto va in `first_name`

### File: `src/pages/azienda/marketing/MarketingContacts.tsx`

Aggiungere in CSV_FIELDS:
```text
{ key: "fullname", label: "Nome Completo", required: false }
```

Nel `handleImport`, aggiungere logica di split:
```text
let firstName = r.first_name?.trim() || "";
let lastName = r.last_name?.trim() || "";
if (!firstName && r.fullname?.trim()) {
  const parts = r.fullname.trim().split(/\s+/);
  firstName = parts[0];
  lastName = parts.slice(1).join(" ");
}
```

## Riepilogo modifiche

| File | Cosa |
|------|------|
| `ContactDialog.tsx` | Aggiungere city, province a form e interface |
| `MarketingContacts.tsx` | city/province in initialData, export, import; fullname split in import |

- 2 file modificati
- Nessuna migrazione DB necessaria (city e province esistono gia nella tabella `marketing_contacts`)
- Nessun cambiamento funzionale ai flussi esistenti

