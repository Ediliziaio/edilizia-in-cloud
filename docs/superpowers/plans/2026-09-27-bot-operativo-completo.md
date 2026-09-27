# Bot operativo WhatsApp completo — Fase 0 e Fase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chi scrive al numero «bot operativo» di un'azienda viene riconosciuto col suo ruolo vero nell'app (operaio, ufficio, amministratore) e da WhatsApp fa quello che fa con Silvio: rapportini a voce, DDT fotografati che caricano il magazzino, foto di cantiere, domande sui numeri, preventivi e ordini, con i bottoni Sì/No prima di ogni azione che scrive dati.

**Architecture:** la **Fase 0** ripara il bot che c'è (`supabase/functions/whatsapp-ai-processor`): identità sui ruoli veri, bot spento che resta spento, lettura delle foto, DDT confermato che carica davvero il magazzino, conferma legata all'azione proposta. La **Fase 1** collega il bot al registro strumenti di Silvio (`_shared/silvioTools.ts` + `_shared/silvioToolExecution.ts`) come fa già `telegram-bot-processor`: gli strumenti del bot restano per i file appena arrivati (foto, vocali, DDT); quelli di Silvio arrivano per area con `carica_strumenti`, e le sue azioni «gialle» si confermano coi bottoni in chat invece che solo nell'app.

**Tech Stack:** Supabase Edge Functions (Deno), Postgres (plpgsql), Vitest per la logica pura (`src/test/logic`, importa da `supabase/functions/_shared` file senza import URL), Meta WhatsApp Cloud API tramite `whatsapp-send`.

---

## Dove sta nella strada generale

È la voce «Cantiere» della Fase 4 di [`2026-09-25-piattaforma-agenti-roadmap.md`](2026-09-25-piattaforma-agenti-roadmap.md), anticipata perché il founder vuole sostituire Silvio sul telefono degli operai e dell'ufficio. Le fasi dopo questa avranno ciascuna il suo piano:

| Fase | Cosa | Piano |
|---|---|---|
| 0 | Riparazioni: ruoli veri, bot spento, foto, DDT → magazzino, conferma legata | **questo** |
| 1 | Un cervello solo: strumenti di Silvio sul bot, permessi per ruolo, conferme in chat | **questo** |
| 2 | Preventivi da WhatsApp (testo/vocale/foto → bozza con listino e manodopera → PDF in chat). `ai-genera-preventivo-v2` oggi vuole il token utente: serve un ingresso interno | da scrivere |
| 3 | Magazzino: carico/scarico a voce o foto, DDT in PDF (oggi il PDF non viene letto), articoli da abbinare | da scrivere |
| 4 | Domande sui numeri per l'ufficio (incassi, commesse, scadenze); sistemare `stato_cantiere` che dà margine 100% | da scrivere |
| 5 | Il bot scrive per primo: promemoria rapportino con template UTILITY (oggi testo libero, fuori finestra fallisce), briefing del mattino, allarme segnalazioni urgenti, operai senza account (`campo_rapportini` vuole `user_id`) | da scrivere |
| 6 | Numero unico che smista per chi scrive (dipendente → operativo, cliente → assistenza, sconosciuto → agente lead); collaudo per ruolo | da scrivere |

## Ambiente di prova (preparato il 27/09/2026)

- Numero **+39 351 361 1676** — `ai_whatsapp_numbers.id = ed9dfae3-2d9e-46b6-9157-949d79ee8e1b`, spostato dalla piattaforma a **Demo Azienda 2** (`d2000000-0000-4000-a000-000000000002`), `purpose = bot_operativo`, `operational_settings = {bot_enabled:true, ai_auto_process:true, daily_rapportino_enabled:false, unknown_worker_mode:"block"}` (promemoria spento: gli operai demo hanno numeri inventati).
- Tester: scheda dipendente **Florin Andriciuc** `employees.id = bbccf2c7-5927-43fe-93f7-b3ba7fd844af`, `phone_whatsapp = 393483467567`, `role_type = operaio`, collegata all'utente `e592255e-0c82-86cd-7f7b-d3046317f9cd` (`demo2@azienda.srl`, ruolo `company_admin`). `profiles.phone` dello stesso utente = `+393483467567`.
- Per il ramo operaio: **Marco Operaio** `employees.id = 06cfbe38-161e-2882-caad-837603c6b35a`, utente `f1a86184-73aa-7342-fb8d-5d41deff0197` (ruolo `employee`).
- Watcher dei messaggi (scratchpad della sessione): `watch-bot-operativo.sh` — una riga per messaggio/stato sul numero e per ogni `wa_routing_errors` del suo `phone_number_id` `1076592968881625`.

## Stato al 27/09/2026 (esecuzione)

Fase 0 e Fase 1 scritte sul ramo `bot-operativo-completo` (non pubblicato). In più rispetto ai task qui sotto, emerso dalle prove:
- **Smistamento**: le parole chiave si cercavano DENTRO le parole («si» in «situazione»): una domanda del founder a voce era stata presa per «conferma». Ora parole intere (≤3 lettere) o inizio di parola (`operationalTriage.ts`, test `triageBotOperativo.test.ts`).
- **Sì a voce**: la conferma guardava «[Audio]» e non la trascrizione; ora vale anche il sì detto in un vocale.
- **Letture da titolare su WhatsApp**: `lista_lavori_pose_periodo`, `get_revenue_forecast`, `get_cashflow_status`, `get_executive_snapshot` abilitate sul canale (erano escluse: «situazione dei lavori nelle prossime due settimane» non aveva risposta).
- **Area «cantieri» sempre a bordo** del bot (il catalogo base di Silvio non la comprende).
- **Agente configurabile** (richiesta del founder: creare AI operativi con prompt e regole proprie senza codice): scheda `ai_agents_v2` (tipo `whatsapp`, `tools_config.operativo`) collegata col `agent_id` del numero; istruzioni dell'azienda (`system_prompt`), per ruolo, aree iniziali, strumenti vietati, temperatura. Logica in `_shared/agenteOperativoConfig.ts` (test in `botOperativoCatalogo.test.ts`). Scheda di Demo Azienda 2 pronta in `scratchpad/agente-operativo-demo2.sql` (provata a vuoto).
- **Controllo tipi delle edge**: `deno` non è installato; si usa il pacchetto npm ufficiale nella cartella di sessione + confronto errori prima/dopo contro `origin/main` (script `deno-diff.sh`). Processore 7 → 7, webhook 2 → 2.

