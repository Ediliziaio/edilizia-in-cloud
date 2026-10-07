# Fasi di lavoro: sottofasi, modelli per azienda e avanzamento — piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni azienda decide come si misura l'avanzamento dei suoi cantieri. Una fase si divide in **sottofasi** che ne determinano la percentuale; i **modelli di fasi** (con le loro sottofasi) li prepara ogni azienda nelle Impostazioni e li sceglie dal bottone «Scegli le fasi» della commessa; il numero che ne esce (fase → commessa → SAL) è uno solo, spiegabile e uguale ovunque.

**Architecture:**
- **Sottofasi.** Una tabella figlia `order_work_subphases` (nome, posizione, peso, fatta/non fatta). Una funzione `SECURITY DEFINER`, `ricalcola_fase_da_sottofasi`, scrive `percentuale` e `status` della fase: sono le due colonne che tutto il resto legge già (rollup della commessa, Cronoprogramma, economia, SAL, semaforo). Una fase **con** sottofasi *deriva* da esse; una fase **senza** resta dichiarata come oggi: nessun dato esistente cambia.
- **Modelli.** Tre tabelle (modello → fasi → sottofasi) chiuse in scrittura e scritte da RPC atomiche col permesso `can_edit_settings_orders`. Gli 8 modelli del codice restano di sola lettura (si duplicano, si nascondono). «Scegli le fasi» legge i modelli dell'azienda e i base e crea fasi **e** sottofasi con una sola RPC (`aggiungi_fasi_commessa`).
- **Cantiere.** La checklist delle sottofasi prende il posto dello slider per le fasi che ne hanno: subito in «Avanzamento lavori», all'approvazione dell'ufficio nel rapportino (come oggi la percentuale).
- **Impostazioni di avanzamento per azienda** (`company_fasi_settings`): quali modelli base mostrare e, più avanti, come pesare le fasi nella media della commessa.
- La logica sta in moduli puri e testati (`src/lib/orders/sottofasi.ts`, `modelliFasi.ts`, `avanzamentoCommessa.ts`) con uno **specchio SQL** provato in produzione dentro una transazione annullata.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Supabase (Postgres, RLS, trigger e RPC `SECURITY DEFINER`), Tailwind + shadcn/ui, Vitest + Testing Library.

**Regole del progetto da rispettare** (CLAUDE.md e memoria di progetto):
- Lavoro **solo in locale** (worktree `eic-ui`, branch `traccia-ui`): niente push, mai `supabase db push`.
- Le migrazioni toccano la produzione: si scrivono come file **non** in `supabase/migrations/` finché non c'è l'OK; con l'OK si applicano con il tool MCP `apply_migration` e si riallinea la versione (CLAUDE.md, punti 1-4). Un file in `supabase/migrations/` va in produzione al primo push.
- Versioni `2028…`: prima di scegliere un numero, `ls supabase/migrations/<versione>_*.sql` deve essere vuoto. Le versioni usate qui: `20281007130000` (sottofasi), `20281007140000` (modelli), `20281007150000` (peso nella media).
- Funzione nuova: `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE` esplicito a `authenticated`; le funzioni di trigger non hanno bisogno di `EXECUTE`.
- Permessi per riga: `has_permission_for_company(auth.uid(), '<permesso>', <azienda della commessa>)`, mai `has_permission` (vale l'azienda in cui si lavora, non quella della riga).
- Il trigger `trg_fase_campi_protetti` (altra sessione, `20281006150000`) lascia al cantiere solo `status, percentuale, foto_urls, completata_il, completata_da, updated_at` su `order_work_phases`. **Questo piano non aggiunge colonne a `order_work_phases`**, e ogni scrittura derivata passa da funzioni `SECURITY DEFINER` (il trigger lascia passare chi non è `authenticated`/`anon`).
- L'avanzamento di una fase si legge **sempre** con `avanzamentoFase()` (`src/lib/orders/cronoprogramma.ts`), mai dalla `percentuale` grezza.
- Telefono: la scheda di commessa e il dialog «Fasi di lavoro» restano come sono (le sottofasi stanno nella fase aperta); la gestione dei modelli è solo da tablet/computer (`HIDDEN_ON_MOBILE`).
- Italiano semplice nei testi; niente gergo («RPC», «trigger» non compaiono nell'interfaccia).
- Typecheck a cricchetto: nessun errore nuovo (tsconfig ristretto nella radice, con `src/vite-env.d.ts` e `src/test/setup.ts`; vedi la memoria `reference_typecheck_mirato`).
- Il guardiano `src/test/logic/faseCampiProtetti.test.ts` (altra sessione, ancora non committato) ammette **tre soli file** che scrivono `order_work_phases`: `OrdineRapportiniCampo.tsx`, `useOrderWorkPhases.ts`, `CampoAvanzamento.tsx`. Nessun task di questo piano ne aggiunge un quarto.

---

## 0. Come ho capito le richieste

1. **«Ogni fase potrebbe avere sotto varie sottofasi che determinano lo stato avanzamento della fase.»** Una fase ha una lista di passi (sottofasi). Quando ne ha, l'avanzamento della fase è la parte di lavoro (pesata) già fatta. Segnare una sottofase aggiorna la fase e, a cascata, la commessa.
2. **«Ogni azienda quando crea una commessa e clicca "Scegli le fasi" sceglie da template; ogni azienda dovrebbe impostare nelle Impostazioni i suoi template.»** Oggi i modelli sono 8, nel codice, uguali per tutti, e creano solo i nomi delle fasi. Ogni azienda deve poterne avere di **suoi** (con le sottofasi), decidere quali modelli base mostrare, e il bottone deve offrire prima i suoi. Il bottone sta nella scheda **Lavorazioni** della commessa (`GuidaCantiere` quando è vuota, «Aggiungi fasi» altrimenti); `CreateOrder` non ha un passo sulle fasi.
3. **«Sviluppa per bene un piano.»** Più la proposta che hai approvato: metodo di avanzamento per azienda, peso nella media della commessa, SAL «meno precedenti». L'ordine di rilascio è in §5: ogni milestone è utile da sola e non rompe quelle dopo.

**Come la proposta di prima si ritrova qui** (con le sottofasi, il piano si è semplificato):

| Nella proposta | Nel piano |
|---|---|
| «Passi pesati» come metodo di avanzamento | **Sono le sottofasi** (M1, M3), e passano davanti a tutto il resto perché l'hai chiesto tu. |
| Metodo di avanzamento scelto per azienda e per fase | **Non serve un interruttore**: una fase con sottofasi deriva da esse, una senza resta dichiarata come oggi. L'azienda «sceglie» il metodo semplicemente usando o no le sottofasi, fase per fase. |
| «Fatto / non fatto» esplicito | È una fase con **una sola sottofase**, oppure il cerchio già presente in «Avanzamento lavori» per le fasi senza sottofasi. |
| Peso nella media (uguale / venduto / costo) | **M4**: alla pari / per durata / per venduto (il costo previsto non c'è: solo il 12% delle assegnazioni ha una fase). |
| SAL «meno precedenti» | **M5**, dopo la tua conferma. |
| Quantità eseguite con unità di misura, SAL «a misura» | **Fuori piano**: non esistono né l'unità né la quantità eseguita nel database; si decide a parte (§5, domanda 7). |

## 1. Decisioni di progetto

| # | Decisione | Perché | Scartato |
|---|---|---|---|
| 1 | Una fase con sottofasi **deriva** da esse; senza, resta dichiarata (slider / chiusura). | Nessuna migrazione dei dati: 18 commesse su 598 hanno fasi e restano come sono; l'azienda adotta le sottofasi fase per fase. | Un «metodo di avanzamento» scelto a mano su ogni fase: un interruttore in più che si dimentica. |
| 2 | Sottofase = **fatta / non fatta** + **peso** intero 1–100 (default 1). | Il 92% delle fasi reali è 0 o 100 (48 da iniziare, 43 chiuse su 99): la checklist è il modo naturale di avere le percentuali intermedie. Il peso risponde a «montare le porte pesa più che pulire». | Percentuale per sottofase: due livelli di slider da compilare dal cantiere. Quantità eseguite: fuori da questo piano. |
| 3 | Il calcolo sta **nel database** (trigger `SECURITY DEFINER`), con uno specchio TypeScript testato. | `percentuale` e `status` della fase sono già letti da rollup, Gantt, economia, SAL, semaforo: un solo punto li scrive. | Calcolo nel client: due schermate scriverebbero numeri diversi. |
| 4 | `order_work_phases.percentuale` resta **l'unico numero** consumato dagli altri. Nessuna colonna nuova su `order_work_phases`. | Il trigger di protezione delle fasi (altra sessione) non va toccato; nessuna lettura esistente cambia. | Colonna `metodo_avanzamento` sulla fase. |
| 5 | Dal cantiere si scrive solo `fatta` (ora e persona le mette il database). | Stesso principio del 06/10: l'operaio assegnato non rinomina e non sposta niente. | Una policy sola, che non limita le colonne. |
| 6 | Modelli dell'azienda: tre tabelle **chiuse in scrittura** + RPC atomiche (`salva_modello_fasi`, `elimina_modello_fasi`). | Un modello è un albero: o si salva tutto o niente. È lo schema già usato per `campo_regole_azienda`. | Scrittura diretta con RLS: salvataggi a metà. |
| 7 | I modelli base restano **nel codice** (`PHASE_TEMPLATES`), di sola lettura. «Duplica» li porta tra i propri; ogni azienda può nasconderli. | Chi c'è già vede quello che vedeva; nessun seed da tenere allineato in ogni azienda; chi fa solo tetti non vede più «Nuova costruzione». | Copiare i base in ogni azienda con un seed. |
| 8 | «Scegli le fasi» applica con una RPC (`aggiungi_fasi_commessa`), non con INSERT dal client. | Fasi e sottofasi in un colpo solo; il permesso si controlla in un punto; il guardiano `faseCampiProtetti` resta vero. | Due INSERT dal client (fasi create, sottofasi no). |
| 9 | **Peso nella media** della commessa per azienda: `uguale` (default), `durata`, `venduto`; se mancano i dati ricade su `uguale`. | Oggi 0 fasi hanno il venduto e 81 su 99 hanno le date: la durata è il peso che i dati permettono. `uguale` conserva il comportamento di oggi. | Peso per costo previsto: solo il 12% delle assegnazioni ha una fase. |
| 10 | SAL: «meno SAL precedenti» (netto da fatturare) come calcolo e riga del verbale. «A misura» (quantità × prezzo) **solo dopo la tua decisione**. | Tocca soldi e un PDF che arriva al cliente. | — |

## 2. Modello dati

```
orders ─┬─< order_work_phases (percentuale, status, importo_venduto, …)                    ← invariata
        │         └─< order_work_subphases (name, position, peso, fatta, fatta_il, fatta_da)    [NUOVA]
        └─< campo_rapportini.fasi_lavorate = [ { phase_id, percentuale, sottofasi_fatte?: uuid[] } ]
                                                (jsonb: una chiave in più, nessun DDL)

companies ─┬─< work_phase_templates (name, hint, position)                                 [NUOVA]
           │         └─< work_phase_template_phases (name, position)                        [NUOVA]
           │                   └─< work_phase_template_subphases (name, position, peso)     [NUOVA]
           └─1 company_fasi_settings (modelli_base_nascosti text[], peso_media text)        [NUOVA]
```

`order_work_subphases.company_id` e `.order_id` **non le sceglie il client**: le deriva da `phase_id` il trigger `sottofase_guardia`, quindi una sottofase non può stare nell'azienda sbagliata.

## 3. Regole di calcolo dopo il piano

| Situazione | Percentuale della fase | Stato della fase |
|---|---|---|
| Fase **senza** sottofasi | dichiarata (slider, rettifica, chiusura): **come oggi** | come oggi |
| Fase **con** sottofasi | `round(100 × peso fatto / peso totale)` | `100%` → `completata` (con `completata_il` e `completata_da`); `>0%` → `in_corso`; `0%` → resta com'è (`da_iniziare` o `in_corso`) |
| Si riapre una sottofase (o se ne aggiunge una non fatta) a una fase `completata` | ricalcolata, `<100%` | torna `in_corso`, `completata_il` e `completata_da` si svuotano |
| Si toglie l'ultima sottofase | resta l'ultimo valore | invariato: la fase torna «dichiarata» |
| Commessa | media semplice delle fasi (`uguale`); pesata per `durata`/`venduto` dalla M4 | — |

La fase `completata` conta 100 anche con `percentuale` a 0 (`avanzamentoFase`): vale per tutte le regole sopra.

## 4. File

| File | Cosa | Milestone |
|---|---|---|
| Crea `src/lib/orders/sottofasi.ts` | Avanzamento da sottofasi, specchio dello stato della fase, raggruppo per fase; (M3) voci del rapportino con le spunte | M1, M3 |
| Crea `supabase/migrations/20281007130000_sottofasi_commessa.sql` | Tabella, guardia, ricalcolo, RLS | M1 |
| Crea `src/hooks/useSottofasi.ts` | Lettura e scritture delle sottofasi di una commessa | M1 |
| Crea `src/components/orders/SottofasiFase.tsx` | Checklist nella fase aperta | M1 |
| Modifica `src/lib/orders/refreshWorkQueries.ts` | Le nuove chiavi si aggiornano insieme alle fasi | M1 |
| Modifica `src/components/orders/OrderWorkPhases.tsx` | Sottofasi nella fase; fase derivata: stato e «Rettifica» spenti; il dialog usa il picker; «Salva come modello»; media pesata | M1, M2, M4 |
| Crea `src/lib/orders/modelliFasi.ts` | Tipi dei modelli, elenco (azienda + base − nascosti), validazione, riordino | M2 |
| Crea `supabase/migrations/20281007140000_modelli_fasi_azienda.sql` | Tabelle dei modelli, `company_fasi_settings`, 5 RPC | M2 |
| Crea `src/hooks/useModelliFasi.ts` | Lettura/scrittura modelli e impostazioni | M2 |
| Crea `src/components/orders/ModelliFasiPicker.tsx`, `SalvaFasiComeModello.tsx` | Il «Parti da un modello» con i modelli dell'azienda; il salvataggio delle fasi di una commessa come modello | M2 |
| Modifica `src/hooks/useOrderWorkPhases.ts` | `applyTemplate` chiama la RPC con fasi e sottofasi | M2 |
| Crea `src/pages/azienda/settings/SettingsModelliFasi.tsx`, `src/components/settings/ModelliFasiConfig.tsx`, `ModelloFasiEditor.tsx` | Pagina «Modelli di fasi» (dalla M4: «Fasi e avanzamento») | M2 |
| Modifica `src/routes/companyRoutes.tsx`, `CompanyLayout.tsx`, `SettingsLayout.tsx`, `SettingsSearch.tsx`, `src/lib/impostazioni/pianoImpostazioni.ts`, `SettingsMobileHub.tsx` | Registrazione della pagina | M2, M4 |
| Modifica `src/pages/campo/CampoAvanzamento.tsx` | Checklist; la fase con sottofasi non si chiude a mano | M3 |
| Crea `src/components/campo/SottofasiRapportino.tsx`; modifica `src/pages/campo/CampoRapportino.tsx`, `src/components/orders/OrdineRapportiniCampo.tsx` | Checklist nel rapportino; all'approvazione le sottofasi diventano fatte | M3 |
| Crea `src/lib/orders/avanzamentoCommessa.ts` | Media della commessa: alla pari / per durata / per venduto | M4 |
| Crea `supabase/migrations/20281007150000_peso_media_avanzamento.sql` | `peso_media`, `recompute_order_progress` pesato, rollup anche su date e venduto | M4 |
| Crea `src/hooks/usePesoMediaFasi.ts`, `src/components/settings/AvanzamentoCommessaConfig.tsx`; modifica `CronoprogrammaCommessa.tsx` | La scelta del peso e lo stesso numero in tutti i punti | M4 |
| Crea `src/lib/orders/salNetto.ts` e `supabase/functions/_shared/salNetto.ts`; modifica `SalTab.tsx`, `supabase/functions/generate-sal-pdf/index.ts` | «Meno SAL precedenti» (due copie della funzione, un test di parità) | M5 (dopo l'OK) |
| Test nuovi | `sottofasi.test.ts`, `sottofasiMigrazione.test.ts`, `sottofasiFase.test.tsx`, `modelliFasi.test.ts`, `modelliFasiMigrazione.test.ts`, `modelliFasiPicker.test.tsx`, `modelliFasiConfig.test.tsx`, `salvaFasiComeModello.test.tsx`, `campoAvanzamentoSottofasi.test.tsx`, `sottofasiCantiere.test.ts`, `avanzamentoCommessa.test.ts`, `pesoMediaMigrazione.test.ts`, `avanzamentoCommessaConfig.test.tsx`, `salNetto.test.ts`, `salTabNetto.test.tsx`, `salPdfNetto.test.ts` | tutte |
| Test da ritoccare | `orderWorkPlanning.test.tsx` e `commessaTelefono.test.tsx` (finti dei nuovi hook), `campoRapportinoRegole.test.tsx` (fasi e sottofasi nel harness); si **lanciano** `faseCampiProtetti.test.ts` e `impostazioniDelPiano.test.tsx` | tutte |

## 5. Ordine di rilascio

| Milestone | Cosa ottiene l'azienda | Migrazione | Da sola è utile perché |
|---|---|---|---|
| **M1 — Sottofasi** (ufficio) | In ogni fase l'ufficio aggiunge le sottofasi e le segna; la percentuale della fase e della commessa si calcola da sole. | `20281007130000` | È il cuore dell'idea; senza cantiere e senza modelli funziona già dalla scheda di commessa. |
| **M2 — Modelli per azienda** | Impostazioni → «Modelli di fasi»; «Scegli le fasi» offre prima i modelli dell'azienda, con le loro sottofasi; «Salva come modello» da una commessa riuscita. | `20281007140000` | Risolve il secondo punto della tua richiesta. Dipende da M1 solo per le sottofasi dei modelli. |
| **M3 — Sottofasi dal cantiere** | Il capocantiere e chi lavora «la sua fase» spuntano le sottofasi dal telefono. | nessuna | Chiude il giro: chi sta in cantiere non deve telefonare all'ufficio. |
| **M4 — Peso nella media** | Per azienda: la commessa pesa le fasi alla pari, per durata o per venduto. | `20281007150000` | «Demolizione da 800 €» non pesa più come «Impianto da 18.000 €». |
| **M5 — SAL netto** | Il verbale mostra «maturato − già fatturato = da fatturare ora». | da decidere | Solo dopo il tuo OK sulla definizione di «già maturato» (testo all'inizio della M5): tocca soldi e il PDF che va al cliente. |

**Già verificato il 07/10/2026** (mentre scrivevo il piano, senza applicare niente):
- L'SQL delle tre migrazioni (M1, M2, M4) e le loro prove dei Task 3, 9 e 20 sono stati lanciati su produzione, sull'azienda demo, **dentro una transazione annullata** (una `execute_sql` è una transazione sola: l'ho controllato con una tabella di prova, che non è rimasta). Tutti i controlli passano, compresi i permessi di un operaio assegnato, di un amministratore e di un utente di un'altra azienda, e — per la M4 — il controllo `KO 0`: con «alla pari» nessuna commessa vera cambia numero. Dopo le prove il database è identico a prima.
- Il codice puro del piano (logica delle sottofasi, dei modelli, della media pesata, del SAL netto), la checklist `SottofasiFase` e i test sul testo delle migrazioni sono stati scritti nel repo, provati (90 test, tipi puliti con il tsconfig mirato) e **tolti**: il piano è l'unica cosa che c'è nel repo.
- Trovato e corretto nel piano: `user_roles` non ha `company_id` (l'azienda si legge da `profiles`); due `sottofasi: []` che il compilatore leggeva come `any[]`; un test di migrazione che vietava anche la policy restrittiva «utente bloccato».
- Nel registro delle migrazioni di produzione c'è già `20281006170000`, non presente in questo branch (viene da un'altra sessione): non confligge con le versioni di questo piano.

**Decisioni che mi servono (non bloccano M1–M4, sì M5 e il resto):**
1. **OK per applicare le migrazioni in produzione**, una alla volta: M1, M2, M4 sono additive (tabelle nuove e funzioni; nessun dato esistente cambia). Prima di ognuna c'è una prova SQL in una transazione annullata.
2. La migrazione `20281007120000_campo_regole_ore_proprie.sql` (rapportini «ore proprie») è ancora **solo un file**: senza applicarla, scegliere quell'opzione dà «Scelta non valida». Va applicata prima del prossimo push.
3. Semaforo margine: tenere le soglie fisse 30/20 o passare alla soglia configurata (`marginalita_soglia_perc`)? Cambierebbe i colori per tutti.
4. Approvazione ufficio obbligatoria: le ore non approvate non devono pesare sui costi? (tocca l'aggregazione dei costi).
5. Fatturazione a SAL: il SAL «firmato» deve creare/agganciare una rata o una fattura? Quale?
6. Subappaltatori: serve un SAL o una registrazione ore dedicata per ditta?
7. SAL «a misura» (quantità eseguita × prezzo unitario): serve, o i contratti sono tutti «a corpo»? (richiede unità di misura e quantità nelle voci).

---

# Milestone 1 — Sottofasi (database + ufficio)

### Task 1: logica pura delle sottofasi

**Files:**
- Create: `src/lib/orders/sottofasi.ts`
- Test: `src/test/logic/sottofasi.test.ts`

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/sottofasi.test.ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import {
  avanzamentoDaSottofasi,
  faseHaSottofasi,
  riepilogoSottofasi,
  sottofaseDaRiga,
  sottofasiPerFase,
  statoFaseDaAvanzamento,
} from "@/lib/orders/sottofasi";

const s = (peso: number, fatta: boolean) => ({ peso, fatta });

describe("avanzamentoDaSottofasi", () => {
  it("senza sottofasi non c'è un avanzamento derivato", () => {
    expect(avanzamentoDaSottofasi([])).toBeNull();
  });
  it("pesi uguali: parte fatta sul totale", () => {
    expect(avanzamentoDaSottofasi([s(1, true), s(1, false), s(1, false), s(1, false)])).toBe(25);
  });
  it("pesi diversi: conta il peso, non il numero", () => {
    expect(avanzamentoDaSottofasi([s(3, true), s(1, false)])).toBe(75);
  });
  it("arrotonda come il database: 1/8 = 12,5 → 13", () => {
    expect(avanzamentoDaSottofasi(Array.from({ length: 8 }, (_, i) => s(1, i === 0)))).toBe(13);
  });
  it("tutte fatte 100, nessuna 0", () => {
    expect(avanzamentoDaSottofasi([s(2, true), s(5, true)])).toBe(100);
    expect(avanzamentoDaSottofasi([s(2, false)])).toBe(0);
  });
  it("un peso non valido conta 1", () => {
    expect(avanzamentoDaSottofasi([s(0, true), s(-4, false)])).toBe(50);
  });
});

describe("statoFaseDaAvanzamento (specchio di ricalcola_fase_da_sottofasi)", () => {
  it.each([
    ["da_iniziare", 0, "da_iniziare"],
    ["in_corso", 0, "in_corso"],
    ["completata", 0, "in_corso"],
    ["da_iniziare", 40, "in_corso"],
    ["completata", 80, "in_corso"],
    ["in_corso", 100, "completata"],
    ["da_iniziare", 100, "completata"],
    ["completata", 100, "completata"],
  ] as const)("%s a %s%% → %s", (attuale, percentuale, atteso) => {
    expect(statoFaseDaAvanzamento(attuale, percentuale)).toBe(atteso);
  });
});

describe("riepilogoSottofasi e faseHaSottofasi", () => {
  it("conta fatte e totali", () => {
    expect(riepilogoSottofasi([{ fatta: true }, { fatta: false }, { fatta: true }])).toEqual({ fatte: 2, totale: 3 });
    expect(riepilogoSottofasi([])).toEqual({ fatte: 0, totale: 0 });
  });
  it("una fase deriva dalle sottofasi solo se ne ha almeno una", () => {
    expect(faseHaSottofasi(undefined)).toBe(false);
    expect(faseHaSottofasi([])).toBe(false);
    expect(faseHaSottofasi([{}])).toBe(true);
  });
});

describe("sottofasiPerFase", () => {
  it("raggruppa per fase e ordina per posizione", () => {
    const m = sottofasiPerFase([
      { id: "c", phase_id: "p1", position: 2 },
      { id: "a", phase_id: "p1", position: 0 },
      { id: "x", phase_id: "p2", position: 0 },
      { id: "b", phase_id: "p1", position: 1 },
    ]);
    expect(m.get("p1")!.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(m.get("p2")!.map((r) => r.id)).toEqual(["x"]);
    expect(m.get("p3")).toBeUndefined();
  });
});

describe("sottofaseDaRiga", () => {
  it("normalizza una riga del database", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z" })).toEqual({
      id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z",
    });
  });
  it("riempie i vuoti: peso 1, non fatta", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1" })).toEqual({
      id: "s1", phase_id: "p1", name: "", position: 0, peso: 1, fatta: false, fatta_il: null,
    });
  });
});

describe("refreshWorkQueries", () => {
  it("aggiorna anche le sottofasi della commessa", () => {
    const qc = new QueryClient();
    const spia = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, "o1");
    expect(spia).toHaveBeenCalledWith({ queryKey: ["order_work_subphases", "o1"] });
    expect(spia).toHaveBeenCalledWith({ queryKey: ["campo-sottofasi"] });
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/logic/sottofasi.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orders/sottofasi"`.

- [ ] **Step 3: scrivi il modulo**

```ts
// src/lib/orders/sottofasi.ts
/**
 * Sottofasi di una fase di lavoro (07/10/2026).
 *
 * Una fase che ha sottofasi ne deriva l'avanzamento: la parte di peso già
 * fatta. Il calcolo vero lo fa il database (ricalcola_fase_da_sottofasi); qui
 * c'è lo specchio, per mostrare l'anteprima e per tenere le regole scritte e
 * provate in un posto solo. Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseStatus } from "@/hooks/useOrderWorkPhases";

export interface Sottofase {
  id: string;
  phase_id: string;
  name: string;
  position: number;
  /** Intero 1–100: quanto pesa nel calcolo della fase. */
  peso: number;
  fatta: boolean;
  fatta_il: string | null;
}

const pesoValido = (peso: number): number => (Number.isFinite(peso) && peso >= 1 ? peso : 1);

/** Avanzamento 0–100 di una fase dalle sue sottofasi; `null` se non ne ha. */
export function avanzamentoDaSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "peso" | "fatta">>): number | null {
  if (sottofasi.length === 0) return null;
  let totale = 0;
  let fatto = 0;
  for (const s of sottofasi) {
    const peso = pesoValido(s.peso);
    totale += peso;
    if (s.fatta) fatto += peso;
  }
  return Math.round((100 * fatto) / totale);
}

/** Lo stato in cui il database porta la fase dopo aver ricalcolato la percentuale. */
export function statoFaseDaAvanzamento(attuale: PhaseStatus, percentuale: number): PhaseStatus {
  if (percentuale >= 100) return "completata";
  // Una sottofase riaperta (o aggiunta) a una fase chiusa la riapre.
  if (attuale === "completata") return "in_corso";
  if (percentuale > 0) return "in_corso";
  // 0%: «da iniziare» e «in corso» restano come sono.
  return attuale;
}

export function faseHaSottofasi(sottofasi: ReadonlyArray<unknown> | undefined): boolean {
  return (sottofasi?.length ?? 0) > 0;
}

export function riepilogoSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "fatta">>): { fatte: number; totale: number } {
  return { fatte: sottofasi.filter((s) => s.fatta).length, totale: sottofasi.length };
}

export function sottofasiPerFase<T extends Pick<Sottofase, "phase_id" | "position">>(righe: ReadonlyArray<T>): Map<string, T[]> {
  const mappa = new Map<string, T[]>();
  for (const riga of righe) {
    const lista = mappa.get(riga.phase_id);
    if (lista) lista.push(riga);
    else mappa.set(riga.phase_id, [riga]);
  }
  for (const lista of mappa.values()) lista.sort((a, b) => a.position - b.position);
  return mappa;
}

export function sottofaseDaRiga(r: Record<string, unknown>): Sottofase {
  return {
    id: String(r.id),
    phase_id: String(r.phase_id),
    name: typeof r.name === "string" ? r.name : "",
    position: Number(r.position) || 0,
    peso: pesoValido(Number(r.peso)),
    fatta: r.fatta === true,
    fatta_il: typeof r.fatta_il === "string" ? r.fatta_il : null,
  };
}
```

- [ ] **Step 4: aggiungi le chiavi a `refreshWorkQueries`**

In `src/lib/orders/refreshWorkQueries.ts` aggiungi `"order_work_subphases"` alla fine di `orderKeys` e `"campo-sottofasi"` alla fine di `sharedKeys`:

```ts
    "campo-rapportini-ordine", "campo-rapportino-gia-oggi", "campo-lavoro-rapportino-oggi",
    "order_work_subphases",
  ];
  const sharedKeys = [
    // …le chiavi che ci sono già restano…
    "campo-rapportini-sospesi", "campo-assignments", "campo-lavori-full", "campo-rapportini-da-compilare", "campo-labor-review",
    "campo-sottofasi",
  ];
```

- [ ] **Step 5: lancia i test, devono passare**

Run: `npx vitest run src/test/logic/sottofasi.test.ts`
Expected: PASS (tutti i casi).

- [ ] **Step 6: commit**

```bash
git add src/lib/orders/sottofasi.ts src/lib/orders/refreshWorkQueries.ts src/test/logic/sottofasi.test.ts
git commit -m "Sottofasi: logica pura dell'avanzamento di una fase dalle sue sottofasi"
```

### Task 2: la migrazione delle sottofasi (file + test sul testo)

**Files:**
- Create: `supabase/migrations/20281007130000_sottofasi_commessa.sql`
- Test: `src/test/logic/sottofasiMigrazione.test.ts`

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007130000_*.sql`
Expected: `ls: … No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo della migrazione (fallisce: il file non c'è)**

```ts
// src/test/logic/sottofasiMigrazione.test.ts
/**
 * Sottofasi della commessa (07/10/2026): cosa tiene ferma la migrazione.
 * Il comportamento vero si prova sul database (Task 3); qui si impedisce che
 * un ritocco al file tolga una protezione senza che nessuno se ne accorga.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007130000_sottofasi_commessa.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");

describe("migrazione sottofasi_commessa", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create table if not exists public\.order_work_subphases/);
    expect(codice).toMatch(/create or replace function public\.ricalcola_fase_da_sottofasi/);
    expect(codice).toMatch(/drop trigger if exists trg_sottofasi_guardia/);
    expect(codice).toMatch(/drop policy if exists sottofasi_lettura/);
  });

  it("non tocca order_work_phases: nessuna colonna e nessun trigger nuovo sulla tabella", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
    expect(codice).not.toMatch(/on public\.order_work_phases\s+for each row/i);
  });

  it("la guardia guarda current_user (INVOKER) e il ricalcolo scrive come proprietario (DEFINER)", () => {
    const guardia = codice.match(/create or replace function public\.sottofase_guardia\(\)[\s\S]*?\n\$\$;/)![0];
    expect(guardia).not.toMatch(/security definer/i);
    expect(guardia).toMatch(/current_user not in \('authenticated', 'anon'\)/);
    const ricalcolo = codice.match(/create or replace function public\.ricalcola_fase_da_sottofasi[\s\S]*?\n\$\$;/)![0];
    expect(ricalcolo).toMatch(/security definer/i);
    expect(ricalcolo).toMatch(/set search_path = public/);
  });

  it("dal cantiere cambiano solo fatta, fatta_il, fatta_da e updated_at", () => {
    expect(codice).toMatch(/v_cantiere constant text\[\] := array\['fatta', 'fatta_il', 'fatta_da', 'updated_at'\];/);
  });

  it("azienda e commessa le deriva il database dalla fase", () => {
    expect(codice).toMatch(/new\.company_id := v_azienda;/);
    expect(codice).toMatch(/new\.order_id := v_commessa;/);
  });

  it("RLS attiva; anon e utenti bloccati esclusi", () => {
    expect(codice).toMatch(/alter table public\.order_work_subphases enable row level security;/);
    expect(codice).toMatch(/revoke all on public\.order_work_subphases from anon;/);
    expect(codice).toMatch(/as restrictive for all to authenticated/);
  });

  it("le funzioni nuove non sono eseguibili da nessuno", () => {
    for (const f of ["ricalcola_fase_da_sottofasi(uuid)", "trg_sottofasi_ricalcola()", "sottofase_guardia()"]) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
  });

  it("la regola dello stato è quella del piano", () => {
    expect(codice).toMatch(/when v_pct >= 100 then 'completata'/);
    expect(codice).toMatch(/when v_fase\.status = 'completata' then 'in_corso'/);
    expect(codice).toMatch(/when v_pct > 0 then 'in_corso'/);
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/sottofasiMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007130000_sottofasi_commessa.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Sottofasi della commessa: i passi di una fase, che ne determinano l'avanzamento (07/10/2026).
--
-- Oggi l'avanzamento di una fase è una percentuale dichiarata (uno slider a passi
-- di 5 nel rapportino, valido all'approvazione dell'ufficio) e il 92% delle fasi
-- reali è 0 oppure 100. Una fase come «Impianto elettrico» si fa in più passi
-- (tracce, cavi, frutti, quadro, collaudo): con le sottofasi la percentuale la
-- calcola il database, da quanti passi sono fatti, ciascuno col suo peso.
--
-- Cosa fa.
--   · order_work_subphases: una riga per sottofase. Azienda e commessa le deriva
--     sempre il database dalla fase (il client non le sceglie), così una
--     sottofase non può stare nell'azienda sbagliata.
--   · trg_sottofasi_guardia (BEFORE INSERT/UPDATE, INVOKER: guarda current_user):
--     per chi non ha «Ordini e Commesse» nell'azienda della commessa, cioè
--     l'operaio o il subappaltatore assegnato, si cambia solo se la sottofase
--     è fatta; ora e persona le scrive il database.
--   · ricalcola_fase_da_sottofasi + trg_sottofasi_ricalcola (AFTER, DEFINER):
--     scrivono percentuale e stato della fase. Girano come proprietario, quindi
--     passano da trg_fase_campi_protetti (20281006150000), che lascia passare
--     chi non è authenticated/anon. Il resto dell'app (rollup della commessa,
--     Cronoprogramma, economia, SAL) legge le stesse due colonne di sempre.
--   · RLS: legge chi è assegnato alla commessa o può vederla; scrive l'ufficio
--     («Ordini e Commesse»); il cantiere solo aggiorna (e il trigger lo limita).
--
-- Additiva: nessuna colonna di order_work_phases cambia, nessun dato viene
-- toccato, e una fase senza sottofasi si comporta esattamente come prima.

set local lock_timeout = '3s';

create table if not exists public.order_work_subphases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  phase_id uuid not null references public.order_work_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100),
  fatta boolean not null default false,
  fatta_il timestamptz,
  fatta_da uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_work_subphases_fatta_coerente check (fatta or (fatta_il is null and fatta_da is null))
);

create index if not exists order_work_subphases_fase_idx on public.order_work_subphases (phase_id, position);
create index if not exists order_work_subphases_commessa_idx on public.order_work_subphases (order_id);
create index if not exists order_work_subphases_azienda_idx on public.order_work_subphases (company_id);

-- ---------------------------------------------------------------------------
-- Ricalcolo della fase dalle sue sottofasi
-- ---------------------------------------------------------------------------
create or replace function public.ricalcola_fase_da_sottofasi(p_phase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_totale integer;
  v_fatto integer;
  v_pct integer;
  v_fase public.order_work_phases%rowtype;
  v_stato text;
begin
  select coalesce(sum(peso), 0), coalesce(sum(peso) filter (where fatta), 0)
    into v_totale, v_fatto
    from public.order_work_subphases
   where phase_id = p_phase_id;

  -- Senza sottofasi la fase resta com'è: percentuale dichiarata.
  if v_totale = 0 then
    return;
  end if;

  select * into v_fase from public.order_work_phases where id = p_phase_id for update;
  if not found then
    return;
  end if;

  v_pct := round(100.0 * v_fatto / v_totale)::integer;

  v_stato := case
    when v_pct >= 100 then 'completata'
    when v_fase.status = 'completata' then 'in_corso'   -- una sottofase riaperta riapre la fase
    when v_pct > 0 then 'in_corso'
    else v_fase.status                                  -- 0%: da_iniziare e in_corso restano
  end;

  if v_fase.percentuale is not distinct from v_pct and v_fase.status is not distinct from v_stato then
    return;
  end if;

  update public.order_work_phases
     set percentuale = v_pct,
         status = v_stato,
         completata_il = case when v_stato = 'completata' then coalesce(v_fase.completata_il, now()) else null end,
         completata_da = case when v_stato = 'completata' then coalesce(v_fase.completata_da, (select auth.uid())) else null end,
         updated_at = now()
   where id = p_phase_id;
end;
$$;

create or replace function public.trg_sottofasi_ricalcola()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ricalcola_fase_da_sottofasi(coalesce(new.phase_id, old.phase_id));
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardia: azienda dalla fase, ora e persona dal database, cantiere limitato
-- ---------------------------------------------------------------------------
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia il cantiere: spuntare una sottofase.
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at'];
  v_azienda uuid;
  v_commessa uuid;
begin
  -- Azienda e commessa sono quelle della fase: per tutti, server compreso.
  select f.company_id, f.order_id into v_azienda, v_commessa
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;
  new.company_id := v_azienda;
  new.order_id := v_commessa;

  -- Chi l'ha segnata e quando: lo scrive il database, non il client.
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();

  -- Solo le richieste degli utenti. Le funzioni SECURITY DEFINER, il service
  -- role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;

  -- Dal cantiere cambia solo se la sottofase è fatta.
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    return new;
  end if;

  raise exception 'Dal cantiere si segna solo se una sottofase è fatta: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_sottofasi_guardia on public.order_work_subphases;
create trigger trg_sottofasi_guardia
  before insert or update on public.order_work_subphases
  for each row execute function public.sottofase_guardia();

drop trigger if exists trg_sottofasi_ricalcola on public.order_work_subphases;
create trigger trg_sottofasi_ricalcola
  after insert or delete or update of fatta, peso on public.order_work_subphases
  for each row execute function public.trg_sottofasi_ricalcola();

revoke all on function public.ricalcola_fase_da_sottofasi(uuid) from public, anon, authenticated;
revoke all on function public.trg_sottofasi_ricalcola() from public, anon, authenticated;
revoke all on function public.sottofase_guardia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.order_work_subphases enable row level security;
revoke all on public.order_work_subphases from anon;

-- Legge: chi è assegnato alla commessa (app di cantiere) o può vederla.
drop policy if exists sottofasi_lettura on public.order_work_subphases;
create policy sottofasi_lettura on public.order_work_subphases for select to authenticated
  using (
    exists (select 1 from public.order_campo_assignments oca
             where oca.order_id = order_work_subphases.order_id and oca.user_id = (select auth.uid()))
    or public.order_has_employee_for_user(order_id, (select auth.uid()))
    or public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
  );

-- Scrive l'ufficio: «Ordini e Commesse» nell'azienda della commessa.
drop policy if exists sottofasi_ufficio on public.order_work_subphases;
create policy sottofasi_ufficio on public.order_work_subphases for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));

-- Il cantiere aggiorna (spunta); le colonne le limita trg_sottofasi_guardia.
drop policy if exists sottofasi_segna_cantiere on public.order_work_subphases;
create policy sottofasi_segna_cantiere on public.order_work_subphases for update to authenticated
  using (
    exists (select 1 from public.order_campo_assignments oca
             where oca.order_id = order_work_subphases.order_id and oca.user_id = (select auth.uid()))
    or public.order_has_employee_for_user(order_id, (select auth.uid()))
  )
  with check (
    exists (select 1 from public.order_campo_assignments oca
             where oca.order_id = order_work_subphases.order_id and oca.user_id = (select auth.uid()))
    or public.order_has_employee_for_user(order_id, (select auth.uid()))
  );

drop policy if exists blocco_utente_bloccato on public.order_work_subphases;
create policy blocco_utente_bloccato on public.order_work_subphases
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
```

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/sottofasiMigrazione.test.ts`
Expected: PASS (8 casi).

- [ ] **Step 6: commit locale**

La migrazione resta **non applicata** fino al Task 3 (CLAUDE.md: un file in `supabase/migrations/` va in produzione al primo push, quindi **prima di ogni push va applicata e riallineata**).

```bash
git add supabase/migrations/20281007130000_sottofasi_commessa.sql src/test/logic/sottofasiMigrazione.test.ts
git commit -m "Sottofasi: tabella, guardia, ricalcolo della fase e RLS (migrazione non ancora applicata)"
```

### Task 3: prova SQL a secco, poi applicazione (serve l'OK per la seconda parte)

**Files:** nessuno (si usa il tool MCP `execute_sql`, poi `apply_migration`).

- [ ] **Step 1: prova a secco — migrazione e verifiche nella stessa chiamata, annullata alla fine**

Una chiamata `execute_sql` è una transazione sola: il `raise exception` finale annulla tutto, DDL compreso, e **nulla resta in produzione**. Si manda in una sola `query`: il contenuto **intero** di `20281007130000_sottofasi_commessa.sql`, seguito da questo blocco.

```sql
do $prova$
declare
  v_azienda uuid;
  v_ordine uuid;
  v_fase uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_pct integer; v_stato text; v_il timestamptz; v_n integer;
  v_lavoratore uuid; v_altro uuid; v_ufficio uuid;
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id
   where u.email = 'demo@azienda.srl';

  -- Un lavoratore del cantiere (assegnato, senza «Ordini e Commesse») e la sua commessa.
  select a.user_id, a.order_id into v_lavoratore, v_ordine
    from public.order_campo_assignments a
    join public.orders o on o.id = a.order_id
   where o.company_id = v_azienda and o.deleted_at is null and a.user_id is not null
     and not public.has_permission_for_company(a.user_id, 'can_edit_orders', o.company_id)
   limit 1;
  if v_ordine is null then
    select o.id into v_ordine from public.orders o
     where o.company_id = v_azienda and o.deleted_at is null order by o.created_at limit 1;
  end if;
  if v_ordine is null then raise exception 'PROVA SALTATA: la demo non ha commesse'; end if;

  insert into public.order_work_phases (company_id, order_id, name, position)
  values (v_azienda, v_ordine, 'PROVA sottofasi', 999) returning id into v_fase;

  -- Il client non scrive azienda e commessa: le deriva il database.
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'a', 0, 1) returning id into v_s1;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'b', 1, 1) returning id into v_s2;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'c', 2, 2) returning id into v_s3;
  if (select count(*) from public.order_work_subphases where phase_id = v_fase and company_id = v_azienda and order_id = v_ordine) <> 3 then
    raise exception 'KO 1: azienda e commessa non derivate dalla fase';
  end if;

  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 0 or v_stato <> 'da_iniziare' then raise exception 'KO 2: % % (atteso 0 da_iniziare)', v_pct, v_stato; end if;

  update public.order_work_subphases set fatta = true where id = v_s1;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 25 or v_stato <> 'in_corso' then raise exception 'KO 3: % % (atteso 25 in_corso)', v_pct, v_stato; end if;
  if (select fatta_il from public.order_work_subphases where id = v_s1) is null then raise exception 'KO 4: fatta_il vuota'; end if;

  update public.order_work_subphases set fatta = true where phase_id = v_fase;
  select percentuale, status, completata_il into v_pct, v_stato, v_il from public.order_work_phases where id = v_fase;
  if v_pct <> 100 or v_stato <> 'completata' or v_il is null then raise exception 'KO 5: % % %', v_pct, v_stato, v_il; end if;

  update public.order_work_subphases set fatta = false where id = v_s3;
  select percentuale, status, completata_il into v_pct, v_stato, v_il from public.order_work_phases where id = v_fase;
  if v_pct <> 50 or v_stato <> 'in_corso' or v_il is not null then raise exception 'KO 6: % % %', v_pct, v_stato, v_il; end if;

  update public.order_work_subphases set fatta = true where id = v_s3;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'd', 3, 2);
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 7: % % (atteso 67 in_corso)', v_pct, v_stato; end if;

  if (select percentuale_avanzamento from public.orders where id = v_ordine) is distinct from
     (select round(avg(case when status = 'completata' then 100 else least(100, greatest(coalesce(percentuale, 0), 0)) end))::int
        from public.order_work_phases where order_id = v_ordine) then
    raise exception 'KO 8: la commessa non segue le fasi';
  end if;

  delete from public.order_work_subphases where phase_id = v_fase;
  select percentuale, status into v_pct, v_stato from public.order_work_phases where id = v_fase;
  if v_pct <> 67 or v_stato <> 'in_corso' then raise exception 'KO 9: % % (atteso: tiene l''ultimo valore)', v_pct, v_stato; end if;

  -- Da qui le sottofasi tornano, per provare i permessi.
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'x', 0, 1) returning id into v_s1;
  insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'y', 1, 1) returning id into v_s2;

  if v_lavoratore is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
    set local role authenticated;

    update public.order_work_subphases set fatta = true where id = v_s1;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'KO 10: il lavoratore assegnato non riesce a segnare'; end if;

    begin
      update public.order_work_subphases set name = 'rinominata' where id = v_s1;
      raise exception 'KO 11: il lavoratore ha rinominato una sottofase';
    exception when sqlstate '42501' then null;
    end;

    begin
      insert into public.order_work_subphases (phase_id, name) values (v_fase, 'z');
      raise exception 'KO 12: il lavoratore ha creato una sottofase';
    exception when sqlstate '42501' then null;
    end;

    delete from public.order_work_subphases where id = v_s2;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'KO 13: il lavoratore ha cancellato una sottofase'; end if;

    reset role;
    select percentuale into v_pct from public.order_work_phases where id = v_fase;
    if v_pct <> 50 then raise exception 'KO 14: la fase non è passata da 0 a 50 (%)', v_pct; end if;
  end if;

  -- Un utente di un'altra azienda non vede niente.
  select p.id into v_altro from public.profiles p
   where p.company_id is not null and p.company_id <> v_azienda
     and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'super_admin'::public.app_role)
   limit 1;
  if v_altro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_altro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.order_work_subphases where phase_id = v_fase;
    reset role;
    if v_n <> 0 then raise exception 'KO 15: un utente di un''altra azienda vede % sottofasi', v_n; end if;
  end if;

  -- L'ufficio (amministratore dell'azienda) aggiunge, rinomina, toglie.
  select ur.user_id into v_ufficio from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  if v_ufficio is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_ufficio, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.order_work_subphases (phase_id, name, position, peso) values (v_fase, 'ufficio', 5, 3);
    update public.order_work_subphases set name = 'ufficio 2' where phase_id = v_fase and name = 'ufficio';
    delete from public.order_work_subphases where phase_id = v_fase and name = 'ufficio 2';
    reset role;
  end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: %, altra azienda: %, ufficio: %)',
    (v_lavoratore is not null), (v_altro is not null), (v_ufficio is not null);
