

## Modifica label "Super Admin" → "Gestione Team"

### File coinvolti

1. **`src/config/adminSettingsNav.ts`** (linea 47)
   - Cambiare `label: "Super Admin"` in `label: "Gestione Team"`

2. **`src/pages/admin/AdminSettings.tsx`** (linea 26)
   - Cambiare il testo `Super Admin` in `Gestione Team` nel `TabsTrigger`

### Implementazione

Entrambe le modifiche sono testuali semplici, nessuna logica da aggiornare. Il cambiamento sarà visibile:
- Nella navigazione sidebar delle impostazioni admin
- Nel tab attivo della pagina Impostazioni

