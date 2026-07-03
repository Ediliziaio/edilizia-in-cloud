import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const r = (p: string) => resolve(process.cwd(), p);

const MIGRATION_TABLES = r("supabase/migrations/20270703120000_hr_ruolo_task_kpi.sql");
const MIGRATION_RPC = r("supabase/migrations/20270703120100_hr_persona_kpi_auto.sql");
const SHEET = r("src/components/hr/HrProfiloSheet.tsx");
const TAB = r("src/components/hr/HrRuoloObiettiviTab.tsx");
const MANSIONE_BLOCK = r("src/components/hr/HrMansioneBlock.tsx");
const TASK_BLOCK = r("src/components/hr/HrTaskBlock.tsx");
const KPI_BLOCK = r("src/components/hr/HrKpiBlock.tsx");
const CATALOG_DIALOG = r("src/components/hr/HrMansioniCatalogDialog.tsx");

describe("HR Ruolo/Task/KPI — migration schema", () => {
  it("crea le 4 tabelle + colonne su hr_profili + RLS", () => {
    expect(existsSync(MIGRATION_TABLES)).toBe(true);
    const sql = readFileSync(MIGRATION_TABLES, "utf8");

    for (const table of ["hr_mansioni", "hr_task", "hr_kpi", "hr_kpi_valori"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(sql).toContain("ALTER TABLE public.hr_profili");
    expect(sql).toContain("mansione_id uuid");
    expect(sql).toContain("responsabilita jsonb");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("definisce la RPC hr_persona_kpi_auto con le 4 chiavi", () => {
    expect(existsSync(MIGRATION_RPC)).toBe(true);
    const sql = readFileSync(MIGRATION_RPC, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.hr_persona_kpi_auto");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("presenza_pct");
    expect(sql).toContain("ore_mese");
    expect(sql).toContain("task_completati");
    expect(sql).toContain("task_totali");
  });
});

describe("HR Ruolo/Task/KPI — UI wiring", () => {
  it("HrProfiloSheet monta il tab Ruolo (obiettivi)", () => {
    const src = readFileSync(SHEET, "utf8");
    expect(src).toContain('value="ruolo"');
    expect(src).toContain("HrRuoloObiettiviTab");
    // La tab è etichettata "Ruolo" (icona Target) dopo il polish del header/tab.
    expect(src).toContain('label: "Ruolo"');
  });

  it("esistono i 3 blocchi + il tab contenitore + il dialog catalogo", () => {
    for (const f of [TAB, MANSIONE_BLOCK, TASK_BLOCK, KPI_BLOCK, CATALOG_DIALOG]) {
      expect(existsSync(f)).toBe(true);
    }
    const tab = readFileSync(TAB, "utf8");
    expect(tab).toContain("HrMansioneBlock");
    expect(tab).toContain("HrTaskBlock");
    expect(tab).toContain("HrKpiBlock");
  });

  it("HrMansioneBlock applica i KPI del ruolo e sincronizza mansione_id", () => {
    const src = readFileSync(MANSIONE_BLOCK, "utf8");
    expect(src).toContain("Applica KPI del ruolo");
    expect(src).toContain("mansione_id");
    expect(src).toContain("HrMansioniCatalogDialog");
  });

  it("HrKpiBlock chiama la RPC auto e scrive i valori manuali", () => {
    const src = readFileSync(KPI_BLOCK, "utf8");
    expect(src).toContain("useHrKpiAuto");
    expect(src).toContain("setValore");
  });
});
