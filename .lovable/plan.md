

# Piano: Fix Creazione Utenti Staff e Cambio Password Obbligatorio

## Panoramica

Ci sono due problemi da risolvere:

1. **Bug nell'edge function**: Il metodo `getClaims()` non esiste nella versione attuale del client Supabase
2. **Manca la funzionalità di cambio password**: Gli utenti staff devono poter (o essere obbligati a) cambiare la password temporanea al primo accesso

---

## 1. Fix Edge Function `create-company-staff`

Il problema principale e che `supabaseUser.auth.getClaims(token)` non esiste. Devo usare `supabaseUser.auth.getUser()` che restituisce l'utente dal token di autenticazione.

### Correzione

```typescript
// PRIMA (non funziona)
const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
const callerId = claimsData.claims.sub;

// DOPO (corretto)
const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
const callerId = callerUser?.id;
```

---

## 2. Flag `must_change_password` nella tabella `staff_permissions`

Per tracciare se un utente deve cambiare password al primo accesso, aggiungo un campo alla tabella esistente:

```sql
ALTER TABLE staff_permissions 
ADD COLUMN must_change_password boolean DEFAULT true;
```

Quando l'utente cambia password, il flag viene impostato a `false`.

---

## 3. Pagina Cambio Password

Creare una pagina dedicata `/cambia-password` che:
- Viene mostrata automaticamente agli utenti staff con `must_change_password = true`
- Richiede la password attuale e la nuova password
- Dopo il cambio, aggiorna il flag e reindirizza alla pagina appropriata

### Layout

```
+--------------------------------------------+
|           Cambia Password                  |
+--------------------------------------------+
| Per motivi di sicurezza, devi cambiare     |
| la tua password temporanea.                |
|                                            |
| Password Attuale *                         |
| [________________________________]         |
|                                            |
| Nuova Password *                           |
| [________________________________]         |
|                                            |
| Conferma Nuova Password *                  |
| [________________________________]         |
|                                            |
|                      [Cambia Password]     |
+--------------------------------------------+
```

---

## 4. Redirect Automatico al Login

Modificare la logica di redirect dopo il login per verificare se l'utente ha `must_change_password = true`:

```typescript
// In Login.tsx o RoleBasedRedirect
if (role === "company_staff") {
  // Controlla se deve cambiare password
  const { data } = await supabase
    .from("staff_permissions")
    .select("must_change_password")
    .eq("user_id", user.id)
    .single();
    
  if (data?.must_change_password) {
    return <Navigate to="/cambia-password" replace />;
  }
}
return <Navigate to="/azienda" replace />;
```

---

## 5. File da Modificare/Creare

| File | Operazione | Descrizione |
|------|------------|-------------|
| `supabase/functions/create-company-staff/index.ts` | Modificare | Fix `getClaims` → `getUser()` |
| `supabase/migrations/xxx.sql` | Creare | Aggiunge colonna `must_change_password` |
| `src/pages/auth/ChangePassword.tsx` | Creare | Pagina cambio password |
| `src/App.tsx` | Modificare | Aggiungere route `/cambia-password` |
| `src/components/auth/RoleBasedRedirect.tsx` | Modificare | Redirect se `must_change_password` |
| `src/hooks/usePermissions.ts` | Modificare | Includere `mustChangePassword` nel return |

---

## Sezione Tecnica

### Fix Edge Function

```typescript
// Riga 36-50 da sostituire con:
const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
if (userError || !callerUser) {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const callerId = callerUser.id;
```

### Migrazione Database

```sql
-- Aggiunge flag must_change_password
ALTER TABLE staff_permissions 
ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;

-- Imposta false per utenti esistenti (opzionale)
UPDATE staff_permissions SET must_change_password = false WHERE must_change_password IS NULL;
```

### Componente ChangePassword

```typescript
// src/pages/auth/ChangePassword.tsx
export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    // Verifica password attuale facendo un sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user!.email!,
      password: currentPassword,
    });
    
    if (signInError) {
      toast.error("Password attuale non corretta");
      return;
    }
    
    // Cambia password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (updateError) {
      toast.error("Errore durante il cambio password");
      return;
    }
    
    // Aggiorna flag
    await supabase
      .from("staff_permissions")
      .update({ must_change_password: false })
      .eq("user_id", user!.id);
    
    toast.success("Password cambiata con successo");
    navigate("/azienda");
  };
  
  return (/* Form UI */);
}
```

### Modifica RoleBasedRedirect

```typescript
// In RoleBasedRedirect.tsx
const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);

useEffect(() => {
  if (role === "company_staff" && user) {
    supabase
      .from("staff_permissions")
      .select("must_change_password")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setMustChangePassword(data?.must_change_password ?? false);
      });
  }
}, [role, user]);

// Nel return
if (role === "company_staff" && mustChangePassword === true) {
  return <Navigate to="/cambia-password" replace />;
}
```

---

## Flusso Utente Completo

1. L'Admin crea un nuovo utente staff
2. Il sistema genera una password temporanea
3. L'Admin comunica le credenziali all'utente
4. L'utente fa login con email e password temporanea
5. Il sistema rileva `must_change_password = true`
6. L'utente viene reindirizzato a `/cambia-password`
7. L'utente inserisce la nuova password
8. Il sistema aggiorna il flag e lo reindirizza a `/azienda`
9. Ai successivi login, l'utente accede direttamente