end
$prova$;
```

Expected: l'errore `PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: true, altra azienda: true, ufficio: true)`. Un `KO n` indica la regola che non regge: si corregge il file SQL e si ripete. Se uno dei tre ruoli risulta `false`, quella parte della prova è saltata: scegli un'altra commessa/azienda e ripeti prima di applicare.

- [ ] **Step 2: chiedi l'OK e applica**

Con l'OK dell'utente, tool MCP `apply_migration` con `name: "sottofasi_commessa"` e `query` = contenuto del file. Poi, **subito**, riallinea la versione (CLAUDE.md, punto 3):

```sql
update supabase_migrations.schema_migrations
   set version = '20281007130000'
 where name = 'sottofasi_commessa' and left(version, 4) = '2026';
```

- [ ] **Step 3: verifica dopo l'applicazione**

```sql
-- 1 riga: la versione del file
select version, name from supabase_migrations.schema_migrations where version = '20281007130000';
-- 0 righe: le funzioni nuove non sono eseguibili da anon né authenticated
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ricalcola_fase_da_sottofasi', 'trg_sottofasi_ricalcola', 'sottofase_guardia')
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- 0 righe: il backup copre la tabella nuova (CLAUDE.md, «Backup e ripristino»)
select * from public.admin_backup_tabelle_scoperte();
```

### Task 4: l'hook delle sottofasi

**Files:**
- Create: `src/hooks/useSottofasi.ts`

- [ ] **Step 1: scrivi l'hook** (sottile: la logica sta in `sottofasi.ts`, già provata)

```ts
// src/hooks/useSottofasi.ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

