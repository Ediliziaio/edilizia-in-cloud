

# Piano: Rimuovere "Utenti" dalla Sidebar

## Panoramica

Questo piano rimuove la voce "Utenti" dalla sidebar aziendale, consolidando la gestione utenti esclusivamente nella pagina Impostazioni dove è già disponibile come tab dedicato.

---

## Stato Attuale

| Elemento | Posizione | Stato |
|----------|-----------|-------|
| Voce "Utenti" nella sidebar | `CompanyLayout.tsx`, linea 51 | Da rimuovere |
| Pagina `CompanyUsers.tsx` | `src/pages/azienda/CompanyUsers.tsx` | Può rimanere (backup) |
| Rotta `/azienda/utenti` | `App.tsx`, linea 128 | Da rimuovere |
| Tab "Utenti" in Impostazioni | `Settings.tsx`, linea 47-49 | Già presente e funzionante |
| Componente `UsersConfig` | `src/components/settings/UsersConfig.tsx` | Già in uso |

---

## Modifiche da Effettuare

### 1. CompanyLayout.tsx

Rimuovere la voce "Utenti" dall'array `allNavItems`:

```typescript
// RIMUOVERE questa linea:
{ title: "Utenti", url: "/azienda/utenti", icon: UserCog, permissionKey: "canViewUsers" },
```

Rimuovere anche l'import `UserCog` da lucide-react se non usato altrove.

### 2. App.tsx

Rimuovere la rotta dedicata agli utenti:

```typescript
// RIMUOVERE questa linea:
<Route path="utenti" element={<CompanyUsers />} />
```

Rimuovere l'import `CompanyUsers` se non usato altrove.

---

## Risultato Atteso

| Prima | Dopo |
|-------|------|
| Sidebar ha 10 voci | Sidebar ha 9 voci |
| Utenti accessibili da sidebar | Utenti accessibili solo da Impostazioni > Utenti |
| Due modi per accedere alla gestione utenti | Un solo punto di accesso centralizzato |

---

## Flusso Utente Dopo le Modifiche

```text
1. Admin naviga a Impostazioni
2. Seleziona tab "Utenti"  
3. Gestisce utenti staff (crea, modifica permessi, elimina)
```

---

## Verifica

Test da eseguire:

1. Verificare che "Utenti" non appaia più nella sidebar
2. Verificare che Impostazioni > Utenti funzioni correttamente
3. Verificare che si possano creare nuovi utenti staff
4. Verificare che si possano gestire i permessi
5. Verificare che la navigazione diretta a `/azienda/utenti` mostri 404

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Rimuovere voce "Utenti" e import `UserCog` |
| `src/App.tsx` | Rimuovere rotta `/azienda/utenti` e import `CompanyUsers` |

---

## Nota sulla Pulizia

Il file `CompanyUsers.tsx` può essere mantenuto nel codebase come backup, oppure rimosso se preferisci una pulizia completa. La funzionalità è completamente replicata in `UsersConfig.tsx` che è già usato nelle Impostazioni.

