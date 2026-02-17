
# Piano: Stabilizzazione, Pulizia e Fix - Sezione Admin

## 1. Bug da correggere

### 1.1 Console Warning: `TrialBadge` e `Select` ref (CompaniesList.tsx)
- Il componente `TrialBadge` (riga 22) viene renderizzato dentro una `TableCell` che tenta di passare un ref. React avvisa che le function component non accettano ref.
- **Fix**: Wrappare `TrialBadge` con `React.forwardRef` oppure trasformarlo in un semplice `<span>` inline senza componente separato.

### 1.2 Edge Function `getClaims` potenzialmente instabile
- In `manage-super-admins/index.ts` (riga 49) e `create-checkout-session/index.ts` (riga 40) viene usato `callerClient.auth.getClaims(token)`.
- Questo metodo non e presente in tutte le versioni della libreria Supabase JS.
- **Fix**: Aggiungere fallback a `getUser()` se `getClaims` fallisce, per garantire compatibilita.

```text
Logica proposta:
1. Provare getClaims(token)
2. Se fallisce, usare getUser() con il token nell'header
3. Estrarre l'user ID da uno dei due risultati
```

## 2. Pulizia codice

### 2.1 Import non utilizzati in CompaniesList.tsx
- `Building2` usato, `Plus` usato, `Search` usato, `LogIn` usato, `ExternalLink` usato, `Loader2` usato, `Download` usato, `ChevronDown` usato, `RefreshCw` usato, `AlertCircle` usato, `Clock` usato, `DollarSign` usato, `ClipboardList` usato, `Calendar` usato, `Users` usato, `TrendingUp` usato
- Tutti gli import risultano utilizzati. Nessuna rimozione necessaria.

### 2.2 Pattern insolito: Employees importato in Settings.tsx
- `Settings.tsx` (riga 15) importa `Employees` come pagina intera usata come tab.
- Non e un bug ma un pattern atipico. Non tocchiamo per evitare regressioni.

## 3. Miglioramenti UX

### 3.1 AccessDenied: aggiungere CTA per tornare indietro
- Il componente `AccessDenied.tsx` attualmente mostra solo un messaggio statico senza via d'uscita.
- **Fix**: Aggiungere un bottone "Torna alla Dashboard" che naviga a `/admin`.

### 3.2 AuditLogTab: stato vuoto piu descrittivo
- Quando non ci sono log, il messaggio e generico. Aggiungere un'icona e testo piu chiaro.

### 3.3 Quick Impersonation: reset ricerca alla chiusura
- Quando il popover si chiude, la ricerca viene gia resettata (riga 101). OK, nessun fix necessario.

## 4. Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/pages/admin/CompaniesList.tsx` | Wrappare `TrialBadge` con `forwardRef` per eliminare il warning console |
| `supabase/functions/manage-super-admins/index.ts` | Aggiungere fallback `getUser()` se `getClaims` non disponibile |
| `supabase/functions/create-checkout-session/index.ts` | Stesso fallback `getUser()` |
| `src/components/admin/AccessDenied.tsx` | Aggiungere bottone "Torna alla Dashboard" |
| `src/components/admin/settings/AuditLogTab.tsx` | Migliorare stato vuoto con icona |

## 5. Cosa NON viene toccato (gia funzionante)

- Permessi granulari: hook `useSuperAdminPermissions` corretto, backward compatible
- Filtro navigazione sidebar: `filteredNavItems` funzionante
- Guard su tutte le pagine admin: verificati e presenti
- Audit log: tabella, edge function e UI funzionanti
- Quick impersonation: popover, ricerca, navigazione funzionanti
- Impersonation audit logging in `AuthContext.tsx`: presente e funzionante

## 6. Conferma test

Dopo l'implementazione:
- Verifica console pulita (zero warning ref)
- Verifica che le edge function rispondano correttamente con il fallback
- Verifica che AccessDenied mostri il bottone di ritorno
- Verifica navigazione completa admin con permessi attivi e disattivi