// La tabella non è ancora nei tipi generati: cast localizzato, come useOrderWorkPhases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le sottofasi di una commessa e i comandi per cambiarle. */
export function useSottofasi(orderId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  // Cambiare una sottofase cambia la fase (e la commessa): si aggiorna tutto il giro.
  const aggiorna = () => refreshWorkQueries(qc, orderId);
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Operazione non riuscita. Riprova.");

  const query = useQuery({
    queryKey: ["order_work_subphases", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<Sottofase[]> => {
      const { data, error } = await db
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il")
        .eq("order_id", orderId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
  });

  const perFase = useMemo(() => sottofasiPerFase(query.data ?? []), [query.data]);

  const segna = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const aggiungi = useMutation({
    mutationFn: async ({ phaseId, nome }: { phaseId: string; nome: string }) => {
      // Azienda e commessa le riscrive il database dalla fase: qui solo per chiarezza.
      const { error } = await db.from("order_work_subphases").insert({
        company_id: companyId, order_id: orderId, phase_id: phaseId, name: nome,
        position: (perFase.get(phaseId) ?? []).length,
      });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const rinomina = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").update({ name: nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_subphases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  return { sottofasi: query.data ?? [], perFase, isLoading: query.isLoading, isError: query.isError, segna, aggiungi, rinomina, elimina };
}
```

- [ ] **Step 2: typecheck mirato** sul file nuovo (vedi memoria `reference_typecheck_mirato`).
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add src/hooks/useSottofasi.ts
git commit -m "Sottofasi: hook per leggere e cambiare le sottofasi di una commessa"
```

### Task 5: il componente «Sottofasi» della fase

**Files:**
- Create: `src/components/orders/SottofasiFase.tsx`
- Test: `src/test/ui/sottofasiFase.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/sottofasiFase.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SottofasiFase } from "@/components/orders/SottofasiFase";
import type { Sottofase } from "@/lib/orders/sottofasi";

const riga = (patch: Partial<Sottofase> = {}): Sottofase => ({
  id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch,
});
const azioni = () => ({ onSegna: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn() });
afterEach(cleanup);

describe("SottofasiFase", () => {
  it("dice quante sono fatte e la percentuale che ne deriva", () => {
    render(
      <SottofasiFase
        nomeFase="Impianto" puoModificare puoSegnare {...azioni()}
        sottofasi={[riga({ fatta: true }), riga({ id: "s2", name: "Cavi" }), riga({ id: "s3", name: "Quadro" })]}
      />,
    );
    expect(screen.getByText("1 di 3 · 33%")).toBeInTheDocument();
    expect(screen.getByText("L'avanzamento di questa fase si calcola dalle sottofasi fatte.")).toBeInTheDocument();
  });

  it("segna e toglie la spunta", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga(), riga({ id: "s2", name: "Cavi", fatta: true })]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tracce: da fare" }));
    expect(a.onSegna).toHaveBeenCalledWith("s1", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: fatta" }));
    expect(a.onSegna).toHaveBeenCalledWith("s2", false);
  });

  it("senza sottofasi l'ufficio vede solo un invito discreto, e la fase resta com'era", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.getByRole("button", { name: "Dividi in sottofasi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'avanzamento di questa fase si calcola/)).not.toBeInTheDocument();
  });

  it("aggiunge con il nome ripulito, e non aggiunge un nome vuoto", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    const bottone = screen.getByRole("button", { name: "Aggiungi" });
    expect(bottone).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Aggiungi una sottofase a Impianto"), { target: { value: "  Cavi  " } });
    fireEvent.click(bottone);
    expect(a.onAggiungi).toHaveBeenCalledWith("Cavi");
  });

  it("rinomina con Invio e toglie dal cestino", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rinomina Tracce" }));
    const campo = screen.getByLabelText("Nome della sottofase Tracce");
    fireEvent.change(campo, { target: { value: "Tracce e scassi" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(a.onRinomina).toHaveBeenCalledWith("s1", "Tracce e scassi");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tracce" }));
    expect(a.onElimina).toHaveBeenCalledWith("s1");
  });

  it("senza il permesso di modificare non ci sono comandi per aggiungere, rinominare o togliere", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()} sottofasi={[riga()]} />);
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rinomina Tracce" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Tracce" })).not.toBeInTheDocument();
  });

  it("senza il permesso di segnare le caselle sono spente", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[riga()]} />);
    expect(screen.getByRole("checkbox", { name: "Tracce: da fare" })).toBeDisabled();
  });

  it("senza sottofasi e in sola lettura non compare niente", () => {
    const { container } = render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/sottofasiFase.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/SottofasiFase"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/SottofasiFase.tsx
import { useState } from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, riepilogoSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

interface SottofasiFaseProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** L'ufficio aggiunge, rinomina e toglie. */
  puoModificare: boolean;
  /** Spuntare: l'ufficio, o chi lavora sul cantiere. */
  puoSegnare: boolean;
  onSegna: (id: string, fatta: boolean) => void;
  onAggiungi: (nome: string) => void;
  onRinomina: (id: string, nome: string) => void;
  onElimina: (id: string) => void;
  className?: string;
}

/** I passi di una fase: spuntati, ne decidono l'avanzamento. */
export function SottofasiFase({
  nomeFase, sottofasi, puoModificare, puoSegnare, onSegna, onAggiungi, onRinomina, onElimina, className,
}: SottofasiFaseProps) {
  const [nuova, setNuova] = useState("");
  const [aperta, setAperta] = useState(false);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState("");
  const { fatte, totale } = riepilogoSottofasi(sottofasi);

  if (totale === 0 && !puoModificare) return null;

  // Una fase senza sottofasi resta com'era: solo un invito discreto a dividerla.
  if (totale === 0 && !aperta) {
    return (
      <Button type="button" variant="ghost" size="sm" className={cn("h-8 w-fit px-2 text-xs text-muted-foreground", className)} onClick={() => setAperta(true)}>
        <ListChecks className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Dividi in sottofasi
      </Button>
    );
  }

  const aggiungi = () => {
    const nome = nuova.trim();
    if (!nome) return;
    onAggiungi(nome);
    setNuova("");
  };

  const conferma = (s: Sottofase) => {
    const nome = bozza.trim();
    setInModifica(null);
    if (nome && nome !== s.name) onRinomina(s.id, nome);
  };

  return (
    <section aria-label={`Sottofasi di ${nomeFase}`} className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Sottofasi
        </h4>
        {totale > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fatte} di {totale} · {avanzamentoDaSottofasi(sottofasi)}%
          </span>
        )}
      </div>
      {totale > 0 && (
        <p className="text-xs text-muted-foreground">L'avanzamento di questa fase si calcola dalle sottofasi fatte.</p>
      )}
      <ul className="space-y-0.5">
        {sottofasi.map((s) => (
          <li key={s.id} className="flex min-h-9 items-center gap-2 rounded-md px-1">
            <Checkbox
              checked={s.fatta}
              disabled={!puoSegnare}
              onCheckedChange={(v) => onSegna(s.id, v === true)}
              aria-label={`${s.name}: ${s.fatta ? "fatta" : "da fare"}`}
            />
            {inModifica === s.id ? (
              <Input
                autoFocus
                value={bozza}
                aria-label={`Nome della sottofase ${s.name}`}
                onChange={(e) => setBozza(e.target.value)}
                onBlur={() => conferma(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); conferma(s); }
                  else if (e.key === "Escape") setInModifica(null);
                }}
                className="h-8 min-w-0 flex-1 text-sm"
              />
            ) : (
              <span className={cn("min-w-0 flex-1 break-words text-sm", s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
            )}
            {puoModificare && inModifica !== s.id && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`Rinomina ${s.name}`}
                  onClick={() => { setBozza(s.name); setInModifica(s.id); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label={`Elimina ${s.name}`} onClick={() => onElimina(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {puoModificare && (
        <div className="flex items-center gap-2">
          <Input
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }}
            placeholder="Aggiungi una sottofase"
            aria-label={`Aggiungi una sottofase a ${nomeFase}`}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" onClick={aggiungi} disabled={!nuova.trim()}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/sottofasiFase.test.tsx`
Expected: PASS (8 casi).

- [ ] **Step 5: commit**

```bash
git add src/components/orders/SottofasiFase.tsx src/test/ui/sottofasiFase.test.tsx
git commit -m "Sottofasi: la checklist della fase, con spunta, aggiunta, rinomina e cestino"
```

### Task 6: le sottofasi dentro la fase aperta

**Files:**
- Modify: `src/components/orders/OrderWorkPhases.tsx` (importazioni; il `<PhaseCard …/>` a ~riga 633; `PhaseCardProps` a ~747; il corpo della fase a ~1171-1214; il bottone «%» a ~1051; `tendinaStato` a ~900)
- Modify: `src/test/ui/orderWorkPlanning.test.tsx`, `src/test/ui/commessaTelefono.test.tsx` (mock del nuovo hook)
- Test: `src/test/ui/orderWorkPlanning.test.tsx` (un caso nuovo)

- [ ] **Step 1: aggiorna i mock dei due test che montano `OrderWorkPhases`**

Quei test sostituiscono `@tanstack/react-query` con un finto che ha solo `useQuery`: il nuovo hook, che usa `useMutation`, va finto a sua volta. In **entrambi** i file, accanto agli altri `vi.mock(...)`:

```tsx
vi.mock("@/hooks/useSottofasi", () => ({
  useSottofasi: () => ({
    sottofasi: [] as unknown[], perFase: new Map(), isLoading: false, isError: false,
    segna: { mutate: state.segnaSottofase }, aggiungi: { mutate: state.aggiungiSottofase },
    rinomina: { mutate: vi.fn() }, elimina: { mutate: vi.fn() },
  }),
}));
```

e nello `state` hoisted aggiungi `segnaSottofase: vi.fn(), aggiungiSottofase: vi.fn(),` (accanto a `addPhase: vi.fn()`). Per fare un caso con sottofasi vere, in `orderWorkPlanning.test.tsx` rendi la mappa leggibile dallo `state`:

```tsx
// nello state hoisted:  sottofasiPerFase: new Map<string, unknown[]>(),
// nel mock:             perFase: state.sottofasiPerFase,
```

- [ ] **Step 2: scrivi il caso che fallisce** (in `orderWorkPlanning.test.tsx`, nel `describe` principale)

```tsx
  it("una fase con sottofasi mostra la checklist e non si corregge a mano", () => {
    state.sottofasiPerFase = new Map([["p1", [
      { id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: true, fatta_il: null },
      { id: "s2", phase_id: "p1", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null },
    ]]]);
    // la fase «in corso» si apre da sola: la checklist è già visibile
    draw();
    expect(screen.getByText("1 di 2 · 50%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    expect(state.segnaSottofase).toHaveBeenCalledWith({ id: "s2", fatta: true });
    // la percentuale non si corregge a mano: la decidono le sottofasi
    expect(screen.getByRole("button", { name: /Avanzamento Opere murarie/ })).toBeDisabled();
  });
```
e nel `beforeEach` aggiungi `state.sottofasiPerFase = new Map();`.

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx`
Expected: FAIL — il caso nuovo (nessuna checklist nella fase).

- [ ] **Step 3: importazioni e hook in `OrderWorkPhases`**

In cima a `src/components/orders/OrderWorkPhases.tsx`, con le altre importazioni:

```tsx
import { useSottofasi } from "@/hooks/useSottofasi";
import { SottofasiFase } from "./SottofasiFase";
import { faseHaSottofasi, type Sottofase } from "@/lib/orders/sottofasi";
```

Nel componente `OrderWorkPhases`, accanto a `const { phases, … } = useOrderWorkPhases(orderId)`:

```tsx
  const { perFase: sottofasiDi, segna: segnaSottofase, aggiungi: aggiungiSottofase, rinomina: rinominaSottofase, elimina: eliminaSottofase } = useSottofasi(orderId);
```

Nel `<PhaseCard …/>` (~riga 633), dopo `fasiOpzioni={phaseOptions}`:

```tsx
                sottofasi={sottofasiDi.get(phase.id) ?? []}
                azioniSottofasi={{
                  onSegna: (id, fatta) => segnaSottofase.mutate({ id, fatta }),
                  onAggiungi: (nome) => aggiungiSottofase.mutate({ phaseId: phase.id, nome }),
                  onRinomina: (id, nome) => rinominaSottofase.mutate({ id, nome }),
                  onElimina: (id) => eliminaSottofase.mutate(id),
                }}
```

In `PhaseCardProps` (~riga 747), dopo `fasiOpzioni`:

```tsx
  /** Le sottofasi della fase: se ce ne sono, la percentuale ne deriva. */
  sottofasi: Sottofase[];
  azioniSottofasi: {
    onSegna: (id: string, fatta: boolean) => void;
    onAggiungi: (nome: string) => void;
    onRinomina: (id: string, nome: string) => void;
    onElimina: (id: string) => void;
  };
```

e nella lista dei parametri di `function PhaseCard({ … })` aggiungi `sottofasi, azioniSottofasi,`.

- [ ] **Step 4: la fase derivata non si corregge a mano**

Dentro `PhaseCard`, vicino a `const actualPct = …` (~riga 940):

```tsx
  // Con le sottofasi la percentuale e lo stato li calcola il database: a mano
  // verrebbero riscritti alla prossima spunta.
  const derivata = faseHaSottofasi(sottofasi);
```

Nel bottone «%» (~riga 1051) cambia `disabled` e `title`:

```tsx
                    disabled={!canEditOrders || derivata}
                    // …gli altri attributi del bottone restano…
                    title={derivata ? "Si calcola dalle sottofasi" : "Correggi l'avanzamento della fase"}
```

In `tendinaStato` (~riga 900) spegni la tendina:

```tsx
    <Select value={phase.status} disabled={derivata} onValueChange={(v) => onUpdatePhase({ status: v as PhaseStatus })}>
```

- [ ] **Step 5: monta la checklist nel corpo della fase**

Nel corpo aperto (`<CardContent id={`phase-body-${phase.id}`} …>`, ~riga 1171), subito **dopo** il blocco «Quando» (chiude con `</div>` prima del commento `{/* ── Economia: venduto, … ── */}`, ~riga 1214) e prima di quel commento:

```tsx
              {/* ── Sottofasi: i passi che decidono l'avanzamento ── */}
              <SottofasiFase
                nomeFase={phase.name}
                sottofasi={sottofasi}
                puoModificare={canEditOrders}
                puoSegnare={canEditOrders}
                {...azioniSottofasi}
              />
```

- [ ] **Step 6: lancia i test della scheda, devono passare**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx`
Expected: PASS (caso nuovo compreso; gli altri invariati).

- [ ] **Step 7: tutta la suite UI e logica, per trovare altri mock rotti**

Run: `npx vitest run src/test/ui src/test/logic`
Expected: PASS, salvo il fallimento già noto `tettiTemplateModules.test.tsx` (2 test, area Tetti, non c'entra). Qualunque altro test che monta `OrderWorkPhases` e finge `@tanstack/react-query` riceve lo stesso `vi.mock("@/hooks/useSottofasi", …)` del Step 1.

- [ ] **Step 8: verifica a occhio**

`preview_start` col dev server, apri una commessa con fasi → Lavorazioni → apri una fase: «Sottofasi» (con il campo «Aggiungi una sottofase»), aggiungi tre sottofasi, spuntane una: la fase passa a «In corso» e la percentuale a 33%. Controlla anche a 375 px: la scheda resta una riga e le sottofasi compaiono solo da aperta. Dopo aver applicato la migrazione (Task 3).

- [ ] **Step 9: commit**

```bash
git add src/components/orders/OrderWorkPhases.tsx src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx
git commit -m "Fasi: le sottofasi nella fase aperta; con le sottofasi la percentuale non si corregge a mano"
```

---

# Milestone 2 — Modelli di fasi per azienda

### Task 7: logica pura dei modelli

**Files:**
- Create: `src/lib/orders/modelliFasi.ts`
- Test: `src/test/logic/modelliFasi.test.ts`

I modelli base restano dove sono (`PHASE_TEMPLATES` in `src/hooks/useOrderWorkPhases.ts`): i due test esistenti li fingono da lì. Qui si importa solo il **tipo**.

- [ ] **Step 1: scrivi i test che falliscono**

```ts
// src/test/logic/modelliFasi.test.ts
import { describe, expect, it } from "vitest";
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";
import {
  assemblaModelli, bozzaDaModello, bozzaVuota, chiaveModelloBase, eModelloBase, elencoModelli, fasiPerCommessa,
  idModelloBase, modelloDaBase, rimuovi, sostituisci, sposta, totaleSottofasi, validaBozza,
  type BozzaModello, type FaseModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";

const base: PhaseTemplate[] = [
  { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
  { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
];
const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};

describe("modelli base", () => {
  it("un modello base diventa un modello senza sottofasi, con id «base:<chiave>»", () => {
    expect(modelloDaBase(base[0])).toEqual({
      id: "base:bagno", origine: "base", nome: "Bagno", descrizione: "Rifacimento bagno",
      fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
    });
    expect(idModelloBase("bagno")).toBe("base:bagno");
    expect(chiaveModelloBase("base:bagno")).toBe("bagno");
    expect(eModelloBase("base:bagno")).toBe(true);
    expect(eModelloBase("m1")).toBe(false);
  });
});

describe("elencoModelli", () => {
  it("offre i modelli dell'azienda e tutti i base, se non ne ha nascosti", () => {
    const e = elencoModelli(base, [mio], []);
    expect(e.azienda.map((m) => m.id)).toEqual(["m1"]);
    expect(e.base.map((m) => m.id)).toEqual(["base:bagno", "base:tetto"]);
  });
  it("toglie i base nascosti e ignora le chiavi che non esistono", () => {
    expect(elencoModelli(base, [], ["tetto", "inesistente"]).base.map((m) => m.id)).toEqual(["base:bagno"]);
  });
});

describe("totaleSottofasi", () => {
  it("somma le sottofasi di tutte le fasi", () => {
    expect(totaleSottofasi(mio)).toBe(2);
    expect(totaleSottofasi(modelloDaBase(base[0]))).toBe(0);
  });
});

describe("assemblaModelli", () => {
  it("compone l'albero dalle tre tabelle e rispetta le posizioni", () => {
    const m = assemblaModelli(
      [{ id: "m2", name: "B", hint: null, position: 1 }, { id: "m1", name: "A", hint: "uno", position: 0 }],
      [{ id: "f2", template_id: "m1", name: "Seconda", position: 1 }, { id: "f1", template_id: "m1", name: "Prima", position: 0 }],
      [{ id: "s2", template_phase_id: "f1", name: "Poi", position: 1, peso: 2 }, { id: "s1", template_phase_id: "f1", name: "Prima", position: 0, peso: 1 }],
    );
    expect(m.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(m[0]).toEqual({
      id: "m1", origine: "azienda", nome: "A", descrizione: "uno",
      fasi: [
        { nome: "Prima", sottofasi: [{ nome: "Prima", peso: 1 }, { nome: "Poi", peso: 2 }] },
        { nome: "Seconda", sottofasi: [] },
      ],
    });
    expect(m[1].fasi).toEqual([]);
    expect(m[1].descrizione).toBe("");
  });
});

describe("bozze", () => {
  it("una copia è una bozza nuova, «Copia di …», con fasi e sottofasi che non sono condivise", () => {
    const copia = bozzaDaModello(mio, true);
    expect(copia.id).toBeNull();
    expect(copia.nome).toBe("Copia di Impianti completi");
    copia.fasi[0].sottofasi[0].nome = "cambiato";
    expect(mio.fasi[0].sottofasi[0].nome).toBe("Tracce");
  });
  it("il nome di una copia non supera i 80 caratteri", () => {
    expect(bozzaDaModello({ ...mio, nome: "x".repeat(80) }, true).nome).toHaveLength(80);
  });
  it("modificare un modello esistente ne tiene l'id", () => {
    expect(bozzaDaModello(mio, false)).toMatchObject({ id: "m1", nome: "Impianti completi" });
  });
  it("la bozza vuota ha una fase vuota da riempire", () => {
    expect(bozzaVuota()).toEqual({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });
  });
});

describe("validaBozza", () => {
  const ok = (patch: Partial<BozzaModello> = {}): BozzaModello => ({
    id: null, nome: "Mio", descrizione: "", fasi: [{ nome: "Demolizioni", sottofasi: [] }], ...patch,
  });
  it("senza nome non passa", () => {
    expect(validaBozza(ok({ nome: "   " }))).toEqual({ ok: false, errore: "Dai un nome al modello." });
  });
  it("senza nemmeno una fase con un nome non passa", () => {
    expect(validaBozza(ok({ fasi: [{ nome: "  ", sottofasi: [] }] }))).toEqual({ ok: false, errore: "Un modello ha almeno una fase, con un nome." });
  });
  it("ripulisce: spazi, voci vuote, peso intero tra 1 e 100, descrizione vuota → null", () => {
    const esito = validaBozza(ok({
      nome: "  Mio  ", descrizione: "   ",
      fasi: [
        { nome: " Elettrico ", sottofasi: [{ nome: " Tracce ", peso: 2.6 }, { nome: " ", peso: 5 }, { nome: "Cavi", peso: 0 }, { nome: "Quadro", peso: 500 }] },
        { nome: "", sottofasi: [{ nome: "orfana", peso: 1 }] },
      ],
    }));
    expect(esito).toEqual({
      ok: true,
      payload: {
        id: null, nome: "Mio", descrizione: null,
        fasi: [{ nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }, { nome: "Cavi", peso: 1 }, { nome: "Quadro", peso: 100 }] }],
      },
    });
  });
  it("rifiuta nomi troppo lunghi e troppe fasi o sottofasi", () => {
    expect(validaBozza(ok({ nome: "x".repeat(81) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "y".repeat(161), sottofasi: [] }] })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: Array.from({ length: 61 }, (_, i): FaseModello => ({ nome: `F${i}`, sottofasi: [] })) })).ok).toBe(false);
    expect(validaBozza(ok({ fasi: [{ nome: "F", sottofasi: Array.from({ length: 41 }, (_, i) => ({ nome: `S${i}`, peso: 1 })) }] })).ok).toBe(false);
  });
  it("tiene l'id di un modello che si sta modificando", () => {
    const esito = validaBozza(ok({ id: "m1" }));
    expect(esito.ok && esito.payload.id).toBe("m1");
  });
});

describe("fasiPerCommessa", () => {
  it("è quello che arriva a «aggiungi_fasi_commessa»: nomi e pesi interi, senza i campi del modello", () => {
    expect(fasiPerCommessa(mio)).toEqual([
      { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
      { nome: "Collaudo", sottofasi: [] },
    ]);
  });
});

describe("riordino", () => {
  it("sposta su e giù senza uscire dai bordi e senza toccare l'originale", () => {
    const l = ["a", "b", "c"];
    expect(sposta(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(sposta(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(sposta(l, 0, -1)).toEqual(["a", "b", "c"]);
    expect(sposta(l, 2, 1)).toEqual(["a", "b", "c"]);
    expect(l).toEqual(["a", "b", "c"]);
  });
  it("sostituisce e rimuove senza toccare l'originale", () => {
    const l = [{ n: "a" }, { n: "b" }];
    expect(sostituisci(l, 1, { n: "z" })).toEqual([{ n: "a" }, { n: "z" }]);
    expect(rimuovi(l, 0)).toEqual([{ n: "b" }]);
    expect(l).toEqual([{ n: "a" }, { n: "b" }]);
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/logic/modelliFasi.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orders/modelliFasi"`.

- [ ] **Step 3: scrivi il modulo**

```ts
// src/lib/orders/modelliFasi.ts
/**
 * Modelli di fasi (07/10/2026): quelli dell'azienda, con le sottofasi, e i base
 * del codice. Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseTemplate } from "@/hooks/useOrderWorkPhases";

export interface SottofaseModello { nome: string; peso: number }
export interface FaseModello { nome: string; sottofasi: SottofaseModello[] }
export type OrigineModello = "azienda" | "base";

export interface ModelloFasi {
  /** uuid del modello dell'azienda; i modelli base hanno «base:<chiave>». */
  id: string;
  origine: OrigineModello;
  nome: string;
  descrizione: string;
  fasi: FaseModello[];
}

export const PREFISSO_BASE = "base:";
export const MAX_FASI_MODELLO = 60;
export const MAX_SOTTOFASI_FASE = 40;
export const MAX_NOME_MODELLO = 80;
export const MAX_NOME_VOCE = 160;

export const idModelloBase = (chiave: string): string => `${PREFISSO_BASE}${chiave}`;
export const eModelloBase = (id: string): boolean => id.startsWith(PREFISSO_BASE);
export const chiaveModelloBase = (id: string): string => id.slice(PREFISSO_BASE.length);

export function modelloDaBase(t: PhaseTemplate): ModelloFasi {
  return {
    id: idModelloBase(t.key), origine: "base", nome: t.label, descrizione: t.hint,
    fasi: t.phases.map((nome): FaseModello => ({ nome, sottofasi: [] })),
  };
}

export interface ElencoModelli { azienda: ModelloFasi[]; base: ModelloFasi[] }

/** I modelli da offrire: quelli dell'azienda, poi i base che non ha nascosto. */
export function elencoModelli(
  base: ReadonlyArray<PhaseTemplate>,
  azienda: ReadonlyArray<ModelloFasi>,
  nascosti: ReadonlyArray<string>,
): ElencoModelli {
  const nascostiSet = new Set(nascosti);
  return { azienda: [...azienda], base: base.filter((t) => !nascostiSet.has(t.key)).map(modelloDaBase) };
}

export const totaleSottofasi = (m: Pick<ModelloFasi, "fasi">): number =>
  m.fasi.reduce((n, f) => n + f.sottofasi.length, 0);

// ── dalle tre tabelle all'albero ────────────────────────────────────────────
export interface RigaModello { id: string; name: string; hint: string | null; position: number }
export interface RigaFaseModello { id: string; template_id: string; name: string; position: number }
export interface RigaSottofaseModello { id: string; template_phase_id: string; name: string; position: number; peso: number }

export function assemblaModelli(
  modelli: ReadonlyArray<RigaModello>,
  fasi: ReadonlyArray<RigaFaseModello>,
  sottofasi: ReadonlyArray<RigaSottofaseModello>,
): ModelloFasi[] {
  const perPosizione = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const sottoPerFase = new Map<string, RigaSottofaseModello[]>();
  for (const s of sottofasi) sottoPerFase.set(s.template_phase_id, [...(sottoPerFase.get(s.template_phase_id) ?? []), s]);
  const fasiPerModello = new Map<string, RigaFaseModello[]>();
  for (const f of fasi) fasiPerModello.set(f.template_id, [...(fasiPerModello.get(f.template_id) ?? []), f]);
  return [...modelli].sort(perPosizione).map((m): ModelloFasi => ({
    id: m.id, origine: "azienda", nome: m.name, descrizione: m.hint ?? "",
    fasi: [...(fasiPerModello.get(m.id) ?? [])].sort(perPosizione).map((f) => ({
      nome: f.name,
      sottofasi: [...(sottoPerFase.get(f.id) ?? [])].sort(perPosizione).map((s) => ({ nome: s.name, peso: s.peso })),
    })),
  }));
}

// ── bozza e validazione (l'editor lavora su una bozza) ──────────────────────
export interface BozzaModello { id: string | null; nome: string; descrizione: string; fasi: FaseModello[] }
export interface PayloadModello { id: string | null; nome: string; descrizione: string | null; fasi: FaseModello[] }
export type EsitoBozza = { ok: true; payload: PayloadModello } | { ok: false; errore: string };

export const bozzaVuota = (): BozzaModello => ({ id: null, nome: "", descrizione: "", fasi: [{ nome: "", sottofasi: [] }] });

/** Duplicare un modello (base o dell'azienda) dà una bozza nuova, «Copia di …». */
export function bozzaDaModello(m: ModelloFasi, comeCopia: boolean): BozzaModello {
  return {
    id: comeCopia ? null : m.id,
    nome: comeCopia ? `Copia di ${m.nome}`.slice(0, MAX_NOME_MODELLO) : m.nome,
    descrizione: m.descrizione,
    fasi: m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ ...s })) })),
  };
}

const pesoIntero = (peso: number): number =>
  Math.min(100, Math.max(1, Math.round(Number.isFinite(peso) ? peso : 1)));

export function validaBozza(b: BozzaModello): EsitoBozza {
  const nome = b.nome.trim();
  if (!nome) return { ok: false, errore: "Dai un nome al modello." };
  if (nome.length > MAX_NOME_MODELLO) return { ok: false, errore: `Il nome è troppo lungo (massimo ${MAX_NOME_MODELLO} caratteri).` };
  const fasi = b.fasi
    .map((f) => ({
      nome: f.nome.trim(),
      sottofasi: f.sottofasi.map((s) => ({ nome: s.nome.trim(), peso: pesoIntero(s.peso) })).filter((s) => s.nome),
    }))
    .filter((f) => f.nome);
  if (fasi.length === 0) return { ok: false, errore: "Un modello ha almeno una fase, con un nome." };
  if (fasi.length > MAX_FASI_MODELLO) return { ok: false, errore: `Troppe fasi: al massimo ${MAX_FASI_MODELLO}.` };
  if (fasi.some((f) => f.nome.length > MAX_NOME_VOCE || f.sottofasi.some((s) => s.nome.length > MAX_NOME_VOCE))) {
    return { ok: false, errore: `Un nome di fase o di sottofase è troppo lungo (massimo ${MAX_NOME_VOCE} caratteri).` };
  }
  if (fasi.some((f) => f.sottofasi.length > MAX_SOTTOFASI_FASE)) {
    return { ok: false, errore: `Troppe sottofasi in una fase: al massimo ${MAX_SOTTOFASI_FASE}.` };
  }
  return { ok: true, payload: { id: b.id, nome, descrizione: b.descrizione.trim() || null, fasi } };
}

/** Quello che arriva a «aggiungi_fasi_commessa» per un modello scelto. */
export function fasiPerCommessa(m: Pick<ModelloFasi, "fasi">): FaseModello[] {
  return m.fasi.map((f) => ({ nome: f.nome, sottofasi: f.sottofasi.map((s) => ({ nome: s.nome, peso: pesoIntero(s.peso) })) }));
}

// ── riordino, senza toccare l'originale ─────────────────────────────────────
export function sposta<T>(lista: ReadonlyArray<T>, indice: number, verso: -1 | 1): T[] {
  const j = indice + verso;
  if (indice < 0 || indice >= lista.length || j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[indice], copia[j]] = [copia[j], copia[indice]];
  return copia;
}
export const sostituisci = <T,>(lista: ReadonlyArray<T>, indice: number, patch: Partial<T>): T[] =>
  lista.map((x, i) => (i === indice ? { ...x, ...patch } : x));
export const rimuovi = <T,>(lista: ReadonlyArray<T>, indice: number): T[] => lista.filter((_, i) => i !== indice);
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/logic/modelliFasi.test.ts`
Expected: PASS (tutti i casi).

- [ ] **Step 5: commit**

```bash
git add src/lib/orders/modelliFasi.ts src/test/logic/modelliFasi.test.ts
git commit -m "Modelli di fasi: logica pura (elenco, bozze, validazione, riordino)"
```

### Task 8: la migrazione dei modelli

**Files:**
- Create: `supabase/migrations/20281007140000_modelli_fasi_azienda.sql`
- Test: `src/test/logic/modelliFasiMigrazione.test.ts`

- [ ] **Step 1: verifica che la versione sia libera**

Run: `ls supabase/migrations/20281007140000_*.sql`
Expected: `No such file or directory`.

- [ ] **Step 2: scrivi il test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/modelliFasiMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007140000_modelli_fasi_azienda.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const RPC = [
  "salva_modello_fasi(uuid, jsonb)",
  "elimina_modello_fasi(uuid, uuid)",
  "salva_commessa_come_modello(uuid, text)",
  "fasi_impostazioni_salva(uuid, jsonb)",
  "aggiungi_fasi_commessa(uuid, jsonb)",
];

describe("migrazione modelli_fasi_azienda", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const t of ["work_phase_templates", "work_phase_template_phases", "work_phase_template_subphases", "company_fasi_settings"]) {
      expect(codice).toContain(`create table if not exists public.${t}`);
      expect(codice).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("le tabelle sono chiuse in scrittura: ai client resta la lettura (più il blocco degli utenti bloccati)", () => {
    expect(codice).toMatch(/revoke all on public\.work_phase_templates[^;]*from anon, authenticated;/);
    expect(codice).toMatch(/grant select on public\.work_phase_templates[^;]*to authenticated;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.(\w+)\s+(?:as restrictive\s+)?for (\w+) to authenticated/g)];
    expect(policy.length).toBeGreaterThanOrEqual(8);
    // Nessuna policy permette di scrivere: solo lettura, più il blocco restrittivo degli utenti bloccati.
    expect(policy.filter((m) => m[1] !== "blocco_utente_bloccato" && m[3] !== "select")).toEqual([]);
  });

  it("le RPC sono SECURITY DEFINER con search_path fisso, chiuse ad anon e aperte ad authenticated", () => {
    for (const f of RPC) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated;`);
    }
    const definer = codice.match(/security definer\s+set search_path = public/g) ?? [];
    expect(definer).toHaveLength(RPC.length);
  });

  it("i modelli si scrivono col permesso delle impostazioni, le fasi in commessa con «Ordini e Commesse» dell'azienda della COMMESSA", () => {
    expect(codice.match(/'can_edit_settings_orders'/g)!.length).toBeGreaterThanOrEqual(4);
    const aggiungi = codice.match(/create or replace function public\.aggiungi_fasi_commessa[\s\S]*?\n\$\$;/)![0];
    expect(aggiungi).toMatch(/v_azienda uuid := public\.get_order_company_id\(p_order_id\);/);
    expect(aggiungi).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_orders', v_azienda\)/);
    expect(aggiungi).not.toMatch(/has_permission\(/);
  });

  it("il nome di un modello è unico nell'azienda, senza badare a maiuscole e spazi", () => {
    expect(codice).toMatch(/create unique index if not exists work_phase_templates_nome_uk on public\.work_phase_templates \(company_id, lower\(btrim\(name\)\)\);/);
  });

  it("non tocca order_work_phases (nessuna colonna, nessun trigger)", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
    expect(codice).not.toMatch(/trigger[^;]*on public\.order_work_phases/i);
  });
});
```

- [ ] **Step 3: lancia il test, deve fallire**

Run: `npx vitest run src/test/logic/modelliFasiMigrazione.test.ts`
Expected: FAIL — `ENOENT … 20281007140000_modelli_fasi_azienda.sql`.

- [ ] **Step 4: scrivi la migrazione**

```sql
-- Modelli di fasi per azienda (07/10/2026).
--
-- «Scegli le fasi» offriva otto modelli scritti nel codice, uguali per tutte le
-- aziende, che creavano solo i nomi delle fasi. Ora ogni azienda ha i suoi
-- modelli, con le sottofasi, e li prepara nelle Impostazioni.
--
-- Cosa c'è.
--   · work_phase_templates → work_phase_template_phases → work_phase_template_subphases:
--     il modello è un albero. Le tabelle sono CHIUSE in scrittura: si scrivono
--     solo con le RPC qui sotto, che salvano tutto l'albero o niente (stesso
--     schema di campo_regole_azienda). Si leggono con la RLS.
--   · company_fasi_settings: una riga per azienda. Per ora, quali modelli base
--     nascondere; la milestone 4 vi aggiunge il peso nella media.
--   · salva_modello_fasi, elimina_modello_fasi, salva_commessa_come_modello,
--     fasi_impostazioni_salva: permesso can_edit_settings_orders nell'azienda passata.
--   · aggiungi_fasi_commessa: crea fasi E sottofasi in una commessa in un colpo
--     solo (permesso can_edit_orders nell'azienda della COMMESSA).
--
-- Additiva: tabelle e funzioni nuove, nessun dato esistente cambia.

set local lock_timeout = '3s';

create table if not exists public.work_phase_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  hint text check (hint is null or length(hint) <= 200),
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_phase_templates_nome_uk on public.work_phase_templates (company_id, lower(btrim(name)));
create index if not exists work_phase_templates_azienda_idx on public.work_phase_templates (company_id, position);

create table if not exists public.work_phase_template_phases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.work_phase_templates(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0
);
create index if not exists work_phase_template_phases_modello_idx on public.work_phase_template_phases (template_id, position);
create index if not exists work_phase_template_phases_azienda_idx on public.work_phase_template_phases (company_id);

create table if not exists public.work_phase_template_subphases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_phase_id uuid not null references public.work_phase_template_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100)
);
create index if not exists work_phase_template_subphases_fase_idx on public.work_phase_template_subphases (template_phase_id, position);
create index if not exists work_phase_template_subphases_azienda_idx on public.work_phase_template_subphases (company_id);

create table if not exists public.company_fasi_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  modelli_base_nascosti text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: solo lettura per i client; si scrive con le RPC
-- ---------------------------------------------------------------------------
alter table public.work_phase_templates enable row level security;
alter table public.work_phase_template_phases enable row level security;
alter table public.work_phase_template_subphases enable row level security;
alter table public.company_fasi_settings enable row level security;

revoke all on public.work_phase_templates, public.work_phase_template_phases,
              public.work_phase_template_subphases, public.company_fasi_settings from anon, authenticated;
grant select on public.work_phase_templates, public.work_phase_template_phases,
                public.work_phase_template_subphases, public.company_fasi_settings to authenticated;

drop policy if exists modelli_fasi_lettura on public.work_phase_templates;
create policy modelli_fasi_lettura on public.work_phase_templates for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_fasi_lettura on public.work_phase_template_phases;
create policy modelli_fasi_fasi_lettura on public.work_phase_template_phases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases;
create policy modelli_fasi_sottofasi_lettura on public.work_phase_template_subphases for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists fasi_impostazioni_lettura on public.company_fasi_settings;
create policy fasi_impostazioni_lettura on public.company_fasi_settings for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists blocco_utente_bloccato on public.work_phase_templates;
create policy blocco_utente_bloccato on public.work_phase_templates as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_phases;
create policy blocco_utente_bloccato on public.work_phase_template_phases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.work_phase_template_subphases;
create policy blocco_utente_bloccato on public.work_phase_template_subphases as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.company_fasi_settings;
create policy blocco_utente_bloccato on public.company_fasi_settings as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ---------------------------------------------------------------------------
-- salva_modello_fasi: crea o riscrive tutto l'albero di un modello
--   p_modello = { id?, nome, descrizione?, fasi: [ { nome, sottofasi: [ { nome, peso } ] } ] }
-- ---------------------------------------------------------------------------
create or replace function public.salva_modello_fasi(p_company_id uuid, p_modello jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_modello->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_modello->>'nome', ''));
  v_desc text := nullif(btrim(coalesce(p_modello->>'descrizione', '')), '');
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_pos integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dai un nome al modello (massimo 80 caratteri).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_modello->'fasi') is distinct from 'array' or jsonb_array_length(p_modello->'fasi') = 0 then
    raise exception 'Un modello ha almeno una fase.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_modello->'fasi') > 60 then
    raise exception 'Troppe fasi: al massimo 60.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.work_phase_templates (company_id, name, hint, position)
    values (p_company_id, v_nome, v_desc,
            coalesce((select max(position) + 1 from public.work_phase_templates where company_id = p_company_id), 0))
    returning id into v_id;
  else
    update public.work_phase_templates
       set name = v_nome, hint = v_desc, updated_at = now()
     where id = v_id and company_id = p_company_id;
    if not found then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    -- Si riscrive tutto l'albero: i modelli sono piccoli e nessuno ne tiene l'id delle fasi.
    delete from public.work_phase_template_phases where template_id = v_id;
  end if;

  for v_fase in select value from jsonb_array_elements(p_modello->'fasi') loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.work_phase_template_phases (company_id, template_id, name, position)
    values (p_company_id, v_id, left(btrim(v_fase->>'nome'), 160), v_pos)
    returning id into v_fase_id;
    v_pos := v_pos + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.work_phase_template_subphases (company_id, template_phase_id, name, position, peso)
        values (p_company_id, v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_pos = 0 then
    raise exception 'Un modello ha almeno una fase con un nome.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.elimina_modello_fasi(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  delete from public.work_phase_templates where id = p_id and company_id = p_company_id;
end;
$$;

-- Le fasi (e sottofasi) di una commessa diventano un modello dell'azienda.
create or replace function public.salva_commessa_come_modello(p_order_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fasi jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di salvare questo modello.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', f.name,
             'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'peso', s.peso) order by s.position, s.created_at)
                                      from public.order_work_subphases s where s.phase_id = f.id), '[]'::jsonb))
           order by f.position, f.created_at), '[]'::jsonb)
    into v_fasi
    from public.order_work_phases f
   where f.order_id = p_order_id;

  return public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', p_nome, 'descrizione', null, 'fasi', v_fasi));
end;
$$;

-- p_valori: per ora { modelli_base_nascosti: ["tetto_copertura", …] }. Le chiavi che non conosce le ignora.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nascosti text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'modelli_base_nascosti' then
    select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}')
      into v_nascosti
      from jsonb_array_elements_text(p_valori->'modelli_base_nascosti') as t(x);
    update public.company_fasi_settings
       set modelli_base_nascosti = v_nascosti, updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$$;

-- Fasi e sottofasi in una commessa, in un colpo solo.
--   p_fasi = [ { nome, sottofasi: [ { nome, peso } ] } ]
create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.order_work_phases (company_id, order_id, name, position)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.order_work_subphases (company_id, order_id, phase_id, name, position, peso)
        values (v_azienda, p_order_id, v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$$;

revoke all on function public.salva_modello_fasi(uuid, jsonb) from public, anon;
grant execute on function public.salva_modello_fasi(uuid, jsonb) to authenticated;
revoke all on function public.elimina_modello_fasi(uuid, uuid) from public, anon;
grant execute on function public.elimina_modello_fasi(uuid, uuid) to authenticated;
revoke all on function public.salva_commessa_come_modello(uuid, text) from public, anon;
grant execute on function public.salva_commessa_come_modello(uuid, text) to authenticated;
revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;
revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated;
```

Nota: questa migrazione **dipende da quella delle sottofasi** (`order_work_subphases` deve esistere): si applica dopo il Task 3.

- [ ] **Step 5: lancia il test sul testo, deve passare**

Run: `npx vitest run src/test/logic/modelliFasiMigrazione.test.ts`
Expected: PASS (6 casi).

- [ ] **Step 6: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007140000_modelli_fasi_azienda.sql src/test/logic/modelliFasiMigrazione.test.ts
git commit -m "Modelli di fasi: tabelle, RLS e RPC atomiche (migrazione non ancora applicata)"
```

### Task 9: prova SQL a secco, poi applicazione (serve l'OK per la seconda parte)

- [ ] **Step 1: prova a secco** — una sola `execute_sql`: il contenuto **intero** di `20281007130000_sottofasi_commessa.sql` (se non è ancora applicata) e di `20281007140000_modelli_fasi_azienda.sql`, poi questo blocco, che annulla tutto alla fine.

```sql
do $prova$
declare
  v_azienda uuid; v_admin uuid; v_lavoratore uuid; v_altro uuid; v_ordine uuid;
  v_mod uuid; v_copia uuid; v_n integer; v_nascosti text[]; v_fase uuid;
begin
  select p.company_id into v_azienda
    from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  select ur.user_id into v_admin from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  select o.id into v_ordine from public.orders o
   where o.company_id = v_azienda and o.deleted_at is null order by o.created_at limit 1;
  select a.user_id into v_lavoratore from public.order_campo_assignments a
    join public.orders o on o.id = a.order_id
   where o.company_id = v_azienda and a.user_id is not null
     and not public.has_permission_for_company(a.user_id, 'can_edit_orders', o.company_id)
     and not public.has_permission_for_company(a.user_id, 'can_edit_settings_orders', o.company_id) limit 1;
  select p.id into v_altro from public.profiles p
   where p.company_id is not null and p.company_id <> v_azienda
     and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'super_admin'::public.app_role)
   limit 1;
  if v_admin is null or v_ordine is null then
    raise exception 'PROVA SALTATA: serve un amministratore e una commessa nella demo';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. salvo un modello: le voci col nome vuoto si scartano, le sottofasi restano
  v_mod := public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', 'PROVA impianti', 'descrizione', 'prova', 'fasi', jsonb_build_array(
    jsonb_build_object('nome', 'Impianto elettrico', 'sottofasi', jsonb_build_array(
      jsonb_build_object('nome', 'Tracce', 'peso', 2), jsonb_build_object('nome', 'Cavi', 'peso', 3), jsonb_build_object('nome', '  ', 'peso', 1))),
    jsonb_build_object('nome', 'Collaudo', 'sottofasi', '[]'::jsonb),
    jsonb_build_object('nome', ' ', 'sottofasi', '[]'::jsonb))));
  select count(*) into v_n from public.work_phase_template_phases where template_id = v_mod;
  if v_n <> 2 then raise exception 'KO 1: fasi salvate %, attese 2', v_n; end if;
  select count(*) into v_n from public.work_phase_template_subphases s
    join public.work_phase_template_phases f on f.id = s.template_phase_id where f.template_id = v_mod;
  if v_n <> 2 then raise exception 'KO 2: sottofasi salvate %, attese 2', v_n; end if;

  -- 2. lo applico alla commessa: fasi in coda, sottofasi con azienda e commessa giuste, fase a 0%
  v_n := public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(
    jsonb_build_object('nome', 'PROVA A', 'sottofasi', jsonb_build_array(
      jsonb_build_object('nome', 's1', 'peso', 1), jsonb_build_object('nome', 's2', 'peso', 3))),
    jsonb_build_object('nome', 'PROVA B', 'sottofasi', '[]'::jsonb)));
  if v_n <> 2 then raise exception 'KO 3: fasi aggiunte %, attese 2', v_n; end if;
  select id into v_fase from public.order_work_phases where order_id = v_ordine and name = 'PROVA A';
  select count(*) into v_n from public.order_work_subphases
   where phase_id = v_fase and company_id = v_azienda and order_id = v_ordine;
  if v_n <> 2 then raise exception 'KO 4: sottofasi della commessa %, attese 2', v_n; end if;
  if (select percentuale from public.order_work_phases where id = v_fase) <> 0 then raise exception 'KO 5: la fase nuova non parte da 0'; end if;
  if (select position from public.order_work_phases where id = v_fase) >=
     (select position from public.order_work_phases where order_id = v_ordine and name = 'PROVA B') then
    raise exception 'KO 6: le fasi non sono in ordine';
  end if;

  -- 3. «Salva come modello» dalla commessa porta con sé le sottofasi
  v_copia := public.salva_commessa_come_modello(v_ordine, 'PROVA copia');
  select count(*) into v_n from public.work_phase_template_subphases s
    join public.work_phase_template_phases f on f.id = s.template_phase_id
   where f.template_id = v_copia and f.name = 'PROVA A';
  if v_n <> 2 then raise exception 'KO 7: sottofasi della copia %, attese 2', v_n; end if;

  -- 4. riscrivere un modello (stesso id) sostituisce, non duplica
  perform public.salva_modello_fasi(v_azienda, jsonb_build_object('id', v_mod, 'nome', 'PROVA impianti',
    'fasi', jsonb_build_array(jsonb_build_object('nome', 'Solo una', 'sottofasi', '[]'::jsonb))));
  select count(*) into v_n from public.work_phase_template_phases where template_id = v_mod;
  if v_n <> 1 then raise exception 'KO 8: dopo la riscrittura le fasi sono %', v_n; end if;

  -- 5. nome doppio (senza badare a maiuscole e spazi): rifiutato
  begin
    perform public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', ' prova IMPIANTI ',
      'fasi', jsonb_build_array(jsonb_build_object('nome', 'x'))));
    raise exception 'KO 9: nome doppio accettato';
  exception when unique_violation then null;
  end;

  -- 6. impostazioni: nascondo un modello base (doppioni e vuoti spariscono)
  perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('modelli_base_nascosti',
    jsonb_build_array('tetto_copertura', ' ', 'tetto_copertura')));
  select modelli_base_nascosti into v_nascosti from public.company_fasi_settings where company_id = v_azienda;
  if v_nascosti is distinct from array['tetto_copertura'] then raise exception 'KO 10: nascosti %', v_nascosti; end if;

  -- 7. elimino un modello: porta via fasi e sottofasi
  perform public.elimina_modello_fasi(v_azienda, v_copia);
  select count(*) into v_n from public.work_phase_template_phases where template_id = v_copia;
  if v_n <> 0 then raise exception 'KO 11: dopo l''eliminazione restano % fasi', v_n; end if;

  reset role;

  -- 8. un lavoratore (senza permessi) non scrive modelli né aggiunge fasi
  if v_lavoratore is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_lavoratore, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.salva_modello_fasi(v_azienda, jsonb_build_object('nome', 'x', 'fasi', jsonb_build_array(jsonb_build_object('nome', 'y'))));
      raise exception 'KO 12: il lavoratore ha salvato un modello';
    exception when sqlstate '42501' then null;
    end;
    begin
      perform public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(jsonb_build_object('nome', 'z')));
      raise exception 'KO 13: il lavoratore ha aggiunto fasi';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  end if;

  -- 9. un utente di un'altra azienda non vede i modelli e non tocca la commessa
  if v_altro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_altro, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.work_phase_templates where company_id = v_azienda;
    if v_n <> 0 then raise exception 'KO 14: un''altra azienda vede % modelli', v_n; end if;
    begin
      perform public.aggiungi_fasi_commessa(v_ordine, jsonb_build_array(jsonb_build_object('nome', 'z')));
      raise exception 'KO 15: un''altra azienda ha aggiunto fasi';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (lavoratore: %, altra azienda: %)',
    (v_lavoratore is not null), (v_altro is not null);
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. Un `KO n` dice la regola che non regge.

