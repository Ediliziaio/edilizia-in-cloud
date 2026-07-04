# HR Ruolo, Task e KPI per persona — Implementation Plan (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla scheda persona un tab "Ruolo & Obiettivi" con mansionario (da catalogo riutilizzabile), task assegnati e KPI (manuali + 3 auto-calcolati).

**Architecture:** 4 nuove tabelle `hr_*` company-scoped + 2 colonne su `hr_profili` + 1 RPC per gli auto-KPI. Frontend: 3 blocchi isolati (`HrMansioneBlock`, `HrTaskBlock`, `HrKpiBlock`) montati in un nuovo tab di `HrProfiloSheet`, ognuno con i propri hook (pattern identico a `HrDocumentiSection`/`HrAssenzeSection` che prendono `profiloId + companyId`). Catalogo mansioni gestito da un dialog raggiungibile dal blocco mansione (niente nuovo routing in Fase 1).

**Tech Stack:** React 18 + TS + Vite, TanStack Query, Supabase (Postgres + RLS), shadcn/ui, sonner, recharts (già in uso), vitest. Migrazioni via MCP `apply_migration` sul progetto `rsbrguhkodgnqfomrevo`. Verifica: `npx tsc --noEmit`, `bun run build`, preview E2E su Demo Azienda (`778a2c76-1253-49f2-a5e8-283363ac3e29`).

**Policy:** commit locali sì; `git push` su main SOLO con ok esplicito. Migrazioni additive (basso rischio).

---

## File structure

| File | Responsabilità |
|---|---|
| migration `hr_ruolo_task_kpi` | tabelle `hr_mansioni`, `hr_task`, `hr_kpi`, `hr_kpi_valori` + colonne `hr_profili.mansione_id/responsabilita` + RLS + indici |
| migration `hr_seed_mansioni_demo` | seed ~10 mansioni edili per Demo Azienda |
| RPC `hr_persona_kpi_auto` | calcolo 3 KPI auto da timbrature/giornate/task |
| `src/types/hr.ts` (modifica) | tipi `HrMansione`, `HrTask`, `HrKpi`, `HrKpiValore` + estensione `HrProfilo` |
| `src/hooks/useHrMansioni.ts` (nuovo) | query+mutation catalogo mansioni |
| `src/hooks/useHrTask.ts` (nuovo) | query+mutation task per profilo |
| `src/hooks/useHrKpi.ts` (nuovo) | query+mutation KPI per profilo + fetch auto-KPI |
| `src/components/hr/HrMansioneBlock.tsx` (nuovo) | select mansione + responsabilità ereditate/extra + "Applica KPI del ruolo" + link catalogo |
| `src/components/hr/HrTaskBlock.tsx` (nuovo) | lista/CRUD task inline |
| `src/components/hr/HrKpiBlock.tsx` (nuovo) | card KPI valore-vs-target + trend + update valore |
| `src/components/hr/HrMansioniCatalogDialog.tsx` (nuovo) | CRUD catalogo mansioni |
| `src/components/hr/HrRuoloObiettiviTab.tsx` (nuovo) | contenitore dei 3 blocchi |
| `src/components/hr/HrProfiloSheet.tsx` (modifica) | aggiunge il tab "Ruolo & Obiettivi" |
| `src/test/logic/hrRuoloTaskKpi.test.ts` (nuovo) | contract test source+migration (stile esistente) |

---

## Task 1: Migration — tabelle + colonne + RLS

**Files:** MCP `apply_migration` name `hr_ruolo_task_kpi` + salva copia in `supabase/migrations/<ts>_hr_ruolo_task_kpi.sql`

- [ ] **Step 1: Applica la migration** (SQL completo)

