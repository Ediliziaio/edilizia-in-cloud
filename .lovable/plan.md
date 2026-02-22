

# Allineare icone azioni Venditori con Operai/Staff

## Problema
Nella tabella Venditori, la colonna Azioni usa stili diversi rispetto alla tabella Operai/Staff:
- **Operai**: icone ghost senza testo (UserPlus, FileText, Pencil, Trash2)
- **Venditori**: bottone outline con testo "Crea Account", e manca l'icona documenti

## Soluzione
Modificare la colonna Azioni in `SalespeopleConfig.tsx` per usare lo stesso stile degli Operai:
- Il bottone "Crea Account" diventa un'icona ghost con `UserPlus` (colore primary)
- Aggiungere il bottone "Documenti" con icona `FileText` (se applicabile, oppure omettere se i venditori non hanno allegati)
- Mantenere Pencil e Trash2 come gia sono (sono gia ghost icon)
- Per i venditori con account gia creato, mostrare un badge "Attivo" come stato invece del bottone nella colonna Account

## File coinvolto

| File | Modifica |
|---|---|
| `src/components/settings/SalespeopleConfig.tsx` | Cambiare il bottone "Crea Account" da outline+testo a ghost+icona UserPlus, stesso stile degli Operai |

## Dettaglio tecnico
Nel file `SalespeopleConfig.tsx`, nella riga della tabella dove si renderizza il bottone Account:
- Sostituire `<Button size="sm" variant="outline">...Crea Account</Button>` con `<Button variant="ghost" size="icon">...<UserPlus /></Button>`
- Per l'account gia attivo, usare un Badge come negli Operai invece del badge + check attuale

