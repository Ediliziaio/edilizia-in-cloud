

# Aggiungere "Full Name" ai campi di sistema in Campi Personalizzati

## Contesto

- `{{ contact.email }}` corrisponde esattamente al campo email del contatto. Tutti i placeholder `{{ contact.xxx }}` mappano i campi della tabella `marketing_contacts`.
- Il campo `fullname` esiste solo come helper per l'importazione CSV (split automatico in nome + cognome), ma non appare nella lista dei campi di sistema nella pagina Campi Personalizzati.

## Modifica

### File: `src/components/settings/CustomFieldsConfig.tsx`

Aggiungere una riga nella lista `BUILTIN_FIELDS`, subito dopo `Last Name`:

```text
{ id: "sys_full_name", name: "Full Name", object: "Contatto", folder: "contact",
  folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.full_name }}",
  createdAt: "2024-01-01", isSystem: true },
```

Questo campo e "virtuale" (non e una colonna DB, ma viene costruito da `first_name + last_name`). In fase di import CSV, se si mappa una colonna su `fullname`, il sistema splitta automaticamente il valore in nome e cognome.

## Riepilogo

| Cosa | Dettaglio |
|------|-----------|
| File modificato | `CustomFieldsConfig.tsx` |
| Modifica | 1 riga aggiunta a `BUILTIN_FIELDS` |
| Impatto | Il campo "Full Name" apparira nella tabella campi personalizzati come campo di sistema (lucchetto, non eliminabile) |