```sql
-- hr_mansioni: catalogo ruoli riutilizzabili
CREATE TABLE IF NOT EXISTS public.hr_mansioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  area text,
  descrizione text,
  responsabilita jsonb NOT NULL DEFAULT '[]'::jsonb,
  kpi_suggeriti jsonb NOT NULL DEFAULT '[]'::jsonb,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);

-- hr_profili: link a mansione + responsabilità extra per persona
ALTER TABLE public.hr_profili
  ADD COLUMN IF NOT EXISTS mansione_id uuid REFERENCES public.hr_mansioni(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsabilita jsonb NOT NULL DEFAULT '[]'::jsonb;

-- hr_task: task/obiettivi per persona
CREATE TABLE IF NOT EXISTS public.hr_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  titolo text NOT NULL,
  descrizione text,
  priorita text NOT NULL DEFAULT 'media' CHECK (priorita IN ('bassa','media','alta')),
  scadenza date,
  stato text NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare','in_corso','fatto','annullato')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- hr_kpi: definizione KPI per persona
CREATE TABLE IF NOT EXISTS public.hr_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  nome text NOT NULL,
  unita text NOT NULL DEFAULT 'num' CHECK (unita IN ('num','%','ore','€')),
  target numeric,
  direzione text NOT NULL DEFAULT 'su' CHECK (direzione IN ('su','giu')),
  periodo text NOT NULL DEFAULT 'mensile' CHECK (periodo IN ('mensile','trimestrale','annuale')),
  tipo text NOT NULL DEFAULT 'manuale' CHECK (tipo IN ('manuale','auto')),
  auto_metric text CHECK (auto_metric IN ('presenza_pct','ore_mese','task_completati')),
  origine_mansione_id uuid REFERENCES public.hr_mansioni(id) ON DELETE SET NULL,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- hr_kpi_valori: storico valori (solo KPI manuali)
CREATE TABLE IF NOT EXISTS public.hr_kpi_valori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.hr_kpi(id) ON DELETE CASCADE,
  periodo_label text NOT NULL,
  valore numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, periodo_label)
);

CREATE INDEX IF NOT EXISTS idx_hr_task_profilo ON public.hr_task(profilo_id);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_profilo ON public.hr_kpi(profilo_id);
CREATE INDEX IF NOT EXISTS idx_hr_mansioni_company ON public.hr_mansioni(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_valori_kpi ON public.hr_kpi_valori(kpi_id);

-- RLS: stesso pattern company-scoped delle altre hr_* (membership via profiles.company_id)
ALTER TABLE public.hr_mansioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_kpi_valori ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_mansioni_company ON public.hr_mansioni
  FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY hr_task_company ON public.hr_task
  FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY hr_kpi_company ON public.hr_kpi
  FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY hr_kpi_valori_company ON public.hr_kpi_valori
  FOR ALL USING (kpi_id IN (SELECT id FROM public.hr_kpi WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (kpi_id IN (SELECT id FROM public.hr_kpi WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
```

> ⚠️ Verificare col DB il nome reale della policy company-scoped già in uso sulle altre `hr_*` (es. `get_user_company_id()` helper) e allinearsi ad esso invece del sub-select se presente. Ispezionare con: `SELECT policyname, qual FROM pg_policies WHERE tablename='hr_documenti';`

- [ ] **Step 2: Verifica tabelle create** — `SELECT count(*) FROM hr_mansioni;` → 0 senza errori; `\d hr_task` mostra le colonne.

- [ ] **Step 3: Commit** copia SQL in `supabase/migrations/` con `git add` + messaggio `feat(hr): schema ruolo/task/kpi + RLS`.

---

## Task 2: RPC auto-KPI

**Files:** MCP `apply_migration` name `hr_persona_kpi_auto`

- [ ] **Step 1: Ispeziona lo schema di `hr_timbrature` e `hr_giornate`** per i nomi colonna reali (data, ore, profilo_id, stato presenza). `SELECT column_name FROM information_schema.columns WHERE table_name IN ('hr_timbrature','hr_giornate');`

- [ ] **Step 2: Crea la funzione** (adattare i nomi colonna allo schema reale trovato)

