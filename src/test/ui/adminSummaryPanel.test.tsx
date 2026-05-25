import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DollarSign, TrendingUp, ShieldCheck, Euro, Wallet } from "lucide-react";
import { AdminSummaryPanel } from "@/components/admin/AdminSummaryPanel";

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const baseKpis = [
  { label: "MRR pagante", value: "12.345 €", icon: DollarSign, tone: "emerald" as const },
  { label: "ARR proiettato", value: "148.140 €", icon: TrendingUp, tone: "blue" as const },
  { label: "Aziende paganti", value: 42, icon: ShieldCheck, tone: "orange" as const },
  { label: "ARPU", value: "294 €", icon: Euro, tone: "orange" as const },
];

describe("AdminSummaryPanel", () => {
  it("renders eyebrow, title and all KPIs on the dark blue panel", () => {
    const { container, cleanup } = render(
      <AdminSummaryPanel
        icon={Wallet}
        eyebrow="Riepilogo fatturato"
        title="Vista economica piattaforma"
        kpis={baseKpis}
      />,
    );

    expect(container.textContent).toContain("Riepilogo fatturato");
    expect(container.querySelector("h2")?.textContent).toBe("Vista economica piattaforma");
    expect(container.textContent).toContain("MRR pagante");
    expect(container.textContent).toContain("12.345 €");
    expect(container.textContent).toContain("ARPU");
    cleanup();
  });

  it("does not render the right-side chart card when no chart props are passed", () => {
    const { container, cleanup } = render(
      <AdminSummaryPanel
        icon={Wallet}
        eyebrow="Riepilogo"
        title="Solo KPI"
        kpis={baseKpis}
      />,
    );
    // No <aside> right column
    expect(container.querySelector("aside")).toBeNull();
    cleanup();
  });

  it("renders chart header + quick stats + chart slot when right-side props provided", () => {
    const { container, cleanup } = render(
      <AdminSummaryPanel
        icon={Wallet}
        eyebrow="Riepilogo"
        title="Con chart"
        kpis={baseKpis}
        chartEyebrow="Andamento 12 mesi"
        chartTitle="MRR Stripe + interno"
        chartLegend={[
          { label: "MRR Stripe", color: "blue" },
          { label: "MRR Interno", color: "orange" },
        ]}
        chartQuickStats={[
          { label: "MRR Corrente", value: "12k €", tone: "blue" },
          { label: "ARR", value: "148k €", tone: "orange" },
          { label: "Paganti", value: "42", tone: "neutral" },
        ]}
      >
        <div data-testid="chart-slot">CHART PLACEHOLDER</div>
      </AdminSummaryPanel>,
    );

    expect(container.querySelector("aside")).not.toBeNull();
    expect(container.textContent).toContain("Andamento 12 mesi");
    expect(container.querySelector("h3")?.textContent).toBe("MRR Stripe + interno");
    expect(container.textContent).toContain("MRR Stripe");
    expect(container.textContent).toContain("MRR Corrente");
    expect(container.querySelector('[data-testid="chart-slot"]')?.textContent).toBe(
      "CHART PLACEHOLDER",
    );
    cleanup();
  });

  it("renders KPI captions when provided", () => {
    const { container, cleanup } = render(
      <AdminSummaryPanel
        icon={Wallet}
        eyebrow="Riepilogo"
        title="KPI con caption"
        kpis={[
          {
            label: "MRR",
            value: "10 €",
            icon: DollarSign,
            tone: "emerald",
            caption: "ricavo mensile reale",
          },
        ]}
      />,
    );
    expect(container.textContent).toContain("ricavo mensile reale");
    cleanup();
  });
});
