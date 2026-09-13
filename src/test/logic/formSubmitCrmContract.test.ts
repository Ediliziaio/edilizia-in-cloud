import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("form-submit CRM contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "supabase/functions/form-submit/index.ts"),
    "utf8",
  );

  it("creates form opportunities in the marketing CRM tables used by attribution KPIs", () => {
    expect(source).toContain('.from("marketing_opportunities")');
    expect(source).toContain('.from("marketing_pipeline_stages")');
    expect(source).not.toContain('.from("opportunities")');
    expect(source).not.toContain('.from("pipeline_stages")');
  });

  it("assigns the call center configured on the form, not only the salesperson", () => {
    // BeMade: i lead del Restauro dal sito devono arrivare a chi li richiama,
    // come quelli da Facebook. Prima il form scriveva solo assigned_to.
    expect(source).toContain("const callCenterId = cleanText(settings.callCenterId)");
    expect(source).toContain("call_center_id: callCenterId || null");
    expect(source).toContain("insertPayload.call_center_id = callCenterId");
    expect(source).toContain("contactUpdate.call_center_id = callCenterId");
  });

  it("can create CRM contacts from phone-only form leads", () => {
    expect(source).toContain("const validEmail = email?.includes(\"@\") ? email : null");
    expect(source).toContain("if (validEmail || phone)");
    expect(source).not.toContain("if (mappedEmail && typeof mappedEmail");
  });
});
