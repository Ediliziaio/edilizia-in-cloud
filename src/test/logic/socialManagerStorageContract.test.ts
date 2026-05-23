import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const socialManagerSource = () =>
  readFileSync(resolve(process.cwd(), "src/pages/azienda/marketing/SocialManagerBeta.tsx"), "utf8");

describe("social manager storage contract", () => {
  it("uses the authenticated company and the social storage hook instead of hard-coded local state", () => {
    const source = socialManagerSource();

    expect(source).toContain("useAuthCompany");
    expect(source).toContain("useSocialManagerData(companyId)");
    expect(source).toContain("effectiveCompany?.id ?? DEMO_COMPANY_ID");
    expect(source).not.toContain("const companyId = DEMO_COMPANY_ID;");
    expect(source).not.toContain("const STORAGE_KEY = `eic_social_connections_${companyId}`;");
  });

  it("wires gallery media directly into the composer", () => {
    const source = socialManagerSource();

    expect(source).toContain("selectedMediaForComposer");
    expect(source).toContain("onSelectedMediaConsumed");
    expect(source).toContain("selectedLibraryMedia");
    expect(source).toContain("mediaItems={mediaItems}");
    expect(source).toContain("onMediaStored");
    expect(source).toContain("addMedia");
    expect(source).toContain("createStoredMediaItem");
    expect(source).not.toContain("Caricalo nella sezione Media del post.");
  });

  it("adds a minimal social backend schema with tenant RLS", () => {
    const migrationDir = resolve(process.cwd(), "supabase/migrations");
    const socialMigration = readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(resolve(migrationDir, name), "utf8"))
      .find((content) => content.includes("CREATE TABLE IF NOT EXISTS public.social_posts"));

    expect(socialMigration).toBeTruthy();
    expect(socialMigration).toContain("CREATE TABLE IF NOT EXISTS public.social_accounts");
    expect(socialMigration).toContain("CREATE TABLE IF NOT EXISTS public.social_media_items");
    expect(socialMigration).toContain("CREATE TABLE IF NOT EXISTS public.social_inbox_items");
    expect(socialMigration).toContain("CREATE TABLE IF NOT EXISTS public.social_publish_jobs");
    expect(socialMigration).toContain("CREATE TABLE IF NOT EXISTS public.social_account_tokens");
    expect(socialMigration).toContain("ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY");
    expect(socialMigration).toContain("ALTER TABLE public.social_account_tokens ENABLE ROW LEVEL SECURITY");
    expect(socialMigration).toContain("CREATE POLICY social_posts_company_access");

    const accountsDefinition = socialMigration.slice(
      socialMigration.indexOf("CREATE TABLE IF NOT EXISTS public.social_accounts"),
      socialMigration.indexOf("CREATE TABLE IF NOT EXISTS public.social_account_tokens"),
    );
    const tokenDefinition = socialMigration.slice(
      socialMigration.indexOf("CREATE TABLE IF NOT EXISTS public.social_account_tokens"),
      socialMigration.indexOf("CREATE TABLE IF NOT EXISTS public.social_media_items"),
    );

    expect(accountsDefinition).not.toContain("access_token_encrypted");
    expect(accountsDefinition).not.toContain("refresh_token_encrypted");
    expect(tokenDefinition).toContain("access_token_encrypted");
    expect(tokenDefinition).toContain("refresh_token_encrypted");
    expect(socialMigration).not.toContain("social_account_tokens_company_access");
    expect(socialMigration).not.toContain("ON public.social_account_tokens\n  FOR ALL TO authenticated");
    expect(socialMigration).toContain("CREATE POLICY social_publish_jobs_service_role");
    expect(socialMigration).not.toContain("CREATE POLICY social_publish_jobs_company_access");
  });

  it("does not mix demo gallery media into a real company library", () => {
    const source = socialManagerSource();

    expect(source).toContain("storedMediaItems.length > 0 ? storedMediaItems : DEMO_MEDIA_ITEMS");
    expect(source).not.toContain("mergeSocialMediaItems(storedMediaItems, DEMO_MEDIA_ITEMS)");
  });
});
