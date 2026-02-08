
# Piano: Completamento Sistema Venditori + Test End-to-End

## Panoramica

Questo piano completa il sistema venditori con le seguenti implementazioni:

1. **Edge Function per creazione account venditore** - Permette di creare account con ruolo `salesperson`
2. **Pulsante "Crea Account" nel SalespeopleConfig** - Per abilitare l'accesso al sistema ai venditori
3. **Verifica e test end-to-end** - Flusso completo ordine -> previsionale -> dashboard venditore
4. **Pulizia codice e stabilizzazione**

---

## 1. Stato Attuale (Gia Implementato)

### Funzionalita Esistenti

| Componente | Stato | Note |
|------------|-------|------|
| `OrderCommissions.tsx` | Completo | Switch per segnare provvigione come pagata (gia presente) |
| `CashFlowForecast.tsx` | Completo | Sezione "Provvigioni da Pagare" gia implementata |
| `MyOrders.tsx` | Completo | Lista ordini del venditore |
| `MyEarnings.tsx` | Completo | Dashboard guadagni con KPI e grafici |
| `SalespersonProfile.tsx` | Completo | Profilo con cambio password |
| `SalespeopleConfig.tsx` | Parziale | Manca pulsante per creare account |

---

## 2. Edge Function: create-salesperson-user

### File da Creare

`supabase/functions/create-salesperson-user/index.ts`

### Logica

La funzione sara simile a `create-employee-user`:
1. Verifica che il chiamante sia `company_admin` o `super_admin`
2. Recupera i dati del venditore dalla tabella `salespeople`
3. Verifica che il venditore non abbia gia un account (`user_id` null)
4. Crea l'utente in `auth.users` con password temporanea
5. Crea il profilo in `profiles` con `company_id`
6. Assegna il ruolo `salesperson` in `user_roles`
7. Collega l'utente al venditore aggiornando `salespeople.user_id`
8. Restituisce la password temporanea per comunicarla al venditore

### Endpoint

```
POST /functions/v1/create-salesperson-user
Body: { salesperson_id: string, email: string }
Response: { success: true, temp_password: string, user_id: string }
```

---

## 3. Modifiche a SalespeopleConfig.tsx

### Aggiunte

| Elemento | Descrizione |
|----------|-------------|
| Pulsante "Crea Account" | Visibile solo se `user_id` e null |
| Dialog conferma | Per inserire/confermare email e creare account |
| Mutation | Chiamata alla edge function |
| Mostra password | Dialog con password temporanea da comunicare |

### Flusso UX

```text
1. Admin clicca "Crea Account" nella riga del venditore
2. Appare dialog con email precompilata (se presente)
3. Admin conferma email
4. Sistema crea account e mostra password temporanea
5. Admin comunica password al venditore
6. Venditore effettua login su /venditore
```

---

## 4. Miglioramenti UX

### Feedback Visivi

| Componente | Miglioramento |
|------------|---------------|
| SalespeopleConfig | Badge "Account attivo" se ha user_id |
| OrderCommissions | Animazione su toggle pagamento |
| Toast | Messaggi chiari di successo/errore |

### Loading States

- Loading durante creazione account
- Skeleton loader nelle tabelle
- Disabled button durante operazioni

---

## 5. Pulizia Codice

### Verifiche da Effettuare

| Area | Azione |
|------|--------|
| Import inutilizzati | Rimozione da tutti i file modificati |
| Console.log | Rimozione di log di debug |
| TypeScript | Verifica tipi corretti |
| Null checks | Gestione sicura di valori nullable |

---

## 6. File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/create-salesperson-user/index.ts` | Edge function per creare account venditore |

---

## 7. File da Modificare

| File | Modifica |
|------|----------|
| `src/components/settings/SalespeopleConfig.tsx` | Aggiungere pulsante "Crea Account" e mutation |

---

## 8. Dettaglio Tecnico: Edge Function

