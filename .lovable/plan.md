

## Analisi Bug e Criticità: Sistema Fatturazione Nativa

---

### 1. SICUREZZA

🔴 **CRITICO — generate-native-pdf: Nessun controllo company_id sull'utente**
- File: `supabase/functions/generate-native-pdf/index.ts` (riga ~250)
- Problema: L'endpoint verifica il JWT ma **non controlla che l'utente appartenga alla company** del documento. Qualsiasi utente autenticato può generare il PDF di qualsiasi documento passando un `documento_id` arbitrario (usa service role key).
- Impatto: Leak di dati fiscali tra tenant.
- Fix: Dopo aver caricato il documento, verificare che `doc.company_id` corrisponda alla company dell'utente (tramite query su `company_members` o `profiles`).

🔴 **CRITICO — invia-sdi: Nessun controllo company_id sull'utente**
- File: `supabase/functions/invia-sdi/index.ts` (riga ~154)
- Problema: Stesso pattern di sopra. Un utente autenticato può inviare al SDI un documento di un'altra azienda.
- Impatto: Invio non autorizzato di documenti fiscali, implicazioni legali gravissime.
- Fix: Verificare `doc.company_id` contro la company dell'utente autenticato.

🔴 **CRITICO — sdi_api_key in chiaro nel database**
- File: `supabase/migrations/...` (riga ~57, colonna `sdi_api_key`)
- Problema: La chiave API del provider SDI (Aruba) è salvata in chiaro in `anagrafica_azienda.sdi_api_key`. È leggibile da chiunque nella stessa company via RLS.
- Impatto: Qualsiasi utente company_staff può estrarre la chiave API SDI.
- Fix: Spostare in Vault o in una tabella con policy restrittiva solo admin.

🟠 **ALTO — send-invoice-email: Auth via getUser invece di getClaims**
- File: `supabase/functions/send-invoice-email/index.ts` (riga ~125)
- Problema: Usa `supabase.auth.getUser()` con il service role client, che bypassa la validazione JWT (accetta qualsiasi token). Dovrebbe usare `getClaims()`.
- Impatto: Token invalidi o scaduti potrebbero essere accettati.
- Fix: Usare `getClaims(token)` come nelle altre edge functions.

🟠 **ALTO — send-invoice-email: Nessun controllo company su invoice**
- File: `supabase/functions/send-invoice-email/index.ts` (riga ~132)
- Problema: Carica la fattura dalla tabella `invoices` (modulo esterno!) non da `documenti_fiscali`. Inoltre non verifica che l'utente appartenga alla company della fattura.
- Impatto: Invio email con dati fiscali di altre aziende.
- Fix: Verificare l'appartenenza dell'utente alla company.

🟠 **ALTO — RLS policies non distinguono ruoli**
- File: `supabase/migrations/...` (righe 325-341)
- Problema: Le policy RLS usano solo `company_id = get_my_company_id()`. Non c'è distinzione tra `company_admin`, `company_staff`, `employee`. Un dipendente con accesso alla piattaforma può leggere e **modificare** tutti i documenti fiscali.
- Impatto: Accesso non autorizzato a dati finanziari sensibili per ruoli non autorizzati.
- Fix: Aggiungere policy separate per SELECT/INSERT/UPDATE/DELETE con controllo ruolo.

---

### 2. CORRETTEZZA FISCALE

🔴 **CRITICO — Numerazione progressiva: nessun reset annuale automatico**
- File: `supabase/migrations/...` funzione `genera_numero_documento_native` (riga ~380)
- Problema: La colonna `anno_corrente` e il flag `reset_numeratore_annuale` esistono nel DB ma **non sono usati** nella funzione. Il contatore `ultimo_numero_fattura` incrementa senza mai resettarsi a 0 al cambio anno. Al 1° gennaio 2027, la prima fattura sarà FT-2027-**0124** anziché FT-2027-**0001**.
- Impatto: Violazione della normativa fiscale italiana (numerazione non progressiva per anno). Sanzioni fino a €2.000 per fattura.
- Fix: Nella funzione `genera_numero_documento_native`, confrontare `p_anno` con `v_ana.anno_corrente`. Se diversi, resettare i contatori e aggiornare `anno_corrente`.

