
# Miglioramento Sezione Assistenza Aziende (Admin)

## Problemi trovati

### 1. Nessuna gestione errore
`AdminSupportChatList` non gestisce errori sulle query. Se una chiamata fallisce, la pagina resta sul loader infinito senza feedback. Stesso bug gia corretto in Dashboard, CompaniesList e CompanyDetail.

### 2. ChatSheet usa pattern manuale (useEffect/useState)
`AdminSupportChatSheet` usa `useEffect` + `useState` per caricare messaggi e conversazione, invece di `useQuery`. Questo crea inconsistenza con il resto dell'app e perde caching, retry automatico e gestione errori.

### 3. Mancano isError e refetch sulla pagina GlobalTickets
La pagina wrapper `GlobalTickets.tsx` non ha nessun modo di mostrare uno stato di errore.

### 4. Messaggio di errore per invio fallito nella ChatSheet
Se l'inserimento di un messaggio fallisce, l'errore viene ignorato silenziosamente.

---

## Piano di intervento

### File: `src/components/admin/support/AdminSupportChatList.tsx`

**Gestione errore sulle query:**
- Estrarre `isError` e `refetch` dalla query principale (`admin-support-messages`)
- Aggiungere stato errore con `Alert` + tasto "Riprova" (stesso pattern di CompaniesList)
- Aggiungere `isError` anche alla query `admin-companies-for-support` e `admin-support-conversations`

**Miglioramenti minori:**
- Aggiungere `import { Alert, AlertDescription } from "@/components/ui/alert"` e `RefreshCw`

### File: `src/components/admin/support/AdminSupportChatSheet.tsx`

**Migrazione a useQuery:**
- Sostituire `useEffect` per il fetch dei messaggi con `useQuery` (queryKey: `["admin-support-chat", companyId]`)
- Sostituire `useEffect` per il fetch della conversazione con `useQuery` (queryKey: `["admin-support-conv", companyId]`)
- Mantenere il channel Realtime ma aggiornare via `queryClient.setQueryData` o invalidazione
- Gestire errore invio messaggio con `toast.error`

**Gestione errore invio:**
- Aggiungere `toast.error` nel caso `handleSend` fallisca

### File: `src/pages/admin/GlobalTickets.tsx`

Nessuna modifica necessaria -- la pagina e solo un wrapper che delega tutto ad `AdminSupportChatList`, che gestira gli errori internamente.

---

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `AdminSupportChatList.tsx` | + isError/refetch con Alert e Riprova |
| `AdminSupportChatSheet.tsx` | Migrazione da useEffect/useState a useQuery, gestione errore invio |

## Cosa rimane invariato
- SupportStats, SupportFilters, ConversationActions -- gia ben strutturati
- Realtime subscription per messaggi in arrivo
- Logica di aging e indicatori visivi
- Filtri per stato, priorita, ordinamento
- Inline update di stato/priorita nella lista
