

## Piano: Sidebar Impostazioni per Super Admin

Attualmente le impostazioni Super Admin usano un layout a tab orizzontali dentro una singola pagina. Vuoi replicare lo stesso pattern usato nelle impostazioni azienda: quando si naviga a `/admin/impostazioni/*`, la sidebar dell'admin si trasforma mostrando le voci di impostazione con "Torna indietro" in cima.

### Modifiche

#### 1. AdminLayout.tsx — Aggiungere sidebar impostazioni
Stessa logica di `CompanyLayout.tsx` (linea 96, `isSettingsRoute`): quando `location.pathname.startsWith("/admin/impostazioni")`, la sidebar mostra le voci impostazioni al posto della navigazione principale.

Voci sidebar impostazioni:
- **Account**: Profilo
- **Piattaforma**: Piattaforma, Notifiche
- **Amministrazione** (solo con `can_manage_admins`): Super Admin, Registro Attivita

#### 2. Creare pagine separate per ogni sezione
Convertire ogni tab in una pagina indipendente:
- `src/pages/admin/settings/AdminSettingsProfile.tsx` — wrappa `ProfileTab`
- `src/pages/admin/settings/AdminSettingsPlatform.tsx` — wrappa `PlatformInfoTab`
- `src/pages/admin/settings/AdminSettingsNotifications.tsx` — wrappa `NotificationsTab`
- `src/pages/admin/settings/AdminSettingsSuperAdmins.tsx` — wrappa `SuperAdminUsersTab`
- `src/pages/admin/settings/AdminSettingsAuditLog.tsx` — wrappa `AuditLogTab`

#### 3. App.tsx — Aggiornare routing
Sostituire la singola route `impostazioni` con route annidate:
```
<Route path="impostazioni" element={<Navigate to="/admin/impostazioni/profilo" />} />
<Route path="impostazioni/profilo" element={<AdminSettingsProfile />} />
<Route path="impostazioni/piattaforma" element={<AdminSettingsPlatform />} />
<Route path="impostazioni/notifiche" element={<AdminSettingsNotifications />} />
<Route path="impostazioni/super-admin" element={<AdminSettingsSuperAdmins />} />
<Route path="impostazioni/audit" element={<AdminSettingsAuditLog />} />
```

#### 4. File coinvolti
- `src/components/layouts/AdminLayout.tsx` — aggiungere logica sidebar impostazioni
- `src/pages/admin/settings/` — 5 nuove pagine wrapper
- `src/App.tsx` — aggiornare route admin
- `src/pages/admin/AdminSettings.tsx` — eliminabile (non piu usato)

