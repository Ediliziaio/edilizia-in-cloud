import { beforeEach, describe, it, expect, vi } from "vitest";
import { resolveSavedSurveyReport } from "@/lib/surveys/savedReport";
const mock = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: mock.from } },
}));
const survey = (pdf_report_url: string | null) => ({
  id: "s1",
  company_id: "c1",
  pdf_report_url,
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockReturnValue({ createSignedUrl: mock.sign });
  mock.sign.mockResolvedValue({
    data: { signedUrl: "https://example.invalid/renewed" },
    error: null,
  });
});
describe("Documento originale sopralluogo", () => {
  it("rinnova la lettura del documento corretto senza risalvarlo", async () => {
    expect(
      await resolveSavedSurveyReport(
        survey(
          "https://example.invalid/storage/v1/object/sign/surveys/c1/s1/report.html?token=expired",
        ),
      ),
    ).toContain("renewed");
    expect(mock.from).toHaveBeenCalledWith("surveys");
    expect(mock.sign).toHaveBeenCalledWith("c1/s1/report.html", 3600);
  });
  it.each([
    "https://example.invalid/storage/v1/object/public/surveys/other/s1/report.pdf",
    "https://example.invalid/storage/v1/object/sign/surveys/c1/other/report.pdf",
    "https://example.invalid/storage/v1/object/public/other/c1/s1/report.pdf",
    "https://example.invalid/storage/v1/object/sign/surveys/c1/s1/../other.pdf",
    "https://example.invalid/storage/v1/object/sign/surveys/c1/s1/%2e%2e/other.pdf",
    "javascript:alert(1)",
    null,
  ])("rifiuta documenti estranei o non sicuri: %s", async (url) => {
    await expect(resolveSavedSurveyReport(survey(url))).rejects.toThrow();
    expect(mock.sign).not.toHaveBeenCalled();
  });
  it("non presenta una firma fallita come un originale disponibile", async () => {
    mock.sign.mockResolvedValue({ data: null, error: new Error("negato") });
    await expect(
      resolveSavedSurveyReport(
        survey(
          "https://example.invalid/storage/v1/object/sign/surveys/c1/s1/report.pdf",
        ),
      ),
    ).rejects.toThrow("Riprova");
  });
});
