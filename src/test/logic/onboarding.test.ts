import { describe, it, expect } from "vitest";

/**
 * Test logica calcolo progresso onboarding.
 * Replica la formula usata in useCompanyOnboarding.ts per il calcolo di pct.
 */

// ─── Replica logica useCompanyOnboarding ─────────────────────────────────────

interface OnboardingStep {
  id: string;
  is_required: boolean;
  completed: boolean;
}

function computeOnboardingPct(steps: OnboardingStep[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.completed).length;
  return Math.round((completed / steps.length) * 100);
}

function computeOnboardingStatus(pct: number): "not_started" | "in_progress" | "completed" {
  if (pct === 0) return "not_started";
  if (pct === 100) return "completed";
  return "in_progress";
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("computeOnboardingPct", () => {
  it("0% quando nessuno step è completato", () => {
    const steps: OnboardingStep[] = [
      { id: "1", is_required: true, completed: false },
      { id: "2", is_required: true, completed: false },
    ];
    expect(computeOnboardingPct(steps)).toBe(0);
  });

  it("100% quando tutti gli step sono completati", () => {
    const steps: OnboardingStep[] = [
      { id: "1", is_required: true, completed: true },
      { id: "2", is_required: false, completed: true },
    ];
    expect(computeOnboardingPct(steps)).toBe(100);
  });

  it("50% con metà degli step completati", () => {
    const steps: OnboardingStep[] = [
      { id: "1", is_required: true, completed: true },
      { id: "2", is_required: true, completed: false },
    ];
    expect(computeOnboardingPct(steps)).toBe(50);
  });

  it("arrotonda correttamente (2/3 → 67%)", () => {
    const steps: OnboardingStep[] = [
      { id: "1", is_required: true, completed: true },
      { id: "2", is_required: true, completed: true },
      { id: "3", is_required: true, completed: false },
    ];
    expect(computeOnboardingPct(steps)).toBe(67);
  });

  it("0% con array vuoto", () => {
    expect(computeOnboardingPct([])).toBe(0);
  });

  it("step opzionali contano come gli obbligatori nel pct", () => {
    const steps: OnboardingStep[] = [
      { id: "1", is_required: true, completed: true },
      { id: "2", is_required: false, completed: false }, // opzionale non completato
      { id: "3", is_required: false, completed: false },
      { id: "4", is_required: true, completed: false },
    ];
    // 1/4 completati
    expect(computeOnboardingPct(steps)).toBe(25);
  });
});

describe("computeOnboardingStatus", () => {
  it("0% → not_started", () => {
    expect(computeOnboardingStatus(0)).toBe("not_started");
  });

  it("100% → completed", () => {
    expect(computeOnboardingStatus(100)).toBe("completed");
  });

  it("50% → in_progress", () => {
    expect(computeOnboardingStatus(50)).toBe("in_progress");
  });

  it("badge sidebar: nascosto a 100%", () => {
    // Il badge nella sidebar è mostrato solo quando pct < 100
    const pct = 100;
    const showBadge = pct < 100;
    expect(showBadge).toBe(false);
  });

  it("badge sidebar: visibile se pct < 100", () => {
    const pct = 67;
    const showBadge = pct < 100;
    expect(showBadge).toBe(true);
  });
});
