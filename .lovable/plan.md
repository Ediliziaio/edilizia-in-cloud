

# Analisi End-to-End: Creazione Utente Platform Implementation

Ho analizzato l'intero flusso dal wizard UI fino all'edge function e al login dell'utente creato. Il flusso funziona correttamente per la creazione, ma ho identificato un problema architetturale significativo relativo all'accesso aziendale post-login.

---

## Flusso Attuale (funzionante)

1. **Step 0** — Selezione ruolo `platform_implementation` ✅
2. **Step 1** — Inserimento nome, cognome, email ✅
3. **Step 2** — Selezione aziende + ruolo per ciascuna (Admin/Operatore/Venditore/Call Center) ✅
4. **Step 3** — Permessi granulari per aziende non-Admin (con preset automatico) ✅
5. **Step 4** — Conferma e creazione ✅
6. **Step 99** — Schermata successo con password temporanea copiabile ✅

**Edge Function `create`** (riga 156-293):
- Crea `auth.users` + `profiles` + `user_roles` (ruolo: `platform_implementation`) ✅
- Crea `super_admin_permissions` con preset Implementation ✅
- Inserisce righe in `multi_company_access` per ogni azienda ✅
- Inserisce `staff_permissions` per aziende non-Admin ✅
- Ritorna `temporaryPassword` ✅

---

## Bug Trovato: Accesso Aziendale Non Funziona per Utenti Piattaforma

**Problema**: L'`AuthContext` (riga 367) carica gli accessi multi-azienda **solo** se `state.role === "multi_company_user"`. Ma gli utenti piattaforma hanno ruolo `platform_implementation` (non `multi_company_user`), quindi i loro accessi aziendali via `multi_company_access` **non vengono mai caricati**.

Questo significa che un utente `platform_implementation` con 2 aziende assegnate:
- Può accedere alla dashboard `/admin` ✅
- **Non può** vedere o switchare tra le aziende assegnate ❌
- **Non ha** un `effectiveCompany` per operare nel contesto aziendale ❌

**Soluzione**: Estendere il check in `AuthContext` per caricare `multi_company_access` anche per i ruoli piattaforma che hanno aziende assegnate. La condizione a riga 367 dovrebbe diventare:

```typescript
if (!state.user || (state.role !== "multi_company_user" && !PLATFORM_ROLES.includes(state.role))) {
  setMultiCompanyAccesses([]);
  return;
}
```

Oppure, in alternativa, verificare direttamente se l'utente ha record in `multi_company_access` indipendentemente dal ruolo.

---

## Riepilogo

| Componente | Stato |
|---|---|
| Wizard UI (5 step) | ✅ Funzionante |
| Edge Function create | ✅ Funzionante |
| Creazione auth + profile + roles | ✅ Corretto |
| Inserimento multi_company_access | ✅ Corretto |
| Inserimento staff_permissions | ✅ Corretto |
| Password temporanea + copia | ✅ Corretto |
| Error handling (messaggi IT) | ✅ Corretto |
| **Caricamento accessi aziendali post-login** | **❌ Bug** |

### Modifiche necessarie

**File**: `src/contexts/AuthContext.tsx` — riga 367
Estendere la condizione per includere i ruoli piattaforma, in modo che gli utenti `platform_*` possano accedere alle aziende assegnate tramite lo switcher.

