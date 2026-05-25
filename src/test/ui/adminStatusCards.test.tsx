import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ShieldCheck, Users, AlertCircle, TrendingUp } from "lucide-react";
import { AdminStatusCards } from "@/components/admin/AdminStatusCards";

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

describe("AdminStatusCards", () => {
  it("renders all cards with label, value and caption", () => {
    const { container, cleanup } = render(
      <AdminStatusCards
        cards={[
          { label: "Paganti", value: "42", caption: "MRR reale", icon: ShieldCheck, tone: "emerald" },
          { label: "Totale aziende", value: "120", caption: "registrate", icon: Users, tone: "blue" },
          { label: "Non paganti", value: "18", caption: "accesso attivo, no MRR", icon: AlertCircle, tone: "amber" },
          { label: "MRR escluso", value: "3.000 €", caption: "teorico", icon: TrendingUp, tone: "orange" },
        ]}
      />,
    );

    expect(container.textContent).toContain("Paganti");
    expect(container.textContent).toContain("42");
    expect(container.textContent).toContain("MRR reale");
    expect(container.textContent).toContain("Totale aziende");
    expect(container.textContent).toContain("MRR escluso");
    cleanup();
  });

  it("renders cards as <div> when no onClick is provided (not interactive)", () => {
    const { container, cleanup } = render(
      <AdminStatusCards
        cards={[{ label: "Paganti", value: "42", icon: ShieldCheck, tone: "emerald" }]}
      />,
    );
    expect(container.querySelector("button")).toBeNull();
    cleanup();
  });

  it("renders cards as <button> and fires onClick when interactive", () => {
    const onClick = vi.fn();
    const { container, cleanup } = render(
      <AdminStatusCards
        cards={[
          {
            label: "Paganti",
            value: "42",
            icon: ShieldCheck,
            tone: "emerald",
            onClick,
          },
        ]}
      />,
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("highlights active cards with extra ring class", () => {
    const { container, cleanup } = render(
      <AdminStatusCards
        cards={[
          {
            label: "Paganti",
            value: "42",
            icon: ShieldCheck,
            tone: "emerald",
            onClick: () => {},
            active: true,
          },
        ]}
      />,
    );
    const button = container.querySelector("button");
    expect(button?.className).toMatch(/ring-orange-200/);
    cleanup();
  });
});
