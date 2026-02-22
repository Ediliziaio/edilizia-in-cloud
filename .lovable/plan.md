
# Aggiungere Custom Fields dinamici a "Gestisci campi" e tabella contatti

## Problema

Il pannello "Gestisci campi" mostra solo colonne statiche hardcoded. I custom fields creati dall'utente in Impostazioni > Campi personalizzati non compaiono, quindi non possono essere attivati come colonne nella tabella contatti.

## Soluzione

Rendere `ContactFieldsSheet` e `ContactsTable` consapevoli dei custom fields, passandoli dinamicamente da `MarketingContacts.tsx`.

## File da modificare

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactFieldsSheet.tsx` | Accettare prop `customFields`, unire ai COLUMNS statici per mostrare anche i custom fields |
| `src/components/marketing/ContactsTable.tsx` | Accettare prop `customFields` e `customFieldValues`, renderizzare celle per colonne custom (`cf_*`) |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Fetchare i valori dei custom fields per i contatti visibili, passarli a tabella e sheet |

## Dettagli tecnici

### 1. ContactFieldsSheet.tsx

- Aggiungere prop `customFields: { id: string; name: string; field_type: string }[]`
- Calcolare `allColumns` = `COLUMNS` statici + custom fields mappati come `{ key: "cf_<id>", label: nome_campo }`
- Usare `allColumns` invece di `COLUMNS` per filtrare campi attivi/inattivi
- Il tipo `ColumnKey` deve accettare stringhe custom (`cf_*`), quindi il draft usera `Set<string>` internamente

### 2. ContactsTable.tsx

- Aggiungere prop `customFields` e `customFieldValues: Record<string, Record<string, string>>` (mappa `contact_id -> field_id -> value`)
- Nel rendering delle celle, gestire il caso `default` nel switch: se `col.key` inizia con `cf_`, estrarre il valore da `customFieldValues[contact.id][fieldId]`
- Estendere il tipo `ColumnKey` per accettare stringhe generiche o mantenere la union + aggiungere i custom come stringhe

### 3. MarketingContacts.tsx

- Dopo aver fetchato i contatti, fetchare anche `marketing_contact_field_values` per i `contact_id` visibili
- Costruire la mappa `customFieldValues: Record<string, Record<string, string>>`
- Passare `customFields` e `customFieldValues` sia a `ContactsTable` che a `ContactFieldsSheet`
- Passare `customFields` anche a `ContactFieldsSheet`

### 4. Gestione tipo ColumnKey

Attualmente `ColumnKey` e una union type stretta derivata da `COLUMNS as const`. Per supportare chiavi dinamiche (`cf_<uuid>`):
- Cambiare `visibleColumns` da `Set<ColumnKey>` a `Set<string>`
- `ContactFieldsSheet` lavora con `Set<string>` internamente
- `ContactsTable` accetta `visibleColumns: Set<string>` e i `customFields` per sapere quali colonne custom renderizzare

### 5. Flusso dati

```text
MarketingContacts
  |-- useContactCustomFields() -> customFields[]
  |-- query contatti -> contactIds[]
  |-- query marketing_contact_field_values WHERE contact_id IN contactIds -> customFieldValues map
  |
  |-- ContactFieldsSheet(customFields) -> mostra COLUMNS + cf_* nel pannello
  |-- ContactsTable(customFields, customFieldValues) -> renderizza celle cf_*
```

## Risultato atteso

- Ogni custom field creato in Impostazioni appare automaticamente nel pannello "Gestisci campi"
- L'utente puo attivare/disattivare i custom fields come colonne
- I valori dei custom fields vengono mostrati nella tabella quando la colonna e attiva
- Nessun custom field e visibile di default (appare in "Aggiungi campi")