- [ ] **Step 2: chiedi l'OK e applica** (dopo la migrazione delle sottofasi): `apply_migration` con `name: "modelli_fasi_azienda"` e il contenuto del file; poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007140000'
 where name = 'modelli_fasi_azienda' and left(version, 4) = '2026';
```

- [ ] **Step 3: verifica**

```sql
select version, name from supabase_migrations.schema_migrations where version = '20281007140000';   -- 1 riga
select * from public.admin_backup_tabelle_scoperte();                                               -- 0 righe
-- 5 righe, tutte con anon = false e authenticated = true
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('salva_modello_fasi', 'elimina_modello_fasi', 'salva_commessa_come_modello', 'fasi_impostazioni_salva', 'aggiungi_fasi_commessa');
```

### Task 10: l'hook dei modelli e «Scegli le fasi» che usa la RPC

**Files:**
- Create: `src/hooks/useModelliFasi.ts`
- Modify: `src/hooks/useOrderWorkPhases.ts` (`applyTemplate`, ~riga 417)

- [ ] **Step 1: scrivi l'hook**

```ts
// src/hooks/useModelliFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { assemblaModelli, type ModelloFasi, type PayloadModello } from "@/lib/orders/modelliFasi";

// Le tabelle non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ModelliAzienda { modelli: ModelloFasi[]; nascosti: string[] }
const NESSUNO: ModelliAzienda = { modelli: [], nascosti: [] };

export const chiaveModelliFasi = (companyId: string | undefined) => ["modelli-fasi", companyId] as const;

/** Messaggi in italiano per gli errori che l'utente può causare. */
export function messaggioModello(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "Esiste già un modello con questo nome.";
  if (err?.code === "42501") return "Non hai il permesso di modificare i modelli di fasi.";
  return err?.message || "Operazione non riuscita. Riprova.";
}

