import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20270524090000_internal_chat_membership_security_and_sidebar_rpc.sql";

describe("internal chat security contract", () => {
  it("scopes channel and message RLS to channel membership", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("internal_chat_membership_allowed");
    expect(sql).toContain('DROP POLICY IF EXISTS "icc_sel"');
    expect(sql).toContain('DROP POLICY IF EXISTS "icmsg_sel"');
    expect(sql).toMatch(/EXISTS\s*\(\s*SELECT 1\s+FROM public\.internal_chat_members/i);
  });

  it("prevents users from self-joining private channels through member inserts", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const insertPolicy = sql.match(/CREATE POLICY "icm_ins"[\s\S]*?;/)?.[0] ?? "";

    expect(insertPolicy).toContain("internal_chat_can_manage_members");
    expect(insertPolicy).not.toContain("user_id = auth.uid()");
  });

  it("adds a sidebar RPC that aggregates latest message and unread count in one call", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("get_internal_chat_sidebar_state");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("unread_count");
  });
});
