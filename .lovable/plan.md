
# Piano di Implementazione - Pagina Profilo Cliente e Test Sistema Ticket

## Panoramica

Questo piano copre due aree:
1. Implementazione della pagina Profilo Cliente con modifica dati personali
2. Test end-to-end del sistema ticket (creazione come cliente, risposta come admin)

---

## 1. Pagina Profilo Cliente

### File: `src/pages/cliente/CustomerProfile.tsx`

Creeremo una pagina dedicata alla gestione del profilo personale del cliente con:

**Layout:**
- Header con titolo "Il Mio Profilo"
- Card con form di modifica dati
- Indicatore di caricamento/salvataggio
- Feedback toast per conferma modifiche

**Campi Modificabili:**
- Nome (obbligatorio)
- Cognome (obbligatorio)  
- Telefono (opzionale)
- Indirizzo (opzionale)

**Campi in Sola Lettura:**
- Email (visualizzata ma non modificabile, legata all'autenticazione)

### Struttura UI

```text
+----------------------------------+
| Il Mio Profilo                   |
+----------------------------------+
| Informazioni Personali           |
|                                  |
| Email (solo lettura)             |
| [mario.rossi@example.com]        |
|                                  |
| Nome *          | Cognome *      |
| [Mario       ]  | [Rossi      ] |
|                                  |
| Telefono                         |
| [333-1234567               ]     |
|                                  |
| Indirizzo                        |
| [Via Roma 123, Milano      ]     |
|                                  |
|           [Salva Modifiche]      |
+----------------------------------+
```

---

## 2. Funzionalita Tecnica

### Sicurezza
La RLS policy esistente permette agli utenti di:
- Leggere il proprio profilo: `(id = auth.uid())`
- Aggiornare il proprio profilo: `(id = auth.uid())`

Quindi il cliente puo modificare solo i propri dati.

### Validazione Form
- Nome e Cognome sono obbligatori
- Telefono e Indirizzo sono opzionali
- Lunghezza massima per evitare abusi

### Integrazione con AuthContext
Dopo il salvataggio, verra chiamato `refreshAuth()` per aggiornare i dati del profilo nel contesto, in modo che il nome visualizzato nell'header sia sempre sincronizzato.

---

## 3. File da Creare

```text
src/pages/cliente/CustomerProfile.tsx  - Pagina profilo cliente
```

---

## 4. File da Modificare

```text
src/App.tsx - Sostituire il placeholder alla linea 111 con CustomerProfile
```

La route `/cliente/profilo` attualmente mostra un placeholder e verra collegata alla nuova pagina.

---

## 5. Componenti Utilizzati

- `Card`, `CardHeader`, `CardTitle`, `CardContent` (shadcn)
- `Input`, `Label`, `Button` (shadcn)
- `useAuth` per accedere al profilo e refreshAuth
- `useMutation` per gestire l'aggiornamento
- `useToast` per feedback utente

---

## 6. Query Database

### Aggiornamento Profilo
```typescript
const { error } = await supabase
  .from("profiles")
  .update({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    phone: phone.trim() || null,
    address: address.trim() || null,
    updated_at: new Date().toISOString(),
  })
  .eq("id", user.id);
```

---

## 7. Flusso di Test Previsto

Dopo l'implementazione, eseguiro i seguenti test:

### Test 1: Login Cliente e Verifica Profilo
1. Effettuare login come mario.rossi@example.com
2. Navigare a /cliente/profilo
3. Verificare che i dati siano precompilati
4. Modificare il telefono
5. Salvare e verificare toast di conferma

### Test 2: Creazione Ticket Cliente
1. Navigare a /cliente/assistenza
2. Cliccare "Nuovo Ticket"
3. Compilare oggetto e messaggio
4. Inviare il ticket
5. Verificare che appaia nella lista

### Test 3: Risposta Admin al Ticket
1. Logout dal cliente
2. Login come admin azienda
3. Navigare a /azienda/assistenza
4. Aprire il ticket creato
5. Inviare una risposta
6. Cambiare stato a "In Lavorazione"

### Test 4: Verifica Risposta lato Cliente
1. Logout dall'admin
2. Login come cliente
3. Verificare che il ticket mostri la risposta
4. Verificare che lo stato sia aggiornato

---

## 8. Responsive Design

La pagina sara ottimizzata per mobile:
- Layout a singola colonna
- Campi a larghezza piena su schermi piccoli
- Pulsante salva prominente e touch-friendly

---

## Dettagli Tecnici

### Gestione Stato Form
Utilizzeremo `useState` per ogni campo con valori iniziali dal profilo:
```typescript
const { profile, refreshAuth } = useAuth();
const [firstName, setFirstName] = useState(profile?.first_name || "");
const [lastName, setLastName] = useState(profile?.last_name || "");
const [phone, setPhone] = useState(profile?.phone || "");
const [address, setAddress] = useState(profile?.address || "");
```

### Gestione Errori
- Validazione client-side prima dell'invio
- Toast di errore in caso di fallimento
- Disabilitazione pulsante durante il salvataggio