/** I modelli di fasi dell'azienda e quali modelli base ha nascosto. */
export function useModelliFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveModelliFasi(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelliAzienda> => {
      // Se la lettura fallisce (tabelle non ancora create, rete) si offrono i soli modelli base.
      try {
        const [m, f, s, impostazioni] = await Promise.all([
          db.from("work_phase_templates").select("id, name, hint, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_phases").select("id, template_id, name, position").eq("company_id", companyId!).order("position"),
          db.from("work_phase_template_subphases").select("id, template_phase_id, name, position, peso").eq("company_id", companyId!).order("position"),
          db.from("company_fasi_settings").select("modelli_base_nascosti").eq("company_id", companyId!).maybeSingle(),
        ]);
        for (const r of [m, f, s, impostazioni]) if (r.error) throw r.error;
        return {
          modelli: assemblaModelli(m.data ?? [], f.data ?? [], s.data ?? []),
          nascosti: (impostazioni.data?.modelli_base_nascosti as string[] | undefined) ?? [],
        };
      } catch {
        return NESSUNO;
      }
    },
  });

  const riparti = () => qc.invalidateQueries({ queryKey: chiaveModelliFasi(companyId) });
  const onError = (e: unknown) => toast.error(messaggioModello(e));

  const salva = useMutation({
    mutationFn: async (modello: PayloadModello): Promise<string> => {
      const { data, error } = await db.rpc("salva_modello_fasi", { p_company_id: companyId, p_modello: modello });
      if (error) throw error;
      return data as string;
    },
    onSuccess: riparti,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("elimina_modello_fasi", { p_company_id: companyId, p_id: id });
      if (error) throw error;
    },
    onSuccess: riparti,
    onError,
  });

  const salvaImpostazioni = useMutation({
    mutationFn: async (nascosti: string[]) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { modelli_base_nascosti: nascosti } });
      if (error) throw error;
    },
    onSuccess: riparti,
    onError,
  });

  return {
    modelli: query.data?.modelli ?? NESSUNO.modelli,
    nascosti: query.data?.nascosti ?? NESSUNO.nascosti,
    isLoading: query.isLoading,
    salva, elimina, salvaImpostazioni,
  };
}
```

- [ ] **Step 2: `applyTemplate` chiama la RPC**

In `src/hooks/useOrderWorkPhases.ts` aggiungi l'importazione del tipo, con le altre:

```ts
import type { FaseModello } from "@/lib/orders/modelliFasi";
```

e sostituisci `applyTemplate` (oggi un `insert` di soli nomi):

```ts
  const applyTemplate = useMutation({
    // Fasi e sottofasi in un colpo solo, dal server (aggiungi_fasi_commessa): il
    // permesso si controlla là e un modello non resta a metà.
    mutationFn: async (fasi: FaseModello[]) => {
      const { error } = await db.rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });
```

- [ ] **Step 3: il guardiano delle scritture resta vero**

Run: `npx vitest run src/test/logic/faseCampiProtetti.test.ts`
Expected: PASS: `useOrderWorkPhases.ts` scrive ancora `order_work_phases` (`addPhase`, `updatePhase`, `deletePhase`) e nessun file nuovo si è aggiunto.

- [ ] **Step 4: typecheck mirato** su `useModelliFasi.ts` e `useOrderWorkPhases.ts`. Expected: nessun errore nuovo.

- [ ] **Step 5: commit**

```bash
git add src/hooks/useModelliFasi.ts src/hooks/useOrderWorkPhases.ts
git commit -m "Modelli di fasi: hook per i modelli dell'azienda; «Scegli le fasi» crea fasi e sottofasi dal server"
```

### Task 11: «Scegli le fasi» offre prima i modelli dell'azienda

**Files:**
- Create: `src/components/orders/ModelliFasiPicker.tsx`
- Modify: `src/components/orders/OrderWorkPhases.tsx` (stato e dialog a ~righe 269-300 e 352-410)
- Modify: `src/test/ui/orderWorkPlanning.test.tsx`, `src/test/ui/commessaTelefono.test.tsx` (mock di `useModelliFasi`)
- Test: `src/test/ui/modelliFasiPicker.test.tsx`

Per chi non ha modelli propri e non nasconde niente, il dialog **resta identico** (stessa etichetta «Parti da un modello», stessi pulsanti): i titoli «I tuoi modelli» e «Modelli base» compaiono solo quando l'azienda ne ha di propri.

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/modelliFasiPicker.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelliFasiPicker } from "@/components/orders/ModelliFasiPicker";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({ modelli: [] as unknown[], nascosti: [] as string[] }));
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: state.modelli, nascosti: state.nascosti }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));

const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "Elettrico e idraulico",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => { state.modelli = []; state.nascosti = []; });
afterEach(cleanup);

describe("ModelliFasiPicker", () => {
  it("senza modelli propri è quello di sempre: «Parti da un modello» e i base, niente titoli nuovi", () => {
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByText("Parti da un modello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tetto" })).toBeInTheDocument();
    expect(screen.queryByText("I tuoi modelli")).not.toBeInTheDocument();
    expect(screen.queryByText("Modelli base")).not.toBeInTheDocument();
  });

  it("con modelli propri li mette per primi, con i titoli", () => {
    state.modelli = [mio];
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByText("I tuoi modelli")).toBeInTheDocument();
    expect(screen.getByText("Modelli base")).toBeInTheDocument();
    const bottoni = screen.getAllByRole("button").map((b) => b.textContent);
    expect(bottoni.indexOf("Impianti completi")).toBeLessThan(bottoni.indexOf("Bagno"));
  });

  it("non mostra i modelli base nascosti", () => {
    state.nascosti = ["tetto"];
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.queryByRole("button", { name: "Tetto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
  });

  it("sceglie un modello, ne mostra fasi e sottofasi, e non applica finché non si preme", () => {
    state.modelli = [mio];
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Impianti completi" }));
    expect(screen.getByText(/Elettrico e idraulico · 2 fasi · 2 sottofasi/)).toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [
        { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
        { nome: "Collaudo", sottofasi: [] },
      ],
      expect.objectContaining({ id: "m1" }),
    );
  });

  it("un modello base si applica con le sole fasi", () => {
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
      expect.objectContaining({ id: "base:bagno" }),
    );
  });

  it("mentre salva il pulsante è spento", () => {
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/modelliFasiPicker.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/ModelliFasiPicker"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/ModelliFasiPicker.tsx
import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { elencoModelli, fasiPerCommessa, totaleSottofasi, type FaseModello, type ModelloFasi } from "@/lib/orders/modelliFasi";

interface ModelliFasiPickerProps {
  /** Aggiunge alla commessa le fasi (e sottofasi) del modello scelto. */
  onApplica: (fasi: FaseModello[], modello: ModelloFasi) => void;
  inCorso: boolean;
}

const TITOLO = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function Pillole({ modelli, scelto, onScegli }: { modelli: ModelloFasi[]; scelto: string | null; onScegli: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {modelli.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onScegli(m.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            scelto === m.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {m.nome}
        </button>
      ))}
    </div>
  );
}

/** «Parti da un modello»: i modelli dell'azienda (con le sottofasi), poi i base. */
export function ModelliFasiPicker({ onApplica, inCorso }: ModelliFasiPickerProps) {
  const { modelli, nascosti } = useModelliFasi();
  const { azienda, base } = elencoModelli(PHASE_TEMPLATES, modelli, nascosti);
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const scelto = [...azienda, ...base].find((m) => m.id === sceltoId) ?? null;
  const alterna = (id: string) => setSceltoId((k) => (k === id ? null : id));
  const conTitoli = azienda.length > 0;
  const nSotto = scelto ? totaleSottofasi(scelto) : 0;

  return (
    <div className="space-y-2">
      <Label className={TITOLO}>Parti da un modello</Label>
      {conTitoli && <p className={cn(TITOLO, "pt-1")}>I tuoi modelli</p>}
      {conTitoli && <Pillole modelli={azienda} scelto={sceltoId} onScegli={alterna} />}
      {conTitoli && base.length > 0 && <p className={cn(TITOLO, "pt-1")}>Modelli base</p>}
      <Pillole modelli={base} scelto={sceltoId} onScegli={alterna} />

      {scelto && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {[scelto.descrizione, `${scelto.fasi.length} fasi`, nSotto > 0 ? `${nSotto} sottofasi` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1">
            {scelto.fasi.map((f, i) => (
              <span
                key={i}
                title={f.sottofasi.map((s) => s.nome).join(", ") || undefined}
                className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {i + 1}. {f.nome}{f.sottofasi.length > 0 ? ` (${f.sottofasi.length})` : ""}
              </span>
            ))}
          </div>
          <Button size="sm" className="w-full" disabled={inCorso} onClick={() => onApplica(fasiPerCommessa(scelto), scelto)}>
            {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1 h-4 w-4" />}
            Aggiungi le {scelto.fasi.length} fasi
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: lancia i test del picker, devono passare**

Run: `npx vitest run src/test/ui/modelliFasiPicker.test.tsx`
Expected: PASS (6 casi).

- [ ] **Step 5: il dialog di `OrderWorkPhases` usa il picker**

In `src/components/orders/OrderWorkPhases.tsx`:

1. Togli `PHASE_TEMPLATES,` dall'importazione da `@/hooks/useOrderWorkPhases` (~riga 46) e aggiungi:

```tsx
import { ModelliFasiPicker } from "./ModelliFasiPicker";
```

2. Elimina lo stato e la funzione che il picker sostituisce (~righe 271-272 e 294-301): `selectedTemplateKey`, `selectedTemplate`, `handleApplyTemplate`; `closePhaseDialog` diventa:

```tsx
  const closePhaseDialog = () => {
    setNewPhaseOpen(false);
    setNewPhaseName("");
  };
```

3. Nel dialog sostituisci l'intero blocco `{/* Modelli di fasi per tipo di lavoro */} <div className="space-y-2"> … </div>` (da «Parti da un modello» fino al bottone «Aggiungi le N fasi», ~righe 352-410) con:

```tsx
                  {/* Modelli di fasi: quelli dell'azienda (con le sottofasi) e i base */}
                  <ModelliFasiPicker
                    inCorso={applyTemplate.isPending}
                    onApplica={(fasi) =>
                      applyTemplate.mutate(fasi, {
                        onSuccess: () => {
                          toast.success(`${fasi.length} fasi aggiunte`);
                          closePhaseDialog();
                        },
                      })
                    }
                  />
```

- [ ] **Step 6: i due test esistenti ricevono il finto del nuovo hook**

In `src/test/ui/orderWorkPlanning.test.tsx` e `src/test/ui/commessaTelefono.test.tsx`, accanto agli altri `vi.mock(...)`:

```tsx
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: [] as unknown[], nascosti: [] as string[] }) }));
```

Il caso «conserva creazione manuale e modelli senza salvataggi all'apertura» deve restare verde senza altre modifiche: `PHASE_TEMPLATES` è ancora quello finto dell'hook (`Intervento semplice`) e il pulsante è ancora «Aggiungi le 2 fasi».

- [ ] **Step 7: lancia i test della scheda e il guardiano**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx src/test/logic/faseCampiProtetti.test.ts`
Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add src/components/orders/ModelliFasiPicker.tsx src/components/orders/OrderWorkPhases.tsx src/test/ui/modelliFasiPicker.test.tsx src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx
git commit -m "Scegli le fasi: prima i modelli dell'azienda, con le sottofasi; i base che non servono si nascondono"
```

### Task 12: la pagina «Modelli di fasi» nelle Impostazioni (registrazione)

**Files:**
- Create: `src/pages/azienda/settings/SettingsModelliFasi.tsx`
- Modify: `src/routes/companyRoutes.tsx` (importazione ~riga 157, rotta ~riga 1271)
- Modify: `src/components/layouts/CompanyLayout.tsx` (voce di menu a ~riga 851; importazione dell'icona)
- Modify: `src/components/layouts/SettingsLayout.tsx` (`SECTION_MAP` ~riga 37)
- Modify: `src/components/layouts/SettingsSearch.tsx` (~riga 85)
- Modify: `src/lib/impostazioni/pianoImpostazioni.ts` (`REQUISITI_IMPOSTAZIONI`, ~riga 41)
- Modify: `src/pages/azienda/settings/SettingsMobileHub.tsx` (voce ~riga 68 e `HIDDEN_ON_MOBILE` ~riga 131)

Il componente `ModelliFasiConfig` arriva al Task 13: qui si registra la pagina con un segnaposto minimo, così ogni test di registrazione si può lanciare subito. (Il segnaposto vive solo fino al Task 13: non finisce in nessun commit separato.)

- [ ] **Step 1: la rotta, e il test che deve fallire**

In `src/routes/companyRoutes.tsx`, con le altre importazioni lazy (~riga 157):

```tsx
const SettingsModelliFasi = lazy(() => import("@/pages/azienda/settings/SettingsModelliFasi"));
```

e dopo la rotta `rapportini-cantiere` (~riga 1271):

```tsx
          <Route path="modelli-fasi" element={withCompanyPermission("canViewSettingsOrders", <SettingsModelliFasi />)} />
```

Crea la pagina con un contenuto provvisorio:

```tsx
// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
export default function SettingsModelliFasi() {
  return <div>Modelli di fasi</div>;
}
```

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx`
Expected: FAIL — la rotta `modelli-fasi` non è classificata né per piano né «per tutti i piani».

- [ ] **Step 2: classifica la pagina per piano**

In `src/lib/impostazioni/pianoImpostazioni.ts`, dopo `"rapportini-cantiere": { moduli: ["orders"] },`:

```ts
  "modelli-fasi": { moduli: ["orders"] },
```

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx`
Expected: PASS.

- [ ] **Step 3: menu, titolo, ricerca, hub del telefono**

`src/components/layouts/CompanyLayout.tsx`, nel gruppo «Cantieri & Costi», subito dopo «Rapportini e presenze» (~riga 851); aggiungi `ListChecks` all'importazione da `lucide-react` se non c'è:

```tsx
        { to: "/azienda/impostazioni/modelli-fasi", label: "Modelli di fasi", icon: <ListChecks className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
```

`src/components/layouts/SettingsLayout.tsx`, in `SECTION_MAP` dopo `"rapportini-cantiere"`:

```ts
  "modelli-fasi":         { title: "Modelli di fasi",          description: "Le fasi che scegli quando apri una commessa, con le sottofasi che ne misurano l'avanzamento" },
```

`src/components/layouts/SettingsSearch.tsx`, dopo la voce «Rapportini e presenze»:

```ts
  { group: "Ordini", title: "Modelli di fasi", url: "/azienda/impostazioni/modelli-fasi", keywords: ["fasi", "modello", "template", "sottofasi", "avanzamento", "commessa", "cantiere", "lavorazioni"] },
```

`src/pages/azienda/settings/SettingsMobileHub.tsx`: nella sezione «Cantieri & Costi», dopo «Rapportini e presenze» (importa `ListChecks` da `lucide-react`):

```ts
      { to: "/azienda/impostazioni/modelli-fasi", label: "Modelli di fasi", icon: ListChecks, iconColor: "text-orange-600" },
```

e in `HIDDEN_ON_MOBILE`, dopo la riga di `rapportini-cantiere`:

```ts
  "/azienda/impostazioni/modelli-fasi",       // Modelli di fasi (si preparano una volta, al computer)
```

- [ ] **Step 4: lancia i test delle impostazioni**

Run: `npx vitest run src/test/ui/impostazioniDelPiano.test.tsx` e i test che nominano il menu delle impostazioni (`git grep -l "SettingsMobileHub\|SettingsSearch\|buildSettingsGroups" -- src/test`).
Expected: PASS.

(Il commit di questo task è quello del Task 13, insieme al componente vero.)

### Task 13: la pagina dei modelli (elenco, editor, modelli base)

**Files:**
- Create: `src/components/settings/ModelloFasiEditor.tsx`
- Create: `src/components/settings/ModelliFasiConfig.tsx`
- Modify: `src/pages/azienda/settings/SettingsModelliFasi.tsx`
- Test: `src/test/ui/modelliFasiConfig.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/modelliFasiConfig.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[], nascosti: [] as string[], puoModificare: true,
  salva: vi.fn(), elimina: vi.fn(), salvaImpostazioni: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.puoModificare ? "company_admin" : "staff" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));
vi.mock("@/hooks/useModelliFasi", () => ({
  useModelliFasi: () => ({
    modelli: state.modelli, nascosti: state.nascosti, isLoading: false,
    salva: { mutate: state.salva, isPending: false },
    elimina: { mutate: state.elimina, isPending: false },
    salvaImpostazioni: { mutate: state.salvaImpostazioni, isPending: false },
  }),
}));

const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => { vi.clearAllMocks(); state.modelli = []; state.nascosti = []; state.puoModificare = true; });
afterEach(cleanup);

