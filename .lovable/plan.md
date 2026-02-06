
# Piano: Upload Logo Aziendale nelle Impostazioni

## Stato Attuale Verificato
- Il logo EdiliziaInCloud e gia presente nel login (linea 56 di LoginForm.tsx) - **nessuna modifica necessaria**
- La tabella `companies` ha gia il campo `logo_url` (tipo text, nullable)
- Non esiste ancora uno storage bucket per i loghi
- La pagina Settings.tsx mostra il logo se presente, altrimenti un'icona placeholder
- Non esistono componenti di upload nel progetto

---

## Implementazione

### FASE 1: Creazione Storage Bucket (Database Migration)

Creare un bucket pubblico per i loghi aziendali con le appropriate RLS policies:

```sql
-- Creare bucket per i loghi aziendali
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true);

-- RLS: Company admin puo caricare/aggiornare il logo della propria azienda
CREATE POLICY "Company admins can upload their logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Company admin puo aggiornare il proprio logo
CREATE POLICY "Company admins can update their logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Company admin puo eliminare il proprio logo
CREATE POLICY "Company admins can delete their logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Super admin puo gestire tutti i loghi
CREATE POLICY "Super admins can manage all logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  has_role(auth.uid(), 'super_admin')
);

-- RLS: Tutti possono visualizzare i loghi (bucket pubblico)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logos');
```

### FASE 2: Componente LogoUploader

Creare un nuovo componente `src/components/settings/LogoUploader.tsx`:

**Funzionalita:**
- Mostra anteprima del logo attuale (se presente)
- Input file per selezionare nuova immagine (accept: image/png, image/jpeg, image/webp)
- Validazione dimensione file (max 2MB)
- Upload a Storage con path `{company_id}/logo.{ext}`
- Aggiornamento campo `logo_url` nella tabella `companies`
- Possibilita di rimuovere il logo esistente

**Struttura UI:**
```
+----------------------------------+
|  [Logo Preview / Placeholder]   |
|                                  |
|  [Carica Logo]  [Rimuovi Logo]  |
|                                  |
|  Formati: PNG, JPG, WEBP        |
|  Dimensione max: 2MB            |
+----------------------------------+
```

### FASE 3: Integrazione in Settings.tsx

Modificare `src/pages/azienda/Settings.tsx`:

1. Importare il nuovo componente `LogoUploader`
2. Sostituire la sezione statica del profilo azienda con il componente interattivo
3. Aggiungere callback per aggiornare il contesto auth dopo upload (refreshAuth)

**Prima:**
```tsx
<div className="flex items-center gap-4">
  {company?.logo_url ? (
    <img src={company.logo_url} ... />
  ) : (
    <div className="..."><Building2 /></div>
  )}
  <div>
    <h3>{company?.name}</h3>
    <p>{company?.email}</p>
  </div>
</div>
<p>La modifica del profilo azienda sara disponibile a breve</p>
```

**Dopo:**
```tsx
<div className="space-y-6">
  <div className="flex items-center gap-4">
    <div>
      <h3>{company?.name}</h3>
      <p>{company?.email}</p>
    </div>
  </div>
  <Separator />
  <LogoUploader 
    company={company} 
    onLogoUpdated={refreshAuth} 
  />
</div>
```

### FASE 4: Aggiornamento Context per Refresh

Verificare che `AuthContext` aggiorni correttamente `effectiveCompany` dopo il refresh - gia implementato correttamente con `refreshAuth()`.

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `supabase/migrations/...` | Creare | Bucket storage + RLS policies |
| `src/components/settings/LogoUploader.tsx` | Creare | Componente upload logo |
| `src/pages/azienda/Settings.tsx` | Modificare | Integrare LogoUploader |

---

## Considerazioni Tecniche

### Struttura Path Storage
```
company-logos/
  ├── {company_id_1}/
  │   └── logo.png
  ├── {company_id_2}/
  │   └── logo.jpg
  └── ...
```

Questo permette:
- RLS basata su company_id (primo segmento del path)
- Un solo logo per azienda (sovrascrittura automatica)
- URL pubblico prevedibile

### URL Logo Pubblico
```
https://{project_id}.supabase.co/storage/v1/object/public/company-logos/{company_id}/logo.{ext}
```

### Gestione Impersonation
Il componente usera `effectiveCompany` per permettere al super admin di modificare il logo quando impersona un'azienda. La policy RLS per super_admin garantisce l'accesso.

---

## Flusso Utente

1. Admin accede a Impostazioni > Profilo Azienda
2. Vede logo attuale (o placeholder)
3. Clicca "Carica Logo"
4. Seleziona immagine (validazione client-side)
5. Upload automatico a Storage
6. Aggiornamento `logo_url` nel database
7. Refresh del contesto auth
8. Logo visibile ovunque nell'app

---

## Test Post-Implementazione

1. **Login** - Verificare che il logo EdiliziaInCloud sia visibile
2. **Upload logo** - Caricare un logo per un'azienda
3. **Visualizzazione** - Verificare che il logo appaia nella sidebar
4. **Impersonation** - Super admin modifica logo di azienda impersonata
5. **Rimozione** - Rimuovere il logo e verificare fallback a EdiliziaInCloud
