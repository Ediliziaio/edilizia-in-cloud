import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/20270525150000_hr_talent_profile.sql");

describe("Talent Profile database contract", () => {
  const readMigration = () => readFileSync(MIGRATION_PATH, "utf8");

  it("crea tabelle native Edilizia in Cloud per selezioni, domande, risposte e report", () => {
    const migration = readMigration();

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.hr_talent_questions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.hr_talent_candidates");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.hr_talent_answers");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.hr_talent_reports");
    expect(migration).toContain("hr_profilo_id UUID REFERENCES public.hr_profili(id) ON DELETE SET NULL");
    expect(migration).not.toContain("azienda_id");
  });

  it("semina tutte le 242 domande V5 nel database", () => {
    const migration = readMigration();
    const questionRows = migration.match(/\('v5',\s*\d+,/g) ?? [];

    expect(questionRows).toHaveLength(242);
    expect(migration).toContain("ON CONFLICT (assessment_version, question_id) DO UPDATE");
  });

  it("isola candidati, risposte e report per company_id con RLS", () => {
    const migration = readMigration();

    expect(migration).toContain("public.hr_talent_company_allowed(company_id)");
    expect(migration).toContain("ALTER TABLE public.hr_talent_candidates ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.hr_talent_answers ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.hr_talent_reports ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("company_id = public.get_my_company_id()");
    expect(migration).toContain("public.is_super_admin(auth.uid())");
  });
});