```sql
CREATE OR REPLACE FUNCTION public.hr_persona_kpi_auto(p_profilo_id uuid, p_periodo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  v_end date := (v_start + interval '1 month')::date;
  v_ore numeric := 0;
  v_presenza numeric := 0;
  v_task_tot int := 0;
  v_task_done int := 0;
BEGIN
  -- ore lavorate nel mese (adattare colonna ore/data reale)
  SELECT COALESCE(sum(ore_lavorate), 0) INTO v_ore
  FROM public.hr_giornate
  WHERE profilo_id = p_profilo_id AND data >= v_start AND data < v_end;

  -- % presenza = giorni presenti / giorni lavorativi registrati
  SELECT CASE WHEN count(*) = 0 THEN 0
    ELSE round(100.0 * count(*) FILTER (WHERE presente) / count(*), 1) END INTO v_presenza
  FROM public.hr_giornate
  WHERE profilo_id = p_profilo_id AND data >= v_start AND data < v_end;

  SELECT count(*), count(*) FILTER (WHERE stato = 'fatto')
    INTO v_task_tot, v_task_done
  FROM public.hr_task
  WHERE profilo_id = p_profilo_id AND (scadenza IS NULL OR (scadenza >= v_start AND scadenza < v_end));

  RETURN jsonb_build_object(
    'presenza_pct', v_presenza,
    'ore_mese', v_ore,
    'task_completati', v_task_done,
    'task_totali', v_task_tot
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_persona_kpi_auto(uuid, text) TO authenticated;
```

- [ ] **Step 3: Test** — `SELECT public.hr_persona_kpi_auto('<un profilo demo>', '2026-07');` → jsonb con le 4 chiavi, nessun errore.

- [ ] **Step 4: Commit** SQL in `supabase/migrations/`.

---

## Task 3: Seed catalogo mansioni (Demo Azienda)

**Files:** MCP `execute_sql` (dati demo, non migration di schema)

- [ ] **Step 1: Inserisci ~10 mansioni** per `company_id='778a2c76-1253-49f2-a5e8-283363ac3e29'` con `responsabilita` (3-5 voci) e `kpi_suggeriti` (2-3, con `{nome,unita,target,direzione,periodo}`). Ruoli: Capocantiere, Muratore, Geometra, Impiegato tecnico, Preventivista, Responsabile acquisti, Amministrativo, Posatore, Elettricista, Idraulico. `ON CONFLICT (company_id,nome) DO NOTHING`.

- [ ] **Step 2: Verifica** `SELECT nome, jsonb_array_length(responsabilita), jsonb_array_length(kpi_suggeriti) FROM hr_mansioni;` → 10 righe.

---

## Task 4: Tipi TS

**Files:** Modify `src/types/hr.ts`

- [ ] **Step 1:** Aggiungi `HrMansione`, `HrTask`, `HrKpi`, `HrKpiValore` (specchio esatto delle colonne SQL) ed estendi `HrProfilo` con `mansione_id?: string | null` e `responsabilita?: string[]`. `KpiSuggerito = { nome: string; unita: string; target: number | null; direzione: 'su'|'giu'; periodo: string }`.

- [ ] **Step 2:** `npx tsc --noEmit` → 0 errori.

- [ ] **Step 3:** Commit.

---

## Task 5: Hooks dati

**Files:** Create `src/hooks/useHrMansioni.ts`, `src/hooks/useHrTask.ts`, `src/hooks/useHrKpi.ts`

Pattern di riferimento: `src/hooks/useHrDocumenti.ts` (query key `['hr-...', profiloId]`, mutation con `invalidateQueries`, `supabase.from(...)`). companyId arriva come argomento (come fanno `HrDocumentiSection`/`HrAssenzeSection`).

- [ ] **Step 1:** `useHrMansioni(companyId)` → lista catalogo; `useHrMansioneMutations(companyId)` → create/update/delete.
- [ ] **Step 2:** `useHrTask(profiloId)` → lista task; mutations create/update/delete/toggleStato.
- [ ] **Step 3:** `useHrKpi(profiloId)` → lista KPI + `useHrKpiAuto(profiloId, periodo)` (chiama `supabase.rpc('hr_persona_kpi_auto',...)`); mutations create/update/delete + `setValore(kpiId, periodo, valore)`.
- [ ] **Step 4:** `npx tsc --noEmit` → 0 errori. Commit.

---

## Task 6: HrTaskBlock

**Files:** Create `src/components/hr/HrTaskBlock.tsx`. Props `{ profiloId: string; companyId: string }`.

- [ ] **Step 1:** Lista task (badge priorità + stato, scadenza formattata IT), riga "aggiungi task" inline (titolo, scadenza, priorità), toggle stato, elimina con conferma. Empty state con CTA. Usa `useHrTask`. Errori → toast italiano.
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Commit.

---

## Task 7: HrKpiBlock

**Files:** Create `src/components/hr/HrKpiBlock.tsx`. Props `{ profiloId: string; companyId: string }`.

