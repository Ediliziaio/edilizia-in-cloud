
# Piano: Integrazione Logo EdiliziaInCloud

## Obiettivo
Sostituire l'icona generica `Building2` con il logo ufficiale di EdiliziaInCloud in tutti i punti dell'applicazione dove appare il branding.

## File Immagine
Il logo verra copiato nella cartella `src/assets/` per beneficiare dell'ottimizzazione del bundler e dell'import come modulo ES6.

## File da Modificare

### 1. Copia del Logo
Copiare il file `user-uploads://Edilizia_in_Cloud_Logo.png` in `src/assets/edilizia-in-cloud-logo.png`

### 2. LoginForm.tsx
- Rimuovere import di `Building2`
- Aggiungere import del logo: `import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png"`
- Sostituire l'icona con il logo (ridimensionato a ~h-12 per adattarsi al contesto)
- Rimuovere il testo "EdiliziaInCloud" separato poiche il logo lo include gia

**Prima:**
```tsx
<div className="flex items-center gap-2 text-primary">
  <Building2 className="h-10 w-10" />
  <span className="text-2xl font-bold">EdiliziaInCloud</span>
</div>
```

**Dopo:**
```tsx
<img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-12" />
```

### 3. AdminLayout.tsx
- Rimuovere import di `Building2`
- Aggiungere import del logo
- Sostituire nella sidebar (logo piu piccolo per adattarsi all'header h-14)

**Prima:**
```tsx
<Building2 className="h-6 w-6" />
<span>EdiliziaInCloud</span>
```

**Dopo:**
```tsx
<img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
```

### 4. CompanyLayout.tsx
- Aggiungere import del logo
- Usare il logo come fallback quando `effectiveCompany?.logo_url` non esiste
- Mantenere la logica esistente che mostra il logo dell'azienda se disponibile

**Prima:**
```tsx
<Building2 className="h-6 w-6 text-primary" />
```

**Dopo:**
```tsx
<img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
```

### 5. CustomerLayout.tsx
- Aggiungere import del logo
- Usare il logo come fallback quando `company?.logo_url` non esiste

**Prima:**
```tsx
<Building2 className="h-6 w-6 text-primary" />
```

**Dopo:**
```tsx
<img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
```

## Note Tecniche

### Perche src/assets invece di public/
- Importando come modulo ES6, il bundler ottimizza l'immagine
- TypeScript fornisce type safety sugli import
- Il path e risolto automaticamente in build

### Dimensioni Logo
- Login: `h-12` (piu grande, e il focus principale)
- Sidebar/Header: `h-8` (piu compatto per integrarsi nell'header)

## Risultato Atteso
Il logo ufficiale di EdiliziaInCloud apparira:
- Nella pagina di login (centrato, ben visibile)
- Nella sidebar del pannello Super Admin
- Nella sidebar del pannello Azienda (come fallback)
- Nell'header del portale Cliente (come fallback)
