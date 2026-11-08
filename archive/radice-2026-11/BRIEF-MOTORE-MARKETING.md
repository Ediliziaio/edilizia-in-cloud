# BRIEF DI IMPLEMENTAZIONE — Motore marketing EdiliziaInCloud
### Documento per Claude Code · repository `Ediliziaio/edilizia-in-cloud`

> Questo file contiene tutto il necessario per implementare. È stato scritto **leggendo il repository reale**, non a tavolino: ogni affermazione tecnica qui dentro è verificata nel codice, e dove serve trovi il percorso del file.
> Se una cosa qui contraddice quello che vedi nel codice, **vince il codice** — ma segnalalo, perché vuol dire che qualcosa è cambiato dopo il 1 agosto 2026.

---

# PARTE 1 — COSA STIAMO COSTRUENDO

## 1.1 Il progetto in una pagina

EdiliziaInCloud è un gestionale cloud per imprese edili italiane. Ad agosto 2026 stiamo costruendo il **motore di marketing automation** che nutre e converte i lead in ingresso, e lo stiamo costruendo **dentro il prodotto** (Supabase + il flow builder già esistente), non su un tool esterno.

Il piano copre 20 flussi, 348 messaggi, 12 mestieri × 10 dolori di segmentazione. **Sei flussi sono già stati costruiti come dati** (272 nodi) e sono pronti da caricare. Quello che manca è **codice**: tre interventi sul motore senza i quali quei flussi non possono girare correttamente.

## 1.2 Il modello di segmentazione (serve per capire il resto)

Ogni contatto porta dei **tag con prefisso**, e i tag sono l'unica cosa che fa cambiare strada a un contatto:

| Prefisso | Cosa dice | Esempi |
|---|---|---|
| `mest:` | il mestiere | `mest:M03-serramenti`, `mest:M01-edile-generale` |
| `dol:` | il dolore primario | `dol:P1-preventivi`, `dol:P2-margini` |
| `taglia:` | quante persone | `taglia:T1` … `taglia:T4` |
| `esito:` | com'è finita la call | `esito:si`, `esito:no`, `esito:sospeso` |
| `obie:` | quale obiezione | `obie:prezzo`, `obie:competitor`, `obie:adozione` |
| `ostacolo:` | cosa blocca l'attivazione | `ostacolo:tempo`, `ostacolo:dati` |
| `trial:` | stato del trial | `trial:attivo` |
| `lista:` | liste editoriali | `lista:biblioteca`, `lista:disiscritto` |

**Regola invariante: un contatto ha un solo tag per prefisso.** Due `dol:` addosso allo stesso contatto significa due sequenze in parallelo. C'è un trigger PostgreSQL che lo garantisce (§3.2).

## 1.3 I sei flussi già costruiti

| Flusso | Cosa fa | Nodi |
|---|---|---|
| **F2B** | Finestra 7 giorni per attivare il trial dopo che il contratto è stato accettato. **Il più importante.** | 68 |
| **F3** | Nurturing post-call, sei obiezioni in un flusso solo con cascata di condizioni | 102 |
| **F11** | "La Biblioteca del Cantiere", newsletter del martedì, primi 12 numeri | 55 |
| **F1** | Pre-call warm-up, dalla prenotazione alla videocall | 22 |
| **F1B** | Recupero no-show | 16 |
| **F3D-coda** | Ri-aggancio 60 giorni prima del rinnovo licenza del concorrente | 9 |

Totale **272 nodi, 285 connessioni, 67 email e 18 WhatsApp** con il testo integrale già dentro.

---

# PARTE 2 — COME FUNZIONA IL MOTORE OGGI

Tutto in questa parte è **verificato nel codice**. Non riscoprirlo: costa mezza giornata.

## 2.1 Le tabelle

