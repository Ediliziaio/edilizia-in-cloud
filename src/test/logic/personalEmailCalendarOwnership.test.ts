import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Personal email and calendar ownership", () => {
  const emailConnectionsCard = readFileSync(
    resolve(process.cwd(), "src/components/integrations/EmailOAuthConnectionsCard.tsx"),
    "utf8",
  );
  const emailClientPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/email/EmailClientPage.tsx"),
    "utf8",
  );
  const emailLayout = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/email/EmailLayout.tsx"),
    "utf8",
  );
  const googleCalendarTab = readFileSync(
    resolve(process.cwd(), "src/components/settings/GoogleCalendarConnectionTab.tsx"),
    "utf8",
  );
  const appleCalendarTab = readFileSync(
    resolve(process.cwd(), "src/components/settings/AppleCalendarConnectionTab.tsx"),
    "utf8",
  );
  const emailOAuthStartFunction = readFileSync(
    resolve(process.cwd(), "supabase/functions/email-oauth-start/index.ts"),
    "utf8",
  );
  const googleCalendarFunction = readFileSync(
    resolve(process.cwd(), "supabase/functions/google-calendar-auth/index.ts"),
    "utf8",
  );
  const appleCalendarFunction = readFileSync(
    resolve(process.cwd(), "supabase/functions/apple-calendar-auth/index.ts"),
    "utf8",
  );
  const ownershipMigrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20270525133000_personal_email_calendar_connection_ownership.sql",
  );
  const personalOwnershipMigration = existsSync(ownershipMigrationPath)
    ? readFileSync(ownershipMigrationPath, "utf8")
    : "";

  it("does not expose a company-wide email connection mode in the UI", () => {
    expect(emailConnectionsCard).not.toContain('scope?: "company" | "user"');
    expect(emailConnectionsCard).not.toContain('scope = "company"');
    expect(emailConnectionsCard).toContain('.eq("company_id", effectiveCompany!.id)');
    expect(emailConnectionsCard).toContain('.eq("user_id", userId)');
    expect(emailConnectionsCard).toContain("visibili solo a te");
  });

  it("loads the email client only from the current user's connections", () => {
    expect(emailClientPage).toContain('.eq("company_id", companyId!)');
    expect(emailClientPage).toContain('.eq("user_id", userId!)');
    expect(emailLayout).toContain('.eq("company_id", companyId!)');
    expect(emailLayout).toContain('.eq("user_id", userId!)');
    expect(emailLayout).toContain("filter: `user_id=eq.${userId}`");
  });

  it("keeps Google and Apple calendars scoped to the current user in settings", () => {
    expect(googleCalendarTab).toContain('.eq("company_id", companyId)');
    expect(googleCalendarTab).toContain('.eq("user_id", userId)');
    expect(googleCalendarTab).toContain('queryKey: ["google-calendar-connection", companyId, userId]');
    expect(appleCalendarTab).toContain('.eq("company_id", companyId)');
    expect(appleCalendarTab).toContain('.eq("user_id", userId)');
    expect(appleCalendarTab).toContain('queryKey: ["apple-calendar-connection", companyId, userId]');
  });

  it("uses the active company context when starting email/calendar OAuth", () => {
    expect(emailConnectionsCard).toContain("company_id: effectiveCompany.id");
    expect(emailOAuthStartFunction).toContain("canAccessCompany");
    expect(emailOAuthStartFunction).toContain("company_id?: string");
    expect(emailOAuthStartFunction).toContain("body.company_id");
    expect(googleCalendarFunction).toContain("canAccessCompany");
    expect(appleCalendarFunction).toContain("canAccessCompany");
  });

  it("allows the same email address to be connected separately by multiple users", () => {
    expect(personalOwnershipMigration).toContain("DROP INDEX IF EXISTS public.idx_email_oauth_unique");
    expect(personalOwnershipMigration).toContain("idx_email_oauth_unique_personal");
    expect(personalOwnershipMigration).toContain("ON public.email_oauth_connections (company_id, user_id, provider, lower(email_address))");
    expect(personalOwnershipMigration).toContain("ON CONFLICT (company_id, user_id, provider, lower(email_address))");
    expect(personalOwnershipMigration).not.toContain("ON CONFLICT (company_id, provider, lower(email_address))");
  });

  it("hardens connection RLS so company admins cannot browse personal mailboxes", () => {
    expect(personalOwnershipMigration).toContain("email_oauth_meta_read_personal");
    expect(personalOwnershipMigration).toContain("USING (user_id = auth.uid())");
    expect(personalOwnershipMigration).toContain("CREATE OR REPLACE VIEW public.v_email_oauth_connections_meta");
    expect(personalOwnershipMigration).toContain("WHERE user_id = auth.uid()");
    expect(personalOwnershipMigration).toContain("google_calendar_connections");
    expect(personalOwnershipMigration).toContain("apple_calendar_connections");
    expect(personalOwnershipMigration).not.toMatch(/has_role\([^)]*company_admin/);
    expect(personalOwnershipMigration).not.toMatch(/role\s+IN\s+\([^)]*company_admin/);
  });
});
