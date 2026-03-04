

# Espansione Permessi Marketing + Edit Impostazioni

## Problema
Marketing e Vendita ha un solo toggle (`can_view_marketing` / `can_edit_marketing`) per tutti i 10 sotto-moduli. L'utente vuole toggle individuali come Gestione Interna. Inoltre manca l'opzione Visualizza/Modifica per Impostazioni.

## Interventi

### 1. Migrazione DB - Nuove colonne
Aggiungere alla tabella `staff_permissions`:

**Marketing (10 sotto-moduli, view + edit ciascuno):**
- `can_view_marketing_dashboard`, `can_view_marketing_contacts`, `can_edit_marketing_contacts`
- `can_view_marketing_opportunities`, `can_edit_marketing_opportunities`
- `can_view_marketing_activities`, `can_view_marketing_appointments`
- `can_view_marketing_automations`, `can_view_marketing_ai_agent`
- `can_view_marketing_email`, `can_view_marketing_whatsapp`
- `can_view_marketing_reports`

**Impostazioni:**
- `can_edit_settings`

Tutte `boolean DEFAULT false`. I vecchi campi `can_view_marketing` / `can_edit_marketing` restano per backward compatibility e vengono usati come "master toggle" opzionale.

### 2. Update `StaffPermissions` interface
In `PermissionsDialog.tsx`, aggiungere tutti i nuovi campi all'interface TypeScript.

### 3. Update `UserRolesPermissionsTab.tsx`
- **Marketing e Vendita**: Espandere in 10 moduli individuali, ognuno con il proprio toggle view e, dove applicabile, checkbox edit:
  - Dashboard Marketing (`can_view_marketing_dashboard`)
  - Contatti (`can_view_marketing_contacts` / `can_edit_marketing_contacts`)
  - Opportunita (`can_view_marketing_opportunities` / `can_edit_marketing_opportunities`)
  - Attivita (`can_view_marketing_activities`)
  - Appuntamenti (`can_view_marketing_appointments`)
  - Automazioni (`can_view_marketing_automations`)
  - Agente AI (`can_view_marketing_ai_agent`)
  - Email Marketing (`can_view_marketing_email`)
  - WhatsApp (`can_view_marketing_whatsapp`)
  - Reportistica (`can_view_marketing_reports`)

- **Impostazioni**: Aggiungere `editKey: "can_edit_settings"` per mostrare Visualizza/Modifica.

- Aggiornare `DEFAULT_PERMISSIONS`, `handleSelectAll`, `handleDeselectAll` con i nuovi campi.

### 4. Update sidebar permission checks
Aggiornare i controlli di accesso nella sidebar e nelle pagine marketing per usare i nuovi permessi granulari al posto di `can_view_marketing`.

### 5. Update dialoghi legacy
Allineare `PermissionsDialog.tsx`, `StaffUserDialog.tsx` e `CompanyTeamTab.tsx` con i nuovi campi.

