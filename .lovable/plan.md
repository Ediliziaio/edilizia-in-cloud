

# Piano di Implementazione - Nuove Funzionalita

## Panoramica

Questo piano copre quattro aree principali:
1. Accesso del Super Admin agli account delle aziende (impersonation)
2. Modifica ordini esistenti dalla pagina dettaglio
3. Pagina gestione clienti per l'admin azienda
4. Test del flusso completo

---

## 1. Accesso Super Admin agli Account Azienda

### Approccio
Il super admin potra "entrare" nella vista di un'azienda senza effettuare un login separato. Implementeremo un sistema di "impersonation" lato client che:

- Salva temporaneamente in sessionStorage il company_id selezionato
- Aggiorna il contesto Auth per fornire i dati dell'azienda impersonata
- Mostra un banner giallo nell'interfaccia azienda per indicare la modalita impersonation
- Permette di tornare alla vista super admin con un click

### Modifiche AuthContext
Aggiungeremo al contesto:
```text
- impersonatedCompanyId: string | null
- impersonateCompany: (companyId: string) => Promise<void>
- exitImpersonation: () => void
- isImpersonating: boolean
```

### UI in CompaniesList
Ogni card azienda avra un pulsante "Accedi come admin" che:
1. Chiama `impersonateCompany(companyId)`
2. Reindirizza a `/azienda`

### Banner Impersonation
Nel `CompanyLayout`, se `isImpersonating` e true, mostrare un banner:
```text
+--------------------------------------------------+
| ⚠️ Stai visualizzando come: [NomeAzienda] [Esci] |
+--------------------------------------------------+
```

---

## 2. Modifica Ordine Esistente

### Nuovo File: `src/pages/azienda/EditOrder.tsx`
Creeremo una pagina di modifica ordine che:
- Riutilizza la stessa struttura del form di `CreateOrder.tsx`
- Pre-popola i campi con i dati dell'ordine esistente
- Aggiorna l'ordine invece di crearne uno nuovo

### Modifiche OrderDetail.tsx
Aggiungeremo un pulsante "Modifica" nell'header accanto al pulsante Elimina che naviga a `/azienda/ordini/:id/modifica`.

### Route
Aggiungere in `App.tsx`:
```text
/azienda/ordini/:id/modifica -> EditOrder
```

### Campi Modificabili
- Descrizione lavoro
- Importo totale, acconto, saldo
- Data prevista consegna
- Note interne
- Cliente (con attenzione, potrebbe avere implicazioni)

---

## 3. Gestione Clienti Admin Azienda

### File: `src/pages/azienda/CustomersList.tsx`
Lista clienti con:
- Tabella con colonne: Nome, Cognome, Email, Telefono, Ordini attivi
- Barra di ricerca
- Pulsante "Nuovo Cliente"
- Empty state

### File: `src/pages/azienda/CreateCustomer.tsx`
Form creazione cliente con:
- Nome (obbligatorio)
- Cognome (obbligatorio)
- Email (obbligatorio)
- Telefono (opzionale)
- Indirizzo (opzionale)

### Logica Backend
La creazione cliente richiede la creazione di un utente in auth.users e l'assegnazione del ruolo "customer". Utilizzeremo una Edge Function simile a `create-company` che:
1. Crea l'utente in auth.users con password generata
2. Crea il profilo in `profiles` con company_id
3. Assegna il ruolo `customer` in `user_roles`
4. Restituisce i dati del cliente creato

Per ora, la password sara generata automaticamente e mostrata in un toast (mock, come da piano originale).

### File: `supabase/functions/create-customer/index.ts`
Edge function per creare il cliente.

---

## 4. File da Creare

```text
src/pages/azienda/CustomersList.tsx       - Lista clienti con ricerca
src/pages/azienda/CreateCustomer.tsx      - Form creazione cliente
src/pages/azienda/EditOrder.tsx           - Form modifica ordine
supabase/functions/create-customer/index.ts - Edge function creazione cliente
```

---

## 5. File da Modificare

```text
src/contexts/AuthContext.tsx              - Aggiungere logica impersonation
src/components/layouts/CompanyLayout.tsx  - Aggiungere banner impersonation
src/pages/admin/CompaniesList.tsx         - Aggiungere pulsante "Accedi"
src/pages/azienda/OrderDetail.tsx         - Aggiungere pulsante "Modifica"
src/App.tsx                               - Aggiungere nuove route
```

---

## 6. Struttura Impersonation

```text
Super Admin Dashboard
        |
        v
+-------------------+
| Lista Aziende     |
| [Card Azienda 1]  |
|   [Accedi ↗]      |
+-------------------+
        |
        v (click Accedi)
+-------------------+
| ⚠️ Impersonating  |
| [Torna a Admin]   |
+-------------------+
| Dashboard Azienda |
| (vista completa)  |
+-------------------+
```

---

## 7. Struttura CustomersList

```text
+------------------------------------------+
| Clienti                   [+ Nuovo Cliente]|
+------------------------------------------+
| [Cerca cliente...]                        |
+------------------------------------------+
| Nome     | Email      | Telefono | Ordini |
|----------|------------|----------|--------|
| Mario R. | mario@...  | 333...   |   3    |
| Luigi V. | luigi@...  | 339...   |   1    |
+------------------------------------------+
```

---

## 8. Flusso di Test

Dopo l'implementazione testero:

1. **Super Admin - Impersonation**
   - Login come super admin (flo.andriciuc@gmail.com / Tekno2026!)
   - Andare alla lista aziende
   - Cliccare "Accedi" su un'azienda
   - Verificare banner impersonation
   - Navigare le pagine azienda
   - Cliccare "Torna a Admin"

2. **Admin Azienda - Gestione Clienti**
   - Andare a /azienda/clienti
   - Verificare lista vuota con empty state
   - Cliccare "Nuovo Cliente"
   - Compilare form e creare cliente
   - Verificare cliente nella lista

3. **Admin Azienda - Flusso Ordini Completo**
   - Creare un nuovo ordine selezionando il cliente creato
   - Visualizzare il dettaglio ordine
   - Modificare l'ordine (testare pulsante Modifica)
   - Cambiare stato tramite progress tracker
   - Verificare storico stati aggiornato

---

## Dettagli Tecnici

### Impersonation - Sicurezza
L'impersonation e un meccanismo lato UI che:
- Funziona solo per utenti con ruolo `super_admin` (verificato dal contesto)
- Non modifica le credenziali di autenticazione
- Utilizza le RLS policies esistenti per super_admin che hanno accesso a tutti i dati
- Il super admin mantiene i propri privilegi, visualizzando solo i dati filtrati per l'azienda selezionata

### Edge Function create-customer
```text
Input: first_name, last_name, email, phone?, address?, company_id
Output: { success: true, customer: {...}, password: "..." }

Passaggi:
1. Genera password casuale sicura
2. Crea utente in auth.users
3. Crea profilo in profiles
4. Assegna ruolo customer in user_roles
5. Ritorna dati cliente + password
```

### Query Clienti Filtrata
I clienti sono profili con ruolo "customer" e company_id dell'azienda corrente:
```sql
SELECT p.* FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'customer'
AND p.company_id = [company_id]
```

