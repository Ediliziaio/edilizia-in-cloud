

# Aggiunta bottone "Duplica" ai template

## Modifica

Un singolo file: `src/pages/azienda/settings/SettingsQuoteTemplates.tsx`

### Cosa fare

1. Aggiungere una funzione `handleDuplicate(tmpl)` che:
   - Copia tutti i campi del template
   - Rimuove `id`, `created_at`, `updated_at`
   - Imposta `is_default: false`
   - Rinomina in `"[nome] (copia)"`
   - Apre l'editor con questi dati (stessa logica di `handleNew` ma pre-compilato)

2. Aggiungere un bottone "Duplica" (icona `Copy`) nella card di ogni template nella griglia, accanto al bottone "Modifica".

### Dettagli tecnici

- Import `Copy` da lucide-react
- Il bottone Duplica va nella riga `flex gap-2` alla riga ~154, tra Modifica e Elimina
- La funzione setta `editId = null` (crea un nuovo record) e `editing = true`