describe("ModelliFasiConfig", () => {
  it("senza modelli propri spiega come partire; i base ci sono, con l'interruttore «Mostra»", () => {
    render(<ModelliFasiConfig />);
    expect(screen.getByText(/Non hai ancora modelli tuoi/)).toBeInTheDocument();
    expect(screen.getByText("Bagno")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mostra Bagno quando scegli le fasi" })).toBeChecked();
  });

  it("elenca i modelli dell'azienda con fasi e sottofasi", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    expect(screen.getByText("2 fasi · 2 sottofasi")).toBeInTheDocument();
  });

  it("nascondere un modello base salva l'elenco dei nascosti", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("switch", { name: "Mostra Tetto quando scegli le fasi" }));
    expect(state.salvaImpostazioni).toHaveBeenCalledWith(["tetto"]);
  });

  it("rimettere un base nascosto lo toglie dall'elenco", () => {
    state.nascosti = ["tetto", "bagno"];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("switch", { name: "Mostra Tetto quando scegli le fasi" }));
    expect(state.salvaImpostazioni).toHaveBeenCalledWith(["bagno"]);
  });

  it("«Duplica» un modello base apre l'editor con «Copia di …» e le sue fasi", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Bagno" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Copia di Bagno");
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Demolizioni");
    expect(within(dialogo).getByLabelText("Nome fase 2")).toHaveValue("Impianti");
  });

  it("un modello nuovo: aggiunge una sottofase col suo peso e salva il payload ripulito", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), { target: { value: "  Solo elettrico " } });
    fireEvent.change(within(dialogo).getByLabelText("Nome fase 1"), { target: { value: "Impianto elettrico" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi sottofase alla fase 1" }));
    fireEvent.change(within(dialogo).getByLabelText("Nome sottofase 1.1"), { target: { value: "Tracce" } });
    fireEvent.change(within(dialogo).getByLabelText("Peso sottofase 1.1"), { target: { value: "3" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      { id: null, nome: "Solo elettrico", descrizione: null, fasi: [{ nome: "Impianto elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }] }] },
      expect.any(Object),
    );
  });

  it("un modello senza nome non si salva", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).not.toHaveBeenCalled();
  });

  it("si riordinano le fasi", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Bagno" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sposta giù fase 1" }));
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Impianti");
    expect(within(dialogo).getByLabelText("Nome fase 2")).toHaveValue("Demolizioni");
  });

  it("eliminare chiede conferma e poi elimina", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina Impianti completi" }));
    expect(state.elimina).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello" }));
    expect(state.elimina).toHaveBeenCalledWith("m1");
  });

  it("chi non può modificare vede l'elenco ma nessun comando", () => {
    state.puoModificare = false; state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplica Bagno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Impianti completi" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mostra Bagno quando scegli le fasi" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/modelliFasiConfig.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/settings/ModelliFasiConfig"`.

- [ ] **Step 3: l'editor**

```tsx
// src/components/settings/ModelloFasiEditor.tsx
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  rimuovi, sostituisci, sposta, validaBozza,
  type BozzaModello, type FaseModello, type PayloadModello, type SottofaseModello,
} from "@/lib/orders/modelliFasi";

interface ModelloFasiEditorProps {
  aperto: boolean;
  bozzaIniziale: BozzaModello | null;
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (payload: PayloadModello) => void;
}

function Comandi({ etichetta, indice, totale, onSu, onGiu, onElimina, eliminaDisabilitato }: {
  etichetta: string; indice: number; totale: number; onSu: () => void; onGiu: () => void; onElimina: () => void; eliminaDisabilitato?: boolean;
}) {
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta su ${etichetta}`} disabled={indice === 0} onClick={onSu}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta giù ${etichetta}`} disabled={indice === totale - 1} onClick={onGiu}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-rose-600" aria-label={`Elimina ${etichetta}`} disabled={eliminaDisabilitato} onClick={onElimina}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );
}

export default function ModelloFasiEditor({ aperto, bozzaIniziale, salvataggio, onChiudi, onSalva }: ModelloFasiEditorProps) {
  const [bozza, setBozza] = useState<BozzaModello | null>(bozzaIniziale);
  useEffect(() => { if (aperto) setBozza(bozzaIniziale); }, [aperto, bozzaIniziale]);
  if (!bozza) return null;

  const fasi = bozza.fasi;
  const cambiaFasi = (nuove: FaseModello[]) => setBozza({ ...bozza, fasi: nuove });
  const cambiaFase = (i: number, patch: Partial<FaseModello>) => cambiaFasi(sostituisci(fasi, i, patch));
  const cambiaSotto = (i: number, nuove: SottofaseModello[]) => cambiaFase(i, { sottofasi: nuove });

  const salva = () => {
    const esito = validaBozza(bozza);
    if (!esito.ok) { toast.error(esito.errore); return; }
    onSalva(esito.payload);
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bozza.id ? "Modifica il modello" : "Nuovo modello di fasi"}</DialogTitle>
          <DialogDescription>
            Le fasi che compaiono quando scegli questo modello in una commessa. Le sottofasi misurano l'avanzamento della fase: più pesano, più contano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modello-nome">Nome del modello</Label>
              <Input id="modello-nome" value={bozza.nome} maxLength={80} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modello-desc">A cosa serve (facoltativo)</Label>
              <Input id="modello-desc" value={bozza.descrizione} maxLength={200} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
            </div>
          </div>

          <ol className="space-y-3">
            {fasi.map((fase, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    value={fase.nome} maxLength={160} placeholder="Nome della fase" aria-label={`Nome fase ${i + 1}`}
                    onChange={(e) => cambiaFase(i, { nome: e.target.value })} className="h-9 min-w-0 flex-1"
                  />
                  <Comandi
                    etichetta={`fase ${i + 1}`} indice={i} totale={fasi.length} eliminaDisabilitato={fasi.length === 1}
                    onSu={() => cambiaFasi(sposta(fasi, i, -1))} onGiu={() => cambiaFasi(sposta(fasi, i, 1))} onElimina={() => cambiaFasi(rimuovi(fasi, i))}
                  />
                </div>
                <ul className="ml-6 mt-2 space-y-1.5">
                  {fase.sottofasi.map((s, j) => (
                    <li key={j} className="flex items-center gap-1.5">
                      <Input
                        value={s.nome} maxLength={160} placeholder="Sottofase" aria-label={`Nome sottofase ${i + 1}.${j + 1}`}
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { nome: e.target.value }))} className="h-8 min-w-0 flex-1 text-sm"
                      />
                      <Input
                        type="number" min={1} max={100} value={s.peso} aria-label={`Peso sottofase ${i + 1}.${j + 1}`}
                        title="Quanto pesa nell'avanzamento della fase"
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { peso: Number(e.target.value) }))} className="h-8 w-16 shrink-0 text-sm"
                      />
                      <Comandi
                        etichetta={`sottofase ${i + 1}.${j + 1}`} indice={j} totale={fase.sottofasi.length}
                        onSu={() => cambiaSotto(i, sposta(fase.sottofasi, j, -1))} onGiu={() => cambiaSotto(i, sposta(fase.sottofasi, j, 1))}
                        onElimina={() => cambiaSotto(i, rimuovi(fase.sottofasi, j))}
                      />
                    </li>
                  ))}
                </ul>
                <Button
                  type="button" variant="ghost" size="sm" className="ml-5 mt-1.5 h-8 text-xs" aria-label={`Aggiungi sottofase alla fase ${i + 1}`}
                  onClick={() => cambiaSotto(i, [...fase.sottofasi, { nome: "", peso: 1 }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />Sottofase
                </Button>
              </li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" onClick={() => cambiaFasi([...fasi, { nome: "", sottofasi: [] }])}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi fase
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggio}>Salva modello</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: la pagina**

```tsx
// src/components/settings/ModelliFasiConfig.tsx
import { useState } from "react";
import { Copy, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import {
  bozzaDaModello, bozzaVuota, chiaveModelloBase, modelloDaBase, totaleSottofasi,
  type BozzaModello, type ModelloFasi,
} from "@/lib/orders/modelliFasi";
import ModelloFasiEditor from "./ModelloFasiEditor";

const dettaglio = (m: ModelloFasi): string => {
  const sotto = totaleSottofasi(m);
  return `${m.fasi.length} fasi${sotto > 0 ? ` · ${sotto} sottofasi` : ""}`;
};

export default function ModelliFasiConfig() {
  const { role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders;
  const { modelli, nascosti, salva, elimina, salvaImpostazioni } = useModelliFasi();
  const [bozza, setBozza] = useState<BozzaModello | null>(null);
  const [daEliminare, setDaEliminare] = useState<ModelloFasi | null>(null);
  const base = PHASE_TEMPLATES.map(modelloDaBase);
  const nascostiSet = new Set(nascosti);

  const mostraBase = (m: ModelloFasi, mostra: boolean) => {
    const chiave = chiaveModelloBase(m.id);
    salvaImpostazioni.mutate(mostra ? nascosti.filter((k) => k !== chiave) : [...new Set([...nascosti, chiave])]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" />I tuoi modelli</CardTitle>
            <CardDescription>
              Le fasi che scegli quando apri una commessa («Scegli le fasi»). Ogni fase può avere sottofasi: spuntandole, la fase avanza da sola.
            </CardDescription>
          </div>
          {puoModificare && (
            <Button size="sm" onClick={() => setBozza(bozzaVuota())}><Plus className="mr-1 h-4 w-4" />Nuovo modello</Button>
          )}
        </CardHeader>
        <CardContent>
          {modelli.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Non hai ancora modelli tuoi. Parti da uno dei modelli base con «Duplica», oppure creane uno da zero.
              Puoi anche salvare le fasi di una commessa già fatta: «Aggiungi fasi» → «Salva come modello».
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {modelli.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.nome}</p>
                    <p className="text-xs text-muted-foreground">{dettaglio(m)}</p>
                  </div>
                  {puoModificare && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, false))}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Elimina ${m.nome}`} onClick={() => setDaEliminare(m)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelli base</CardTitle>
          <CardDescription>Quelli già pronti. Spegni quelli che non ti servono: non compaiono più in «Scegli le fasi». Per cambiarli, duplicali.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {base.map((m) => (
              <li key={m.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.descrizione} · {dettaglio(m)}</p>
                </div>
                {puoModificare && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplica ${m.nome}`} onClick={() => setBozza(bozzaDaModello(m, true))}><Copy className="h-4 w-4" /></Button>
                )}
                <Switch
                  checked={!nascostiSet.has(chiaveModelloBase(m.id))}
                  disabled={!puoModificare}
                  aria-label={`Mostra ${m.nome} quando scegli le fasi`}
                  onCheckedChange={(mostra) => mostraBase(m, mostra)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ModelloFasiEditor
        aperto={bozza !== null}
        bozzaIniziale={bozza}
        salvataggio={salva.isPending}
        onChiudi={() => setBozza(null)}
        onSalva={(payload) => salva.mutate(payload, { onSuccess: () => setBozza(null) })}
      />

      <AlertDialog open={daEliminare !== null} onOpenChange={(o) => { if (!o) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>Le commesse che hanno già usato questo modello restano come sono: cambia solo l'elenco dei modelli.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}>Elimina il modello</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

e la pagina vera (sostituisce il segnaposto del Task 12):

```tsx
// src/pages/azienda/settings/SettingsModelliFasi.tsx
// Gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";

export default function SettingsModelliFasi() {
  return <ModelliFasiConfig />;
}
```

- [ ] **Step 5: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/modelliFasiConfig.test.tsx src/test/ui/impostazioniDelPiano.test.tsx`
Expected: PASS.

Se «Elimina Impianti completi» trova due pulsanti (la riga e il dialog di conferma ha «Elimina il modello»), il nome accessibile del pulsante della riga è `Elimina Impianti completi` ed è unico: il test lo usa così.

- [ ] **Step 6: verifica a occhio** (dopo aver applicato la migrazione del Task 9)

`preview_start`, apri `/azienda/impostazioni/modelli-fasi` da computer: nel menu «Cantieri & Costi» c'è «Modelli di fasi»; duplica «Bagno», aggiungi due sottofasi alla fase «Impianto idraulico», salva; apri una commessa vuota → «Scegli le fasi»: il modello compare per primo, sotto «I tuoi modelli». Sul telefono (375 px) la voce **non** compare nell'hub.

- [ ] **Step 7: commit (include il Task 12)**

```bash
git add src/components/settings src/pages/azienda/settings/SettingsModelliFasi.tsx src/pages/azienda/settings/SettingsMobileHub.tsx src/routes/companyRoutes.tsx src/components/layouts/CompanyLayout.tsx src/components/layouts/SettingsLayout.tsx src/components/layouts/SettingsSearch.tsx src/lib/impostazioni/pianoImpostazioni.ts src/test/ui/modelliFasiConfig.test.tsx
git commit -m "Impostazioni: pagina «Modelli di fasi» (i propri modelli con sottofasi, i base duplicabili e nascondibili)"
```

### Task 14: «Salva queste fasi come modello» dalla commessa

**Files:**
- Create: `src/components/orders/SalvaFasiComeModello.tsx`
- Modify: `src/components/orders/OrderWorkPhases.tsx` (nel dialog «Fasi di lavoro», sotto il picker)
- Test: `src/test/ui/salvaFasiComeModello.test.tsx`

Il blocco compare solo a chi ha il permesso delle impostazioni, solo se la commessa ha già delle fasi, e **non da telefono** (si prepara una volta, al computer).

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/salvaFasiComeModello.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalvaFasiComeModello } from "@/components/orders/SalvaFasiComeModello";

const state = vi.hoisted(() => ({ rpc: vi.fn(), successo: vi.fn(), errore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => state.rpc(...a) } }));

const disegna = (props: Partial<Parameters<typeof SalvaFasiComeModello>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SalvaFasiComeModello orderId="order" numeroFasi={3} {...props} />
    </QueryClientProvider>,
  );
beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: "nuovo-modello", error: null }); });
afterEach(cleanup);

describe("SalvaFasiComeModello", () => {
  it("senza fasi non compare", () => {
    const { container } = disegna({ numeroFasi: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("senza nome il pulsante è spento; col nome salva e lo dice", async () => {
    disegna();
    const salva = screen.getByRole("button", { name: "Salva come modello" });
    expect(salva).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "  Bagno chiavi in mano " } });
    fireEvent.click(salva);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("salva_commessa_come_modello", { p_order_id: "order", p_nome: "Bagno chiavi in mano" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalled());
  });

  it("se il nome esiste già lo dice con parole semplici", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    disegna();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "Bagno" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva come modello" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Esiste già un modello con questo nome."));
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/salvaFasiComeModello.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/orders/SalvaFasiComeModello"`.

- [ ] **Step 3: scrivi il componente**

```tsx
// src/components/orders/SalvaFasiComeModello.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaveModelliFasi, messaggioModello } from "@/hooks/useModelliFasi";

// La RPC non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le fasi (e sottofasi) di questa commessa diventano un modello dell'azienda. */
export function SalvaFasiComeModello({ orderId, numeroFasi, className }: { orderId: string; numeroFasi: number; className?: string }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");

  const salva = useMutation({
    mutationFn: async (nomeModello: string) => {
      const { error } = await db.rpc("salva_commessa_come_modello", { p_order_id: orderId, p_nome: nomeModello });
      if (error) throw error;
    },
    onSuccess: (_dati, nomeModello) => {
      toast.success(`Modello «${nomeModello}» salvato`, { description: "Lo trovi in Impostazioni → Modelli di fasi." });
      setNome("");
      void qc.invalidateQueries({ queryKey: chiaveModelliFasi(effectiveCompany?.id) });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  if (numeroFasi === 0) return null;
  const nomePulito = nome.trim();

  return (
    <div className={className}>
      <Label htmlFor="nome-nuovo-modello" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Usa queste {numeroFasi} fasi anche in altre commesse
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input id="nome-nuovo-modello" aria-label="Nome del nuovo modello" value={nome} maxLength={80} placeholder="Nome del modello" onChange={(e) => setNome(e.target.value)} className="h-9 min-w-0 flex-1" />
        <Button size="sm" variant="outline" disabled={!nomePulito || salva.isPending} onClick={() => salva.mutate(nomePulito)}>
          {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
          Salva come modello
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/salvaFasiComeModello.test.tsx`
Expected: PASS (3 casi).

- [ ] **Step 5: monta il blocco nel dialog «Fasi di lavoro»**

In `src/components/orders/OrderWorkPhases.tsx`, importa:

```tsx
import { SalvaFasiComeModello } from "./SalvaFasiComeModello";
```

e dentro il dialog, **dopo** il blocco della singola fase manuale (l'ultimo `<div className="space-y-2">` prima di `</div>` che chiude `<div className="space-y-4">`), aggiungi:

```tsx
                  {/* Un modello dalle fasi di questa commessa: solo da computer e solo a chi gestisce le impostazioni */}
                  {puoModelli && phases.length > 0 && !isMobile && (
                    <>
                      <Separator />
                      <SalvaFasiComeModello orderId={orderId} numeroFasi={phases.length} />
                    </>
                  )}
```

Nel componente principale `OrderWorkPhases` (la riga `const { canEditOrders, canViewCosts, canEditOperai, canViewOrderAmounts, canViewMargins } = usePermissions();`, ~riga 149) aggiungi `canEditSettingsOrders` alla destrutturazione, e subito sotto:

```tsx
  const { role } = useAuth();
  const puoModelli = role === "company_admin" || role === "super_admin" || !!canEditSettingsOrders;
```

(`useAuth` è già importato nel file.) Nel blocco qui sopra sostituisci `isAdminOImpostazioni` con `puoModelli`. Nei due test che fingono `usePermissions` e `useAuth` il blocco non compare (`canEditSettingsOrders` e `role` mancano), quindi non servono altri mock; se un test non finge `useAuth`, aggiungi `vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));`.

- [ ] **Step 6: lancia i test della scheda**

Run: `npx vitest run src/test/ui/orderWorkPlanning.test.tsx src/test/ui/commessaTelefono.test.tsx src/test/ui/salvaFasiComeModello.test.tsx`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add src/components/orders/SalvaFasiComeModello.tsx src/components/orders/OrderWorkPhases.tsx src/test/ui/salvaFasiComeModello.test.tsx
git commit -m "Fasi: «Salva come modello» dalle fasi di una commessa (solo computer, solo impostazioni)"
```

---

# Milestone 3 — Sottofasi dal cantiere (app di campo)

Due strade, come per la percentuale di oggi:
- **«Avanzamento lavori»** (`CampoAvanzamento`, operaio o subappaltatore): la spunta vale subito, come oggi la chiusura della fase.
- **Rapportino del capocantiere** (`CampoRapportino`): le spunte viaggiano nel rapportino (`fasi_lavorate[].sottofasi_fatte`) e diventano «fatte» **quando l'ufficio approva**, come oggi la percentuale. Nessuna colonna nuova: `fasi_lavorate` è già un `jsonb`.

Chi segna: lo stesso di oggi per la percentuale (`puoDichiararePercentuali = isCapocantiere || !esisteCapo`). All'approvazione `fatta_da` risulta chi approva; il rapportino conserva chi l'ha dichiarata.

### Task 15: «Avanzamento lavori» con le sottofasi

**Files:**
- Modify: `src/pages/campo/CampoAvanzamento.tsx`
- Test: `src/test/ui/campoAvanzamentoSottofasi.test.tsx`

- [ ] **Step 1: scrivi i test che falliscono**

```tsx
// src/test/ui/campoAvanzamentoSottofasi.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoAvanzamento from "@/pages/campo/CampoAvanzamento";

const dati = vi.hoisted(() => ({
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>,
  scritture: [] as Array<{ tabella: string; patch: Record<string, unknown>; id: unknown }>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: () => null }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservato: async (u: string) => u }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const righe = () =>
      tabella === "order_work_phases" ? dati.fasi
      : tabella === "order_work_subphases" ? dati.sottofasi
      : tabella === "orders" ? [{ id: "o1", order_code: "C-1", description: "Bagno", indirizzo_lavori: "Via Roma 1" }]
      : [];
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "in", "order"]) lettura[metodo] = () => lettura;
    return {
      ...lettura,
      update: (patch: Record<string, unknown>) => ({
        eq: (_colonna: string, id: unknown) => { dati.scritture.push({ tabella, patch, id }); return Promise.resolve({ error: null }); },
      }),
    };
  };
  return { supabase: { from: costruisci, storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } };
});

const fase = (patch: Record<string, unknown>) => ({
  id: "f1", order_id: "o1", name: "Impianto elettrico", position: 0, status: "in_corso", percentuale: 33,
  notes: null, foto_urls: [], completata_il: null, ...patch,
});
const sotto = (patch: Record<string, unknown>) => ({
  id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch,
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CampoAvanzamento />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.fasi = []; dati.sottofasi = []; dati.scritture = []; });
afterEach(cleanup);

describe("Avanzamento lavori con le sottofasi", () => {
  it("una fase con sottofasi mostra la checklist: spuntare scrive solo «fatta» sulla sottofase", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({ fatta: true }), sotto({ id: "s2", name: "Cavi", position: 1 }), sotto({ id: "s3", name: "Quadro", position: 2 })];
    disegna();
    expect(await screen.findByText("Impianto elettrico")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Tracce: fatta" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({ tabella: "order_work_subphases", patch: { fatta: true }, id: "s2" }));
    expect(dati.scritture.some((s) => s.tabella === "order_work_phases")).toBe(false);
  });

  it("la fase con sottofasi non si chiude con un tocco: la chiudono le sottofasi", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({})];
    disegna();
    const cerchio = await screen.findByRole("button", { name: "Impianto elettrico: si completa spuntando le sottofasi" });
    expect(cerchio).toBeDisabled();
  });

  it("una fase senza sottofasi si chiude come prima", async () => {
    dati.fasi = [fase({ id: "f2", name: "Opere murarie" })];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: "Segna Opere murarie come completata" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({
      tabella: "order_work_phases",
      patch: expect.objectContaining({ status: "completata", percentuale: 100 }),
      id: "f2",
    }));
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/ui/campoAvanzamentoSottofasi.test.tsx`
Expected: FAIL — nessuna checklist (la pagina non conosce le sottofasi).

- [ ] **Step 3: importazioni e cast** in `src/pages/campo/CampoAvanzamento.tsx`

Con le altre importazioni:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { faseHaSottofasi, sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
```

Dopo `const MAX_PHOTO_MB = 10;`:

```tsx
// La tabella delle sottofasi non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
```

- [ ] **Step 4: lettura e scrittura delle sottofasi** (dopo `cantieriQuery`, prima di `const gruppi`)

```tsx
  // Le sottofasi dei MIEI cantieri (la stessa RLS delle fasi). Se la lettura
  // fallisce (tabella non ancora creata) le fasi restano come sempre.
  const sottofasiQuery = useQuery({
    queryKey: ["campo-sottofasi", companyId, user?.id],
    queryFn: async (): Promise<Sottofase[]> => {
      const { data, error } = await db
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il")
        .eq("company_id", companyId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
    retry: false,
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiQuery.data ?? []), [sottofasiQuery.data]);

  const segnaSottofase = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // La fase si ricalcola nel database: si rileggono le sottofasi e le fasi.
      queryClient.invalidateQueries({ queryKey: ["campo-sottofasi"] });
      queryClient.invalidateQueries({ queryKey: ["campo-avanzamento-fasi"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Non riesco a salvare la sottofase"),
  });
```

- [ ] **Step 5: la scheda della fase** — nel `.map((fase) => { … })` delle fasi, dopo `const busy = …`:

```tsx
                const sotto = sottofasiDi.get(fase.id) ?? [];
                const derivata = faseHaSottofasi(sotto);
```

Il cerchio della fase si spegne se la fase deriva dalle sottofasi:

```tsx
                      <button
                        type="button"
                        onClick={() => toggleFase.mutate(fase)}
                        disabled={toggleFase.isPending || derivata}
                        aria-label={
                          derivata
                            ? `${fase.name}: si completa spuntando le sottofasi`
                            : done ? `Riapri la fase ${fase.name}` : `Segna ${fase.name} come completata`
                        }
                        className="mt-0.5 shrink-0"
                      >
```

La checklist sta sotto le etichette di stato, prima delle foto (`{foto.length > 0 && (` della fase):

```tsx
                        {derivata && (
                          <ul className="mt-2 space-y-0.5" aria-label={`Sottofasi di ${fase.name}`}>
                            {sotto.map((s) => (
                              <li key={s.id}>
                                <label className="flex min-h-11 items-center gap-2.5 text-sm">
                                  <Checkbox
                                    checked={s.fatta}
                                    disabled={segnaSottofase.isPending}
                                    onCheckedChange={(v) => segnaSottofase.mutate({ id: s.id, fatta: v === true })}
                                    aria-label={`${s.name}: ${s.fatta ? "fatta" : "da fare"}`}
                                  />
                                  <span className={cn(s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
```

- [ ] **Step 6: lancia i test, devono passare**

Run: `npx vitest run src/test/ui/campoAvanzamentoSottofasi.test.tsx`
Expected: PASS (3 casi).

- [ ] **Step 7: verifica a occhio a 375 px** (dopo le migrazioni): nella pagina «Avanzamento lavori» una fase con sottofasi ha le caselle da 44 px di altezza, senza spazio bianco in più; le fasi senza sottofasi sono identiche a prima.

- [ ] **Step 8: commit**

```bash
git add src/pages/campo/CampoAvanzamento.tsx src/test/ui/campoAvanzamentoSottofasi.test.tsx
git commit -m "Avanzamento lavori: le sottofasi si spuntano dal cantiere; la fase con sottofasi si chiude da sole"
```

### Task 16: sottofasi nel rapportino del capocantiere, valide all'approvazione

**Files:**
- Modify: `src/lib/orders/sottofasi.ts` (due funzioni pure)
- Create: `src/components/campo/SottofasiRapportino.tsx`
- Modify: `src/pages/campo/CampoRapportino.tsx`
- Modify: `src/components/orders/OrdineRapportiniCampo.tsx` (approvazione, ~righe 160-195)
- Test: `src/test/logic/sottofasi.test.ts` (aggiunte), `src/test/ui/campoRapportinoRegole.test.tsx` (un caso e un ritocco ai mock)

- [ ] **Step 1: test delle due funzioni pure (falliscono)** — in coda a `src/test/logic/sottofasi.test.ts`, e aggiungi `fasiLavorateDelRapportino` e `sottofasiDaSegnare` all'importazione:

```ts
describe("fasiLavorateDelRapportino", () => {
  const sotto = new Map([
    ["f1", [
      { id: "s1", peso: 1, fatta: true },
      { id: "s2", peso: 1, fatta: false },
      { id: "s3", peso: 1, fatta: false },
    ]],
  ]);
  it("una fase senza sottofasi resta {phase_id, percentuale}, come oggi", () => {
    expect(fasiLavorateDelRapportino({ f9: 60 }, sotto, ["s2"])).toEqual([{ phase_id: "f9", percentuale: 60 }]);
  });
  it("una fase con sottofasi porta le spunte di questo rapportino e l'avanzamento che ne deriva", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s2"])).toEqual([{ phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2"] }]);
  });
  it("le sottofasi già fatte non si ripetono, e le spunte di fasi non dichiarate si ignorano", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s1", "s9"])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
  it("senza spunte la voce resta una voce di sottofasi, vuota: all'approvazione non tocca la percentuale", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, [])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
});

describe("sottofasiDaSegnare", () => {
  it("null se la voce non riguarda sottofasi: si applica la percentuale come sempre", () => {
    expect(sottofasiDaSegnare({})).toBeNull();
    expect(sottofasiDaSegnare({ sottofasi_fatte: "s1" })).toBeNull();
  });
  it("altrimenti l'elenco, scartando ciò che non è un id", () => {
    expect(sottofasiDaSegnare({ sottofasi_fatte: ["s1", 3, null, "s2"] })).toEqual(["s1", "s2"]);
    expect(sottofasiDaSegnare({ sottofasi_fatte: [] })).toEqual([]);
  });
});
```

Run: `npx vitest run src/test/logic/sottofasi.test.ts` — Expected: FAIL (funzioni mancanti).

- [ ] **Step 2: le due funzioni** — in coda a `src/lib/orders/sottofasi.ts`:

```ts
export interface FaseLavorata {
  phase_id: string;
  percentuale: number;
  /** Solo per le fasi con sottofasi: quelle spuntate in questo rapportino. */
  sottofasi_fatte?: string[];
}

/**
 * Cosa si scrive in campo_rapportini.fasi_lavorate. Per una fase con sottofasi:
 * le spunte NUOVE di questo rapportino e l'avanzamento che ne deriverebbe
 * (un'anteprima: all'approvazione lo ricalcola il database). Chi legge le
 * voci senza conoscere le sottofasi (cronoprogramma) vede sempre phase_id e
 * percentuale.
 */
export function fasiLavorateDelRapportino(
  dichiarate: Readonly<Record<string, number>>,
  sottofasi: ReadonlyMap<string, ReadonlyArray<Pick<Sottofase, "id" | "peso" | "fatta">>>,
  spunte: ReadonlyArray<string>,
): FaseLavorata[] {
  return Object.entries(dichiarate).map(([phase_id, percentuale]): FaseLavorata => {
    const delle = sottofasi.get(phase_id) ?? [];
    if (delle.length === 0) return { phase_id, percentuale };
    const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id)).map((s) => s.id);
    const anteprima = avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s.id) }))) ?? percentuale;
    return { phase_id, percentuale: anteprima, sottofasi_fatte: nuove };
  });
}

/** Le sottofasi da segnare «fatte» all'approvazione; `null` se la voce non riguarda sottofasi. */
export function sottofasiDaSegnare(voce: { sottofasi_fatte?: unknown }): string[] | null {
  if (!Array.isArray(voce.sottofasi_fatte)) return null;
  return voce.sottofasi_fatte.filter((x): x is string => typeof x === "string");
}
```

Run: `npx vitest run src/test/logic/sottofasi.test.ts` — Expected: PASS.

- [ ] **Step 3: il componente del rapportino**

```tsx
// src/components/campo/SottofasiRapportino.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, type Sottofase } from "@/lib/orders/sottofasi";

interface SottofasiRapportinoProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Id delle sottofasi spuntate in questo rapportino. */
  spunte: string[];
  onSpunta: (id: string, spuntata: boolean) => void;
}

/** Nel rapportino del capocantiere: le sottofasi di una fase, al posto dello slider. */
export function SottofasiRapportino({ nomeFase, sottofasi, spunte, onSpunta }: SottofasiRapportinoProps) {
  const fatta = (s: Sottofase) => s.fatta || spunte.includes(s.id);
  const anteprima = avanzamentoDaSottofasi(sottofasi.map((s) => ({ peso: s.peso, fatta: fatta(s) }))) ?? 0;
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{nomeFase}</p>
        <span className="shrink-0 font-bold text-primary">{anteprima}%</span>
      </div>
      <ul className="space-y-0.5" aria-label={`Sottofasi di ${nomeFase}`}>
        {sottofasi.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <Checkbox
                checked={fatta(s)}
                disabled={s.fatta}
                onCheckedChange={(v) => onSpunta(s.id, v === true)}
                aria-label={`${s.name}: ${s.fatta ? "già fatta" : "da fare"}`}
              />
              <span className={cn(fatta(s) && "text-muted-foreground line-through")}>{s.name}</span>
              {s.fatta && <span className="text-[11px] text-muted-foreground">già fatta</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Le sottofasi risultano fatte quando l'ufficio approva il rapportino.</p>
    </div>
  );
}
```

- [ ] **Step 4: il caso nel harness di `campoRapportinoRegole.test.tsx`** (fallisce finché la pagina non cambia)

Nello `state` hoisted aggiungi `fasi: [] as unknown[], sottofasi: [] as unknown[],`; nel finto `useQuery` cambia la riga `queryKey[0] === "campo-fasi-commessa" ? [] :` in:

```tsx
    queryKey[0] === "campo-fasi-commessa" ? state.fasi :
    queryKey[0] === "campo-sottofasi" ? state.sottofasi :
```

e nel `beforeEach` aggiungi `state.fasi = []; state.sottofasi = [];`. In fondo al file:

```tsx
describe("Le sottofasi nel rapportino del capocantiere", () => {
  const sotto = (patch: Record<string, unknown>) => ({ id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch });
  const apri = () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.fasi = [{ id: "f1", name: "Impianto elettrico", status: "in_corso", percentuale: 33 }];
    state.sottofasi = [sotto({ fatta: true }), sotto({ id: "s2", name: "Cavi", position: 1 }), sotto({ id: "s3", name: "Quadro", position: 2 })];
    render(<CampoRapportino />);
    // Se la sezione delle fasi sta nel passo dopo, si passa avanti (come fanno gli altri casi).
    if (!screen.queryByRole("button", { name: "Impianto elettrico" })) avanti();
    fireEvent.click(screen.getByRole("button", { name: "Impianto elettrico" }));
  };

  it("al posto dello slider c'è la checklist: le già fatte sono ferme, le altre si spuntano e l'anteprima cresce", () => {
    apri();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Tracce: già fatta" })).toBeDisabled();
    expect(screen.getByText("33%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("il rapportino porta le spunte e l'avanzamento che ne deriva", async () => {
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    avanti(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      fasi_lavorate: [{ phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2"] }],
    })));
  });
});
```

Se per inviare servono altri campi obbligatori del rapportino (ore, presenze), compilali come nei casi esistenti del `describe` «Il capocantiere, con le ore dalle timbrature» prima di `avanti(); invia();`.

Run: `npx vitest run src/test/ui/campoRapportinoRegole.test.tsx` — Expected: FAIL nei due casi nuovi (la pagina non conosce le sottofasi), gli altri verdi.

- [ ] **Step 5: la pagina `CampoRapportino`**

Importazioni (aggiungi `useMemo` a quella di `react` se manca):

```tsx
import { SottofasiRapportino } from "@/components/campo/SottofasiRapportino";
import { fasiLavorateDelRapportino, sottofaseDaRiga, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
```

Dopo la query `fasiCommessa` (~riga 143):

```tsx
  // Le sottofasi della commessa: il capocantiere le spunta al posto dello slider.
  // Se la lettura fallisce (tabella non ancora creata) si lavora come sempre.
  const { data: sottofasiCommessa = [] } = useQuery({
    queryKey: ["campo-sottofasi", "commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_subphases")
        .select("id, phase_id, name, position, peso, fatta, fatta_il")
        .eq("order_id", orderId)
        .order("position", { ascending: true });
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
    },
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiCommessa), [sottofasiCommessa]);
  // Le sottofasi spuntate in QUESTO rapportino (valgono quando l'ufficio approva).
  const [sottofasiSpunte, setSottofasiSpunte] = useState<string[]>([]);
```

Nel tipo della riga letta (~riga 240) la voce di `fasi_lavorate` diventa `{ phase_id: string; percentuale: number; sottofasi_fatte?: string[] }[] | null`, e subito dopo `setFasiDichiarate(Object.fromEntries(…))` (~riga 310):

```tsx
      setSottofasiSpunte(
        r.fasi_lavorate.flatMap((f) => (Array.isArray(f?.sottofasi_fatte) ? f.sottofasi_fatte.filter((x): x is string => typeof x === "string") : [])),
      );
```

(dentro lo stesso `if (Array.isArray(r.fasi_lavorate)) { … }`).

L'invio (~riga 517) sostituisce

```tsx
      const fasiLavorate = Object.entries(fasiDichiarate).map(([phase_id, percentuale]) => ({
        phase_id,
        percentuale,
      }));
```

con

```tsx
      const fasiLavorate = fasiLavorateDelRapportino(fasiDichiarate, sottofasiDi, sottofasiSpunte);
```

Lo slider per fase (~riga 1032) diventa un `.map` a corpo di funzione: **il `<div key={fase.id} className="mt-3 rounded-xl …">…</div>` di oggi non cambia e si sposta com'è dentro il secondo `return`**:

```tsx
                {puoDichiararePercentuali && fasiDichiarabili.filter(f => f.id in fasiDichiarate).map(fase => {
                  const sotto = sottofasiDi.get(fase.id) ?? [];
                  if (sotto.length > 0) {
                    return (
                      <SottofasiRapportino
                        key={fase.id}
                        nomeFase={fase.name}
                        sottofasi={sotto}
                        spunte={sottofasiSpunte}
                        onSpunta={(id, spuntata) =>
                          setSottofasiSpunte(prev => (spuntata ? [...new Set([...prev, id])] : prev.filter(x => x !== id)))
                        }
                      />
                    );
                  }
                  return (
                    <div key={fase.id} className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                      {/* …lo slider di oggi, invariato… */}
                    </div>
                  );
                })}
```

Run: `npx vitest run src/test/ui/campoRapportinoRegole.test.tsx` — Expected: PASS (anche i casi nuovi).

- [ ] **Step 6: l'approvazione dell'ufficio** — in `src/components/orders/OrdineRapportiniCampo.tsx`, aggiungi l'importazione `import { sottofasiDaSegnare } from "@/lib/orders/sottofasi";` e cambia il blocco «È QUI che l'avanzamento fasi si applica» (~righe 155-195). Il tipo della voce e il ciclo diventano:

```tsx
        const fasi = (rapp?.fasi_lavorate ?? []) as Array<{ phase_id: string; percentuale: number; sottofasi_fatte?: unknown }>;
        if (fasi.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any;
          const { data: fresche, error: frescheErr } = await db
            .from("order_work_phases")
            .select("id, status, percentuale")
            .in("id", fasi.map((f) => f.phase_id))
            .eq("order_id", orderId);
          if (frescheErr) throw frescheErr;
          // Le fasi che oggi hanno sottofasi: la loro percentuale la decidono le
          // sottofasi, non una percentuale dichiarata (anche in un rapportino scritto prima).
          // Se la lettura fallisce (tabella non ancora creata) si va come sempre.
          const { data: conSotto } = await db.from("order_work_subphases").select("phase_id").in("phase_id", fasi.map((f) => f.phase_id));
          const fasiConSottofasi = new Set(((conSotto ?? []) as Array<{ phase_id: string }>).map((r) => r.phase_id));
          const byId = new Map(
            ((fresche ?? []) as { id: string; status: string; percentuale: number | null }[])
              .map((f) => [f.id, f]),
          );
          for (const dich of fasi) {
            const daSegnare = sottofasiDaSegnare(dich);
            if (daSegnare || fasiConSottofasi.has(dich.phase_id)) {
              // Le spunte diventano «fatte»; la fase si ricalcola da sola (trigger del database).
              if (daSegnare && daSegnare.length > 0) {
                const { error: sottoErr } = await db
                  .from("order_work_subphases")
                  .update({ fatta: true })
                  .in("id", daSegnare)
                  .eq("phase_id", dich.phase_id);
                if (sottoErr) throw sottoErr;
              }
              continue;
            }
            const attuale = byId.get(dich.phase_id);
            // …da qui il corpo di oggi, invariato (nuova = Math.max(…), patch, update(patch))…
```

Il resto del ciclo (da `if (!attuale) continue;` a `if (faseErr) throw faseErr;`) **non cambia**: il guardiano `faseCampiProtetti.test.ts` legge proprio quel letterale `const patch: Record<string, unknown> = {…}` e `.from("order_work_phases").update(patch)`.

- [ ] **Step 7: lancia i guardiani e le suite**

Run: `npx vitest run src/test/logic/faseCampiProtetti.test.ts src/test/logic/sottofasi.test.ts src/test/ui/campoRapportinoRegole.test.tsx src/test/ui/campoRapportinoMaterials.test.tsx`
Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add src/lib/orders/sottofasi.ts src/components/campo/SottofasiRapportino.tsx src/pages/campo/CampoRapportino.tsx src/components/orders/OrdineRapportiniCampo.tsx src/test/logic/sottofasi.test.ts src/test/ui/campoRapportinoRegole.test.tsx
git commit -m "Rapportino: il capocantiere spunta le sottofasi; diventano fatte quando l'ufficio approva"
```

### Task 17: il guardiano delle sottofasi

**Files:**
- Create: `src/test/logic/sottofasiCantiere.test.ts`

Il cantiere scrive sulle sottofasi solo `fatta`: lo dice anche il trigger, ma un nuovo punto dell'app che scrivesse altro dovrebbe far rumore **prima** che un operaio veda un errore.

- [ ] **Step 1: scrivi il test**

```ts
// src/test/logic/sottofasiCantiere.test.ts
/**
 * Chi scrive order_work_subphases nell'app (07/10/2026). Il database lascia
 * al cantiere solo «fatta»; qui si tiene ferma la lista dei punti che scrivono,
 * perché uno nuovo vada guardato (ufficio con «Ordini e Commesse», oppure solo `fatta`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const file: string[] = [];
const cammina = (cartella: string) => {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = resolve(cartella, voce.name);
    if (voce.isDirectory()) { if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso); }
    else if (/\.(ts|tsx)$/.test(voce.name)) file.push(percorso);
  }
};
cammina(resolve(process.cwd(), "src"));
const relativo = (p: string) => p.replace(`${process.cwd()}/`, "");
const SCRITTURA = /\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/;

describe("chi scrive le sottofasi", () => {
  it("solo questi file", () => {
    const scrivono = file.filter((p) => SCRITTURA.test(readFileSync(p, "utf8"))).map(relativo).sort();
    expect(scrivono).toEqual([
      "src/components/orders/OrdineRapportiniCampo.tsx",
      "src/hooks/useSottofasi.ts",
      "src/pages/campo/CampoAvanzamento.tsx",
    ]);
  });

  it("l'app di cantiere scrive solo «fatta», e non crea né toglie", () => {
    const pagina = leggi("src/pages/campo/CampoAvanzamento.tsx");
    const scritture = [...pagina.matchAll(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.update\(([\s\S]*?)\)\s*\.eq\(/g)].map((m) => m[1].trim());
    expect(scritture).toEqual(["{ fatta }"]);
    expect(pagina).not.toMatch(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(insert|upsert|delete)\(/);
  });

  it("l'approvazione dei rapportini segna «fatta» e nient'altro", () => {
    const pagina = leggi("src/components/orders/OrdineRapportiniCampo.tsx");
    const scritture = [...pagina.matchAll(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.update\(([\s\S]*?)\)/g)].map((m) => m[1].trim());
    expect(scritture).toEqual(["{ fatta: true }"]);
    expect(pagina).toMatch(/const canApprove = canEditOrders && /);
  });

  it("il rapportino non scrive mai direttamente le sottofasi", () => {
    expect(leggi("src/pages/campo/CampoRapportino.tsx")).not.toMatch(/order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/);
  });
});
```

- [ ] **Step 2: lancia il test, deve passare**

Run: `npx vitest run src/test/logic/sottofasiCantiere.test.ts`
Expected: PASS (4 casi). Se un file in più scrive le sottofasi, il primo caso lo dice col suo nome.

- [ ] **Step 3: commit**

```bash
git add src/test/logic/sottofasiCantiere.test.ts
git commit -m "Sottofasi: guardiano dei punti che le scrivono (il cantiere solo «fatta»)"
```

---

# Milestone 4 — Peso nella media della commessa

Oggi la commessa è la **media semplice** delle fasi (`recompute_order_progress`, `20260710035300`): una demolizione da 800 € pesa come un impianto da 18.000 €. Per azienda si sceglie come pesarle: **alla pari** (come oggi, il default), **per durata** (giorni tra inizio e fine previsti) o **per importo venduto**. Se una fase non ha il dato (data o venduto) la media ricade su «alla pari»: una scelta che non si può applicare non inventa numeri.

### Task 18: la media pesata (logica pura, specchio dell'SQL)

**Files:**
- Create: `src/lib/orders/avanzamentoCommessa.ts`
- Test: `src/test/logic/avanzamentoCommessa.test.ts`

- [ ] **Step 1: scrivi i test che falliscono** (gli stessi casi della prova SQL del Task 20)

```ts
// src/test/logic/avanzamentoCommessa.test.ts
import { describe, expect, it } from "vitest";
import { avanzamentoCommessa, giorniPrevisti, PESI_MEDIA, type FasePesata } from "@/lib/orders/avanzamentoCommessa";

const f = (patch: Partial<FasePesata>): FasePesata => ({
  status: "da_iniziare", percentuale: 0, start_date: null, end_date: null, importo_venduto: null, ...patch,
});
// La commessa di prova del Task 20: A chiusa (10 giorni, 800 €), B da iniziare (30 giorni, 18.000 €), C a metà (10 giorni, 1.000 €).
const fasi: FasePesata[] = [
  f({ status: "completata", percentuale: 100, start_date: "2026-10-01", end_date: "2026-10-10", importo_venduto: 800 }),
  f({ status: "da_iniziare", percentuale: 0, start_date: "2026-10-11", end_date: "2026-11-09", importo_venduto: 18000 }),
  f({ status: "in_corso", percentuale: 50, start_date: "2026-11-10", end_date: "2026-11-19", importo_venduto: 1000 }),
];

describe("avanzamentoCommessa", () => {
  it("senza fasi non c'è un avanzamento", () => {
    expect(avanzamentoCommessa([], "uguale")).toBeNull();
  });
  it("alla pari: la media semplice di oggi", () => {
    expect(avanzamentoCommessa(fasi, "uguale")).toEqual({ percentuale: 50, pesoUsato: "uguale" });
  });
  it("per durata: i giorni previsti sono i pesi (10, 30, 10)", () => {
    expect(avanzamentoCommessa(fasi, "durata")).toEqual({ percentuale: 30, pesoUsato: "durata" });
  });
  it("per venduto: gli importi sono i pesi (800, 18.000, 1.000)", () => {
    expect(avanzamentoCommessa(fasi, "venduto")).toEqual({ percentuale: 7, pesoUsato: "venduto" });
  });
  it("una fase chiusa vale 100 anche con la percentuale a 0", () => {
    expect(avanzamentoCommessa([f({ status: "completata", percentuale: 0 }), f({})], "uguale")?.percentuale).toBe(50);
  });
  it("se a una fase manca la data ricade su «alla pari» e lo dice", () => {
    const senzaData = fasi.map((x, i) => (i === 2 ? { ...x, end_date: null } : x));
    expect(avanzamentoCommessa(senzaData, "durata")).toEqual({ percentuale: 50, pesoUsato: "uguale" });
  });
  it("se a una fase manca il venduto (o è zero) ricade su «alla pari»", () => {
    expect(avanzamentoCommessa(fasi.map((x, i) => (i === 2 ? { ...x, importo_venduto: null } : x)), "venduto")?.pesoUsato).toBe("uguale");
    expect(avanzamentoCommessa(fasi.map((x, i) => (i === 1 ? { ...x, importo_venduto: 0 } : x)), "venduto")?.pesoUsato).toBe("uguale");
  });
  it("una fase con la fine prima dell'inizio non ha una durata: ricade su «alla pari»", () => {
    expect(avanzamentoCommessa(fasi.map((x, i) => (i === 0 ? { ...x, end_date: "2026-09-01" } : x)), "durata")?.pesoUsato).toBe("uguale");
  });
});

describe("giorniPrevisti", () => {
  it("conta i giorni compresi gli estremi", () => {
    expect(giorniPrevisti({ start_date: "2026-10-01", end_date: "2026-10-10" })).toBe(10);
    expect(giorniPrevisti({ start_date: "2026-10-01", end_date: "2026-10-01" })).toBe(1);
  });
  it("senza date, o con la fine prima dell'inizio, non c'è una durata", () => {
    expect(giorniPrevisti({ start_date: null, end_date: "2026-10-10" })).toBeNull();
    expect(giorniPrevisti({ start_date: "2026-10-10", end_date: "2026-10-01" })).toBeNull();
  });
});

describe("PESI_MEDIA", () => {
  it("le tre scelte, con «alla pari» per prima", () => {
    expect(PESI_MEDIA.map((p) => p.valore)).toEqual(["uguale", "durata", "venduto"]);
  });
});
```

- [ ] **Step 2: lancia i test, devono fallire**

Run: `npx vitest run src/test/logic/avanzamentoCommessa.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orders/avanzamentoCommessa"`.

- [ ] **Step 3: scrivi il modulo**

```ts
// src/lib/orders/avanzamentoCommessa.ts
/**
 * Avanzamento di una commessa dalle sue fasi, con il peso scelto dall'azienda
 * (Impostazioni → Fasi e avanzamento). È lo specchio di recompute_order_progress
 * (20281007150000): le stesse regole, gli stessi casi nella prova SQL.
 * Modulo puro: nessun React, nessun Supabase.
 */
import { avanzamentoFase } from "@/lib/orders/cronoprogramma";

export type PesoMedia = "uguale" | "durata" | "venduto";

export const PESI_MEDIA: ReadonlyArray<{ valore: PesoMedia; etichetta: string; spiegazione: string }> = [
  { valore: "uguale", etichetta: "Alla pari", spiegazione: "Ogni fase conta come le altre." },
  { valore: "durata", etichetta: "Per durata", spiegazione: "Una fase lunga conta più di una breve. Servono le date di inizio e fine di tutte le fasi." },
  { valore: "venduto", etichetta: "Per importo venduto", spiegazione: "Una fase da 18.000 € conta più di una da 800 €. Serve il venduto di tutte le fasi." },
];

export interface FasePesata {
  status: string;
  percentuale: number | null;
  start_date: string | null;
  end_date: string | null;
  importo_venduto: number | null;
}

const MS_GIORNO = 86_400_000;

/** Giorni previsti di una fase, estremi compresi; `null` senza date o con la fine prima dell'inizio. */
export function giorniPrevisti(f: Pick<FasePesata, "start_date" | "end_date">): number | null {
  if (!f.start_date || !f.end_date) return null;
  const da = Date.parse(`${f.start_date}T00:00:00Z`);
  const a = Date.parse(`${f.end_date}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(a) || a < da) return null;
  return Math.round((a - da) / MS_GIORNO) + 1;
}

/** `null` senza fasi. `pesoUsato` dice quale peso ha davvero contato (ricade su «uguale» se manca un dato). */
export function avanzamentoCommessa(
  fasi: ReadonlyArray<FasePesata>,
  peso: PesoMedia,
): { percentuale: number; pesoUsato: PesoMedia } | null {
  if (fasi.length === 0) return null;
  const pct = fasi.map((f) => avanzamentoFase(f));
  const pesi: Array<number | null> | null =
    peso === "durata" ? fasi.map(giorniPrevisti)
    : peso === "venduto" ? fasi.map((f) => (f.importo_venduto != null && f.importo_venduto > 0 ? f.importo_venduto : null))
    : null;
  if (pesi && pesi.every((p): p is number => p != null)) {
    const totale = pesi.reduce<number>((s, p) => s + (p as number), 0);
    const somma = pesi.reduce<number>((s, p, i) => s + (p as number) * pct[i], 0);
    return { percentuale: Math.round(somma / totale), pesoUsato: peso };
  }
  return { percentuale: Math.round(pct.reduce((s, p) => s + p, 0) / pct.length), pesoUsato: "uguale" };
}
```

- [ ] **Step 4: lancia i test, devono passare**

Run: `npx vitest run src/test/logic/avanzamentoCommessa.test.ts`
Expected: PASS (11 casi).

- [ ] **Step 5: commit**

```bash
git add src/lib/orders/avanzamentoCommessa.ts src/test/logic/avanzamentoCommessa.test.ts
git commit -m "Avanzamento della commessa: media alla pari, per durata o per venduto (logica pura)"
```

### Task 19: la migrazione del peso nella media

**Files:**
- Create: `supabase/migrations/20281007150000_peso_media_avanzamento.sql`
- Test: `src/test/logic/pesoMediaMigrazione.test.ts`

Dipende da `20281007140000` (esiste `company_fasi_settings`). **Cambia `recompute_order_progress`**, che scatta a ogni modifica di una fase: con `peso_media = 'uguale'` (default, e quando manca la riga) il risultato è **identico** a quello di oggi — la prova SQL lo verifica sulle commesse vere. Ritocca anche il trigger del rollup (`trg_order_work_phases_progress`) perché scatti pure cambiando date e venduto (che con un peso per durata o per venduto contano): è l'**unico** DDL su `order_work_phases` di tutto il piano, un `DROP`/`CREATE TRIGGER` su una tabella piccola con `lock_timeout` di 3 secondi.

- [ ] **Step 1: verifica la versione libera** — `ls supabase/migrations/20281007150000_*.sql` → `No such file or directory`.

- [ ] **Step 2: test sul testo (fallisce: il file non c'è)**

```ts
// src/test/logic/pesoMediaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007150000_peso_media_avanzamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");

describe("migrazione peso_media_avanzamento", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/add column if not exists peso_media text not null default 'uguale'/);
    expect(codice).toMatch(/check \(peso_media in \('uguale', 'durata', 'venduto'\)\)/);
    expect(codice).toMatch(/create or replace function public\.recompute_order_progress\(p_order_id uuid\)/);
  });
  it("la funzione resta DEFINER con il search_path fisso, e non cambia i privilegi (create or replace li conserva)", () => {
    const f = codice.match(/create or replace function public\.recompute_order_progress[\s\S]*?\n\$\$;/)![0];
    expect(f).toMatch(/security definer\s+set search_path = public/);
    expect(codice).not.toMatch(/grant execute on function public\.recompute_order_progress/);
  });
  it("una fase chiusa vale 100 e la media di oggi resta quella di riserva", () => {
    expect(codice).toMatch(/case when status = 'completata' then 100\s+else least\(100, greatest\(coalesce\(percentuale, 0\), 0\)\) end as pct/);
    expect(codice).toMatch(/else round\(avg\(f\.pct\)\)/);
  });
  it("durata e venduto si usano solo se ce l'hanno TUTTE le fasi", () => {
    expect(codice).toMatch(/v_peso = 'durata' and n\.con_giorni = n\.tot/);
    expect(codice).toMatch(/v_peso = 'venduto' and n\.con_venduto = n\.tot/);
  });
  it("il rollup scatta anche cambiando date e venduto, non solo percentuale e stato", () => {
    expect(codice).toMatch(/drop trigger if exists trg_order_work_phases_progress on public\.order_work_phases;/);
    expect(codice).toMatch(
      /after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto\s+on public\.order_work_phases\s+for each row execute function public\.trg_owp_recompute_order_progress\(\);/,
    );
  });
  it("il salvataggio del peso riallinea le commesse dell'azienda e rifiuta valori sconosciuti", () => {
    expect(codice).toMatch(/create or replace function public\.fasi_impostazioni_salva\(p_company_id uuid, p_valori jsonb\)/);
    expect(codice).toMatch(/perform public\.recompute_order_progress\(/);
    expect(codice).toMatch(/raise exception 'Scelta non valida\.'/);
  });
});
```

Run: `npx vitest run src/test/logic/pesoMediaMigrazione.test.ts` — Expected: FAIL (`ENOENT`).

- [ ] **Step 3: la migrazione**

```sql
-- Peso nella media dell'avanzamento della commessa (07/10/2026).
--
-- recompute_order_progress (20260710035300) fa la media SEMPLICE delle fasi:
-- una demolizione da 800 € pesa come un impianto da 18.000 €. Ora l'azienda
-- sceglie come pesarle (company_fasi_settings.peso_media):
--   · 'uguale'  — la media di oggi (default, e quando non c'è la riga);
--   · 'durata'  — giorni tra inizio e fine previsti (estremi compresi);
--   · 'venduto' — importo_venduto della fase.
-- Durata e venduto valgono solo se li hanno TUTTE le fasi della commessa: se
-- ne manca uno si ricade sulla media di oggi (una scelta che non si può
-- applicare non inventa numeri). Una fase completata vale 100 anche con la
-- percentuale a 0, come sempre. Con 'uguale' il risultato è IDENTICO a quello
-- di prima: provato sulle commesse vere nella prova SQL.
--
-- Lo specchio TypeScript è src/lib/orders/avanzamentoCommessa.ts: stessi casi.
-- La funzione tiene i privilegi di oggi (create or replace li conserva).
--
-- Il rollup (trg_order_work_phases_progress) scattava solo cambiando
-- percentuale e stato: con un peso per durata o per venduto la media dipende
-- anche da date e importo, quindi ora scatta pure cambiando start_date,
-- end_date e importo_venduto. Con 'uguale' il numero non cambia: la funzione
-- scrive solo se il valore è diverso. È l'unico ritocco a order_work_phases di
-- questo piano: un DROP/CREATE TRIGGER su una tabella piccola, con lock_timeout.

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists peso_media text not null default 'uguale'
  check (peso_media in ('uguale', 'durata', 'venduto'));

create or replace function public.recompute_order_progress(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct integer;
  v_peso text;
begin
  select coalesce(s.peso_media, 'uguale') into v_peso
    from public.orders o
    left join public.company_fasi_settings s on s.company_id = o.company_id
   where o.id = p_order_id;

  with f as (
    select case when status = 'completata' then 100
                else least(100, greatest(coalesce(percentuale, 0), 0)) end as pct,
           case when start_date is not null and end_date is not null and end_date >= start_date
                then (end_date - start_date + 1) end as giorni,
           case when coalesce(importo_venduto, 0) > 0 then importo_venduto end as venduto
      from public.order_work_phases
     where order_id = p_order_id
  ), n as (
    select count(*) as tot, count(giorni) as con_giorni, count(venduto) as con_venduto from f
  )
  select case
           when v_peso = 'durata' and n.con_giorni = n.tot
             then round(sum(f.pct::numeric * f.giorni) / nullif(sum(f.giorni), 0))
           when v_peso = 'venduto' and n.con_venduto = n.tot
             then round(sum(f.pct::numeric * f.venduto) / nullif(sum(f.venduto), 0))
           else round(avg(f.pct))
         end::integer
    into v_pct
    from f cross join n
   group by n.tot, n.con_giorni, n.con_venduto;

  -- Senza fasi non c'è niente da scrivere (come prima).
  if v_pct is null then
    return;
  end if;

  update public.orders
     set percentuale_avanzamento = v_pct
   where id = p_order_id
     and coalesce(percentuale_avanzamento, -1) <> v_pct;
end;
$$;

-- Il rollup scatta anche cambiando date e venduto, non solo percentuale e stato.
drop trigger if exists trg_order_work_phases_progress on public.order_work_phases;
create trigger trg_order_work_phases_progress
  after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto
  on public.order_work_phases
  for each row execute function public.trg_owp_recompute_order_progress();

-- Stessa firma di 20281007140000: ora accetta anche { peso_media }.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nascosti text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'modelli_base_nascosti' then
    select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}')
      into v_nascosti
      from jsonb_array_elements_text(p_valori->'modelli_base_nascosti') as t(x);
    update public.company_fasi_settings
       set modelli_base_nascosti = v_nascosti, updated_at = now()
     where company_id = p_company_id;
  end if;

  if p_valori ? 'peso_media' then
    if (p_valori->>'peso_media') not in ('uguale', 'durata', 'venduto') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set peso_media = p_valori->>'peso_media', updated_at = now()
     where company_id = p_company_id;
    -- Le commesse dell'azienda si riallineano subito: il numero che si vede
    -- deve essere quello della scelta.
    perform public.recompute_order_progress(o.order_id)
      from (select distinct order_id from public.order_work_phases where company_id = p_company_id) o;
  end if;
end;
$$;
```

- [ ] **Step 4: lancia il test sul testo** — `npx vitest run src/test/logic/pesoMediaMigrazione.test.ts` → PASS (6 casi).

- [ ] **Step 5: commit locale (migrazione non ancora applicata)**

```bash
git add supabase/migrations/20281007150000_peso_media_avanzamento.sql src/test/logic/pesoMediaMigrazione.test.ts
git commit -m "Avanzamento: peso nella media per azienda (alla pari, durata, venduto) — migrazione non ancora applicata"
```

### Task 20: prova SQL a secco, poi applicazione (serve l'OK)

- [ ] **Step 1: prova a secco** — una `execute_sql` sola: il contenuto **intero** di `20281007130000_…` e `20281007140000_…` (se non ancora applicate) e di `20281007150000_…`, poi questo blocco. Annulla tutto alla fine.

```sql
do $prova$
declare
  v_azienda uuid; v_ordine uuid; v_admin uuid; v_pct integer; v_diverse integer;
begin
  -- 0. Con «alla pari» il risultato è quello di sempre: si ricalcolano TUTTE le commesse che hanno fasi
  --    (nessuna azienda ha ancora scelto un peso) e si confronta, commessa per commessa, con la media di prima.
  perform public.recompute_order_progress(x.order_id) from (select distinct order_id from public.order_work_phases) x;
  select count(*) into v_diverse
    from (select order_id,
                 round(avg(case when status = 'completata' then 100 else least(100, greatest(coalesce(percentuale, 0), 0)) end))::int as prima
            from public.order_work_phases group by order_id) vecchia
    join public.orders o on o.id = vecchia.order_id
   where o.percentuale_avanzamento is distinct from vecchia.prima;
  if v_diverse <> 0 then raise exception 'KO 0: % commesse con la media diversa da quella di sempre', v_diverse; end if;

  select p.company_id into v_azienda from public.profiles p join auth.users u on u.id = p.id where u.email = 'demo@azienda.srl';
  select ur.user_id into v_admin from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where p.company_id = v_azienda and ur.role = 'company_admin'::public.app_role limit 1;
  select o.id into v_ordine from public.orders o where o.company_id = v_azienda and o.deleted_at is null
     and not exists (select 1 from public.order_work_phases f where f.order_id = o.id) order by o.created_at limit 1;
  if v_ordine is null then raise exception 'PROVA SALTATA: serve nella demo una commessa senza fasi'; end if;

  -- A chiusa (10 giorni, 800 €), B da iniziare (30 giorni, 18.000 €), C a metà (10 giorni, 1.000 €)
  insert into public.order_work_phases (company_id, order_id, name, position, status, percentuale, start_date, end_date, importo_venduto) values
    (v_azienda, v_ordine, 'A', 0, 'completata', 100, '2026-10-01', '2026-10-10', 800),
    (v_azienda, v_ordine, 'B', 1, 'da_iniziare', 0, '2026-10-11', '2026-11-09', 18000),
    (v_azienda, v_ordine, 'C', 2, 'in_corso', 50, '2026-11-10', '2026-11-19', 1000);

  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 1: alla pari %, atteso 50', v_pct; end if;

  insert into public.company_fasi_settings (company_id, peso_media) values (v_azienda, 'durata')
    on conflict (company_id) do update set peso_media = excluded.peso_media;
  perform public.recompute_order_progress(v_ordine);
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 30 then raise exception 'KO 2: per durata %, atteso 30', v_pct; end if;

  update public.company_fasi_settings set peso_media = 'venduto' where company_id = v_azienda;
  perform public.recompute_order_progress(v_ordine);
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 7 then raise exception 'KO 3: per venduto %, atteso 7', v_pct; end if;

  -- manca il venduto di una fase: il rollup scatta da solo (cambia importo_venduto) e ricade sulla media alla pari
  update public.order_work_phases set importo_venduto = null where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 4: senza venduto %, atteso 50 (il rollup non è scattato?)', v_pct; end if;

  -- per durata manca una data: ricade sulla media alla pari
  update public.company_fasi_settings set peso_media = 'durata' where company_id = v_azienda;
  update public.order_work_phases set end_date = null where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 50 then raise exception 'KO 5: senza data %, atteso 50', v_pct; end if;

  -- torna la data: il rollup scatta da solo e per durata la commessa è a 30
  update public.order_work_phases set end_date = '2026-11-19' where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 30 then raise exception 'KO 6: cambiando una data la commessa non si è riallineata (%)', v_pct; end if;

  -- torna il venduto: per venduto la commessa è a 7
  update public.company_fasi_settings set peso_media = 'venduto' where company_id = v_azienda;
  update public.order_work_phases set importo_venduto = 1000 where order_id = v_ordine and name = 'C';
  select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
  if v_pct <> 7 then raise exception 'KO 7: cambiando il venduto la commessa non si è riallineata (%)', v_pct; end if;

  -- l'RPC: rifiuta un valore sconosciuto; col valore buono riallinea la commessa anche se nessuna fase cambia
  if v_admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('peso_media', 'a caso'));
      raise exception 'KO 8: valore sconosciuto accettato';
    exception when sqlstate '22023' then null;
    end;
    perform public.fasi_impostazioni_salva(v_azienda, jsonb_build_object('peso_media', 'uguale'));
    reset role;
    select percentuale_avanzamento into v_pct from public.orders where id = v_ordine;
    if v_pct <> 50 then raise exception 'KO 9: dopo il salvataggio dell''RPC (alla pari) %, atteso 50', v_pct; end if;
  end if;

  raise exception 'PROVA OK — annullata di proposito, niente è stato salvato (amministratore: %)', (v_admin is not null);
end
$prova$;
```

Expected: `PROVA OK — annullata di proposito …`. Un `KO n` dice la regola che non regge. **`KO 0` è la garanzia che conta**: dice che con «alla pari» nessuna commessa vera cambia numero.

- [ ] **Step 2: chiedi l'OK e applica** (`apply_migration`, `name: "peso_media_avanzamento"`), poi

```sql
update supabase_migrations.schema_migrations
   set version = '20281007150000'
 where name = 'peso_media_avanzamento' and left(version, 4) = '2026';
```

- [ ] **Step 3: verifica** — `select version, name from supabase_migrations.schema_migrations where version = '20281007150000';` (1 riga) e che i privilegi della funzione siano rimasti quelli di prima (`referralEPassiSoloAChiServe`): 

```sql
select has_function_privilege('anon', 'public.recompute_order_progress(uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.recompute_order_progress(uuid)', 'execute') as authenticated,
       has_function_privilege('service_role', 'public.recompute_order_progress(uuid)', 'execute') as service_role;
-- atteso: false, false, true
```

### Task 21: la scelta nelle Impostazioni e lo stesso numero ovunque

**Files:**
- Create: `src/hooks/usePesoMediaFasi.ts`
- Create: `src/components/settings/AvanzamentoCommessaConfig.tsx`
- Modify: `src/components/settings/ModelliFasiConfig.tsx` (la nuova scheda in cima)
- Modify: `src/components/layouts/CompanyLayout.tsx`, `SettingsLayout.tsx`, `SettingsSearch.tsx`, `src/pages/azienda/settings/SettingsMobileHub.tsx` (la voce diventa «Fasi e avanzamento»)
- Modify: `src/components/orders/OrderWorkPhases.tsx` (`avanzamentoMedio`), `src/components/orders/CronoprogrammaCommessa.tsx` (`avanzamentoComplessivo`)
- Test: `src/test/ui/avanzamentoCommessaConfig.test.tsx`

Il peso sta in un hook **separato** da `useModelliFasi`: se la colonna `peso_media` non c'è ancora (migrazione 4 non applicata) i modelli dell'azienda continuano a funzionare e il peso resta «alla pari».

- [ ] **Step 1: l'hook**

```ts
// src/hooks/usePesoMediaFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import type { PesoMedia } from "@/lib/orders/avanzamentoCommessa";

// La colonna non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const VALORI: ReadonlyArray<PesoMedia> = ["uguale", "durata", "venduto"];
export const chiavePesoMedia = (companyId: string | undefined) => ["peso-media-fasi", companyId] as const;

/** Come l'azienda pesa le fasi nella media della commessa. Senza scelta (o se la lettura fallisce): alla pari. */
export function usePesoMediaFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiavePesoMedia(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<PesoMedia> => {
      try {
        const { data, error } = await db.from("company_fasi_settings").select("peso_media").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        const v = data?.peso_media as PesoMedia | undefined;
        return v && VALORI.includes(v) ? v : "uguale";
      } catch {
        return "uguale";
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (peso: PesoMedia) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { peso_media: peso } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: le commesse si sono aggiornate");
      void qc.invalidateQueries({ queryKey: chiavePesoMedia(companyId) });
      // La percentuale delle commesse è cambiata nel database.
      void qc.invalidateQueries({ queryKey: ["order_work_phases"] });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  return { pesoMedia: query.data ?? "uguale", isLoading: query.isLoading, salva };
}
```

- [ ] **Step 2: test della scheda (falliscono)**

```tsx
// src/test/ui/avanzamentoCommessaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AvanzamentoCommessaConfig from "@/components/settings/AvanzamentoCommessaConfig";

const state = vi.hoisted(() => ({ peso: "uguale", salva: vi.fn() }));
vi.mock("@/hooks/usePesoMediaFasi", () => ({
  usePesoMediaFasi: () => ({ pesoMedia: state.peso, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));
beforeEach(() => { vi.clearAllMocks(); state.peso = "uguale"; });
afterEach(cleanup);

describe("AvanzamentoCommessaConfig", () => {
  it("mostra le tre scelte, con quella dell'azienda selezionata", () => {
    state.peso = "durata";
    render(<AvanzamentoCommessaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Alla pari/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Per importo venduto/ })).not.toBeChecked();
  });
  it("cambiare scelta salva", () => {
    render(<AvanzamentoCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Per importo venduto/ }));
    expect(state.salva).toHaveBeenCalledWith("venduto");
  });
  it("chi non può modificare le vede spente", () => {
    render(<AvanzamentoCommessaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeDisabled();
  });
});
```

Run: `npx vitest run src/test/ui/avanzamentoCommessaConfig.test.tsx` — Expected: FAIL (componente mancante).

- [ ] **Step 3: la scheda**

```tsx
// src/components/settings/AvanzamentoCommessaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { PESI_MEDIA, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

export default function AvanzamentoCommessaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { pesoMedia, salva } = usePesoMediaFasi();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Come si calcola l'avanzamento della commessa</CardTitle>
        <CardDescription>
          La commessa avanza con le sue fasi. Scegli quanto conta ciascuna: se a una fase manca il dato (la data o il venduto), la commessa conta le fasi alla pari.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={pesoMedia} onValueChange={(v) => salva.mutate(v as PesoMedia)} disabled={!puoModificare} className="gap-3">
          {PESI_MEDIA.map((p) => (
            <div key={p.valore} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={p.valore} id={`peso-${p.valore}`} className="mt-0.5" disabled={!puoModificare} />
              <Label htmlFor={`peso-${p.valore}`} className="cursor-pointer space-y-0.5 font-normal">
                <span className="block text-sm font-medium">{p.etichetta}</span>
                <span className="block text-xs text-muted-foreground">{p.spiegazione}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
```

Run: `npx vitest run src/test/ui/avanzamentoCommessaConfig.test.tsx` — Expected: PASS (3 casi). (Il nome accessibile di ogni `radio` è l'etichetta collegata, che comincia con «Alla pari», «Per durata», «Per importo venduto».)

- [ ] **Step 4: la scheda in cima alla pagina, e il nome della voce**

In `ModelliFasiConfig.tsx`, importa `AvanzamentoCommessaConfig` e mettila come **prima** scheda del `div` principale:

```tsx
      <AvanzamentoCommessaConfig puoModificare={puoModificare} />
```

Aggiorna il test `modelliFasiConfig.test.tsx`: aggiungi il finto `vi.mock("@/hooks/usePesoMediaFasi", () => ({ usePesoMediaFasi: () => ({ pesoMedia: "uguale", isLoading: false, salva: { mutate: vi.fn(), isPending: false } }) }));`.

Nome della voce: da «Modelli di fasi» a **«Fasi e avanzamento»** in `CompanyLayout.tsx` (label), `SettingsMobileHub.tsx` (label), `SettingsLayout.tsx` (`title: "Fasi e avanzamento"`, `description: "I modelli di fasi con le sottofasi e come si calcola l'avanzamento delle commesse"`) e in `SettingsSearch.tsx` (`title: "Fasi e avanzamento"`, aggiungi alle parole chiave `"peso"`, `"media"`, `"durata"`, `"venduto"`).

- [ ] **Step 5: lo stesso numero nella scheda della commessa**

`OrderWorkPhases.tsx`: importa `avanzamentoCommessa` e `usePesoMediaFasi`, e cambia `avanzamentoMedio` (~riga 221):

```tsx
  const { pesoMedia } = usePesoMediaFasi();
  const avanzamentoMedio = useMemo(
    () => avanzamentoCommessa(phases, pesoMedia)?.percentuale ?? null,
    [phases, pesoMedia],
  );
```

e nei due test che fingono `@tanstack/react-query` (`orderWorkPlanning`, `commessaTelefono`) aggiungi `vi.mock("@/hooks/usePesoMediaFasi", () => ({ usePesoMediaFasi: () => ({ pesoMedia: "uguale" }) }));`.

`CronoprogrammaCommessa.tsx` (~riga 213): `const avanzamento = avanzamentoComplessivo(fasi);` diventa

```tsx
  const { pesoMedia } = usePesoMediaFasi();
  const avanzamento = avanzamentoCommessa(phases, pesoMedia)?.percentuale ?? avanzamentoComplessivo(fasi);
```

(`phases` è già letto più su nel componente da `useOrderWorkPhases`; `avanzamentoComplessivo` resta come riserva e per i suoi test.) Se `cronoprogrammaCommessa.test.tsx` finge i moduli, aggiungi lo stesso finto del peso.

- [ ] **Step 6: lancia le suite**

Run: `npx vitest run src/test/ui src/test/logic`
Expected: PASS, salvo il fallimento già noto `tettiTemplateModules.test.tsx`.

- [ ] **Step 7: verifica a occhio** (dopo l'applicazione): in una commessa con fasi datate scegli «Per durata»: «Economia delle lavorazioni», Cronoprogramma e intestazione della commessa mostrano **lo stesso numero** (leggi il valore nel database: `select percentuale_avanzamento from orders where id = …`).

- [ ] **Step 8: commit**

```bash
git add src/hooks/usePesoMediaFasi.ts src/components/settings src/components/layouts src/pages/azienda/settings/SettingsMobileHub.tsx src/components/orders/OrderWorkPhases.tsx src/components/orders/CronoprogrammaCommessa.tsx src/test/ui
git commit -m "Impostazioni «Fasi e avanzamento»: come si pesano le fasi nella media; lo stesso numero ovunque"
```

---

# Milestone 5 — SAL: «meno SAL precedenti» (dopo la tua decisione)

Oggi ogni verbale mostra l'importo **cumulativo** (contrattuale × % per voce, sommato): il secondo SAL, a lavori più avanti, ripete anche quanto era già nel primo. Per fatturare serve la differenza. **Proposta, da confermare:**
- «Già maturato nei SAL precedenti» = somma di `importo_totale` dei SAL **emessi, approvati o firmati** della stessa commessa con `numero_sal` minore (le bozze non contano).
- «Da fatturare con questo SAL» = `totale − già maturato`. Se è negativo (una rettifica al ribasso) si mostra in rosso come «Rettifica», non si blocca.
- Il verbale, la scheda in elenco e il PDF mostrano le due righe in più; **non cambiano** gli importi esistenti né il database.

Questa milestone **non parte** senza il tuo OK sulla definizione qui sopra. Le scelte «a quale rata o fattura si aggancia il SAL firmato» e «SAL per i subappaltatori» restano fuori e sono domande aperte (§5). Il SAL «a misura» richiederebbe unità e quantità nelle voci e non è in questo piano.

### Task 22: il netto del SAL (logica pura, in due copie con un test di parità)

**Files:**
- Create: `src/lib/orders/salNetto.ts`, `supabase/functions/_shared/salNetto.ts`
- Test: `src/test/logic/salNetto.test.ts`

La funzione edge (Deno) non può importare da `src/`: le due copie sono identiche e **un solo test le prova entrambe sugli stessi casi**.

- [ ] **Step 1: scrivi il test che fallisce**

```ts
// src/test/logic/salNetto.test.ts
import { describe, expect, it } from "vitest";
import * as app from "@/lib/orders/salNetto";
import * as edge from "../../../supabase/functions/_shared/salNetto";

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({ id: `s${numero_sal}`, numero_sal, stato, importo_totale });
const tutti = [sal(1, "firmato", 10000), sal(2, "approvato", 6000.5), sal(3, "bozza", 99999), sal(4, "emesso", 4000), sal(5, "emesso", 20000)];

describe.each([["app", app], ["edge", edge]])("salNetto (%s)", (_nome, m) => {
  it("il già maturato conta i SAL emessi, approvati o firmati con numero minore; le bozze no", () => {
    expect(m.maturatoPrecedente({ id: "s4", numero_sal: 4 }, tutti)).toBe(16000.5);
    expect(m.maturatoPrecedente({ id: "s1", numero_sal: 1 }, tutti)).toBe(0);
  });
  it("non conta se stesso né i SAL successivi", () => {
    expect(m.maturatoPrecedente({ id: "s2", numero_sal: 2 }, tutti)).toBe(10000);
  });
  it("il netto è il totale meno il già maturato, a due decimali; può essere negativo", () => {
    expect(m.nettoSal(20000, 16000.5)).toEqual({ totale: 20000, precedente: 16000.5, daFatturare: 3999.5 });
    expect(m.nettoSal(5000, 6000)).toEqual({ totale: 5000, precedente: 6000, daFatturare: -1000 });
    expect(m.nettoSal(0.1 + 0.2, 0).daFatturare).toBe(0.3);
  });
  it("un importo non numerico vale zero", () => {
    expect(m.maturatoPrecedente({ id: "x", numero_sal: 9 }, [{ id: "y", numero_sal: 1, stato: "emesso", importo_totale: Number.NaN }])).toBe(0);
  });
});
```

Run: `npx vitest run src/test/logic/salNetto.test.ts` — Expected: FAIL (moduli mancanti).

- [ ] **Step 2: le due copie** (stesso contenuto, in `src/lib/orders/salNetto.ts` e in `supabase/functions/_shared/salNetto.ts`)

```ts
/**
 * «Meno SAL precedenti»: quanto del SAL è nuovo rispetto a quelli già emessi.
 * Gli importi dei verbali sono cumulativi (contrattuale × % per voce): per
 * fatturare serve la differenza. Due copie identiche (app e funzione edge,
 * che non può importare da src/): src/test/logic/salNetto.test.ts le prova
 * entrambe sugli stessi casi.
 */
export interface SalPerNetto {
  id: string;
  numero_sal: number;
  stato: string;
  importo_totale: number;
}

const STATI_MATURATI = new Set(["emesso", "approvato", "firmato"]);
const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/** Somma dei SAL precedenti già emessi, approvati o firmati (le bozze non contano). */
export function maturatoPrecedente(sal: Pick<SalPerNetto, "id" | "numero_sal">, tutti: ReadonlyArray<SalPerNetto>): number {
  return arrotonda(
    tutti
      .filter((s) => s.id !== sal.id && s.numero_sal < sal.numero_sal && STATI_MATURATI.has(s.stato))
      .reduce((n, s) => n + (Number(s.importo_totale) || 0), 0),
  );
}

export function nettoSal(totale: number, precedente: number): { totale: number; precedente: number; daFatturare: number } {
  return { totale, precedente, daFatturare: arrotonda(totale - precedente) };
}
```

- [ ] **Step 3: lancia il test** — `npx vitest run src/test/logic/salNetto.test.ts` → PASS (8 casi: 4 × 2 copie).

- [ ] **Step 4: commit**

```bash
git add src/lib/orders/salNetto.ts supabase/functions/_shared/salNetto.ts src/test/logic/salNetto.test.ts
git commit -m "SAL: calcolo del «da fatturare» (totale meno SAL precedenti), con test di parità app/edge"
```

### Task 23: il netto nel verbale (elenco e nuovo verbale)

**Files:**
- Modify: `src/components/orders/SalTab.tsx` (scheda in elenco ~riga 465; riepilogo del dialog ~riga 283)
- Test: `src/test/ui/salTabNetto.test.tsx`

- [ ] **Step 1: scrivi il test che fallisce** (non c'è ancora un test di `SalTab`: si fa con un finto `supabase` che risponde alle letture)

```tsx
// src/test/ui/salTabNetto.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalTab } from "@/components/orders/SalTab";

const dati = vi.hoisted(() => ({ sal: [] as Array<Record<string, unknown>> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? dati.sal : [], error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato, importo_totale, note: null, installment_id: null,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 40000, percentuale_avanzamento: 40, importo_sal: importo_totale, note: null }],
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={100000} installments={[]} />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.sal = []; });
afterEach(cleanup);

describe("SAL: meno SAL precedenti", () => {
  it("il secondo SAL dice quanto era già nei precedenti e quanto fatturare ora", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Già maturato nei SAL precedenti:\s*10\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Da fatturare con questo SAL:\s*6\.000,00/)).toBeInTheDocument();
    // il primo SAL non ha precedenti: la riga compare una volta sola
    expect(screen.getAllByText(/Già maturato nei SAL precedenti/)).toHaveLength(1);
  });

  it("una bozza precedente non conta", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "bozza", 10000)];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.queryByText(/Già maturato nei SAL precedenti/)).not.toBeInTheDocument();
  });

  it("un netto negativo si chiama «Rettifica»", async () => {
    dati.sal = [sal(2, "emesso", 8000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Rettifica:\s*[-−]2\.000,00/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/test/ui/salTabNetto.test.tsx` — Expected: FAIL (le righe non ci sono). Se `SalTab` pretende altri moduli finti (un provider di conferma, la query delle rate), aggiungi il relativo `vi.mock`: l'errore dice quale.

- [ ] **Step 2: la scheda in elenco** — in `SalTab.tsx`, importa `maturatoPrecedente`, `nettoSal` da `@/lib/orders/salNetto`. Dentro `salList.map((sal) => (…))`, sotto la riga «Emesso il … · Totale: …» (~riga 465):

```tsx
                    {(() => {
                      const precedente = maturatoPrecedente(sal, salList);
                      if (precedente <= 0) return null;
                      const { daFatturare } = nettoSal(sal.importo_totale, precedente);
                      return (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Già maturato nei SAL precedenti: {formatCurrency(precedente)} ·{" "}
                          <span className={daFatturare < 0 ? "font-medium text-rose-600" : "font-medium text-foreground"}>
                            {daFatturare < 0 ? "Rettifica" : "Da fatturare con questo SAL"}: {formatCurrency(daFatturare)}
                          </span>
                        </p>
                      );
                    })()}
```

e nel `<tfoot>` della tabella delle voci (~riga 530), dopo la riga «Totale SAL», aggiungi due righe **solo se** `precedente > 0`:

```tsx
                        {maturatoPrecedente(sal, salList) > 0 && (
                          <>
                            <tr className="border-t text-muted-foreground">
                              <td className="p-2" colSpan={3}>Meno SAL precedenti</td>
                              <td className="p-2 text-right">− {formatCurrency(maturatoPrecedente(sal, salList))}</td>
                            </tr>
                            <tr className="bg-muted/30 font-semibold">
                              <td className="p-2" colSpan={3}>Da fatturare con questo SAL</td>
                              <td className="p-2 text-right">{formatCurrency(nettoSal(sal.importo_totale, maturatoPrecedente(sal, salList)).daFatturare)}</td>
                            </tr>
                          </>
                        )}
```

- [ ] **Step 3: il riepilogo del nuovo verbale** — accanto a `totalDialogImporto` (~riga 283) calcola il precedente del SAL che si sta per creare (numero = massimo + 1):

```tsx
  const numeroNuovo = salList.reduce((m, s) => Math.max(m, s.numero_sal), 0) + 1;
  const precedenteNuovo = maturatoPrecedente({ id: "nuovo", numero_sal: numeroNuovo }, salList);
```

e nel riepilogo del dialog, sotto il totale, se `precedenteNuovo > 0`: «Già maturato nei SAL precedenti» e «Da fatturare con questo SAL» (`nettoSal(totalDialogImporto, precedenteNuovo).daFatturare`), con lo stesso stile delle righe già lì.

- [ ] **Step 4: lancia il test del SAL** — `npx vitest run src/test/ui/salTabNetto.test.tsx` → PASS (3 casi). Poi `npx vitest run src/test/ui src/test/logic` per sicurezza: nessun test esistente nomina `SalTab`.

- [ ] **Step 5: commit**

```bash
git add src/components/orders/SalTab.tsx src/test/ui/salTabNetto.test.tsx
git commit -m "SAL: elenco e nuovo verbale mostrano quanto era già maturato e quanto fatturare ora"
```

### Task 24: il netto nel PDF del verbale

**Files:**
- Modify: `supabase/functions/generate-sal-pdf/index.ts` (`buildSalHtml` ~riga 69; riquadri riepilogo ~riga 155-170; piede tabella ~riga 183-190; lettura dei dati ~riga 280)
- Test: `src/test/logic/salPdfNetto.test.ts` (legge il sorgente: la funzione gira su Deno e non si importa in vitest)

- [ ] **Step 1: test sul sorgente (fallisce)**

```ts
// src/test/logic/salPdfNetto.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(), "supabase/functions/generate-sal-pdf/index.ts"), "utf8");

describe("PDF del SAL: «meno SAL precedenti»", () => {
  it("usa la stessa funzione dell'app, non una sua copia", () => {
    expect(src).toMatch(/import \{ maturatoPrecedente, nettoSal \} from "\.\.\/_shared\/salNetto\.ts";/);
  });
  it("legge i SAL della stessa commessa e porta il già maturato nel verbale", () => {
    expect(src).toMatch(/\.from\("sal_records"\)[\s\S]*?\.eq\("order_id", sal\.order_id\)[\s\S]*?\.eq\("company_id", company_id\)/);
    expect(src).toMatch(/Meno SAL precedenti/);
    expect(src).toMatch(/Da fatturare con questo SAL/);
  });
  it("il primo SAL non cambia: le righe nuove compaiono solo se c'è un precedente", () => {
    expect(src).toMatch(/precedente > 0/);
  });
});
```

- [ ] **Step 2: la funzione edge** — import in cima:

```ts
import { maturatoPrecedente, nettoSal } from "../_shared/salNetto.ts";
```

`buildSalHtml` riceve un parametro in più (`precedente: number`) prima di `signatureUrl`; subito dopo `percMedia`:

```ts
  const netto = nettoSal(totaleSal, precedente);
```

Nei riquadri di riepilogo (dopo quello «Totale SAL», ~riga 169), se `precedente > 0`:

```ts
    ${precedente > 0 ? `
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Da fatturare con questo SAL</div>
      <div style="font-size:13pt;font-weight:700;color:${netto.daFatturare < 0 ? "#dc2626" : "#0f172a"};">${fmtEur(netto.daFatturare)}</div>
    </div>` : ""}
```

Nel piede della tabella (dopo la riga «TOTALE», ~riga 190):

```ts
      ${precedente > 0 ? `
      <tr style="color:#475569;">
        <td style="padding:7px 10px;font-size:9pt;" colspan="3">Meno SAL precedenti</td>
        <td style="padding:7px 10px;text-align:right;font-size:9pt;">− ${fmtEur(precedente)}</td>
      </tr>
      <tr style="background:#f8fafc;font-weight:700;">
        <td style="padding:9px 10px;font-size:9.5pt;" colspan="3">Da fatturare con questo SAL</td>
        <td style="padding:9px 10px;text-align:right;font-size:9.5pt;color:${colore};">${fmtEur(netto.daFatturare)}</td>
      </tr>` : ""}
```

Dopo la lettura del SAL (`salErr`, ~riga 286), prima di leggere l'ordine:

```ts
    // I SAL della stessa commessa: serve il già maturato nei precedenti.
    const { data: tuttiISal } = await supabase
      .from("sal_records")
      .select("id, numero_sal, stato, importo_totale")
      .eq("order_id", sal.order_id)
      .eq("company_id", company_id);
    const precedente = maturatoPrecedente(sal, tuttiISal ?? []);
```

e la chiamata a `buildSalHtml(...)` passa `precedente` nella posizione nuova.

- [ ] **Step 3: lancia i test** — `npx vitest run src/test/logic/salPdfNetto.test.ts src/test/logic/salNetto.test.ts` → PASS.

- [ ] **Step 4: commit** — `git add supabase/functions/generate-sal-pdf/index.ts src/test/logic/salPdfNetto.test.ts && git commit -m "SAL: il PDF del verbale mostra «meno SAL precedenti» e «da fatturare»"`. La funzione edge si pubblica col push su `main` (job «Deploy edge functions»: basta aver toccato `index.ts`).

---

# Rischi, compatibilità e cose lasciate fuori

**Compatibilità con quello che c'è**
- Le fasi esistenti non hanno sottofasi: nessun valore cambia, nessuna schermata cambia se non per l'invito discreto «Dividi in sottofasi» nella fase aperta dell'ufficio.
- Un rapportino scritto **prima** che una fase avesse sottofasi, ma approvato dopo: la sua percentuale non si applica a quella fase (Task 16, step 6): la decidono le sottofasi.
- Le migrazioni sono additive e vanno **prima** del codice (che ha dei ripieghi: senza le tabelle le schermate si comportano come oggi). Il codice può stare su `main` solo dopo che `apply_migration` e il riallineo sono fatti.
- `trg_fase_campi_protetti` non cambia, e non cambiano le colonne di `order_work_phases`: si aggiornano solo da funzioni `SECURITY DEFINER`.

**Rischi**
| Rischio | Cosa lo ferma |
|---|---|
| Una fase chiusa si riapre da sola aggiungendo una sottofase | Scritto nelle regole (§3); la prova SQL lo verifica (KO 7); l'ufficio lo vede perché la fase torna «In corso». |
| Due persone spuntano insieme | `for update` sulla fase dentro `ricalcola_fase_da_sottofasi`; la percentuale si ricalcola sempre da tutta la tabella, mai incrementale. |
| Un operaio scrive fuori dalle sue colonne | `trg_sottofasi_guardia` (prova SQL KO 11-13) + `sottofasiCantiere.test.ts`. |
| Cambiare `recompute_order_progress` cambia i numeri di tutti | Con `uguale` (default) è identico: prova SQL del Task 20 (conto delle commesse con % diversa prima e dopo) e specchio TS con gli stessi casi. |
| «Scegli le fasi» si rompe per chi ha le tabelle non ancora create | `useModelliFasi` ricade sui soli modelli base; `applyTemplate` chiama una RPC: se non c'è, errore chiaro e il bottone «Aggiungi una singola fase» funziona come sempre. Perciò: **migrazione prima, codice dopo**. |
| I test che fingono `@tanstack/react-query` (`orderWorkPlanning`, `commessaTelefono`, forse altri) si rompono per i nuovi hook | Task 6, 11, 21: un `vi.mock` per hook nuovo; `npx vitest run src/test/ui src/test/logic` trova gli altri. |
| Il typecheck a cricchetto sale | Le tabelle nuove non sono nei tipi generati: cast localizzati `db = supabase as any` con commento; nessun `any` altrove. |

**Fuori da questo piano (decisioni o lavori a parte)**
- Avanzamento per **quantità** (mq posati / mq totali): servono unità di misura e quantità eseguite, oggi inesistenti nel database.
- **Dipendenze** tra fasi («l'impianto parte dopo la demolizione») e ritardi che si propagano.
- Approvazione ufficio **obbligatoria** sulle ore, fatturazione a SAL, SAL per subappaltatori, semaforo margine: restano domande aperte (§5).
- Applicare un modello **già in fase di creazione** della commessa (`CreateOrder`) e suggerire il modello giusto dal tipo di preventivo: possibile dopo, con la stessa RPC.
- Audit delle sottofasi in `user_action_log` (oggi lo ha `order_work_phases`): `fatta_il`/`fatta_da` bastano per ora.
- Riordino **trascinando** (dnd-kit) nell'editor dei modelli: ora frecce su/giù.

# Verifica finale (prima di dire «fatto»)

- [ ] `npx vitest run src/test/logic src/test/ui` — verde, salvo il fallimento già noto `tettiTemplateModules.test.tsx` (Tetti, non c'entra).
- [ ] Typecheck mirato sui file toccati (tsconfig ristretto nella radice, con `src/vite-env.d.ts` e `src/test/setup.ts`, e un errore voluto come prova): nessun errore nuovo.
- [ ] Migrazioni applicate e riallineate: `select version, name from supabase_migrations.schema_migrations where version in ('20281007130000','20281007140000','20281007150000');` → 3 righe; `select * from public.admin_backup_tabelle_scoperte();` → vuota; `20281007120000` (rapportini «ore proprie») applicata prima del push.
- [ ] A 375 px: la scheda di commessa, il dialog «Fasi di lavoro» e «Avanzamento lavori» sono densi come prima (nessuno spazio bianco in più); la pagina «Fasi e avanzamento» non compare nell'hub del telefono.
- [ ] A mano, a computer: apri una commessa vuota → «Scegli le fasi» → un modello tuo con sottofasi → «Aggiungi le N fasi» → le sottofasi ci sono; spunta in ufficio e dal telefono (capocantiere, poi approvazione): la percentuale della fase e della commessa seguono, lo stesso numero in intestazione, Cronoprogramma ed «Economia delle lavorazioni».
- [ ] Nessun file tracciato modificato fuori da quelli del piano; i due file dell'altra sessione (`faseCampiProtetti.test.ts`, `20281006150000_fasi_campi_protetti.sql`) **non** sono nei miei commit.
