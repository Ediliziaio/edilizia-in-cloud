
# Funzionalita': "Accedi come utente" nel pannello Super Admin

## Cosa viene aggiunto
Un pulsante in alto a destra nell'header admin che apre un popover con la lista di tutti gli utenti del sistema (super admin, admin azienda, staff, clienti, dipendenti, venditori). Cliccando su un utente, il sistema effettua il login come quell'utente per poter vedere esattamente cosa vede lui.

## Come funziona

1. **Nuovo pulsante nell'header** (in alto a destra nella barra dell'AdminLayout)
   - Icona utente con popover
   - Campo di ricerca per nome/email
   - Lista utenti raggruppati per ruolo con avatar, nome, email e badge del ruolo
   - Scroll per liste lunghe

2. **Edge Function `sign-in-as-user`**
   - Riceve l'email dell'utente target
   - Verifica che il chiamante sia un super_admin
   - Usa l'API admin di autenticazione per generare un magic link
   - Restituisce i dati di accesso necessari al client

3. **Flusso client**
   - Il super admin clicca su un utente nella lista
   - Il client chiama l'edge function
   - Riceve il token e lo usa per autenticarsi come quell'utente
   - Viene reindirizzato alla dashboard appropriata per il ruolo dell'utente

## Dettagli tecnici

### File modificati
- **`src/components/layouts/AdminLayout.tsx`**: Aggiunta del componente `QuickLoginPopover` nell'header, a destra, con popover contenente ricerca e lista utenti

### Nuovi file
- **`supabase/functions/sign-in-as-user/index.ts`**: Edge function che:
  - Verifica che il chiamante abbia ruolo `super_admin` tramite query su `user_roles`
  - Usa `supabase.auth.admin.generateLink({ type: 'magiclink', email })` per ottenere i dati di verifica
  - Restituisce i parametri necessari per il login lato client

### Logica del componente
- Query su `profiles` + `user_roles` per ottenere tutti gli utenti con ruolo
- Filtro per nome/email con campo di ricerca
- Raggruppamento visivo per ruolo (Super Admin, Admin Azienda, Staff, Clienti, Dipendenti, Venditori)
- Al click: chiamata all'edge function, poi `supabase.auth.verifyOtp()` con i dati ricevuti, infine redirect basato sul ruolo
