

# Piano: Rimuovere CompanyUsers.tsx

## Panoramica

Il file `CompanyUsers.tsx` non è più utilizzato dopo la rimozione della rotta `/azienda/utenti`. Questo piano elimina il file per completare la pulizia del codebase.

---

## Stato Attuale

| Elemento | Stato |
|----------|-------|
| Sidebar senza "Utenti" | ✅ Verificato - Solo 9 voci presenti |
| Impostazioni > Utenti | ✅ Funzionante - UsersConfig.tsx attivo |
| Rotta `/azienda/utenti` | ✅ Rimossa da App.tsx |
| Import CompanyUsers | ✅ Rimosso da App.tsx |
| File CompanyUsers.tsx | ⚠️ Da eliminare - Non più referenziato |

---

## Modifica da Effettuare

### Eliminazione File

| File | Azione |
|------|--------|
| `src/pages/azienda/CompanyUsers.tsx` | Eliminare |

---

## Verifica Pre-Eliminazione

Ricerca nel codebase per "CompanyUsers":

```
Risultato: Solo 5 match, tutti interni al file stesso
- Nessun import esterno
- Nessuna rotta attiva
- Nessun riferimento in altri componenti
```

---

## Risultato Atteso

| Prima | Dopo |
|-------|------|
| File CompanyUsers.tsx presente (267 linee) | File rimosso |
| Codebase con file non utilizzato | Codebase pulito |

---

## Funzionalità Preservate

La gestione utenti staff rimane completamente funzionante tramite:

1. **Impostazioni > Tab "Utenti"** (`Settings.tsx`, linea 47-50)
2. **Componente UsersConfig** (`UsersConfig.tsx`) con:
   - Lista utenti staff
   - Pulsante "Nuovo Utente"
   - Gestione permessi (icona Shield)
   - Eliminazione utenti (icona Trash)
   - Dialog creazione con password temporanea
   - Dialog permessi granulari

