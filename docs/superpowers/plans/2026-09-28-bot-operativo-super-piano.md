# Bot operativo WhatsApp — Super piano (documenti intelligenti, motore proattivo, automazioni)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** portare il bot operativo da «risponde e prepara» a «capisce i documenti, prepara i preventivi veri, e lavora per primo» — con le automazioni che il titolare crea da solo dalle impostazioni.

**Architecture:** si riusa tutto quello che c'è. I documenti (foto e ora anche PDF) passano per gli edge di lettura già esistenti (`silvio-extract-pdf`, `ddt_ocr`, `ai-genera-preventivo-v2`) chiamati con l'ingresso interno (chiave di servizio + `per_utente`), come `generate-quote-pdf`. Il bot proattivo estende il dispatcher già vivo `whatsapp-operational-reminders`: legge delle **routine** configurabili (in `bot_routine`), valuta quali sono dovute, e manda i messaggi via `whatsapp-send` con **modelli Meta approvati** (fuori dalla finestra 24h serve il template). Le automazioni si creano da una schermata nelle impostazioni del bot.

**Tech Stack:** Supabase Edge (Deno), Postgres/plpgsql + pg_cron, Meta WhatsApp Cloud (template UTILITY), React/Vite (schermata impostazioni), Vitest per la logica pura, `deno check` (via pacchetto npm in scratchpad) col confronto prima/dopo su `origin/main`.

---

## Contesto e stato di partenza (28/09/2026)

Il bot operativo è LIVE su Demo Azienda 2 (numero +39 351 361 1676, agente `843b00b0-…` in `ai_agents_v2`). Fasi 0 e 1 fatte (vedi [`2026-09-27-bot-operativo-completo.md`](2026-09-27-bot-operativo-completo.md)): ruoli veri coi permessi, strumenti di Silvio con conferma, DDT→magazzino, prompt configurabile, email/messaggi ai clienti con bozza da approvare, PDF del preventivo su WhatsApp.

**Cosa esiste già e si RIUSA (non ricostruire):**
- `silvio-extract-pdf` (`supabase/functions/silvio-extract-pdf/index.ts`): legge un PDF da `storage_path` con `pdfjs-dist`, fallback vision-OCR. Ingresso `requireAuth` → va aggiunto l'ingresso interno.
- `ai-genera-preventivo-v2`: motore preventivo col **listino + manodopera** (RPC `match_articles`, `match_families_semantic`, `match_tariffe_semantic`). Input `{company_id, descrizione, tipo_lavoro, misure[], input_mode, foto[]}`, output `{sezioni[]}`. Ingresso `requireAuth` → aggiungere ingresso interno.
- `whatsapp-ai-processor/media.ts` → `leggiFotoOperativa` legge le FOTO (DDT o descrizione) con `ddt_ocr`. Oggi i PDF (`message_type='document'`) vengono scaricati ma **mai letti**.
- `whatsapp-operational-reminders` (dispatcher già vivo via pg_cron): itera i numeri, legge `operational_settings`, manda via `whatsapp-send`, logga in `wa_operational_reminder_log`. È la base del motore proattivo.
- `whatsapp-send`: tipi `text|interactive|template|document`. Fuori dalla finestra 24h serve un `template` approvato.
- `wa_meta_templates` + `whatsapp-templates` (crea/edita/carica media header) + `sync-meta-templates`.
- Config agente in `ai_agents_v2.tools_config.operativo` (istruzioni, per_ruolo, aree, strumenti_vietati, sblocchi) — logica in `_shared/agenteOperativoConfig.ts`.
- Ponte verso Silvio: `whatsapp-ai-processor/silvio.ts` (proposte gialle → bottoni Sì/No).

## Regole fisse (ogni task le rispetta)

