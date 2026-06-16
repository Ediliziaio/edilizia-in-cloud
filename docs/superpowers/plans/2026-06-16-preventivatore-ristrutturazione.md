# Preventivatore Ristrutturazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuovo verticale "Ristrutturazione": computo metrico premium dai listini aziendali (prodotti + manodopera) + preventivo PDF brandizzato, integrato nella lista unificata preventivi e nel CRM, come Serramenti/Fotovoltaico.

**Architecture:** Replica il pattern dei verticali esistenti (`sr_*` / `fv_*`): tabelle `rst_*` + RLS company-scoped, registro modulo in `moduli-vendita`, wizard a step, editor computo premium client-side con ricalcolo live, generazione PDF client (`@react-pdf/renderer`), UNION in `v_preventivi_unificati`. Riusa `articoli` (prodotti) e `tariffe` (manodopera) come listini sorgente.

**Tech Stack:** React 18 + Vite + TypeScript, shadcn/ui, @tanstack/react-query, @react-pdf/renderer, Supabase (Postgres + RLS), vitest. Gate = eslint + vite build (+ vitest sulle parti pure). Riferimento spec: `docs/superpowers/specs/2026-06-16-preventivatore-ristrutturazione-design.md`.

**Vincoli:** SOLO locale (commit locali OK; NO git push / supabase deploy / migrazione remota finché l'utente non dice "pubblica"/"deploya"). Migrazioni idempotenti, forward-dated, applicate via MCP apply_migration solo in fase di pubblicazione. File migrazione locale `supabase/migrations/20271001000000_rst_modulo_wave1.sql` (forward-dated). Footer commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Pattern di riferimento da leggere (non reinventare):**
- Verticale serramenti: `src/pages/azienda/serramenti/SerramentiWizard.tsx`, `SerramentiWizard/helpers.ts`, `src/components/serramenti/StepPdf.tsx`, `src/hooks/useSerramentoPDF.ts`, `supabase/migrations/20260511180000_sr_modulo_wave1.sql`.
- Listini: `src/hooks/usePreventivoCosti.ts` (TariffaPro = manodopera), `articoli`/`article_families` (prodotti).
- Lista unificata: `src/lib/preventivi/statoUnificato.ts`, `supabase/migrations/20270915000000_v_preventivi_unificati.sql`, `src/components/marketing/preventivi/UnifiedPreventiviList.tsx`.
- Registro moduli: `src/lib/moduli-vendita/config.ts`, `useModuliVendita.ts`. Rotte: `src/routes/companyRoutes.tsx`.

---

## File Structure (decomposizione)

```
supabase/migrations/20271001000000_rst_modulo_wave1.sql   # tutte le tabelle rst_* + RLS + indici
supabase/migrations/20271001010000_v_preventivi_unificati_rst.sql  # ricrea la vista con UNION rst
src/types/ristrutturazione.ts                              # tipi dominio (Progetto, ComputoVoce, Listino…)
src/lib/ristrutturazione/calcoli.ts                        # totali computo (puro, testato)
src/lib/ristrutturazione/seedListino.ts                    # set standard capitoli/voci (puro, testato)
src/lib/ristrutturazione/index.ts                          # re-export
src/hooks/useListinoLavorazioni.ts                         # CRUD listino capitoli/voci
src/hooks/useRistrutturazioneProgetto.ts                   # CRUD progetto + computo
src/hooks/useRistrutturazionePDF.ts                        # generazione PDF client
src/components/ristrutturazione/ListinoLavorazioniEditor.tsx
src/components/ristrutturazione/RistrutturazioneTemplateEditor.tsx
src/components/ristrutturazione/ComputoEditor/ComputoEditor.tsx
src/components/ristrutturazione/ComputoEditor/CapitoloSection.tsx
src/components/ristrutturazione/ComputoEditor/VoceRow.tsx
src/components/ristrutturazione/ComputoEditor/AddVocePicker.tsx
src/components/ristrutturazione/RistrutturazionePDF.tsx    # documento @react-pdf
src/pages/azienda/ristrutturazione/RistrutturazioneIndex.tsx
src/pages/azienda/ristrutturazione/RistrutturazioneWizard.tsx
src/pages/azienda/ristrutturazione/RistrutturazioneWizard/{StepCliente,StepImmobile,StepComputo,StepMedia,StepEconomia,StepPdf,helpers}.tsx
src/test/logic/{ristrutturazioneCalcoli,ristrutturazioneSeed,ristrutturazioneStato}.test.ts
```

Modifiche a file esistenti: `src/lib/moduli-vendita/config.ts` (registro), `src/routes/companyRoutes.tsx` (rotte), `src/lib/preventivi/statoUnificato.ts` (mapper), `src/pages/azienda/settings/SettingsQuoteTemplates/ModuliVenditaPanel.tsx` (tab template).

---

## FASE 0 — Fondamenta (DB + tipi + logica pura, TDD)

### Task 1: Migration tabelle `rst_*`

**Files:** Create `supabase/migrations/20271001000000_rst_modulo_wave1.sql`

- [ ] **Step 1: Scrivi la migration** (idempotente, RLS come `sr_*`). Contenuto completo:

```sql
-- Ristrutturazione · Wave 1 — tabelle verticale (pattern sr_*)
-- ADDITIVA/IDEMPOTENTE. RLS company-scoped (has_role super_admin OR company match).

-- Listino lavorazioni aziendale ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_listino_capitoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rst_listino_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_id uuid REFERENCES public.rst_listino_capitoli(id) ON DELETE SET NULL,
  codice text,
  descrizione text NOT NULL,
  unita_misura text NOT NULL DEFAULT 'cad',
  costo_materiali numeric NOT NULL DEFAULT 0,
  costo_manodopera numeric NOT NULL DEFAULT 0,
  ricarico_pct numeric NOT NULL DEFAULT 0,
  prezzo_unitario numeric NOT NULL DEFAULT 0,
  articolo_id uuid,
  tariffa_id uuid,
  note text,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Progetto (hub) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_progetti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text,
  stato text NOT NULL DEFAULT 'bozza',
  tipo_intervento text,
  cliente_nome text, cliente_cognome text, cliente_email text, cliente_telefono text,
  cantiere_indirizzo text, cantiere_citta text, cantiere_provincia text, cantiere_cap text,
  immobile_tipo text, immobile_superficie_mq numeric, immobile_anno int, immobile_piani int,
  opportunita_id uuid, cliente_id uuid,
  template_id uuid,
  sconto_pct numeric NOT NULL DEFAULT 0,
  iva_pct numeric NOT NULL DEFAULT 22,
  detrazione_pct numeric NOT NULL DEFAULT 0,
  totale_imponibile numeric NOT NULL DEFAULT 0,
  totale numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rst_progetti
  ADD CONSTRAINT rst_progetti_stato_chk CHECK (
    stato IN ('bozza','da_consegnare','consegnato','in_valutazione','accettato','rifiutato','scaduto','archiviato')
  ) NOT VALID;

-- Computo del singolo preventivo (snapshot) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_computo_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.rst_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_nome text NOT NULL DEFAULT 'Generale',
  descrizione text NOT NULL,
  unita_misura text NOT NULL DEFAULT 'cad',
  quantita numeric NOT NULL DEFAULT 0,
  prezzo_unitario numeric NOT NULL DEFAULT 0,
  costo_materiali numeric NOT NULL DEFAULT 0,
  costo_manodopera numeric NOT NULL DEFAULT 0,
  sconto_pct numeric NOT NULL DEFAULT 0,
  importo numeric NOT NULL DEFAULT 0,
  margine_eur numeric NOT NULL DEFAULT 0,
  margine_pct numeric NOT NULL DEFAULT 0,
  listino_voce_id uuid,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Media ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_progetti_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.rst_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'situazione',
  url text NOT NULL,
  caption text,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Template PDF (un record per azienda) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_template_pdf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_url text,
  color_primary text DEFAULT '#1E3A5F', color_secondary text DEFAULT '#F97316',
  color_accent text DEFAULT '#16A34A', color_text text DEFAULT '#212529',
  chi_siamo text, chi_siamo_foto_url text,
  esigenze jsonb DEFAULT '[]'::jsonb, soluzione jsonb DEFAULT '[]'::jsonb,
  usp jsonb DEFAULT '[]'::jsonb, testimonianze jsonb DEFAULT '[]'::jsonb,
  cronoprogramma jsonb DEFAULT '[]'::jsonb,
  consulente_default jsonb,
  cover_title text, cover_subtitle text, cover_image_url text,
  payment_terms_text text, validity_text text, footer_text text,
  show_chi_siamo boolean DEFAULT true, show_cronoprogramma boolean DEFAULT true,
  show_margine boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_rst_progetti_company ON public.rst_progetti(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rst_computo_progetto ON public.rst_computo_voci(progetto_id, ordine);
CREATE INDEX IF NOT EXISTS idx_rst_listino_voci_company ON public.rst_listino_voci(company_id, capitolo_id, ordine);
CREATE INDEX IF NOT EXISTS idx_rst_media_progetto ON public.rst_progetti_media(progetto_id, ordine);

-- RLS (pattern sr_*: super_admin OR company_id = get_user_company_id) su tutte le tabelle
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rst_listino_capitoli','rst_listino_voci','rst_progetti','rst_computo_voci','rst_progetti_media','rst_template_pdf'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($q$DROP POLICY IF EXISTS "rst super admin all" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "rst super admin all" ON public.%I FOR ALL
      USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role))$q$, t);
    EXECUTE format($q$DROP POLICY IF EXISTS "rst company members" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "rst company members" ON public.%I FOR ALL TO authenticated
      USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()))$q$, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Verifica sintassi locale** — leggi `supabase/migrations/20260511180000_sr_modulo_wave1.sql` e conferma che gli helper RLS (`has_role`, `get_user_company_id`, enum `app_role`) sono usati allo stesso modo. Adatta i nomi se differiscono. NON applicare al remoto (solo file locale).
- [ ] **Step 3: Commit** — `git add supabase/migrations/20271001000000_rst_modulo_wave1.sql && git commit -m "feat(rst): migration tabelle verticale ristrutturazione (locale)"`

> Nota: in fase di pubblicazione la migrazione si applica via MCP `apply_migration` (NON `db push`). I `CHECK ... NOT VALID` evitano riscritture.

---

### Task 2: Tipi dominio

**Files:** Create `src/types/ristrutturazione.ts`

- [ ] **Step 1: Scrivi i tipi** (allineati ESATTAMENTE alle colonne del Task 1):

```ts
export type RstUnitaMisura = "mq" | "ml" | "cad" | "corpo" | "kg" | "h" | "a corpo";
export type RstStato = "bozza" | "da_consegnare" | "consegnato" | "in_valutazione" | "accettato" | "rifiutato" | "scaduto" | "archiviato";

export interface RstListinoCapitolo { id: string; company_id: string; nome: string; ordine: number; }
export interface RstListinoVoce {
  id: string; company_id: string; capitolo_id: string | null; codice: string | null;
  descrizione: string; unita_misura: RstUnitaMisura;
  costo_materiali: number; costo_manodopera: number; ricarico_pct: number; prezzo_unitario: number;
  articolo_id: string | null; tariffa_id: string | null; note: string | null; ordine: number;
}
export interface RstComputoVoce {
  id: string; progetto_id: string; company_id: string; capitolo_nome: string;
  descrizione: string; unita_misura: RstUnitaMisura; quantita: number;
  prezzo_unitario: number; costo_materiali: number; costo_manodopera: number;
  sconto_pct: number; importo: number; margine_eur: number; margine_pct: number;
  listino_voce_id: string | null; ordine: number;
}
export interface RstProgetto {
  id: string; company_id: string; code: string | null; stato: RstStato; tipo_intervento: string | null;
  cliente_nome: string | null; cliente_cognome: string | null; cliente_email: string | null; cliente_telefono: string | null;
  cantiere_indirizzo: string | null; cantiere_citta: string | null; cantiere_provincia: string | null; cantiere_cap: string | null;
  immobile_tipo: string | null; immobile_superficie_mq: number | null; immobile_anno: number | null; immobile_piani: number | null;
  opportunita_id: string | null; cliente_id: string | null; template_id: string | null;
  sconto_pct: number; iva_pct: number; detrazione_pct: number;
  totale_imponibile: number; totale: number; note: string | null;
}
export interface RstProgettoMedia { id: string; progetto_id: string; company_id: string; tipo: string; url: string; caption: string | null; ordine: number; }
```

- [ ] **Step 2: Commit** — `git add src/types/ristrutturazione.ts && git commit -m "feat(rst): tipi dominio"`

---

### Task 3: Calcoli puri (TDD)

**Files:** Create `src/lib/ristrutturazione/calcoli.ts`; Test `src/test/logic/ristrutturazioneCalcoli.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from "vitest";
import { calcRigaImporto, calcTotaliComputo, calcPrezzoVoce } from "@/lib/ristrutturazione/calcoli";

describe("calcoli ristrutturazione", () => {
  it("importo riga = qty*prezzo*(1-sconto), mai NaN", () => {
    expect(calcRigaImporto({ quantita: 10, prezzo_unitario: 25, sconto_pct: 10 })).toBe(225);
    expect(calcRigaImporto({ quantita: NaN, prezzo_unitario: 25, sconto_pct: 0 })).toBe(0);
  });
  it("prezzo voce = (mat+mano)*(1+ricarico)", () => {
    expect(calcPrezzoVoce({ costo_materiali: 40, costo_manodopera: 60, ricarico_pct: 20 })).toBe(120);
  });
  it("totali computo aggregano imponibile, iva, totale, margine per-capitolo", () => {
    const r = calcTotaliComputo(
      [
        { capitolo_nome: "Demolizioni", quantita: 10, prezzo_unitario: 25, sconto_pct: 0, costo_materiali: 5, costo_manodopera: 15 },
        { capitolo_nome: "Demolizioni", quantita: 2, prezzo_unitario: 100, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 50 },
        { capitolo_nome: "Murature", quantita: 5, prezzo_unitario: 40, sconto_pct: 50, costo_materiali: 10, costo_manodopera: 10 },
      ],
      { sconto_pct: 0, iva_pct: 22 },
    );
    expect(r.imponibile).toBe(550); // 250 + 200 + 100
    expect(r.iva).toBe(121);
    expect(r.totale).toBe(671);
    expect(r.perCapitolo.find((c) => c.nome === "Demolizioni")!.imponibile).toBe(450);
    expect(r.margineEur).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/test/logic/ristrutturazioneCalcoli.test.ts` → fallisce (funzioni non definite).
- [ ] **Step 3: Implementa** `src/lib/ristrutturazione/calcoli.ts`:

```ts
const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

export function calcRigaImporto(r: { quantita: number; prezzo_unitario: number; sconto_pct: number }): number {
  return Math.max(0, n(r.quantita)) * Math.max(0, n(r.prezzo_unitario)) * (1 - Math.min(100, Math.max(0, n(r.sconto_pct))) / 100);
}
export function calcPrezzoVoce(v: { costo_materiali: number; costo_manodopera: number; ricarico_pct: number }): number {
  return (Math.max(0, n(v.costo_materiali)) + Math.max(0, n(v.costo_manodopera))) * (1 + Math.max(0, n(v.ricarico_pct)) / 100);
}
export interface ComputoRigaInput {
  capitolo_nome: string; quantita: number; prezzo_unitario: number; sconto_pct: number;
  costo_materiali: number; costo_manodopera: number;
}
export function calcTotaliComputo(righe: ComputoRigaInput[], opts: { sconto_pct: number; iva_pct: number }) {
  const byCap = new Map<string, { nome: string; imponibile: number; costo: number; voci: number }>();
  let imponibile = 0, costoTot = 0;
  for (const r of righe) {
    const imp = calcRigaImporto(r);
    const costoRiga = (Math.max(0, n(r.costo_materiali)) + Math.max(0, n(r.costo_manodopera))) * Math.max(0, n(r.quantita));
    imponibile += imp; costoTot += costoRiga;
    const k = r.capitolo_nome || "Generale";
    const cur = byCap.get(k) ?? { nome: k, imponibile: 0, costo: 0, voci: 0 };
    cur.imponibile += imp; cur.costo += costoRiga; cur.voci += 1; byCap.set(k, cur);
  }
  const scontoGlobale = Math.min(100, Math.max(0, n(opts.sconto_pct))) / 100;
  imponibile = imponibile * (1 - scontoGlobale);
  const iva = imponibile * Math.max(0, n(opts.iva_pct)) / 100;
  const totale = imponibile + iva;
  const margineEur = imponibile - costoTot;
  const marginePct = imponibile > 0 ? (margineEur / imponibile) * 100 : 0;
  return { imponibile, iva, totale, costoTot, margineEur, marginePct, perCapitolo: [...byCap.values()] };
}
```

- [ ] **Step 4: Run → PASS**. **Step 5: Commit** — `git commit -m "feat(rst): calcoli computo (TDD)"`

---

### Task 4: Seed listino standard (TDD)

**Files:** Create `src/lib/ristrutturazione/seedListino.ts`; Test `src/test/logic/ristrutturazioneSeed.test.ts`

- [ ] **Step 1: Test** — verifica che `SEED_LISTINO` abbia ≥8 capitoli, ogni voce abbia `unita_misura` valida e `descrizione` non vuota, e che `buildSeedRows(companyId)` produca righe pronte per insert con `company_id` impostato.

```ts
import { describe, it, expect } from "vitest";
import { SEED_LISTINO, buildSeedRows } from "@/lib/ristrutturazione/seedListino";
describe("seed listino", () => {
  it("ha capitoli edili standard con voci valide", () => {
    expect(SEED_LISTINO.length).toBeGreaterThanOrEqual(8);
    for (const cap of SEED_LISTINO) { expect(cap.nome).toBeTruthy(); expect(cap.voci.length).toBeGreaterThan(0);
      for (const v of cap.voci) { expect(v.descrizione).toBeTruthy(); expect(["mq","ml","cad","corpo","kg","h","a corpo"]).toContain(v.unita_misura); } }
  });
  it("buildSeedRows imposta company_id", () => {
    const { capitoli, voci } = buildSeedRows("c-1");
    expect(capitoli.every((c) => c.company_id === "c-1")).toBe(true);
    expect(voci.every((v) => v.company_id === "c-1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implementa** `seedListino.ts` con ~10 capitoli (Demolizioni, Opere murarie, Intonaci, Massetti e sottofondi, Pavimenti e rivestimenti, Impianto elettrico, Impianto idro-sanitario, Serramenti interni, Tinteggiature, Opere esterne) e 3-6 voci tipiche per capitolo (descrizione + unita_misura + costo_materiali/manodopera indicativi + ricarico 0 + prezzo_unitario = calcPrezzoVoce). Esporta `buildSeedRows(companyId)` che mappa a righe insertabili (genera `ordine` progressivo). **Step 4: Run → PASS. Step 5: Commit.**

---

### Task 5: Mapper stato unificato (TDD)

**Files:** Modify `src/lib/preventivi/statoUnificato.ts`; Test `src/test/logic/ristrutturazioneStato.test.ts`

- [ ] **Step 1: Test** — `mapRistrutturazioneStato("accettato") === "vinto"`, `"rifiutato"/"scaduto" === "perso"`, `"da_consegnare"/"consegnato"/"in_valutazione" === "in_corso"`, `"bozza" === "bozza"`, default `"altro"`. (Allinea ai valori `UnifiedStato` già definiti nel file.)
- [ ] **Step 2: Run → FAIL. Step 3: Implementa** `export function mapRistrutturazioneStato(...)` accanto a `mapSerramentiStato`, stessa firma. **Step 4: PASS. Step 5: Commit.**

---

## FASE 1 — Listino lavorazioni (gestione)

### Task 6: Hook `useListinoLavorazioni`

**Files:** Create `src/hooks/useListinoLavorazioni.ts`

- [ ] **Step 1:** Implementa (pattern react-query come gli hook esistenti, `useEffectiveCompanyId`):
  - `useListinoCapitoli()` → query `rst_listino_capitoli` ordinato per `ordine`.
  - `useListinoVoci(capitoloId?)` → query `rst_listino_voci` (filtrabile per capitolo).
  - mutations: `useUpsertCapitolo`, `useUpsertVoce`, `useDeleteVoce`, `useDeleteCapitolo`, `useImportSeedListino` (chiama `buildSeedRows` + insert bulk; invalida le query).
  - Prefill costi: helper `usePrefillFromArticolo(articoloId)` e `usePrefillFromTariffa(tariffaId)` che leggono il prezzo dal listino esistente (`articoli` / `tariffe`) e ritornano il costo da mettere in `costo_materiali`/`costo_manodopera`.
- [ ] **Step 2: Verifica** eslint + build sul file. **Step 3: Commit.**

### Task 7: `ListinoLavorazioniEditor` (UI)

**Files:** Create `src/components/ristrutturazione/ListinoLavorazioniEditor.tsx`

- [ ] **Step 1:** UI shadcn premium per gestire il listino: lista capitoli (accordion) → voci (tabella editabile con codice, descrizione, UdM, costo materiali, costo manodopera, ricarico%, prezzo). Bottoni: "Aggiungi capitolo", "Aggiungi voce", picker "Da listino prodotti" (apre dialog ricerca `articoli` → prefill costo_materiali) e "Da listino manodopera" (ricerca `tariffe` → prefill costo_manodopera). Bottone "Importa set standard" (chiama `useImportSeedListino`, con conferma). Empty-state guidato. `prezzo_unitario` ricalcolato live da `calcPrezzoVoce`. Acceptance: si crea/edita/cancella capitoli e voci, il prezzo si aggiorna, l'import seed popola il listino.
- [ ] **Step 2:** Verifica eslint + build. **Step 3: Commit.**

---

## FASE 2 — Progetto, registro, rotte, lista, wizard shell

### Task 8: Hook `useRistrutturazioneProgetto`

**Files:** Create `src/hooks/useRistrutturazioneProgetto.ts`

- [ ] **Step 1:** react-query: `useRistrutturazioneProgetti()` (lista), `useRistrutturazioneProgetto(id)` (singolo + media + computo voci), mutations `useUpsertProgetto`, `useDeleteProgetto`, `useSaveComputo(progettoId)` (replace bulk delle `rst_computo_voci` con ricalcolo importi via `calcRigaImporto` prima dell'insert), `useUpsertMedia`. Calcolo e persistenza di `totale_imponibile`/`totale` su `rst_progetti` al salvataggio del computo (usa `calcTotaliComputo`). **Step 2: eslint+build. Step 3: Commit.**

### Task 9: Registro modulo + rotte + nav + feature flag

**Files:** Modify `src/lib/moduli-vendita/config.ts`, `src/routes/companyRoutes.tsx`

- [ ] **Step 1:** Aggiungi a `MODULI_VENDITA` la voce `ristrutturazione` (slug, nome "Ristrutturazione", tagline "Computo metrico + preventivo ristrutturazioni", icona `Hammer` lucide, flag `modulo_ristrutturazione_attivo`, href `/azienda/ristrutturazione`, `available: true`, benefici, prezzoMensile coerente). Leggi una voce esistente (serramenti) e replica i campi ESATTI richiesti dal tipo del registro.
- [ ] **Step 2:** Aggiungi le 3 rotte in `companyRoutes.tsx` (lazy import) sotto lo stesso guard delle altre (`withCompanyPermission("canViewMarketingOpportunities")`; gating modulo via `useModuliVendita`/FeatureRoute se serramenti lo fa — replica il pattern serramenti).
- [ ] **Step 3:** Verifica build. **Step 4: Commit.**

### Task 10: `RistrutturazioneIndex` (lista)

**Files:** Create `src/pages/azienda/ristrutturazione/RistrutturazioneIndex.tsx`

- [ ] **Step 1:** Tabella progetti (code, cliente, stato badge, totale, data) + bottone "Nuovo" → wizard; riga → wizard `:id/modifica`. Riusa pattern `SerramentiIndex`. Empty-state. **Step 2: eslint+build. Step 3: Commit.**

### Task 11: `RistrutturazioneWizard` shell + helpers

**Files:** Create `RistrutturazioneWizard.tsx` + `RistrutturazioneWizard/helpers.ts`

- [ ] **Step 1:** Shell a step (stepper, navigazione avanti/indietro, salvataggio progetto, autosave bozza) modellata su `SerramentiWizard.tsx`. `helpers.ts`: funzione `stepCompletion(progetto, computo)` → quali step sono completi (cliente, immobile, computo non vuoto, economia, pdf). **Step 2: eslint+build. Step 3: Commit.**

### Task 12: StepCliente + StepImmobile

**Files:** Create `RistrutturazioneWizard/StepCliente.tsx`, `StepImmobile.tsx`

- [ ] **Step 1:** StepCliente: form anagrafica (nome, cognome, email, telefono) + picker contatto/opportunità CRM (riusa il pattern del picker contatto già in `RoiSimulatorPage`/serramenti). StepImmobile: indirizzo cantiere, tipo immobile, superficie mq, tipo intervento (select), vincoli. Controllati, salvano sul progetto. **Step 2: eslint+build. Step 3: Commit.**

---

## FASE 3 — ★ Computo Editor (il cuore: bello, gradevole, potente)

### Task 13: `AddVocePicker`

**Files:** Create `src/components/ristrutturazione/ComputoEditor/AddVocePicker.tsx`

- [ ] **Step 1:** Command-palette (shadcn `Command`) che cerca in 3 sorgenti con tab/sezioni: **Lavorazioni** (`rst_listino_voci`), **Prodotti** (`articoli`), **Manodopera** (`tariffe`). Selezione → `onPick(voce)` che ritorna `{ descrizione, unita_misura, prezzo_unitario, costo_materiali, costo_manodopera, capitolo_nome, listino_voce_id }`. Più "Aggiungi voce libera". Typeahead reattivo, keyboard-first. **Step 2: eslint+build. Step 3: Commit.**

### Task 14: `VoceRow`

**Files:** Create `src/components/ristrutturazione/ComputoEditor/VoceRow.tsx`

- [ ] **Step 1:** Riga voce premium: descrizione (editabile), UdM (select compatto), quantità (input numerico tabular-nums), prezzo unitario, sconto% (popover), **importo live** (da `calcRigaImporto`), breakdown materiali+manodopera (piccolo, espandibile) e **margine €/%** (badge, nascondibile). Azioni: duplica, elimina, drag-handle. Props: `voce`, `onChange`, `onDelete`, `onDuplicate`, `showMargine`. Nessun setState-in-effect. **Step 2: eslint+build. Step 3: Commit.**

### Task 15: `CapitoloSection`

**Files:** Create `src/components/ristrutturazione/ComputoEditor/CapitoloSection.tsx`

- [ ] **Step 1:** Sezione capitolo collassabile (Collapsible) con titolo editabile, **subtotale capitolo live**, conteggio voci, lista `VoceRow` con riordino drag (usa una lib drag già presente nel repo se c'è — altrimenti up/down buttons), bottone "+ Aggiungi voce" (apre `AddVocePicker` pre-assegnando il capitolo). Props: `capitolo {nome, voci}`, `onChange`, `onRename`, `onDeleteCapitolo`, `showMargine`. **Step 2: eslint+build. Step 3: Commit.**

### Task 16: `ComputoEditor`

**Files:** Create `src/components/ristrutturazione/ComputoEditor/ComputoEditor.tsx`

- [ ] **Step 1:** Assembla: lista `CapitoloSection` (raggruppa le `RstComputoVoce[]` per `capitolo_nome`), bottone "+ Capitolo", `AddVocePicker` globale (aggiunge nel capitolo scelto o "Generale"), **pannello riepilogo sticky** (imponibile, IVA, totale, margine complessivo, n° voci — da `calcTotaliComputo`), toggle "mostra margini". Stato computo controllato (`value: RstComputoVoce[]`, `onChange`), ricalcolo live via `useMemo`. Empty-state guidato ("Aggiungi il primo capitolo o pesca dal listino"). Responsive (mobile card / desktop tabella). Premium shadcn. **Step 2: eslint+build + verifica live nel preview (apri il wizard, aggiungi capitoli/voci, controlla ricalcolo). Step 3: Commit.**

### Task 17: `StepComputo`

**Files:** Create `RistrutturazioneWizard/StepComputo.tsx`

- [ ] **Step 1:** Integra `ComputoEditor` nel wizard: carica le voci del progetto, salva (debounced) via `useSaveComputo`. Mostra un hint se il listino è vuoto (link a Impostazioni → Listino). **Step 2: eslint+build. Step 3: Commit.**

---

## FASE 4 — Media + Economia

### Task 18: `StepMedia`

**Files:** Create `RistrutturazioneWizard/StepMedia.tsx`

- [ ] **Step 1:** Upload foto/render su Storage (riusa il pattern di upload media serramenti — bucket dedicato `rst-progetti` o quello esistente), griglia con caption + tipo + riordino + elimina. **Step 2: eslint+build. Step 3: Commit.**

### Task 19: `StepEconomia`

**Files:** Create `RistrutturazioneWizard/StepEconomia.tsx`

- [ ] **Step 1:** Riepilogo totali per capitolo + complessivo (da `calcTotaliComputo`), input sconto globale %, IVA %, campo detrazione/bonus % opzionale (mostra importo detraibile indicativo), margine complessivo. Salva su progetto. Numeri it-IT EUR (riusa `formatCurrency`). **Step 2: eslint+build. Step 3: Commit.**

---

## FASE 5 — PDF brandizzato

### Task 20: `RistrutturazioneTemplateEditor` + tab Impostazioni

**Files:** Create `src/components/ristrutturazione/RistrutturazioneTemplateEditor.tsx`; Modify `SettingsQuoteTemplates/ModuliVenditaPanel.tsx`

- [ ] **Step 1:** Editor del `rst_template_pdf` (un record/azienda, upsert): branding (logo, colori), copertina (titolo/sottotitolo/immagine), chi siamo + foto, esigenze/soluzione/USP (liste editabili), testimonianze, cronoprogramma (fasi), condizioni/pagamenti/validità, toggle visibilità, toggle "mostra margini nel PDF". Modellato su `SerramentiTemplateEditor`. Aggiungi la voce `ristrutturazione` (available: true) all'array `MODULI_VENDITA` di `ModuliVenditaPanel.tsx` con `render: () => <RistrutturazioneTemplateEditor embedded />`. **Step 2: eslint+build. Step 3: Commit.**

### Task 21: Documento PDF + hook generazione

**Files:** Create `src/components/ristrutturazione/RistrutturazionePDF.tsx`, `src/hooks/useRistrutturazionePDF.ts`

- [ ] **Step 1:** `RistrutturazionePDF` = documento `@react-pdf/renderer` (come `SerramentoPDF`): copertina brandizzata → presentazione impresa (chi siamo, USP, testimonianze) → **computo per capitoli** (tabella: descrizione, UdM, qty, prezzo, importo; subtotale capitolo; totale/sconto/IVA/totale) → foto/render → cronoprogramma → condizioni → contatti. Colori dal template. Footer legale Domus Group; nessun claim server UE.
- [ ] **Step 2:** `useRistrutturazionePDF` = `downloadPDF`/`previewPDF` con dynamic import di `@react-pdf/renderer` + `RistrutturazionePDF` (pattern ESATTO di `useSerramentoPDF`: enrich dati → blob → anchor download / window.open, try/catch + toast). **Step 3: eslint+build. Step 4: Commit.**

### Task 22: `StepPdf`

**Files:** Create `RistrutturazioneWizard/StepPdf.tsx`

- [ ] **Step 1:** Checklist completezza + bottoni "Anteprima PDF" / "Scarica PDF" (chiamano l'hook), stato `isGenerating`. Disabilita solo se il computo è vuoto (con avviso chiaro), NON silenziosamente. **Step 2: eslint+build + verifica live: genera il PDF e ispezionalo. Step 3: Commit.**

---

## FASE 6 — Integrazione lista unificata

### Task 23: UNION in `v_preventivi_unificati`

**Files:** Create `supabase/migrations/20271001010000_v_preventivi_unificati_rst.sql`; Modify `UnifiedPreventiviList.tsx` (se serve label tipo)

- [ ] **Step 1:** Leggi `20270915000000_v_preventivi_unificati.sql`, ricrea la vista (`CREATE OR REPLACE VIEW`) aggiungendo una `UNION ALL` con `rst_progetti` (mappando alle stesse colonne: tipo='ristrutturazione', stato unificato via la stessa logica del DB, cliente, totale, data, opportunita_id). Mantieni i tre flussi esistenti invariati. File locale, applicare via MCP in pubblicazione.
- [ ] **Step 2:** In `UnifiedPreventiviList.tsx` assicura che il tipo "ristrutturazione" abbia label/badge/azione "apri" verso `/azienda/ristrutturazione/:id/modifica`. **Step 3: eslint+build. Step 4: Commit.**

### Task 24: Verifica finale MVP

- [ ] **Step 1:** `npx vitest run src/test/logic/ristrutturazione*` → verde. `npx eslint` sui file nuovi → 0. `npx vite build` → exit 0.
- [ ] **Step 2:** Verifica live nel dev server (impersonando un'azienda demo): crea un progetto ristrutturazione, importa il seed listino, componi un computo (capitoli/voci), economia, genera il PDF, controlla che compaia nella lista unificata. Annota cosa visto.
- [ ] **Step 3:** Commit finale + report. NON applicare migrazioni remote né deploy né push (attendere "pubblica"/"deploya").

---

## Self-Review (writing-plans)

- **Copertura spec:** listino (Task 6-7) ✓ · computo premium (Task 13-17) ✓ · wizard (Task 11-12,17-19,22) ✓ · PDF brandizzato (Task 20-21-22) ✓ · lista unificata (Task 5,23) ✓ · CRM (Task 8,12) ✓ · modulo/rotte/nav (Task 9) ✓ · calcoli/seed (Task 3-4) ✓. Fase 2 esclusa per design.
- **Placeholder:** logica/SQL/tipi/test = codice completo; UI grandi = spec strutturate con interfacce, props, acceptance e file di riferimento serramenti (livello corretto per la scala; nessun "TBD").
- **Coerenza tipi:** `RstComputoVoce`/`RstProgetto`/`RstListinoVoce` (Task 2) usati identici in calcoli (Task 3), hook (Task 6,8), editor (Task 13-17). `calcRigaImporto`/`calcTotaliComputo`/`calcPrezzoVoce` firme stabili.
