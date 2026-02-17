

# Registro Attivita per le Impostazioni Azienda

## Panoramica
Aggiungere un tab "Registro Attivita" nelle impostazioni azienda che mostra tutte le attivita svolte dagli utenti dell'azienda (ordini creati/modificati/eliminati, clienti aggiunti, cambio stati, ecc.), con filtri per tipo di azione e paginazione.

## Cosa vedrai
- Un nuovo tab "Attivita" nelle impostazioni azienda (visibile solo agli admin)
- Una tabella con: data/ora, utente che ha svolto l'azione, tipo di azione, dettagli
- Filtro per tipo di azione
- Paginazione (20 elementi per pagina)
- Pulsante di refresh

## Dettaglio Tecnico

### 1. Nuova tabella database: `company_activity_log`

Colonne:
- `id` (uuid, PK)
- `company_id` (uuid, FK verso companies, NOT NULL)
- `user_id` (uuid, NOT NULL) - chi ha eseguito l'azione
- `action` (text, NOT NULL) - tipo di azione (es. `create_order`, `update_order`, `delete_order`, `create_customer`, `update_status`, `create_employee`, `update_settings`, ecc.)
- `target_type` (text) - tipo entita coinvolta (order, customer, employee, supplier, ecc.)
- `target_id` (text) - ID dell'entita coinvolta
- `details` (jsonb) - dettagli aggiuntivi (nome ordine, vecchio/nuovo stato, ecc.)
- `created_at` (timestamptz, default now())

RLS Policies:
- Company admin e super admin possono leggere i log della propria azienda
- Solo inserimento tramite trigger/codice (nessun UPDATE/DELETE per gli utenti)

### 2. Trigger database per registrazione automatica

Creare trigger sulle tabelle principali per registrare automaticamente le attivita:
- `orders` (INSERT, UPDATE, DELETE)
- `order_status_history` (INSERT) - cambio stato ordine
- `order_items` (INSERT, DELETE)
- `suppliers` (INSERT, UPDATE, DELETE)
- `employees` (INSERT, UPDATE)
- `profiles` (INSERT, UPDATE) - per i clienti

### 3. Nuovo componente: `CompanyActivityLogTab`

File: `src/components/settings/CompanyActivityLogTab.tsx`

Componente simile all'`AuditLogTab` admin ma adattato per l'azienda:
- Query sulla tabella `company_activity_log` filtrata per `company_id`
- Labels italiane per ogni tipo di azione
- Badge colorati per tipo di azione
- Paginazione e filtro per azione
- Risoluzione nomi utente tramite la tabella `profiles`

Azioni tracciate con label:
- `create_order` -> "Ordine Creato"
- `update_order` -> "Ordine Modificato"
- `delete_order` -> "Ordine Eliminato"
- `update_order_status` -> "Cambio Stato Ordine"
- `create_customer` -> "Cliente Creato"
- `update_customer` -> "Cliente Modificato"
- `create_supplier` -> "Fornitore Creato"
- `update_supplier` -> "Fornitore Modificato"
- `delete_supplier` -> "Fornitore Eliminato"
- `create_employee` -> "Dipendente Creato"
- `update_employee` -> "Dipendente Modificato"
- `update_settings` -> "Impostazioni Modificate"

### 4. Modifica `Settings.tsx`

- Importare il nuovo componente `CompanyActivityLogTab`
- Aggiungere l'icona `ScrollText` agli import
- Aggiungere un nuovo `TabsTrigger` "Attivita" (visibile solo agli admin, dopo "Sicurezza")
- Aggiungere il `TabsContent` corrispondente
- Aggiornare il conteggio colonne della griglia (da 8 a 9 per admin)

### Sequenza di implementazione
1. Creare la tabella `company_activity_log` con RLS
2. Creare la funzione database `log_company_activity()` e i trigger
3. Creare il componente `CompanyActivityLogTab`
4. Aggiornare `Settings.tsx` con il nuovo tab

