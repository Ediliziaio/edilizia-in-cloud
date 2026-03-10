

## Piano: Medio Termine — 4 Moduli (HR, Paginazione, Cmd+K, Firma Digitale)

Questo è un piano ampio con 11 prompt sequenziali. Lo suddivido in blocchi implementativi.

---

### Blocco 1: [HR1] Database — leave_requests + leave_balances + funzioni

**Migrazione SQL unica** con:
- Tabella `leave_requests` (tipo, date, giorni/ore, status pending/approved/rejected/cancelled, approvatore)
- Tabella `leave_balances` (saldi annuali per dipendente: ferie gg, permessi ore, ROL ore)
- RLS: dipendente vede/inserisce/aggiorna le proprie; admin/staff vedono tutte della company; admin scrive balances
- Funzione `approve_leave_request(p_request_id, p_approved, p_rejection_note)` — SECURITY DEFINER, aggiorna status + saldo + invia notifica via `create_notification()`
- Funzione `get_leave_summary(p_company_id, p_year)` — ritorna riepilogo per dipendente con saldi e count pending
- Indici su company_id, employee_id, status, date range

**Nota**: La funzione `get_leave_summary` filtra `profiles.role_type IN ('operaio', 'staff_interno')` come da spec. La `approve_leave_request` usa la action_url `/dipendente/ferie`.

---

### Blocco 2: [HR2] Vista dipendente — LeaveRequests.tsx

- **Nuovo file**: `src/pages/dipendente/LeaveRequests.tsx`
  - Card saldi (ferie gg, permessi ore, ROL ore) con barre progresso
  - Storico richieste con badge status (pending giallo, approved verde, rejected rosso, cancelled grigio)
  - Pulsante "Annulla" su richieste pending
  - Dialog "Nuova richiesta": tipo, date, ore (per permesso), note, calcolo automatico giorni lavorativi (esclusi sabato/domenica)
- **Modifica** `src/App.tsx`: aggiunta route `/dipendente/ferie` con lazy import
- **Modifica** `src/components/layouts/EmployeeLayout.tsx`: aggiunta voce menu "Ferie & Permessi" con icona `Palmtree`

---

### Blocco 3: [HR3] Vista admin — LeaveAdminTab.tsx

- **Nuovo file**: `src/components/employees/LeaveAdminTab.tsx`
  - Sezione "Richieste in attesa" con pulsanti Approva/Rifiuta
  - Dialog rifiuto con nota obbligatoria
  - Sezione "Saldi dipendenti" con selettore anno, tabella riepilogativa da RPC `get_leave_summary`
  - Edit saldi inline (popover con campi numerici, upsert su `leave_balances`)
- **Modifica** `src/pages/azienda/Employees.tsx`: aggiunta quinto tab "Ferie & Permessi" con badge count pending

---

### Blocco 4: [HR4] Layer ferie nel calendario

- **Modifica** `src/pages/azienda/Calendar.tsx`: query ferie approvate nell'anno corrente, stato `showLeaves`
- **Modifica** `src/components/calendar/CalendarLayerPanel.tsx`: aggiunta toggle "Ferie" con icona `Palmtree`, nuova prop `showLeaves` + `onToggleLeaves`
- **Modifica** `src/components/calendar/CalendarGanttView.tsx`: nuova prop `leaveRequests`, rendering barre amber/orange per ferie nelle righe dipendente (distinzione visiva dagli ordini)

---

### Blocco 5: [PAG1] Paginazione server-side campaigns + templates

- **Nuovo file**: `src/hooks/useEmailCampaignsPaginated.ts` — hook con `select(..., { count: "exact" })`, `.range()`, `.ilike()` per search server-side, `placeholderData` per transizioni fluide
- **Modifica** `src/components/email-marketing/EmailCampaignsTab.tsx`: sostituire query client-side + slice con hook paginato (nota: la tabella `email_campaigns` non ha colonna `is_template` — l'hook filtrerà per la tabella corretta, campaigns vs templates separatamente)
- **Modifica** `src/components/email-marketing/EmailTemplatesTab.tsx`: stessa sostituzione, query diretta su `email_templates` con `.range()` e count

**Nota tecnica**: Le campaigns e i templates sono in tabelle separate (`email_campaigns` e `email_templates`), non in una sola con `is_template`. Creerò due hook distinti oppure un hook parametrizzato per tabella.

---

### Blocco 6: [CMD1] Hook useGlobalSearch

- **Nuovo file**: `src/hooks/useGlobalSearch.ts`
  - Ricerca parallela su 4 tabelle: orders (codice/descrizione), profiles/customers (nome/email), contacts (nome/email), tickets (subject)
  - Debounce 250ms via `useDebounce`
  - Limite 5 risultati per tipo
  - Risultati tipizzati con `SearchResult { id, type, title, subtitle, url, icon }`

---

### Blocco 7: [CMD2] CommandPalette Cmd+K

- **Nuovo file**: `src/components/CommandPalette.tsx`
  - Usa `CommandDialog` esistente da cmdk
  - Navigazione rapida (Dashboard, Ordini, Clienti, ecc.)
  - Risultati ricerca raggruppati per tipo con icone
  - Footer con hint shortcut
- **Modifica** `src/components/layouts/CompanyLayout.tsx`:
  - Stato `commandOpen` + listener `Cmd+K`/`Ctrl+K`
  - Pulsante "Cerca..." nella sidebar con badge `⌘K`
  - Render `<CommandPalette>`

---

### Blocco 8: [FD1–FD4] Firma Digitale (DB + Edge Function + UI)

Questo blocco richiede analisi più approfondita della struttura OrderDetail e verrà dettagliato durante l'implementazione. In sintesi:
- **Migrazione**: tabella `signature_requests` (order_id, token, status, signer_email, signed_at, signature_data, ip_address)
- **Edge Function**: `generate-signature-token` per creare il token e inviare email
- **Pagina pubblica**: `/firma/:token` con canvas firma, validazione token, salvataggio
- **UI in OrderDetail**: sezione firma con stato, pulsante "Richiedi firma", anteprima firma completata

---

### Ordine di implementazione

1. HR1 (migrazione DB)
2. HR2 (vista dipendente)
3. HR3 (vista admin)
4. HR4 (layer calendario)
5. PAG1 (paginazione server-side)
6. CMD1 + CMD2 (ricerca globale)
7. FD1–FD4 (firma digitale)