🟠 **ALTO — Tipo "proforma" non ha contatore dedicato**
- File: `genera_numero_documento_native` (riga ~424, ramo ELSE)
- Problema: Il tipo `proforma` finisce nel ramo `ELSE` → riceve sempre numero `DOC-ANNO-0001` (contatore = 1, hardcoded). Tutti i proforma avranno lo stesso numero, violando il UNIQUE constraint.
- Impatto: Errore DB alla creazione del secondo proforma.
- Fix: Aggiungere un contatore `ultimo_numero_proforma` oppure riusare quello di preventivo, e un case specifico per "proforma".

🟡 **MEDIO — UNIQUE constraint troppo rigido**
- File: `supabase/migrations/...` (riga ~262)
- Problema: `UNIQUE (company_id, tipo, numero, anno)` — il tipo `fattura_pa` ha contatore condiviso con `fattura` nella funzione, ma tipi diversi nel constraint. Se `fattura` e `fattura_pa` generano lo stesso numero (FT-2026-0001), non c'è conflitto perché il tipo è diverso, ma **la numerazione SDI deve essere unica per tutti i tipi fattura**.
- Impatto: L'Agenzia delle Entrate potrebbe rigettare due documenti con lo stesso numero progressivo ma tipo diverso.
- Fix: Unificare il constraint per fattura e fattura_pa, oppure usare prefissi distinti.

🟡 **MEDIO — XML FatturaPA: PA senza codice IPA genera XML invalido**
- File: `supabase/functions/invia-sdi/index.ts` (riga ~26)
- Problema: `codDest = snap.codice_sdi || (isPa ? "" : "0000000")` — per clienti PA senza `codice_sdi`, il `CodiceDestinatario` è stringa vuota. Lo schema XSD richiede esattamente 6 o 7 caratteri.
- Impatto: Scarto SDI immediato per fatture PA.
- Fix: Per PA, il codice è **obbligatorio** e deve essere 6 caratteri. Validare prima dell'invio.

---

### 3. AFFIDABILITÀ

🟠 **ALTO — useDocumentCounts: query unbounded (C-5)**
- File: `src/hooks/billing/useDocumentCounts.ts` (riga ~21)
- Problema: `select("tipo, stato").eq("company_id", companyId!)` senza `.limit()`. Se un'azienda ha >1000 documenti, Supabase restituisce solo i primi 1000 (default limit). I conteggi saranno sbagliati.
- Impatto: Tab con conteggio errato, utente non trova documenti.
- Fix: Usare una RPC con `COUNT(*)` e `GROUP BY tipo, stato`, oppure aggiungere `.limit(10000)` con consapevolezza.

🟠 **ALTO — useMonthlyTimeline: stessa query unbounded (C-5)**
- File: `src/hooks/billing/useMonthlyTimeline.ts` (riga ~28)
- Problema: Carica TUTTI i documenti (`data_emissione, totale_documento`) senza limit. Con migliaia di documenti, la query è lenta e troncata a 1000.
- Impatto: Timeline con importi errati; performance degradata.
- Fix: Creare una RPC con aggregazione server-side: `SELECT date_trunc('month', data_emissione), count(*), sum(totale_documento) GROUP BY 1`.

🟡 **MEDIO — Nessun retry per invio SDI Aruba**
- File: `supabase/functions/invia-sdi/index.ts` (riga ~196)
- Problema: Se la chiamata Aruba fallisce (timeout, 5xx), l'errore viene loggato ma non c'è retry automatico. Il documento resta in stato `emessa` e l'utente deve ritentare manualmente.
- Impatto: Fatture non inviate senza notifica proattiva.
- Fix: Implementare un job di retry (cron edge function) oppure una coda di invio.

🟡 **MEDIO — sdi_log e billing_sync_log senza retention policy**
- File: tabelle `sdi_log`, `billing_sync_log`
- Problema: Le tabelle crescono indefinitamente. Nessun indice su `created_at` per il pruning.
- Impatto: Degradazione performance nel tempo.
- Fix: Aggiungere un job periodico di cleanup (es. DELETE WHERE created_at < now() - interval '6 months').

---

### 4. DATABASE

🟡 **MEDIO — Indice composto mancante**
- File: `supabase/migrations/...` (righe 304-313)
- Problema: Esistono indici singoli su `company_id`, `tipo`, `stato`, `data_emissione`, ma **non un indice composto** `(company_id, tipo, stato, data_emissione DESC)`. Ogni query della lista documenti filtra per tutti e 4 i campi.
- Impatto: Full index scan lento con crescita dati.
- Fix: `CREATE INDEX idx_documenti_compound ON documenti_fiscali(company_id, tipo, stato, data_emissione DESC)`.

