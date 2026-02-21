
# Permessi inline nella creazione Operatore

## Cosa cambia

Quando si seleziona "Operatore" nel dialog di creazione utente, il form mostrera direttamente la sezione permessi (checkbox per ogni modulo + toggle "Solo elementi assegnati") prima di cliccare "Crea Utente". Cosi non serve creare l'utente e poi andare a configurare i permessi separatamente.

## Modifiche

### 1. StaffUserDialog.tsx
- Aggiungere lo state `permissions` con i valori di default (tutto false)
- Quando `roleType === "company_staff"`, mostrare inline la sezione permessi (stessa UI del PermissionsDialog: checkbox per Dashboard, Ordini, Magazzino, ecc. con sotto-checkbox "Puo modificare" e toggle "Solo elementi assegnati")
- Aggiungere `permissions` al tipo `StaffUserFormData`
- Il dialog usera `max-h` e scroll per gestire l'altezza aggiuntiva

### 2. UsersConfig.tsx (handleCreateUser)
- Dopo la creazione dell'utente (se `company_staff`), inviare un update alla tabella `staff_permissions` con i permessi scelti nel dialog
- Usare `supabase.from("staff_permissions").update(data.permissions).eq("user_id", response.data.user_id)`

### 3. Edge Function (nessuna modifica)
- La Edge Function gia crea il record `staff_permissions` vuoto per gli staff. I permessi verranno aggiornati subito dopo dal frontend.

## Dettagli Tecnici

### StaffUserFormData aggiornato
```text
interface StaffUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  role_type: "company_admin" | "company_staff";
  permissions?: StaffPermissions; // nuovo campo, solo per company_staff
}
```

### UI del form (quando Operatore selezionato)
Sotto i campi Nome/Cognome/Email apparira:
- Separatore con titolo "Permessi"
- Pulsanti "Seleziona tutti" / "Deseleziona tutti"
- Lista checkbox identica al PermissionsDialog
- Toggle "Solo elementi assegnati"
- Il DialogContent avra `className="max-w-lg"` per avere piu spazio

### Flusso
1. Utente seleziona "Operatore"
2. Compila nome, email
3. Configura permessi inline
4. Clicca "Crea Utente"
5. Edge Function crea utente + record permessi vuoto
6. Frontend aggiorna immediatamente i permessi con i valori scelti
7. Mostra password temporanea
