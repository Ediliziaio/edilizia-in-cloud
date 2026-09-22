# Outreach → Opportunità: intelligenza condivisa email + WhatsApp Locale — Design

## Obiettivo

Oggi l'Outreach Engine (email) classifica già da solo ogni risposta in arrivo
con l'AI (interessato/domanda/non interessato/...), ma si ferma lì: creare
un'opportunità nel CRM resta un passo manuale, senza traccia della fonte.
WhatsApp Locale ha una classificazione simile ma manuale (a bottone). Il
risultato è che chi lavora ogni giorno sull'Outreach Engine non ha un modo
per capire, a colpo d'occhio, "quali risposte calde meritano attenzione ORA"
attraverso i due canali, né sa se una risposta interessata è già diventata
un'opportunità o è ancora lì ad aspettare.

Questo spec chiude il cerchio: una risposta interessata (email o WhatsApp)
diventa un'opportunità tracciata in automatico, la tab "Oggi" diventa la
coda prioritaria reale invece di un log piatto, e lo stesso trattamento si
applica anche allo storico già accumulato — non solo a quello che arriverà
da ora in poi.

## Contesto (cosa esiste già, non lo ricostruiamo)

- **Email — classificazione automatica già funzionante**: [outreach-reply-handler.ts](supabase/functions/_shared/outreach-reply-handler.ts) (`handleInboundReply`, righe 143-292) chiama l'AI (`classifyAndStoreIntent`, righe 370-398, task `outreach_reply_intent` su `aiRouterComplete`) su ogni risposta email in arrivo, scrive `outreach_replies.intent` + `intent_confidence`, ferma la sequenza, crea un task di chiamata entro 24h se interessato/domanda, gestisce disiscrizione. Il fallback a parole chiave ([outreach-intent-parole.ts](supabase/functions/_shared/outreach-intent-parole.ts)) copre i casi in cui l'AI è giù o incerta.
- **WhatsApp Locale — classificazione esistente ma manuale**: [openwa-classifica-risposte/index.ts](supabase/functions/openwa-classifica-risposte/index.ts) si lancia solo a bottone dal report risposte (non a cron), scrive su `openwa_campagna_destinatari.esito` (`appuntamento | da_ricontattare | non_interessato | incerto`). L'esito `'cliente'` (contratto vinto) è deliberatamente escluso dalle etichette assegnabili dall'AI — resta una decisione umana. `openwa-webhook/index.ts` che riceve i messaggi in arrivo oggi è puramente meccanico, nessuna AI.
- **Opportunità**: `marketing_opportunities` ha già un campo `source` testo libero e `contact_id`, ed esistono già più percorsi di creazione automatica (lead Meta, form, automazioni) tutti passati dalla funzione pura condivisa [creaAggiornaOpportunita.ts](supabase/functions/_shared/creaAggiornaOpportunita.ts), che evita di duplicare un'opportunità se il contatto ne ha già una aperta (protezione nata da un bug reale documentato nei commenti del file).
- **Infrastruttura AI**: pattern unico e maturo in [aiRouter.ts](supabase/functions/_shared/aiRouter.ts) (`aiRouterComplete`/`aiRouterPrompt`, routing per `task_key` via tabella `ai_router_config`, tracciamento costo via `chargeAiCall`). Gli strumenti interni della piattaforma (incluso tutto l'Outreach Engine e WhatsApp Locale) usano `companyId: PLATFORM_COMPANY` + `skipCharge: true` — nessun costo reale, nessun rischio di blocco per saldo.
- **Tab "Oggi"**: esiste già come prima tab dell'hub (`src/pages/admin/marketing/AdminMarketingDashboard.tsx`), pensata esplicitamente come cockpit "cosa richiede azione oggi" (sezione "Da leggere & attività"). Oggi mostra `OutreachInboxPreview` (ultime email non lette, senza ordinamento per intento) + `OutreachActivityFeed` (log piatto: opportunità create, contatti aggiunti, risposte arrivate, tutti allo stesso livello, **zero consapevolezza di WhatsApp**).

## Confini

**Dentro lo scope:**
- Solo l'Outreach Engine interno alla piattaforma (dati scoped a `company_id` piattaforma) e WhatsApp Locale — entrambi strumenti ad uso esclusivo di super_admin/collaboratori, mai esposti alle aziende clienti.
- Estensione della classificazione email esistente per generare opportunità.
- Passaggio della classificazione WhatsApp da manuale ad automatica all'arrivo del messaggio.
- Nuova coda prioritaria unificata nella tab "Oggi".
- Backfill una tantum dello storico (risposte già arrivate, classificate o no).
- Funnel completo nella tab "Statistiche".

**Fuori scope (esplicitamente):**
- Client email aziendale dei clienti (`src/pages/azienda/email/*`) e canale WhatsApp Meta ufficiale (`AdminWhatsApp.tsx`) — sistemi diversi, non toccati.
- Canale SMS (Telnyx) — mai menzionato dall'utente, nessuna esplorazione fatta; resta fuori.
- Coda di approvazione umana prima della creazione opportunità — scartata esplicitamente: la creazione è sempre automatica.
- Banner di insight AI in stile `crm-ai-insights` sulla tab Statistiche — buona estensione naturale, ma è Fase 2 separata: non fa parte di questa implementazione.
- Redesign visivo delle tab Sequenze/Lead & Liste/Deliverability — invariate.

## Decisioni vincolanti

1. **Creazione opportunità: sempre automatica.** Nessun passaggio di conferma umana. Un errore dell'AI produce comunque un'opportunità normale, visibile e modificabile/eliminabile come tutte le altre nel CRM — non un problema nascosto.
2. **WhatsApp Locale: classificazione automatica all'arrivo del messaggio**, stesso comportamento dell'email. Il bottone manuale resta, per riclassificare un caso dubbio.
3. **La coda prioritaria unificata vive dentro la tab "Oggi"** (non una tab nuova, non solo un rimando incrociato) — è già il primo posto in cui si guarda.
4. **Il backfill copre anche lo storico mai classificato**, non solo le risposte già taggate "interessato"/"appuntamento" senza opportunità collegata.
5. **Un'unica funzione condivisa decide "questo segnale crea un'opportunità?"** per entrambi i canali, cosicché la politica non diverga nel tempo tra email e WhatsApp.

## Mappatura segnale → azione

| Email (`outreach_replies.intent`) | WhatsApp (`esito`) | Azione |
|---|---|---|
| `interested` | `appuntamento` | Crea opportunità (automatico) + task chiamata ≤24h (già esistente lato email, da replicare lato WhatsApp) |
| `question` | `da_ricontattare` | Task chiamata ≤24h, **nessuna** opportunità automatica (segnale troppo debole da solo) — visibile comunque nella coda calda |
| `not_interested` / `unsubscribe` / `auto_reply` / `other` | `non_interessato` / `incerto` | Nessuna azione automatica, solo storico |
| — | `'cliente'` | Invariato: assegnabile solo da un umano, l'AI non lo scrive mai |

## Modello dati

Due colonne nullable su `marketing_opportunities`, additive e non distruttive:

```sql
alter table public.marketing_opportunities
  add column if not exists source_ref_table text,
  add column if not exists source_ref_id uuid;

alter table public.marketing_opportunities
  drop constraint if exists marketing_opportunities_source_ref_table_check;
alter table public.marketing_opportunities
  add constraint marketing_opportunities_source_ref_table_check
  check (source_ref_table is null or source_ref_table in ('outreach_replies', 'openwa_campagna_destinatari'));
```

`source_ref_table` + `source_ref_id` puntano alla riga esatta (email o
WhatsApp) che ha generato l'opportunità — niente FK reale perché sono due
tabelle diverse, ma bastano per un link "vai al messaggio originale" in UI.
Il campo `source` esistente (testo libero) si valorizza con `outreach_email`
o `outreach_whatsapp` per i due percorsi automatici, invece di restare vuoto
come fa oggi il bottone manuale (`OutreachConvertContactDialog.tsx`).

## Funzione condivisa di trigger

**Correzione dopo lettura del codice reale**: `creaAggiornaOpportunita.ts`
NON contiene la logica di creazione — solo funzioni pure di formattazione
testo (nome pulito, nota di aggiornamento, unione tag). La logica vera
(insert + verifica di un'opportunità già aperta per il contatto) vive oggi
solo dentro il motore automazioni (`process-automation/index.ts`), dove
`pipeline_id`/`stage_id` sono **configurati sul nodo del flusso** da chi
costruisce l'automazione — non esiste una "pipeline di default" risolta in
automatico (`marketing_pipelines` non ha un flag del genere, solo un campo
`position` per l'ordinamento).

Nuovo modulo `supabase/functions/_shared/outreach-opportunity-trigger.ts`,
usato da entrambi i canali:

- `shouldCreateOpportunity(channel: "email" | "whatsapp", label: string): boolean`
  — implementa la tabella di mappatura sopra, un solo posto da aggiornare se la
  politica cambia.
- `triggerOpportunityFromSignal(...)` — logica vera e propria: verifica se il
  contatto ha già un'opportunità aperta (stesso principio anti-doppioni già
  visto nel motore automazioni); se no, risolve pipeline/stage con una regola
  semplice ed esplicita — la pipeline con `position` più basso per la
  piattaforma, e al suo interno lo stage con `position` più basso (lo stage
  "di ingresso") — e inserisce l'opportunità con `source`/`source_ref_table`/
  `source_ref_id` valorizzati. Tutto in try/catch best-effort: un fallimento
  nella creazione dell'opportunità non deve mai far fallire la gestione della
  risposta stessa (stesso principio già applicato alle chiamate AI in
  `outreach-reply-handler.ts`).

## Flusso backend — email (estensione minima)

In `outreach-reply-handler.ts`, subito dopo che `classifyAndStoreIntent`
scrive `intent`, aggiungere una chiamata a `triggerOpportunityFromSignal`.
Nessuna modifica al resto della logica esistente (stop sequenza, task
chiamata, blocklist su disiscrizione restano come sono).

## Flusso backend — WhatsApp (da bottone a automatico)

**Correzione dopo lettura del codice reale**: `openwa-webhook/index.ts` oggi
NON risponde velocemente — fa già, in modo sincrono, un bel po' di lavoro
dopo l'insert del messaggio (aggiorna lo stato conversazione, opt-out,
evento per le automazioni, avviso al titolare, motore regole con possibile
AI per l'auto-risposta), ognuno nel proprio try/catch che logga e continua.
Introdurre qui un pattern nuovo (`waitUntil`) sarebbe incoerente con come il
file è scritto oggi. La classificazione + il trigger opportunità si
aggiungono quindi **nello stesso stile**: un passo sincrono in più, alla
fine, subito prima della risposta finale, con lo stesso try/catch
best-effort di tutti gli altri passi del file.

Il punto d'aggancio è subito dopo la chiamata RPC `openwa_campagna_segna_risposta`
(che già marca `stato='risposto'` sul destinatario di ogni campagna attiva
per quel contatto): da lì si recuperano i destinatari appena diventati
`stato='risposto' AND esito IS NULL` per quel contatto e si classificano.
Una volta scritto `esito`, la stessa `triggerOpportunityFromSignal` decide
se creare l'opportunità. Il bottone manuale esistente resta invariato per
la riclassificazione puntuale (userà la stessa funzione condivisa di
classificazione, non una copia).

## Storico — backfill una tantum

Operazione singola (script/edge invocata una volta durante il rollout, non
una funzionalità permanente in UI — non serve un bottone stabile per un
lavoro che si fa una volta sola):

1. Trova le risposte email e i messaggi WhatsApp **senza classificazione**
   (`intent is null` / `esito is null`) e li fa passare dalla classificazione
   AI esistente (stessa funzione, stesso task key — non se ne inventa una
   nuova).
2. Passa **ogni** risposta/messaggio con un segnale che vale creazione
   opportunità (nuovo o già classificato in passato) dalla stessa
   `triggerOpportunityFromSignal` usata dal flusso live — la protezione
   anti-doppioni di `creaAggiornaOpportunita.ts` garantisce che un contatto
   con un'opportunità già aperta non ne riceva una seconda.
3. A lotti (non un'unica transazione gigante, per lo stesso motivo per cui
   CLAUDE.md raccomanda cautela sulle scritture massive), con un riepilogo
   finale: quante risposte classificate ex novo, quante opportunità create,
   quante saltate perché il contatto ne aveva già una aperta.

Il volume atteso è modesto (decine, non decine di migliaia — i numeri visti
nelle campagne reali sono a una o due cifre di risposte "interessate"), ma il
lotto e il riepilogo restano comunque una buona pratica anche a volumi
piccoli: permettono di verificare il risultato invece di doverlo dedurre.

## UI — "Oggi": coda calda unificata

Oggi la sezione "Da leggere & attività" di "Oggi" mostra due riquadri
affiancati: `OutreachInboxPreview` (ultime email non lette, senza
ordinamento per intento) e `OutreachActivityFeed` (log piatto, cieco su
WhatsApp). Un messaggio non letto ma "auto_reply" non merita priorità, e una
risposta interessata già letta da qualcuno la merita ancora finché non è
stata gestita — quindi "non letto" è il criterio sbagliato. Il nuovo
componente **sostituisce entrambi i riquadri** con un'unica lista, che
interroga in parallelo:

- `outreach_replies` filtrata su `intent in ('interested','question')`
- `openwa_campagna_destinatari` (join `openwa_messages`) filtrata su
  `esito in ('appuntamento','da_ricontattare')`

Uniti lato client (due query leggere, niente vista SQL cross-schema per
questa prima versione — YAGNI finché il volume non lo richiede), ordinati
per calore (interessato/appuntamento prima, poi domanda/da ricontattare, più
recenti in cima in ciascun gruppo). Ogni riga: icona canale, contatto,
frammento del messaggio, badge intento, e a destra:
- **"✅ Opportunità creata"** con link diretto, se `source_ref_id` la collega, oppure
- pulsante manuale di fallback (riusa `OutreachConvertContactDialog`) per i
  rari casi in cui la scelta dell'AI viene corretta a mano.

Stato vuoto: "Tutto sotto controllo" (stesso tono già in uso in
`OutreachInboxPreview`).

## UI — segnali dove già si guarda

- Pipeline email (componente `CampagnaPipeline`, dentro
  `src/components/admin/outreach/campagne/`): chip "🤖 Opportunità creata"
  con link, accanto all'etichetta di intento già mostrata.
- Report risposte WhatsApp (`RisposteCampagna.tsx`): stesso chip.

## Analisi — funnel completo in Statistiche

Nuova sezione nella tab "Statistiche" (`CampagnaStatistiche`): funnel
Contattati → Risposte → Interessati/Appuntamenti → Opportunità create →
Vinte, calcolato attraverso entrambi i canali. Diventa possibile con
precisione solo ora, perché `source_ref_id`/`source_ref_table` collegano
ogni opportunità alla risposta esatta che l'ha generata — prima non c'era
modo di distinguere un'opportunità "nata da una risposta calda" da una
inserita a mano.

## Sicurezza ed errori

- **Falsi positivi**: accettati per scelta esplicita (decisione vincolante
  1) — un'opportunità sbagliata è visibile e gestibile come le altre, non un
  rischio nascosto.
- **AI giù su WhatsApp**: qui NON esiste (né prima né dopo questo lavoro) un
  fallback a parole chiave come sull'email — un errore AI lascia il
  destinatario "incerto"/senza esito, riprovabile in seguito (a mano dal
  bottone, o al prossimo messaggio della stessa persona). Nessun messaggio
  va perso, nessuna azione sbagliata parte: il comportamento è lo stesso,
  sicuro, già in produzione oggi per la classificazione manuale.
- **Doppioni**: stessa query di verifica ("il contatto ha già un'opportunità
  aperta?") usata in un solo punto (la funzione condivisa di trigger), non
  duplicata tra i due canali.
- **`'cliente'`**: invariato, resta l'unico esito che l'AI non assegna mai —
  vincolo già presente nel codice, non toccato da questo lavoro.

## Test e rollout

- Gate standard del progetto: eslint + `vite build` (heap 6144) + `tsc
  --noEmit`; migrazione idempotente applicata via MCP `apply_migration` poi
  riallineata come da CLAUDE.md.
- Verifica manuale: una risposta email simulata con intento "interessato" →
  opportunità visibile con `source='outreach_email'` e badge in "Oggi"; un
  messaggio WhatsApp in arrivo → classificazione automatica → stesso
  risultato lato `outreach_whatsapp`.
- Il passaggio della classificazione WhatsApp da bottone a automatica cambia
  un'abitudine per chi usa oggi quel bottone — da segnalare in una riga nel
  commit, non un problema ma va detto.
- Resta tutto locale (commit locali, nessuna migrazione/deploy su prod)
  finché non arriva un "pusha"/"deploya" esplicito.
