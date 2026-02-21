
# Impostazioni con Sidebar Dedicata (stile GoHighLevel)

## Cosa cambia
Cliccando "Impostazioni" nella sidebar principale, invece di aprire una pagina con tab orizzontali, la sidebar si trasforma mostrando le sezioni delle impostazioni raggruppate per categoria, con un pulsante "Torna indietro" in alto. Ogni sezione apre il suo contenuto nell'area principale.

## Struttura della nuova sidebar Impostazioni

```text
+---------------------------+
| <- Torna indietro         |
|                           |
| Impostazioni              |
|                           |
| LA MIA AZIENDA            |
|   Profilo aziendale       |
|   Catalogo articoli       |
|                           |
| GESTIONE ORDINI           |
|   Stati ordine            |
|   Fornitori               |
|                           |
| TEAM (solo admin)         |
|   Utenti                  |
|   Venditori               |
|   Staff / Operai          |
|                           |
| SICUREZZA E LOG           |
|   Cambio password         |
|   Registro attivita       |
+---------------------------+
```

## Modifiche tecniche

### 1. Nuova struttura routing in `src/App.tsx`
- Trasformare `/azienda/impostazioni` in un layout con sotto-route:
  - `/azienda/impostazioni` (redirect a `profilo`)
  - `/azienda/impostazioni/profilo`
  - `/azienda/impostazioni/stati-ordine`
  - `/azienda/impostazioni/catalogo`
  - `/azienda/impostazioni/fornitori`
  - `/azienda/impostazioni/utenti`
  - `/azienda/impostazioni/venditori`
  - `/azienda/impostazioni/staff`
  - `/azienda/impostazioni/sicurezza`
  - `/azienda/impostazioni/attivita`

### 2. Nuovo layout `src/components/layouts/SettingsLayout.tsx`
- Layout wrapper con sidebar dedicata alle impostazioni
- Pulsante "Torna indietro" in alto che riporta a `/azienda`
- Titolo "Impostazioni" sotto il pulsante
- Voci di menu raggruppate per categoria con `SidebarGroupLabel`
- Le voci admin-only (Utenti, Venditori, Staff, Attivita) visibili solo per `company_admin` / `super_admin`
- Area `<Outlet />` per il contenuto della sezione selezionata

### 3. Nuove pagine per ogni sezione in `src/pages/azienda/settings/`
Ogni pagina e un semplice wrapper che renderizza il componente gia esistente:
- `SettingsProfile.tsx` - Logo + Anagrafica (CompanyProfileForm, LogoUploader)
- `SettingsCatalog.tsx` - ArticleCatalog
- `SettingsOrderStatus.tsx` - OrderStatusConfig
- `SettingsSuppliers.tsx` - SuppliersConfig
- `SettingsUsers.tsx` - UsersConfig
- `SettingsSalespeople.tsx` - SalespeopleConfig
- `SettingsStaff.tsx` - Employees
- `SettingsSecurity.tsx` - ChangePasswordForm
- `SettingsActivityLog.tsx` - CompanyActivityLogTab

### 4. Aggiornare `src/components/layouts/CompanyLayout.tsx`
- Rimuovere "Impostazioni" dalla lista `allNavItems` (verra gestito dal sub-layout)
- Mantenere la voce ma come link che porta a `/azienda/impostazioni`
- Quando l'utente e su una rotta `/azienda/impostazioni/*`, la sidebar principale puo rimanere visibile oppure nascondersi (la sidebar impostazioni la sostituisce nel SettingsLayout)

### 5. Aggiornare `src/pages/azienda/Settings.tsx`
- Sostituire tutto il contenuto tab-based con un semplice redirect alla prima sotto-sezione, oppure eliminare il file se il layout gestisce tutto

### File coinvolti
| File | Azione |
|------|--------|
| `src/components/layouts/SettingsLayout.tsx` | Nuovo - layout con sidebar impostazioni |
| `src/pages/azienda/settings/SettingsProfile.tsx` | Nuovo - pagina profilo |
| `src/pages/azienda/settings/SettingsCatalog.tsx` | Nuovo - pagina catalogo |
| `src/pages/azienda/settings/SettingsOrderStatus.tsx` | Nuovo - pagina stati ordine |
| `src/pages/azienda/settings/SettingsSuppliers.tsx` | Nuovo - pagina fornitori |
| `src/pages/azienda/settings/SettingsUsers.tsx` | Nuovo - pagina utenti |
| `src/pages/azienda/settings/SettingsSalespeople.tsx` | Nuovo - pagina venditori |
| `src/pages/azienda/settings/SettingsStaff.tsx` | Nuovo - pagina staff |
| `src/pages/azienda/settings/SettingsSecurity.tsx` | Nuovo - pagina sicurezza |
| `src/pages/azienda/settings/SettingsActivityLog.tsx` | Nuovo - pagina registro |
| `src/App.tsx` | Aggiorna routing con sotto-route |
| `src/components/layouts/CompanyLayout.tsx` | Sposta "Impostazioni" in basso, separato dal menu principale |
| `src/pages/azienda/Settings.tsx` | Rimosso o sostituito con redirect |
