import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PUBLIC_MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/20270525153000_hr_talent_public_invites.sql");
const APP_PATH = resolve(process.cwd(), "src/App.tsx");
const PUBLIC_PAGE_PATH = resolve(process.cwd(), "src/pages/public/TalentProfilePublic.tsx");
const HR_TAB_PATH = resolve(process.cwd(), "src/pages/azienda/personale/tabs/TabSelezioni.tsx");

describe("Talent Profile public candidate flow", () => {
  it("espone RPC sicure per emettere link, leggere sessione pubblica e salvare risposte", () => {
    expect(existsSync(PUBLIC_MIGRATION_PATH)).toBe(true);
    const migration = readFileSync(PUBLIC_MIGRATION_PATH, "utf8");

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.hr_talent_issue_public_link");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.hr_talent_public_session");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.hr_talent_public_save_answers");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("digest(p_token, 'sha256')");
    expect(migration).toContain("privacy_accepted_at");
    expect(migration).toContain("status = 'completed'");
  });

  it("aggiunge route pubblica /talent-profile/:token e pagina candidato senza login", () => {
    expect(existsSync(PUBLIC_PAGE_PATH)).toBe(true);

    const appSource = readFileSync(APP_PATH, "utf8");
    const publicPageSource = readFileSync(PUBLIC_PAGE_PATH, "utf8");

    expect(appSource).toContain('lazy(() => import("@/pages/public/TalentProfilePublic"))');
    expect(appSource).toContain('path="/talent-profile/:token"');
    expect(publicPageSource).toContain('hr_talent_public_session');
    expect(publicPageSource).toContain('hr_talent_public_save_answers');
    expect(publicPageSource).toContain("privacyAccepted");
    expect(publicPageSource).toContain("Avanti");
    expect(publicPageSource).toContain("Completa test");
    expect(publicPageSource).toContain("missingAnswersCount");
    expect(publicPageSource).not.toContain("{question.trait_code}");
  });

  it("collega la tab Selezioni alla generazione e copia del link pubblico", () => {
    const tabSource = readFileSync(HR_TAB_PATH, "utf8");

    expect(tabSource).toContain("hr_talent_issue_public_link");
    expect(tabSource).toContain("Genera link");
    expect(tabSource).toContain("Copia link");
    expect(tabSource).toContain("/talent-profile/");
  });

  it("salva in silenzioso prima di cambiare blocco nel questionario pubblico", () => {
    const publicPageSource = readFileSync(PUBLIC_PAGE_PATH, "utf8");

    expect(publicPageSource).toContain("const goNextPage = async ()");
    expect(publicPageSource).toContain("await persistAnswers({ silent: true })");
    expect(publicPageSource).toContain("const goPrevPage = async ()");
    expect(publicPageSource).toContain("setPageIndex((p) => Math.min(totalPages - 1, p + 1))");
  });
});
