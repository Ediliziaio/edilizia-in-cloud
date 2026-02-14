

# Sistema Referral -- Programma di Affiliazione

## Panoramica

Un sistema completo di referral che permette a chiunque (aziende esistenti, partner, influencer) di consigliare la piattaforma tramite un link personalizzato e guadagnare una commissione ricorrente mensile su ogni azienda che si iscrive tramite il loro link.

---

## Come Funziona

### Per il Referrer (chi consiglia)
1. Il Super Admin crea un referrer dalla sezione "Referral" nel pannello admin
2. Il referrer riceve un **link univoco** (es. `https://app.com/login?ref=ABC123`)
3. Quando un'azienda si registra tramite quel link, viene tracciata l'associazione
4. Il referrer guadagna una **commissione ricorrente mensile** (% o importo fisso) finche l'azienda rimane attiva
5. Il Super Admin puo visualizzare le statistiche e gestire i pagamenti

### Per il Super Admin
- Crea/gestisce i referrer con nome, email, e condizioni di commissione
- Vede dashboard con: link attivi, aziende portate, guadagni maturati, pagamenti effettuati
- Segna le commissioni come pagate mese per mese

---

## Struttura Database

### Nuova tabella: `referrers`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| name | text | Nome completo |
| email | text | Email referrer |
| phone | text | Telefono (opzionale) |
| referral_code | text | Codice univoco (es. ABC123) |
| commission_type | text | `percentage` o `fixed` |
| commission_value | numeric | Valore (es. 10 = 10% oppure 10 = 10 EUR) |
| is_active | boolean | Default true |
| notes | text | Note libere |
| total_earned | numeric | Cache totale maturato |
| total_paid | numeric | Cache totale pagato |
| created_at | timestamp | |

### Nuova tabella: `referral_companies`

Traccia quali aziende sono state portate da quale referrer.

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| referrer_id | uuid | FK -> referrers |
| company_id | uuid | FK -> companies |
| referred_at | timestamp | Data di registrazione |
| is_active | boolean | Se la commissione e ancora attiva |
| notes | text | |

### Nuova tabella: `referral_payouts`

Storico dei pagamenti effettuati ai referrer.

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| referrer_id | uuid | FK -> referrers |
| amount | numeric | Importo pagato |
| period_start | date | Inizio periodo (es. 2026-01-01) |
| period_end | date | Fine periodo (es. 2026-01-31) |
| paid_at | timestamp | Data pagamento |
| payment_method | text | `bank_transfer`, `paypal`, `other` |
| notes | text | |
| created_at | timestamp | |

### RLS Policies
- Solo `super_admin` puo gestire tutte e tre le tabelle (CRUD completo)
- Nessun altro ruolo ha accesso

### Colonna aggiuntiva in `companies`
- `referred_by` (uuid, nullable) -- riferimento al referrer che ha portato l'azienda

---

## Interfaccia Utente

### 1. Nuova voce nel menu Admin
- Icona: `Gift` (lucide)
- Label: "Referral"
- URL: `/admin/referral`
- Posizionata dopo "Piani" nella sidebar

### 2. Pagina `/admin/referral` -- Dashboard Referral

**Stat cards in alto (4 card):**
- Referrer attivi (conteggio)
- Aziende portate (conteggio totale)
- Commissioni maturate questo mese (EUR)
- Commissioni da pagare (maturato - pagato)

**Tabella referrer:**
| Referrer | Codice | Tipo Comm. | Aziende | Maturato | Pagato | Da pagare | Azioni |
|----------|--------|------------|---------|----------|--------|-----------|--------|

Azioni per riga:
- **Copia link** -- copia negli appunti il link referral
- **Dettaglio** -- apre dialog con lista aziende portate e storico pagamenti
- **Registra pagamento** -- dialog per segnare un pagamento
- **Modifica** -- dialog per modificare dati e commissione
- **Disattiva** -- toggle attivo/inattivo

### 3. Dialog "Nuovo Referrer"
Campi: Nome, Email, Telefono (opz.), Tipo commissione (Select: % o Fisso), Valore commissione, Note.
Il codice referral viene generato automaticamente (6 caratteri alfanumerici).

### 4. Dialog "Registra Pagamento"
Campi: Importo, Periodo (da/a), Metodo (Bonifico/PayPal/Altro), Note.

### 5. Dialog "Dettaglio Referrer"
Due sezioni:
- **Aziende portate**: tabella con nome azienda, data registrazione, stato, MRR
- **Storico pagamenti**: tabella con importo, periodo, metodo, data

---

## Tracciamento Link

Quando un'azienda viene creata dal Super Admin con il form "Nuova Azienda":
- Aggiungere un campo opzionale **"Referrer"** (Select con ricerca) nel form di creazione azienda
- Se selezionato, viene creato automaticamente il record in `referral_companies`

In futuro, se si implementa un signup self-service, il parametro `?ref=CODE` nella URL verra letto e salvato.

---

## Calcolo Commissioni

La commissione mensile per ogni referrer viene calcolata cosi:
- Per ogni azienda attiva portata dal referrer, si prende il MRR (prezzo mensile del piano)
- Se tipo = `percentage`: commissione = MRR * (commission_value / 100)
- Se tipo = `fixed`: commissione = commission_value (fisso per azienda attiva)
- Il totale maturato e la somma delle commissioni di tutte le aziende attive

Il calcolo avviene lato frontend nella pagina admin, nessuna edge function necessaria.

---

## File da Creare/Modificare

### Nuovi file:
- `src/pages/admin/ReferralDashboard.tsx` -- pagina principale referral
- `src/components/admin/referral/ReferralStatCards.tsx` -- stat cards
- `src/components/admin/referral/ReferralTable.tsx` -- tabella referrer
- `src/components/admin/referral/ReferrerDialog.tsx` -- dialog crea/modifica referrer
- `src/components/admin/referral/ReferrerDetailDialog.tsx` -- dettaglio con aziende e pagamenti
- `src/components/admin/referral/PayoutDialog.tsx` -- registra pagamento

### File modificati:
- `src/App.tsx` -- aggiungere route `/admin/referral`
- `src/components/layouts/AdminLayout.tsx` -- aggiungere voce "Referral" con icona Gift nel menu
- `src/pages/admin/CreateCompany.tsx` -- aggiungere campo opzionale "Referrer" nel form

### Migrazione database:
- Creazione tabelle `referrers`, `referral_companies`, `referral_payouts`
- Aggiunta colonna `referred_by` a `companies`
- RLS policies per super_admin
- Indice univoco su `referrers.referral_code`

---

## Ordine di Implementazione

1. Migrazione database (3 tabelle + colonna + RLS + indici)
2. Pagina `ReferralDashboard` con stat cards e tabella
3. Dialog creazione/modifica referrer
4. Dialog dettaglio referrer (aziende + pagamenti)
5. Dialog registra pagamento
6. Voce menu sidebar admin
7. Route in App.tsx
8. Campo "Referrer" nel form creazione azienda