- **Nessun `git push` su main senza l'ok esplicito del founder** (auto-deploy in produzione).
- Migrazioni: SQL idempotente con `apply_migration`, poi versione riallineata in `supabase_migrations.schema_migrations`; **controllare prima quali versioni sono già prese** (repo E `schema_migrations`). Mai `supabase db push`.
- Funzioni SQL nuove: `revoke all … from public, anon` + grant espliciti.
- Edge: `deno` non è nell'ambiente → pacchetto npm ufficiale in `scratchpad/tools`; per ogni file toccato **il numero di errori `deno check` non deve crescere** rispetto a `origin/main` (script `scratchpad/deno-diff.sh`). `deno check` sporca `deno.lock`: ripristinarlo prima del commit.
- Prima di dire «pronto»: `node scripts/typecheck-ratchet.mjs`, i test toccati, la build, e la **prova vera dal 348 346 7567** col watcher acceso.
- Testi che vede l'utente: niente termini tecnici. Chi non ha il permesso di un'area non vede i suoi dati (il gate `staff_permissions` vale su ogni canale).
- Ogni azione che scrive/invia/cambia dati passa da una conferma.
- Trappola CI nota: un test rosso di un'altra sessione salta il deploy delle funzioni; dopo il push controllare le versioni via Management API e, se serve, rilanciare `gh workflow run ci.yml -f funzioni="…"`.

## Mappa dei file

| File | Ruolo | Fase |
|---|---|---|
| `supabase/functions/silvio-extract-pdf/index.ts` | +ingresso interno (`per_utente`) | E, A |
| `supabase/functions/ai-genera-preventivo-v2/index.ts` | +ingresso interno (`per_utente`) | E |
| `supabase/functions/whatsapp-ai-processor/media.ts` | lettura documenti PDF | A |
| `supabase/functions/_shared/documentoInGingresso.ts` (nuovo) | logica pura: che documento è (DDT/fattura/computo/scontrino) | A |
| `supabase/functions/whatsapp-ai-processor/tools/ufficio/*` (nuovi) | strumenti: fattura_passiva, scontrino, sopralluogo_misure, preventivo_da_computo | A |
| `supabase/functions/_shared/preventivoDaComputo.ts` (nuovo) | logica pura: dal risultato AI alle domande da fare | A/E |
| `supabase/migrations/*_bot_routine.sql` (nuovo) | tabella routine + funzioni di valutazione | B |
| `supabase/functions/_shared/routineOperativa.ts` (nuovo) | logica pura: quali routine sono dovute adesso | B |
| `supabase/functions/whatsapp-operational-reminders/index.ts` | dispatcher esteso alle routine | B |
| `supabase/functions/_shared/reportMattino.ts` (nuovo) | logica pura: compone il testo del report | B |
| `supabase/functions/bot-avvisi/index.ts` (nuovo) | valuta gli eventi e accoda gli avvisi | B |
| `src/pages/azienda/whatsapp/AutomazioniBotPage.tsx` (nuovo) | schermata «Automazioni del bot» | B |
| `supabase/functions/whatsapp-ai-processor/index.ts` | instradamento cliente/operaio/sconosciuto | D |
| `supabase/functions/whatsapp-ai-processor/silvio.ts` | canali extra per posta/grafici | C |

---

# FASE E — Preventivo col listino e la manodopera veri (prerequisito di A4)

Oggi `crea_preventivo_bozza` fa un match sul nome. Il motore vero è `ai-genera-preventivo-v2` ma vuole il token utente. Serve l'ingresso interno, come `generate-quote-pdf`.

### Task E1: ingresso interno a `ai-genera-preventivo-v2`

**Files:** Modify `supabase/functions/ai-genera-preventivo-v2/index.ts`.

