# Simulatore Contratti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sezione azienda "Simulatore" in Marketing & Vendita — banco di simulazione contratti edili (margine azienda + offerta cliente: IVA, finanziamenti), collegato a listino/manodopera/prezzari, con cronoprogramma e trasformazione in preventivo/commessa.

**Architecture:** 3 strati. (1) Motore puro `src/lib/simulatore/` (TS, testato vitest). (2) Dati `useSimulazioni` (react-query) + riuso hook finanziamenti/listino/prezzari. (3) UI `src/pages/azienda/marketing/simulatore/` + `src/components/marketing/simulatore/`. Una tabella `simulazioni` stile documento (riepilogo denormalizzato + JSONB voci/fasi/scenari).

**Tech Stack:** React 18 + TS + Vite, Supabase (Postgres + RLS), @tanstack/react-query, shadcn/ui, vitest, @react-pdf/renderer, exceljs.

**Vincoli:** SOLO locale (commit locali OK; mai push/deploy/MCP apply_migration finché l'utente non dice "pubblica"). Migrazione = file locale. Gate per task = `npx eslint <file>` (0 nuovi) + `npx vite build` (exit 0) + `npx vitest run src/lib/simulatore` (sui task del motore). Branch `feat/simulatore-contratti`.

**Riferimenti codice (verificati):**
- Listino+manodopera: tabella `tariffe_aziendali`; pagina `src/pages/azienda/settings/SettingsTariffe.tsx`.
- Prezzari: `src/lib/prezzario/queries.ts` (`usePrezzarioVociGlobalSearch`, `usePrezzarioFonti`).
- Finanziamenti: `src/lib/finanziamenti/calcolaFinanziamento.ts` + `src/hooks/useTabelleFinanziamento.ts` (`useTabelleFinanziamentoAttive`, `useTabellaFinanziamentoRighe`). Tabelle `eic_tabelle_finanziamento` / `eic_tabelle_finanziamento_righe`.
- IVA: `src/lib/fatturazione/calcoli.ts` (`calcolaRiepilogoIVA`).
- Trasforma: `quotes`/`quote_items` (quote_number `Q-YYYY-NNNNN`, `quote_items.vat_rate` per-riga, `tariffa_id`, `item_category`); commessa RPC `create_order_atomic`; `src/pages/azienda/CreateOrder.tsx` per la selezione cliente.
- Pattern hook CRUD: `src/hooks/useTariffaVarianti.ts` (queryKey `[res,id,companyId]`, `enabled`, invalidate, `useEffectiveCompanyId`).
- Pattern pagina ricca: `src/pages/azienda/settings/SettingsTariffe.tsx`, `src/pages/azienda/CruscottoDashboardPage.tsx`.
- Nav: `src/lib/sidebarConfig.ts` (area `area_marketing`). Rotte: `src/routes/companyRoutes.tsx`.

---

## TAPPA A — Il foglio (MVP usabile)

### Task 1: Migrazione `simulazioni` (file locale)

**Files:**
- Create: `supabase/migrations/20271101000000_simulatore_contratti.sql`

- [ ] **Step 1: Scrivere la migrazione** (idempotente, stile delle tabelle azienda esistenti)

```sql
CREATE TABLE IF NOT EXISTS public.simulazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','finalizzata','archiviata')),
  is_template boolean NOT NULL DEFAULT false,
  costo_totale numeric(14,2) NOT NULL DEFAULT 0,
  ricavo_imponibile numeric(14,2) NOT NULL DEFAULT 0,
  margine_valore numeric(14,2) NOT NULL DEFAULT 0,
  margine_pct numeric(6,2) NOT NULL DEFAULT 0,
  iva_totale numeric(14,2) NOT NULL DEFAULT 0,
  prezzo_cliente numeric(14,2) NOT NULL DEFAULT 0,
  rata_mensile numeric(12,2),
  voci jsonb NOT NULL DEFAULT '[]'::jsonb,
  fasi jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenari jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.simulazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "simulazioni_company" ON public.simulazioni;
CREATE POLICY "simulazioni_company" ON public.simulazioni FOR ALL
  USING (company_id = public.get_my_company_id());
DROP POLICY IF EXISTS "simulazioni_sa" ON public.simulazioni;
CREATE POLICY "simulazioni_sa" ON public.simulazioni FOR ALL
  USING (public.is_super_admin());
CREATE INDEX IF NOT EXISTS simulazioni_company_idx ON public.simulazioni(company_id, updated_at DESC);
```

- [ ] **Step 2: Aggiungere i tipi manuali** (i tipi generati Supabase NON includono `simulazioni` finché non si rigenera; il codice userà `supabase as any` come `prezzario_*`). Nessun file da modificare ora.
- [ ] **Step 3: Commit** — `git add supabase/migrations/20271101000000_simulatore_contratti.sql && git commit -m "feat(simulatore): migrazione tabella simulazioni"`

---

### Task 2: Motore — tipi (`tipi.ts`)

**Files:**
- Create: `src/lib/simulatore/tipi.ts`

- [ ] **Step 1: Definire le interfacce** (esattamente come la spec)

```ts
export type AliquotaIva = 0 | 4 | 10 | 22;
export type FonteVoce = "listino" | "prezzario" | "libera";

export interface VoceSim {
  id: string;
  fase_id: string | null;
  descrizione: string;
  fonte: FonteVoce;
  riferimento_id: string | null;
  codice: string | null;
  quantita: number;
  unita: string;
  costo_unitario: number;
  ricarico_pct: number;
  prezzo_unitario: number;
  vat_rate: AliquotaIva;
  bene_significativo: boolean;
  valore_posa_associata: number | null;
  is_manodopera: boolean;
  ordine: number;
}

export interface FaseSim {
  id: string;
  nome: string;
  ordine: number;
  durata_settimane: number;
  inizio_offset_settimane: number;
  giorni_uomo: number;
  note: string | null;
}

export interface FinanziamentoConfig {
  tabella_id: string | null;
  importo_finanziato: number;
  numero_rate: number;
  anticipo: number;
}

export interface ScenariConfig {
  iva_mode: "singola" | "mista";
  iva_rate_singola: 4 | 10 | 22;
  iva_confronto: number[];
  finanziamento: FinanziamentoConfig | null;
}

export interface SimulazioneDoc {
  voci: VoceSim[];
  fasi: FaseSim[];
  scenari: ScenariConfig;
}

export interface RiepilogoIvaRiga { aliquota: number; imponibile: number; imposta: number; }

export interface SimulazioneRisultato {
  costo_totale: number;
  ricavo_imponibile: number;
  margine_valore: number;
  margine_pct: number;
  riepilogo_iva: RiepilogoIvaRiga[];
  iva_totale: number;
  prezzo_cliente: number;
  confronto_iva: { aliquota: number; prezzo_cliente: number }[];
  durata_settimane: number;
  rata_mensile: number | null;
}

export const DEFAULT_SCENARI: ScenariConfig = {
  iva_mode: "singola",
  iva_rate_singola: 10,
  iva_confronto: [4, 10, 22],
  finanziamento: null,
};
```

- [ ] **Step 2: Build** — `npx vite build` → exit 0 (i tipi non rompono nulla).
- [ ] **Step 3: Commit** — `git add src/lib/simulatore/tipi.ts && git commit -m "feat(simulatore): tipi del motore"`

---

### Task 3: Motore — calcoli base + test (TDD)

**Files:**
- Create: `src/lib/simulatore/calcoli.ts`
- Test: `src/lib/simulatore/calcoli.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
import { describe, it, expect } from "vitest";
import { calcolaVoce, calcolaTotali, round2 } from "./calcoli";
import type { VoceSim } from "./tipi";

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1", fase_id: null, descrizione: "x", fonte: "libera", riferimento_id: null,
  codice: null, quantita: 1, unita: "pz", costo_unitario: 0, ricarico_pct: 0,
  prezzo_unitario: 0, vat_rate: 10, bene_significativo: false,
  valore_posa_associata: null, is_manodopera: false, ordine: 0, ...p,
});

describe("calcolaVoce", () => {
  it("calcola imponibili e margine", () => {
    const r = calcolaVoce(voce({ quantita: 10, costo_unitario: 12, prezzo_unitario: 18 }));
    expect(r.imponibile_costo).toBe(120);
    expect(r.imponibile_ricavo).toBe(180);
    expect(r.margine).toBe(60);
  });
});

describe("calcolaTotali", () => {
  it("somma costi/ricavi e calcola margine %", () => {
    const r = calcolaTotali([
      voce({ quantita: 1, costo_unitario: 100, prezzo_unitario: 150 }),
      voce({ quantita: 2, costo_unitario: 25, prezzo_unitario: 50 }),
    ]);
    expect(r.costo_totale).toBe(150);
    expect(r.ricavo_imponibile).toBe(250);
    expect(r.margine_valore).toBe(100);
    expect(r.margine_pct).toBe(40);
  });
  it("margine_pct=0 con ricavo 0 (no NaN)", () => {
    expect(calcolaTotali([]).margine_pct).toBe(0);
  });
});
```

- [ ] **Step 2: Verificare il fallimento** — `npx vitest run src/lib/simulatore/calcoli.test.ts` → FAIL (modulo non esiste).
- [ ] **Step 3: Implementare**

```ts
import type { VoceSim } from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = round2(v.quantita * v.costo_unitario);
  const imponibile_ricavo = round2(v.quantita * v.prezzo_unitario);
  return { imponibile_costo, imponibile_ricavo, margine: round2(imponibile_ricavo - imponibile_costo) };
}

export function calcolaTotali(voci: VoceSim[]) {
  let costo_totale = 0, ricavo_imponibile = 0;
  for (const v of voci) {
    const r = calcolaVoce(v);
    costo_totale += r.imponibile_costo;
    ricavo_imponibile += r.imponibile_ricavo;
  }
  costo_totale = round2(costo_totale);
  ricavo_imponibile = round2(ricavo_imponibile);
  const margine_valore = round2(ricavo_imponibile - costo_totale);
  const margine_pct = ricavo_imponibile > 0 ? round2((margine_valore / ricavo_imponibile) * 100) : 0;
  return { costo_totale, ricavo_imponibile, margine_valore, margine_pct };
}
```

- [ ] **Step 4: Verificare pass** — `npx vitest run src/lib/simulatore/calcoli.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/simulatore/calcoli.ts src/lib/simulatore/calcoli.test.ts && git commit -m "feat(simulatore): calcoli base voce/totali + test"`

---

### Task 4: Hook `useSimulazioni` (CRUD)

**Files:**
- Create: `src/hooks/useSimulazioni.ts`

Mirror del pattern `src/hooks/useTariffaVarianti.ts` (queryKey `["simulazioni", companyId]`, `useEffectiveCompanyId`, `supabase as any` perché `simulazioni` non è nei tipi generati).

- [ ] **Step 1: Implementare** lista + create + update + remove + getOne.

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { DEFAULT_SCENARI } from "@/lib/simulatore/tipi";

const sb = () => supabase as any;
export interface SimulazioneRow {
  id: string; company_id: string; nome: string; contact_id: string | null;
  stato: string; is_template: boolean;
  costo_totale: number; ricavo_imponibile: number; margine_valore: number; margine_pct: number;
  iva_totale: number; prezzo_cliente: number; rata_mensile: number | null;
  voci: unknown; fasi: unknown; scenari: unknown; note: string | null;
  created_at: string; updated_at: string;
}

export function useSimulazioni(opts: { template?: boolean } = {}) {
  const companyId = useEffectiveCompanyId();
  return useQuery<SimulazioneRow[]>({
    queryKey: ["simulazioni", companyId, opts.template ?? null],
    enabled: !!companyId,
    queryFn: async () => {
      let q = sb().from("simulazioni").select("*").eq("company_id", companyId).order("updated_at", { ascending: false });
      if (opts.template !== undefined) q = q.eq("is_template", opts.template);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as SimulazioneRow[];
    },
    staleTime: 60_000,
  });
}

export function useSimulazione(id: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery<SimulazioneRow | null>({
    queryKey: ["simulazione", id, companyId],
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await sb().from("simulazioni").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as SimulazioneRow | null;
    },
  });
}

