
# Rimozione "Crea tramite AI" + Integrazione "Crea Cartella" funzionante

## Cosa faremo

### 1. Rimozione bottone "Crea tramite AI"
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- Eliminare il bottone `<Button variant="outline" size="sm"><Sparkles .../> Crea tramite AI</Button>` (righe 65-67)
- Rimuovere l'import `Sparkles` da lucide-react (non piu usato)

### 2. Creare tabella `automation_folders` nel database
Migrazione SQL per creare una tabella cartelle dedicata alle automazioni:
- `id` UUID PK
- `company_id` UUID (FK companies)
- `name` TEXT NOT NULL
- `parent_id` UUID nullable (self-referencing per sotto-cartelle)
- `created_at` TIMESTAMPTZ
- RLS: accesso solo alla propria company

Aggiungere colonna `folder_id` nullable su `automation_flows` con FK verso `automation_folders`.

### 3. Integrare il dialog "Crea Cartella" nella pagina automazioni
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- Aggiungere stato `folderDialogOpen`
- Aggiungere mutation per inserire nella tabella `automation_folders` con `company_id`
- Collegare il bottone "Crea Cartella" esistente al dialog
- Riutilizzare il componente `CreateFolderDialog` gia esistente in `src/components/email-marketing/CreateFolderDialog.tsx`

### 4. Visualizzare le cartelle nella lista
File: `src/components/marketing/automations/AutomationFlowsList.tsx`
- Aggiungere prop `folderId` (nullable) per filtrare i flussi
- Caricare le sotto-cartelle della cartella corrente
- Mostrare le cartelle come righe cliccabili sopra i flussi (icona cartella + nome)
- Al click su una cartella, navigare dentro (aggiornando `folderId`)

### 5. Breadcrumb dinamici
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- Il breadcrumb gia presente (Home > Automazione) diventa dinamico
- Navigando dentro le cartelle: Home > Automazione > NomeCartella
- Click su un livello per risalire

## File modificati
1. **Migrazione SQL** -- nuova tabella `automation_folders` + colonna `folder_id` su `automation_flows`
2. **`src/pages/azienda/marketing/MarketingAutomations.tsx`** -- rimozione AI button, stato folder, dialog, breadcrumb dinamici
3. **`src/components/marketing/automations/AutomationFlowsList.tsx`** -- filtro per `folder_id`, rendering cartelle inline

## Nessun nuovo componente
Riutilizziamo `CreateFolderDialog` gia esistente nel progetto. Zero duplicazione.
