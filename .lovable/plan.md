

# Miglioramento Expanded Row — Prospettiva CEO/Sales/Marketing

## Analisi dello Stato Attuale (Screenshot)

Guardando la riga espansa, un CEO o Sales Manager vede:
- 6 KPI cards ma 2 sono binari inutili ("Clienti: Presenti", "Staff: Presenti" — non dice quanti)
- Sezione 2 spesso mostra solo "Scadenza Trial" se i campi aziendali non sono compilati — spreco di spazio
- Nessuna indicazione su **cosa fare** con questa azienda — manca totalmente la componente di **actionability**
- Il componente `CompanyNextActions` (azioni suggerite intelligenti) esiste già nel dettaglio ma NON è presente nella expanded row
- Nessun modo di contattare rapidamente il cliente (telefono, email) senza aprire il dettaglio

## Miglioramenti Proposti

### 1. Next Best Action nella Expanded Row
Il motore `getNextActions` già calcola suggerimenti intelligenti (trial in scadenza, onboarding incompleto, inattività). Portarlo nella expanded row significa che un Sales Manager vede IMMEDIATAMENTE cosa fare senza aprire il dettaglio.

### 2. Contatori reali per Clienti e Staff
Sostituire "Presenti/Nessuno" con il numero effettivo. I dati `has_customers`/`has_staff` sono boolean ma `user_count` e `order_count` sono già in `healthData`. Per i clienti serve un campo aggiuntivo — in assenza, mostrare almeno il numero utenti totali.

### 3. Quick Contact inline
Aggiungere sotto i KPI una riga con bottoni "Chiama" (se phone presente) e "Email" clickabili, più "Aggiungi Nota" inline. Un CEO vuole agire in 1 click.

### 4. Sezione Business Info condizionale
Se nessun campo business è compilato, nascondere completamente la sezione 2 invece di mostrare un box vuoto.

### 5. Health Score Breakdown
Aggiungere una mini barra segmentata che mostra PERCHÉ lo score è quello che è (ordini, utenti, clienti, staff, attività recente) — trasparenza sulla salute dell'account.

## Piano Implementazione

### File modificati:

**`src/components/admin/company/CompanyExpandedRow.tsx`**
- Importare e usare `getNextActions` da `CompanyNextActions` (estrarre la funzione)
- Mostrare strip "Azioni Suggerite" tra KPI e business info
- Cambiare Clienti/Staff da boolean a contatori con fallback
- Aggiungere riga quick contact (telefono clickable, email clickable, bottone "Nota rapida")
- Rendere Section 2 condizionale (nascosta se tutti i campi sono null)
- Aggiungere mini breakdown health score (5 segmenti colorati)

**`src/components/admin/company/CompanyNextActions.tsx`**
- Esportare `getNextActions` come funzione separata per riuso

**`src/lib/companyUtils.ts`**
- Aggiungere `getHealthBreakdown(hd)` che restituisce i 5 fattori con punteggio individuale

### Nessuna migrazione DB, nessun file nuovo