```
automation_flows        id, company_id, name, description,
                        status ('draft'|'published'|'archived'), version,
                        created_by NOT NULL, updated_by
automation_nodes        id, flow_id, company_id,
                        node_type ('trigger'|'action'|'condition'|'delay'|'goal'),
                        position_x, position_y, config_json jsonb, label
automation_connections  id, flow_id, company_id, from_node_id, to_node_id, label
automation_enrollments  company_id, flow_id, flow_version,
                        entity_type ('contact'|'opportunity'|'appointment'), entity_id,
                        status ('active'|'paused'|'completed'|'canceled')
automation_queue        enrollment_id, flow_id, company_id, current_node_id,
                        entity_id text, entity_type, status, execute_at,
                        attempts, max_attempts, last_error, context_json
automation_trigger_events  company_id, trigger_event, entity_id, entity_type,
                           payload jsonb, processed boolean
automation_dead_letter, automation_execution_log, flow_execution_runs
```

**`node_type` ammette solo cinque valori.** `split` e `note` **non** sono valori validi del CHECK, anche se compaiono nel catalogo dell'interfaccia. Lo split si crea come `condition`.

## 2.2 L'esecutore

`supabase/functions/process-automation/index.ts` — è il cuore. Un cron lo chiama **ogni minuto** con `action=process_queue` (migration `20270627000000_automation_queue_cron.sql`).

### Come sceglie l'arco successivo

Righe ~2425-2460 di `process-automation/index.ts`:

