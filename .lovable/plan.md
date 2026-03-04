

# Fix Permessi Utente - Bug Toggle + Pulizia Codice

## Problema principale

Il bug e causato dal fatto che **piu moduli UI condividono la stessa chiave DB**:
- Tutti i 10 moduli Marketing puntano a `can_view_marketing` → togglare uno li attiva tutti
- "Costi" e "Previsionale" condividono `can_view_forecast`
- "Attivita", "Errori", "Messaggistica" condividono `can_view_orders`
- "Automazioni" e "Impostazioni" condividono `can_view_settings`

Il DB ha solo 11 permessi view e 5 permessi edit. La UI mostra 25 toggle separati che pero controllano gli stessi campi.

## Soluzione

Ristrutturare la UI per mostrare **un toggle per ogni permesso DB reale**, elencando sotto ciascuno i moduli inclusi. Questo elimina il bug e rende la UI onesta.

### File: `src/components/users/UserRolesPermissionsTab.tsx`

Riscrivere `PERMISSION_CATEGORIES` con moduli 1:1 rispetto ai campi DB:

**Cruscotto Aziendale**
- Cruscotto Aziendale (`can_view_cruscotto`)

**Gestione Interna**
- Dashboard (`can_view_dashboard`)
- Ordini, Attivita, Errori, Messaggistica (`can_view_orders` / `can_edit_orders`) - con sotto-etichetta "Include: Attivita, Errori, Messaggistica"
- Magazzino (`can_view_warehouse` / `can_edit_warehouse`)
- Calendario (`can_view_calendar`)
- Clienti (`can_view_customers` / `can_edit_customers`)
- Dipendenti (`can_view_employees`)
- Ticket Clienti (`can_view_tickets` / `can_edit_tickets`)
- Previsionale e Costi (`can_view_forecast`) - con sotto-etichetta "Include: Costi"
- Impostazioni e Automazioni (`can_view_settings`) - con sotto-etichetta "Include: Automazioni"

**Marketing e Vendita**
- Marketing e Vendita (`can_view_marketing` / `can_edit_marketing`) - con sotto-etichetta "Include: Dashboard, Contatti, Opportunita, Attivita, Appuntamenti, Automazioni, Agente AI, Email Marketing, WhatsApp, Reportistica"

### Fix aggiuntivi nello stesso file:
- Fix `handleToggle`: quando si disabilita una viewKey, disabilitare TUTTE le editKey associate (non solo la prima trovata)
- Fix contatore badge: contare solo permessi unici attivi
- Fix warning `forwardRef`: il componente e una function component passata come ref - non serve ref, rimuovere qualsiasi ref passata da `SettingsUserDetail.tsx`

### File: `src/pages/azienda/settings/SettingsUserDetail.tsx`
- Verificare che non venga passato un `ref` a `UserRolesPermissionsTab` (causa del warning console)

### Nessuna migrazione DB necessaria
I permessi nel DB restano invariati. Solo la UI viene corretta per riflettere fedelmente la struttura dati.

