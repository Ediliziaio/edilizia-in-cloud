
# Analisi Sezione Clienti

## Stato Generale: Funzionante, ben strutturato

La sezione comprende 5 file (3 pagine + 2 componenti): lista clienti con ricerca/export/import CSV, dettaglio cliente con modifica e storico ordini, creazione cliente (pagina dedicata + dialog inline negli ordini), reset password, riepilogo finanziario e tempistiche per il portale cliente. Tutto funzionante.

---

## DEAD CODE TROVATO

### 1. Variabile `user` non utilizzata in CustomersList (Priorita: Bassa)
**File**: `src/pages/azienda/CustomersList.tsx` (riga 71)

La destructuring `const { effectiveCompany, user } = useAuth()` estrae `user` ma non viene mai usato nel componente. Solo `effectiveCompany` e utilizzato.

**Fix**: Rimuovere `user` dalla destructuring: `const { effectiveCompany } = useAuth()`.

---

## NESSUN BUG TROVATO

- Query clienti: logica corretta (fetch ruoli "customer" -> filtra per company_id -> conta ordini)
- Ricerca: copre nome, cognome, email, telefono, codice fiscale
- Export CSV: formato corretto con BOM UTF-8 e separatore ";"
- Import CSV: validazione campi obbligatori, usa edge function `create-customer`
- Reset password: usa edge function `reset-customer-password` con dialog di conferma
- Eliminazione: blocco corretto se il cliente ha ordini associati (sia in lista che in dettaglio)
- CompanyCustomerDetail: form modifica con tutti i campi, storico ordini con stato colorato
- CreateCustomer e CreateCustomerDialog: stessa logica, la dialog e usata in CreateOrder/EditOrder
- CustomerFinancialSummary: calcolo IVA, bonus edilizio, finanziamento tutti corretti
- CustomerDatesCard: rendering condizionale (nasconde se nessuna data presente)
- Tutti gli import sono utilizzati (tranne `user` sopra indicato)

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/pages/azienda/CustomersList.tsx` | Rimuovere `user` non utilizzato dalla destructuring di `useAuth()` | Bassa |

Nessun file da eliminare, nessun bug funzionale.
