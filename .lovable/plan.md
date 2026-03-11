

# Fix: Impersonazione persa dopo refresh della pagina

## Problema
L'impersonazione è salvata solo in stato React (in-memory). Al refresh della pagina, lo stato viene resettato e il super admin vede "Seleziona un'azienda per visualizzare la dashboard" perché `effectiveCompany` è `null`.

La riga 23 di `AuthContext.tsx` dice esplicitamente: *"Impersonation is now in-memory only (no sessionStorage) to prevent manipulation"* — ma questo rende l'impersonazione inutilizzabile dopo un refresh.

## Soluzione
Persistere `impersonatedCompanyId` e `impersonationToken` in `sessionStorage` (vive solo nel tab, come richiesto). Al mount, se esistono valori salvati, validare il token lato server tramite la edge function `secure-impersonation` (action `validate`) prima di ripristinare l'impersonazione. Se il token è scaduto o invalido, pulire sessionStorage.

### Modifiche in `src/contexts/AuthContext.tsx`

1. **Inizializzazione stato** (righe 86-87): leggere da `sessionStorage` all'avvio
   ```typescript
   const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(
     () => sessionStorage.getItem("imp_company_id")
   );
   const [impersonationToken, setImpersonationToken] = useState<string | null>(
     () => sessionStorage.getItem("imp_token")
   );
   ```

2. **Sincronizzazione sessionStorage**: aggiungere un `useEffect` che scrive/rimuove le chiavi quando i valori cambiano
   ```typescript
   useEffect(() => {
     if (impersonatedCompanyId) sessionStorage.setItem("imp_company_id", impersonatedCompanyId);
     else sessionStorage.removeItem("imp_company_id");
     if (impersonationToken) sessionStorage.setItem("imp_token", impersonationToken);
     else sessionStorage.removeItem("imp_token");
   }, [impersonatedCompanyId, impersonationToken]);
   ```

3. **Validazione al mount**: aggiungere un `useEffect` che, quando il ruolo è `super_admin` e c'è un token salvato, chiama `secure-impersonation` con action `validate` per verificare che il token sia ancora valido. Se valido, imposta il `impersonatedCompanyId` (che già triggera il fetch della company tramite l'useEffect esistente a riga 169). Se invalido, pulisce tutto.

4. **Pulizia logout** (riga 221): già presente — `setImpersonatedCompanyId(null)` e `setImpersonatedCompany(null)` cancelleranno anche sessionStorage grazie al sync effect.

5. **Spostare dichiarazione `impersonationToken`** (riga 250): attualmente dichiarato dopo `signOut`, spostarlo vicino a `impersonatedCompanyId` (riga 86) per coerenza.

Questa soluzione è sicura perché il token in sessionStorage viene sempre validato server-side prima del ripristino, e `sessionStorage` è isolato per tab e non sopravvive alla chiusura del browser.