🟡 **MEDIO — sdi_log manca indice su sdi_id**
- File: tabella `sdi_log`
- Problema: Il webhook `sdi-webhook` cerca documenti per `sdi_id_trasmissione` su `documenti_fiscali` (ha indice), ma il log stesso non ha indice su `sdi_id`. Il lookup nel log per debugging è lento.
- Fix: `CREATE INDEX idx_sdi_log_sdi_id ON sdi_log(sdi_id)`.

🟢 **BASSO — Nessun trigger updated_at su documenti_fiscali**
- File: tabella `documenti_fiscali`
- Problema: `updated_at` viene aggiornato manualmente nel codice (`updated_at: new Date().toISOString()`). Se qualsiasi altra operazione (trigger, RPC) modifica la riga, `updated_at` resta stale.
- Fix: Aggiungere un trigger `BEFORE UPDATE SET updated_at = NOW()`.

🟢 **BASSO — Totali non verificati a livello DB**
- Problema: Non esiste `CHECK (imponibile_totale + iva_totale = totale_documento)`. La coerenza dei totali dipende interamente dal frontend.
- Impatto: Possibili discrepanze contabili se il calcolo client-side ha bug.
- Fix: Trigger di validazione `BEFORE INSERT OR UPDATE`.

---

### 5. UX

🟡 **MEDIO — Elimina senza conferma AlertDialog**
- File: `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` (riga ~196)
- Problema: `deleteMutation.mutate(doc.id)` viene chiamato direttamente dal menu, senza alcun dialog di conferma. Il `confirm()` nativo è solo nell'editor, non nella lista.
- Impatto: Eliminazione accidentale di documenti.
- Fix: Wrappare in `AlertDialog` con conferma esplicita.

🟡 **MEDIO — "Segna pagata" senza conferma e senza importo parziale**
- File: `DocumentiFiscaliList.tsx` (riga ~188)
- Problema: L'azione "Segna pagata" marca immediatamente il documento come pagato al 100% senza chiedere l'importo effettivo incassato o la data.
- Impatto: Dati contabili imprecisi; impossibile registrare pagamenti parziali dalla lista.
- Fix: Aprire un dialog con importo e data, con default al totale.

🟡 **MEDIO — Doppio click su "Emetti" non protetto**
- File: `EditorDocumento.tsx` (riga ~78)
- Problema: `onEmetti` non disabilita il pulsante durante la mutation. Se l'utente clicca due volte rapidamente, potrebbe tentare di emettere due volte (anche se la seconda fallirà per stato != bozza).
- Impatto: Toast di errore confuso.
- Fix: Passare `emittiMutation.isPending` per disabilitare il bottone.

---

### 6. PATTERN NOTI VERIFICATI

| ID | Pattern | Presente nel modulo nativo? |
|----|---------|----------------------------|
| C-1 | Race condition token refresh | ❌ Non applicabile (il modulo nativo non usa token refresh) |
| C-2 | Webhook bypass senza secret | ✅ **Corretto** — `sdi-webhook` e `billing-webhook` rifiutano se secret mancante |
| C-3 | Data loss su rollback righe | ❌ Non applicabile (le righe sono in JSONB, non tabella separata) |
| C-4 | Null dereference | ✅ Presente in `DocumentiFiscaliList.tsx` riga ~166: `azienda as AnagraficaAzienda` senza null check. Se l'anagrafica non è configurata, il download XML crasha silenziosamente |
| C-5 | Unbounded query | ✅ **Presente** in `useDocumentCounts` e `useMonthlyTimeline` (vedi sopra) |

---

### Riepilogo per Priorità

| Gravità | Count | Azioni immediate |
|---------|-------|-----------------|
| 🔴 Critico | 3 | Auth check company_id nelle edge functions; reset numerazione annuale |
| 🟠 Alto | 5 | Fix auth send-email; RLS per ruolo; unbounded queries; proforma counter |
| 🟡 Medio | 8 | Indici composti; conferme UX; PA codice IPA; retention logs |
| 🟢 Basso | 2 | Trigger updated_at; CHECK totali |

