

# Analisi Critica del Sistema -- Risultati

## 1. SICUREZZA -- Criticita' ALTA

### 1.1 TUTTE le Edge Functions hanno `verify_jwt = false`
**Severita': CRITICA** -- Ogni singola funzione (100+) in `config.toml` ha `verify_jwt = false`. Questo significa che il gateway non valida il JWT prima di inoltrare la richiesta. Molte funzioni implementano auth manualmente (bene), ma alcune sensibili come:
- `manage-super-admins` -- gestione admin
- `sign-in-as-user` -- login come altro utente  
- `admin-adjust-credits` -- modifica crediti
- `revoke-user-session` -- revoca sessioni

...richiedono tutte l'header Authorization manualmente, il che va bene, **ma** funzioni come `send-test-email`, `send-whatsapp-reply`, `whatsapp-broadcast`, `send-email-campaign` dovrebbero essere verificate per assicurarsi che implementino auth interna.

### 1.2 `effectiveCompany` nel contesto multi-company per platform_* roles
Il calcolo di `effectiveCompany` (riga 435-439 di AuthContext) non gestisce i ruoli `platform_*` nello switcher multi-company:

```
const effectiveCompany = isImpersonating
  ? impersonatedCompany
  : state.role === "multi_company_user" && multiCompanyObj
    ? multiCompanyObj
    : state.company;
```

Solo `multi_company_user` usa `multiCompanyObj`. I ruoli `platform_manager`, `platform_sales`, ecc. caricano `multiCompanyAccesses` (riga 380-388) ma NON vengono considerati nel calcolo di `effectiveCompany`. Questo significa che uno staff di piattaforma con accesso multi-company non potra' switchare azienda tramite l'effectiveCompany.

### 1.3 Role Priority non include ruoli piattaforma
In `fetchUserData` (riga 172), la priority e':
```
const rolePriority: AppRole[] = ["salesperson", "call_center", "company_admin", "company_staff"];
```
I ruoli `super_admin`, `platform_*`, `referrer`, `multi_company_user` non sono nella lista. Se un utente ha sia `super_admin` che `company_admin`, il sistema potrebbe assegnare `company_admin` come ruolo effettivo (viene trovato prima nella priority list) anziche' `super_admin`. Il fallback `userRoles[0]` dipende dall'ordine del database.

**Fix**: Aggiungere `super_admin` e i ruoli piattaforma in cima alla priority.

---

## 2. ARCHITETTURA -- Criticita' MEDIA

### 2.1 Race Condition nell'AuthContext
Riga 252-304: `onAuthStateChange` e `refreshAuth()` vengono eseguiti in parallelo. Entrambi chiamano `fetchUserData` e fanno `setState`. Questo puo' causare:
- Doppia chiamata al database al primo caricamento
- State flickering (isLoading true->false->true->false)

Il `setTimeout(() => {}, 0)` a riga 258 mitiga parzialmente ma non risolve.

### 2.2 `selectedMultiCompanyId` non validato al restore
A riga 104, `selectedMultiCompanyId` viene ripristinato da `sessionStorage` senza verifica che l'utente abbia ancora accesso a quell'azienda. Un utente a cui viene revocato l'accesso continuerebbe a vedere la vecchia azienda fino al refresh dei dati.

### 2.3 Console Warning: forwardRef mancante
Il log mostra `WarehouseItemDetailDialog` e il componente Sortable di dnd-kit con warning `Function components cannot be given refs`. Non critico ma indica un pattern errato.

---

## 3. FUNZIONALITA' -- Criticita' MEDIA

### 3.1 `form-submit` senza autenticazione
La funzione `form-submit` (pubblica per design: form pubblici) non ha rate limiting ne' protezione CAPTCHA, solo un hash IP. Vulnerabile a spam automatizzato.

### 3.2 Mancanza di cleanup impersonation token
Se il token di impersonazione scade lato server ma non viene invalidato lato client, l'utente vede la UI impersonata ma le query falliranno silenziosamente con i dati della company originale (perche' le query usano `effectiveCompany` che e' gia' risolta client-side).

---

## 4. PERFORMANCE -- Criticita' BASSA

### 4.1 153 file usano `effectiveCompany?.id`
Pattern corretto e consolidato, nessun problema.

### 4.2 `dangerouslySetInnerHTML` sanitizzato
Tutti i 5 usi di `dangerouslySetInnerHTML` passano per `DOMPurify.sanitize()`. Corretto.

---

## Riepilogo Priorita'

| # | Criticita' | Problema | Effort |
|---|-----------|----------|--------|
| 1 | **CRITICA** | Role priority manca super_admin in cima | Basso |
| 2 | **ALTA** | effectiveCompany non gestisce platform_* roles con switcher | Medio |
| 3 | **ALTA** | Verificare auth interna su edge functions sensibili | Medio |
| 4 | **MEDIA** | Race condition auth (doppia fetch) | Medio |
| 5 | **MEDIA** | form-submit senza rate limiting | Basso |
| 6 | **BASSA** | forwardRef warning su Warehouse | Basso |

Vuoi che proceda a fixare le criticita' 1 e 2 (le piu' pericolose e con effort basso/medio)?