- [ ] **Step 1** — importare `chiamataInternaValida` da `../_shared/chiamataInterna.ts`.
- [ ] **Step 2** — sostituire `const { userId, supabaseAdmin } = await requireAuth(...)` con:
```ts
const body = await req.json();
const interna = chiamataInternaValida(req) && typeof body?.per_utente === "string";
const { userId, supabaseAdmin } = interna
  ? { userId: body.per_utente as string, supabaseAdmin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) }
  : await requireAuth(req, corsH);
```
Poi il controllo azienda esistente (`requireCompanyAccess(supabaseAdmin, userId, company_id, corsH)`) resta e vale anche per l'ingresso interno (l'utente è quello riconosciuto dal bot). Il payment-gate: quando `interna`, saltarlo (l'azienda è un tenant comped/pagante già verificato dal numero) — racchiudere la chiamata al gate in `if (!interna) …`.
- [ ] **Step 3** — `deno-diff.sh ai-genera-preventivo-v2/index.ts`: errori invariati.
- [ ] **Step 4** — prova a vuoto via `net.http_post` (come fatto per `generate-quote-pdf`) con `per_utente` = utente demo2 e una `descrizione` semplice: 200 con `sezioni`.
- [ ] **Step 5** — commit.

### Task E2: lo strumento del bot usa il motore vero

**Files:** Create `supabase/functions/whatsapp-ai-processor/tools/ufficio/crea_preventivo_ai.ts`; Modify `tools/registry.ts`, `identity.ts` (grant `preventivi.ai`), `prompts/system_ufficio.ts`.

- [ ] Strumento `crea_preventivo_ai(descrizione, tipo_lavoro?, misure?)`: chiama `ai-genera-preventivo-v2` interno con `per_utente = ctx.user_id`, riceve `sezioni`, e crea il preventivo con la RPC `silvio_create_quote_draft` (righe dalle sezioni). Rischio: giallo (conferma). Ritorna `quote_id`.
- [ ] Grant `preventivi.ai` a ufficio/admin in `identity.ts` (accanto a `preventivi.pdf`).
- [ ] Prompt: «per un preventivo dettagliato con i tuoi prezzi usa crea_preventivo_ai; per una bozza veloce crea_preventivo_bozza».
- [ ] deno-diff, commit.

---

# FASE A — Documenti intelligenti in ingresso

### Task A0: leggere i PDF (non solo le foto)

Oggi `index.ts:350` legge solo `message_type === "image"`. I PDF (`document`) vengono scaricati e ignorati.

**Files:** Modify `whatsapp-ai-processor/media.ts` (nuova `leggiDocumentoOperativo`), `whatsapp-ai-processor/index.ts`; ingresso interno a `silvio-extract-pdf` (come E1).

- [ ] **Step 1** — `silvio-extract-pdf`: aggiungere l'ingresso interno (`chiamataInternaValida` + `per_utente`), identico a E1. Prova a vuoto via `net.http_post` su un PDF di storage esistente: 200 col testo.
- [ ] **Step 2** — in `media.ts` aggiungere `leggiDocumentoOperativo(supabase, {storagePath, companyId, userId, didascalia, messageId, mime})`:
  - se `mime` inizia con `image/` → `leggiFotoOperativa` (già esiste);
  - se `application/pdf`:
    - estrai il testo con `silvio-extract-pdf` (interno);
    - passa il testo al classificatore `tipoDocumento(testo, didascalia)` (Task A1 lo definisce) per capire se è DDT / fattura / computo / altro;
    - se è un DDT → riusa il lettore `ddt_ocr` sul testo (o vision sulle prime pagine) come per la foto;
    - altrimenti ritorna `[Documento PDF — testo letto]:\n<testo troncato>` così l'assistente ci ragiona.
- [ ] **Step 3** — in `index.ts`, dove oggi c'è `else if (msg.message_type === "image" && msg.media_storage_path)`, aggiungere un ramo `document`:
```ts
} else if (msg.message_type === "document" && msg.media_storage_path) {
  userContent = await leggiDocumentoOperativo(supabase, {
    storagePath: msg.media_storage_path, companyId: msg.company_id,
    userId: identity.user_id, didascalia: msg.content_text, messageId: msg.id,
    mime: String(msg.metadata?.mime_type ?? "application/pdf"),
  });
}
```
- [ ] **Step 4** — deno-diff, poi prova vera: manda un PDF di DDT al 348 → deve leggerlo come la foto.
- [ ] **Step 5** — commit.

### Task A1: che documento è (logica pura) + fattura del fornitore

**Files:** Create `supabase/functions/_shared/documentoInGingresso.ts` + test `src/test/logic/documentoInGingresso.test.ts`; Create `tools/ufficio/carica_fattura_passiva.ts`; Modify registry/identity/prompt.

- [ ] **Step 1 (test)** — `tipoDocumento(testo, didascalia)` ritorna `'ddt' | 'fattura' | 'computo' | 'scontrino' | 'altro'`:
```ts
import { tipoDocumento } from "../../../supabase/functions/_shared/documentoInGingresso";
expect(tipoDocumento("DOCUMENTO DI TRASPORTO n. 12", null)).toBe("ddt");
expect(tipoDocumento("FATTURA n. 2026/45 imponibile 1.000 IVA 22%", null)).toBe("fattura");
expect(tipoDocumento("COMPUTO METRICO ESTIMATIVO", null)).toBe("computo");
expect(tipoDocumento("SCONTRINO", "ho pagato il ferramenta")).toBe("scontrino");
expect(tipoDocumento("lista della spesa", null)).toBe("altro");
```
- [ ] **Step 2** — implementare con parole chiave pesate (DDT/bolla; fattura/imponibile/IVA/n. fattura; computo metrico/estimativo/voci di capitolato; scontrino/ricevuta/pagato); la didascalia conta come i contenuti.
- [ ] **Step 3** — strumento `carica_fattura_passiva`: dal documento corrente (foto/PDF già letto) estrae fornitore, numero, data, imponibile, IVA, totale (vision/`ddt_ocr` esteso) e crea una **bozza** in `email_scadenza_bozza` (come fa Silvio `registra_fattura_passiva`) collegata al fornitore se trovato. Rischio: giallo. Se manca il fornitore in anagrafica → chiede se crearlo (Task A5).
- [ ] **Step 4** — prompt: «foto/PDF di una fattura del fornitore → mostra i dati e chiedi conferma (azione: carica_fattura_passiva)».
- [ ] **Step 5** — test verdi, deno-diff, commit.

### Task A2: scontrini/ricevute → piccola spesa

**Files:** Create `tools/ufficio/carica_scontrino.ts`; migrazione `*_spese_da_scontrino.sql` (se non c'è già una tabella spese/prima nota adatta — verificare `prima_nota_entries`).

- [ ] Strumento `carica_scontrino(commessa?, categoria?)`: dal documento corrente estrae importo, esercente, data; registra una **uscita** in `prima_nota_entries` (categoria «materiali/spese cantiere»), collegata alla commessa se indicata. L'operaio può mandarlo (grant `spese.write` per operaio+ufficio). Rischio: giallo. Ritorna l'importo registrato.
- [ ] Prompt operaio: «se mandi la foto di uno scontrino ti chiedo per quale cantiere e lo registro».
- [ ] Migrazione solo se serve una colonna `fonte='scontrino_whatsapp'`; altrimenti usare le colonne esistenti.
- [ ] deno-diff, commit.

### Task A3: foto del sopralluogo → misure nel sopralluogo

**Files:** Create `tools/ufficio/aggiorna_misure_sopralluogo.ts`; verificare lo schema `surveys` (tabella dei sopralluoghi) e dove stanno le misure.

- [ ] **Step 1** — leggere lo schema `surveys` (colonne misure/rilievo). La foto del sopralluogo viene letta con vision (prompt: «estrai tutte le misure: larghezza×altezza in mm, quantità, vani, note»).
- [ ] **Step 2** — strumento `aggiorna_misure_sopralluogo(survey_id|cantiere, misure[])`: scrive le misure lette nel sopralluogo indicato (o nel sopralluogo aperto del cantiere corrente). Rischio: giallo (mostra le misure lette e chiede conferma). Se non c'è un sopralluogo aperto → propone `crea_sopralluogo` prima.
- [ ] **Step 3** — prompt: «foto di un rilievo con misure → estrai le misure e, con conferma, mettile nel sopralluogo».
- [ ] deno-diff, commit.

### Task A4: computo metrico → preventivo dettagliato (con domande)

Combina A0 (leggo il PDF/foto del computo) + E (motore preventivo).

**Files:** Create `supabase/functions/_shared/preventivoDaComputo.ts` + test; Create `tools/ufficio/preventivo_da_computo.ts`.

- [ ] **Step 1 (test logica pura)** — `domandeMancanti(sezioni)` guarda il risultato di `ai-genera-preventivo-v2` e trova cosa manca per un preventivo serio: voci senza prezzo, misure assenti, manodopera non stimata, cliente non indicato. Ritorna una lista di domande brevi (max 3) da fare all'utente.
```ts
expect(domandeMancanti({sezioni:[{righe:[{descrizione:"cappotto",prezzo:null}]}]}))
  .toContain("Che prezzo metto per: cappotto?");
expect(domandeMancanti({sezioni:[{righe:[{descrizione:"x",prezzo:10}]}]})).toEqual([]);
```
- [ ] **Step 2** — implementare `domandeMancanti` (pura).
- [ ] **Step 3** — strumento `preventivo_da_computo`: legge il computo (documento corrente), chiama `ai-genera-preventivo-v2` interno, calcola `domandeMancanti`; **se ci sono domande → le fa con `chiedi_conferma`/testo e si ferma** (le risposte tornano al turno dopo, salvate in sessione); **se è completo → crea il preventivo** (come E2) e propone di mandarti il PDF. Rischio: giallo.
- [ ] **Step 4** — prompt: «computo metrico caricato → genera il preventivo col listino; se manca qualcosa fai al massimo 3 domande, poi crea».
- [ ] test verdi, deno-diff, commit.

### Task A5: chiedere i dati mancanti (pattern, non un tool)

**Files:** Modify `prompts/system_ufficio.ts` + `_shared/agenteOperativoConfig.ts` (istruzione trasversale).

- [ ] Aggiungere al prompt base la regola: «Se per fare una cosa ti manca un dato essenziale (il cliente, il fornitore, un importo, la commessa), NON fermarti con un no: chiedi esattamente quel dato in una riga, e riprendi appena l'utente risponde. Se il cliente/fornitore non è in anagrafica, proponi di crearlo al volo (con conferma).»
- [ ] Nessun codice nuovo oltre al prompt; commit.

---

# FASE B — Il bot parla per primo + le automazioni le crei tu

Cuore della richiesta del founder: report del mattino, un messaggio a ogni operaio con le sue cose, avvisi automatici — e **una schermata dove il titolare crea questi automatismi**.

**Vincolo Meta:** per scrivere a qualcuno fuori dalla finestra di 24h serve un **modello approvato**. Report e to-do partono la mattina, quando l'operaio/titolare non ha appena scritto → servono template UTILITY con variabili.

### Task B0: modello dati delle routine + logica «cosa è dovuto adesso»

**Files:** migrazione `*_bot_routine.sql`; Create `supabase/functions/_shared/routineOperativa.ts` + test.

- [ ] **Step 1 (migrazione)** — tabella `bot_routine`:
```sql
create table public.bot_routine (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  wa_number_id uuid not null references public.ai_whatsapp_numbers(id),
  tipo text not null check (tipo in ('report_mattino','todo_operaio','avviso','promemoria_appuntamento')),
  attiva boolean not null default true,
  ora time,                         -- per report/to-do (ora italiana)
  giorni int[] default '{1,2,3,4,5}',-- 1=lun … 7=dom
  destinatari jsonb not null default '{}'::jsonb, -- {ruoli?, utenti?, ogni_operaio?:true}
  regole jsonb not null default '{}'::jsonb,      -- soglie per gli avvisi
  template_nome text,               -- modello Meta per fuori finestra 24h
  creata_da uuid, creata_il timestamptz default now(), aggiornata_il timestamptz default now()
);
```
+ `revoke/grant`, RLS per azienda, indice su (company_id, attiva).
- [ ] **Step 2 (test logica pura)** — `routineDaEseguire(routine[], adesso)` ritorna quelle dovute ora (tipo temporale: ora/giorno combaciano, non già eseguita oggi — lo stato «già eseguita» lo passa il chiamante). Gli avvisi (event-driven) NON passano di qui.
```ts
expect(routineDaEseguire([{tipo:"report_mattino",ora:"07:00",giorni:[1]}], new Date("2026-09-28T05:00:00Z")).length).toBe(1); // lun 07:00 IT
```
- [ ] **Step 3** — implementare `routineOperativa.ts` con l'ora italiana (`Intl` timeZone Europe/Rome), riusando lo stile di `formatoWhatsApp.oraItaliana`.
- [ ] test verdi, migrazione applicata+riallineata, commit.

### Task B1: report del mattino su WhatsApp

**Files:** Create `_shared/reportMattino.ts` + test; Modify `whatsapp-operational-reminders/index.ts`; creare template Meta `report_operativo_mattino`.

- [ ] **Step 1 (test)** — `componiReportMattino(dati)` (pura): dai numeri già raccolti (commesse in corso, incassi in scadenza oggi, materiale sotto scorta, appuntamenti di oggi) compone il testo nella forma breve del founder. Verifica che, se una sezione è vuota, non la scrive.
- [ ] **Step 2** — implementare la composizione (pura).
- [ ] **Step 3** — nel dispatcher: per ogni routine `report_mattino` dovuta, raccogliere i dati (riuso delle stesse query/edge dei tool: `lista_lavori_pose_periodo`, `lista_scadenze`, `lista_stockout_imminenti`, calendario), comporre col helper, mandare via `whatsapp-send` **come template** `report_operativo_mattino` (una variabile = il corpo), ai destinatari (admin/ufficio della routine). Loggare in `wa_operational_reminder_log` per non ripetere.
- [ ] **Step 4** — creare e sottomettere a Meta il template `report_operativo_mattino` (UTILITY, 1 variabile). Documentare che finché è PENDING il report non parte fuori finestra.
- [ ] **Step 5** — prova vera: forzare il dispatcher (`force`) verso il 348 → arriva il report.
- [ ] commit.

### Task B2: a ogni operaio le sue cose del giorno

**Files:** Modify `whatsapp-operational-reminders/index.ts`; template Meta `todo_operaio_giorno`.

- [ ] Per ogni routine `todo_operaio` dovuta: per ogni dipendente attivo con telefono, raccogliere le sue assegnazioni del giorno (`order_campo_assignments` + calendario), comporre «Oggi: cantiere X, dalle 8, con Y. Da fare: …» e mandare come template `todo_operaio_giorno`. Saltare chi non ha telefono. Loggare per non duplicare.
- [ ] Riusa il pattern già presente nel dispatcher per il promemoria rapportino (itera `order_campo_assignments` + `employees`).
- [ ] Template Meta `todo_operaio_giorno` (UTILITY, variabili: nome, corpo). Prova vera al 348. commit.

### Task B3: avvisi automatici (event-driven)

**Files:** Create `supabase/functions/bot-avvisi/index.ts`; pg_cron ogni 30 min; usa `bot_routine` tipo `avviso` con `regole` (soglie).

- [ ] Edge `bot-avvisi`: per ogni azienda con una routine `avviso` attiva, valuta le condizioni con query mirate:
  - **fattura scaduta oggi** (`get_overdue_payments` logica);
  - **cantiere in ritardo** (`predici_data_fine_cantiere`/scostamento fasi);
  - **materiale sotto scorta** (`lista_stockout_imminenti`);
  - **DURC/documento subappaltatore in scadenza**;
  - **preventivo visto dal cliente ma non accettato da N giorni**.
  Ogni avviso nuovo (chiave = tipo+entità+giorno, per non ripetere) → messaggio all'admin/ufficio come template `avviso_operativo`.
- [ ] `regole` per azienda: quali avvisi, con quali soglie (giorni ritardo, giorni preventivo, ecc.).
- [ ] pg_cron `bot-avvisi` ogni 30 min. Template Meta `avviso_operativo`. Prova vera. commit.

### Task B4: promemoria appuntamento all'ora giusta

**Files:** Modify `bot-avvisi` o un piccolo cron dedicato; legge `appointments` futuri.

- [ ] Per gli appuntamenti delle prossime ~2 ore (con anticipo configurabile nella routine), manda un promemoria al titolare/assegnatario (finestra 24h di solito aperta → testo; altrimenti template). Chiave anti-ripetizione per appuntamento.
- [ ] commit.

### Task B5: la schermata «Automazioni del bot»

**Files:** Create `src/pages/azienda/whatsapp/AutomazioniBotPage.tsx` + hook `src/hooks/whatsapp/useBotRoutine.ts`; rotta in `companyRoutes.tsx`; voce di menu.

- [ ] **Step 1** — hook CRUD su `bot_routine` (React Query, chiavi per azienda; una chiave per shape — vedi memoria querykey-collision).
- [ ] **Step 2** — pagina con una lista di «automazioni» e un pulsante «Nuova». Per ognuna, in parole semplici (niente termini tecnici):
  - **Cosa manda** (report del mattino / le cose del giorno agli operai / avvisi / promemoria appuntamenti);
  - **A chi** (a me / all'ufficio / a ogni operaio / a una persona);
  - **Quando** (ogni mattina alle __, nei giorni __) o, per gli avvisi, «quando succede X» con le soglie;
  - interruttore Attiva/Sospendi.
- [ ] **Step 3** — salvataggio → `bot_routine`. Nessun termine tecnico; se un template Meta manca ancora, mostrare «in attivazione» invece di un errore.
- [ ] **Step 4** — `node scripts/typecheck-ratchet.mjs`, build, commit.

---

# FASE C — Uscita e commerciale

### Task C1: mandare il PDF/preventivo al CLIENTE (con modello)

**Files:** Create `tools/ufficio/invia_preventivo_al_cliente.ts`; template Meta `invio_preventivo_cliente` (con header DOCUMENT).

- [ ] Strumento `invia_preventivo_al_cliente(quote_id)`: genera il PDF (`generate-quote-pdf` interno), e lo manda al **numero del cliente** — se la sua finestra 24h è aperta come `document`, altrimenti come **template** `invio_preventivo_cliente` con header PDF. Rischio: giallo, e la conferma dice chiaramente «lo mando al cliente». Grant separato `preventivi.invio_cliente` (non tutti).
- [ ] Template Meta con header DOCUMENT (serve l'handle caricato — riuso `whatsapp-templates` azione `carica_media_header`). commit.

### Task C2: leggere la posta del cliente su WhatsApp

**Files:** Modify `_shared/silvioTools.ts` (aggiungere `whatsapp` ai canali di `lista_email_thread`, `cerca_email_intelligente`); nota: `cerca_email_intelligente` degrada senza `authToken` — verificare che funzioni con la chiave di servizio o passare per una RPC.

- [ ] Abilitare i due strumenti sul canale whatsapp; se `cerca_email_intelligente` richiede il token utente, esporre invece una lettura via RPC service-role. Aree: aggiungere «posta» già presente in Demo. commit.

### Task C3: grafici come immagine

**Files:** Create `supabase/functions/grafico-png/index.ts` (rende un PNG da una serie con una lib di charting server-side o SVG→PNG); Create `tools/ufficio/mandami_grafico.ts`.

- [ ] Strumento `mandami_grafico(metrica, periodo)`: prende la serie da `get_serie_grafico`, genera un PNG (server-side), lo carica in storage e lo manda come `document`/immagine. Rischio: subito (è una lettura). commit.

### Task C4: ore dipendente + foto cantiere su WhatsApp

**Files:** Modify `_shared/silvioTools.ts` (canali di `calcola_ore_mese_dipendente`, `get_foto_cantiere_summary`); per rimandare le FOTO serve l'invio immagine in `whatsapp-send` (oggi c'è `document`): aggiungere il tipo `image` (link https), come `document`.

- [ ] Abilitare i due strumenti su whatsapp; aggiungere a `whatsapp-send` il tipo `image` (stesso schema di `document`, con `image:{link}`); strumento `mandami_foto_cantiere(cantiere, quando)` che rimanda le foto. commit.

---

# FASE D — Numero unico che capisce chi scrive

**Files:** Modify `whatsapp-ai-processor/index.ts` (instradamento quando l'identità è `unknown`), riusa `cliente.ts` (assistente clienti) e l'aggancio all'agente lead.

- [ ] Oggi: se `identity.matched=false` va al ramo cliente (se è un contatto/commessa) o «non riconosco». Estendere: se il numero ha un `agent_id` di tipo lead e lo sconosciuto non è un cliente noto → inoltrare all'**agente lead** (come fa `whatsapp-webhook/handlers/lead.ts`). Così un solo numero: dipendente→cantiere, cliente→assistenza, sconosciuto→commerciale.
- [ ] Prova: tre numeri diversi (dipendente, cliente demo, sconosciuto) → tre risposte diverse. commit.

---

## Ordine e dipendenze

1. **E** (motore preventivo interno) → serve ad **A4**.
2. **A0** (leggere i PDF) → serve ad A1/A2/A4.
3. **A1–A5** documenti.
4. **B0 → B1 → B2 → B3 → B4 → B5** proattivo (B5 la schermata per ultima, quando i tipi di routine esistono).
5. **C** e **D** in parallelo, dopo A/B.

Ogni fase è pubblicabile e provabile da sola. Consiglio di partire da **E+A0** (sbloccano i documenti e i preventivi veri) e da **B0+B1** (il primo automatismo, il report del mattino), che è la cosa che il founder chiede per prima.

## Prove trasversali (dal 348, col watcher)

- PDF di un DDT → letto come la foto; PDF di una fattura → bozza fattura passiva.
- Foto di uno scontrino (da operaio) → «per quale cantiere?» → registrato.
- Foto rilievo con misure → misure nel sopralluogo.
- PDF/foto di un computo → 1-3 domande → preventivo col listino → PDF.
- Routine report mattino forzata → arriva il report; to-do operaio → arriva al dipendente di prova.
- Avviso: creare una fattura scaduta finta su Demo → arriva l'avviso.
- Schermata Automazioni: creo, attivo, sospendo una routine senza toccare il codice.

## Autoreview (fatta)

- **Copertura spec:** documenti (A0–A5) ✓, motore proattivo + automazioni configurabili (B0–B5) ✓, esempi del founder — sopralluogo→misure (A3) ✓, computo→preventivo con domande (A4) ✓, DDT (già live) ✓, scontrini dall'operaio (A2) ✓, chiedere i dati mancanti (A5) ✓, report mattino (B1) ✓, messaggio a ogni operaio (B2) ✓, «le automazioni le creo io» (B5) ✓; più uscita/commerciale (C) e numero unico (D).
- **Nomi coerenti:** `chiamataInternaValida`+`per_utente` (E1/A0/C1), `bot_routine`/`routineDaEseguire`/`componiReportMattino`, `tipoDocumento`, `domandeMancanti`, `leggiDocumentoOperativo`.
- **Niente segnaposto:** ogni task dà file esatti e passi concreti; i pezzi novel (classificatore documenti, domande mancanti, routine, report) hanno test di logica pura prima del codice.
- **Trappole richiamate:** finestra 24h/template Meta per il proattivo; ingresso interno solo con chiave di servizio; `deno.lock`; versioni migrazione già prese; gate permessi su ogni canale.
