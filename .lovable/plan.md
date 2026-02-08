
# Piano: Cambio Password nelle Impostazioni e Stabilizzazione Sistema

## Panoramica

Questo piano aggiunge la possibilità per gli utenti aziendali (staff e admin) di cambiare la propria password dalla pagina Impostazioni, oltre a correggere un bug esistente e migliorare la stabilità generale.

---

## 1. Nuova Funzionalità: Cambio Password in Impostazioni

### Problema Attuale
Gli utenti staff possono cambiare la password solo al primo accesso (flusso obbligatorio). Non esiste un modo per cambiarla successivamente.

### Soluzione
Aggiungere una nuova tab "Sicurezza" nella pagina Impostazioni (`/azienda/impostazioni`) con un form per il cambio password.

### Layout Proposto

```text
+--------------------------------------------------+
|  Impostazioni                                    |
|  Configura le impostazioni della tua azienda     |
+--------------------------------------------------+
| [Profilo] [Stati Ordine] [Fornitori] [Sicurezza] |
+--------------------------------------------------+

Tab Sicurezza:
+--------------------------------------------------+
|  Sicurezza                                       |
|  Gestisci la password del tuo account            |
+--------------------------------------------------+
|                                                  |
|  Password Attuale *                              |
|  [________________________________] [👁]         |
|                                                  |
|  Nuova Password *                                |
|  [________________________________] [👁]         |
|                                                  |
|  Conferma Nuova Password *                       |
|  [________________________________] [👁]         |
|                                                  |
|                       [Cambia Password]          |
+--------------------------------------------------+
```

---

## 2. Bug Fix: Race Condition in RoleBasedRedirect

### Problema
Il componente `RoleBasedRedirect.tsx` ha lo stesso bug che era presente in `Login.tsx`: non gestisce correttamente l'attesa del controllo `must_change_password` prima di fare il redirect.

### Analisi
```typescript
// Attuale (problematico) - linea 30
if (isLoading || checkingPassword) { ... }

// Ma manca la gestione del caso in cui mustChangePassword e ancora null
```

### Soluzione
Applicare la stessa correzione fatta in `Login.tsx`:
- Gestire il caso `mustChangePassword === null` 
- Aggiungere try/catch per errori
- Migliorare il feedback visivo

---

## 3. Miglioramento UX: Pagina ChangePassword

### Problema Attuale
La pagina mostra sempre "Per motivi di sicurezza, devi cambiare la tua password temporanea" anche quando l'utente accede volontariamente dalle impostazioni.

### Soluzione
Passare un parametro per distinguere il contesto:
- Accesso obbligatorio (primo login): messaggio di sicurezza
- Accesso volontario (da impostazioni): messaggio neutro

---

## 4. File da Modificare

| File | Operazione | Descrizione |
|------|------------|-------------|
| `src/pages/azienda/Settings.tsx` | Modificare | Aggiungere tab Sicurezza con form cambio password |
| `src/components/auth/RoleBasedRedirect.tsx` | Modificare | Fix race condition (stesso fix di Login.tsx) |

---

## Sezione Tecnica

### 4.1 Modifica Settings.tsx

Aggiungere:
1. Import di `Key` icon e componenti form
2. Nuova tab "Sicurezza"
3. Componente interno per il form cambio password

```typescript
// Nuovi import
import { Key, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Nuova tab nel TabsList (4 colonne invece di 3)
<TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
  ...
  <TabsTrigger value="sicurezza" className="flex items-center gap-2">
    <Key className="h-4 w-4" />
    Sicurezza
  </TabsTrigger>
</TabsList>

// Nuova TabsContent
<TabsContent value="sicurezza" className="mt-6">
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Key className="h-5 w-5" />
        Cambia Password
      </CardTitle>
      <CardDescription>
        Aggiorna la password del tuo account
      </CardDescription>
    </CardHeader>
    <CardContent>
      {/* Form con 3 campi: password attuale, nuova, conferma */}
    </CardContent>
  </Card>
</TabsContent>
```

### 4.2 Fix RoleBasedRedirect.tsx

Applicare le stesse correzioni di Login.tsx:

```typescript
useEffect(() => {
  async function checkPasswordChange() {
    if (role === "company_staff" && user) {
      setCheckingPassword(true);
      try {
        const { data, error } = await supabase
          .from("staff_permissions")
          .select("must_change_password")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (error) {
          console.error("Error checking password flag:", error);
          setMustChangePassword(false);
        } else {
          setMustChangePassword(data?.must_change_password ?? false);
        }
      } catch (err) {
        console.error("Error in checkPasswordChange:", err);
        setMustChangePassword(false);
      } finally {
        setCheckingPassword(false);
      }
    } else if (role && role !== "company_staff") {
      setMustChangePassword(false);
    }
  }
  
  if (user && role) {
    checkPasswordChange();
  }
}, [role, user]);

// Nel return, gestire il caso mustChangePassword === null
if (isLoading) {
  return <LoadingSpinner text="Caricamento..." />;
}

if (!user) {
  return <Navigate to="/login" replace />;
}

if (role === "company_staff") {
  if (checkingPassword || mustChangePassword === null) {
    return <LoadingSpinner text="Verifica in corso..." />;
  }
  
  if (mustChangePassword === true) {
    return <Navigate to="/cambia-password" replace />;
  }
}
```

---

## 5. Validazione Form Cambio Password

Il form in Settings utilizzerà la stessa logica di ChangePassword.tsx:

1. **Password attuale obbligatoria**: Verifica tramite `signInWithPassword`
2. **Nuova password minimo 8 caratteri**
3. **Conferma password deve corrispondere**
4. **Show/hide password** con icone Eye/EyeOff
5. **Loading state** durante l'operazione
6. **Toast feedback** per successo/errore

---

## 6. Riepilogo Modifiche

### Nuove Funzionalita
1. **Tab Sicurezza in Impostazioni** - Permette a staff/admin di cambiare password

### Bug Corretti
1. **RoleBasedRedirect race condition** - Stesso fix applicato a Login.tsx

### Miglioramenti UX
1. **Feedback visivo** - Loading states e messaggi di errore chiari
2. **Show/hide password** - Toggle per visualizzare le password
3. **Validazione client-side** - Prima di inviare la richiesta

---

## 7. Checklist Verifica Finale

Dopo l'implementazione, verificare:

- [ ] Tab Sicurezza visibile in Impostazioni
- [ ] Form cambio password funzionante
- [ ] Validazione password attuale
- [ ] Toast di successo/errore
- [ ] RoleBasedRedirect non blocca su loading infinito
- [ ] Flusso staff primo login ancora funzionante
- [ ] Console pulita (no errori JS)
- [ ] Responsive mobile
