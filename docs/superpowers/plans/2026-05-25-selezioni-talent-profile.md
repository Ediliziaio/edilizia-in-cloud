# Selezioni Talent Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrare Talent Profile in Edilizia in Cloud come tab `Selezioni` dentro `Personale & HR`, con 242 domande versionate, scoring V5 e storage multi-azienda.

**Architecture:** Il motore domande/scoring resta pure TypeScript in `src/features/talent-profile`, separato dalla UI. Supabase conserva domande versionate globali e dati candidati/risposte/report legati a `company_id`, così il test pubblico può essere invitato senza importare il modello auth standalone del repository esterno.

**Tech Stack:** React 18, Vite, Vitest, Supabase/Postgres RLS, UI shadcn esistente.

---

### Task 1: Engine Contract

**Files:**
- Create: `src/test/logic/talentProfileEngine.test.ts`
- Create: `src/features/talent-profile/data/questionario.ts`
- Create: `src/features/talent-profile/lib/scoringV5.ts`
- Create: `src/features/talent-profile/lib/roleMatchingV5.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DOMANDE } from "@/features/talent-profile/data/questionario";
import { calcolaRisultatoV5 } from "@/features/talent-profile/lib/scoringV5";
import { ROLE_PROFILES_V5 } from "@/features/talent-profile/lib/roleMatchingV5";

describe("talent profile engine", () => {
  it("espone tutte le 242 domande V5 senza buchi di ordinamento", () => {
    expect(DOMANDE).toHaveLength(242);
    expect(DOMANDE.map((d) => d.id)).toEqual(Array.from({ length: 242 }, (_, i) => i + 1));
  });

  it("mantiene le domande speciali e di controllo richieste dal motore V5", () => {
    expect(DOMANDE.filter((d) => d.polarita === "S").map((d) => d.id)).toEqual([72, 73, 211, 212, 213, 228]);
    expect(DOMANDE.filter((d) => d.polarita === "C").map((d) => d.id)).toEqual([238, 239, 240, 241, 242]);
  });

  it("calcola scoring V5 e matching su 24 ruoli", () => {
    const risposte = DOMANDE.reduce<Record<number, "A" | "B" | "C">>((acc, domanda) => {
      acc[domanda.id] = domanda.polarita === "-" ? "C" : "A";
      return acc;
    }, {});

    const risultato = calcolaRisultatoV5(risposte);
    expect(Object.keys(risultato.tratti).sort()).toContain("ORG");
    expect(Object.keys(ROLE_PROFILES_V5)).toHaveLength(24);
    expect(risultato.affidabilita.esito).not.toBe("NO");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/logic/talentProfileEngine.test.ts`

Expected: FAIL perché i moduli `@/features/talent-profile/...` non esistono ancora.

- [ ] **Step 3: Import minimal engine files**

Copy the standalone pure engine files from `/tmp/talent-profile-insights-engine/src` into `src/features/talent-profile`, adjusting imports from `@/types/database` to local `types.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/logic/talentProfileEngine.test.ts`

Expected: PASS.

### Task 2: Supabase Schema And Seed

**Files:**
- Create: `supabase/migrations/20270525090000_hr_talent_profile.sql`
- Test: `src/test/logic/talentProfileDatabaseContract.test.ts`

- [ ] **Step 1: Write database contract test**

Test that the migration creates `hr_talent_questions`, `hr_talent_candidates`, `hr_talent_answers`, `hr_talent_reports`, inserts 242 questions and includes RLS policies using `company_id = public.get_my_company_id()`.

- [ ] **Step 2: Create migration**

Create global question table keyed by `(assessment_version, question_id)` and company-scoped candidate tables linked to `hr_profili`.

- [ ] **Step 3: Run database contract test**

Run: `npm test -- src/test/logic/talentProfileDatabaseContract.test.ts`.

### Task 3: HR UI

**Files:**
- Modify: `src/pages/azienda/personale/PersonalePage.tsx`
- Create: `src/pages/azienda/personale/tabs/TabSelezioni.tsx`
- Test: `src/test/logic/talentProfileRouteContract.test.tsx`

- [ ] **Step 1: Write route/tab test**

Test that `/azienda/personale?tab=selezioni` is accepted and exposes a `Selezioni` trigger.

- [ ] **Step 2: Add tab**

Add `selezioni` to `availableTabs`, render `TabSelezioni`, and keep existing HR behavior unchanged.

- [ ] **Step 3: Run test and smoke UI**

Run: `npm test -- src/test/logic/talentProfileRouteContract.test.tsx` and open `http://127.0.0.1:8081/azienda/personale?tab=selezioni`.