- **condition** → produce `yes`/`no`. Gli archi vanno etichettati **`Sì`** e **`No`**. C'è una `normBranch` che normalizza anche `si`/`yes`/`vero`/`falso`.
  **⚠️ Se gli archi hanno label ma il ramo prodotto non ha uscite, il flusso TERMINA lì in silenzio.** Il vecchio fallback "segui tutte le connessioni" è stato tolto apposta (c'è il commento nel codice). Quindi **ogni condizione deve avere entrambi i rami disegnati**.
- **split** → produce `a`/`b`, match sulla prima lettera del label.
- **wait_for_event** → arco etichettato `event`; se non c'è nessun arco etichettato, prende quelli senza label (che diventano il ramo timeout).
- **action / delay / trigger** → segue tutte le connessioni in uscita.

### Come risolve i campi nelle condizioni

Funzione `executeCondition`, righe ~755-845. `config_json` è:

```json
{
  "item_id": "condition_multi",
  "operatore_logico": "AND",
  "condizioni": [
    { "campo": "contatto.tags", "operatore": "contiene", "valore": "dol:P2-margini" }
  ]
}
```

Risoluzione del prefisso:

| Prefisso | Cosa carica |
|---|---|
| `contatto.` | la riga di `marketing_contacts` con `select("*")`, poi legge `rec[campo]` |
| `opportunita.` | **l'opportunità più recente del contatto** (`order by updated_at desc limit 1`) |
| `appuntamento.` | **l'appuntamento più recente del contatto** |
| `ordine.` / `ticket.` | il record se l'entità del flusso è quella |
| nessun prefisso | si assume `contatto` |

**Conseguenza n.1 — `contatto.tags` FUNZIONA.** È una colonna `text[]`; il motore la converte con `String(actual)` e l'operatore `contiene` fa match su sottostringa. Su questo si regge tutta la segmentazione.

**Conseguenza n.2 — i campi personalizzati NON funzionano nelle condizioni.** Stanno in `marketing_contact_field_values`, che `executeCondition` non carica. Servono **solo per il testo** delle email (li legge `VariablePicker.tsx` / `EmailBodyEditor.tsx`).

Operatori: `uguale`, `diverso`, `contiene`, `non_contiene`, `inizia_con`, `vuoto`, `non_vuoto`, `maggiore`, `minore`, `maggiore_uguale`, `minore_uguale`.

**Il valore è un letterale statico.** L'esecutore non valuta espressioni, non conosce `now()`, non interpreta offset relativi. È il motivo del blocco B (§4.2).

## 2.3 Il catalogo dei nodi

`src/lib/flow-node-catalog.ts` (2.138 righe) — `TRIGGER_CATALOG`, `ACTION_CATALOG`, `CONDITION_CATALOG`.

### Trigger usati dai nostri flussi

| `item_id` | Note |
|---|---|
| `tag_aggiunto` | scatta su **qualsiasi** tag aggiunto → si filtra subito dopo con una condizione |
| `appuntamento_creato` | ha `tipo_filtro`: sopralluogo / video_call / telefonata / in_sede |
| `appuntamento_no_show` | **non ha `tipo_filtro`** — scatta anche sui sopralluoghi |
| `appuntamento_imminente` | ha `ore_prima` — utile per il task B3 |
| `manuale` | da usare per i test |

**⚠️ `opportunita_stage_cambiato` non serve a noi**: il suo `stage_a` è un `select` con sette valori cablati (`nuovo_lead, contattato, appuntamento, offerta_inviata, negoziazione, vinto, perso`) e **non vede le 16 fasi custom della pipeline**. Per questo tutti i flussi entrano da `tag_aggiunto`.

### Azioni usate

| `item_id` | Campi |
|---|---|
| `invia_email` | `destinatario`*, `oggetto`*, `corpo`*, `cc`, `template` |
| `invia_whatsapp` | `numero`*, `messaggio`* |
| `invia_sms` | `numero`*, `testo`* |
| `aggiungi_tag` / `rimuovi_tag` | `contact_id`*, `tags`* (**array JSON**, non stringa) |
| `crea_task` | `titolo`*, `priorita`*, `descrizione`, `assegnato_a`, `scadenza_giorni` |
| `sposta_opportunita` | `pipeline_id`*, `stage_id`*, `opportunita_id` |
| `aggiorna_campo` | `tabella`*, `entity_id`*, `campo`*, `valore`* |
| `notifica_interna` | `tipo`*, `messaggio`*, `destinatari_utenti`, `destinatari_extra`, `oggetto` |
| `attendi` | `giorni`, `ore`, `minuti` — **tutti relativi a adesso** |
| `wait_for_event` | `await_event`*, `timeout_days` |
| `end_automation` | — |

Eventi di `wait_for_event`: `email_opened`, `email_clicked`, `whatsapp_message_received`, `appointment_booked`, `quote_accepted`, `payment_received`, `opportunity_won`, `form_submitted`, `contact_updated`, `tag_added`.
**Non esiste `email_replied`.** È il motivo del blocco C (§4.3).

## 2.4 L'interfaccia

| Rotta | Cosa |
|---|---|
| `/admin/marketing/automazioni` | lista flussi (super admin) — `AdminMarketingAutomations` |
| `/admin/marketing/automazioni/:id` | flow builder visuale |
| `/azienda/automazioni` | stessa cosa lato azienda — `AutomazioniUnified` |

Il pannello condizioni dell'interfaccia (`src/components/flow-builder/config-panels/ConditionConfigPanel.tsx`) ha **undici campi cablati a mano** e non include né i tag né i campi personalizzati:

```
contatto.first_name · contatto.last_name · contatto.email · contatto.phone
contatto.city · contatto.source · opportunita.value · opportunita.stage_id
appuntamento.status · ordine.total_amount · ticket.priority
```

**L'esecutore però accetta qualsiasi stringa in `campo`** (§2.2). Quindi le condizioni sui tag funzionano se create via SQL, ma **non si possono creare né modificare dall'interfaccia**. Questo è il task **D** (§4.4), opzionale ma consigliato.

---

# PARTE 3 — COSA È GIÀ PRONTO

Sei file SQL, in `09-AREA-TEST/` della cartella di progetto. **Girano già**: sono stati eseguiti su PostgreSQL 16 con lo schema ricostruito, sono idempotenti, e passano i controlli strutturali. Non vanno riscritti.

## 3.1 Ordine di esecuzione

```bash
CO=<uuid azienda test>
CB=<uuid super admin>

for f in 01-SETUP-AREA-TEST.sql 10-FLOW-F2B.sql 11-FLOW-F1.sql \
         12-FLOW-F1B.sql 13-FLOW-F3.sql 14-FLOW-F11.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
       -v company_id=$CO -v created_by=$CB \
       -v user_commerciale=$CB -v user_florin=$CB -f "$f"
done

psql "$DATABASE_URL" -v company_id=$CO -f 20-COLLAUDO.sql
```

I parametri vanno **senza apici**. Il setup stampa `57 | 16 | 8 | 39 | 3` alla fine.

## 3.2 Cosa crea `01-SETUP-AREA-TEST.sql`

- **57 tag** con i prefissi di §1.2
- **1 pipeline con 16 fasi** (una per ogni motivo di uscita, perché le automazioni sanno scattare per singola fase)
- **8 motivi di perdita** in `opportunity_loss_reasons`
- **39 campi personalizzati** (solo per il testo)
- **il trigger `mkt_tag_unico_per_prefisso()`** su `marketing_contacts` che garantisce un tag per prefisso
- **3 contatti finti** su dominio `.invalid`, così nessun invio può uscire per sbaglio

## 3.3 Cosa fa `20-COLLAUDO.sql`

Sei controlli, da rilanciare dopo ogni modifica:

1. inventario dei flussi con conteggio nodi/archi/email/whatsapp
2. integrità: condizioni con entrambi i rami, tag array, email con corpo, nessun flusso pubblicato
3. **le 27 email con segnaposto `[[...]]` ancora aperti** — quelle non si pubblicano
4. tag usati nelle condizioni ma non esistenti
5. campi personalizzati usati nei testi ma non creati
6. i tre contatti finti e in quale flusso finiscono

---

# PARTE 4 — COSA VA IMPLEMENTATO

Quattro task. **A, B e C bloccano la pubblicazione. D è consigliato.**

---

## 4.A — Il tag `trial:attivo` scritto dal prodotto

### Perché

F2B ha **dodici controlli** lungo la sequenza che chiedono *"ha già attivato?"*, implementati come `contatto.tags contiene "trial:attivo"`. Nessuno scrive quel tag oggi. Quindi la risposta è sempre no, e **i messaggi partono anche a chi ha già attivato** — compreso `EM-F2B-08` del giorno dopo la scadenza, che dice "la finestra è chiusa".

Senza questo task **F2B non si pubblica**.

### Passo 0 — decidere qual è l'evento di attivazione

Da verificare nel codice, non da assumere. I candidati:

- `company_subscriptions` — ha `status text NOT NULL DEFAULT 'trialing'` e `current_period_start/end`. La riga viene creata quando?
- `companies` — non ha colonne trial
- `company_lifecycle` — c'è, va guardata
- ci sono 9 occorrenze di `trial_ends_at` nelle migration: capire su quale tabella

Guarda anche `src/pages/admin/CreateCompany.tsx` e `src/pages/admin/CompanyDetail.tsx`, che sono i punti dove un super admin crea/attiva un'azienda.

**Il criterio giusto**: "attivato" vuol dire *l'utente può entrare e usare il gestionale*, non *è diventato pagante*. Sono due momenti diversi.

### Implementazione

Una migration nuova, `supabase/migrations/2028MMDDHHMMSS_trial_attivo_tag.sql`:

```sql
CREATE OR REPLACE FUNCTION public.mkt_tag_trial_attivo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email text;
BEGIN
  -- solo alla transizione verso attivo, non a ogni update
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN (<gli stati che contano — deciderli al passo 0>) THEN
    RETURN NEW;
  END IF;

  SELECT c.email INTO v_email FROM public.companies c WHERE c.id = NEW.company_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  UPDATE public.marketing_contacts
     SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(tags || ARRAY['trial:attivo']) t),
         updated_at = now()
   WHERE lower(email) = lower(v_email);

  RETURN NEW;
END $$;
```

Poi il trigger `AFTER INSERT OR UPDATE OF status ON public.company_subscriptions`.

### Attenzione

- Il tag va messo **su tutti i contatti con quella email in qualunque company**, oppure solo su quella giusta? Il motore marketing di EdiliziaInCloud gira sull'azienda "casa madre", quindi il contatto sta lì, non nella company del cliente. **Decidere e scriverlo nel commento della migration.**
- Il trigger `mkt_tag_unico_per_prefisso` scatta `BEFORE UPDATE OF tags`: il prefisso `trial:` è già nella sua lista, quindi non serve toccarlo.
- L'`UPDATE` su `marketing_contacts` fa scattare l'evento `tag_aggiunto`? **Verificalo**: se sì, va controllato che non inneschi flussi indesiderati. Se no, va aggiunto l'insert in `automation_trigger_events`.

### Fatto quando

- [ ] Un test in `src/test/logic/` (o un test SQL) che: crea contatto senza tag → simula attivazione → il contatto ha `trial:attivo`
- [ ] Rilanciare `20-COLLAUDO.sql`: il controllo 4 non deve segnalare tag mancanti
- [ ] Prova manuale: attivare l'azienda di test e vedere il tag comparire sul contatto

**Stima: mezza giornata.**

---

## 4.B — Il nodo `attendi_fino_a`

### Perché

Il motore ha solo `attendi` **relativo**: giorni/ore/minuti da adesso. Tutto il piano è costruito su orari assoluti, perché il destinatario è un imprenditore edile:

- **6:30-7:30** prima di salire in cantiere
- **12:30-13:30** pausa pranzo
- **18:30-20:00** dopo il cantiere
- **mai 9:00-12:00**, mai la domenica

Oggi i **74 nodi `attendi`** dei flussi sono calcolati assumendo che il flusso parta a metà pomeriggio. **Se un lead accetta il contratto alle 9 del mattino, tutta F2B slitta di sette ore** e la mail delle 6:45 arriva all'una di notte.

### La buona notizia

Il pezzo difficile esiste già: `supabase/functions/_shared/outreach-schedule.ts` è un modulo **puro** (niente Deno, niente Supabase, solo `Intl`), già testato in vitest, che espone:

```ts
export interface SendWindow { days: number[]; startHour: number; endHour: number; timeZone: string }
export const DEFAULT_SEND_WINDOW: SendWindow          // Lun-Ven 8-19 Europe/Rome
export function localParts(date, timeZone): { hour, weekday }   // gestisce la DST via Intl
export function isWithinSendWindow(date, w): boolean
export function parseSendWindow(raw): SendWindow
```

`localParts` è esattamente quello che serve per calcolare l'ora locale rispettando l'ora legale. **Riusalo, non riscriverlo.**

### B1 — Nuovo modulo puro

`supabase/functions/_shared/automation-schedule.ts`

```ts
export interface AttendiFinoAConfig {
  ora: string;                 // "06:45"
  giorni_min?: number;         // minimo giorni da aspettare prima della prossima occorrenza (default 0)
  giorni_ammessi?: number[];   // 0=Dom … 6=Sab. Default [1,2,3,4,5,6] (mai domenica)
  fuso?: string;               // default "Europe/Rome"
  blackout?: string[];         // ["08-08:24-08", "23-12:06-01"] — periodi giorno-mese
}

/**
 * Restituisce l'istante UTC della prossima occorrenza di `ora` nel fuso indicato,
 * saltando i giorni non ammessi e i periodi di blackout.
 */
export function prossimaOccorrenza(da: Date, cfg: AttendiFinoAConfig): Date
```

Regole:
- se `da` è già oltre `ora` di oggi, va a domani
- `giorni_min` somma giorni **prima** di cercare l'occorrenza (serve per "fra 5 giorni alle 6:45")
- se il giorno risultante non è ammesso o è in blackout, avanza di un giorno e riprova, **massimo 60 iterazioni** poi restituisce il calcolo grezzo e logga
- deve essere **puro e deterministico**: `da` passato come parametro, mai `new Date()` dentro

### B2 — Catalogo

`src/lib/flow-node-catalog.ts` — nuova voce in `ACTION_CATALOG`, categoria `generale`, accanto a `attendi`:

```ts
{
  id: 'attendi_fino_a',
  label: 'Attendi fino a un orario',
  description: 'Aspetta la prossima occorrenza di un orario preciso, saltando domeniche e pause.',
  categoria: 'generale',
  icon: 'clock',
  configSchema: [
    { id: 'ora', label: 'Ora (hh:mm)', type: 'text', required: true, placeholder: '06:45' },
    { id: 'giorni_min', label: 'Aspetta almeno N giorni', type: 'number', required: false, defaultValue: 0 },
    { id: 'giorni_ammessi', label: 'Giorni ammessi', type: 'select', required: false, options: [...] },
    { id: 'fuso', label: 'Fuso orario', type: 'text', required: false, defaultValue: 'Europe/Rome' },
  ],
}
```

`actionKind()` in `src/components/flow-builder/catalog/ActionCatalogList.tsx` deve mapparlo a `delay` (come già fa per `attendi`), altrimenti il nodo viene creato come `action` e il motore non lo tratta come attesa.

### B3 — Esecutore

`supabase/functions/process-automation/index.ts` — nel punto dove viene gestito `attendi` (cerca `case "attendi"` / `calcDelay`), aggiungere il ramo `attendi_fino_a` che chiama `prossimaOccorrenza` e imposta `execute_at` **assoluto** invece di sommare millisecondi.

Attenzione: `execute_at` è `timestamptz`. Passare l'istante UTC calcolato, non una stringa locale.

### B4 — Test

`src/test/logic/automationSchedule.test.ts` — vitest, come gli altri 191 test del repo. Casi minimi:

- da lunedì 14:00 → `ora: "06:45"` → martedì 06:45
- da lunedì 05:00 → `ora: "06:45"` → **lunedì** 06:45 (stesso giorno, non domani)
- sabato → `giorni_ammessi` senza domenica → lunedì
- attraverso il cambio ora legale (fine ottobre): l'ora locale resta 06:45
- blackout 8-24 agosto: da 10 agosto → 24 agosto
- `giorni_min: 5` da lunedì → sabato/lunedì secondo i giorni ammessi

### B5 — Migration di riscrittura dei nodi

Dopo che B1-B4 girano: una migration che converte i 74 nodi `attendi` dei sei flussi in `attendi_fino_a` dove il copy specifica un'ora.

**La mappa ora-per-nodo si ricava dai file sorgente in `03-SEQUENZE/`**: ogni messaggio ha `quando: D+2 — ore 6:45` nella testata YAML. Non inventarla.

### Fatto quando

- [ ] I test di B4 passano
- [ ] Un lead finto che entra in F2B alle 9:00 riceve `EM-F2B-02` alle 6:45 del giorno dopo, non alle 9:00
- [ ] `20-COLLAUDO.sql` continua a passare

**Stima: un giorno.**

---

## 4.C — Webhook per le risposte email

### Perché

`EM-F2B-02` chiede al lead di rispondere con **una parola**: TEMPO, DATI, SOCIO o RIPENSATO. Da quella risposta dipendono quattro rami diversi al D+2, con quattro email completamente diverse.

Il motore conosce dieci eventi ma **`email_replied` non c'è**, e non esiste nessun parser delle risposte in ingresso. Oggi il ramo si regge su qualcuno che legge le risposte e mette il tag a mano: sostenibile a cento lead al mese, non a cinquecento.

### Implementazione

Nuova edge function `supabase/functions/inbound-email-reply/index.ts`:

1. **Verifica la firma** del provider (dipende dall'ESP — Postmark, SendGrid inbound, Mailgun routes). Rifiuta con 401 se non valida. **Non saltare questo passo**: un endpoint aperto significa che chiunque può scrivere tag sui vostri contatti.
2. **Trova il contatto** da `From`, normalizzando in minuscolo e togliendo il `+alias`. Se non lo trova → 200 con log, non 500 (altrimenti l'ESP riprova all'infinito).
3. **Estrai il testo della risposta**, togliendo la parte citata (righe che iniziano con `>`, e tutto ciò che segue `Il ... ha scritto:` o `On ... wrote:`).
4. **Riconosci la parola.** Case-insensitive, anche dentro una frase, anche con errori tipici:
   - `TEMPO` — anche "non ho tempo", "tempo"
   - `DATI` — anche "dati", "non ho i dati"
   - `SOCIO` — anche "socio", "mio socio", "commercialista"
   - `RIPENSATO` — anche "ci ho ripensato", "ripensato", "lascia stare"
   Se ne riconosce **più di una**, prende la prima in ordine di apparizione e logga l'ambiguità.
5. **Scrivi il tag** `ostacolo:<parola>` sul contatto.
6. **Se non riconosce niente** → `crea_task` per il commerciale con il testo della risposta. **Mai tirare a indovinare**: un ramo sbagliato dentro una finestra da sette giorni costa un cliente.
7. **Logga sempre** in una tabella `inbound_email_log` (nuova) con: mittente, contatto trovato, parola riconosciuta, testo grezzo. Serve a migliorare il parser.

### Il flusso F2B va poi ricablato

Oggi il nodo di attesa è `wait_for_event` su `whatsapp_message_received`. Con questo task diventa `wait_for_event` su `tag_added` (che esiste già nel catalogo), oppure si aggiunge `email_replied` alla lista degli eventi.

**La seconda è più pulita** ma tocca l'esecutore. Valuta e scegli.

### Fatto quando

- [ ] Test con 10 risposte finte, incluse quelle sporche (firma, testo citato, maiuscole miste, parola dentro una frase)
- [ ] Una risposta non riconoscibile crea un task e non scrive tag
- [ ] Un POST senza firma valida riceve 401
- [ ] Il lead finto in F2B, rispondendo "DATI" via email, riceve `EM-F2B-03B` e non gli altri tre

**Stima: un giorno.**

---

## 4.D — Tag e campi personalizzati nel pannello condizioni

### Perché

`ConditionConfigPanel.tsx` ha undici campi cablati a mano. L'esecutore accetta qualsiasi stringa, quindi le condizioni sui tag **funzionano** — ma solo se create via SQL. Dall'interfaccia non si possono né creare né modificare, e chi apre il flow builder vede il campo `contatto.tags` in un menù che non lo contiene.

Non blocca la pubblicazione. Ma senza, **ogni modifica ai flussi torna a passare da una migration**, e il builder visuale diventa di sola lettura per il 60% delle condizioni.

### Implementazione

`src/components/flow-builder/config-panels/ConditionConfigPanel.tsx`:

1. Aggiungere all'array `CAMPI`:
   - `contatto.tags` — "Tag del contatto"
   - `opportunita.tags` — "Tag dell'opportunità"
   - `opportunita.status` — "Stato opportunità"
   - `contatto.company_name`, `contatto.province`, `contatto.region`
2. Caricare i campi personalizzati da `marketing_custom_fields` **esattamente come già fa `VariablePicker.tsx`** (righe 64-106) e aggiungerli in un gruppo separato, con l'avvertenza in interfaccia che **non sono valutabili nelle condizioni** finché l'esecutore non li carica.
3. **Oppure** (meglio, se c'è tempo): estendere `executeCondition` a risolvere anche i campi personalizzati con un prefisso `campo.`, facendo una join su `marketing_contact_field_values`. Costa un'ora in più e toglie per sempre il vincolo.

### Fatto quando

- [ ] Aprendo F2B nel builder, tutte le 45 condizioni mostrano il loro campo nel menù invece che vuoto
- [ ] Si può creare una condizione sui tag senza scrivere SQL
- [ ] I 191 test esistenti continuano a passare

**Stima: mezza giornata (un giorno con l'opzione 3).**

---

# PARTE 5 — GLI OTTO VINCOLI DA CONOSCERE

Scoperti costruendo i flussi. Servono a non riaprire discussioni già chiuse.

1. **`opportunita_stage_cambiato` filtra su un enum fisso** e non vede le 16 fasi custom → tutti i flussi entrano da `tag_aggiunto`.
2. **`appuntamento.` risolve sull'appuntamento più recente del contatto**, non su quello che ha fatto scattare il flusso. Con due appuntamenti aperti le condizioni guardano quello sbagliato.
3. **Non c'è modo di disabilitare un nodo**: `automation_nodes` non ha una colonna `enabled`. L'unico modo di tenerlo pronto senza farlo partire è **non collegarlo** (è il caso di `EM-F1-03`).
4. **Il valore di una condizione è un letterale statico**: niente espressioni, niente `now()`. Per questo F1 gira con un binario unico invece dei tre previsti.
5. **`delay` accetta solo costanti**: un ritardo calcolato da una data del contatto non è esprimibile. Per questo il ri-aggancio R−60 di F3D è un flusso separato che parte da un tag apposto da un job esterno.
6. **`invia_whatsapp` prende testo libero**, non ha campi per nome template Meta, categoria e parametri numerati. I 25 template vanno sottomessi e mappati fuori dal builder.
7. **`invia_email` non ha un campo preheader**: le righe "Preview:" scritte nel copy oggi si perdono.
8. **Non c'è controllo di opt-in** né per WhatsApp né per SMS a livello di nodo. Va messo nello scheduler d'invio, prima della consegna.

---

# PARTE 6 — ORDINE DI LAVORO

```
Passo 0   Lanciare i sei SQL sull'azienda di test + 20-COLLAUDO
          → serve a vedere i flussi nel builder prima di toccare codice

Passo 1   Task A — trial:attivo                          mezza giornata
Passo 2   Task B — attendi_fino_a (B1→B5)                un giorno
Passo 3   Rilanciare 20-COLLAUDO + prova con lead finto
Passo 4   Task C — webhook risposte email                un giorno
Passo 5   Ricablare il nodo di attesa di F2B
Passo 6   Task D — pannello condizioni                   mezza giornata
Passo 7   Collaudo end-to-end con i tre contatti finti
```

**Totale: 3 giornate-uomo.** Dopo il passo 3, F2B e F11 sono pubblicabili.

---

# PARTE 7 — COSA NON FARE

- **Non pubblicare nessun flusso.** Sono tutti in `draft` di proposito: la pubblicazione è una decisione di Florin, messaggio per messaggio, dopo la revisione del copy.
- **Non toccare il testo delle email.** Sono scritti e revisionati. Se un testo dà problemi tecnici, segnalalo invece di riscriverlo.
- **Non pubblicare le 27 email con i `[[...]]`.** Sono i casi cliente che non esistono ancora. Il controllo 3 di `20-COLLAUDO.sql` te le elenca.
- **Non sostituire i `[[...]]` con `{{...}}`.** È voluto: un `{{...}}` sconosciuto viene svuotato in silenzio e la mail parte bucata; un `[[...]]` resta visibile.
- **Non rilanciare gli SQL dopo aver modificato i flussi dall'interfaccia.** Sono idempotenti e non sovrascrivono, ma da quel momento la fonte di verità è il database e l'SQL resta solo come archivio.
- **Non allentare la regola dei rami.** Ogni condizione deve avere `Sì` e `No`: senza, il flusso muore lì in silenzio e non te ne accorgi finché non guardi i log.
