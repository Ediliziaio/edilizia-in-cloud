import { describe, expect, it } from "vitest";
import { DOMANDE } from "@/features/talent-profile/data/questionario";
import { buildTalentReportDecision, buildTalentReportPayload, buildTalentReportPrintHtml, type TalentReportCandidate } from "@/features/talent-profile/lib/reporting";

describe("Talent Profile report decision", () => {
  const candidate: TalentReportCandidate = {
    id: "candidate-1",
    ruolo_richiesto: "Commerciale Cantieri",
  };

  it("genera payload report e decisione operativa per HR", () => {
    const answers = Object.fromEntries(
      DOMANDE.map((domanda) => [domanda.id, domanda.polarita === "-" ? "C" : "A"]),
    );

    const payload = buildTalentReportPayload({
      companyId: "company-1",
      candidate,
      answers,
      generatedAt: "2026-05-25T08:00:00.000Z",
    });

    expect(payload.assessment_version).toBe("v5");
    expect(payload.candidate_id).toBe(candidate.id);
    expect(payload.role_requested).toBe("Commerciale Cantieri");
    expect(payload.all_roles.length).toBeGreaterThanOrEqual(30);
    expect(payload.role_match).toEqual(expect.objectContaining({
      ruolo: "Commerciale Cantieri",
      compatibilitaPct: expect.any(Number),
      verdict: expect.any(String),
    }));

    const decision = buildTalentReportDecision(payload);
    expect(["ASSUMI", "VALUTA", "NON_CONSIGLIATO"]).toContain(decision.recommendation);
    expect(decision.executiveSummary.length).toBeGreaterThan(20);
    expect(decision.interviewQuestions.length).toBeGreaterThanOrEqual(5);
    expect(decision.onboardingPlan.map((step) => step.phase)).toEqual(["30 giorni", "60 giorni", "90 giorni"]);
    expect(decision.nextActions.length).toBeGreaterThanOrEqual(3);
    expect(decision.nextActions[0]).toEqual(expect.objectContaining({
      title: expect.any(String),
      detail: expect.any(String),
      priority: expect.any(String),
    }));
  });

  it("blocca la raccomandazione quando attendibilita o verdetto sono critici", () => {
    const decision = buildTalentReportDecision({
      company_id: "company-1",
      candidate_id: "candidate-1",
      assessment_version: "v5",
      reliability_index: "NO",
      control_unexpected_count: 3,
      profile_type: "CRITICAL",
      traits_v5: {},
      macro_areas: {},
      role_requested: "Capocantiere",
      role_match: { ruolo: "Capocantiere", compatibilitaPct: 82, verdict: "IDONEO", motivazione: "Fit tecnico buono" },
      all_roles: [],
      syndromes_detected: [],
      strengths: [],
      improvements: [],
      valleys: [],
      generated_at: "2026-05-25T08:00:00.000Z",
    });

    expect(decision.recommendation).toBe("NON_CONSIGLIATO");
    expect(decision.risks.join(" ")).toContain("Attendibilita");
  });

  it("genera un HTML PDF A4 completo e sicuro per la stampa", () => {
    const answers = Object.fromEntries(
      DOMANDE.map((domanda) => [domanda.id, domanda.polarita === "-" ? "C" : "A"]),
    );
    const payload = buildTalentReportPayload({
      companyId: "company-1",
      candidate,
      answers,
      generatedAt: "2026-05-25T08:00:00.000Z",
    });

    const html = buildTalentReportPrintHtml({
      companyName: "Demo Azienda S.r.l.",
      candidateName: "Marco Bianchi <script>alert(1)</script>",
      report: payload,
    });

    expect(html).toContain("@page");
    expect(html).toContain("Report Talent Profile");
    expect(html).toContain("Decisione HR");
    expect(html).toContain("Domande colloquio");
    expect(html).toContain("Confronto ruoli");
    expect(html).toContain("Macro aree");
    expect(html).toContain("Prossime azioni HR");
    expect(html).toContain("Piano 30/60/90");
    expect(html).toContain("Demo Azienda S.r.l.");
    expect(html).toContain("Marco Bianchi &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