```typescript
// Struttura base
interface CreateSalespersonUserRequest {
  salesperson_id: string;
  email: string;
}

// Flusso:
// 1. Verifica autorizzazione (company_admin o super_admin)
// 2. Recupera venditore da salespeople
// 3. Verifica che user_id sia null
// 4. Crea auth user con password temporanea
// 5. Crea profilo con company_id del venditore
// 6. Assegna ruolo "salesperson"
// 7. Aggiorna salespeople.user_id
// 8. Restituisce password temporanea
```

---

## 9. Dettaglio Tecnico: SalespeopleConfig

### Nuova Colonna Tabella

```tsx
<TableHead>Account</TableHead>
...
<TableCell>
  {sp.user_id ? (
    <Badge variant="secondary" className="gap-1">
      <Check className="h-3 w-3" />
      Attivo
    </Badge>
  ) : (
    <Button size="sm" variant="outline" onClick={() => handleCreateAccount(sp)}>
      <UserPlus className="h-3 w-3 mr-1" />
      Crea Account
    </Button>
  )}
</TableCell>
```

### Dialog Creazione Account

```tsx
<Dialog open={createAccountDialog.open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Crea Account Venditore</DialogTitle>
      <DialogDescription>
        Verra creato un account per {salesperson.first_name} {salesperson.last_name}
      </DialogDescription>
    </DialogHeader>
    <Input 
      label="Email" 
      value={email} 
      onChange={setEmail}
    />
    <DialogFooter>
      <Button onClick={createAccount}>Crea Account</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Dialog Password Temporanea

```tsx
<Dialog open={showPassword}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Account Creato!</DialogTitle>
    </DialogHeader>
    <Alert>
      <p>Password temporanea:</p>
      <code className="font-mono text-lg">{tempPassword}</code>
      <p className="text-sm text-muted-foreground">
        Comunica questa password al venditore. 
        Dovra cambiarla al primo accesso.
      </p>
    </Alert>
  </DialogContent>
</Dialog>
```

---

## 10. Test End-to-End

### Scenario di Test

1. **Crea Venditore**
   - Vai in Impostazioni > Venditori
   - Crea nuovo venditore "Test Venditore" con 5% sul venduto

2. **Crea Account Venditore**
   - Clicca "Crea Account" nella riga del venditore
   - Inserisci email test@example.com
   - Annota password temporanea

3. **Crea Ordine con Venditore**
   - Vai in Ordini > Nuovo Ordine
   - Compila ordine con importo es. €10.000
   - Seleziona venditore creato
   - Salva ordine

4. **Verifica Previsionale**
   - Vai in Previsionale Cassa
   - Verifica che appaia nella sezione "Provvigioni da Pagare"
   - Importo atteso: €500 (5% di €10.000)

5. **Segna Provvigione come Pagata**
   - Vai in dettaglio ordine
   - Nella sezione "Provvigioni Venditori" attiva lo switch "Pagata"
   - Verifica che scompaia dal Previsionale

6. **Login come Venditore**
   - Logout
   - Login con credenziali venditore
   - Verifica redirect a /venditore
   - Verifica dashboard con ordine e provvigione
   - Verifica pagina "I Miei Ordini"
   - Verifica pagina "Guadagni"

---

## 11. Fasi di Implementazione

### Fase 1 - Edge Function
1. Creare `create-salesperson-user/index.ts`
2. Deploy automatico

### Fase 2 - UI SalespeopleConfig
1. Aggiungere pulsante "Crea Account"
2. Implementare dialog creazione
3. Implementare dialog password

### Fase 3 - Test e Pulizia
1. Test flusso completo
2. Rimozione codice inutilizzato
3. Verifica console pulita

---

## 12. Output Atteso

Al termine dell'implementazione:

- Edge function `create-salesperson-user` funzionante
- Pulsante "Crea Account" in SalespeopleConfig
- Badge "Account Attivo" per venditori con account
- Flusso end-to-end testato e funzionante
- Console senza errori

---

## Sezione Tecnica

### RLS Policies (gia configurate)

Le policy RLS per `order_salespeople` sono gia configurate:
- Company admins possono gestire tutto
- Salespeople possono vedere le proprie provvigioni (SELECT)
- Super admins hanno accesso completo

### Dipendenze

Nessuna nuova dipendenza richiesta.

### Secrets

L'edge function usera i secrets gia configurati:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