**Ordine di pubblicazione (dopo l'ok):** 1) rebase su `origin/main`; 2) `apply_migration conferma_carico_ddt` + riallineo versione; 3) push → CI (ridistribuisce anche le funzioni che importano `silvioTools.ts`); 4) SQL della scheda agente Demo 2; 5) watcher acceso e prove dal 348, prima fra tutte la domanda vocale sui lavori delle prossime due settimane.

## Regole che valgono per ogni task

- **Nessun `git push` su `main` senza l'ok esplicito del founder** (auto-deploy in produzione).
- Migrazioni: SQL idempotente, applicata con `apply_migration` (MCP), poi versione riallineata:
  `update supabase_migrations.schema_migrations set version='<versione del file>' where name='<nome>' and left(version,4)='2026';`. Mai `supabase db push`.
- Funzioni SQL nuove: `revoke all … from public, anon` + grant espliciti.
- Edge: la CI fa il bundle con esbuild e non controlla i tipi Deno. Prima e dopo ogni modifica si conta `deno check` sul file toccato: **il numero di errori non deve crescere** (ci sono errori storici dei generici di supabase-js).
- Prima di dire «pronto»: `node scripts/typecheck-ratchet.mjs` sullo stato finale, i test toccati, `npm run build`, e la **prova vera dal 348 346 7567** (regola del founder: ogni automazione si prova con un messaggio vero prima di attivarla).
- Testi che vede l'utente: niente termini tecnici (token, sync, errori grezzi). Frasi semplici.

## Mappa dei file

| File | Ruolo | Task |
|---|---|---|
| `supabase/functions/_shared/botOperativoRuoli.ts` (nuovo) | Logica pura: stesso numero, tipo di utente dai ruoli | 1 |
| `src/test/logic/botOperativoRuoli.test.ts` (nuovo) | Test Vitest della logica sopra | 1 |
| `supabase/functions/whatsapp-ai-processor/identity.ts` | Chi scrive: dipendente o utente dell'app, coi ruoli veri | 2 |
| `supabase/functions/whatsapp-ai-processor/tools/shared/types.ts` | `kind` nuovo: operaio / ufficio / admin | 2 |
| `supabase/functions/whatsapp-ai-processor/prompts/system_ufficio.ts` (nuovo) | Prompt per ufficio e amministratore | 2 |
| `supabase/functions/whatsapp-ai-processor/index.ts` | Orchestrazione del turno | 2, 3, 6, 10, 11 |
| `supabase/functions/whatsapp-webhook/handlers/bot_operativo.ts` | Bot spento → messaggio chiuso subito | 3 |
| `supabase/functions/whatsapp-ai-processor/media.ts` | Nome modello per la foto | 4 |
| `supabase/functions/whatsapp-ai-processor/prompts/system_operaio.ts` | Etichetta vera del DDT letto | 4 |
| `supabase/migrations/20280927230000_conferma_carico_ddt.sql` (nuovo) | `conferma_carico_ddt()`: ricezione + movimenti + giacenza | 5 |
| `src/lib/email-ai/hooks.ts` | La conferma dall'app usa la funzione | 5 |
| `supabase/functions/whatsapp-ai-processor/tools/operaio/carica_ddt.ts` | Da ufficio/admin il Sì carica subito | 5 |
| `supabase/functions/_shared/botOperativoConferme.ts` (nuovo) | Logica pura: domanda in attesa, aree caricate, scadenze | 6 |
| `src/test/logic/botOperativoConferme.test.ts` (nuovo) | Test | 6 |
| `supabase/functions/whatsapp-ai-processor/tools/shared/chiedi_conferma.ts` | Parametro `azione` | 6 |
| `supabase/functions/_shared/botOperativoCatalogo.ts` (nuovo) | Logica pura: strumenti del bot vs Silvio, doppioni | 8 |
| `src/test/logic/botOperativoCatalogo.test.ts` (nuovo) | Test | 8 |
| `supabase/functions/_shared/silvioTools.ts` | `carica_strumenti` anche su WhatsApp | 9 |
| `supabase/functions/whatsapp-ai-processor/silvio.ts` (nuovo) | Ponte verso il registro di Silvio + proposte | 10 |

---

# FASE 0 — Riparazioni

### Task 0: Fotografia di partenza

**Files:** nessuno.

- [ ] **Step 1: Contare gli errori Deno storici**

Dalla radice del repository:
```bash
for f in whatsapp-ai-processor/index.ts whatsapp-webhook/index.ts _shared/silvioTools.ts; do
  printf "%s: " "$f"; deno check "supabase/functions/$f" 2>&1 | grep -c "\[ERROR\]"
done
```
Annotare i tre numeri in fondo a questo file (sezione «Baseline»). Sono il tetto da non superare.

- [ ] **Step 2: Test esistenti verdi**

Run: `npx vitest run src/test/logic/funzioniChiamateSenzaJwt.test.ts`
Expected: PASS (tocca la lista delle funzioni del bot).

---

### Task 1: Logica pura «stesso numero» e «che tipo di utente»

Oggi `identity.ts` riconosce come amministratori solo i ruoli `titolare/admin/proprietario`, che in `app_role` non esistono: un `company_admin` non passa mai. E confronta i numeri salvati senza normalizzarli (`0039…` non combacia).

**Files:**
- Create: `supabase/functions/_shared/botOperativoRuoli.ts`
- Test: `src/test/logic/botOperativoRuoli.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// src/test/logic/botOperativoRuoli.test.ts
import { describe, expect, it } from "vitest";
import {
  chiaveTelefono,
  eUtenteInterno,
  stessoTelefono,
  tipoUtenteBot,
} from "../../../supabase/functions/_shared/botOperativoRuoli";

describe("bot operativo: lo stesso numero scritto in modi diversi", () => {
  it("combacia con prefisso, spazi, 0039", () => {
    expect(stessoTelefono("+39 348 346 7567", "393483467567")).toBe(true);
    expect(stessoTelefono("00393483467567", "348 3467567")).toBe(true);
  });
  it("numeri diversi, vuoti o troppo corti non combaciano", () => {
    expect(stessoTelefono("+39 348 346 7567", "+39 348 346 7568")).toBe(false);
    expect(stessoTelefono("", "")).toBe(false);
    expect(stessoTelefono("12345", "12345")).toBe(false);
    expect(chiaveTelefono(null)).toBe("");
  });
});

describe("bot operativo: che poteri ha chi scrive", () => {
  it("amministratore dell'azienda e super admin sono admin", () => {
    expect(tipoUtenteBot(["company_admin"], true)).toBe("admin");
    expect(tipoUtenteBot(["super_admin"], true)).toBe("admin");
  });
  it("chi lavora in ufficio è ufficio, anche con un ruolo in più", () => {
    expect(tipoUtenteBot(["company_staff"], true)).toBe("ufficio");
    expect(tipoUtenteBot(["salesperson", "employee"], true)).toBe("ufficio");
    expect(tipoUtenteBot(["accountant"], true)).toBe("ufficio");
  });
  it("dipendenti, subappaltatori e chi non ha account restano operai", () => {
    expect(tipoUtenteBot(["employee"], true)).toBe("operaio");
    expect(tipoUtenteBot(["subcontractor"], true)).toBe("operaio");
    expect(tipoUtenteBot([], true)).toBe("operaio");
    expect(tipoUtenteBot(["company_admin"], false)).toBe("operaio");
  });
  it("un cliente o un segnalatore non è un utente interno", () => {
    expect(eUtenteInterno(["customer"])).toBe(false);
    expect(eUtenteInterno(["referrer"])).toBe(false);
    expect(eUtenteInterno([])).toBe(false);
    expect(eUtenteInterno(["customer", "company_staff"])).toBe(true);
    expect(eUtenteInterno(["employee"])).toBe(true);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run src/test/logic/botOperativoRuoli.test.ts`
Expected: FAIL — `Failed to resolve import ".../botOperativoRuoli"`.

- [ ] **Step 3: Scrivere il modulo**

```ts
// supabase/functions/_shared/botOperativoRuoli.ts
/**
 * Chi scrive al bot operativo e con quali poteri (27/09/2026).
 *
 * Il bot riconosceva come amministratori solo ruoli che non esistono
 * (titolare, admin, proprietario): un amministratore vero (company_admin)
 * non passava mai. La regola sta qui, senza database, così si prova.
 */

export type TipoUtenteBot = "operaio" | "ufficio" | "admin";

/** Chi amministra l'azienda: può tutto, come nell'app. */
const RUOLI_ADMIN = ["super_admin", "company_admin"];
/** Chi lavora in ufficio: quello che i suoi permessi gli lasciano. */
const RUOLI_UFFICIO = ["accountant", "salesperson", "call_center", "company_staff"];
/** Chi lavora per l'azienda (gli altri, clienti e segnalatori, non usano il bot operativo). */
const RUOLI_INTERNI = [...RUOLI_ADMIN, ...RUOLI_UFFICIO, "employee", "subcontractor", "worker"];

/**
 * Le ultime 9 cifre: +39 348 346 7567, 00393483467567 e 348 3467567 danno
 * la stessa chiave. È la regola della finestra delle 24 ore (whatsappWindow.ts).
 * Sotto le 9 cifre non è un cellulare: chiave vuota, non combacia con niente.
 */
export function chiaveTelefono(telefono: string | null | undefined): string {
  const cifre = String(telefono ?? "").replace(/\D/g, "");
  return cifre.length >= 9 ? cifre.slice(-9) : "";
}

export function stessoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const chiave = chiaveTelefono(a);
  return chiave !== "" && chiave === chiaveTelefono(b);
}

export function eUtenteInterno(ruoli: readonly string[]): boolean {
  return ruoli.some((r) => RUOLI_INTERNI.includes(r));
}

/**
 * Il tipo di utente per il bot. Senza account nell'app si resta operaio:
 * gli strumenti d'ufficio agiscono a nome di un utente e dei suoi permessi.
 */
export function tipoUtenteBot(ruoliNellAzienda: readonly string[], haAccount: boolean): TipoUtenteBot {
  if (!haAccount) return "operaio";
  if (ruoliNellAzienda.some((r) => RUOLI_ADMIN.includes(r))) return "admin";
  if (ruoliNellAzienda.some((r) => RUOLI_UFFICIO.includes(r))) return "ufficio";
  return "operaio";
}
```

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run src/test/logic/botOperativoRuoli.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/botOperativoRuoli.ts src/test/logic/botOperativoRuoli.test.ts
git commit -m "Bot operativo: regola unica per riconoscere numero e ruolo di chi scrive"
```

---

### Task 2: Identità sui ruoli veri (operaio / ufficio / admin)

**Files:**
- Modify: `supabase/functions/whatsapp-ai-processor/identity.ts` (intero file)
- Modify: `supabase/functions/whatsapp-ai-processor/tools/shared/types.ts:15`
- Create: `supabase/functions/whatsapp-ai-processor/prompts/system_ufficio.ts`
- Modify: `supabase/functions/whatsapp-ai-processor/index.ts:387-403` e `:452-455`

- [ ] **Step 1: Riscrivere `identity.ts`**

Sostituire l'intero file con:

```ts
// Chi sta scrivendo al bot operativo (27/09/2026).
//
// 1) Dipendente col telefono (employees.phone_whatsapp | phone): se ha un
//    account, i suoi ruoli in QUESTA azienda decidono operaio/ufficio/admin.
// 2) Utente dell'app col telefono nel profilo, senza scheda dipendente
//    (tipico: il titolare, l'impiegata): serve un ruolo interno qui.
// Prima si cercavano ruoli inesistenti (titolare, admin, proprietario) e un
// company_admin non veniva mai riconosciuto.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ruoliNellAzienda } from "../_shared/amministraAzienda.ts";
import { ruoloPrincipaleSilvio } from "../_shared/ruoloSilvio.ts";
import {
  chiaveTelefono,
  eUtenteInterno,
  stessoTelefono,
  tipoUtenteBot,
  type TipoUtenteBot,
} from "../_shared/botOperativoRuoli.ts";

export interface ResolvedIdentity {
  matched: boolean;
  kind: TipoUtenteBot | "unknown";
  user_id: string | null;
  employee_id: string | null;
  display_name: string | null;
  role_grants: string[];
  /** Il ruolo con cui lo trattano gli strumenti di Silvio; null = nessun account. */
  ruolo_silvio: string | null;
  company_id: string;
  locale: "it" | "en";
}

const GRANTS_OPERAIO = [
  "rapportino.write",
  "rapportino.read_own",
  "ddt.write",
  "foto.write",
  "presenze.write",
  "segnalazione.write",
  "cantieri.list_assigned",
  "cantieri.read_assigned",
];

const GRANTS_TITOLARE = [
  "cantieri.read_all",
  "cantieri.list_all",
  "marginalita.read",
  "fatture.read",
  "scadenze.read",
  "costi.read",
  "rapportini.read_all",
  "ddt.read_all",
  "approvazioni.list",
  "approvazioni.write",
];

/** Ufficio e admin fanno anche tutto quello che fa un operaio. */
function grantsPer(tipo: TipoUtenteBot): string[] {
  return tipo === "admin" ? [...GRANTS_OPERAIO, ...GRANTS_TITOLARE] : GRANTS_OPERAIO;
}

function unknownResult(companyId: string): ResolvedIdentity {
  return {
    matched: false,
    kind: "unknown",
    user_id: null,
    employee_id: null,
    display_name: null,
    role_grants: [],
    ruolo_silvio: null,
    company_id: companyId,
    locale: "it",
  };
}

function riconosciuto(
  companyId: string,
  tipo: TipoUtenteBot,
  dati: { user_id: string | null; employee_id: string | null; display_name: string; ruoli: string[] },
): ResolvedIdentity {
  if (tipo === "admin") {
    console.warn("[whatsapp-identity][SECURITY] poteri ADMIN concessi dal numero di telefono",
      JSON.stringify({ company_id: companyId, user_id: dati.user_id, employee_id: dati.employee_id }));
  }
  return {
    matched: true,
    kind: tipo,
    user_id: dati.user_id,
    employee_id: dati.employee_id,
    display_name: dati.display_name,
    role_grants: grantsPer(tipo),
    ruolo_silvio: dati.ruoli.length > 0 ? ruoloPrincipaleSilvio(dati.ruoli) : null,
    company_id: companyId,
    locale: "it",
  };
}

export async function resolveIdentity(
  supabase: SupabaseClient,
  fromPhone: string,
  companyId: string,
): Promise<ResolvedIdentity> {
  if (!chiaveTelefono(fromPhone)) return unknownResult(companyId);

  // 1) Dipendente col telefono.
  const { data: employees } = await supabase
    .from("employees")
    .select("id, user_id, first_name, last_name, phone_whatsapp, phone")
    .eq("company_id", companyId)
    .eq("is_active", true);
  const dip = (employees ?? []).find((e) =>
    stessoTelefono(e.phone_whatsapp, fromPhone) || stessoTelefono(e.phone, fromPhone)
  );
  if (dip) {
    const ruoli = dip.user_id ? await ruoliNellAzienda(supabase, dip.user_id, companyId) : [];
    return riconosciuto(companyId, tipoUtenteBot(ruoli, !!dip.user_id), {
      user_id: dip.user_id,
      employee_id: dip.id,
      display_name: `${dip.first_name ?? ""} ${dip.last_name ?? ""}`.trim() || "Operaio",
      ruoli,
    });
  }

  // 2) Utente dell'app col telefono nel profilo (i clienti hanno un profilo
  //    anche loro: senza un ruolo interno qui non entrano).
  const { data: profili } = await supabase
    .from("profiles")
    .select("id, phone, first_name, last_name, full_name")
    .eq("company_id", companyId)
    .not("phone", "is", null);
  const prof = (profili ?? []).find((p) => stessoTelefono(p.phone, fromPhone));
  if (prof) {
    const ruoli = await ruoliNellAzienda(supabase, prof.id, companyId);
    if (eUtenteInterno(ruoli)) {
      return riconosciuto(companyId, tipoUtenteBot(ruoli, true), {
        user_id: prof.id,
        employee_id: null,
        display_name: prof.full_name || `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Utente",
        ruoli,
      });
    }
  }

  return unknownResult(companyId);
}
```

Limite noto (va nel piano della Fase 6): lo staff che lavora su due aziende ha il profilo sull'altra; qui si trova solo con la scheda dipendente.

- [ ] **Step 2: Aggiornare il tipo `kind` nel contesto strumenti**

In `tools/shared/types.ts:15` sostituire:

```ts
  kind: "operaio" | "titolare" | "admin" | "unknown";
```
con:
```ts
  kind: "operaio" | "ufficio" | "admin" | "unknown";
```

- [ ] **Step 3: Prompt per ufficio e amministratore**

```ts
// supabase/functions/whatsapp-ai-processor/prompts/system_ufficio.ts
// Prompt per chi lavora in ufficio o amministra l'azienda (27/09/2026).
// Fa tutto quello che fa un operaio (rapportini, DDT, foto, segnalazioni) e
// in più chiede numeri e fa azioni d'ufficio: prima il bot gli dava solo la
// lettura (prompt «titolare», che non conosceva DDT e rapportini).

export function promptUfficio(opts: { tipo: "ufficio" | "admin"; nome: string | null }): string {
  const chi = opts.tipo === "admin" ? "l'amministratore dell'azienda" : "una persona dell'ufficio";
  return `Sei Silvio, l'assistente di Edilizia in Cloud, su WhatsApp. Parli con ${chi}${opts.nome ? ` (${opts.nome})` : ""}.

COSA PUÒ FARE DA QUI:
- tutto quello che fa un operaio: rapportini (anche a voce, il vocale ti arriva già trascritto), DDT fotografati, foto di cantiere, segnalazioni;
- domande su commesse, incassi, scadenze, magazzino e persone, e azioni d'ufficio, sempre nei limiti dei suoi permessi nell'app.

REGOLE:
1. È al telefono: risposte brevi e ordinate. Numeri in formato italiano (€ 12.500,00; 7,5 ore).
2. Mai inventare dati. Se uno strumento non trova niente, dillo in una riga.
3. Prima di scrivere o cambiare dati riassumi cosa farai e chiedi conferma con chiedi_conferma (bottoni Sì/No), mettendo in «azione» il nome dello strumento che userai dopo il Sì. Poi fermati: la risposta arriva col prossimo messaggio.
4. DDT: quando nel messaggio trovi «[Foto di un DDT — dati letti dal documento]», mostra fornitore, numero, data e righe, chiedi conferma (azione: carica_ddt) e dopo il Sì chiama carica_ddt con quei dati. Da ${chi} la conferma carica subito il magazzino.
5. Se scrive più cose insieme («8 ore da Rossi e foto del tetto»), usa più strumenti.
6. Mai chiedere password, carte o dati bancari.`;
}
```

- [ ] **Step 4: Usare il nuovo prompt e il nuovo `kind` in `index.ts`**

Aggiungere l'import accanto agli altri prompt (riga ~23):

```ts
import { promptUfficio } from "./prompts/system_ufficio.ts";
```

Sostituire il calcolo di `systemPrompt` (righe 387-390):

```ts
    const systemPrompt =
      (identity.kind === "titolare" || identity.kind === "admin"
        ? SYSTEM_PROMPT_TITOLARE
        : `${SYSTEM_PROMPT_OPERAIO}\n\n${buildOperationalSystemPrompt(operationalSettings)}\n\n${buildTriagePrompt(operationalTriage)}`) + WA_SECURITY_GUARD;
```
con:
```ts
    const basePrompt = identity.kind === "ufficio" || identity.kind === "admin"
      ? promptUfficio({ tipo: identity.kind, nome: identity.display_name })
      : SYSTEM_PROMPT_OPERAIO;
    const systemPrompt =
      `${basePrompt}\n\n${buildOperationalSystemPrompt(operationalSettings)}\n\n${buildTriagePrompt(operationalTriage)}` +
      WA_SECURITY_GUARD;
```
e togliere l'import ormai inutile `import { SYSTEM_PROMPT_TITOLARE } from "./prompts/system_titolare.ts";` (il file resta: lo usa ancora la documentazione, verificare con `grep -rn system_titolare supabase/functions` e cancellarlo solo se non lo importa nessuno).

Sostituire il filtro strumenti (righe 399-403):

```ts
    const grantedTools = filterToolsByGrants(identity.role_grants);
    const availableTools =
      identity.kind === "operaio"
        ? filterOperationalTools(grantedTools, operationalSettings)
        : grantedTools;
```
con:
```ts
    // Le impostazioni del numero (presenze, diario foto, sicurezza) valgono per
    // tutti: prima l'amministratore le scavalcava perché non aveva quegli strumenti.
    const grantedTools = filterToolsByGrants(identity.role_grants);
    const availableTools = filterOperationalTools(grantedTools, operationalSettings);
```

Sostituire il `taskKind` (righe 452-455):

```ts
    const taskKind =
      identity.kind === "titolare" || identity.kind === "admin"
        ? ("bot_operativo_titolare" as const)
        : ("bot_operativo_operaio" as const);
```
con:
```ts
    const taskKind =
      identity.kind === "ufficio" || identity.kind === "admin"
        ? ("bot_operativo_titolare" as const)
        : ("bot_operativo_operaio" as const);
```

- [ ] **Step 5: Nessun riferimento rimasto a `titolare` come `kind`**

Run: `grep -rn '"titolare"' supabase/functions/whatsapp-ai-processor --include='*.ts' | grep -v prompts/`
Expected: nessuna riga.

- [ ] **Step 6: Deno check non peggiora**

Run: `deno check supabase/functions/whatsapp-ai-processor/index.ts 2>&1 | grep -c "\[ERROR\]"`
Expected: ≤ baseline del Task 0. Se cresce: leggere solo gli errori nuovi (`deno check … 2>&1 | grep -A3 "identity.ts\|system_ufficio"`) e correggerli (tipizzare il client passato a `ruoliNellAzienda` come fa `telegram-bot-processor`).

- [ ] **Step 7: Verifica sul database (nessun invio)**

Con `execute_sql`, simulare la risoluzione per il 348 su Demo Azienda 2:
```sql
select e.id, e.user_id, (select json_agg(role) from user_roles r where r.user_id = e.user_id) ruoli
from employees e
where e.company_id = 'd2000000-0000-4000-a000-000000000002' and e.is_active
  and right(regexp_replace(coalesce(e.phone_whatsapp, e.phone, ''), '\D', '', 'g'), 9) = '483467567';
```
Expected: una riga, `ruoli = ["company_admin"]` → `tipoUtenteBot` = `admin`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/whatsapp-ai-processor/identity.ts supabase/functions/whatsapp-ai-processor/tools/shared/types.ts supabase/functions/whatsapp-ai-processor/prompts/system_ufficio.ts supabase/functions/whatsapp-ai-processor/index.ts
git commit -m "Bot operativo: amministratori e ufficio riconosciuti coi ruoli veri, e fanno anche le cose da operaio"
```

---

### Task 3: Bot spento = bot spento

Oggi con `bot_enabled=false` il messaggio resta `received`, il cron `whatsapp-ai-recovery` lo riprende dopo 3 minuti e il processore risponde lo stesso.

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handlers/bot_operativo.ts:190`
- Modify: `supabase/functions/whatsapp-ai-processor/index.ts:151-153`

- [ ] **Step 1: Chiudere subito il messaggio nel webhook**

In `handlers/bot_operativo.ts`, subito prima di `if (botEnabled && reservedWaMsgId) {` (riga ~190) inserire:

```ts
  // Bot spento: il messaggio si chiude qui. Prima restava «received» e il
  // cron di recupero lo rimandava al bot dopo 3 minuti, che rispondeva lo stesso.
  if (!botEnabled && reservedWaMsgId) {
    await supabase
      .from("whatsapp_messages")
      .update({ processing_status: "processed", processing_error: "bot_spento", processed_at: new Date().toISOString() })
      .eq("id", reservedWaMsgId)
      .eq("processing_status", "received");
  }
```

- [ ] **Step 2: Difesa anche nel processore**

In `whatsapp-ai-processor/index.ts`, subito dopo `const operationalSettings = normalizeOperationalSettings(...)` (riga ~153) inserire:

```ts
  // Bot spento sul numero: non si risponde, nemmeno se il messaggio arriva
  // dal cron di recupero (27/09/2026).
  const impostazioniNumero = waNumberSettings?.operational_settings;
  if (isPlainRecord(impostazioniNumero) && impostazioniNumero.bot_enabled === false) {
    return markDone(supabase, body.message_id, "processed", "bot_spento");
  }
```

- [ ] **Step 3: Deno check dei due file**

Run: `deno check supabase/functions/whatsapp-ai-processor/index.ts supabase/functions/whatsapp-webhook/index.ts 2>&1 | grep -c "\[ERROR\]"`
Expected: ≤ somma delle baseline.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handlers/bot_operativo.ts supabase/functions/whatsapp-ai-processor/index.ts
git commit -m "Bot operativo: se è spento non risponde più, nemmeno dopo il recupero dei messaggi"
```

---

### Task 4: La foto senza didascalia si legge

`leggiFotoOperativa` chiede «documento o foto?» con `model: "gpt-4o-mini"`, che passa tale e quale a OpenRouter (vuole `openai/gpt-4o-mini`). Il prompt operaio descrive un'etichetta che non esiste più.

**Files:**
- Modify: `supabase/functions/whatsapp-ai-processor/media.ts:236`
- Modify: `supabase/functions/whatsapp-ai-processor/prompts/system_operaio.ts:28`

- [ ] **Step 1: Nome modello completo**

In `media.ts`, dentro `descrivi`, sostituire:
```ts
      model: "gpt-4o-mini",
```
con:
```ts
      // Nome completo: il modello passa tale e quale a OpenRouter, che
      // senza «openai/» non lo riconosce (27/09/2026).
      model: "openai/gpt-4o-mini",
```

- [ ] **Step 2: Etichetta vera nel prompt operaio**

In `system_operaio.ts` sostituire:
```
Quando arriva una foto analizzata come DDT, i dati estratti sono già nel messaggio utente formattato come "[Immagine — analisi: ...]". Tu devi:
```
con:
```
Quando arriva una foto di un DDT, i dati letti sono già nel messaggio, sotto l'intestazione "[Foto di un DDT — dati letti dal documento]". Tu devi:
```
e al punto 2 della stessa sezione, dopo «prima di chiamare carica_ddt», aggiungere « (azione: carica_ddt)».

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-ai-processor/media.ts supabase/functions/whatsapp-ai-processor/prompts/system_operaio.ts
git commit -m "Bot operativo: la foto senza didascalia viene riconosciuta, prompt DDT allineato al testo vero"
```

La prova vera è nel Task 7 (foto di cantiere senza testo).

---

### Task 5: Confermare un DDT carica davvero il magazzino

Oggi «Conferma» cambia solo `email_ddt_carico.stato`: nessun movimento, giacenza ferma, ordine d'acquisto fermo — mentre `CarichiDaRegistrareCard.tsx:140` dice il contrario. Nessun trigger lo fa (`warehouse_movements` non aggiorna la giacenza da solo: la aggiorna chi inserisce il movimento, come `registra_movimento_magazzino` di Silvio).

**Files:**
- Create: `supabase/migrations/20280927230000_conferma_carico_ddt.sql`
- Modify: `src/lib/email-ai/hooks.ts` (`useAggiornaStatoCaricoDdt`)
- Modify: `supabase/functions/whatsapp-ai-processor/tools/operaio/carica_ddt.ts`

- [ ] **Step 1: Controllare l'aiuto di accesso**

```sql
select prosrc from pg_proc where proname = 'user_can_access_company';
```
Expected: usa `auth.uid()` e ammette profilo dell'azienda o accesso multi-azienda. Se non usa `auth.uid()`, fermarsi e riportarlo.

- [ ] **Step 2: Scrivere la migrazione**

```sql
-- supabase/migrations/20280927230000_conferma_carico_ddt.sql
-- Confermare un DDT carica davvero il magazzino (27/09/2026).
--
-- Prima «Conferma» cambiava solo lo stato della bozza (email_ddt_carico):
-- nessun movimento, giacenza ferma, ordine d'acquisto fermo — mentre la
-- schermata diceva «la giacenza si aggiorna». Ora una funzione sola, usata
-- dall'app e dal bot WhatsApp:
--  1) ordine collegato → nasce la ricezione (ddt_ricezione, una per numero
--     DDT) e i trigger esistenti portano l'ordine almeno a «parziale»;
--  2) ogni riga con quantità intera > 0 che corrisponde a UN solo articolo di
--     magazzino (codice interno o a barre, poi nome identico) → movimento di
--     carico + giacenza aumentata;
--  3) le righe senza articolo certo (o con decimali: la giacenza è intera)
--     tornano «da abbinare»: mai indovinare l'articolo, mai crearne uno.
-- Idempotente: una bozza già confermata non ricarica niente.

set lock_timeout = '5s';

create or replace function public.conferma_carico_ddt(p_carico_id uuid, p_utente uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.email_ddt_carico%rowtype;
  v_utente uuid := coalesce(auth.uid(), p_utente);
  v_riga jsonb;
  v_testo_qta text;
  v_qta numeric;
  v_codice text;
  v_descr text;
  v_n int;
  v_art_id uuid;
  v_art_nome text;
  v_art_magazzino uuid;
  v_caricati jsonb := '[]'::jsonb;
  v_da_abbinare jsonb := '[]'::jsonb;
  v_ricezione uuid;
begin
  if v_utente is null then
    return jsonb_build_object('ok', false, 'errore', 'Serve una persona che confermi il carico.');
  end if;

  select * into v_c from public.email_ddt_carico where id = p_carico_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Carico non trovato.');
  end if;

  -- Dall'app: solo chi lavora in quell'azienda. Dal bot (chiave di servizio,
  -- nessun utente collegato) l'azienda l'ha già verificata il bot.
  if auth.uid() is not null and not public.user_can_access_company(v_c.company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  if v_c.stato = 'scartato' then
    return jsonb_build_object('ok', false, 'errore', 'Questo carico è stato scartato.');
  end if;
  if v_c.stato = 'confermato' and coalesce(v_c.movimento_created, false) then
    return jsonb_build_object('ok', true, 'gia_confermato', true, 'caricati', '[]'::jsonb, 'da_abbinare', '[]'::jsonb);
  end if;

  -- 1) Ordine collegato: la ricezione (una sola per numero DDT).
  if v_c.purchase_order_id is not null then
    select id into v_ricezione from public.ddt_ricezione
     where purchase_order_id = v_c.purchase_order_id
       and numero_ddt = coalesce(v_c.ddt_numero, 's.n.')
     limit 1;
    if v_ricezione is null then
      insert into public.ddt_ricezione (company_id, purchase_order_id, numero_ddt, data_ricezione, stato, source, created_by, note)
      values (v_c.company_id, v_c.purchase_order_id, coalesce(v_c.ddt_numero, 's.n.'),
              coalesce(v_c.ddt_data, current_date), 'ricevuto',
              case when v_c.email_id is null then 'whatsapp' else 'manual' end,
              v_utente, 'Da DDT confermato')
      returning id into v_ricezione;
    end if;
  end if;

  -- 2) Righe → magazzino.
  for v_riga in select value from jsonb_array_elements(coalesce(v_c.righe, '[]'::jsonb)) loop
    v_testo_qta := v_riga->>'qta_bolla';
    v_qta := case when v_testo_qta ~ '^[0-9]+(\.[0-9]+)?$' then v_testo_qta::numeric else null end;
    continue when v_qta is null or v_qta <= 0;
    v_codice := nullif(btrim(coalesce(v_riga->>'codice', '')), '');
    v_descr := nullif(btrim(coalesce(v_riga->>'descrizione', '')), '');

    if v_qta <> trunc(v_qta) then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'quantità con decimali');
      continue;
    end if;

    v_art_id := null;
    if v_codice is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and (lower(internal_code) = lower(v_codice) or lower(barcode) = lower(v_codice));
      if v_n <> 1 then v_art_id := null; end if;
    end if;
    if v_art_id is null and v_descr is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and lower(btrim(name)) = lower(v_descr);
      if v_n <> 1 then v_art_id := null; end if;
    end if;

    if v_art_id is null then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'articolo non trovato in magazzino');
      continue;
    end if;

    select name, warehouse_id into v_art_nome, v_art_magazzino
      from public.warehouse_stock where id = v_art_id for update;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id, company_id)
    values (v_art_id, 'carico', v_qta::int, 'DDT ' || coalesce(v_c.ddt_numero, 's.n.') || ' confermato',
            v_utente, v_art_magazzino, v_c.company_id);
    update public.warehouse_stock
       set quantity = coalesce(quantity, 0) + v_qta::int,
           last_delivery_date = coalesce(v_c.ddt_data, current_date)
     where id = v_art_id;
    v_caricati := v_caricati || jsonb_build_object('articolo', v_art_nome, 'quantita', v_qta::int);
  end loop;

  update public.email_ddt_carico
     set stato = 'confermato', confirmed_by = v_utente, confirmed_at = now(), movimento_created = true
   where id = p_carico_id;

  return jsonb_build_object('ok', true, 'ricezione_id', v_ricezione, 'caricati', v_caricati, 'da_abbinare', v_da_abbinare);
end;
$$;

revoke all on function public.conferma_carico_ddt(uuid, uuid) from public, anon;
grant execute on function public.conferma_carico_ddt(uuid, uuid) to authenticated, service_role;

comment on function public.conferma_carico_ddt(uuid, uuid) is
  'Conferma una bozza di carico DDT: ricezione sull''ordine collegato, movimenti di carico e giacenza per gli articoli certi, elenco delle righe da abbinare. Idempotente.';
```

- [ ] **Step 3: Applicare e riallineare la versione**

`apply_migration` con nome `conferma_carico_ddt` e il contenuto sopra, poi:
```sql
update supabase_migrations.schema_migrations set version = '20280927230000'
 where name = 'conferma_carico_ddt' and left(version, 4) = '2026';
```

- [ ] **Step 4: Collaudo a vuoto (tutto annullato alla fine)**

```sql
do $$
declare
  v_art record;
  v_carico uuid;
  v_esito jsonb;
  v_giacenza int;
begin
  select id, name, coalesce(quantity, 0) q into v_art from warehouse_stock
   where company_id = 'd2000000-0000-4000-a000-000000000002' order by created_at limit 1;
  insert into email_ddt_carico (company_id, ddt_numero, ddt_data, senza_ordine, righe, stato, created_by)
  values ('d2000000-0000-4000-a000-000000000002', 'PROVA-1', current_date, true,
          jsonb_build_array(
            jsonb_build_object('descrizione', v_art.name, 'codice', null, 'qta_bolla', 3),
            jsonb_build_object('descrizione', 'Articolo che non esiste', 'codice', null, 'qta_bolla', 2),
            jsonb_build_object('descrizione', v_art.name, 'codice', null, 'qta_bolla', 1.5)),
          'bozza', 'e592255e-0c82-86cd-7f7b-d3046317f9cd')
  returning id into v_carico;
  v_esito := conferma_carico_ddt(v_carico, 'e592255e-0c82-86cd-7f7b-d3046317f9cd');
  select quantity into v_giacenza from warehouse_stock where id = v_art.id;
  raise exception 'COLLAUDO esito=% giacenza_prima=% giacenza_dopo=% seconda_volta=%',
    v_esito, v_art.q, v_giacenza, conferma_carico_ddt(v_carico, 'e592255e-0c82-86cd-7f7b-d3046317f9cd');
end $$;
```
Expected: errore «COLLAUDO …» con `caricati` = 1 riga (+3), `da_abbinare` = 2 righe («articolo non trovato», «quantità con decimali»), `giacenza_dopo = giacenza_prima + 3`, `seconda_volta` con `gia_confermato: true`. L'eccezione annulla tutto.

- [ ] **Step 5: L'app usa la funzione**

In `src/lib/email-ai/hooks.ts` sostituire l'intero `useAggiornaStatoCaricoDdt` con:

```ts
export function useAggiornaStatoCaricoDdt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stato: "confermato" | "scartato"; email_id?: string }) => {
      if (input.stato === "confermato") {
        // Conferma = carico vero (27/09/2026): ricezione sull'ordine, movimenti
        // e giacenza per gli articoli riconosciuti. Prima cambiava solo lo stato.
        const { data, error } = await sbAny.rpc("conferma_carico_ddt", { p_carico_id: input.id });
        if (error) throw error;
        const esito = data as { ok: boolean; errore?: string; caricati?: unknown[]; da_abbinare?: unknown[] };
        if (!esito?.ok) throw new Error(esito?.errore ?? "Conferma non riuscita");
        return { ...input, caricati: esito.caricati?.length ?? 0, daAbbinare: esito.da_abbinare?.length ?? 0 };
      }
      const { error } = await sbAny.from("email_ddt_carico").update({ stato: input.stato }).eq("id", input.id);
      if (error) throw error;
      return { ...input, caricati: 0, daAbbinare: 0 };
    },
    onSuccess: (input) => {
      if (input.stato === "confermato") {
        toast.success("Carico confermato", {
          description: input.daAbbinare > 0
            ? `${input.caricati} articoli caricati in magazzino, ${input.daAbbinare} da abbinare a mano in Magazzino.`
            : `${input.caricati} articoli caricati in magazzino.`,
        });
      } else {
        toast.success("Carico scartato");
      }
      void qc.invalidateQueries({ queryKey: ["email-ddt-carichi", input.email_id] });
      // P0-A: rinfresca anche il pannello company-wide dei DDT fotografati (email_id NULL).
      void qc.invalidateQueries({ queryKey: ["email-ddt-carichi-da-registrare"] });
      void qc.invalidateQueries({ queryKey: ["warehouse"] });
    },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}
```
Se `sbAny` non espone `rpc` nel suo tipo (riga ~412), aggiungere al tipo `rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;`.

- [ ] **Step 6: Dal bot, ufficio e admin caricano subito**

In `tools/operaio/carica_ddt.ts`, subito dopo la chiamata `const carico = await buildDdtCarico(...);` inserire:

```ts
  // Da chi lavora in ufficio o amministra, il «Sì» in chat vale come conferma
  // a gestionale: il carico entra subito in magazzino (27/09/2026). Dagli
  // operai resta una bozza che l'ufficio conferma nell'app.
  // Tipo con nome: «as typeof esitoMagazzino» userebbe il tipo già ristretto a null.
  type EsitoMagazzino = { caricati: Array<{ articolo: string; quantita: number }>; da_abbinare: unknown[] };
  let esitoMagazzino: EsitoMagazzino | null = null;
  if (carico.ok && carico.carico?.id && ctx.user_id && (ctx.kind === "admin" || ctx.kind === "ufficio")) {
    const { data: conf, error: confErr } = await ctx.supabase.rpc("conferma_carico_ddt", {
      p_carico_id: carico.carico.id,
      p_utente: ctx.user_id,
    });
    if (confErr) {
      console.error(JSON.stringify({ level: "error", fn: "conferma_carico_ddt", error: confErr.message }));
    } else if ((conf as { ok?: boolean } | null)?.ok) {
      esitoMagazzino = conf as EsitoMagazzino;
    }
  }
```

Racchiudere l'inserimento della segnalazione `ddt_da_registrare` (`await ctx.supabase.from("cantiere_segnalazioni").insert({...})`) in `if (!esitoMagazzino) { … }`: se è già registrato non va segnalato come «da registrare».

Subito prima di `return okResult(` in fondo, inserire:

```ts
  if (esitoMagazzino) {
    const caricati = esitoMagazzino.caricati;
    const daAbbinare = esitoMagazzino.da_abbinare.length;
    userMsg =
      `📄 DDT #${numero || "(senza numero)"} di ${fornitore} confermato. ` +
      (caricati.length > 0
        ? `In magazzino: ${caricati.map((c) => `${c.articolo} +${c.quantita}`).join(", ")}.`
        : "Nessun articolo riconosciuto in magazzino.") +
      (daAbbinare > 0
        ? ` ${daAbbinare} ${daAbbinare === 1 ? "riga va abbinata" : "righe vanno abbinate"} a un articolo dall'app, in Magazzino.`
        : "");
  }
```

- [ ] **Step 7: Controlli**

Run: `node scripts/typecheck-ratchet.mjs` → Expected: nessun peggioramento.
Run: `deno check supabase/functions/whatsapp-ai-processor/index.ts 2>&1 | grep -c "\[ERROR\]"` → Expected: ≤ baseline.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20280927230000_conferma_carico_ddt.sql src/lib/email-ai/hooks.ts supabase/functions/whatsapp-ai-processor/tools/operaio/carica_ddt.ts
git commit -m "DDT confermato = carico vero: ricezione sull'ordine, movimenti e giacenza; righe incerte da abbinare"
```

---

### Task 6: Il «Sì» conferma solo l'azione appena proposta

Oggi qualunque «sì» (o bottone) sblocca qualunque strumento che vuole conferma. La domanda in attesa si ricorda nella sessione (`whatsapp_sessions.state_data`, già esistente) con il nome dello strumento e l'ora; scade dopo 30 minuti.

**Files:**
- Create: `supabase/functions/_shared/botOperativoConferme.ts`
- Test: `src/test/logic/botOperativoConferme.test.ts`
- Modify: `supabase/functions/whatsapp-ai-processor/tools/shared/chiedi_conferma.ts`
- Modify: `supabase/functions/whatsapp-ai-processor/index.ts` (sessione, controllo conferma, salvataggio)

- [ ] **Step 1: Test che fallisce**

```ts
// src/test/logic/botOperativoConferme.test.ts
import { describe, expect, it } from "vitest";
import {
  confermaValePer,
  leggiStatoSessione,
  statoDaSalvare,
} from "../../../supabase/functions/_shared/botOperativoConferme";

const ADESSO = new Date("2026-09-27T10:00:00Z");
const minutiFa = (m: number) => new Date(ADESSO.getTime() - m * 60_000).toISOString();

describe("domanda in attesa nella sessione", () => {
  it("si legge se è recente, sparisce se è vecchia", () => {
    const recente = leggiStatoSessione({ bot_conferma: { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(5) } }, ADESSO);
    expect(recente.conferma?.azione).toBe("carica_ddt");
    const vecchia = leggiStatoSessione({ bot_conferma: { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(31) } }, ADESSO);
    expect(vecchia.conferma).toBeNull();
    expect(leggiStatoSessione(null, ADESSO)).toEqual({ conferma: null, domini: [] });
  });
  it("le aree caricate valgono 30 minuti", () => {
    expect(leggiStatoSessione({ bot_aree: { domini: ["warehouse"], il: minutiFa(10) } }, ADESSO).domini).toEqual(["warehouse"]);
    expect(leggiStatoSessione({ bot_aree: { domini: ["warehouse"], il: minutiFa(40) } }, ADESSO).domini).toEqual([]);
  });
});

describe("il Sì sblocca solo l'azione chiesta", () => {
  const attesa = { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(1) };
  it("sblocca lo strumento chiesto", () => {
    expect(confermaValePer(attesa, "carica_ddt", true)).toBe(true);
  });
  it("non sblocca un altro strumento", () => {
    expect(confermaValePer(attesa, "crea_rapportino", true)).toBe(false);
  });
  it("senza Sì non sblocca niente", () => {
    expect(confermaValePer(attesa, "carica_ddt", false)).toBe(false);
  });
  it("domanda senza azione indicata o nessuna domanda: vale il Sì (comportamento di prima)", () => {
    expect(confermaValePer({ ...attesa, azione: null }, "crea_rapportino", true)).toBe(true);
    expect(confermaValePer(null, "crea_rapportino", true)).toBe(true);
  });
});

describe("salvataggio nella sessione", () => {
  it("tiene gli altri campi e scrive solo quello che cambia", () => {
    const s = statoDaSalvare({ altro: 1 }, { conferma: { azione: "x", proposta_id: null, chiesta_il: minutiFa(0) } }, ADESSO);
    expect(s.altro).toBe(1);
    expect((s.bot_conferma as { azione: string }).azione).toBe("x");
    const tolta = statoDaSalvare(s, { conferma: null }, ADESSO);
    expect(tolta.bot_conferma).toBeUndefined();
    const aree = statoDaSalvare({}, { domini: ["crm"] }, ADESSO);
    expect(aree.bot_aree).toEqual({ domini: ["crm"], il: ADESSO.toISOString() });
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run src/test/logic/botOperativoConferme.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere il modulo**

```ts
// supabase/functions/_shared/botOperativoConferme.ts
/**
 * Cosa il bot operativo ricorda fra un messaggio e l'altro (27/09/2026):
 *  - la domanda di conferma in attesa (quale strumento sblocca il «Sì»,
 *    eventualmente la proposta di Silvio da eseguire);
 *  - le aree di strumenti di Silvio già caricate.
 * Sta in whatsapp_sessions.state_data, sotto chiavi proprie, e scade dopo
 * 30 minuti. Prima qualunque «sì» sbloccava qualunque azione.
 */

export interface ConfermaAttesa {
  /** Strumento che il Sì può eseguire; null = qualunque (domanda senza azione indicata). */
  azione: string | null;
  /** Proposta di Silvio da eseguire al Sì (Fase 1). */
  proposta_id: string | null;
  chiesta_il: string;
}

export interface StatoSessioneBot {
  conferma: ConfermaAttesa | null;
  domini: string[];
}

export const VALIDITA_MS = 30 * 60 * 1000;

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function recente(iso: unknown, adesso: Date): boolean {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && adesso.getTime() - t <= VALIDITA_MS;
}

export function leggiStatoSessione(stateData: unknown, adesso: Date): StatoSessioneBot {
  const s = record(stateData) ?? {};
  const c = record(s.bot_conferma);
  const conferma = c && recente(c.chiesta_il, adesso)
    ? {
      azione: typeof c.azione === "string" && c.azione ? c.azione : null,
      proposta_id: typeof c.proposta_id === "string" && c.proposta_id ? c.proposta_id : null,
      chiesta_il: String(c.chiesta_il),
    }
    : null;
  const a = record(s.bot_aree);
  const domini = a && recente(a.il, adesso) && Array.isArray(a.domini)
    ? a.domini.filter((d): d is string => typeof d === "string")
    : [];
  return { conferma, domini };
}

/** Il «Sì» di questo turno sblocca QUESTO strumento? */
export function confermaValePer(
  conferma: ConfermaAttesa | null,
  nomeStrumento: string,
  utenteHaConfermato: boolean,
): boolean {
  if (!utenteHaConfermato) return false;
  if (!conferma || !conferma.azione) return true;
  return conferma.azione === nomeStrumento;
}

/** Il nuovo state_data: tiene le altre chiavi, cambia solo quelle passate. */
export function statoDaSalvare(
  precedente: unknown,
  cambi: { conferma?: ConfermaAttesa | null; domini?: string[] },
  adesso: Date,
): Record<string, unknown> {
  const s: Record<string, unknown> = { ...(record(precedente) ?? {}) };
  if (cambi.conferma === null) delete s.bot_conferma;
  else if (cambi.conferma) s.bot_conferma = cambi.conferma;
  if (cambi.domini) s.bot_aree = { domini: cambi.domini, il: adesso.toISOString() };
  return s;
}
```

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run src/test/logic/botOperativoConferme.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: `chiedi_conferma` dice quale azione sblocca**

In `tools/shared/chiedi_conferma.ts`:
- nell'interfaccia `ChiediConfermaArgs` aggiungere `azione?: string;`
- in `parameters.properties` aggiungere:
```ts
      azione: {
        type: "string",
        description:
          "Nome dello strumento che eseguirai se l'utente dice Sì (es. 'carica_ddt', 'crea_rapportino'). " +
          "Il Sì sblocca SOLO quello. Lascialo vuoto solo se la domanda serve a scegliere, non a confermare.",
      },
```
- nel valore di ritorno sostituire `okResult({ inviato: true, __interactive: interactive }, "")` con:
```ts
    okResult({ inviato: true, __interactive: interactive, azione: typeof args.azione === "string" ? args.azione.trim() || null : null }, ""),
```

- [ ] **Step 6: `index.ts` legge e salva la domanda in attesa**

Import (in cima):
```ts
import {
  confermaValePer,
  leggiStatoSessione,
  statoDaSalvare,
  type ConfermaAttesa,
} from "../_shared/botOperativoConferme.ts";
```

Nella lettura della sessione (riga ~408) cambiare `.select("id")` in `.select("id, state_data")` e subito dopo il blocco sessione (dopo la riga `sessionId = newSess?.id ?? null; }`) aggiungere:
```ts
    const statoSessione = leggiStatoSessione(existingSess?.state_data ?? null, new Date());
    // undefined = domanda in attesa invariata; null = da togliere; oggetto = nuova domanda.
    let confermaDopo: ConfermaAttesa | null | undefined = undefined;
```

Nel ciclo degli strumenti sostituire:
```ts
          if (tool.requires_confirmation && !userJustConfirmed) {
```
con:
```ts
          if (tool.requires_confirmation && !confermaValePer(statoSessione.conferma, tc.function.name, userJustConfirmed)) {
```
e subito dopo `const dur = Date.now() - t0;` aggiungere:
```ts
          // Il Sì è stato usato: la domanda in attesa si chiude.
          if (tool.requires_confirmation && (result as { ok?: boolean })?.ok) confermaDopo = null;
```

Dove si invia la risposta interattiva (`if (interactivePayload) {`), prima di `await sendInteractiveReply(...)`, aggiungere:
```ts
        const azioneChiesta = results
          .map((r) => r.result as { ok?: boolean; data?: { __interactive?: unknown; azione?: string | null } })
          .find((res) => res?.ok === true && !!res.data?.__interactive)?.data?.azione ?? null;
        confermaDopo = { azione: azioneChiesta, proposta_id: null, chiesta_il: new Date().toISOString() };
```

Subito prima di `const costEur = estimateCostEur(...)` aggiungere:
```ts
    if (sessionId && confermaDopo !== undefined) {
      await supabase
        .from("whatsapp_sessions")
        .update({ state_data: statoDaSalvare(existingSess?.state_data ?? null, { conferma: confermaDopo }, new Date()) })
        .eq("id", sessionId);
    }
```

`existingSess` è dichiarata dentro il `try`: se il blocco sessione la dichiara con `const { data: existingSess }` più in alto nello stesso scope, è visibile; altrimenti spostare la dichiarazione a livello del `try`.

- [ ] **Step 7: Deno check**

Run: `deno check supabase/functions/whatsapp-ai-processor/index.ts 2>&1 | grep -c "\[ERROR\]"`
Expected: ≤ baseline.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/botOperativoConferme.ts src/test/logic/botOperativoConferme.test.ts supabase/functions/whatsapp-ai-processor/tools/shared/chiedi_conferma.ts supabase/functions/whatsapp-ai-processor/index.ts
git commit -m "Bot operativo: il Sì conferma solo l'azione appena proposta, e scade dopo 30 minuti"
```

---

### Task 7: Prova vera della Fase 0 e pubblicazione

**Files:** nessuno.

- [ ] **Step 1: Controlli finali**

```bash
npx vitest run src/test/logic/botOperativoRuoli.test.ts src/test/logic/botOperativoConferme.test.ts
node scripts/typecheck-ratchet.mjs
npm run build
```
Expected: tutto verde.

- [ ] **Step 2: Chiedere l'ok al founder e pubblicare**

Riassunto al founder di cosa cambia; **solo dopo il suo ok**: `git push origin HEAD:main`. Seguire la CI («TypeScript check», «Deploy edge functions», «Cloudflare Pages») fino al verde; se il deploy delle funzioni salta per un test rosso, rilanciare `gh workflow run ci.yml -f funzioni="whatsapp-ai-processor whatsapp-webhook"`.

- [ ] **Step 3: Prova dal 348 346 7567 al +39 351 361 1676 (watcher acceso)**

| # | Messaggio | Atteso nel telefono | Atteso nel database |
|---|---|---|---|
| 1 | «ciao» | saluta Florin, dice cosa può fare (anche d'ufficio) | `whatsapp_messages` inbound `processed`, outbound `sent/delivered` |
| 2 | foto di un DDT con testo «ddt» | fornitore, numero, righe + bottoni Sì/No | `ai_extracted_data.testo_per_assistente` con «[Foto di un DDT —» |
| 3 | tocca «Sì» | «DDT … confermato. In magazzino: … / righe da abbinare» | `email_ddt_carico.stato='confermato'`, `movimento_created=true`; eventuali `warehouse_movements` |
| 4 | vocale «oggi cantiere Rossi 8 ore, posati 4 infissi» | riepilogo + bottoni | nessun rapportino finché non dici Sì |
| 5 | scrivi «sì registra anche un DDT» senza foto | non registra DDT (il Sì valeva per il rapportino) | nessun nuovo `email_documento_estratto` |
| 6 | tocca «Sì» al rapportino | «rapportino registrato» | `campo_rapportini` con `source='whatsapp'` |
| 7 | foto del cantiere senza testo | la descrive e propone di salvarla | `foto_cantiere` dopo conferma |
| 8 | spegni il bot: `update ai_whatsapp_numbers set operational_settings = operational_settings || '{"bot_enabled":false}' where id='ed9dfae3-2d9e-46b6-9157-949d79ee8e1b';` poi «ciao» | nessuna risposta, anche dopo 4 minuti | inbound `processed` con `processing_error='bot_spento'` |
| 9 | riaccendi (`'{"bot_enabled":true}'`) | — | — |

- [ ] **Step 4: Ramo operaio**

Spostare il 348 su Marco Operaio e toglierlo a Florin:
```sql
update employees set phone_whatsapp = null, phone = null where id = 'bbccf2c7-5927-43fe-93f7-b3ba7fd844af';
update employees set phone_whatsapp = '393483467567' where id = '06cfbe38-161e-2882-caad-837603c6b35a';
update profiles set phone = null where id = 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
```
Ripetere 2-3: atteso «L'ufficio lo conferma a gestionale», `email_ddt_carico.stato='bozza'`. Poi rimettere tutto com'era:
```sql
update employees set phone_whatsapp = null where id = '06cfbe38-161e-2882-caad-837603c6b35a';
update employees set phone_whatsapp = '393483467567', phone = '+393483467567' where id = 'bbccf2c7-5927-43fe-93f7-b3ba7fd844af';
update profiles set phone = '+393483467567' where id = 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
```

- [ ] **Step 5: Annotare l'esito** (una riga per prova) in fondo a questo file, sezione «Esiti».

---

# FASE 1 — Un cervello solo: gli strumenti di Silvio sul bot

### Task 8: Logica pura del catalogo (bot + Silvio senza doppioni)

**Files:**
- Create: `supabase/functions/_shared/botOperativoCatalogo.ts`
- Test: `src/test/logic/botOperativoCatalogo.test.ts`

- [ ] **Step 1: Test che fallisce**

```ts
// src/test/logic/botOperativoCatalogo.test.ts
import { describe, expect, it } from "vitest";
import { unisciCatalogo, usaStrumentiSilvio } from "../../../supabase/functions/_shared/botOperativoCatalogo";

describe("catalogo del bot operativo", () => {
  it("solo ufficio e admin hanno gli strumenti di Silvio", () => {
    expect(usaStrumentiSilvio("admin")).toBe(true);
    expect(usaStrumentiSilvio("ufficio")).toBe(true);
    expect(usaStrumentiSilvio("operaio")).toBe(false);
  });
  it("i doppioni di Silvio lasciano il posto a quelli del bot, che usano la foto o il vocale appena arrivati", () => {
    const { bot, silvio } = unisciCatalogo(
      ["carica_ddt", "crea_rapportino", "chiedi_conferma"],
      ["carica_ddt", "registra_rapportino", "analyze_image", "get_quadro_incassi"],
    );
    expect(bot).toEqual(["carica_ddt", "crea_rapportino", "chiedi_conferma"]);
    expect(silvio).toEqual(["get_quadro_incassi"]);
  });
  it("le letture vecchie del bot lasciano il posto a quelle di Silvio", () => {
    const { bot, silvio } = unisciCatalogo(
      ["stato_cantiere", "scadenze_fatture", "crea_segnalazione"],
      ["report_commessa", "lista_scadenze"],
    );
    expect(bot).toEqual(["crea_segnalazione"]);
    expect(silvio).toEqual(["report_commessa", "lista_scadenze"]);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run src/test/logic/botOperativoCatalogo.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere il modulo**

```ts
// supabase/functions/_shared/botOperativoCatalogo.ts
/**
 * Quali strumenti ha il bot operativo per chi scrive (27/09/2026).
 *
 * Ufficio e amministratore ricevono anche gli strumenti di Silvio (stesso
 * registro della chat dell'app). Dove i due fanno la stessa cosa:
 *  - per i file appena arrivati vince il bot (sa usare la foto o il vocale
 *    di questo messaggio, Silvio li cerca nel suo archivio di caricamenti);
 *  - per le letture vince Silvio (le vecchie del bot hanno difetti noti:
 *    stato_cantiere dà margine 100% perché i materiali valgono sempre 0).
 */

import type { TipoUtenteBot } from "./botOperativoRuoli.ts";

/** Strumenti di Silvio che sul bot non servono: c'è quello del bot. */
export const SILVIO_DOPPIONI_DEL_BOT = new Set([
  "registra_rapportino", // → crea_rapportino
  "carica_ddt", // → carica_ddt del bot (legge la foto del messaggio)
  "analyze_image", // la foto si legge già all'arrivo
  "carica_documento_cantiere", // cerca il file tra i caricamenti della chat dell'app
]);

/** Strumenti del bot che lasciano il posto a quelli di Silvio. */
export const BOT_SUPERATI_DA_SILVIO = new Set([
  "stato_cantiere",
  "marginalita_cantiere",
  "scadenze_fatture",
  "costi_mese",
  "scostamenti_commesse",
  "lista_approvazioni",
  "approva_richiesta",
]);

export function usaStrumentiSilvio(tipo: TipoUtenteBot): boolean {
  return tipo === "ufficio" || tipo === "admin";
}

export function unisciCatalogo(nomiBot: string[], nomiSilvio: string[]): { bot: string[]; silvio: string[] } {
  const bot = nomiBot.filter((n) => !BOT_SUPERATI_DA_SILVIO.has(n));
  const presi = new Set(bot);
  const silvio = nomiSilvio.filter((n) => !SILVIO_DOPPIONI_DEL_BOT.has(n) && !presi.has(n));
  return { bot, silvio };
}
```

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run src/test/logic/botOperativoCatalogo.test.ts`
Expected: PASS, 3 test.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/botOperativoCatalogo.ts src/test/logic/botOperativoCatalogo.test.ts
git commit -m "Bot operativo: regola del catalogo fra strumenti del bot e di Silvio"
```

---

### Task 9: `carica_strumenti` anche su WhatsApp

Il catalogo di Silvio è troppo grande per spedirlo tutto a ogni messaggio (~13K token). La chat dell'app parte dalle aree di base e il modello carica le altre con `carica_strumenti`; il bot farà lo stesso, quindi lo strumento deve essere ammesso sul canale.

**Files:**
- Modify: `supabase/functions/_shared/silvioTools.ts` (definizione `carica_strumenti`, righe ~8795-8800)

- [ ] **Step 1: Ammettere il canale**

Sostituire:
```ts
    // Solo la chat interna sa rimettere insieme la lista strumenti tra
    // un'iterazione e l'altra. Sugli altri canali il catalogo non e filtrato,
    // quindi il tool non servirebbe a niente e confonderebbe e basta.
    allowedChannels: ["internal_chat"],
```
con:
```ts
    // Solo i canali che rimettono insieme la lista strumenti tra un'iterazione
    // e l'altra: la chat interna e, dal 27/09/2026, il bot operativo WhatsApp.
    // Sugli altri il catalogo non e filtrato e il tool confonderebbe e basta.
    allowedChannels: ["internal_chat", "whatsapp"],
```

- [ ] **Step 2: Nessun altro canale WhatsApp lo riceve per sbaglio**

Run: `grep -rn 'channel: "whatsapp"' supabase/functions --include='*.ts' | grep -v whatsapp-ai-processor`
Expected: solo chiamate che non passano `domains` (catalogo completo) oppure nessuna. Se un altro processore chiama `getToolsForChannel({ channel: "whatsapp", … })` senza ricostruire la lista, togliere lì `carica_strumenti` con `.filter((t) => t.schema?.function?.name !== "carica_strumenti")`, come fa `silvio-chat`.

- [ ] **Step 3: Deno check**

Run: `deno check supabase/functions/_shared/silvioTools.ts 2>&1 | grep -c "\[ERROR\]"`
Expected: ≤ baseline.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/silvioTools.ts
git commit -m "Silvio: carica_strumenti ammesso anche sul bot operativo WhatsApp"
```

---

### Task 10: Il ponte verso Silvio

**Files:**
- Create: `supabase/functions/whatsapp-ai-processor/silvio.ts`

- [ ] **Step 1: Scrivere il modulo**

```ts
// supabase/functions/whatsapp-ai-processor/silvio.ts
// Il ponte fra il bot operativo e gli strumenti di Silvio (27/09/2026).
//
// Chi lavora in ufficio o amministra l'azienda, da WhatsApp, fa quello che
// fa con Silvio nell'app: stessi strumenti (_shared/silvioTools.ts), stesso
// ruolo, stessi permessi. Si eseguono come fa il bot di Telegram, col client
// di servizio e l'utente riconosciuto dal numero. Il catalogo parte dalle
// aree di base e si allarga con carica_strumenti, come nella chat dell'app.
// Le azioni «gialle» diventano una proposta: qui si conferma coi bottoni
// Sì/No invece che solo nell'app. Le «rosse» restano da approvare nell'app.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CORE_TOOL_DOMAINS,
  dominiPerAree,
  getToolsForChannel,
  indiceAreeCaricabili,
  TOOL_CONTRACT_LEGEND,
  toolsToOpenAISpec,
  type ToolContext,
  type ToolDomain,
} from "../_shared/silvioTools.ts";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";
import { usaPermessiStaff } from "../_shared/ruoloSilvio.ts";
import { unisciCatalogo } from "../_shared/botOperativoCatalogo.ts";
import type { ToolResult } from "./tools/shared/types.ts";

export interface PonteSilvio {
  ctx: ToolContext;
  /** Strumenti di Silvio a bordo adesso. */
  nomi: Set<string>;
  /** Schemi per il modello (formato OpenAI). */
  spec: unknown[];
  /** Aree caricate oltre a quelle di base: si ricordano nella sessione. */
  domini: Set<ToolDomain>;
  ricostruisci(): void;
  /** Legenda dei contratti + aree che si possono ancora caricare. */
  promptExtra(): string;
}

export interface PropostaDelGiro {
  id: string;
  rischio: string;
  strumento: string;
}

export async function apriPonteSilvio(
  supabase: SupabaseClient,
  opts: {
    companyId: string;
    userId: string;
    ruolo: string;
    sessionId: string | null;
    dominiSalvati: string[];
    nomiBot: string[];
  },
): Promise<PonteSilvio> {
  let staffPermissions: Record<string, unknown> | null = null;
  if (usaPermessiStaff(opts.ruolo)) {
    const { data } = await supabase
      .from("staff_permissions")
      .select("*")
      .eq("user_id", opts.userId)
      .eq("company_id", opts.companyId)
      .maybeSingle();
    staffPermissions = (data as Record<string, unknown> | null) ?? null;
  }

  const domini = new Set<ToolDomain>(opts.dominiSalvati as ToolDomain[]);
  const aBordo = () => [...new Set<ToolDomain>([...CORE_TOOL_DOMAINS, ...domini])].sort();

  const ponte: PonteSilvio = {
    ctx: {
      supabase,
      companyId: opts.companyId,
      userId: opts.userId,
      primaryRole: opts.ruolo,
      staffPermissions,
      channel: "whatsapp",
      personaKey: "silvio",
      sessionId: opts.sessionId ?? undefined,
    },
    nomi: new Set(),
    spec: [],
    domini,
    ricostruisci() {
      const tutti = getToolsForChannel({
        channel: "whatsapp",
        role: opts.ruolo,
        personaKey: "silvio",
        domains: aBordo(),
        staffPermissions,
      });
      const { silvio } = unisciCatalogo(opts.nomiBot, tutti.map((t) => t.schema.function.name));
      const tenuti = new Set(silvio);
      ponte.nomi = tenuti;
      ponte.spec = toolsToOpenAISpec(tutti.filter((t) => tenuti.has(t.schema.function.name)));
    },
    promptExtra() {
      return TOOL_CONTRACT_LEGEND + indiceAreeCaricabili(aBordo());
    },
  };
  ponte.ricostruisci();
  return ponte;
}

/** Esegue uno strumento di Silvio e lo traduce nel formato dei risultati del bot. */
export async function eseguiStrumentoSilvio(
  ponte: PonteSilvio,
  nome: string,
  args: Record<string, unknown>,
): Promise<{ risultato: ToolResult; proposta: PropostaDelGiro | null }> {
  const r = await executeToolWithRouting(nome, args, ponte.ctx);
  if (nome === "carica_strumenti" && r.success) {
    for (const d of dominiPerAree(args.aree)) ponte.domini.add(d);
    ponte.ricostruisci();
  }
  if (!r.success) {
    return {
      risultato: { ok: false, error: r.error?.code ?? "errore", user_message: "Non ci sono riuscito, riprova tra poco." },
      proposta: null,
    };
  }
  if (r.proposalId) {
    return {
      risultato: {
        ok: true,
        data: {
          in_attesa_di_conferma: true,
          nota: "Azione preparata. All'utente arriva la richiesta di conferma con i bottoni: non aggiungere altro testo.",
        },
      },
      proposta: { id: r.proposalId, rischio: r.riskLevel ?? "yellow", strumento: nome },
    };
  }
  return { risultato: { ok: true, data: r.data }, proposta: null };
}

/**
 * Il Sì o il No a una proposta di Silvio arrivato in chat. Torna il testo da
 * rispondere. La proposta si prende in carico con un update condizionato:
 * se nel frattempo l'hanno gestita dall'app, qui non parte due volte.
 */
export async function chiudiPropostaDaChat(
  supabase: SupabaseClient,
  ponte: PonteSilvio,
  propostaId: string,
  confermata: boolean,
): Promise<string> {
  const { data: prop } = await supabase
    .from("ai_action_proposals")
    .select("id, action_type, payload, status, risk_level, company_id, user_id")
    .eq("id", propostaId)
    .maybeSingle();
  if (!prop || prop.status !== "pending" || prop.company_id !== ponte.ctx.companyId || prop.user_id !== ponte.ctx.userId) {
    return "Questa richiesta non è più in attesa: dimmi di nuovo cosa vuoi fare.";
  }
  const adesso = new Date().toISOString();
  if (!confermata) {
    await supabase
      .from("ai_action_proposals")
      .update({ status: "rejected", resolved_by: ponte.ctx.userId, resolved_at: adesso, resolution_note: "Rifiutata su WhatsApp" })
      .eq("id", prop.id)
      .eq("status", "pending");
    return "Ok, lascio stare.";
  }
  if (prop.risk_level === "red") {
    return "Questa azione va approvata dall'app: la trovi in Silvio, tra le azioni da approvare.";
  }
  const { data: presa } = await supabase
    .from("ai_action_proposals")
    .update({ status: "confirmed", resolved_by: ponte.ctx.userId, resolved_at: adesso, resolution_note: "Confermata su WhatsApp" })
    .eq("id", prop.id)
    .eq("status", "pending")
    .select("id");
  if (!presa || presa.length === 0) return "Questa richiesta è già stata gestita dall'app.";

  const payload = (prop.payload ?? {}) as Record<string, unknown>;
  const input = payload.input && typeof payload.input === "object" ? payload.input : payload;
  const r = await executeToolWithRouting(String(prop.action_type), input, { ...ponte.ctx, preApproved: true });
  const dati = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : null;
  const errore = !r.success ? "Non ci sono riuscito, riprova tra poco." : typeof dati?.error === "string" ? dati.error : null;

  await supabase
    .from("ai_action_proposals")
    .update({
      status: errore ? "failed" : "applied",
      applied_at: errore ? null : new Date().toISOString(),
      applied_result: (r.data ?? r.error ?? null) as unknown,
    })
    .eq("id", prop.id);

  if (errore) return errore;
  return typeof dati?.nota === "string" && dati.nota.trim() ? `✅ ${dati.nota}` : "✅ Fatto.";
}
```

- [ ] **Step 2: Deno check del modulo**

Run: `deno check supabase/functions/whatsapp-ai-processor/silvio.ts 2>&1 | grep "\[ERROR\]" | grep "silvio.ts" | wc -l`
Expected: 0 errori nel file nuovo (quelli dentro `_shared/silvioTools.ts` sono storici e già contati). Se `t.schema.function.name` non esiste nel tipo `SilvioTool`, usare lo stesso accesso di `silvio-chat` (`t.schema?.function?.name`).

- [ ] **Step 3: Verificare la forma del payload delle proposte**

```sql
select payload from ai_action_proposals where payload ? 'tool_name' order by created_at desc limit 1;
```
Expected: `{ tool_name, tool_domain, input: {...}, channel, … }` — `chiudiPropostaDaChat` legge `payload.input`. Se l'input sta altrove, adeguare la riga `const input = …`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-ai-processor/silvio.ts
git commit -m "Bot operativo: ponte verso gli strumenti di Silvio, con conferma delle proposte in chat"
```

---

### Task 11: Il turno usa bot + Silvio per ufficio e admin

**Files:**
- Modify: `supabase/functions/whatsapp-ai-processor/index.ts`

- [ ] **Step 1: Import**

```ts
import { apriPonteSilvio, chiudiPropostaDaChat, eseguiStrumentoSilvio, type PonteSilvio, type PropostaDelGiro } from "./silvio.ts";
import { BOT_SUPERATI_DA_SILVIO, usaStrumentiSilvio } from "../_shared/botOperativoCatalogo.ts";
import { buildInteractivePayload } from "./interactive.ts";
```

- [ ] **Step 2: Aprire il ponte dopo la sessione**

Subito dopo le righe aggiunte nel Task 6 (`let confermaDopo …`) inserire:

```ts
    // Fase 1 — ufficio e amministratore hanno anche gli strumenti di Silvio.
    let ponte: PonteSilvio | null = null;
    if (identity.kind !== "unknown" && usaStrumentiSilvio(identity.kind) && identity.user_id && identity.ruolo_silvio) {
      ponte = await apriPonteSilvio(supabase, {
        companyId: msg.company_id,
        userId: identity.user_id,
        ruolo: identity.ruolo_silvio,
        sessionId,
        dominiSalvati: statoSessione.domini,
        nomiBot: availableTools.map((t) => t.name),
      });
    }
    const strumentiBot = ponte ? availableTools.filter((t) => !BOT_SUPERATI_DA_SILVIO.has(t.name)) : availableTools;
    const nomiBot = new Set(strumentiBot.map((t) => t.name));
    const specDelGiro = () => [...toOpenAISpec(strumentiBot), ...(ponte?.spec ?? [])];
    const proposteDelGiro: PropostaDelGiro[] = [];
```

Oggi l'ordine in `index.ts` è: `systemPrompt` → `messages` → `grantedTools/availableTools` → sessione. Il ponte serve al prompt, quindi spostare, **in quest'ordine**, il calcolo di `grantedTools/availableTools`, il blocco sessione (lettura/creazione `whatsapp_sessions`), le righe del Task 6 (`statoSessione`, `confermaDopo`) e quelle qui sopra **prima** della costruzione di `basePrompt`/`systemPrompt`. Poi aggiungere al prompt il pezzo di Silvio:

```ts
    const systemPrompt =
      `${basePrompt}\n\n${buildOperationalSystemPrompt(operationalSettings)}\n\n${buildTriagePrompt(operationalTriage)}` +
      (ponte ? `\n\n${ponte.promptExtra()}` : "") +
      WA_SECURITY_GUARD;
```

- [ ] **Step 3: Chiusura di una proposta in attesa, prima del modello**

Subito dopo l'apertura del ponte:

```ts
    // Sì/No a una proposta di Silvio chiesta nel messaggio prima: si esegue
    // (o si scarta) senza passare dal modello.
    if (ponte && statoSessione.conferma?.proposta_id && (userJustConfirmed || confirmIsNegative)) {
      const testo = await chiudiPropostaDaChat(supabase, ponte, statoSessione.conferma.proposta_id, userJustConfirmed);
      if (sessionId) {
        await supabase
          .from("whatsapp_sessions")
          .update({ state_data: statoDaSalvare(existingSess?.state_data ?? null, { conferma: null }, new Date()) })
          .eq("id", sessionId);
      }
      await sendReply(msg, testo);
      return markDone(supabase, body.message_id, "processed");
    }
```

- [ ] **Step 4: Il ciclo usa il catalogo unito**

- Sostituire `const openaiTools = toOpenAISpec(availableTools);` con niente (lo calcola `specDelGiro()` a ogni giro).
- Sostituire `for (let iter = 0; iter < MAX_ITERATIONS; iter++) {` con:
```ts
    // Con Silvio serve un giro in più: carica_strumenti, poi lo strumento vero.
    const giriMassimi = ponte ? 5 : MAX_ITERATIONS;
    for (let iter = 0; iter < giriMassimi; iter++) {
      const spec = specDelGiro();
```
- Nella chiamata `callOpenAI` sostituire le due righe `tools: openaiTools.length > 0 ? openaiTools : undefined,` e `tool_choice: openaiTools.length > 0 ? "auto" : undefined,` con:
```ts
        tools: spec.length > 0 ? (spec as typeof spec) : undefined,
        tool_choice: spec.length > 0 ? "auto" : undefined,
```
(se il tipo di `tools` in `OpenAIRequest` non accetta `unknown[]`, fare il cast `as OpenAIRequest["tools"]` importando il tipo da `./openai.ts`).

- Dentro `assistantMsg.tool_calls.map(async (tc) => {`, come prima istruzione:
```ts
          // Strumento di Silvio (solo ufficio/admin): stesso registro dell'app.
          if (ponte && !nomiBot.has(tc.function.name) && ponte.nomi.has(tc.function.name)) {
            let argsSilvio: Record<string, unknown> = {};
            try { argsSilvio = JSON.parse(tc.function.arguments || "{}"); } catch { /* restano vuoti */ }
            const t0s = Date.now();
            const { risultato, proposta } = await eseguiStrumentoSilvio(ponte, tc.function.name, argsSilvio);
            if (proposta) proposteDelGiro.push(proposta);
            await logToolCall(supabase, {
              company_id: msg.company_id,
              wa_message_id: msg.id,
              tool_name: tc.function.name,
              role_kind: identity.kind,
              args: argsSilvio,
              result: risultato,
              duration_ms: Date.now() - t0s,
              model_used: model,
            });
            return { tool_call_id: tc.id, result: risultato };
          }
```
- Subito dopo il blocco `if (interactivePayload) { … break; }` aggiungere:
```ts
      // Una proposta di Silvio da confermare: la domanda parte dopo il ciclo.
      if (proposteDelGiro.length > 0) break;
```

- [ ] **Step 5: La domanda di conferma della proposta**

Subito dopo `if (!finalText) finalText = STR.operaio.max_iterations;` aggiungere:

```ts
    if (proposteDelGiro.length > 0 && !replyHandled) {
      const p = proposteDelGiro[0];
      if (p.rischio === "red") {
        finalText = "Questa azione va approvata dall'app: la trovi in Silvio, tra le azioni da approvare.";
      } else {
        const { data: prop } = await supabase.from("ai_action_proposals").select("summary").eq("id", p.id).maybeSingle();
        const domanda = `${prop?.summary ?? "Preparo l'azione che mi hai chiesto."}\n\nConfermi?`;
        await sendInteractiveReply(
          msg,
          buildInteractivePayload(domanda, [{ id: "conf_0", title: "Sì" }, { id: "conf_1", title: "No" }]) as unknown as Record<string, unknown>,
        );
        confermaDopo = { azione: p.strumento, proposta_id: p.id, chiesta_il: new Date().toISOString() };
        replyHandled = true;
      }
    }
```

- [ ] **Step 6: Ricordare le aree caricate**

Nel salvataggio della sessione aggiunto al Task 6 sostituire la condizione e i cambi:

```ts
    if (sessionId && (confermaDopo !== undefined || ponte)) {
      await supabase
        .from("whatsapp_sessions")
        .update({
          state_data: statoDaSalvare(
            existingSess?.state_data ?? null,
            { conferma: confermaDopo, domini: ponte ? [...ponte.domini] : undefined },
            new Date(),
          ),
        })
        .eq("id", sessionId);
    }
```

- [ ] **Step 7: Deno check**

Run: `deno check supabase/functions/whatsapp-ai-processor/index.ts 2>&1 | grep -c "\[ERROR\]"`
Expected: ≤ baseline.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/whatsapp-ai-processor/index.ts
git commit -m "Bot operativo: ufficio e amministratore usano anche gli strumenti di Silvio, con conferma in chat"
```

---

### Task 12: Prova vera della Fase 1 e pubblicazione

**Files:** nessuno.

- [ ] **Step 1: Controlli finali**

```bash
npx vitest run src/test/logic/botOperativoRuoli.test.ts src/test/logic/botOperativoConferme.test.ts src/test/logic/botOperativoCatalogo.test.ts
node scripts/typecheck-ratchet.mjs
npm run build
```
Expected: tutto verde.

- [ ] **Step 2: Ok del founder, poi pubblicazione**

Solo dopo l'ok: `git push origin HEAD:main`; CI fino al verde (funzioni: `whatsapp-ai-processor`; `_shared/silvioTools.ts` è condiviso: la CI ridistribuisce le funzioni che lo importano — verificare che anche `silvio-chat` e `telegram-bot-processor` risultino distribuite).

- [ ] **Step 3: Prova dal 348 (come amministratore di Demo Azienda 2)**

| # | Messaggio | Atteso | Database |
|---|---|---|---|
| 1 | «quanto abbiamo incassato questo mese?» | cifra in € dal quadro incassi | `wa_tool_calls`: `get_quadro_incassi` (o simile) |
| 2 | «a che punto è la commessa ORD-2026-027 Cartongesso?» | stato, avanzamento, incassato/da incassare | `report_commessa` o `search_orders` |
| 3 | «chi è in cantiere oggi?» | elenco persone | `lista_dipendenti_oggi` |
| 4 | «quanti cassonetti coibentati da 165 abbiamo?» | carica l'area magazzino e risponde (38 al 27/09) | `carica_strumenti` poi `get_warehouse_status`; `whatsapp_sessions.state_data.bot_aree` con `warehouse` |
| 5 | «scarica 2 Cassonetto coibentato 165mm per il cantiere ORD-2026-027» | riepilogo + bottoni Sì/No | `ai_action_proposals` `pending`, `state_data.bot_conferma.proposta_id` |
| 6 | tocca «Sì» | «✅ Movimento registrato…» | proposta `applied`; `warehouse_movements` nuovo; giacenza −2 |
| 7 | ripeti 5 e tocca «No» | «Ok, lascio stare.» | proposta `rejected` |
| 8 | «fissami un appuntamento domani alle 10 con il cliente Simone Farina» | conferma e fissa | `appointments` nuovo |
| 9 | foto DDT + «Sì» | come Fase 0 (il bot, non Silvio) | `wa_tool_calls`: `carica_ddt` del bot |

- [ ] **Step 4: Ramo operaio invariato**

Come Task 7 Step 4 (348 su Marco Operaio): «quanto abbiamo incassato?» → risposta breve che non può, **nessuno** strumento di Silvio in `wa_tool_calls`. Poi ripristinare.

- [ ] **Step 5: Costo di un turno**

```sql
select task_kind, model_used, count(*) chiamate, round(avg(tokens_prompt)) prompt_medi,
       round(sum(cost_real_eur)::numeric, 4) costo_eur, round(sum(cost_billed_eur)::numeric, 4) addebitato_eur
from ai_model_usage_log
where company_id = 'd2000000-0000-4000-a000-000000000002' and ts > now() - interval '1 hour'
group by 1, 2;
```
(è la tabella che scrive `chargeAndLog` in `_shared/ai-provider/billing.ts`). Atteso: prompt medi sotto ~12K token per giro d'ufficio. Se molto sopra, restringere le aree di base per WhatsApp nel ponte (passare a `getToolsForChannel` solo `["meta", "kpi", "calendar"]` più quelle caricate).

- [ ] **Step 6: Annotare gli esiti** in fondo a questo file.

---

## Baseline

(da compilare al Task 0)

## Esiti

(da compilare ai Task 7 e 12)
