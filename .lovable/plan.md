

# Piano: Miglioramento Dettagli Azienda e Tab Team

## Panoramica

Migliorare il tab "Dettagli di base" con tutti i dati azienda in un layout professionale, e aggiungere un nuovo tab "Team" per visualizzare tutti gli utenti collegati all'azienda (admin, staff, venditori, dipendenti) con i relativi ruoli e permessi.

---

## 1. Tab "Dettagli di base" - Miglioramento UX

Il form attuale mostra solo nome, email e settore. Va arricchito con tutte le informazioni disponibili e un layout piu professionale.

**Layout a due colonne:**

**Colonna sinistra - Form editabile (2/3 larghezza):**
Organizzato in sezioni con separatori visivi:

*Sezione "Anagrafica Azienda"*
- Nome azienda
- Email azienda
- Settore (select)
- Logo (upload/preview con possibilita di rimuovere)

*Sezione "Date e Stato"* (solo lettura, non editabili)
- Data creazione
- Ultimo aggiornamento
- Stato abbonamento (badge)
- Scadenza trial (se applicabile)

**Colonna destra - Riepilogo rapido (1/3 larghezza):**
Card "Panoramica" con dati chiave in formato compatto:
- Logo grande o placeholder
- Nome e email
- Badge stato e settore
- Piano attuale
- Data creazione
- Conteggio rapido: ordini, clienti, utenti team

Bottone "Salva Modifiche" con feedback visivo.

---

## 2. Nuovo Tab "Team"

Un tab dedicato per vedere tutti gli utenti che fanno parte dell'azienda, organizzato per ruolo.

**Dati da mostrare:**
Query su `profiles` + `user_roles` + `staff_permissions` filtrati per `company_id`.

**Sezioni per ruolo:**

*Admin Azienda (ruolo `company_admin`)*
- Tabella: Nome, Email, Data creazione
- Badge "Admin" verde

*Staff (ruolo `company_staff`)*
- Tabella: Nome, Email, Permessi (riepilogo badge), Data creazione
- Espandere i permessi con tooltip o badge multipli
- Ogni riga mostra quali sezioni puo vedere/modificare

*Venditori (da tabella `salespeople`)*
- Tabella: Nome, Email, Telefono, Tipo provvigione, Valore provvigione, Stato (attivo/inattivo)
- Badge "Venditore" blu
- Indicare se ha un account utente (user_id presente)

*Dipendenti (da tabella `employees`)*
- Tabella: Nome, Email, Telefono, Stipendio lordo/netto, Ore mensili, Stato
- Badge "Dipendente" viola
- Indicare se ha un account utente

**Header del tab:**
- Conteggio totale utenti per ruolo (es. "2 Admin, 3 Staff, 4 Venditori, 6 Dipendenti")
- Nessuna azione di creazione/modifica (il Super Admin usa l'impersonazione per gestire gli utenti)

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/admin/CompanyDetail.tsx` | Riscrivere | Migliorare tab Dettagli, aggiungere tab Team |

Nessuna modifica al database necessaria: tutti i dati sono gia disponibili nelle tabelle esistenti (`profiles`, `user_roles`, `staff_permissions`, `salespeople`, `employees`).

---

## Dettagli Tecnici

### Query Tab Team

```text
-- Admin e Staff
1. profiles WHERE company_id = :id
2. user_roles WHERE user_id IN (profile_ids)
3. staff_permissions WHERE company_id = :id

-- Venditori
4. salespeople WHERE company_id = :id

-- Dipendenti
5. employees WHERE company_id = :id
```

### Struttura Tab aggiornata

```text
[Dettagli di base] [Team] [SaaS] [Abbonamento] [Attivita]
```

Il tab Team viene posizionato subito dopo i dettagli, prima di SaaS, perche rappresenta informazioni operative importanti per il Super Admin.

### Layout Tab Dettagli

```text
+----------------------------------+------------------+
| FORM EDITABILE                   | PANORAMICA       |
|                                  |                  |
| -- Anagrafica Azienda --        | [Logo/Placeholder]|
| [Nome]          [Email]          | Nome Azienda     |
| [Settore]       [Logo Upload]    | email@azienda.it |
|                                  | Badge Stato      |
| -- Date e Stato (readonly) --   | Badge Settore    |
| Creata il: 01/01/2025           |                  |
| Aggiornata: 13/02/2026          | Piano: Business  |
| Stato: [Badge Active]           | Creata: 6 mesi fa|
| Trial scade: -                  |                  |
|                                  | 15 Ordini        |
| [Salva Modifiche]               | 8 Clienti        |
|                                  | 5 Team members   |
+----------------------------------+------------------+
```

### Layout Tab Team

```text
Header: "15 membri totali: 1 Admin, 3 Staff, 5 Venditori, 6 Dipendenti"

--- Admin Azienda ---
| Nome          | Email              | Creato il    |
| Mario Rossi   | admin@azienda.it   | 01/01/2025   |

--- Staff ---
| Nome          | Email           | Permessi                    | Creato il  |
| Luca Bianchi  | luca@azienda.it | Dashboard, Ordini, Clienti  | 05/03/2025 |

--- Venditori ---
| Nome           | Telefono     | Provvigione    | Account | Stato   |
| Anna Verdi     | 333-1234567  | 5% sul venduto | Attivo  | Attivo  |

--- Dipendenti ---
| Nome           | Telefono     | Ore/mese | Lordo     | Account | Stato   |
| Marco Neri     | 333-7654321  | 160      | 2.500 EUR | Attivo  | Attivo  |
```