- [ ] **Step 1:** Card per KPI: nome, valore corrente vs target, barra/gauge, badge "auto" per `tipo='auto'` (valore da `useHrKpiAuto`), campo "aggiorna valore periodo" per i manuali (scrive `hr_kpi_valori`), mini-trend degli ultimi periodi (recharts sparkline). Aggiungi/elimina KPI manuale. Empty state.
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Commit.

---

## Task 8: HrMansioneBlock + catalogo dialog

**Files:** Create `src/components/hr/HrMansioneBlock.tsx`, `src/components/hr/HrMansioniCatalogDialog.tsx`. Props block `{ profilo: HrProfilo; companyId: string }`.

- [ ] **Step 1: HrMansioniCatalogDialog** — CRUD catalogo (`useHrMansioni`): lista mansioni, form nome/area/descrizione + editor lista responsabilità + editor KPI suggeriti. Apribile da un bottone "Gestisci catalogo".
- [ ] **Step 2: HrMansioneBlock** — Select `mansione_id` dal catalogo (salva su `hr_profili`, sincronizza il testo `mansione`); mostra responsabilità ereditate (read-only) + editor `hr_profili.responsabilita` (extra persona); bottone "Applica KPI del ruolo" che crea gli `hr_kpi` dai `kpi_suggeriti` della mansione (skip se già presenti per nome); bottone "Gestisci catalogo".
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit.

---

## Task 9: Tab contenitore + montaggio in HrProfiloSheet

**Files:** Create `src/components/hr/HrRuoloObiettiviTab.tsx`; Modify `src/components/hr/HrProfiloSheet.tsx`

- [ ] **Step 1: HrRuoloObiettiviTab** `{ profilo: HrProfilo }` → impila `HrMansioneBlock`, `HrTaskBlock`, `HrKpiBlock` (passando `profilo`/`profilo.id`/`profilo.company_id`).
- [ ] **Step 2:** In `HrProfiloSheet.tsx` aggiungi `<TabsTrigger value="ruolo" disabled={!isEditing}>Ruolo & Obiettivi</TabsTrigger>` e il relativo `<TabsContent>` con `{isEditing && profilo ? <HrRuoloObiettiviTab profilo={profilo} /> : null}` (stesso pattern di Documenti/Assenze, righe ~199-200 e ~385-395).
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit.

---

## Task 10: Contract test + verifica finale

**Files:** Create `src/test/logic/hrRuoloTaskKpi.test.ts`

- [ ] **Step 1:** Test stile esistente (`talentProfilePublicFlow.test.ts`): asserisce che `HrProfiloSheet.tsx` contenga `value="ruolo"` e `HrRuoloObiettiviTab`, che i 3 blocchi esistano come file, e che la migration SQL contenga le 4 `CREATE TABLE` + la RPC `hr_persona_kpi_auto`.
- [ ] **Step 2:** `npx vitest run src/test/logic/hrRuoloTaskKpi.test.ts` → PASS.
- [ ] **Step 3: Verifica E2E** in preview su Demo Azienda: apri un profilo → tab "Ruolo & Obiettivi" → assegna mansione (responsabilità compaiono) → "Applica KPI del ruolo" (KPI creati) → aggiungi un task e cambialo di stato → aggiorna un valore KPI manuale → verifica auto-KPI (presenza/ore/task) → riapri e controlla persistenza. Console 0 errori. Mobile 375px senza overflow.
- [ ] **Step 4:** `npx tsc --noEmit` + `bun run build` → 0 errori, prerender OK.
- [ ] **Step 5:** Commit finale. (Push su main SOLO con ok esplicito.)

---

## Self-review note

- Copertura spec: mansionario (Task 8) · catalogo riutilizzabile (Task 3+8) · task per persona (Task 6) · KPI manuali+3 auto (Task 2+7) · tab in scheda (Task 9) · seed (Task 3). Fase 2 (badge organigramma/profili) = piano separato.
- Rischi noti da risolvere in esecuzione: (a) nome reale della policy/ helper company-scoped sulle `hr_*` (Task 1 Step 1 nota); (b) nomi colonna reali di `hr_giornate`/`hr_timbrature` per la RPC (Task 2 Step 1). Entrambi verificati contro il DB prima di applicare.
