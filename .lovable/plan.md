

# Implementazioni - Pannello Super Admin per Feature Flag

## Cosa viene creato

Una nuova pagina "Implementazioni" nella sidebar del Super Admin, dove puoi attivare o disattivare moduli (come "Messaggistica BETA") per tutte le aziende o solo per alcune selezionate.

---

## Come funziona

### Sidebar Admin

Nuova voce nella sidebar, tra "Referral" e "Impostazioni":
- Icona: puzzle/blocchi
- Testo: "Implementazioni"
- Permesso: `can_manage_companies` (stesso di chi gestisce le aziende)

### Pagina Implementazioni

Una lista di card, ciascuna rappresenta un modulo attivabile:

```text
+-------------------------------------------------------+
| Messaggistica (BETA)                          [Badge]  |
| Modulo di messaggistica con AI per gestire             |
| conversazioni WhatsApp e automatizzare task.           |
|                                                        |
| Attivo su: 3 aziende                                  |
|                                                        |
| [Seleziona aziende...]              [Attiva per tutte] |
|                                                        |
| Aziende attive:                                        |
| [x] Rossi Serramenti    [x] Bianchi Infissi           |
| [x] Verdi Costruzioni                                  |
+-------------------------------------------------------+
```

Per ogni modulo puoi:
- **Attiva per tutte**: un click abilita il flag su tutte le aziende
- **Disattiva per tutte**: rimuove il flag da tutte
- **Seleziona singole**: checkbox per attivare/disattivare su aziende specifiche
- Vedere quante aziende hanno il modulo attivo

---

## Dettaglio tecnico

### Nuovi file

| File | Descrizione |
|------|-------------|
| `src/pages/admin/Implementations.tsx` | Pagina principale con lista moduli e gestione toggle per azienda |

### File modificati

| File | Modifica |
|------|----------|
| `src/components/layouts/AdminLayout.tsx` | Aggiunta voce "Implementazioni" nella sidebar con icona `Blocks` e permesso `can_manage_companies` |
| `src/App.tsx` | Aggiunta route `/admin/implementazioni` |

### Logica

- Carica tutte le aziende dal DB
- Per ogni modulo (per ora solo `messaging_beta_enabled`), mostra lo stato attuale di ogni azienda
- Toggle singolo: `UPDATE companies SET messaging_beta_enabled = true/false WHERE id = ?`
- Toggle globale: `UPDATE companies SET messaging_beta_enabled = true/false` (tutte)
- La struttura e' predisposta per aggiungere futuri moduli semplicemente aggiungendo un elemento alla lista dei moduli disponibili

### Nessuna modifica al database

Il campo `messaging_beta_enabled` esiste gia' nella tabella `companies`. Non servono nuove tabelle o colonne.

