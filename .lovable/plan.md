

# Redesign Campi Personalizzati - Stile GHL

## Panoramica
Riscrivere la pagina "Campi Personalizzati" nelle impostazioni per replicare il layout GHL: una tabella unificata che mostra sia i **campi di sistema** (obbligatori, non modificabili/eliminabili) sia i **campi personalizzati** creati dall'utente, con la possibilita di aggiungere nuovi campi.

---

## Layout dalla screenshot GHL

### Header
- Tabs: "Tutti i campi" | "Cartelle" | "Campi eliminati"
- Solo "Tutti i campi" sara funzionale (gli altri placeholder)
- Bottoni in alto a destra: "Aggiungi cartella" (placeholder) + "+ Aggiungi campo" (funzionale)

### Barra ricerca
- Input "Cerca" con icona lente
- A destra: "Raggruppa per: Tutto" dropdown

### Tabella unificata
Colonne:
- **Checkbox** (per selezione multipla, placeholder)
- **Nome Del Campo** - nome leggibile
- **Oggetto** - "Contatto" oppure "Opportunita"
- **Cartella** - badge colorato con sezione (es. "Contatto", "General Info", "Additional Info")
- **Chiave Univoca** - chiave tecnica tra doppie graffe, es. `{{ contact.first_name }}`, con icona copia
- **Creato Il** - data di creazione

### Campi di sistema (built-in)
Campi predefiniti non eliminabili, sempre presenti in tabella. Suddivisi per oggetto:

**Contatto - sezione "Contatto":**
- First Name -> `{{ contact.first_name }}`
- Last Name -> `{{ contact.last_name }}`
- Email -> `{{ contact.email }}`
- Phone -> `{{ contact.phone }}`
- Date Of Birth -> `{{ contact.date_of_birth }}`
- Contact Source -> `{{ contact.source }}`
- Contact Type -> `{{ contact.type }}`

**Contatto - sezione "General Info":**
- Business Name -> `{{ contact.company_name }}`
- Street Address -> `{{ contact.address }}`
- City -> `{{ contact.city }}`
- State -> `{{ contact.province }}`
- Postal Code -> `{{ contact.postal_code }}`
- Country -> `{{ contact.country }}`
- Website -> `{{ contact.website }}`

I campi personalizzati (dal database `marketing_custom_fields`) appaiono nella stessa tabella con la loro sezione e una chiave univoca generata dal nome, es. `{{ contact.nome_campo_custom }}`.

### Footer tabella
- Contatore "Presentazione 1 a N di N risultati"
- Selettore "Dimensione pagina: 200"
- Paginazione (se servisse)

---

## Dettaglio tecnico

### File: `src/components/settings/CustomFieldsConfig.tsx`
Riscrittura completa:
- Definire un array costante `BUILTIN_FIELDS` con tutti i campi di sistema (nome, oggetto, cartella, chiave, data creazione fissa, `isSystem: true`)
- Unire `BUILTIN_FIELDS` + campi custom dal database in un'unica lista
- Campi di sistema: nessun checkbox, nessun bottone elimina
- Campi custom: checkbox + bottone elimina attivo
- Filtro ricerca per nome campo
- Dialog "Aggiungi campo" invariato nella logica (nome, tipo, sezione, opzioni)
- Bottone copia su chiave univoca (clipboard)

### Nessuna modifica al database
I campi di sistema sono definiti come costante nel frontend, non servono nuove tabelle o colonne.

---

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/settings/CustomFieldsConfig.tsx` | Riscrittura completa - layout GHL con campi di sistema + custom |

## Cosa NON cambia
- Tabella `marketing_custom_fields` e RLS invariate
- Dialog di creazione campo invariato nella logica
- Pagina wrapper `SettingsCustomFields.tsx` invariata
- Routing e sidebar invariati
