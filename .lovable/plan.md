

# Audit Stabilità: Timeline Unificata, A/B Testing Email, Import/Export CSV

Analisi approfondita delle tre funzionalità implementate. Per ciascuna: cosa funziona, cosa manca, cosa va corretto per arrivare al 100%.

---

## 1. Timeline Unificata Contatto

### Funziona
- Aggregazione da 6 sorgenti dati (activities, messages, email_logs, call_logs, appointments, notes)
- Filtro per categoria, raggruppamento per data, popover dettagli
- Normalizzazione eventi con icone e colori per tipo

### Problemi critici

**P0 — Nessun loading state visibile**
Il componente non mostra spinner durante il caricamento delle 6 query parallele. L'utente vede "Nessuna attività registrata" per un attimo prima che i dati arrivino.

**P0 — Nessun error handling**
Se una delle 6 query fallisce (es. `email_logs` ha RLS diversa), il componente non mostra errori. L'utente perde silenziosamente una categoria di eventi.

**P1 — Limite 1000 righe Supabase non gestito**
Le query hanno `limit(200)`, `limit(100)`, `limit(50)` — va bene per ora. Ma per contatti con storico lungo, non c'è paginazione/infinite scroll. L'utente non sa che ci sono eventi più vecchi.

**P1 — Nessun refresh automatico / realtime**
Se un collega aggiunge una nota o invia un messaggio mentre la pagina è aperta, l'utente non lo vede. Serve `refetchInterval` o invalidazione tramite evento.

**P2 — Performance: 6 query separate per ogni contatto**
Ogni apertura dettaglio contatto lancia 6 query. Per team con molti utenti che aprono contatti, può generare carico. Non urgente ma da monitorare.

**P2 — `(log as any).ab_variant` e `(msg as any).direction`**
Cast `as any` indica che i tipi non sono allineati. Se i campi non esistono nel tipo generato, la colonna potrebbe non essere letta correttamente.

---

## 2. A/B Testing Email

### Funziona
- UI completa: toggle, oggetto variante B, slider split, criterio vincitore, durata
- Salvataggio DB corretto (tutte le colonne A/B)
- Edge function: split casuale, invio con oggetto/contenuto diverso, log `ab_variant`

### Problemi critici

**P0 — Nessun meccanismo di determinazione del vincitore**
Il campo `ab_winner_criteria` e `ab_test_duration_hours` vengono salvati, ma **non esiste nessuna logica** che:
1. Dopo N ore, confronti open_rate o click_rate tra variante A e B
2. Scriva il vincitore in `ab_winner`
3. (Opzionale) Invii al resto dei destinatari solo con la variante vincente

Questo è il cuore dell'A/B testing e **non è implementato**. Serve una Edge Function schedulata o un cron job.

**P0 — Nessuna dashboard A/B per campagna**
Non esiste una pagina di dettaglio campagna che mostri:
- Open rate variante A vs B
- Click rate variante A vs B
- Vincitore dichiarato
- Distribuzione invii

L'utente può impostare un A/B test ma **non può vederne i risultati**.

**P1 — Validazione mancante: A/B senza oggetto B**
Se `abTestEnabled` è true ma `abSubjectB` è vuoto, il save non blocca. L'edge function invia variante B con lo stesso oggetto di A (fallback `campaign.subject`). Serve validazione client-side.

**P1 — `ab_html_content_b` non è editabile dall'UI**
Il campo esiste nel DB e l'edge function lo usa, ma non c'è modo di impostare un contenuto HTML diverso per la variante B. L'editor email non supporta due versioni. Attualmente l'A/B test funziona solo sull'oggetto.

**P2 — Shuffle non deterministico**
`Math.random() - 0.5` non è un shuffle uniforme (Fisher-Yates sarebbe corretto). Per campagne grandi potrebbe causare bias nella distribuzione.

---

## 3. Import/Export CSV Avanzato

### Funziona
- Export CSV e XLSX con dropdown formato
- Export filtrato per selezione (`selectedIds`)
- Inclusione campi custom nell'export
- Import wizard 4 step con auto-match colonne
- Supporto XLSX in import e export

### Problemi critici

**P0 — Import modalità "Aggiorna" non implementata**
Il wizard mostra 3 modalità (`create`, `update`, `create_and_update`) nel `StepUpload`, ma `handleImport` in `MarketingContacts.tsx` **ignora completamente `importMode`**. Usa sempre `supabase.insert()`. Non c'è logica di upsert per match su email/telefono.

Questo è un bug grave: l'utente seleziona "Aggiorna esistenti", clicca importa, e tutti i record vengono **creati come nuovi** generando duplicati.

**P0 — Export non applica i filtri attivi**
La funzione `doExport` carica TUTTI i contatti (`select("*")`) senza applicare i filtri di `ContactFiltersSheet` (tags, source, opportunity, campi custom). Se l'utente filtra per "tag = VIP" e clicca esporta, scarica **tutti** i contatti.

**P1 — Export > 1000 righe troncato**
Supabase ha un limite default di 1000 righe per query. Se l'azienda ha > 1000 contatti, l'export taglia silenziosamente i dati. Serve paginazione lato query o `limit(10000)`.

**P1 — Nessun report dettagliato post-import**
Il risultato mostra solo `success` e `errors[]` generici. Non distingue tra righe create, aggiornate, saltate. Non indica quale riga ha causato l'errore (numero riga + motivo).

**P1 — Nessuna validazione email pre-import**
Le email inserite non vengono validate (formato, duplicati interni al file). Un CSV con email malformate crea contatti con email invalide nel DB.

**P2 — Import custom fields in batch senza transazione**
L'insert dei contatti e l'insert dei `marketing_contact_field_values` sono due operazioni separate. Se la seconda fallisce, i contatti esistono senza i campi custom. Non critico ma genera dati incompleti.

**P2 — Export campi custom: query senza limite**
La query `marketing_contact_field_values` con `.in("contact_id", ids)` potrebbe superare i limiti Supabase se ci sono molti contatti × molti campi.

---

## Riepilogo interventi necessari

### Priorità 0 (Bloccanti — il feature è rotto senza)
1. **A/B Winner Logic**: Creare Edge Function `determine-ab-winner` schedulata via cron che dopo `ab_test_duration_hours` calcola open/click rate per variante e scrive `ab_winner`
2. **A/B Results Dashboard**: Pagina/sezione nel dettaglio campagna con confronto metriche A vs B
3. **Import Update/Upsert**: Implementare logica di match per email/phone e upsert quando `importMode` è `update` o `create_and_update`
4. **Export con filtri attivi**: Applicare le stesse filter rules della vista corrente alla query di export
5. **Timeline loading + error states**: Mostrare skeleton/spinner durante caricamento e toast/badge su errore

### Priorità 1 (Importanti — degradano l'esperienza)
6. **Validazione A/B**: Bloccare invio se A/B attivo senza oggetto B
7. **Export paginato**: Gestire > 1000 righe
8. **Import validation**: Controllo formato email, duplicati interni
9. **Import report dettagliato**: Righe create/aggiornate/saltate/errore con numero riga
10. **Timeline refetch**: `refetchInterval: 30000` o invalidazione post-azione

### Priorità 2 (Miglioramenti)
11. **Editor HTML variante B** per A/B content test
12. **Fisher-Yates shuffle** per split uniforme
13. **Timeline performance**: Combinare query o virtualizzare lista

