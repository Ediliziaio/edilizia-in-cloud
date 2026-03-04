

# Audit Sezione Profilo Impostazioni

## Bug Trovati

### 1. PersonalProfileForm: stato non sincronizzato con profile asincrono (P0)

`useState(profile?.first_name || "")` viene eseguito solo al mount. Se `profile` e null al mount (caricamento asincrono), i campi restano vuoti per sempre. `CompanyProfileForm` gestisce correttamente questo caso con un `useEffect` su `company`.

**Fix**: Aggiungere `useEffect` che sincronizza `firstName`, `lastName`, `phone` quando `profile` cambia (stesso pattern di CompanyProfileForm).

### 2. PersonalProfileForm: mancano maxLength sugli input (P1)

`firstName` e `lastName` non hanno `maxLength`. `phone` non ha `maxLength`. CompanyProfileForm li ha su tutti i campi. Inconsistenza e rischio di input troppo lunghi.

**Fix**: Aggiungere `maxLength={50}` su nome/cognome, `maxLength={20}` su telefono.

### 3. PersonalProfileForm: manca `.trim()` nel salvataggio (P1)

CompanyProfileForm fa `.trim()` su tutti i campi prima del salvataggio. PersonalProfileForm salva `firstName` e `lastName` senza trim, rischiando spazi bianchi nel database.

**Fix**: Aggiungere `.trim()` nel payload di update.

### 4. Toast inconsistenti: `useToast` vs `sonner` (P2)

- PersonalProfileForm: usa `useToast` (Radix)
- LogoUploader: usa `sonner`
- ChangePasswordForm: usa `sonner`

**Fix**: Migrare PersonalProfileForm a `sonner` per coerenza con il resto dell'app.

## File da modificare

| File | Intervento |
|------|-----------|
| `src/components/settings/PersonalProfileForm.tsx` | useEffect sync + maxLength + trim + sonner |

Nessun altro file nella sezione profilo richiede interventi. CompanyProfileForm e LogoUploader sono ben implementati.