export function useSimulazioniMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["simulazioni"] });
  const create = useMutation({
    mutationFn: async (input: { nome: string; contact_id?: string | null }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { data, error } = await sb().from("simulazioni").insert({
        company_id: companyId, nome: input.nome, contact_id: input.contact_id ?? null,
        voci: [], fasi: [], scenari: DEFAULT_SCENARI,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (params: { id: string; patch: Record<string, unknown> }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { error } = await sb().from("simulazioni")
        .update({ ...params.patch, updated_at: new Date().toISOString() })
        .eq("id", params.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => { invalidate(); qc.invalidateQueries({ queryKey: ["simulazione", v.id] }); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { error } = await sb().from("simulazioni").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: async (row: SimulazioneRow & { as_template?: boolean }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { id, created_at, updated_at, ...rest } = row;
      const { data, error } = await sb().from("simulazioni").insert({
        ...rest, company_id: companyId, nome: `${row.nome} (copia)`, is_template: row.as_template ?? row.is_template,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove, duplicate };
}
```

- [ ] **Step 2: eslint + build** → 0 nuovi problemi, exit 0.
- [ ] **Step 3: Commit** — `git add src/hooks/useSimulazioni.ts && git commit -m "feat(simulatore): hook CRUD useSimulazioni"`

---

### Task 5: Nav + rotte + pagine lazy

**Files:**
- Modify: `src/lib/sidebarConfig.ts` (area `area_marketing.items`, dopo "Preventivi CRM")
- Modify: `src/routes/companyRoutes.tsx` (sotto `/azienda/marketing/`)
- Create: `src/pages/azienda/marketing/simulatore/SimulatoreIndex.tsx` (placeholder)
- Create: `src/pages/azienda/marketing/simulatore/SimulatoreEditor.tsx` (placeholder)

- [ ] **Step 1: sidebarConfig** — aggiungere `{ title: "Simulatore", url: "/azienda/marketing/simulatore", icon: Calculator, permissionKey: "canViewMarketingOpportunities", featureKey: "simulatore" }` (importare `Calculator` da lucide-react se non presente). Seguire ESATTAMENTE la forma delle voci vicine.
- [ ] **Step 2: companyRoutes** — aggiungere, con lo stesso `withCompanyPermission`/lazy delle rotte vicine:
  `<Route path="marketing/simulatore" element={<SimulatoreIndex />} />` e `<Route path="marketing/simulatore/:id" element={<SimulatoreEditor />} />` (lazy import come gli altri).
- [ ] **Step 3: Placeholder pagine** — `SimulatoreIndex` e `SimulatoreEditor` che renderizzano un titolo, così le rotte montano.
- [ ] **Step 4: build** → exit 0. Verifica preview: `/azienda/marketing/simulatore` monta + voce in sidebar.
- [ ] **Step 5: Commit** — `git commit -m "feat(simulatore): nav + rotte + pagine placeholder"`

---

### Task 6: `SimulatoreIndex` (lista)

**Files:**
- Modify: `src/pages/azienda/marketing/simulatore/SimulatoreIndex.tsx`
- Create: `src/components/marketing/simulatore/NuovaSimulazioneDialog.tsx`

Mirror visivo: griglia di card come liste esistenti (`SettingsTariffe`/Cruscotto). Usa `useSimulazioni()` + `useSimulazioniMutations()`.

- [ ] **Step 1: Implementare** — header "Simulatore" + bottone "Nuova simulazione" (apre `NuovaSimulazioneDialog`: campo nome + opzionale contatto → `create` → naviga a `:id`). Griglia card: nome, cliente, prezzo_cliente (`formatCurrency`), margine_pct (badge colorato verde/giallo/rosso), stato badge, data. Menu per card: Apri, Duplica, Duplica come template, Elimina (con conferma dialog). Filtro stato + toggle "Template". Empty-state.
- [ ] **Step 2: eslint + build** → ok. Verifica preview: creo una simulazione, appare in lista, naviga all'editor.
- [ ] **Step 3: Commit** — `git commit -m "feat(simulatore): SimulatoreIndex lista + nuova/duplica/elimina"`

---

### Task 7: `SimulatoreEditor` shell + `SimKpiBar` + autosave

**Files:**
- Modify: `src/pages/azienda/marketing/simulatore/SimulatoreEditor.tsx`
- Create: `src/components/marketing/simulatore/SimKpiBar.tsx`
- Create: `src/lib/simulatore/calcolaSimulazione.ts`

- [ ] **Step 1: `calcolaSimulazione.ts`** — funzione pura `calcolaSimulazione(doc: SimulazioneDoc): SimulazioneRisultato` che per la Tappa A usa `calcolaTotali` + IVA singola (prezzo_cliente = ricavo × (1+iva/100)) + `confronto_iva` per le aliquote in `iva_confronto`; `durata_settimane=0`, `rata_mensile=null` (riempiti in Tappa B). Test base in `calcolaSimulazione.test.ts` (ricavo→prezzo con IVA singola, confronto a 3 aliquote).
- [ ] **Step 2: `SimKpiBar`** — 5 metric card (Costo, Ricavo, Margine %+valore verde, Prezzo cliente, Rata "—" in Tappa A) dallo `SimulazioneRisultato`. Stile metric card di `read_me`/Cruscotto.
- [ ] **Step 3: Editor shell** — carica `useSimulazione(id)`; stato locale `doc` (voci/fasi/scenari) inizializzato dalla riga; ricalcola `calcolaSimulazione(doc)` ad ogni render con `useMemo`; **autosave debounced** (500ms) via `update` mutation salvando `{ voci, fasi, scenari, ...riepilogo denormalizzato }`; header con nome editabile + bottoni placeholder (Esporta/Trasforma disattivati in Tappa A). Render `SimKpiBar` + slot per `SimVociGrid` (Task 8).
- [ ] **Step 4: eslint + build + vitest** → ok. Preview: apro editor, i KPI si vedono.
- [ ] **Step 5: Commit** — `git commit -m "feat(simulatore): editor shell + KpiBar + autosave + calcolaSimulazione"`

---

### Task 8: `SimVociGrid` + `SimVoceRow` (inline edit) + riga libera

**Files:**
- Create: `src/components/marketing/simulatore/SimVociGrid.tsx`
- Create: `src/components/marketing/simulatore/SimVoceRow.tsx`

- [ ] **Step 1: `SimVoceRow`** — riga con input inline: descrizione, quantità, UM (select da `tariffe_aziendali` enum), costo_unitario, ricarico_pct, prezzo_unitario (auto da costo×(1+ricarico/100), editabile per override), vat_rate (select 4/10/22), totale (read-only = `calcolaVoce`). Props: `voce`, `onChange(patch)`, `onRemove`. Numeri arrotondati.
- [ ] **Step 2: `SimVociGrid`** — riceve `doc.voci` + `onChange(voci)`; raggruppa per `fase_id` (in Tappa A: tutte senza fase, gruppo unico "Voci"); pulsanti "Riga libera" (aggiunge VoceSim vuota con `crypto.randomUUID()`) e placeholder "Da listino" (Task 9). Drag-reorder opzionale (può essere semplice ↑↓ in Tappa A). Riga totale in fondo.
- [ ] **Step 3: Wire** in `SimulatoreEditor` — `SimVociGrid` modifica `doc.voci` → ricalcolo + autosave.
- [ ] **Step 4: eslint + build** → ok. Preview: aggiungo righe libere, i KPI si aggiornano, salva.
- [ ] **Step 5: Commit** — `git commit -m "feat(simulatore): griglia voci editabile + riga libera"`

---

### Task 9: Dialog "Da listino" (listino + prezzari)

**Files:**
- Create: `src/components/marketing/simulatore/AggiungiVociDialog.tsx`

Riusa i pattern dei picker esistenti: lettura `tariffe_aziendali` (hook `useListinoLaborazioni` o query diretta) + `usePrezzarioVociGlobalSearch` (prezzari regionali). Mappa la voce scelta → `VoceSim` (fonte/riferimento_id/codice/descrizione/unita/costo_unitario da prezzo_costo o prezzo, prezzo_unitario da prezzo_vendita o prezzo, vat_rate default 10, is_manodopera se tipo manodopera).

- [ ] **Step 1: Implementare** dialog con due tab "Listino aziendale" | "Prezzario regionale" (riusa `ImportaPrezzarioRegionaleDialog`/`AddVocePicker` come riferimento), ricerca, selezione multipla, "Aggiungi". `onAdd(voci: VoceSim[])`.
- [ ] **Step 2: Wire** nel pulsante "Da listino" di `SimVociGrid`.
- [ ] **Step 3: eslint + build** → ok. Preview: aggiungo voci da listino e da prezzario.
- [ ] **Step 4: Commit** — `git commit -m "feat(simulatore): aggiungi voci da listino e prezzari"`

### Verifica Tappa A
- [ ] `npx eslint` sui file nuovi (0 nuovi) + `npx vite build` (exit 0) + `npx vitest run src/lib/simulatore` (pass). Commit `chore(simulatore): verifica Tappa A`.

---

## TAPPA B — La potenza

### Task 10: Motore IVA mista 10/22 + beni significativi (TDD)

**Files:**
- Modify: `src/lib/simulatore/calcoli.ts` (+ `calcolaIva`)
- Modify: `src/lib/simulatore/calcoli.test.ts`

- [ ] **Step 1: Test** (regola beni significativi: 10% su posa+min(bene,posa), 22% su max(0,bene−posa))

```ts
import { calcolaIva } from "./calcoli";
// ... voce() helper come Task 3
describe("calcolaIva", () => {
  it("singola: tutto a una aliquota", () => {
    const r = calcolaIva([voce({ quantita:1, prezzo_unitario:1000, vat_rate:22 })], { iva_mode:"singola", iva_rate_singola:10, iva_confronto:[], finanziamento:null });
    expect(r.iva_totale).toBe(100);
    expect(r.riepilogo_iva).toEqual([{ aliquota:10, imponibile:1000, imposta:100 }]);
  });
  it("mista: somma per aliquota di riga", () => {
    const r = calcolaIva([
      voce({ quantita:1, prezzo_unitario:1000, vat_rate:10 }),
      voce({ quantita:1, prezzo_unitario:500, vat_rate:22 }),
    ], { iva_mode:"mista", iva_rate_singola:10, iva_confronto:[], finanziamento:null });
    expect(r.iva_totale).toBe(210);
  });
  it("mista: bene significativo split 10/22", () => {
    // bene 1000, posa 300 → 10% su 300+300=600, 22% su 700
    const r = calcolaIva([voce({ quantita:1, prezzo_unitario:1000, vat_rate:10, bene_significativo:true, valore_posa_associata:300 })],
      { iva_mode:"mista", iva_rate_singola:10, iva_confronto:[], finanziamento:null });
    const r10 = r.riepilogo_iva.find(x=>x.aliquota===10)!;
    const r22 = r.riepilogo_iva.find(x=>x.aliquota===22)!;
    expect(r10.imponibile).toBe(600); expect(r10.imposta).toBe(60);
    expect(r22.imponibile).toBe(700); expect(r22.imposta).toBe(154);
  });
});
```

- [ ] **Step 2: Verificare fail** — `npx vitest run src/lib/simulatore` → FAIL.
- [ ] **Step 3: Implementare `calcolaIva(voci, scenari)`**: se `singola`, un'unica riga a `iva_rate_singola`; se `mista`, accumula per `vat_rate`, e per `bene_significativo` con `valore_posa_associata=posa` e imponibile bene `B=imponibile_ricavo`: aggiungi `posa+min(B,posa)` al 10% e `max(0,B−posa)` al 22% (invece di B alla sua vat_rate). `imposta=round2(imponibile×aliquota/100)`, ordina per aliquota.
- [ ] **Step 4: pass** — `npx vitest run src/lib/simulatore` → PASS.
- [ ] **Step 5:** integrare `calcolaIva` in `calcolaSimulazione` (sostituisce l'IVA singola della Tappa A; `prezzo_cliente=ricavo+iva_totale`; `confronto_iva` resta per il pannello). Aggiornare i test di `calcolaSimulazione`.
- [ ] **Step 6: Commit** — `git commit -m "feat(simulatore): IVA mista 10/22 + beni significativi + test"`

---

### Task 11: Cronoprogramma fasi + `calcolaFasi` (TDD)

**Files:**
- Modify: `src/lib/simulatore/calcoli.ts` (+ `calcolaFasi`)
- Modify: `src/lib/simulatore/calcoli.test.ts`
- Create: `src/components/marketing/simulatore/SimCronoprogramma.tsx`

- [ ] **Step 1: Test `calcolaFasi(fasi, voci)`** → per fase `{ costo, manodopera_costo, inizio, durata }` + `durata_settimane` totale = `max(inizio_offset+durata)`.
- [ ] **Step 2: fail → implementare** (somma costi voci per fase, manodopera = voci `is_manodopera` della fase; durata totale = max offset+durata).
- [ ] **Step 3: pass.**
- [ ] **Step 4: `SimCronoprogramma`** — lista fasi editabili (nome, durata_settimane, inizio_offset, giorni_uomo) + barre proporzionali (come il mockup) + assegnazione `fase_id` alle voci (select fase su `SimVoceRow`). `onChange(fasi)` + raggruppamento in `SimVociGrid` per fase.
- [ ] **Step 5: Wire** in editor; `durata_settimane` alimenta `SimKpiBar`/commessa.
- [ ] **Step 6: eslint+build+vitest → ok. Commit** — `git commit -m "feat(simulatore): cronoprogramma fasi + calcolaFasi"`

---

### Task 12: `SimScenariPanel` — IVA (confronto + mista)

**Files:**
- Create: `src/components/marketing/simulatore/SimScenariPanel.tsx`

- [ ] **Step 1: Pannello IVA** — toggle `iva_mode` singola/mista; in singola un select aliquota; 3 colonne di confronto (4/10/22) con prezzo cliente da `confronto_iva` (evidenzia quella attiva); in mista, riepilogo per aliquota da `riepilogo_iva`. `onChange(scenari)`.
- [ ] **Step 2: Wire** in editor (colonna destra). Ricalcolo + autosave.
- [ ] **Step 3: eslint+build → ok. Commit** — `git commit -m "feat(simulatore): pannello scenari IVA"`

---

### Task 13: Finanziamenti (tabelle aziendali)

**Files:**
- Modify: `src/components/marketing/simulatore/SimScenariPanel.tsx` (+ blocco finanziamento)
- Modify: `src/lib/simulatore/calcolaSimulazione.ts` (rata via risultato passato)

Riuso: `useTabelleFinanziamentoAttive()` (select tabella), `useTabellaFinanziamentoRighe(tabella_id)`, `calcolaFinanziamento(righe, importo, numero_rate)` da `src/lib/finanziamenti/calcolaFinanziamento.ts`.

- [ ] **Step 1: Blocco finanziamento** in `SimScenariPanel`: select tabella + importo_finanziato (default `prezzo_cliente − anticipo`) + numero_rate (dalle durate disponibili) + anticipo → chiama `calcolaFinanziamento` → mostra rata/TAN/TAEG. Scrive `scenari.finanziamento`.
- [ ] **Step 2:** `calcolaSimulazione` accetta `rata_mensile` calcolata a monte (il componente passa il risultato di `calcolaFinanziamento` o null) → `SimKpiBar` mostra la rata; salva `rata_mensile` denormalizzato.
- [ ] **Step 3: eslint+build → ok. Commit** — `git commit -m "feat(simulatore): scenari finanziamento da tabelle aziendali"`

---

### Task 14: Trasforma in preventivo/commessa (TDD sul mapping)

**Files:**
- Create: `src/lib/simulatore/trasforma.ts`
- Create: `src/lib/simulatore/trasforma.test.ts`
- Create: `src/components/marketing/simulatore/TrasformaDialog.tsx`

- [ ] **Step 1: Test `mapVociToQuoteItems(voci)` + `mapToOrderInput(doc, risultato)`** — verifica name/quantity/unit_price/vat_rate/unit_of_measure/line_total/tariffa_id/item_category; per la commessa total_amount/vat_rate/work_start_end/financing_*.
- [ ] **Step 2: fail → implementare** mapper puri (item_category dal tipo voce: manodopera→posa else prodotto; tariffa_id solo se fonte=listino).
- [ ] **Step 3: pass.**
- [ ] **Step 4: `TrasformaDialog`** — scelta "Preventivo" o "Commessa"; preventivo: INSERT `quotes` (quote_number `Q-YYYY-NNNNN` come fa il sistema) + `quote_items` (batch); commessa: selezione/creazione cliente (riusa il flusso di `CreateOrder.tsx`) → RPC `create_order_atomic` + voci. Toast + naviga al documento creato.
- [ ] **Step 5: eslint+build+vitest → ok. Commit** — `git commit -m "feat(simulatore): trasforma in preventivo/commessa"`

---

### Task 15: Export PDF/Excel + template

**Files:**
- Create: `src/lib/simulatore/exportSimulazione.ts` (Excel via exceljs)
- Create: `src/components/marketing/simulatore/SimulazionePDF.tsx` (@react-pdf, mirror di un PDF esistente)
- Modify: editor (`SimActions`)

- [ ] **Step 1: Excel** — `exportSimulazioneXlsx(doc, risultato, nome)`: foglio Voci (per fase) + foglio Riepilogo (KPI + IVA + finanziamento). Mirror di un export exceljs esistente.
- [ ] **Step 2: PDF** — documento sintetico (KPI + voci + scenari) mirror di un PDF @react-pdf esistente; download.
- [ ] **Step 3: Template** — "Salva come template" (`is_template=true` via duplicate) + "Nuova da template" in `SimulatoreIndex`.
- [ ] **Step 4: eslint+build → ok. Commit** — `git commit -m "feat(simulatore): export PDF/Excel + template"`

### Verifica Tappa B
- [ ] eslint (0 nuovi) + `npx vite build` (exit 0) + `npx vitest run src/lib/simulatore` (pass). Commit `chore(simulatore): verifica Tappa B`.

---

## Self-review note
- Copertura spec: posizionamento (T5), modello dati (T1), motore margine (T3)/IVA mista+beni signif. (T10)/fasi (T11)/finanziamento (T13)/confronto IVA (T7,T12), UI lista (T6)/editor+KPI (T7)/griglia (T8)/listino+prezzari (T9)/cronoprogramma (T11)/scenari (T12,T13), trasforma (T14), export+template (T15). ✓
- Tipi coerenti: `VoceSim`/`FaseSim`/`ScenariConfig`/`SimulazioneRisultato` definiti in T2, usati invariati ovunque. ✓
- Vincolo locale: nessun push/deploy/apply_migration nel piano (migrazione resta file). ✓
