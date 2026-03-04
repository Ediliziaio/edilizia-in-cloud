

# Fix Sezione Utenti - Profilo + Ruoli & Autorizzazioni stile GHL

## Problemi identificati

### 1. Profilo Utente - Manca reset password
Il tab profilo attuale mostra solo Nome, Cognome, Email, Telefono. Mancano:
- **Bottone "Reset Password"** per admin che gestisce utenti
- **Campo Estensione telefono** (come GHL)

### 2. Ruoli & Autorizzazioni - Problemi critici

**a) Manca selezione ruolo Utente/Amministratore**
Attualmente se l'utente è `company_admin` mostra solo "Accesso completo" senza possibilità di cambiare. Serve un **Select** in alto per scegliere tra "Amministratore" e "Utente" (come GHL), con possibilità di cambiare ruolo.

**b) Moduli incompleti - Gestione Interna**
La lista attuale ha solo 9 moduli. Mancano rispetto a `sidebarConfig.ts`:
- **Cruscotto Aziendale** (`can_view_cruscotto` - esiste già nel DB!)
- **Costi** (usa `can_view_forecast`)
- **Attività** (usa `can_view_orders`)
- **Errori** (usa `can_view_orders`)
- **Messaggistica** (usa `can_view_orders`)
- **Automazioni** (usa `can_view_settings`)

**c) Marketing e Vendita - Un solo modulo generico**
Attualmente c'è solo "Marketing & CRM" come unico toggle. Serve espansione in sotto-voci come da sidebarConfig:
- Dashboard Marketing
- Contatti
- Opportunità
- Attività Marketing
- Appuntamenti
- Automazioni Marketing
- Agente AI
- Email Marketing
- WhatsApp
- Reportistica

(Tutti mappati su `can_view_marketing` / `can_edit_marketing` per ora, ma presentati granularmente nella UI)

### 3. StaffPermissions interface incompleta
L'interface TypeScript non include `can_view_cruscotto` che esiste nel DB.

## Piano di implementazione

### File 1: `src/components/users/PermissionsDialog.tsx`
- Aggiungere `can_view_cruscotto` alla interface `StaffPermissions`

### File 2: `src/components/users/UserProfileTab.tsx`
- Aggiungere bottone "Reset Password" (chiama `supabase.auth.admin` o edge function)
- Aggiungere campo "Estensione" telefono

### File 3: `src/components/users/UserRolesPermissionsTab.tsx`
Riscrittura completa stile GHL:
- **Select ruolo** in alto: "Amministratore" / "Utente"
- Se Amministratore: mostra messaggio accesso completo, salva cambio ruolo nel DB
- Se Utente: mostra tutti i permessi granulari
- **Cruscotto Aziendale** come categoria separata
- **Gestione Interna** con TUTTI i moduli (Dashboard, Ordini, Magazzino, Calendario, Clienti, Dipendenti, Ticket, Previsionale, Costi, Attività, Errori, Messaggistica, Automazioni, Impostazioni)
- **Marketing e Vendita** espanso con tutte le sotto-voci (Dashboard, Contatti, Opportunità, Attività, Appuntamenti, Automazioni, Agente AI, Email Marketing, WhatsApp, Reportistica)
- Layout GHL: sidebar sinistra con categorie cliccabili, contenuto a destra con toggle + checkbox

### File 4: `src/pages/azienda/settings/SettingsUserDetail.tsx`
- Gestire cambio ruolo (update `user_roles` table)
- Passare callback `onChangeRole` al tab permessi

### Nessuna migrazione DB necessaria
`can_view_cruscotto` esiste già nella tabella `staff_permissions`. I moduli Marketing e Vendita condividono `can_view_marketing`/`can_edit_marketing` che esistono già.

