
# Fix gruppo "Assegnazione" mancante nel pannello Gestisci campi

## Problema trovato

Il pannello "Gestisci campi" (`ContactFieldsSheet.tsx`) ha un array `GROUP_ORDER` che definisce quali gruppi vengono visualizzati e in quale ordine. Attualmente manca il gruppo **"Assegnazione"**, che contiene la colonna "Call Center" aggiunta recentemente. Questo impedisce alla colonna "Call Center" di apparire nel pannello.

Le colonne **Pipeline** e **Fase pipeline** sono gia nel gruppo "Opportunita" che e correttamente incluso. Verificato anche che i dati fluiscono correttamente dal database (pipeline "Prova", fase "Da Chiamare").

## Modifica

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactFieldsSheet.tsx` | Aggiungere `"Assegnazione"` a `GROUP_ORDER` |

## Dettaglio tecnico

Linea 30 di `ContactFieldsSheet.tsx`:

```
// DA:
const GROUP_ORDER = ["Contatto", "Date", "Tag", "Opportunità", "Campi personalizzati"];

// A:
const GROUP_ORDER = ["Contatto", "Date", "Tag", "Opportunità", "Assegnazione", "Campi personalizzati"];
```

## Verifica

- Pipeline e Fase pipeline: gia visibili nella sezione "Opportunita" del pannello - funzionano correttamente
- Call Center: apparira nella nuova sezione "Assegnazione"
- Dati verificati nel database: contatti con pipeline "Prova" e fase "Da Chiamare" vengono mappati correttamente
